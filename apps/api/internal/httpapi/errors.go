package httpapi

import "net/http"

// API error codes: the client decides what to do by them; message is for the human.
const (
	codeUnauthorized      = "unauthorized"
	codeForbidden         = "forbidden"
	codeForbiddenOrigin   = "forbidden_origin"
	codeAccountBlocked    = "account_blocked"
	codeAuthUnavailable   = "auth_unavailable"
	codeGitHubUnavailable = "github_unavailable"
	codeTooLarge          = "too_large"
	codeInvalidRecord     = "invalid_record"
	codeIDMismatch        = "id_mismatch"
	codeLimitReached      = "limit_reached"
	codeStorageFull       = "storage_full"
	codeTooManyRequests   = "too_many_requests"
	codeNotFound          = "not_found"
	codeInvalidRequest    = "invalid_request"
	codeInternal          = "internal"
)

// apiError is the body of an error response.
type apiError struct {
	Code    string `json:"error"`
	Message string `json:"message"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Code: code, Message: message})
}

func writeNotFound(w http.ResponseWriter, message string) {
	writeError(w, http.StatusNotFound, codeNotFound, message)
}

// failInternal logs the error and responds 500 without revealing details to the client.
func (a *api) failInternal(w http.ResponseWriter, r *http.Request, err error) {
	a.deps.Logger.ErrorContext(r.Context(), "ошибка запроса", "route", r.Pattern, "err", err)
	writeError(w, http.StatusInternalServerError, codeInternal, "Внутренняя ошибка сервера, попробуйте позже")
}
