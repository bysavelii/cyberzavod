// Package gallery describes recording galleries: who their author is, what they hold and what
// a visitor with the gallery link sees. It knows nothing about the database or HTTP, only its own types.
package gallery

import (
	"encoding/json"
	"errors"
	"time"
)

const (
	// RecordingLimit is how many recordings one author's gallery can hold.
	RecordingLimit = 5
	// StorageLimitBytes is how many bytes of recording bodies all galleries together can take:
	// the cap keeps anyone from deliberately filling the server disk with many authors.
	StorageLimitBytes int64 = 2 << 30
)

var (
	// ErrNotFound means there is no such recording, gallery or author, or the gallery is private
	// to outsiders.
	ErrNotFound = errors.New("не найдено")
	// ErrLimitReached means the gallery already has RecordingLimit recordings; a new one does
	// not fit.
	ErrLimitReached = errors.New("достигнут предел записей в галерее")
	// ErrStorageFull means a new recording does not fit under the shared StorageLimitBytes cap.
	ErrStorageFull = errors.New("хранилище галерей заполнено")
	// ErrTokenRejected means GitHub did not accept the author's token.
	ErrTokenRejected = errors.New("GitHub не принял токен")
	// ErrBlocked means the site owner blocked the author's account: it cannot upload recordings.
	ErrBlocked = errors.New("аккаунт заблокирован владельцем сайта")
)

// User is a gallery author: a GitHub account. The key is GitHubID; the login can change.
type User struct {
	GitHubID int64
	Login    string
}

// Recording is a session recording the author uploaded to the gallery: envelope fields for lists
// and the whole recording body.
type Recording struct {
	ID        string
	ProjectID string
	Title     string
	Language  string
	StartedAt time.Time
	Body      json.RawMessage
}

// Summary is a recording in a gallery list: without the body, with a slug link.
type Summary struct {
	ID         string    `json:"id"`
	Slug       string    `json:"slug"`
	ProjectID  string    `json:"projectId"`
	Title      string    `json:"title"`
	Language   string    `json:"language"`
	StartedAt  time.Time `json:"startedAt"`
	UploadedAt time.Time `json:"uploadedAt"`
}

// Account is a gallery as its author sees it: whether it is public, and all their recordings.
type Account struct {
	Login         string
	GalleryPublic bool
	Recordings    []Summary
}

// Gallery is a public gallery opened by its link, as a visitor sees it.
type Gallery struct {
	Login      string    `json:"login"`
	Recordings []Summary `json:"recordings"`
}

// SharedRecording is a recording opened by a secret link: whose it is and the body as uploaded.
type SharedRecording struct {
	Owner         string          `json:"owner"`
	GalleryPublic bool            `json:"galleryPublic"`
	Record        json.RawMessage `json:"record"`
}
