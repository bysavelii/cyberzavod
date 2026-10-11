package gallery

import (
	"encoding/json"
	"os"
	"testing"
)

// coreLimitsFile is the single source of the limits: the TypeScript core reads it too.
const coreLimitsFile = "../../../../packages/core/src/record-limits.json"

func TestLimitsMatchCore(t *testing.T) {
	file, err := os.ReadFile(coreLimitsFile)
	if err != nil {
		t.Fatalf("не прочитать пределы ядра: %v", err)
	}

	var core struct {
		IDLength   int `json:"idLength"`
		LineLength int `json:"lineLength"`
		TextLength int `json:"textLength"`
	}
	if err := json.Unmarshal(file, &core); err != nil {
		t.Fatalf("пределы ядра не разобрать: %v", err)
	}

	tests := []struct {
		name string
		got  int
		want int
	}{
		{"maxIDLength", maxIDLength, core.IDLength},
		{"maxLineLength", maxLineLength, core.LineLength},
		{"maxTextLength", maxTextLength, core.TextLength},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Fatalf("%s = %d, в ядре %d: обновите limits.go вместе с record-limits.json", tt.name, tt.got, tt.want)
			}
		})
	}
}
