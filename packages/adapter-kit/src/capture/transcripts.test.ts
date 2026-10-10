import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import type { RawEvent } from "./raw-event.ts";
import {
  readTranscriptFile,
  transcriptsOf,
  withToolOutcomes,
  type TranscriptFormat,
  type TranscriptReader,
} from "./transcripts.ts";

let directory: string;

// A format that reads a transcript of lines `key value`.
function lineFormat(overrides: Partial<TranscriptFormat> = {}): TranscriptFormat {
  return {
    countTokens: (transcript) => transcript.length,
    tokenUsages: (transcript) => [{ ts: 10, tokens: transcript.length }],
    modelReplies: () => [{ ts: 5, model: "gpt-x" }],
    assistantTexts: () => [{ ts: 6, text: "готово" }],
    agentAssignments: () => [],
    agentReports: (transcript) => [{ ts: 7, agentId: "a1", text: transcript }],
    ...overrides,
  };
}

async function transcriptFile(name: string, text: string): Promise<string> {
  const file = path.join(directory, name);

  await writeFile(file, text);

  return file;
}

function sessionEvents(sessionPath: string, stationPath: string): RawEvent[] {
  return [
    { ts: 1, kind: "stop", transcriptPath: sessionPath },
    {
      ts: 2,
      kind: "subagent_stop",
      agent: "reviewer",
      agentId: "a1",
      transcriptPath: stationPath,
    },
  ];
}

describe("withToolOutcomes", () => {
  it("исправляет ok у вызова с известным исходом и не трогает остальные", () => {
    const events: RawEvent[] = [
      { ts: 1, kind: "tool", tool: "Bash", ok: true, callId: "c1" },
      { ts: 2, kind: "tool", tool: "Bash", ok: true, callId: "c2" },
      { ts: 3, kind: "tool", tool: "Bash", ok: true },
    ];

    const fixed = withToolOutcomes(events, new Map([["c1", false]]));

    expect(fixed.map((event) => event.kind === "tool" && event.ok)).toEqual([false, true, true]);
  });

  it("не меняет переданные события", () => {
    const events: RawEvent[] = [{ ts: 1, kind: "tool", tool: "Bash", ok: true, callId: "c1" }];

    withToolOutcomes(events, new Map([["c1", false]]));

    expect(events[0]).toMatchObject({ ok: true });
  });
});

describe("readTranscriptFile", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-transcripts-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("читает файл", async () => {
    const file = await transcriptFile("t.jsonl", "строка");

    const result = await readTranscriptFile(file);

    expect(result).toEqual({ status: "read", text: "строка" });
  });

  it("отличает отсутствие файла от нечитаемого", async () => {
    const missing = await readTranscriptFile(path.join(directory, "gone.jsonl"));
    const unreadable = await readTranscriptFile(directory);

    expect([missing.status, unreadable.status]).toEqual(["missing", "failed"]);
  });
});

describe("transcriptsOf", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-transcripts-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("собирает токены запусков и сессии, модели, ответы и отчёты станций", async () => {
    const session = await transcriptFile("session.jsonl", "сессия");
    const station = await transcriptFile("station.jsonl", "станция");
    const transcripts = transcriptsOf(lineFormat());

    const { meta } = await transcripts.inputsOf(sessionEvents(session, station), KIT_MESSAGES.en);

    expect(meta).toEqual({
      runTokens: new Map([["a1", "станция".length]]),
      sessionUsages: [{ ts: 10, tokens: "сессия".length }],
      replies: [{ ts: 5, model: "gpt-x" }],
      answers: [{ ts: 6, text: "готово" }],
      assignments: [],
      reports: [{ ts: 7, agentId: "a1", text: "станция" }],
    });
  });

  it("считает токены и отчёт станции, которую оборвали до остановки: путь из её начала", async () => {
    const station = await transcriptFile("station.jsonl", "станция");
    const transcripts = transcriptsOf(lineFormat());
    const events: RawEvent[] = [
      {
        ts: 1,
        kind: "subagent_start",
        agent: "reviewer",
        agentId: "a1",
        transcriptPath: station,
      },
    ];

    const { meta } = await transcripts.inputsOf(events, KIT_MESSAGES.en);

    expect(meta.runTokens).toEqual(new Map([["a1", "станция".length]]));
    expect(meta.reports).toEqual([{ ts: 7, agentId: "a1", text: "станция" }]);
  });

  it("исправляет исход вызовов по транскрипту сессии", async () => {
    const session = await transcriptFile("session.jsonl", "сессия");
    const station = await transcriptFile("station.jsonl", "станция");
    const transcripts = transcriptsOf(lineFormat({ toolOutcomes: () => new Map([["c1", false]]) }));
    const events: RawEvent[] = [
      { ts: 0, kind: "tool", tool: "Bash", ok: true, callId: "c1" },
      ...sessionEvents(session, station),
    ];

    const inputs = await transcripts.inputsOf(events, KIT_MESSAGES.en);

    expect(inputs.events[0]).toMatchObject({ ok: false });
  });

  it("без транскриптов собирает пустые данные и предупреждает о пропавших", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gone = path.join(directory, "gone.jsonl");
    const transcripts = transcriptsOf(lineFormat());

    const { meta } = await transcripts.inputsOf(sessionEvents(gone, gone), KIT_MESSAGES.en);

    expect({ meta, warnings: warn.mock.calls.map(([text]) => text) }).toEqual({
      meta: {
        runTokens: new Map(),
        sessionUsages: [],
        replies: [],
        answers: [],
        assignments: [],
        reports: [],
      },
      warnings: [expect.stringContaining("session transcript not read") as string],
    });
  });

  it("предупреждает по разу о каждой пропавшей роли транскрипта, а читает файл один раз", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const session = path.join(directory, "gone-session.jsonl");
    const station = path.join(directory, "gone-station.jsonl");
    const read = vi.fn<TranscriptReader>(() =>
      Promise.resolve({ status: "missing", reason: "gone" }),
    );
    const events: RawEvent[] = [
      { ts: 1, kind: "stop", transcriptPath: session },
      { ts: 2, kind: "subagent_stop", agent: "reviewer", agentId: "a1", transcriptPath: station },
      { ts: 3, kind: "subagent_stop", agent: "Explore", agentId: "a2", transcriptPath: "other" },
    ];

    await transcriptsOf(lineFormat(), read).inputsOf(events, KIT_MESSAGES.en);

    expect(read).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map(([text]) => text)).toEqual([
      expect.stringContaining("session transcript not read") as string,
      "transcripts not found: 1, their tokens are not counted",
      "station transcripts not found: 1, their reports and the tokens of these runs will be missing",
    ]);
  });

  it("о нечитаемом транскрипте сессии говорит и общей строкой, и тем, чего в черновике не будет", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const session = path.join(directory, "session.jsonl");
    const read: TranscriptReader = () => Promise.resolve({ status: "failed", reason: "denied" });
    const events: RawEvent[] = [{ ts: 1, kind: "stop", transcriptPath: session }];

    await transcriptsOf(lineFormat(), read).inputsOf(events, KIT_MESSAGES.en);

    expect(warn.mock.calls.map(([text]) => text)).toEqual([
      `transcript ${session} not read: denied`,
      expect.stringContaining("session transcript not read") as string,
    ]);
  });

  it("предупреждает о сжатом транскрипте и берёт остальные", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const session = await transcriptFile("session.jsonl", "сессия");
    const packed = path.join(directory, "packed.jsonl");
    const read: TranscriptReader = (file) =>
      file === packed ? Promise.resolve({ status: "compressed" }) : readTranscriptFile(file);
    const transcripts = transcriptsOf(lineFormat(), read);

    const { meta } = await transcripts.inputsOf(sessionEvents(session, packed), KIT_MESSAGES.en);

    expect({ runTokens: meta.runTokens, warnings: warn.mock.calls.length }).toEqual({
      runTokens: new Map(),
      warnings: 1,
    });
  });
});
