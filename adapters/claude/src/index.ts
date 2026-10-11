// Claude Code adapter: agent files from the harness, session capture into the project journal, and
// publishing recordings from a draft. What the agents share lives in `@cyberzavod/adapter-kit`.

export { draftSession, type DraftSessionOptions } from "./commands/draft.ts";
export { previewDrafts, type PreviewDraftsOptions } from "./commands/preview.ts";
export { publishSessions, type PublishSessionsOptions } from "./commands/publish.ts";
export { ClaudeError } from "./errors.ts";
export { CLAUDE_MESSAGES } from "./messages/catalog.ts";
export type { ClaudeMessages } from "./messages/claude-messages.ts";
export { CLAUDE_AGENT, CLAUDE_PROVIDER } from "./generate/claude.ts";
export {
  previewClaude,
  syncClaude,
  type ClaudeInstallation,
  type SyncOptions,
} from "./generate/sync.ts";
export { disconnectClaude } from "./generate/disconnect.ts";
export type { ClaudeTemplates } from "./generate/files.ts";
export { inspectClaudeHooks, type HooksReading } from "./generate/inspect.ts";
export { SETTINGS_FILE } from "./generate/settings.ts";
export { HOOK_NAMES, isHookName, runHook, type HookName } from "./hooks/index.ts";
