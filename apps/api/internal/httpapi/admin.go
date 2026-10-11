package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

// maxUserBlockBytes is the limit for the {"blocked": bool} body.
const maxUserBlockBytes = 1 << 10

// userBlock is the body of PUT /api/admin/users/{login}.
type userBlock struct {
	Blocked *bool `json:"blocked"`
}

// userBlockResponse is the response to a block change.
type userBlockResponse struct {
	Login   string `json:"login"`
	Blocked bool   `json:"blocked"`
}

// adminOnly lets only a signed-in site owner through to next; any other author gets 403.
func (a *api) adminOnly(next authorizedHandler) http.HandlerFunc {
	return a.authorized(func(w http.ResponseWriter, r *http.Request, user gallery.User) {
		isAdmin := slices.Contains(a.deps.AdminIDs, user.GitHubID)
		if !isAdmin {
			writeError(w, http.StatusForbidden, codeForbidden, "Действие доступно только владельцу сайта")
			return
		}

		next(w, r, user)
	})
}

// deleteAnyRecording removes any author's recording by its secret link.
func (a *api) deleteAnyRecording(w http.ResponseWriter, r *http.Request, admin gallery.User) {
	slug := r.PathValue("slug")

	err := a.deps.Galleries.DeleteSharedRecording(r.Context(), slug)
	if errors.Is(err, gallery.ErrNotFound) {
		writeNotFound(w, "Записи по этой ссылке нет")
		return
	}

	if err != nil {
		a.failInternal(w, r, err)
		return
	}

	a.deps.Logger.InfoContext(r.Context(), "владелец удалил запись", "admin", admin.GitHubID, "slug", slug)
	w.WriteHeader(http.StatusNoContent)
}

// putUserBlocked blocks or unblocks the author with the login from the address.
func (a *api) putUserBlocked(w http.ResponseWriter, r *http.Request, admin gallery.User) {
	var block userBlock
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxUserBlockBytes))
	err := decoder.Decode(&block)
	hasBlocked := err == nil && block.Blocked != nil
	if !hasBlocked {
		writeError(w, http.StatusBadRequest, codeInvalidRequest, `Ожидалось тело {"blocked": true} или {"blocked": false}`)
		return
	}

	login := r.PathValue("login")
	isBlocked := *block.Blocked

	err = a.deps.Galleries.SetUserBlocked(r.Context(), login, isBlocked)
	if errors.Is(err, gallery.ErrNotFound) {
		writeNotFound(w, "Автора с таким логином нет")
		return
	}

	if err != nil {
		a.failInternal(w, r, err)
		return
	}

	a.deps.Logger.InfoContext(r.Context(), "владелец сменил блокировку", "admin", admin.GitHubID, "login", login, "blocked", isBlocked)
	writeJSON(w, http.StatusOK, userBlockResponse{Login: login, Blocked: isBlocked})
}
