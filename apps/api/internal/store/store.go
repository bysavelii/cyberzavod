// Package store keeps galleries in Postgres: authors and their recordings.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bysavelii/cyberzavod/apps/api/internal/gallery"
)

const (
	queryTimeout = 5 * time.Second
	// storageLockKey is the key of the Postgres advisory lock under which all authors' uploads
	// check the total size against the cap one at a time. The number is arbitrary, just unique.
	storageLockKey int64 = 0x637a_7374_6f72_6167
)

// Store holds the galleries in Postgres. Each method is limited by queryTimeout.
type Store struct {
	pool *pgxpool.Pool
	// storageLimitBytes is the cap on the total size of recording bodies across all galleries.
	storageLimitBytes int64
}

// New creates a gallery store on top of a connection pool, with a cap of storageLimitBytes on
// the total body size of all galleries' recordings (in production, gallery.StorageLimitBytes).
func New(pool *pgxpool.Pool, storageLimitBytes int64) *Store {
	return &Store{pool: pool, storageLimitBytes: storageLimitBytes}
}

const summaryColumns = `record_id, slug, project_id, title, language, started_at, uploaded_at`

// SaveUser creates an author or updates their login: the GitHub login can change.
func (s *Store) SaveUser(ctx context.Context, user gallery.User) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := releaseLogin(ctx, tx, user); err != nil {
			return err
		}

		return upsertUser(ctx, tx, user)
	})
	if err != nil {
		return fmt.Errorf("сохранение автора: %w", err)
	}

	return nil
}

// releaseLogin takes the login away from another author who has it recorded. This happens when
// that author changed their GitHub login and someone else took the old one. The previous owner gets
// the label "#<id>": GitHub has no such login, and the real one comes back when they sign in.
func releaseLogin(ctx context.Context, tx pgx.Tx, user gallery.User) error {
	_, err := tx.Exec(ctx, `
		UPDATE users SET login = '#' || github_id::text, updated_at = now()
		WHERE lower(login) = lower($2) AND github_id <> $1`,
		user.GitHubID, user.Login)
	if err != nil {
		return fmt.Errorf("освобождение логина: %w", err)
	}

	return nil
}

func upsertUser(ctx context.Context, tx pgx.Tx, user gallery.User) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO users (github_id, login) VALUES ($1, $2)
		ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login, updated_at = now()
		WHERE users.login <> EXCLUDED.login`,
		user.GitHubID, user.Login)
	if err != nil {
		return fmt.Errorf("запись автора: %w", err)
	}

	return nil
}

// Account returns the author's gallery with their recordings, newest first.
// If the author does not exist, it returns gallery.ErrNotFound.
func (s *Store) Account(ctx context.Context, ownerID int64) (gallery.Account, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	var account gallery.Account
	err := s.pool.QueryRow(ctx,
		`SELECT login, gallery_public FROM users WHERE github_id = $1`, ownerID,
	).Scan(&account.Login, &account.GalleryPublic)
	if errors.Is(err, pgx.ErrNoRows) {
		return gallery.Account{}, gallery.ErrNotFound
	}

	if err != nil {
		return gallery.Account{}, fmt.Errorf("чтение автора: %w", err)
	}

	recordings, err := s.recordings(ctx, ownerID)
	if err != nil {
		return gallery.Account{}, err
	}

	account.Recordings = recordings

	return account, nil
}

// recordings returns the author's recordings, newest first.
func (s *Store) recordings(ctx context.Context, ownerID int64) ([]gallery.Summary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+summaryColumns+` FROM recordings
		WHERE owner_id = $1
		ORDER BY started_at DESC, record_id`,
		ownerID)
	if err != nil {
		return nil, fmt.Errorf("чтение записей автора: %w", err)
	}

	summaries, err := pgx.CollectRows(rows, pgx.RowToStructByPos[gallery.Summary])
	if err != nil {
		return nil, fmt.Errorf("чтение записей автора: %w", err)
	}

	return summaries, nil
}

// SaveRecording puts a recording into the author's gallery or replaces it if one with the same id
// is there. isNew means the recording is new. A new recording beyond gallery.RecordingLimit gives
// gallery.ErrLimitReached; one that grew past the storage cap gives gallery.ErrStorageFull.
func (s *Store) SaveRecording(ctx context.Context, ownerID int64, recording gallery.Recording) (summary gallery.Summary, isNew bool, err error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		summary, isNew, err = s.saveRecording(ctx, tx, ownerID, recording)
		return err
	})
	if err != nil {
		return gallery.Summary{}, false, fmt.Errorf("сохранение записи: %w", err)
	}

	return summary, isNew, nil
}

// saveRecording saves a recording under a lock on the author's row: concurrent uploads by
// one author go one at a time and do not exceed the limit together.
func (s *Store) saveRecording(ctx context.Context, tx pgx.Tx, ownerID int64, recording gallery.Recording) (gallery.Summary, bool, error) {
	if err := lockOwner(ctx, tx, ownerID); err != nil {
		return gallery.Summary{}, false, err
	}

	previousBytes, err := recordingBytes(ctx, tx, ownerID, recording.ID)
	if err != nil {
		return gallery.Summary{}, false, err
	}

	slug, isNew, err := slugForRecording(ctx, tx, ownerID, recording.ID)
	if err != nil {
		return gallery.Summary{}, false, err
	}

	summary, savedBytes, err := upsertRecording(ctx, tx, ownerID, slug, recording)
	if err != nil {
		return gallery.Summary{}, false, err
	}

	hasGrown := savedBytes > previousBytes
	if hasGrown {
		if err := s.ensureStorage(ctx, tx); err != nil {
			return gallery.Summary{}, false, err
		}
	}

	return summary, isNew, nil
}

// lockOwner locks the author's row until the end of the transaction and checks the account is not
// blocked: reading the flag under the same lock means a block set during an upload is not missed.
// A blocked author gives gallery.ErrBlocked.
func lockOwner(ctx context.Context, tx pgx.Tx, ownerID int64) error {
	var isBlocked bool
	err := tx.QueryRow(ctx, `SELECT blocked FROM users WHERE github_id = $1 FOR UPDATE`, ownerID).Scan(&isBlocked)
	if errors.Is(err, pgx.ErrNoRows) {
		return gallery.ErrNotFound
	}

	if err != nil {
		return fmt.Errorf("блокировка автора: %w", err)
	}

	if isBlocked {
		return gallery.ErrBlocked
	}

	return nil
}

// slugForRecording returns the link of an already stored recording or issues a new one if
// the gallery has room.
func slugForRecording(ctx context.Context, tx pgx.Tx, ownerID int64, recordID string) (slug string, isNew bool, err error) {
	err = tx.QueryRow(ctx,
		`SELECT slug FROM recordings WHERE owner_id = $1 AND record_id = $2`, ownerID, recordID,
	).Scan(&slug)
	if err == nil {
		return slug, false, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, fmt.Errorf("поиск записи: %w", err)
	}

	if err := ensureRoom(ctx, tx, ownerID); err != nil {
		return "", false, err
	}

	slug, err = gallery.NewSlug()

	return slug, true, err
}

// ensureRoom checks that the author's gallery has room for a new recording.
func ensureRoom(ctx context.Context, tx pgx.Tx, ownerID int64) error {
	var count int
	err := tx.QueryRow(ctx, `SELECT count(*) FROM recordings WHERE owner_id = $1`, ownerID).Scan(&count)
	if err != nil {
		return fmt.Errorf("подсчёт записей: %w", err)
	}

	if count >= gallery.RecordingLimit {
		return gallery.ErrLimitReached
	}

	return nil
}

// recordingBytes returns the body size of an already stored recording; 0 for a new one.
func recordingBytes(ctx context.Context, tx pgx.Tx, ownerID int64, recordID string) (int64, error) {
	var size int64
	err := tx.QueryRow(ctx,
		`SELECT body_bytes FROM recordings WHERE owner_id = $1 AND record_id = $2`, ownerID, recordID,
	).Scan(&size)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}

	if err != nil {
		return 0, fmt.Errorf("размер записи: %w", err)
	}

	return size, nil
}

// savedRecording is a recording row after saving: the summary and the body size.
type savedRecording struct {
	gallery.Summary
	BodyBytes int64
}

// upsertRecording writes a recording and returns its summary and body size; a replaced recording
// keeps its link. Postgres computes the size with the same expression as the migration.
func upsertRecording(ctx context.Context, tx pgx.Tx, ownerID int64, slug string, recording gallery.Recording) (gallery.Summary, int64, error) {
	rows, err := tx.Query(ctx, `
		INSERT INTO recordings
			(owner_id, record_id, slug, project_id, title, language, started_at, body, body_bytes, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, octet_length($8::jsonb::text), now())
		ON CONFLICT (owner_id, record_id) DO UPDATE SET
			project_id = EXCLUDED.project_id,
			title = EXCLUDED.title,
			language = EXCLUDED.language,
			started_at = EXCLUDED.started_at,
			body = EXCLUDED.body,
			body_bytes = EXCLUDED.body_bytes,
			uploaded_at = EXCLUDED.uploaded_at
		RETURNING `+summaryColumns+`, body_bytes`,
		ownerID, recording.ID, slug, recording.ProjectID, recording.Title, recording.Language,
		recording.StartedAt, recording.Body)
	if err != nil {
		return gallery.Summary{}, 0, fmt.Errorf("запись в галерею: %w", err)
	}

	saved, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[savedRecording])
	if err != nil {
		return gallery.Summary{}, 0, fmt.Errorf("запись в галерею: %w", err)
	}

	return saved.Summary, saved.BodyBytes, nil
}

// ensureStorage checks that all galleries' recording bodies, the new one included, stay under
// the cap. An advisory lock until the end of the transaction queues uploads of different authors:
// otherwise two concurrent uploads together would step over the cap.
func (s *Store) ensureStorage(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, storageLockKey); err != nil {
		return fmt.Errorf("блокировка хранилища: %w", err)
	}

	var totalBytes int64
	if err := tx.QueryRow(ctx, `SELECT coalesce(sum(body_bytes), 0) FROM recordings`).Scan(&totalBytes); err != nil {
		return fmt.Errorf("подсчёт объёма хранилища: %w", err)
	}

	if totalBytes > s.storageLimitBytes {
		return gallery.ErrStorageFull
	}

	return nil
}

// DeleteRecording removes a recording from the author's gallery. Missing: gallery.ErrNotFound.
func (s *Store) DeleteRecording(ctx context.Context, ownerID int64, recordID string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tag, err := s.pool.Exec(ctx,
		`DELETE FROM recordings WHERE owner_id = $1 AND record_id = $2`, ownerID, recordID)
	if err != nil {
		return fmt.Errorf("удаление записи: %w", err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("удаление записи: %w", gallery.ErrNotFound)
	}

	return nil
}

// SetGalleryPublic makes the author's gallery public or private. No author: gallery.ErrNotFound.
func (s *Store) SetGalleryPublic(ctx context.Context, ownerID int64, isPublic bool) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET gallery_public = $2, updated_at = now() WHERE github_id = $1`,
		ownerID, isPublic)
	if err != nil {
		return fmt.Errorf("смена видимости галереи: %w", err)
	}

	if tag.RowsAffected() == 0 {
		return gallery.ErrNotFound
	}

	return nil
}

// SetUserBlocked blocks or unblocks the author with the given login, case-insensitively. A blocked
// author keeps their recordings, but their gallery and recordings are not served and they cannot
// upload. No such author: gallery.ErrNotFound.
func (s *Store) SetUserBlocked(ctx context.Context, login string, isBlocked bool) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET blocked = $2, updated_at = now() WHERE lower(login) = lower($1)`,
		login, isBlocked)
	if err != nil {
		return fmt.Errorf("смена блокировки автора: %w", err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("смена блокировки автора: %w", gallery.ErrNotFound)
	}

	return nil
}

// DeleteSharedRecording removes any author's recording by its secret link; the site owner uses
// it. No such link: gallery.ErrNotFound.
func (s *Store) DeleteSharedRecording(ctx context.Context, slug string) error {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tag, err := s.pool.Exec(ctx, `DELETE FROM recordings WHERE slug = $1`, slug)
	if err != nil {
		return fmt.Errorf("удаление записи по ссылке: %w", err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("удаление записи по ссылке: %w", gallery.ErrNotFound)
	}

	return nil
}

// PublicGallery returns a public gallery by login, case-insensitively.
// A private, blocked or nonexistent gallery gives gallery.ErrNotFound: an outsider cannot tell
// them apart.
func (s *Store) PublicGallery(ctx context.Context, login string) (gallery.Gallery, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	var (
		ownerID    int64
		ownerLogin string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT github_id, login FROM users WHERE lower(login) = lower($1) AND gallery_public AND NOT blocked`, login,
	).Scan(&ownerID, &ownerLogin)
	if errors.Is(err, pgx.ErrNoRows) {
		return gallery.Gallery{}, gallery.ErrNotFound
	}

	if err != nil {
		return gallery.Gallery{}, fmt.Errorf("чтение галереи: %w", err)
	}

	recordings, err := s.recordings(ctx, ownerID)
	if err != nil {
		return gallery.Gallery{}, err
	}

	return gallery.Gallery{Login: ownerLogin, Recordings: recordings}, nil
}

// SharedRecording returns a recording by its secret link. No such link or a blocked author:
// gallery.ErrNotFound.
func (s *Store) SharedRecording(ctx context.Context, slug string) (gallery.SharedRecording, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	var shared gallery.SharedRecording
	err := s.pool.QueryRow(ctx, `
		SELECT u.login, u.gallery_public, r.body
		FROM recordings r
		JOIN users u ON u.github_id = r.owner_id
		WHERE r.slug = $1 AND NOT u.blocked`,
		slug,
	).Scan(&shared.Owner, &shared.GalleryPublic, &shared.Record)
	if errors.Is(err, pgx.ErrNoRows) {
		return gallery.SharedRecording{}, gallery.ErrNotFound
	}

	if err != nil {
		return gallery.SharedRecording{}, fmt.Errorf("чтение записи по ссылке: %w", err)
	}

	return shared, nil
}
