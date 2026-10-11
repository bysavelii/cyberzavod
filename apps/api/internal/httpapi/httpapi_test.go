package httpapi

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

const (
	authorToken   = "gho_author"
	rejectedToken = "gho_rejected"
	// unreachableToken is a token for which GitHub does not respond.
	unreachableToken = "gho_unreachable"
	testClientID     = "Iv1.test"
)

var author = gallery.User{GitHubID: 7, Login: "octocat"}

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

// fakeVerifier is GitHub without a network: authorToken belongs to author, unreachableToken
// GitHub cannot verify, the rest it rejects.
type fakeVerifier struct{}

func (fakeVerifier) Verify(_ context.Context, token string) (gallery.User, error) {
	switch token {
	case authorToken:
		return author, nil
	case unreachableToken:
		return gallery.User{}, errors.New("GitHub не ответил")
	default:
		return gallery.User{}, gallery.ErrTokenRejected
	}
}

// fakeGalleries is a store without a database: it returns the given values, err from any method
// except SaveUser. It remembers the authors that were created.
type fakeGalleries struct {
	err           error
	isNew         bool
	galleryPublic bool
	recordings    []gallery.Summary
	savedUsers    []gallery.User
}

func (f *fakeGalleries) SaveUser(_ context.Context, user gallery.User) error {
	f.savedUsers = append(f.savedUsers, user)
	return nil
}

func (f *fakeGalleries) Account(context.Context, int64) (gallery.Account, error) {
	account := gallery.Account{Login: author.Login, GalleryPublic: f.galleryPublic, Recordings: f.recordings}
	return account, f.err
}

func (f *fakeGalleries) SaveRecording(_ context.Context, _ int64, recording gallery.Recording) (gallery.Summary, bool, error) {
	summary := gallery.Summary{ID: recording.ID, Slug: "k3f9x2m1q8zt", Title: recording.Title}
	return summary, f.isNew, f.err
}

func (f *fakeGalleries) DeleteRecording(context.Context, int64, string) error {
	return f.err
}

func (f *fakeGalleries) SetGalleryPublic(context.Context, int64, bool) error {
	return f.err
}

func (f *fakeGalleries) PublicGallery(context.Context, string) (gallery.Gallery, error) {
	return gallery.Gallery{Login: author.Login, Recordings: f.recordings}, f.err
}

func (f *fakeGalleries) SharedRecording(context.Context, string) (gallery.SharedRecording, error) {
	shared := gallery.SharedRecording{Owner: author.Login, Record: []byte(sessionBody("shared"))}
	return shared, f.err
}

// sessionBody is the body of a session recording with identifier id.
func sessionBody(id string) string {
	return `{"version":1,"type":"session","id":"` + id + `","timestamp":"2026-10-05T08:00:00.000Z",` +
		`"projectId":"lab","source":{"type":"manual"},` +
		`"data":{"title":"Галерея","language":"ru","workflow":"default","harness":"0.6.0","events":[]}}`
}

// apiRequest is a request to the API in a test; an empty token means no Authorization header.
type apiRequest struct {
	method string
	path   string
	token  string
	body   string
}

// serve runs a request through the API routes with the galleries store and client_id clientID.
func serve(t *testing.T, galleries *fakeGalleries, clientID string, request apiRequest) *httptest.ResponseRecorder {
	t.Helper()

	handler := NewHandler(Deps{
		DB:             fakeDB{},
		Galleries:      galleries,
		Sessions:       newFakeSessions(),
		Tokens:         fakeVerifier{},
		GitHubClientID: clientID,
		PublicURL:      testPublicURL,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	recorder := httptest.NewRecorder()
	httpRequest := httptest.NewRequestWithContext(t.Context(), request.method, request.path, strings.NewReader(request.body))
	if request.token != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+request.token)
	}

	handler.ServeHTTP(recorder, httpRequest)

	return recorder
}

func TestRoutes(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		dbErr  error
		want   int
	}{
		{"health без базы", http.MethodGet, "/api/health", errors.New("down"), http.StatusOK},
		{"ready с базой", http.MethodGet, "/api/ready", nil, http.StatusOK},
		{"ready без базы", http.MethodGet, "/api/ready", errors.New("down"), http.StatusServiceUnavailable},
		{"неверный метод", http.MethodPost, "/api/health", nil, http.StatusMethodNotAllowed},
		{"неизвестный путь", http.MethodGet, "/api/nope", nil, http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewHandler(Deps{
				DB:     fakeDB{err: tt.dbErr},
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
			})
			recorder := httptest.NewRecorder()
			request := httptest.NewRequestWithContext(t.Context(), tt.method, tt.path, nil)

			handler.ServeHTTP(recorder, request)

			if recorder.Code != tt.want {
				t.Fatalf("%s %s: код %d, ожидался %d", tt.method, tt.path, recorder.Code, tt.want)
			}
		})
	}
}
