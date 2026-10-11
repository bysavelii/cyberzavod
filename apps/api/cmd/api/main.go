// Command api is a single binary with three subcommands:
//
//	api serve        HTTP server (default)
//	api migrate      apply migrations and exit
//	api healthcheck  check /api/health; needed for the healthcheck in a container without curl
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bysavelii/cyberzavod/apps/api/internal/config"
	"github.com/bysavelii/cyberzavod/apps/api/internal/db"
	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
	"github.com/bysavelii/cyberzavod/apps/api/internal/github"
	"github.com/bysavelii/cyberzavod/apps/api/internal/httpapi"
	"github.com/bysavelii/cyberzavod/apps/api/internal/store"
)

const (
	defaultCommand = "serve"

	readHeaderTimeout  = 5 * time.Second
	readTimeout        = 15 * time.Second
	writeTimeout       = 15 * time.Second
	idleTimeout        = 60 * time.Second
	shutdownTimeout    = 10 * time.Second
	healthcheckTimeout = 3 * time.Second
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cmd := defaultCommand
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	err := run(ctx, stop, cmd, logger)
	if err != nil {
		logger.Error("ошибка", "cmd", cmd, "err", err)
		os.Exit(1)
	}
}

// run runs the subcommand cmd. Only serve needs stop: see the comment on it.
func run(ctx context.Context, stop context.CancelFunc, cmd string, logger *slog.Logger) error {
	switch cmd {
	case "serve":
		return serve(ctx, stop, logger)
	case "migrate":
		return migrate(ctx, logger)
	case "healthcheck":
		return healthcheck(ctx)
	default:
		return fmt.Errorf("неизвестная команда %q", cmd)
	}
}

// serve starts the HTTP server and waits for a stop signal.
// stop cancels the signal subscription: after the first signal a second one ends the process.
func serve(ctx context.Context, stop context.CancelFunc, logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	galleryStore := store.New(pool, gallery.StorageLimitBytes)
	handler := httpapi.NewHandler(httpapi.Deps{
		DB:             pool,
		Galleries:      galleryStore,
		Sessions:       galleryStore,
		Tokens:         github.NewVerifier(cfg.GitHubAPIURL),
		GitHubClientID: cfg.GitHubClientID,
		OAuth:          siteLogin(cfg),
		PublicURL:      cfg.PublicURL,
		AdminIDs:       cfg.AdminGitHubIDs,
		Logger:         logger,
	})
	srv := newServer(cfg.Addr, handler)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("API запущен", "addr", cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	stop()

	logger.Info("останавливаюсь")

	return shutdown(srv, errCh)
}

// siteLogin returns the OAuth app for sign-in on the site, or nil if sign-in is not configured.
// nil is returned explicitly: a nil *github.OAuthApp would not be nil inside an interface.
func siteLogin(cfg config.Config) httpapi.OAuthApp {
	if !cfg.HasSiteLogin() {
		return nil
	}

	return github.NewOAuthApp(cfg.GitHubOAuthURL, cfg.GitHubClientID, cfg.GitHubClientSecret)
}

func newServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
}

// shutdown stops the server and waits for ListenAndServe to finish.
func shutdown(srv *http.Server, errCh <-chan error) error {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		return err
	}

	err := <-errCh
	if !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}

func migrate(ctx context.Context, logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
		return err
	}
	logger.Info("миграции применены")

	return nil
}

func healthcheck(ctx context.Context) error {
	url, err := config.LocalURL(config.Addr(), httpapi.HealthPath)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, healthcheckTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	// The healthcheck response body is not read: a close error changes nothing in the result.
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health вернул %d", resp.StatusCode)
	}

	return nil
}
