package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

const (
	adminRecordingPath = "/api/admin/recordings/k3f9x2m1q8zt"
	adminUserPath      = "/api/admin/users/octocat"
)

func TestAdminRoutes(t *testing.T) {
	owners := []int64{admin.GitHubID}
	tests := []struct {
		name       string
		request    apiRequest
		galleries  fakeGalleries
		adminIDs   []int64
		wantStatus int
		wantCode   string
	}{
		{"владелец удаляет запись", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: adminToken}, fakeGalleries{}, owners, http.StatusNoContent, ""},
		{"владелец удаляет несуществующую запись", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: adminToken}, fakeGalleries{err: gallery.ErrNotFound}, owners, http.StatusNotFound, codeNotFound},
		{"сбой хранилища при удалении", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: adminToken}, fakeGalleries{err: errors.New("база упала")}, owners, http.StatusInternalServerError, codeInternal},
		{"автор не может удалить чужую запись", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: authorToken}, fakeGalleries{}, owners, http.StatusForbidden, codeForbidden},
		{"удаление без токена", apiRequest{method: http.MethodDelete, path: adminRecordingPath}, fakeGalleries{}, owners, http.StatusUnauthorized, codeUnauthorized},
		{"удаление при отклонённом токене", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: rejectedToken}, fakeGalleries{}, owners, http.StatusUnauthorized, codeUnauthorized},
		{"удаление, когда владельцев нет", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: adminToken}, fakeGalleries{}, nil, http.StatusForbidden, codeForbidden},

		{"владелец блокирует автора", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":true}`}, fakeGalleries{}, owners, http.StatusOK, ""},
		{"владелец снимает блокировку", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":false}`}, fakeGalleries{}, owners, http.StatusOK, ""},
		{"блокировка несуществующего автора", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":true}`}, fakeGalleries{err: gallery.ErrNotFound}, owners, http.StatusNotFound, codeNotFound},
		{"сбой хранилища при блокировке", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":true}`}, fakeGalleries{err: errors.New("база упала")}, owners, http.StatusInternalServerError, codeInternal},
		{"блокировка без поля blocked", apiRequest{http.MethodPut, adminUserPath, adminToken, `{}`}, fakeGalleries{}, owners, http.StatusBadRequest, codeInvalidRequest},
		{"блокировка с не-bool", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":"yes"}`}, fakeGalleries{}, owners, http.StatusBadRequest, codeInvalidRequest},
		{"блокировка с пустым телом", apiRequest{http.MethodPut, adminUserPath, adminToken, ``}, fakeGalleries{}, owners, http.StatusBadRequest, codeInvalidRequest},
		{"автор не может блокировать", apiRequest{http.MethodPut, adminUserPath, authorToken, `{"blocked":true}`}, fakeGalleries{}, owners, http.StatusForbidden, codeForbidden},
		{"блокировка без токена", apiRequest{http.MethodPut, adminUserPath, "", `{"blocked":true}`}, fakeGalleries{}, owners, http.StatusUnauthorized, codeUnauthorized},
		{"блокировка, когда владельцев нет", apiRequest{http.MethodPut, adminUserPath, adminToken, `{"blocked":true}`}, fakeGalleries{}, nil, http.StatusForbidden, codeForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			galleries := tt.galleries

			recorder := serveWithAdmins(t, &galleries, "", tt.adminIDs, tt.request)

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

func TestAdminDeletesRecordingBySlug(t *testing.T) {
	galleries := fakeGalleries{}
	request := apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: adminToken}

	serve(t, &galleries, "", request)

	if want := []string{"k3f9x2m1q8zt"}; !slices.Equal(galleries.deletedSlugs, want) {
		t.Fatalf("удалены записи %v, ожидались %v", galleries.deletedSlugs, want)
	}
}

func TestAdminRefusalChangesNothing(t *testing.T) {
	tests := []struct {
		name    string
		request apiRequest
	}{
		{"отказанное удаление", apiRequest{method: http.MethodDelete, path: adminRecordingPath, token: authorToken}},
		{"отказанная блокировка", apiRequest{http.MethodPut, adminUserPath, authorToken, `{"blocked":true}`}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			galleries := fakeGalleries{}

			serve(t, &galleries, "", tt.request)

			if len(galleries.deletedSlugs) != 0 || len(galleries.blockedLogins) != 0 {
				t.Fatalf("отказанный запрос что-то изменил: удалено %v, блокировки %v", galleries.deletedSlugs, galleries.blockedLogins)
			}
		})
	}
}

func TestAdminSessionAuthorization(t *testing.T) {
	tests := []struct {
		name       string
		request    sessionRequest
		wantStatus int
		wantCode   string
	}{
		{"удаление по куке владельца без Origin", sessionRequest{method: http.MethodDelete, path: adminRecordingPath}, http.StatusForbidden, codeForbiddenOrigin},
		{"удаление по куке владельца с чужим Origin", sessionRequest{method: http.MethodDelete, path: adminRecordingPath, origin: foreignOrigin}, http.StatusForbidden, codeForbiddenOrigin},
		{"удаление по куке владельца со своим Origin", sessionRequest{method: http.MethodDelete, path: adminRecordingPath, origin: testPublicURL}, http.StatusNoContent, ""},
		{"блокировка по куке владельца без Origin", sessionRequest{method: http.MethodPut, path: adminUserPath, body: `{"blocked":true}`}, http.StatusForbidden, codeForbiddenOrigin},
		{"блокировка по куке владельца со своим Origin", sessionRequest{method: http.MethodPut, path: adminUserPath, body: `{"blocked":true}`, origin: testPublicURL}, http.StatusOK, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sessions := newFakeSessions()
			sessionCookie := &http.Cookie{Name: sessionCookieName, Value: sessions.open(t, time.Hour)}
			handler := NewHandler(Deps{
				DB:        fakeDB{},
				Galleries: &fakeGalleries{},
				Sessions:  sessions,
				Tokens:    fakeVerifier{},
				PublicURL: testPublicURL,
				AdminIDs:  []int64{author.GitHubID},
				Logger:    slog.New(slog.NewTextHandler(io.Discard, nil)),
			})
			request := httptest.NewRequestWithContext(t.Context(), tt.request.method, tt.request.path, strings.NewReader(tt.request.body))
			request.AddCookie(sessionCookie)
			if tt.request.origin != "" {
				request.Header.Set("Origin", tt.request.origin)
			}
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

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
			if body.Code != tt.wantCode {
				t.Fatalf("код ошибки %q, ожидался %q", body.Code, tt.wantCode)
			}
		})
	}
}

func TestAdminSetsBlock(t *testing.T) {
	tests := []struct {
		name      string
		body      string
		wantBlock bool
	}{
		{"блокировка", `{"blocked":true}`, true},
		{"снятие блокировки", `{"blocked":false}`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			galleries := fakeGalleries{}
			request := apiRequest{http.MethodPut, adminUserPath, adminToken, tt.body}

			recorder := serve(t, &galleries, "", request)

			var body userBlockResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("ответ не JSON: %v: %s", err, recorder.Body)
			}
			if body.Login != "octocat" || body.Blocked != tt.wantBlock {
				t.Fatalf("ответ %+v, ожидался octocat с blocked=%v", body, tt.wantBlock)
			}
			isBlocked, isSet := galleries.blockedLogins["octocat"]
			if !isSet || isBlocked != tt.wantBlock {
				t.Fatalf("в хранилище blocked=%v (задано: %v), ожидалось %v", isBlocked, isSet, tt.wantBlock)
			}
		})
	}
}
