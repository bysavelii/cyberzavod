package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

const (
	bytesPerMiB = 1 << 20
	// maxRecordBytes is the recording body limit: 2 MiB comfortably fits a session with full texts.
	maxRecordBytes = 2 * bytesPerMiB
	// maxGallerySettingsBytes is the limit for the {"public": bool} body.
	maxGallerySettingsBytes = 1 << 10
)

// accountResponse is the GET /api/me response.
type accountResponse struct {
	Login         string            `json:"login"`
	GalleryPublic bool              `json:"galleryPublic"`
	Limit         int               `json:"limit"`
	Recordings    []gallery.Summary `json:"recordings"`
}

// recordingResponse is the response to a recording upload.
type recordingResponse struct {
	Recording gallery.Summary `json:"recording"`
}

// gallerySettings is the body of PUT /api/me/gallery and the response to it.
type gallerySettings struct {
	Public *bool `json:"public"`
}

type galleryVisibility struct {
	GalleryPublic bool `json:"galleryPublic"`
}

// me gives the author their gallery: whether it is public, the limit and the recordings.
func (a *api) me(w http.ResponseWriter, r *http.Request, user gallery.User) {
	account, err := a.deps.Galleries.Account(r.Context(), user.GitHubID)
	if err != nil {
		a.failInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, accountResponse{
		Login:         account.Login,
		GalleryPublic: account.GalleryPublic,
		Limit:         gallery.RecordingLimit,
		Recordings:    account.Recordings,
	})
}

// putRecording puts a recording into the author's gallery or replaces the one with the same id.
func (a *api) putRecording(w http.ResponseWriter, r *http.Request, user gallery.User) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRecordBytes))
	if err != nil {
		a.writeBodyError(w, r, err)
		return
	}

	recording, err := gallery.ParseRecording(body)
	if err != nil {
		a.writeRecordError(w, r, err)
		return
	}

	pathID := r.PathValue("id")
	if recording.ID != pathID {
		message := fmt.Sprintf("id в записи %q не совпадает с id в адресе %q", recording.ID, pathID)
		writeError(w, http.StatusBadRequest, codeIDMismatch, message)
		return
	}

	summary, isNew, err := a.deps.Galleries.SaveRecording(r.Context(), user.GitHubID, recording)
	if errors.Is(err, gallery.ErrLimitReached) {
		message := fmt.Sprintf("В галерее уже %d записей: удалите одну, чтобы загрузить новую", gallery.RecordingLimit)
		writeError(w, http.StatusConflict, codeLimitReached, message)
		return
	}

	if errors.Is(err, gallery.ErrBlocked) {
		writeError(w, http.StatusForbidden, codeAccountBlocked, "Аккаунт заблокирован владельцем сайта: загрузка записей недоступна")
		return
	}

	if errors.Is(err, gallery.ErrStorageFull) {
		writeError(w, http.StatusInsufficientStorage, codeStorageFull, "Хранилище галерей заполнено, попробуйте позже")
		return
	}

	if err != nil {
		a.failInternal(w, r, err)
		return
	}

	writeJSON(w, savedStatus(isNew), recordingResponse{Recording: summary})
}

func savedStatus(isNew bool) int {
	if isNew {
		return http.StatusCreated
	}

	return http.StatusOK
}

// writeBodyError responds to a body that could not be read: too large or truncated.
func (a *api) writeBodyError(w http.ResponseWriter, r *http.Request, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		message := fmt.Sprintf("Запись больше %d МиБ", tooLarge.Limit/bytesPerMiB)
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge, message)
		return
	}

	a.failInternal(w, r, fmt.Errorf("чтение тела запроса: %w", err))
}

func (a *api) writeRecordError(w http.ResponseWriter, r *http.Request, err error) {
	var invalid *gallery.InvalidRecordError
	if errors.As(err, &invalid) {
		writeError(w, http.StatusBadRequest, codeInvalidRecord, "Запись не прошла проверку: "+invalid.Reason)
		return
	}

	a.failInternal(w, r, err)
}

// deleteRecording removes a recording from the author's gallery.
func (a *api) deleteRecording(w http.ResponseWriter, r *http.Request, user gallery.User) {
	err := a.deps.Galleries.DeleteRecording(r.Context(), user.GitHubID, r.PathValue("id"))
	if errors.Is(err, gallery.ErrNotFound) {
		writeNotFound(w, "В галерее нет такой записи")
		return
	}

	if err != nil {
		a.failInternal(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// putGallery makes the author's gallery public or private.
func (a *api) putGallery(w http.ResponseWriter, r *http.Request, user gallery.User) {
	var settings gallerySettings
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxGallerySettingsBytes))
	err := decoder.Decode(&settings)
	hasVisibility := err == nil && settings.Public != nil
	if !hasVisibility {
		writeError(w, http.StatusBadRequest, codeInvalidRequest, `Ожидалось тело {"public": true} или {"public": false}`)
		return
	}

	isPublic := *settings.Public
	if err := a.deps.Galleries.SetGalleryPublic(r.Context(), user.GitHubID, isPublic); err != nil {
		a.failInternal(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, galleryVisibility{GalleryPublic: isPublic})
}
