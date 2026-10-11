package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

func TestGalleryRoutes(t *testing.T) {
	recordingPath := "/api/me/recordings/2026-10-05-4365c610"
	validBody := sessionBody("2026-10-05-4365c610")
	tests := []struct {
		name       string
		request    apiRequest
		galleries  fakeGalleries
		clientID   string
		wantStatus int
		wantCode   string
	}{
		{"client_id для входа", apiRequest{method: http.MethodGet, path: "/api/auth/github"}, fakeGalleries{}, testClientID, http.StatusOK, ""},
		{"вход не настроен", apiRequest{method: http.MethodGet, path: "/api/auth/github"}, fakeGalleries{}, "", http.StatusServiceUnavailable, codeAuthUnavailable},

		{"галерея автора", apiRequest{method: http.MethodGet, path: "/api/me", token: authorToken}, fakeGalleries{}, "", http.StatusOK, ""},
		{"без токена", apiRequest{method: http.MethodGet, path: "/api/me"}, fakeGalleries{}, "", http.StatusUnauthorized, codeUnauthorized},
		{"токен отклонён", apiRequest{method: http.MethodGet, path: "/api/me", token: rejectedToken}, fakeGalleries{}, "", http.StatusUnauthorized, codeUnauthorized},
		{"GitHub не ответил", apiRequest{method: http.MethodGet, path: "/api/me", token: unreachableToken}, fakeGalleries{}, "", http.StatusBadGateway, codeGitHubUnavailable},
		{"сбой хранилища", apiRequest{method: http.MethodGet, path: "/api/me", token: authorToken}, fakeGalleries{err: errors.New("база упала")}, "", http.StatusInternalServerError, codeInternal},

		{"новая запись", apiRequest{http.MethodPut, recordingPath, authorToken, validBody}, fakeGalleries{isNew: true}, "", http.StatusCreated, ""},
		{"замена записи", apiRequest{http.MethodPut, recordingPath, authorToken, validBody}, fakeGalleries{}, "", http.StatusOK, ""},
		{"загрузка без токена", apiRequest{http.MethodPut, recordingPath, "", validBody}, fakeGalleries{}, "", http.StatusUnauthorized, codeUnauthorized},
		{"запись больше 2 МиБ", apiRequest{http.MethodPut, recordingPath, authorToken, strings.Repeat(" ", maxRecordBytes+1)}, fakeGalleries{}, "", http.StatusRequestEntityTooLarge, codeTooLarge},
		{"запись не JSON", apiRequest{http.MethodPut, recordingPath, authorToken, "{"}, fakeGalleries{}, "", http.StatusBadRequest, codeInvalidRecord},
		{"решение вместо сессии", apiRequest{http.MethodPut, recordingPath, authorToken, strings.Replace(validBody, `"session"`, `"decision"`, 1)}, fakeGalleries{}, "", http.StatusBadRequest, codeInvalidRecord},
		{"id не совпадает с адресом", apiRequest{http.MethodPut, "/api/me/recordings/other", authorToken, validBody}, fakeGalleries{}, "", http.StatusBadRequest, codeIDMismatch},
		{"галерея полна", apiRequest{http.MethodPut, recordingPath, authorToken, validBody}, fakeGalleries{err: gallery.ErrLimitReached}, "", http.StatusConflict, codeLimitReached},
		{"аккаунт заблокирован", apiRequest{http.MethodPut, recordingPath, authorToken, validBody}, fakeGalleries{err: gallery.ErrBlocked}, "", http.StatusForbidden, codeAccountBlocked},
		{"хранилище заполнено", apiRequest{http.MethodPut, recordingPath, authorToken, validBody}, fakeGalleries{err: gallery.ErrStorageFull}, "", http.StatusInsufficientStorage, codeStorageFull},

		{"удаление записи", apiRequest{method: http.MethodDelete, path: recordingPath, token: authorToken}, fakeGalleries{}, "", http.StatusNoContent, ""},
		{"удаление чужой или нет записи", apiRequest{method: http.MethodDelete, path: recordingPath, token: authorToken}, fakeGalleries{err: gallery.ErrNotFound}, "", http.StatusNotFound, codeNotFound},
		{"удаление без токена", apiRequest{method: http.MethodDelete, path: recordingPath}, fakeGalleries{}, "", http.StatusUnauthorized, codeUnauthorized},

		{"открыть галерею", apiRequest{http.MethodPut, "/api/me/gallery", authorToken, `{"public":true}`}, fakeGalleries{}, "", http.StatusOK, ""},
		{"видимость не задана", apiRequest{http.MethodPut, "/api/me/gallery", authorToken, `{}`}, fakeGalleries{}, "", http.StatusBadRequest, codeInvalidRequest},
		{"видимость не bool", apiRequest{http.MethodPut, "/api/me/gallery", authorToken, `{"public":"yes"}`}, fakeGalleries{}, "", http.StatusBadRequest, codeInvalidRequest},
		{"видимость без токена", apiRequest{http.MethodPut, "/api/me/gallery", "", `{"public":true}`}, fakeGalleries{}, "", http.StatusUnauthorized, codeUnauthorized},

		{"общего списка галерей нет", apiRequest{method: http.MethodGet, path: "/api/galleries"}, fakeGalleries{}, "", http.StatusNotFound, ""},
		{"открытая галерея", apiRequest{method: http.MethodGet, path: "/api/galleries/octocat"}, fakeGalleries{}, "", http.StatusOK, ""},
		{"закрытая галерея", apiRequest{method: http.MethodGet, path: "/api/galleries/octocat"}, fakeGalleries{err: gallery.ErrNotFound}, "", http.StatusNotFound, codeNotFound},

		{"запись по ссылке", apiRequest{method: http.MethodGet, path: "/api/recordings/k3f9x2m1q8zt"}, fakeGalleries{}, "", http.StatusOK, ""},
		{"нет записи по ссылке", apiRequest{method: http.MethodGet, path: "/api/recordings/k3f9x2m1q8zt"}, fakeGalleries{err: gallery.ErrNotFound}, "", http.StatusNotFound, codeNotFound},

		{"бейдж открытой галереи", apiRequest{method: http.MethodGet, path: "/api/badges/octocat.svg"}, fakeGalleries{}, "", http.StatusOK, ""},
		{"бейдж закрытой галереи", apiRequest{method: http.MethodGet, path: "/api/badges/octocat.svg"}, fakeGalleries{err: gallery.ErrNotFound}, "", http.StatusOK, ""},
		{"бейдж без .svg", apiRequest{method: http.MethodGet, path: "/api/badges/octocat"}, fakeGalleries{}, "", http.StatusNotFound, codeNotFound},
		{"бейдж при сбое хранилища", apiRequest{method: http.MethodGet, path: "/api/badges/octocat.svg"}, fakeGalleries{err: errors.New("база упала")}, "", http.StatusInternalServerError, codeInternal},

		{"сводки по галереям нет", apiRequest{method: http.MethodGet, path: "/api/stats"}, fakeGalleries{}, "", http.StatusNotFound, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			galleries := tt.galleries

			recorder := serve(t, &galleries, tt.clientID, tt.request)

			if recorder.Code != tt.wantStatus {
				t.Fatalf("код %d, ожидался %d: %s", recorder.Code, tt.wantStatus, recorder.Body)
			}
			if tt.wantCode == "" {
				return
			}
			var body apiError
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("ошибка не в JSON: %v: %s", err, recorder.Body)
			}
			if body.Code != tt.wantCode || body.Message == "" {
				t.Fatalf("ошибка %+v, ожидался код %q с сообщением", body, tt.wantCode)
			}
		})
	}
}

func TestAuthorizedSavesUser(t *testing.T) {
	galleries := fakeGalleries{}

	serve(t, &galleries, "", apiRequest{method: http.MethodGet, path: "/api/me", token: authorToken})

	if len(galleries.savedUsers) != 1 || galleries.savedUsers[0] != author {
		t.Fatalf("заведены авторы %+v, ожидался %+v", galleries.savedUsers, author)
	}
}

func TestMe(t *testing.T) {
	galleries := fakeGalleries{galleryPublic: true, recordings: []gallery.Summary{}}

	recorder := serve(t, &galleries, "", apiRequest{method: http.MethodGet, path: "/api/me", token: authorToken})

	want := `{"login":"octocat","galleryPublic":true,"limit":5,"recordings":[]}`
	if got := strings.TrimSpace(recorder.Body.String()); got != want {
		t.Fatalf("ответ %s, ожидался %s", got, want)
	}
}

func TestGitHubAuth(t *testing.T) {
	recorder := serve(t, &fakeGalleries{}, testClientID, apiRequest{method: http.MethodGet, path: "/api/auth/github"})

	want := `{"clientId":"Iv1.test"}`
	if got := strings.TrimSpace(recorder.Body.String()); got != want {
		t.Fatalf("ответ %s, ожидался %s", got, want)
	}
}

func TestPutRecording(t *testing.T) {
	galleries := fakeGalleries{isNew: true}
	request := apiRequest{http.MethodPut, "/api/me/recordings/abc", authorToken, sessionBody("abc")}

	recorder := serve(t, &galleries, "", request)

	var body recordingResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("ответ не JSON: %v", err)
	}
	if body.Recording.ID != "abc" || body.Recording.Slug == "" {
		t.Fatalf("в ответе нет записи со ссылкой: %s", recorder.Body)
	}
}

func TestSharedRecordingBody(t *testing.T) {
	recorder := serve(t, &fakeGalleries{}, "", apiRequest{method: http.MethodGet, path: "/api/recordings/k3f9x2m1q8zt"})

	var body struct {
		Owner         string          `json:"owner"`
		GalleryPublic bool            `json:"galleryPublic"`
		Record        json.RawMessage `json:"record"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("ответ не JSON: %v", err)
	}
	if body.Owner != author.Login || string(body.Record) != sessionBody("shared") {
		t.Fatalf("ответ %s: ожидалась запись как загружена", recorder.Body)
	}
}

func TestBadge(t *testing.T) {
	tests := []struct {
		name      string
		galleries fakeGalleries
		want      string
	}{
		{"открытая галерея", fakeGalleries{recordings: make([]gallery.Summary, 3)}, ">3 builds<"},
		{"одна запись", fakeGalleries{recordings: make([]gallery.Summary, 1)}, ">1 build<"},
		{"закрытая галерея", fakeGalleries{err: gallery.ErrNotFound}, ">private<"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			galleries := tt.galleries

			recorder := serve(t, &galleries, "", apiRequest{method: http.MethodGet, path: "/api/badges/octocat.svg"})

			if contentType := recorder.Header().Get("Content-Type"); contentType != "image/svg+xml" {
				t.Fatalf("Content-Type %q, ожидался image/svg+xml", contentType)
			}
			if cacheControl := recorder.Header().Get("Cache-Control"); cacheControl != publicCacheControl {
				t.Fatalf("Cache-Control %q, ожидался %q", cacheControl, publicCacheControl)
			}
			if !strings.Contains(recorder.Body.String(), tt.want) {
				t.Fatalf("в бейдже нет %q: %s", tt.want, recorder.Body)
			}
		})
	}
}
