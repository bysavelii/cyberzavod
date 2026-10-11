package gallery

// Length limits of the recording text fields, in Unicode code points. This is a copy of
// packages/core/src/record-limits.json: the TypeScript core checks the same numbers in the CLI and
// in the browser, and TestLimitsMatchCore fails when the two drift apart.
const (
	// maxIDLength is the limit for ids, the task label and the language code.
	maxIDLength = 100
	// maxLineLength is the limit for single-line fields.
	maxLineLength = 500
	// maxTextLength is the limit for the full texts of messages and interventions.
	maxTextLength = 20000
)
