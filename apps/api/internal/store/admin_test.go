package store

import (
	"errors"
	"testing"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

// slugOf returns the link of the author's only recording.
func slugOf(t *testing.T, store *Store, user gallery.User) string {
	t.Helper()

	account, err := store.Account(t.Context(), user.GitHubID)
	if err != nil {
		t.Fatalf("галерея автора %s: %v", user.Login, err)
	}
	if len(account.Recordings) != 1 {
		t.Fatalf("записей %d, ожидалась одна", len(account.Recordings))
	}

	return account.Recordings[0].Slug
}

// blockAuthor blocks the author by login.
func blockAuthor(t *testing.T, store *Store, login string) {
	t.Helper()

	if err := store.SetUserBlocked(t.Context(), login, true); err != nil {
		t.Fatalf("блокировка %s: %v", login, err)
	}
}

// unblockAuthor lifts the author's block by login.
func unblockAuthor(t *testing.T, store *Store, login string) {
	t.Helper()

	if err := store.SetUserBlocked(t.Context(), login, false); err != nil {
		t.Fatalf("снятие блокировки %s: %v", login, err)
	}
}

func TestBlockedUser(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 1)
	slug := slugOf(t, store, octocat)
	blockAuthor(t, store, octocat.Login)

	t.Run("новая запись отклоняется", func(t *testing.T) {
		_, _, err := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, "new", 5, `[]`))

		if !errors.Is(err, gallery.ErrBlocked) {
			t.Fatalf("ошибка %v, ожидалась ErrBlocked", err)
		}
	})

	t.Run("замена записи отклоняется", func(t *testing.T) {
		_, _, err := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, "octocat-0", 5, `[]`))

		if !errors.Is(err, gallery.ErrBlocked) {
			t.Fatalf("ошибка %v, ожидалась ErrBlocked", err)
		}
	})

	t.Run("галерея не отдаётся", func(t *testing.T) {
		_, err := store.PublicGallery(t.Context(), octocat.Login)

		if !errors.Is(err, gallery.ErrNotFound) {
			t.Fatalf("ошибка %v, ожидалась ErrNotFound", err)
		}
	})

	t.Run("запись по ссылке не отдаётся", func(t *testing.T) {
		_, err := store.SharedRecording(t.Context(), slug)

		if !errors.Is(err, gallery.ErrNotFound) {
			t.Fatalf("ошибка %v, ожидалась ErrNotFound", err)
		}
	})

	t.Run("кабинет остаётся доступен", func(t *testing.T) {
		account, err := store.Account(t.Context(), octocat.GitHubID)

		if err != nil || len(account.Recordings) != 1 {
			t.Fatalf("кабинет: %+v, ошибка %v, ожидалась одна запись", account, err)
		}
	})

	t.Run("свою запись можно удалить", func(t *testing.T) {
		err := store.DeleteRecording(t.Context(), octocat.GitHubID, "octocat-0")
		if err != nil {
			t.Fatalf("удаление своей записи: %v", err)
		}
	})
}

func TestBlockedUserKeepsBlockAfterLoginChange(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 0)
	blockAuthor(t, store, octocat.Login)
	renamed := gallery.User{GitHubID: octocat.GitHubID, Login: "renamed"}
	if err := store.SaveUser(t.Context(), renamed); err != nil {
		t.Fatalf("смена логина: %v", err)
	}

	_, _, err := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, "new", 5, `[]`))

	if !errors.Is(err, gallery.ErrBlocked) {
		t.Fatalf("ошибка %v, ожидалась ErrBlocked", err)
	}
}

func TestUnblockedUserIsServedAgain(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 1)
	slug := slugOf(t, store, octocat)
	blockAuthor(t, store, octocat.Login)
	unblockAuthor(t, store, octocat.Login)

	_, galleryErr := store.PublicGallery(t.Context(), octocat.Login)
	_, sharedErr := store.SharedRecording(t.Context(), slug)
	_, _, saveErr := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, "new", 5, `[]`))

	if galleryErr != nil || sharedErr != nil || saveErr != nil {
		t.Fatalf("после снятия блокировки: галерея %v, запись по ссылке %v, загрузка %v", galleryErr, sharedErr, saveErr)
	}
}

func TestBlockingOneUserLeavesOthers(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 1)
	neighbor := gallery.User{GitHubID: 2, Login: "neighbor"}
	saveAuthor(t, store, neighbor, true, 1)
	blockAuthor(t, store, octocat.Login)

	_, err := store.PublicGallery(t.Context(), neighbor.Login)
	if err != nil {
		t.Fatalf("галерея соседа: %v", err)
	}
}

func TestSetUserBlocked(t *testing.T) {
	tests := []struct {
		name    string
		login   string
		wantErr error
	}{
		{"логин как сохранён", "octocat", nil},
		{"логин в другом регистре", "OCTOCAT", nil},
		{"нет такого автора", "missing", gallery.ErrNotFound},
		{"пустой логин", "", gallery.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newTestStore(t)
			saveAuthor(t, store, octocat, true, 0)

			err := store.SetUserBlocked(t.Context(), tt.login, true)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ошибка %v, ожидалась %v", err, tt.wantErr)
			}
			_, galleryErr := store.PublicGallery(t.Context(), octocat.Login)
			isHidden := errors.Is(galleryErr, gallery.ErrNotFound)
			wantHidden := tt.wantErr == nil
			if isHidden != wantHidden {
				t.Fatalf("галерея скрыта: %v, ожидалось %v", isHidden, wantHidden)
			}
		})
	}
}

func TestDeleteSharedRecording(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, false, 1)
	stranger := gallery.User{GitHubID: 2, Login: "stranger"}
	saveAuthor(t, store, stranger, false, 1)
	slug := slugOf(t, store, octocat)

	err := store.DeleteSharedRecording(t.Context(), slug)
	if err != nil {
		t.Fatalf("удаление по ссылке: %v", err)
	}
	if _, err := store.SharedRecording(t.Context(), slug); !errors.Is(err, gallery.ErrNotFound) {
		t.Fatalf("запись по ссылке после удаления: ошибка %v, ожидалась ErrNotFound", err)
	}
	if strangerSlug := slugOf(t, store, stranger); strangerSlug == "" {
		t.Fatalf("запись чужого автора пропала")
	}
}

func TestDeleteSharedRecordingTwice(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, false, 1)
	slug := slugOf(t, store, octocat)
	if err := store.DeleteSharedRecording(t.Context(), slug); err != nil {
		t.Fatalf("первое удаление по ссылке: %v", err)
	}

	err := store.DeleteSharedRecording(t.Context(), slug)

	if !errors.Is(err, gallery.ErrNotFound) {
		t.Fatalf("повторное удаление: ошибка %v, ожидалась ErrNotFound", err)
	}
}

func TestDeleteSharedRecordingMissing(t *testing.T) {
	store := newTestStore(t)

	err := store.DeleteSharedRecording(t.Context(), "nosuchslug00")

	if !errors.Is(err, gallery.ErrNotFound) {
		t.Fatalf("ошибка %v, ожидалась ErrNotFound", err)
	}
}
