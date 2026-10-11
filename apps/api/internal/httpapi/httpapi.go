// Package httpapi assembles the API HTTP routes. All paths start with /api:
// nginx forwards requests under this prefix to Go; the rest is frontend static files.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
	"github.com/bysavelii/cyberzavod/apps/api/internal/session"
)

const (
	// HealthPath is the process liveness path; the healthcheck subcommand also calls it.
	HealthPath = "/api/health"
	readyPath  = "/api/ready"

	databasePingTimeout = 2 * time.Second
)

// Pinger is everything needed from the database for the readiness check.
type Pinger interface {
	Ping(ctx context.Context) error
}

// TokenVerifier finds the author by a GitHub token. A token GitHub did not accept gives
// gallery.ErrTokenRejected.
type TokenVerifier interface {
	Verify(ctx context.Context, token string) (gallery.User, error)
}

// Galleries is the gallery store: authors and their recordings.
// What does not exist or is private to outsiders gives gallery.ErrNotFound.
type Galleries interface {
	SaveUser(ctx context.Context, user gallery.User) error
	Account(ctx context.Context, ownerID int64) (gallery.Account, error)
	SaveRecording(ctx context.Context, ownerID int64, recording gallery.Recording) (summary gallery.Summary, isNew bool, err error)
	DeleteRecording(ctx context.Context, ownerID int64, recordID string) error
	SetGalleryPublic(ctx context.Context, ownerID int64, isPublic bool) error
	PublicGallery(ctx context.Context, login string) (gallery.Gallery, error)
	SharedRecording(ctx context.Context, slug string) (gallery.SharedRecording, error)
	DeleteSharedRecording(ctx context.Context, slug string) error
	SetUserBlocked(ctx context.Context, login string, isBlocked bool) error
}

// Sessions is the store of site sign-in sessions. A session is looked up by the sha256 of its id;
// a missing or expired session gives session.ErrNotFound.
type Sessions interface {
	CreateSession(ctx context.Context, created session.Session) error
	SessionUser(ctx context.Context, tokenHash []byte) (gallery.User, error)
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

// OAuthApp is the GitHub OAuth app for sign-in on the site.
type OAuthApp interface {
	AuthorizeURL(state, redirectURI string) string
	ExchangeCode(ctx context.Context, code, redirectURI string) (token string, err error)
}

// Deps are the dependencies of the API handlers.
type Deps struct {
	DB        Pinger
	Galleries Galleries
	Sessions  Sessions
	Tokens    TokenVerifier
	// GitHubClientID is the OAuth app client_id for sign-in from the CLI; empty: sign-in is off.
	GitHubClientID string
	// OAuth is the app for sign-in on the site; nil means sign-in on the site is unavailable.
	OAuth OAuthApp
	// PublicURL is the site address without a trailing "/": the origin for checking cookie requests
	// and the base of the GitHub return address.
	PublicURL string
	// AdminIDs are the GitHub ids of the site owners. Empty means nobody may use the admin routes.
	AdminIDs []int64
	// Now is the clock for session expiry and change-rate windows; nil means time.Now.
	// Tests replace it.
	Now    func() time.Time
	Logger *slog.Logger
}

// api holds the route handlers on top of the shared dependencies.
type api struct {
	deps    Deps
	now     func() time.Time
	changes *changeLimiter
}

// NewHandler assembles the API routes.
func NewHandler(deps Deps) http.Handler {
	now := deps.Now
	if now == nil {
		now = time.Now
	}

	routes := &api{
		deps:    deps,
		now:     now,
		changes: newChangeLimiter(galleryChangeLimit, galleryChangeWindow, now),
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET "+HealthPath, health)
	mux.HandleFunc("GET "+readyPath, routes.ready)

	mux.HandleFunc("GET /api/auth/github", routes.githubAuth)
	mux.HandleFunc("GET "+loginPath, routes.githubLogin)
	mux.HandleFunc("GET "+callbackPath, routes.githubCallback)
	mux.HandleFunc("POST /api/auth/logout", routes.logout)
	mux.HandleFunc("GET /api/me", routes.authorized(routes.me))
	mux.HandleFunc("PUT /api/me/recordings/{id}", routes.authorized(routes.limitedChanges(routes.putRecording)))
	mux.HandleFunc("DELETE /api/me/recordings/{id}", routes.authorized(routes.limitedChanges(routes.deleteRecording)))
	mux.HandleFunc("PUT /api/me/gallery", routes.authorized(routes.putGallery))

	mux.HandleFunc("DELETE /api/admin/recordings/{slug}", routes.adminOnly(routes.deleteAnyRecording))
	mux.HandleFunc("PUT /api/admin/users/{login}", routes.adminOnly(routes.putUserBlocked))

	mux.HandleFunc("GET /api/galleries/{login}", routes.publicGallery)
	mux.HandleFunc("GET /api/recordings/{slug}", routes.sharedRecording)
	mux.HandleFunc("GET /api/badges/{file}", routes.badge)

	return mux
}

// health reports whether the process is alive. It does not touch the database, so that
// a database failure does not restart the API.
func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ready reports whether the API can serve requests, that is, whether the database is reachable.
func (a *api) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), databasePingTimeout)
	defer cancel()

	if err := a.deps.DB.Ping(ctx); err != nil {
		a.deps.Logger.WarnContext(ctx, "база недоступна", "err", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// writeJSON responds with body as JSON and code status.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
