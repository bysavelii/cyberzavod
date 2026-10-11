package gallery

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

// sessionJSON builds a session recording body; replace substitutes pieces of text in it.
func sessionJSON(replace ...string) string {
	body := `{"version":1,"type":"session","id":"2026-10-05-4365c610","timestamp":"2026-10-05T08:00:00.500Z",` +
		`"projectId":"lab","source":{"type":"manual"},` +
		`"data":{"title":"Галерея","language":"en","workflow":"default","harness":"0.6.0","events":[]}}`

	return strings.NewReplacer(replace...).Replace(body)
}

func TestParseRecording(t *testing.T) {
	body := []byte(sessionJSON())
	want := Recording{
		ID:        "2026-10-05-4365c610",
		ProjectID: "lab",
		Title:     "Галерея",
		Language:  "en",
		StartedAt: time.Date(2026, 10, 5, 8, 0, 0, 500_000_000, time.UTC),
		Body:      body,
	}

	recording, err := ParseRecording(body)
	if err != nil {
		t.Fatalf("запись отклонена: %v", err)
	}
	if !reflect.DeepEqual(recording, want) {
		t.Fatalf("получено %+v, ожидалось %+v", recording, want)
	}
}

func TestParseRecordingRejects(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"не JSON", `{"type":`},
		{"массив", `[1]`},
		{"null", `null`},
		{"решение вместо сессии", sessionJSON(`"type":"session"`, `"type":"decision"`)},
		{"без type", sessionJSON(`"type":"session",`, "")},
		{"id не строка", sessionJSON(`"id":"2026-10-05-4365c610"`, `"id":7`)},
		{"без id", sessionJSON(`"id":"2026-10-05-4365c610",`, "")},
		{"пустой projectId", sessionJSON(`"projectId":"lab"`, `"projectId":""`)},
		{"без timestamp", sessionJSON(`"timestamp":"2026-10-05T08:00:00.500Z",`, "")},
		{"timestamp не время", sessionJSON(`2026-10-05T08:00:00.500Z`, `вчера`)},
		{"data не объект", `{"type":"session","id":"a","projectId":"lab","timestamp":"2026-10-05T08:00:00Z","data":"x"}`},
		{"без data", `{"type":"session","id":"a","projectId":"lab","timestamp":"2026-10-05T08:00:00Z"}`},
		{"без title", sessionJSON(`"title":"Галерея",`, "")},
		{"без language", sessionJSON(`"language":"en",`, "")},
		{"language не строка", sessionJSON(`"language":"en"`, `"language":1`)},
		{"пустой language", sessionJSON(`"language":"en"`, `"language":""`)},
		{"events не массив", sessionJSON(`"events":[]`, `"events":{}`)},
		{"без events", sessionJSON(`,"events":[]`, "")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseRecording([]byte(tt.body))

			var invalid *InvalidRecordError
			if !errors.As(err, &invalid) {
				t.Fatalf("ошибка %v, ожидалась InvalidRecordError", err)
			}
		})
	}
}

// withEvents builds a session recording with the given events (JSON of the array contents).
func withEvents(events string) string {
	return sessionJSON(`"events":[]`, `"events":[`+events+`]`)
}

// withDataField adds a string field to the session data.
func withDataField(name, value string) string {
	return sessionJSON(`"harness":"0.6.0"`, `"harness":"0.6.0","`+name+`":"`+value+`"`)
}

func TestParseRecordingRejectsLongFields(t *testing.T) {
	longID := strings.Repeat("a", maxIDLength+1)
	longLine := strings.Repeat("a", maxLineLength+1)
	longText := strings.Repeat("a", maxTextLength+1)
	tests := []struct {
		name       string
		body       string
		wantReason string
	}{
		{"id", sessionJSON("2026-10-05-4365c610", longID), "id длиннее 100 символов"},
		{"projectId", sessionJSON(`"projectId":"lab"`, `"projectId":"`+longID+`"`), "projectId длиннее 100 символов"},
		{"sessionId", sessionJSON(`"projectId":"lab"`, `"projectId":"lab","sessionId":"`+longLine+`"`), "sessionId длиннее 500 символов"},
		{
			"source.provider",
			sessionJSON(`"source":{"type":"manual"}`, `"source":{"type":"agent","provider":"`+longLine+`","agent":"claude"}`),
			"source.provider длиннее 500 символов",
		},
		{
			"source.agent",
			sessionJSON(`"source":{"type":"manual"}`, `"source":{"type":"agent","provider":"anthropic","agent":"`+longLine+`"}`),
			"source.agent длиннее 500 символов",
		},
		{"data.title", sessionJSON("Галерея", longLine), "data.title длиннее 500 символов"},
		{"data.language", sessionJSON(`"language":"en"`, `"language":"`+longID+`"`), "data.language длиннее 100 символов"},
		{"data.workflow", sessionJSON(`"workflow":"default"`, `"workflow":"`+longLine+`"`), "data.workflow длиннее 500 символов"},
		{"data.harness", sessionJSON("0.6.0", longLine), "data.harness длиннее 500 символов"},
		{"data.task", withDataField("task", longID), "data.task длиннее 100 символов"},
		{
			"goal",
			withEvents(`{"t":1,"type":"prompt","goal":"` + longLine + `","requirements":[]}`),
			"data.events[0].goal длиннее 500 символов",
		},
		{
			"требование",
			withEvents(`{"t":0,"type":"build_start"},{"t":1,"type":"prompt","goal":"g","requirements":["ok","` + longLine + `"]}`),
			"data.events[1].requirements[1] длиннее 500 символов",
		},
		{
			"model",
			withEvents(`{"t":1,"type":"stage_enter","stage":"review","model":"` + longLine + `"}`),
			"data.events[0].model длиннее 500 символов",
		},
		{
			"line",
			withEvents(`{"t":1,"type":"message","line":"` + longLine + `","text":"t"}`),
			"data.events[0].line длиннее 500 символов",
		},
		{
			"text",
			withEvents(`{"t":0,"type":"build_start"},{"t":1,"type":"message","line":"l","text":"` + longText + `"}`),
			"data.events[1].text длиннее 20000 символов",
		},
		{
			"reason",
			withEvents(`{"t":1,"type":"stage_fail","stage":"review","reason":"` + longLine + `"}`),
			"data.events[0].reason длиннее 500 символов",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseRecording([]byte(tt.body))

			var invalid *InvalidRecordError
			if !errors.As(err, &invalid) {
				t.Fatalf("ошибка %v, ожидалась InvalidRecordError", err)
			}
			if invalid.Reason != tt.wantReason {
				t.Fatalf("причина %q, ожидалась %q", invalid.Reason, tt.wantReason)
			}
		})
	}
}

func TestParseRecordingAcceptsFieldsAtLimit(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"id", sessionJSON("2026-10-05-4365c610", strings.Repeat("a", maxIDLength))},
		{"data.title", sessionJSON("Галерея", strings.Repeat("я", maxLineLength))},
		{"data.title из эмодзи", sessionJSON("Галерея", strings.Repeat("🏭", maxLineLength))},
		{"data.task", withDataField("task", strings.Repeat("a", maxIDLength))},
		{"требование", withEvents(`{"t":1,"type":"prompt","goal":"g","requirements":["` + strings.Repeat("a", maxLineLength) + `"]}`)},
		{"text", withEvents(`{"t":1,"type":"message","line":"l","text":"` + strings.Repeat("a", maxTextLength) + `"}`)},
		{"text из эмодзи", withEvents(`{"t":1,"type":"message","line":"l","text":"` + strings.Repeat("🏭", maxTextLength) + `"}`)},
		{"события без текстовых полей", withEvents(`{"t":0,"type":"build_start"},{"t":1,"type":"usage","tokens":5}`)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ParseRecording([]byte(tt.body)); err != nil {
				t.Fatalf("запись на пределе отклонена: %v", err)
			}
		})
	}
}
