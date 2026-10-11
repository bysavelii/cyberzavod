import { describe, expect, it } from "vitest";
import {
  addBreakdowns,
  briefOf,
  countedTokensOf,
  INTERVENTION_REASONS,
  NO_BREAKDOWN,
  NO_TALLY,
  parseRecord,
  parseSessionEvent,
  RECORD_LIMITS,
  RecordError,
  summarize,
  tally,
  type SessionRecord,
  type TokenBreakdown,
} from "./record.ts";

// The session as raw JSON: tests break it however they like, parseRecord validates it.
interface RawSession {
  version: number;
  type: string;
  id: string;
  timestamp: string;
  projectId: string;
  sessionId?: string;
  source: Record<string, unknown>;
  data: {
    title: string;
    language?: string;
    workflow: string;
    harness: string;
    events: Record<string, unknown>[];
  };
}

function validSession(): RawSession {
  return {
    version: 1,
    type: "session",
    id: "demo-1",
    timestamp: "2026-10-04T09:52:13.000Z",
    projectId: "demo",
    source: { type: "agent", provider: "anthropic", agent: "claude" },
    data: {
      title: "Счётчики над цехом",
      language: "ru",
      workflow: "default",
      harness: "0.1.0",
      events: [
        { t: 0, type: "build_start" },
        {
          t: 10,
          type: "prompt",
          goal: "Добавь счётчик токенов",
          requirements: ["Показывай его над цехом", "Разбивай число по разрядам"],
          model: "claude-opus-5-5",
        },
        { t: 20, type: "stage_enter", stage: "implementation" },
        { t: 30, type: "usage", tokens: 1200 },
        { t: 40, type: "stage_enter", stage: "verification" },
        { t: 50, type: "stage_fail", stage: "verification", reason: "упал тест" },
        { t: 60, type: "stage_enter", stage: "implementation" },
        { t: 70, type: "usage", tokens: 800 },
        { t: 90, type: "build_end", ok: true },
      ],
    },
  };
}

function withData(patch: Record<string, unknown>): RawSession {
  const raw = validSession();

  return { ...raw, data: { ...raw.data, ...patch } };
}

function parseSession(raw: unknown): SessionRecord {
  const record = parseRecord(raw);

  if (record.type !== "session") throw new Error(`ждали сессию, пришло ${record.type}`);

  return record;
}

describe("parseRecord", () => {
  it("принимает корректную запись", () => {
    const raw = validSession();

    const recording = parseSession(raw);

    expect(recording.data.events).toHaveLength(raw.data.events.length);
  });

  it("возвращает конверт и данные сессии", () => {
    const raw = validSession();

    const recording = parseSession(raw);

    expect(recording).toMatchObject({
      version: 1,
      projectId: "demo",
      source: { type: "agent", provider: "anthropic", agent: "claude" },
      data: { workflow: "default", harness: "0.1.0" },
    });
  });

  it("сохраняет сессию агента, если она известна", () => {
    const raw = { ...validSession(), sessionId: "744e7547" };

    const recording = parseSession(raw);

    expect(recording.sessionId).toBe("744e7547");
  });

  it.each([2, 3])("отклоняет версию %i", (version) => {
    const raw = { ...validSession(), version };

    const act = () => parseRecord(raw);

    expect(act).toThrow(new RegExp(`unsupported version ${version}`));
  });

  it("отклоняет неизвестный тип записи", () => {
    const raw = { ...validSession(), type: "milestone" };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/record type milestone/);
  });

  it.each([
    ["без источника", undefined, /source/],
    ["неизвестный источник", { type: "robot" }, /source robot/],
    ["агент без провайдера", { type: "agent", agent: "claude" }, /provider/],
    ["агент без имени", { type: "agent", provider: "anthropic" }, /agent/],
  ])("отклоняет источник: %s", (_name, source, message) => {
    const raw = { ...validSession(), source };

    const act = () => parseRecord(raw);

    expect(act).toThrow(message);
  });

  it.each(["../demo", "demo/1", ""])("отклоняет проект «%s»", (projectId) => {
    const raw = { ...validSession(), projectId };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/projectId/);
  });

  it.each(["workflow", "harness"])("отклоняет сессию без %s", (field) => {
    const raw = withData({ [field]: undefined });

    const act = () => parseRecord(raw);

    expect(act).toThrow(new RegExp(field));
  });

  it.each(["", "  ", "0.1.0\n0.2.0"])("отклоняет версию harness «%s»", (harness) => {
    const raw = withData({ harness });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/harness/);
  });

  it.each(["ru", "en", "deu"])("принимает язык записи %s", (language) => {
    const raw = withData({ language });

    const recording = parseSession(raw);

    expect(recording.data.language).toBe(language);
  });

  it("считает запись без языка русской", () => {
    const raw = withData({ language: undefined });

    const recording = parseSession(raw);

    expect(recording.data.language).toBe("ru");
  });

  it.each(["", "russian", "RU", "ru-RU", 7])("отклоняет язык записи «%s»", (language) => {
    const raw = withData({ language });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/language/);
  });

  it("отклоняет неизвестный этап", () => {
    const raw = validSession();

    raw.data.events[2] = { t: 20, type: "stage_enter", stage: "deploy" };

    const act = () => parseRecord(raw);

    expect(act).toThrow(RecordError);
  });

  it("не даёт времени идти назад", () => {
    const raw = validSession();

    raw.data.events[3] = { t: 5, type: "usage", tokens: 1200 };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/time goes backwards/);
  });

  it("отклоняет промпт без цели", () => {
    const raw = validSession();

    raw.data.events[1] = { t: 10, type: "prompt", goal: " ", requirements: [] };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/goal/);
  });

  it("сохраняет модель, получившую промпт", () => {
    const raw = validSession();

    const recording = parseSession(raw);

    expect(recording.data.events[1]).toMatchObject({ model: "claude-opus-5-5" });
  });

  it("принимает промпт без модели", () => {
    const raw = validSession();

    raw.data.events[1] = { t: 10, type: "prompt", goal: "Цель", requirements: [] };

    const recording = parseSession(raw);

    expect(recording.data.events[1]).not.toHaveProperty("model");
  });

  it("отклоняет пустую модель", () => {
    const raw = validSession();

    raw.data.events[1] = { t: 10, type: "prompt", goal: "Цель", requirements: [], model: "" };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/model/);
  });

  it("сохраняет модель, прошедшую этап", () => {
    const raw = validSession();

    raw.data.events[2] = {
      t: 20,
      type: "stage_enter",
      stage: "implementation",
      model: "claude-sonnet-4-6",
    };

    const recording = parseSession(raw);

    expect(recording.data.events[2]).toEqual({
      t: 20,
      type: "stage_enter",
      stage: "implementation",
      model: "claude-sonnet-4-6",
    });
  });

  it("принимает вход в этап без модели", () => {
    const raw = validSession();

    const recording = parseSession(raw);

    expect(recording.data.events[2]).not.toHaveProperty("model");
  });

  it.each(["", "  ", "claude\nopus", 7])("отклоняет модель этапа «%s»", (model) => {
    const raw = validSession();

    raw.data.events[2] = { t: 20, type: "stage_enter", stage: "implementation", model };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/event #2: model/);
  });

  it("сохраняет метку задачи", () => {
    const raw = withData({ task: "split-bill_1" });

    const recording = parseSession(raw);

    expect(recording.data.task).toBe("split-bill_1");
  });

  it("принимает запись без метки задачи", () => {
    const raw = validSession();

    const recording = parseSession(raw);

    expect(recording.data).not.toHaveProperty("task");
  });

  it.each(["", "split bill", "split/bill", "../bill", 7])("отклоняет метку задачи «%s»", (task) => {
    const raw = withData({ task });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/task/);
  });

  it("отклоняет требование в несколько строк", () => {
    const raw = validSession();

    raw.data.events[1] = { t: 10, type: "prompt", goal: "Цель", requirements: ["первое\nвторое"] };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/requirements/);
  });

  it.each(["04.10.2026", "2026-10-04", "2026-02-31T00:00:00.000Z"])(
    "отклоняет время начала «%s»",
    (timestamp) => {
      const raw = { ...validSession(), timestamp };

      const act = () => parseRecord(raw);

      expect(act).toThrow(/timestamp/);
    },
  );

  it.each(["../demo", "demo/1", ""])("отклоняет id «%s», непригодный для имени файла", (id) => {
    const raw = { ...validSession(), id };

    const act = () => parseRecord(raw);

    expect(act).toThrow(/id/);
  });

  it.each(["", "  ", "первая строка\nвторая"])("отклоняет заголовок «%s»", (title) => {
    const raw = withData({ title });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/title/);
  });

  it("отклоняет запись без build_end", () => {
    const raw = validSession();

    raw.data.events.pop();

    const act = () => parseRecord(raw);

    expect(act).toThrow(/build_end/);
  });
});

describe("summarize", () => {
  it("считает длительность, токены, промпты и возвраты", () => {
    const recording = parseSession(validSession());

    const stats = summarize(recording);

    expect(stats).toEqual({
      durationMs: 90,
      tokens: 2000,
      prompts: 1,
      reworks: 1,
      interventions: 0,
      ok: true,
    });
  });

  it("считает вмешательства отдельно от промптов", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent(), interventionEvent({ t: 26 }));
    const recording = parseSession(raw);

    const stats = summarize(recording);

    expect(stats).toMatchObject({ prompts: 1, interventions: 2 });
  });
});

function messageEvent(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: 25,
    type: "message",
    from: "foreman",
    to: "implementation",
    line: "Сделай счётчик",
    text: "Сделай счётчик токенов.\n\nПоказывай его над цехом.",
    ...patch,
  };
}

describe("parseRecord: реплики", () => {
  it("принимает реплику мастера станции, станции мастеру и станции станции", () => {
    const raw = validSession();

    raw.data.events.splice(
      3,
      0,
      messageEvent(),
      messageEvent({ from: "implementation", to: "foreman" }),
      messageEvent({ from: "implementation", to: "verification" }),
    );

    const recording = parseSession(raw);
    const messages = recording.data.events.filter((event) => event.type === "message");

    expect(messages).toHaveLength(3);
  });

  it.each([
    ["дирижёр говорящий", { from: "conductor" }, /speaker/],
    ["человек говорящий", { from: "human" }, /speaker/],
    ["неизвестный говорящий", { from: "deploy" }, /speaker/],
    ["дирижёр адресат", { to: "conductor" }, /addressee/],
    ["человек адресат", { to: "human" }, /addressee/],
    ["неизвестный адресат", { to: "deploy" }, /addressee/],
    [
      "рабочий говорит сам с собой",
      { from: "implementation", to: "implementation" },
      /talk to itself/,
    ],
    ["мастер говорит сам с собой", { from: "foreman", to: "foreman" }, /talk to itself/],
    ["многострочная строка", { line: "раз\nдва" }, /line/],
    ["пустая строка", { line: "  " }, /line/],
    ["пустой текст", { text: " \n " }, /text/],
    ["текст не строка", { text: 5 }, /text/],
  ])("отклоняет реплику: %s", (_name, patch, message) => {
    const raw = validSession();

    raw.data.events.splice(3, 0, messageEvent(patch));

    const act = () => parseRecord(raw);

    expect(act).toThrow(message);
  });

  it("сохраняет переводы строк в полном тексте", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, messageEvent());

    const recording = parseSession(raw);

    expect(recording.data.events[3]).toMatchObject({ text: expect.stringContaining("\n\n") });
  });
});

describe("briefOf", () => {
  it("убирает полный текст у реплик и не трогает остальное", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, messageEvent());
    const recording = parseSession(raw);

    const brief = briefOf(recording);

    expect(brief.data.events).toEqual([
      ...recording.data.events.slice(0, 3),
      { t: 25, type: "message", from: "foreman", to: "implementation", line: "Сделай счётчик" },
      ...recording.data.events.slice(4),
    ]);
  });

  it("сохраняет метку задачи и модель этапа", () => {
    const raw = withData({ task: "split-bill" });

    raw.data.events[2] = {
      t: 20,
      type: "stage_enter",
      stage: "implementation",
      model: "claude-sonnet-4-6",
    };
    const recording = parseSession(raw);

    const brief = briefOf(recording);

    expect(brief.data.task).toBe("split-bill");
    expect(brief.data.events[2]).toEqual(recording.data.events[2]);
  });

  it("убирает полный текст у вмешательства", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent());
    const recording = parseSession(raw);

    const brief = briefOf(recording);

    expect(brief.data.events[3]).toEqual({
      t: 25,
      type: "intervention",
      reason: "question",
      line: "Возьми вариант с таблицей",
    });
  });
});

describe("tally", () => {
  it("не меняет счётчики на реплике", () => {
    const event = {
      t: 1,
      type: "message",
      from: "record",
      to: "foreman",
      line: "Готово",
    } as const;

    const counts = tally(NO_TALLY, event);

    expect(counts).toEqual(NO_TALLY);
  });

  it("считает вмешательство отдельно от остального", () => {
    const event = {
      t: 1,
      type: "intervention",
      reason: "stop_gate",
      line: "Продолжай",
    } as const;

    const counts = tally(NO_TALLY, event);

    expect(counts).toEqual({ ...NO_TALLY, interventions: 1 });
  });
});

function interventionEvent(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: 25,
    type: "intervention",
    reason: "question",
    line: "Возьми вариант с таблицей",
    text: "Возьми вариант с таблицей.\n\nКэш не нужен.",
    ...patch,
  };
}

describe("parseRecord: вмешательства", () => {
  it.each(INTERVENTION_REASONS)("принимает причину %s", (reason) => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent({ reason }));

    const recording = parseSession(raw);

    expect(recording.data.events[3]).toMatchObject({ type: "intervention", reason });
  });

  it("отклоняет неизвестную причину", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent({ reason: "approval" }));

    const act = () => parseRecord(raw);

    expect(act).toThrow(/reason approval/);
  });

  it.each([
    ["пустая строка", { line: "  " }, /line/],
    ["многострочная строка", { line: "раз\nдва" }, /line/],
    ["пустой текст", { text: " \n " }, /text/],
    ["текст не строка", { text: 5 }, /text/],
  ])("отклоняет вмешательство: %s", (_name, patch, message) => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent(patch));

    const act = () => parseRecord(raw);

    expect(act).toThrow(message);
  });

  it("сохраняет переводы строк в полном тексте", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, interventionEvent());

    const recording = parseSession(raw);

    expect(recording.data.events[3]).toMatchObject({ text: expect.stringContaining("\n\n") });
  });
});

function manualRecord(type: string, data: Record<string, unknown>): Record<string, unknown> {
  const { version, timestamp, projectId } = validSession();

  return {
    version,
    type,
    id: "use-indexeddb",
    timestamp,
    projectId,
    source: { type: "manual" },
    data,
  };
}

describe("parseRecord: решения и заметки", () => {
  it("принимает решение с заголовком и описанием", () => {
    const raw = manualRecord("decision", { title: "Храним в IndexedDB", description: "Растёт." });

    const record = parseRecord(raw);

    expect(record).toMatchObject({
      type: "decision",
      source: { type: "manual" },
      data: { title: "Храним в IndexedDB", description: "Растёт." },
    });
  });

  it("отклоняет решение без заголовка", () => {
    const raw = manualRecord("decision", { title: " ", description: "" });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/title/);
  });

  it("принимает заметку", () => {
    const raw = manualRecord("note", { text: "Переписан движок." });

    const record = parseRecord(raw);

    expect(record).toMatchObject({ type: "note", data: { text: "Переписан движок." } });
  });

  it("отклоняет пустую заметку", () => {
    const raw = manualRecord("note", { text: " " });

    const act = () => parseRecord(raw);

    expect(act).toThrow(/text/);
  });
});

const { idLength, lineLength, textLength } = RECORD_LIMITS;

// Fields of a record in which a value can be replaced to check its limit.
const RECORD_FIELDS: [
  name: string,
  limit: number,
  put: (raw: RawSession, value: string) => void,
][] = [
  ["id", idLength, (raw, value) => void (raw.id = value)],
  ["projectId", idLength, (raw, value) => void (raw.projectId = value)],
  ["sessionId", lineLength, (raw, value) => void (raw.sessionId = value)],
  ["source.provider", lineLength, (raw, value) => void (raw.source.provider = value)],
  ["source.agent", lineLength, (raw, value) => void (raw.source.agent = value)],
  ["title", lineLength, (raw, value) => void (raw.data.title = value)],
  ["workflow", lineLength, (raw, value) => void (raw.data.workflow = value)],
  ["harness", lineLength, (raw, value) => void (raw.data.harness = value)],
  ["task", idLength, (raw, value) => void Object.assign(raw.data, { task: value })],
];

describe("parseRecord: пределы длины", () => {
  it.each(RECORD_FIELDS)("принимает %s ровно на пределе", (_name, limit, put) => {
    const raw = validSession();

    put(raw, "a".repeat(limit));

    const act = () => parseRecord(raw);

    expect(act).not.toThrow();
  });

  it.each(RECORD_FIELDS)("отклоняет %s на один символ длиннее предела", (name, limit, put) => {
    const raw = validSession();

    put(raw, "a".repeat(limit + 1));

    const act = () => parseRecord(raw);

    expect(act).toThrow(new RecordError(`${name} must be at most ${limit} characters`));
  });

  it("считает эмодзи одной кодовой точкой", () => {
    const raw = withData({ title: "🏭".repeat(lineLength) });

    const act = () => parseRecord(raw);

    expect(act).not.toThrow();
  });

  it("отклоняет эмодзи сверх предела", () => {
    const raw = withData({ title: "🏭".repeat(lineLength + 1) });

    const act = () => parseRecord(raw);

    expect(act).toThrow(`title must be at most ${lineLength} characters`);
  });

  it("называет номер события и поле в сообщении о слишком длинном тексте", () => {
    const raw = validSession();

    raw.data.events.splice(3, 0, messageEvent({ text: "a".repeat(textLength + 1) }));

    const act = () => parseRecord(raw);

    expect(act).toThrow(`event #3: text must be at most ${textLength} characters`);
  });
});

describe("parseSessionEvent: пределы длины", () => {
  const prompt = (patch: Record<string, unknown>) => ({
    t: 0,
    type: "prompt",
    goal: "Цель",
    requirements: [],
    ...patch,
  });
  const longLine = "a".repeat(lineLength + 1);
  const events: [name: string, limit: number, raw: Record<string, unknown>, field: string][] = [
    ["goal", lineLength, prompt({ goal: longLine }), "goal"],
    ["requirements[1]", lineLength, prompt({ requirements: ["ok", longLine] }), "requirements[1]"],
    ["model у prompt", lineLength, prompt({ model: longLine }), "model"],
    [
      "model у stage_enter",
      lineLength,
      { t: 0, type: "stage_enter", stage: "review", model: longLine },
      "model",
    ],
    ["line у message", lineLength, messageEvent({ line: longLine }), "line"],
    ["text у message", textLength, messageEvent({ text: "a".repeat(textLength + 1) }), "text"],
    ["line у intervention", lineLength, interventionEvent({ line: longLine }), "line"],
    [
      "text у intervention",
      textLength,
      interventionEvent({ text: "a".repeat(textLength + 1) }),
      "text",
    ],
    [
      "reason у stage_fail",
      lineLength,
      { t: 0, type: "stage_fail", stage: "review", reason: longLine },
      "reason",
    ],
    ["model у usage", lineLength, { t: 0, type: "usage", tokens: 0, model: longLine }, "model"],
  ];

  it.each(events)("отклоняет %s длиннее предела", (_name, limit, raw, field) => {
    const act = () => parseSessionEvent(raw, 2);

    expect(act).toThrow(new RecordError(`event #2: ${field} must be at most ${limit} characters`));
  });

  it.each([
    ["goal", prompt({ goal: "a".repeat(lineLength) })],
    ["requirements[1]", prompt({ requirements: ["ok", "a".repeat(lineLength)] })],
    ["text у message", messageEvent({ text: "a".repeat(textLength) })],
    ["text у intervention", interventionEvent({ text: "a".repeat(textLength) })],
    [
      "reason у stage_fail",
      { t: 0, type: "stage_fail", stage: "review", reason: "a".repeat(lineLength) },
    ],
  ])("принимает %s ровно на пределе", (_name, raw) => {
    const act = () => parseSessionEvent(raw, 2);

    expect(act).not.toThrow();
  });

  it("считает эмодзи в тексте одной кодовой точкой", () => {
    const raw = messageEvent({ text: "🏭".repeat(textLength) });

    const act = () => parseSessionEvent(raw, 2);

    expect(act).not.toThrow();
  });
});

function validBreakdown(): TokenBreakdown {
  return { input: 100, output: 50, cacheRead: 4000, cacheWrite5m: 20, cacheWrite1h: 30 };
}

function usageEvent(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { t: 30, type: "usage", tokens: 200, model: "claude-opus-5-5", ...patch };
}

describe("parseRecord: разбивка токенов", () => {
  function sessionWithUsage(usage: Record<string, unknown>): RawSession {
    const raw = validSession();

    raw.data.events[3] = usage;

    return raw;
  }

  it("принимает usage с моделью и разбивкой", () => {
    const raw = sessionWithUsage(usageEvent({ breakdown: validBreakdown() }));

    const record = parseSession(raw);

    expect(record.data.events[3]).toEqual({
      t: 30,
      type: "usage",
      tokens: 200,
      model: "claude-opus-5-5",
      breakdown: validBreakdown(),
    });
  });

  it("принимает usage без модели и разбивки", () => {
    const raw = sessionWithUsage({ t: 30, type: "usage", tokens: 1200 });

    const record = parseSession(raw);

    expect(record.data.events[3]).toEqual({ t: 30, type: "usage", tokens: 1200 });
  });

  it("принимает usage с моделью без разбивки", () => {
    const raw = sessionWithUsage(usageEvent({ tokens: 1200 }));

    const act = () => parseRecord(raw);

    expect(act).not.toThrow();
  });

  it("отбрасывает лишние ключи разбивки", () => {
    const raw = sessionWithUsage(usageEvent({ breakdown: { ...validBreakdown(), extra: 1 } }));

    const record = parseSession(raw);

    expect(record.data.events[3]).toHaveProperty("breakdown", validBreakdown());
  });

  it.each([
    ["отрицательное", { input: -1 }],
    ["дробное", { output: 1.5 }],
    ["нечисловое", { cacheRead: "4000" }],
    ["слишком большое", { cacheWrite1h: Number.MAX_SAFE_INTEGER + 1 }],
  ])("отклоняет %s поле разбивки", (_name, patch) => {
    const raw = sessionWithUsage(usageEvent({ breakdown: { ...validBreakdown(), ...patch } }));

    const act = () => parseRecord(raw);

    expect(act).toThrow(/breakdown\.\w+ must be a non-negative integer/);
  });

  it("отклоняет неполную разбивку", () => {
    const { input, output, cacheRead, cacheWrite5m } = validBreakdown();
    const raw = sessionWithUsage(
      usageEvent({ breakdown: { input, output, cacheRead, cacheWrite5m } }),
    );

    const act = () => parseRecord(raw);

    expect(act).toThrow("breakdown.cacheWrite1h must be a non-negative integer");
  });

  it("отклоняет разбивку не объектом", () => {
    const raw = sessionWithUsage(usageEvent({ breakdown: "4000" }));

    const act = () => parseRecord(raw);

    expect(act).toThrow("breakdown must be an object");
  });

  it("отклоняет tokens, не равный счётчику разбивки", () => {
    const raw = sessionWithUsage(usageEvent({ tokens: 201, breakdown: validBreakdown() }));

    const act = () => parseRecord(raw);

    expect(act).toThrow(
      "event #3: tokens must equal input + output + cache writes of the breakdown",
    );
  });

  it("отклоняет пустую и многострочную модель", () => {
    const rawEmpty = sessionWithUsage(usageEvent({ model: " " }));
    const rawMultiline = sessionWithUsage(usageEvent({ model: "a\nb" }));

    const actEmpty = () => parseRecord(rawEmpty);
    const actMultiline = () => parseRecord(rawMultiline);

    expect(actEmpty).toThrow(/model/);
    expect(actMultiline).toThrow(/model/);
  });

  it("оставляет версию формата первой", () => {
    const raw = sessionWithUsage(usageEvent({ breakdown: validBreakdown() }));

    const record = parseRecord(raw);

    expect(record.version).toBe(1);
  });
});

describe("countedTokensOf", () => {
  it("считает вход, выход и запись в кэш, но не чтение кэша", () => {
    const breakdown = validBreakdown();

    const counted = countedTokensOf(breakdown);

    expect(counted).toBe(200);
  });
});

describe("addBreakdowns", () => {
  it("складывает разбивки по видам", () => {
    const first = validBreakdown();
    const second = { input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5 };

    const sum = addBreakdowns(first, second);

    expect(sum).toEqual({
      input: 101,
      output: 52,
      cacheRead: 4003,
      cacheWrite5m: 24,
      cacheWrite1h: 35,
    });
  });

  it("не меняет слагаемые", () => {
    const first = validBreakdown();

    addBreakdowns(first, validBreakdown());

    expect(first).toEqual(validBreakdown());
  });

  it("не меняет разбивку при сложении с пустой", () => {
    const breakdown = validBreakdown();

    const sum = addBreakdowns(NO_BREAKDOWN, breakdown);

    expect(sum).toEqual(breakdown);
  });
});
