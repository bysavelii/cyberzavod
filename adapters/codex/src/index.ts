// Codex adapter: agent files from the harness and the trust Codex asks of the human before it runs
// a project's hooks. What the agents share lives in `@cyberzavod/adapter-kit`.

export { CodexError } from "./errors.ts";
export { CODEX_MESSAGES } from "./messages/catalog.ts";
export type { CodexMessages } from "./messages/codex-messages.ts";
export { CODEX_AGENT, CODEX_PROVIDER, CodexGenerateError } from "./generate/codex.ts";
export {
  previewCodex,
  syncCodex,
  type CodexInstallation,
  type SyncOptions,
} from "./generate/sync.ts";
export { disconnectCodex } from "./generate/disconnect.ts";
export type { CodexTemplates } from "./generate/files.ts";
export { draftSession, type DraftSessionOptions } from "./commands/draft.ts";
export { previewDrafts, type PreviewDraftsOptions } from "./commands/preview.ts";
export { CODEX_SOURCE, publishSessions, type PublishSessionsOptions } from "./commands/publish.ts";
export { inspectCodexHooks, type HooksReading } from "./generate/inspect.ts";
export { HOOKS_FILE } from "./generate/hooks-config.ts";
export {
  CODEX_HOOK_NAMES,
  isCodexHookName,
  runCodexHook,
  type CodexHookName,
} from "./hooks/index.ts";
export type { CodexHookContext } from "./hooks/context.ts";
export type { CodexHomeSource } from "./trust/codex-home.ts";
export type { HookEvent } from "./trust/hook-trust.ts";
export {
  carryOverTrust,
  inspectTrust,
  planConnectTrust,
  planDisconnectTrust,
  type CarriedOver,
  type TrustChange,
  type TrustInspection,
  type TrustPlan,
  type TrustTarget,
} from "./trust/trust.ts";
