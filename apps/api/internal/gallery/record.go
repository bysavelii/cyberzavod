package gallery

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"
)

const sessionType = "session"

// InvalidRecordError means the recording failed the envelope or field length check; Reason explains
// why.
type InvalidRecordError struct {
	Reason string
}

func (e *InvalidRecordError) Error() string {
	return "запись не прошла проверку: " + e.Reason
}

// envelope is what the server checks in a recording: the required fields and the lengths of the
// text fields. The full format check is done by the TypeScript core in the CLI and in the browser;
// there is no second format description here.
type envelope struct {
	Type      *string `json:"type"`
	ID        *string `json:"id"`
	ProjectID *string `json:"projectId"`
	SessionID *string `json:"sessionId"`
	Timestamp *string `json:"timestamp"`
	Source    *struct {
		Provider *string `json:"provider"`
		Agent    *string `json:"agent"`
	} `json:"source"`
	Data *struct {
		Title    *string       `json:"title"`
		Language *string       `json:"language"`
		Workflow *string       `json:"workflow"`
		Harness  *string       `json:"harness"`
		Task     *string       `json:"task"`
		Events   *[]eventTexts `json:"events"`
	} `json:"data"`
}

// eventTexts are the text fields of a session event, whatever its type: the rest is not parsed.
type eventTexts struct {
	Goal         *string   `json:"goal"`
	Requirements []*string `json:"requirements"`
	Model        *string   `json:"model"`
	Line         *string   `json:"line"`
	Text         *string   `json:"text"`
	Reason       *string   `json:"reason"`
}

// ParseRecording checks the session recording envelope and extracts the fields for lists from it.
// The recording body is stored as received.
//
// Returns *InvalidRecordError if the body is not a JSON object, the record is not a session, it
// lacks required fields or a text field is longer than its limit.
func ParseRecording(body []byte) (Recording, error) {
	var parsed envelope
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Recording{}, decodeError(err)
	}

	if parsed.Type == nil || *parsed.Type != sessionType {
		return Recording{}, &InvalidRecordError{Reason: `type должен быть "session"`}
	}

	return recordingFromEnvelope(parsed, body)
}

func recordingFromEnvelope(parsed envelope, body []byte) (Recording, error) {
	if parsed.Data == nil {
		return Recording{}, &InvalidRecordError{Reason: "нет объекта data"}
	}

	if parsed.Data.Events == nil {
		return Recording{}, &InvalidRecordError{Reason: "data.events должен быть массивом"}
	}

	fields := []struct {
		name  string
		value *string
	}{
		{"id", parsed.ID},
		{"projectId", parsed.ProjectID},
		{"timestamp", parsed.Timestamp},
		{"data.title", parsed.Data.Title},
		{"data.language", parsed.Data.Language},
	}
	for _, field := range fields {
		if field.value == nil || *field.value == "" {
			return Recording{}, &InvalidRecordError{Reason: field.name + " должен быть непустой строкой"}
		}
	}

	startedAt, err := time.Parse(time.RFC3339Nano, *parsed.Timestamp)
	if err != nil {
		return Recording{}, &InvalidRecordError{Reason: "timestamp должен быть временем ISO 8601"}
	}

	if err := checkLengths(parsed); err != nil {
		return Recording{}, err
	}

	return Recording{
		ID:        *parsed.ID,
		ProjectID: *parsed.ProjectID,
		Title:     *parsed.Data.Title,
		Language:  *parsed.Data.Language,
		StartedAt: startedAt.UTC(),
		Body:      body,
	}, nil
}

// decodeError turns a JSON parse error into a clear rejection reason.
func decodeError(err error) error {
	var typeErr *json.UnmarshalTypeError
	if !errors.As(err, &typeErr) {
		return &InvalidRecordError{Reason: "тело не JSON"}
	}

	if typeErr.Field == "" {
		return &InvalidRecordError{Reason: "запись должна быть объектом JSON"}
	}

	return &InvalidRecordError{Reason: fmt.Sprintf("у поля %s неверный тип", typeErr.Field)}
}

// lengthCheck is a text field with its place in the recording and its limit.
type lengthCheck struct {
	path  string
	value *string
	limit int
}

// isWithinLimit reports whether the field is absent or not longer than its limit in code points.
func (check lengthCheck) isWithinLimit() bool {
	return check.value == nil || utf8.RuneCountInString(*check.value) <= check.limit
}

// checkLengths returns *InvalidRecordError for the first text field longer than its limit. Absent
// optional fields are skipped.
func checkLengths(parsed envelope) error {
	for _, check := range lengthChecks(parsed) {
		if check.isWithinLimit() {
			continue
		}

		reason := fmt.Sprintf("%s длиннее %d символов", check.path, check.limit)

		return &InvalidRecordError{Reason: reason}
	}

	return nil
}

func lengthChecks(parsed envelope) []lengthCheck {
	checks := []lengthCheck{
		{"id", parsed.ID, maxIDLength},
		{"projectId", parsed.ProjectID, maxIDLength},
		{"sessionId", parsed.SessionID, maxLineLength},
	}

	if parsed.Source != nil {
		checks = append(checks,
			lengthCheck{"source.provider", parsed.Source.Provider, maxLineLength},
			lengthCheck{"source.agent", parsed.Source.Agent, maxLineLength},
		)
	}

	checks = append(checks,
		lengthCheck{"data.title", parsed.Data.Title, maxLineLength},
		lengthCheck{"data.language", parsed.Data.Language, maxIDLength},
		lengthCheck{"data.workflow", parsed.Data.Workflow, maxLineLength},
		lengthCheck{"data.harness", parsed.Data.Harness, maxLineLength},
		lengthCheck{"data.task", parsed.Data.Task, maxIDLength},
	)

	for index, event := range *parsed.Data.Events {
		checks = append(checks, eventLengthChecks(fmt.Sprintf("data.events[%d]", index), event)...)
	}

	return checks
}

func eventLengthChecks(path string, event eventTexts) []lengthCheck {
	checks := []lengthCheck{
		{path + ".goal", event.Goal, maxLineLength},
		{path + ".model", event.Model, maxLineLength},
		{path + ".line", event.Line, maxLineLength},
		{path + ".text", event.Text, maxTextLength},
		{path + ".reason", event.Reason, maxLineLength},
	}

	for index, requirement := range event.Requirements {
		check := lengthCheck{fmt.Sprintf("%s.requirements[%d]", path, index), requirement, maxLineLength}
		checks = append(checks, check)
	}

	return checks
}
