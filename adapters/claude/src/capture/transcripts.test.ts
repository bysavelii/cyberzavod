import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { KIT_MESSAGES, toDraft, type RawEvent } from "@cyberzavod/adapter-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeTranscripts } from "./transcripts.ts";

const START = Date.parse("2026-10-04T10:00:00.000Z");

let directory: string;

function assistantLine(second: number, id: string, model: string): string {
  const timestamp = new Date(START + second * 1000).toISOString();
  const usage = {
    input_tokens: 10,
    output_tokens: 20,
    cache_read_input_tokens: 5000,
    cache_creation_input_tokens: 100,
    cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 60 },
  };

  return JSON.stringify({ type: "assistant", timestamp, message: { id, model, usage } });
}

describe("claudeTranscripts", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-claude-transcripts-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("даёт черновику usage станции и сессии с моделью, разбивкой и прежним счётчиком", async () => {
    const stationFile = path.join(directory, "station.jsonl");
    const sessionFile = path.join(directory, "session.jsonl");

    await writeFile(stationFile, assistantLine(2, "m1", "claude-sonnet-5-5"));
    await writeFile(sessionFile, assistantLine(1, "m2", "claude-opus-5-5"));

    const events: RawEvent[] = [
      { ts: START, kind: "prompt", text: "Сделай" },
      { ts: START + 1_000, kind: "subagent_start", agent: "coder", agentId: "c1" },
      {
        ts: START + 3_000,
        kind: "subagent_stop",
        agent: "coder",
        agentId: "c1",
        transcriptPath: stationFile,
      },
      { ts: START + 4_000, kind: "stop", transcriptPath: sessionFile },
    ];

    const { meta } = await claudeTranscripts.inputsOf(events, KIT_MESSAGES.en);

    const draft = toDraft(events, { sessionId: "s1", ...meta });

    const usages = draft.events.flatMap((event) => (event.type === "usage" ? [event] : []));

    expect(usages.map(({ model, tokens, breakdown }) => ({ model, tokens, breakdown }))).toEqual([
      {
        model: "claude-opus-5-5",
        tokens: 130,
        breakdown: { input: 10, output: 20, cacheRead: 5000, cacheWrite5m: 40, cacheWrite1h: 60 },
      },
      {
        model: "claude-sonnet-5-5",
        tokens: 130,
        breakdown: { input: 10, output: 20, cacheRead: 5000, cacheWrite5m: 40, cacheWrite1h: 60 },
      },
    ]);
  });
});
