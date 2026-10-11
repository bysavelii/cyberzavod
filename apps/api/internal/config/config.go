// Package config reads the API settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	defaultAddr           = ":8080"
	defaultGitHubAPIURL   = "https://api.github.com"
	defaultGitHubOAuthURL = "https://github.com"
	defaultPublicURL      = "https://cyberzavod.com"

	adminIDsVariable = "ADMIN_GITHUB_IDS"
)

// Config holds the API settings read from the environment.
type Config struct {
	// Addr is the address the HTTP server listens on, for example ":8080".
	Addr string
	// DatabaseURL is the Postgres connection string.
	DatabaseURL string
	// GitHubClientID is the client_id of the GitHub OAuth app used to sign in from the CLI via
	// device flow and on the site. Empty means sign-in is unavailable; the rest of the API works.
	GitHubClientID string
	// GitHubClientSecret is the OAuth app secret for sign-in on the site. Empty means sign-in on
	// the site is unavailable; the CLI works. Never logged.
	GitHubClientSecret string
	// GitHubAPIURL is the GitHub API address used to verify authors' tokens.
	GitHubAPIURL string
	// GitHubOAuthURL is the GitHub address that hosts the consent page and the code exchange.
	GitHubOAuthURL string
	// PublicURL is the site address without a trailing "/": the GitHub return address is built
	// from it, and the Origin of cookie-session requests is checked against it.
	PublicURL string
	// AdminGitHubIDs are the GitHub ids of the site owners who may delete any recording and block
	// accounts. Empty means there are no owners and the admin routes refuse everyone. Never logged.
	AdminGitHubIDs []int64
}

// Load reads the settings from environment variables. DATABASE_URL is required, the rest are not;
// PUBLIC_URL, if set, must be only a scheme and host; ADMIN_GITHUB_IDS, if set, is positive
// integers separated by commas.
func Load() (Config, error) {
	cfg := Config{
		Addr:               Addr(),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		GitHubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GitHubAPIURL:       envOrDefault("GITHUB_API_URL", defaultGitHubAPIURL),
		GitHubOAuthURL:     strings.TrimSuffix(envOrDefault("GITHUB_OAUTH_URL", defaultGitHubOAuthURL), "/"),
		PublicURL:          strings.TrimSuffix(envOrDefault("PUBLIC_URL", defaultPublicURL), "/"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("не задана переменная DATABASE_URL")
	}

	if err := validateOrigin(cfg.PublicURL); err != nil {
		return Config{}, fmt.Errorf("PUBLIC_URL: %w", err)
	}

	adminIDs, err := parseAdminIDs(os.Getenv(adminIDsVariable))
	if err != nil {
		return Config{}, fmt.Errorf("%s: %w", adminIDsVariable, err)
	}

	cfg.AdminGitHubIDs = adminIDs

	return cfg, nil
}

// parseAdminIDs reads GitHub ids separated by commas; blank entries are skipped, an empty list
// gives nil.
func parseAdminIDs(list string) ([]int64, error) {
	var ids []int64
	for entry := range strings.SplitSeq(list, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		id, err := strconv.ParseInt(entry, 10, 64)
		if err != nil || id <= 0 {
			return nil, fmt.Errorf("%q не id GitHub: ожидалось целое число больше нуля", entry)
		}

		ids = append(ids, id)
	}

	return ids, nil
}

// HasSiteLogin reports whether site sign-in is configured: it needs both client_id and secret.
func (c Config) HasSiteLogin() bool {
	return c.GitHubClientID != "" && c.GitHubClientSecret != ""
}

// validateOrigin checks that the address is only an http(s) scheme and a host: the Origin header
// is compared with it directly, and Origin never has a path.
func validateOrigin(address string) error {
	parsed, err := url.Parse(address)
	if err != nil {
		return fmt.Errorf("разбор адреса %q: %w", address, err)
	}

	isHTTP := parsed.Scheme == "http" || parsed.Scheme == "https"
	isOrigin := parsed.Host != "" && parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" && parsed.User == nil
	if !isHTTP || !isOrigin {
		return fmt.Errorf("адрес %q должен быть вида https://хост без пути", address)
	}

	return nil
}

// Addr returns the HTTP server address. Separate from Load: healthcheck needs no database.
func Addr() string {
	return envOrDefault("API_ADDR", defaultAddr)
}

func envOrDefault(name, fallback string) string {
	value := os.Getenv(name)
	if value != "" {
		return value
	}

	return fallback
}

// LocalURL builds the address at which the process reaches its own server:
// the host from addr is dropped, leaving localhost and the port.
func LocalURL(addr, path string) (string, error) {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", fmt.Errorf("разбор адреса %q: %w", addr, err)
	}
	return "http://" + net.JoinHostPort("localhost", port) + path, nil
}
