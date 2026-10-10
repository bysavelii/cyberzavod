import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPatchPayload,
  PATCH_TEXT,
  promptPayload,
  sessionStartPayload,
  shellPayload,
  spawnAgentPayload,
  stopPayload,
  SESSION_ID,
  SUBAGENT_ID,
  SUBAGENT_ROLLOUT,
  subagentAssignmentPayload,
  subagentShellPayload,
  subagentStartPayload,
  subagentStopPayload,
  waitAgentPayload,
} from "./hook-payload.fixtures.ts";
import { fromCodexHookPayload } from "./hook-payload.ts";

const TS = 1_000;

describe("fromCodexHookPayload", () => {
  it("превращает начало сессии в session_start", () => {
    const event = fromCodexHookPayload(sessionStartPayload(), TS);

    expect(event).toEqual({ ts: TS, kind: "session_start" });
  });

  it("превращает промпт человека в prompt", () => {
    const event = fromCodexHookPayload(promptPayload("Сделай цех"), TS);

    expect(event).toEqual({ ts: TS, kind: "prompt", text: "Сделай цех" });
  });

  it("не считает промптом задание, которое получил сабагент", () => {
    const event = fromCodexHookPayload(subagentAssignmentPayload(), TS);

    expect(event).toBeNull();
  });

  it("сохраняет команду, каталог и id вызова, но не ответ оболочки", () => {
    const event = fromCodexHookPayload(shellPayload("make check-web"), TS);

    expect(event).toEqual({
      ts: TS,
      kind: "tool",
      tool: "Bash",
      ok: true,
      command: "make check-web",
      callId: "call_shell",
      cwd: "/project",
    });
  });

  it("обрезает длинную команду", () => {
    const event = fromCodexHookPayload(shellPayload(`echo ${"a".repeat(300)}`), TS);

    expect(event).toMatchObject({ command: `echo ${"a".repeat(195)}` });
  });

  it("помечает вызов оболочки сабагентом его agentId", () => {
    const event = fromCodexHookPayload(subagentShellPayload(), TS);

    expect(event).toMatchObject({ tool: "Bash", command: "echo child-tool", agentId: SUBAGENT_ID });
  });

  it("не пишет agentId у вызова основной сессии", () => {
    const event = fromCodexHookPayload(shellPayload(), TS);

    expect(event).not.toHaveProperty("agentId");
  });

  it("сохраняет у apply_patch первый файл патча абсолютным путём, но не текст патча", () => {
    const event = fromCodexHookPayload(applyPatchPayload(), TS);

    expect(event).toEqual({
      ts: TS,
      kind: "tool",
      tool: "apply_patch",
      ok: true,
      file: path.resolve("/project", "note.txt"),
      cwd: "/project",
    });
    expect(JSON.stringify(event)).not.toContain("secret text");
  });

  it("берёт у патча без добавления файла путь первого заголовка", () => {
    const patch = PATCH_TEXT.replace("*** Add File: note.txt\n+the secret text of the patch\n", "");

    const event = fromCodexHookPayload(applyPatchPayload(patch), TS);

    expect(event).toMatchObject({ file: path.resolve("/project", "src/app.ts") });
  });

  it("пишет у остальных инструментов только имя, каталог и agentId", () => {
    const spawned = fromCodexHookPayload(spawnAgentPayload(), TS);
    const waited = fromCodexHookPayload(waitAgentPayload(), TS);

    expect(spawned).toEqual({
      ts: TS,
      kind: "tool",
      tool: "spawn_agent",
      ok: true,
      cwd: "/project",
    });
    expect(waited).toMatchObject({ tool: "multi_agent_v1wait_agent" });
    expect(JSON.stringify([spawned, waited])).not.toContain("review the change");
  });

  it("записывает начало сабагента с типом, id и его транскриптом", () => {
    const event = fromCodexHookPayload(subagentStartPayload(), TS);

    expect(event).toEqual({
      ts: TS,
      kind: "subagent_start",
      agent: "reviewer",
      agentId: SUBAGENT_ID,
      transcriptPath: SUBAGENT_ROLLOUT,
    });
  });

  it("записывает сабагента без типа как unknown", () => {
    const payload = { ...subagentStartPayload(), agent_type: "" };

    const event = fromCodexHookPayload(payload, TS);

    expect(event).toMatchObject({ agent: "unknown" });
  });

  it("сохраняет у остановки сабагента транскрипт и вердикт — первую строку ответа", () => {
    const event = fromCodexHookPayload(subagentStopPayload(), TS);

    expect(event).toEqual({
      ts: TS,
      kind: "subagent_stop",
      agent: "reviewer",
      agentId: SUBAGENT_ID,
      transcriptPath: expect.stringContaining(SUBAGENT_ID) as string,
      verdict: "APPROVED",
    });
  });

  it("берёт транскрипт сабагента из transcript_path, если agent_transcript_path нет", () => {
    const payload = { ...subagentStopPayload(), agent_transcript_path: undefined };

    const event = fromCodexHookPayload(payload, TS);

    expect(event).toMatchObject({ transcriptPath: expect.stringContaining(SUBAGENT_ID) as string });
  });

  it("сохраняет транскрипт сессии при остановке", () => {
    const event = fromCodexHookPayload(stopPayload(), TS);

    expect(event).toEqual({
      ts: TS,
      kind: "stop",
      transcriptPath: expect.stringContaining(SESSION_ID) as string,
    });
  });

  it.each([
    ["PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } }],
    ["SessionEnd", { reason: "other" }],
    ["PermissionRequest", {}],
  ])("пропускает событие %s, ненужное для записи", (hookEventName, extra) => {
    const payload = { ...promptPayload(), hook_event_name: hookEventName, ...extra };

    const event = fromCodexHookPayload(payload, TS);

    expect(event).toBeNull();
  });

  it("пропускает нагрузку, которая не объект", () => {
    const events = ["text", null, 42].map((payload) => fromCodexHookPayload(payload, TS));

    expect(events).toEqual([null, null, null]);
  });
});
