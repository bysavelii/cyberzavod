package store

import (
	"errors"
	"fmt"
	"os"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bysavelii/cyberzavod/apps/api/internal/db"
	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

// newTestStore is newLimitedTestStore with the production storage cap.
func newTestStore(t *testing.T) *Store {
	t.Helper()

	return newLimitedTestStore(t, gallery.StorageLimitBytes)
}

// newLimitedTestStore connects to Postgres from TEST_DATABASE_URL, applies migrations,
// clears the gallery and session tables and returns a store with the cap storageLimitBytes.
// Without the variable the test is skipped: the store is tested only against a real Postgres,
// a fake would catch neither the SQL nor the race for the limit.
func newLimitedTestStore(t *testing.T, storageLimitBytes int64) *Store {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL не задан: тесты хранилища идут только на настоящем Postgres")
	}

	if err := db.Migrate(t.Context(), url); err != nil {
		t.Fatalf("миграции: %v", err)
	}

	pool, err := db.Connect(t.Context(), url)
	if err != nil {
		t.Fatalf("подключение: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(t.Context(), `TRUNCATE users, recordings, sessions`); err != nil {
		t.Fatalf("очистка таблиц: %v", err)
	}

	return New(pool, storageLimitBytes)
}

// sessionStart is the start of the first test session; the next ones start an hour later.
var sessionStart = time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC)

// testRecording builds a session recording with events events (a JSON array) starting
// hour hours after sessionStart.
func testRecording(t *testing.T, id string, hour int, events string) gallery.Recording {
	t.Helper()

	startedAt := sessionStart.Add(time.Duration(hour) * time.Hour)
	body := fmt.Sprintf(
		`{"version":1,"type":"session","id":%q,"timestamp":%q,"projectId":"lab","source":{"type":"manual"},`+
			`"data":{"title":"Запись %s","language":"ru","workflow":"default","harness":"0.6.0","events":%s}}`,
		id, startedAt.Format(time.RFC3339Nano), id, events)

	recording, err := gallery.ParseRecording([]byte(body))
	if err != nil {
		t.Fatalf("тестовая запись %s: %v", id, err)
	}

	return recording
}

// saveAuthor creates an author with count recordings and makes their gallery public or private.
func saveAuthor(t *testing.T, store *Store, user gallery.User, isPublic bool, count int) {
	t.Helper()

	if err := store.SaveUser(t.Context(), user); err != nil {
		t.Fatalf("автор %s: %v", user.Login, err)
	}

	if err := store.SetGalleryPublic(t.Context(), user.GitHubID, isPublic); err != nil {
		t.Fatalf("видимость галереи %s: %v", user.Login, err)
	}

	for number := range count {
		recording := testRecording(t, fmt.Sprintf("%s-%d", user.Login, number), number, `[]`)
		if _, _, err := store.SaveRecording(t.Context(), user.GitHubID, recording); err != nil {
			t.Fatalf("запись %s: %v", recording.ID, err)
		}
	}
}

var octocat = gallery.User{GitHubID: 1, Login: "octocat"}

func TestSaveRecording(t *testing.T) {
	tests := []struct {
		name      string
		stored    int
		id        string
		wantNew   bool
		wantErr   error
		wantCount int
	}{
		{"новая запись в пустую галерею", 0, "new", true, nil, 1},
		{"пятая запись помещается", 4, "new", true, nil, 5},
		{"шестая запись не помещается", 5, "new", false, gallery.ErrLimitReached, 5},
		{"замена при полной галерее", 5, "octocat-2", false, nil, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newTestStore(t)
			saveAuthor(t, store, octocat, false, tt.stored)

			_, isNew, err := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, tt.id, 9, `[]`))

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ошибка %v, ожидалась %v", err, tt.wantErr)
			}
			if isNew != tt.wantNew {
				t.Fatalf("новая: %v, ожидалось %v", isNew, tt.wantNew)
			}
			account, err := store.Account(t.Context(), octocat.GitHubID)
			if err != nil {
				t.Fatalf("галерея автора: %v", err)
			}
			if len(account.Recordings) != tt.wantCount {
				t.Fatalf("записей %d, ожидалось %d", len(account.Recordings), tt.wantCount)
			}
		})
	}
}

func TestSaveRecordingKeepsSlug(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, false, 0)
	first, _, err := store.SaveRecording(t.Context(), octocat.GitHubID, testRecording(t, "same", 0, `[]`))
	if err != nil {
		t.Fatalf("первая загрузка: %v", err)
	}
	replacement := testRecording(t, "same", 1, `[{"t":0,"type":"build_start"}]`)
	replacement.Title = "Новое название"

	second, isNew, err := store.SaveRecording(t.Context(), octocat.GitHubID, replacement)
	if err != nil {
		t.Fatalf("повторная загрузка: %v", err)
	}
	if isNew {
		t.Fatalf("повторная загрузка посчитана новой записью")
	}
	if second.Slug != first.Slug {
		t.Fatalf("ссылка сменилась: %q → %q", first.Slug, second.Slug)
	}
	if second.Title != "Новое название" || !second.StartedAt.Equal(replacement.StartedAt) {
		t.Fatalf("запись не заменена: %+v", second)
	}
}

// parallelUploads is how many new recordings are uploaded at once to a gallery with one free
// slot; raceRounds is how many times the race is repeated on different authors. Overlapping uploads
// are not guaranteed, so without the lock the test catches extra recordings not in every round,
// but almost certainly in at least one.
const (
	parallelUploads = 8
	raceRounds      = 5
)

// warmPool opens all pool connections in advance. Otherwise each concurrent upload first
// connects to the database, the uploads spread out in time and do not overlap.
func warmPool(t *testing.T, store *Store) {
	t.Helper()

	connections := []*pgxpool.Conn{}
	for range store.pool.Config().MaxConns {
		connection, err := store.pool.Acquire(t.Context())
		if err != nil {
			t.Fatalf("соединение с базой: %v", err)
		}

		connections = append(connections, connection)
	}

	for _, connection := range connections {
		connection.Release()
	}
}

// uploadInParallel uploads parallelUploads new recordings of an author at once.
func uploadInParallel(t *testing.T, store *Store, owner gallery.User) []error {
	t.Helper()

	errs := make([]error, parallelUploads)
	start := make(chan struct{})
	var uploads sync.WaitGroup
	for index := range parallelUploads {
		recording := testRecording(t, fmt.Sprintf("parallel-%d", index), 10+index, `[]`)
		uploads.Go(func() {
			<-start
			_, _, errs[index] = store.SaveRecording(t.Context(), owner.GitHubID, recording)
		})
	}

	warmPool(t, store)
	close(start)
	uploads.Wait()

	return errs
}

func TestSaveRecordingConcurrentLimit(t *testing.T) {
	store := newTestStore(t)
	for round := range raceRounds {
		t.Run(fmt.Sprintf("раунд %d", round), func(t *testing.T) {
			owner := gallery.User{GitHubID: int64(round + 1), Login: fmt.Sprintf("racer-%d", round)}
			saveAuthor(t, store, owner, false, gallery.RecordingLimit-1)

			errs := uploadInParallel(t, store, owner)

			for _, err := range errs {
				isExpected := err == nil || errors.Is(err, gallery.ErrLimitReached)
				if !isExpected {
					t.Fatalf("загрузка: %v", err)
				}
			}
			account, err := store.Account(t.Context(), owner.GitHubID)
			if err != nil {
				t.Fatalf("галерея автора: %v", err)
			}
			if len(account.Recordings) != gallery.RecordingLimit {
				t.Fatalf("записей %d, ожидалось %d", len(account.Recordings), gallery.RecordingLimit)
			}
		})
	}
}

func TestAccountOrdersRecordings(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, false, 3)

	account, err := store.Account(t.Context(), octocat.GitHubID)
	if err != nil {
		t.Fatalf("галерея автора: %v", err)
	}
	got := []string{}
	for _, summary := range account.Recordings {
		got = append(got, summary.ID)
	}
	want := []string{"octocat-2", "octocat-1", "octocat-0"}
	if !slices.Equal(got, want) {
		t.Fatalf("порядок %v, ожидался %v: свежие сверху", got, want)
	}
}

func TestDeleteRecording(t *testing.T) {
	stranger := gallery.User{GitHubID: 2, Login: "stranger"}
	tests := []struct {
		name    string
		ownerID int64
		id      string
		wantErr error
	}{
		{"своя запись", octocat.GitHubID, "octocat-0", nil},
		{"нет такой записи", octocat.GitHubID, "missing", gallery.ErrNotFound},
		{"чужая запись", stranger.GitHubID, "octocat-0", gallery.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newTestStore(t)
			saveAuthor(t, store, octocat, false, 1)
			saveAuthor(t, store, stranger, false, 0)

			err := store.DeleteRecording(t.Context(), tt.ownerID, tt.id)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ошибка %v, ожидалась %v", err, tt.wantErr)
			}
		})
	}
}

func TestSaveUserTakesOverLogin(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 1)
	newcomer := gallery.User{GitHubID: 2, Login: "OctoCat"}
	saveAuthor(t, store, newcomer, true, 0)

	gallery, err := store.PublicGallery(t.Context(), "octocat")
	if err != nil {
		t.Fatalf("галерея по логину: %v", err)
	}
	if gallery.Login != "OctoCat" || len(gallery.Recordings) != 0 {
		t.Fatalf("галерея %+v, ожидалась галерея нового владельца логина", gallery)
	}
}

func TestClosedGalleryIsHidden(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 2)
	hidden := gallery.User{GitHubID: 2, Login: "hidden"}
	saveAuthor(t, store, hidden, false, 3)

	_, err := store.PublicGallery(t.Context(), hidden.Login)

	if !errors.Is(err, gallery.ErrNotFound) {
		t.Fatalf("закрытая галерея: ошибка %v, ожидалась ErrNotFound", err)
	}
}

func TestSharedRecording(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, false, 0)
	recording := testRecording(t, "shared", 0, `[]`)
	summary, _, err := store.SaveRecording(t.Context(), octocat.GitHubID, recording)
	if err != nil {
		t.Fatalf("загрузка: %v", err)
	}

	shared, err := store.SharedRecording(t.Context(), summary.Slug)
	if err != nil {
		t.Fatalf("запись по ссылке: %v", err)
	}
	if shared.Owner != octocat.Login || shared.GalleryPublic {
		t.Fatalf("запись %+v, ожидалась закрытая запись octocat", shared)
	}
	parsed, err := gallery.ParseRecording(shared.Record)
	if err != nil || parsed.ID != "shared" {
		t.Fatalf("тело записи %s не то, что загружено: %v", shared.Record, err)
	}
}

func TestSharedRecordingMissing(t *testing.T) {
	store := newTestStore(t)

	_, err := store.SharedRecording(t.Context(), "nosuchslug00")

	if !errors.Is(err, gallery.ErrNotFound) {
		t.Fatalf("ошибка %v, ожидалась ErrNotFound", err)
	}
}

func TestEmptyListsAreNotNil(t *testing.T) {
	store := newTestStore(t)
	saveAuthor(t, store, octocat, true, 0)

	account, err := store.Account(t.Context(), octocat.GitHubID)
	if err != nil {
		t.Fatalf("галерея: %v", err)
	}
	if account.Recordings == nil {
		t.Fatalf("пустой список должен уходить в JSON как [], а не null: %+v", account)
	}
}

// storedBytes returns how many bytes the recording body will take in the store.
func storedBytes(t *testing.T, store *Store, recording gallery.Recording) int64 {
	t.Helper()

	var size int64
	err := store.pool.QueryRow(t.Context(), `SELECT octet_length($1::jsonb::text)`, recording.Body).Scan(&size)
	if err != nil {
		t.Fatalf("размер записи %s: %v", recording.ID, err)
	}

	return size
}

func TestSaveRecordingStorageLimit(t *testing.T) {
	const bigEvents = `[{"t":0,"type":"build_start"},{"t":1,"type":"build_end"}]`
	tests := []struct {
		name      string
		upload    func(t *testing.T) gallery.Recording
		limit     func(stored, uploaded int64) int64
		wantErr   error
		wantBytes func(stored, uploaded int64) int64
	}{
		{
			"новая запись помещается ровно",
			func(t *testing.T) gallery.Recording { return testRecording(t, "other", 1, `[]`) },
			func(stored, uploaded int64) int64 { return stored + uploaded },
			nil,
			func(stored, uploaded int64) int64 { return stored + uploaded },
		},
		{
			"новая запись не помещается",
			func(t *testing.T) gallery.Recording { return testRecording(t, "other", 1, `[]`) },
			func(stored, uploaded int64) int64 { return stored + uploaded - 1 },
			gallery.ErrStorageFull,
			func(stored, _ int64) int64 { return stored },
		},
		{
			"замена такой же при переполнении",
			func(t *testing.T) gallery.Recording { return testRecording(t, "stored", 0, bigEvents) },
			func(stored, _ int64) int64 { return stored - 1 },
			nil,
			func(stored, _ int64) int64 { return stored },
		},
		{
			"замена меньшей при переполнении",
			func(t *testing.T) gallery.Recording { return testRecording(t, "stored", 0, `[]`) },
			func(int64, int64) int64 { return 1 },
			nil,
			func(_, uploaded int64) int64 { return uploaded },
		},
		{
			"замена большей сверх потолка",
			func(t *testing.T) gallery.Recording {
				return testRecording(t, "stored", 0, `[{"t":0,"type":"build_start"},{"t":1,"type":"build_end"},{"t":2,"type":"build_end"}]`)
			},
			func(stored, _ int64) int64 { return stored },
			gallery.ErrStorageFull,
			func(stored, _ int64) int64 { return stored },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seeded := newTestStore(t)
			saveAuthor(t, seeded, octocat, false, 0)
			stored := testRecording(t, "stored", 0, bigEvents)
			if _, _, err := seeded.SaveRecording(t.Context(), octocat.GitHubID, stored); err != nil {
				t.Fatalf("первая запись: %v", err)
			}
			uploaded := tt.upload(t)
			storedSize := storedBytes(t, seeded, stored)
			uploadedSize := storedBytes(t, seeded, uploaded)
			limited := New(seeded.pool, tt.limit(storedSize, uploadedSize))

			_, _, err := limited.SaveRecording(t.Context(), octocat.GitHubID, uploaded)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ошибка %v, ожидалась %v", err, tt.wantErr)
			}
			var totalBytes int64
			if err := seeded.pool.QueryRow(t.Context(), `SELECT sum(body_bytes) FROM recordings`).Scan(&totalBytes); err != nil {
				t.Fatalf("объём хранилища: %v", err)
			}
			if want := tt.wantBytes(storedSize, uploadedSize); totalBytes != want {
				t.Fatalf("в хранилище %d байт, ожидалось %d", totalBytes, want)
			}
		})
	}
}
