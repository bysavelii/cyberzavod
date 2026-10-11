import { describe, expect, it } from "vitest";
import {
  RecordError,
  type RecordSource,
  type SessionRecord,
  type UsageEvent,
} from "@cyberzavod/core";
import { KitError } from "../errors.ts";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import {
  carryOverEdits,
  DraftError,
  orphanedEdits,
  orphanedRuns,
  parseDraft,
  publishBuild,
  recordOfBuild,
  publishDraft,
  reroutedMessages,
  unfilledHeader,
  type Draft,
  type DraftBuild,
  type DraftMessage,
  type DraftPrompt,
  type EditableDraftEvent,
} from "./draft.ts";
import { IDLE_GAP_MS } from "./builds.ts";
import {
  FIRST_BUILD_ID,
  interleavedDraft,
  intervention,
  SECOND_BUILD_ID,
} from "./draft.fixtures.ts";

function timesIn(recording: SessionRecord | undefined): number[] {
  return recording?.data.events.map((event) => event.t) ?? [];
}

function usagesIn(recording: SessionRecord | undefined): UsageEvent[] {
  return recording?.data.events.filter((event) => event.type === "usage") ?? [];
}

function thrownBy(act: () => unknown): unknown {
  try {
    act();
  } catch (err) {
    return err;
  }

  return undefined;
}

function promptsOnly(edits: EditableDraftEvent[]) {
  return edits.flatMap((edit) => (edit.type === "draft_prompt" ? [edit] : []));
}

function messageDraft(patch: Partial<DraftMessage> = {}): DraftMessage {
  return {
    t: 1_500,
    type: "draft_message",
    from: "implementation",
    to: "foreman",
    source: "assignment",
    said: "Сделай счётчик токенов, показывай над цехом",
    line: "",
    text: "",
    ...patch,
  };
}

const BUILD_ID = "2026-10-04-744e7547";

function draftWith(...events: Draft["events"]): Draft {
  return { ...uneditedDraft(), events };
}

function editedDraft(): Draft {
  return {
    id: BUILD_ID,
    startedAt: "2026-10-04T09:52:13.000Z",
    builds: [
      {
        id: BUILD_ID,
        project: "cyberzavod",
        harness: "0.1.0",
        workflow: "default",
        title: "Счётчик токенов",
        language: "ru",
        runs: [],
      },
    ],
    events: [
      {
        t: 1_000,
        type: "draft_prompt",
        said: "добавь плз счетчик токенов над цехом",
        goal: "Добавь счётчик токенов",
        requirements: ["Показывай его над цехом"],
        model: "claude-opus-5-5",
      },
      { t: 2_000, type: "stage_enter", stage: "implementation" },
    ],
  };
}

function uneditedDraft(): Draft {
  const draft = editedDraft();

  return {
    ...draft,
    builds: draft.builds.map((build) => ({ ...build, title: "" })),
    events: draft.events.map((event) =>
      event.type === "draft_prompt" ? { ...event, goal: "", requirements: [] } : event,
    ),
  };
}

function buildOf(draft: Draft, index: number): DraftBuild {
  const build = draft.builds[index];

  if (build === undefined) throw new Error(`в черновике нет сборки #${index}`);

  return build;
}

const SOURCE: RecordSource = { type: "agent", provider: "openai", agent: "codex" };

function publishOnly(draft: Draft) {
  return publishBuild(draft, BUILD_ID, SOURCE);
}

describe("parseDraft", () => {
  it("читает метку задачи сборки", () => {
    const raw = {
      ...uneditedDraft(),
      builds: [{ ...uneditedDraft().builds[0], task: "split-bill" }],
    };

    const draft = parseDraft(raw);

    expect(buildOf(draft, 0).task).toBe("split-bill");
  });

  it("не придумывает метку задачи, если её нет в черновике", () => {
    const raw: unknown = JSON.parse(JSON.stringify(uneditedDraft()));

    const draft = parseDraft(raw);

    expect(buildOf(draft, 0)).not.toHaveProperty("task");
  });

  it("отклоняет метку задачи не строкой", () => {
    const raw = { ...uneditedDraft(), builds: [{ ...uneditedDraft().builds[0], task: 5 }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(new DraftError(`build ${BUILD_ID}: task must be a string`));
  });

  it("читает модель входа на этап", () => {
    const raw: unknown = JSON.parse(
      JSON.stringify(
        draftWith({ t: 2_000, type: "stage_enter", stage: "review", model: "claude-opus-5-5" }),
      ),
    );

    const draft = parseDraft(raw);

    expect(draft.events[0]).toMatchObject({ type: "stage_enter", model: "claude-opus-5-5" });
  });

  it("принимает черновик с ещё пустой редактурой", () => {
    const raw: unknown = JSON.parse(JSON.stringify(uneditedDraft()));

    const draft = parseDraft(raw);

    expect(draft).toEqual(uneditedDraft());
  });

  it.each(["project", "harness", "workflow", "language"] as const)(
    "отклоняет %s сборки не строкой",
    (field) => {
      const raw = { ...uneditedDraft(), builds: [{ ...uneditedDraft().builds[0], [field]: 5 }] };

      const act = () => parseDraft(raw);

      expect(act).toThrow(new RegExp(field));
    },
  );

  it("ждёт редактуры языка у черновика, собранного до поля language", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(uneditedDraft()));
    const builds = raw.builds as Record<string, unknown>[];

    delete builds[0]?.language;

    const draft = parseDraft(raw);

    expect(draft.builds[0]?.language).toBe("");
  });

  it.each([
    ["событие цеха", { t: 2_000, type: "stage_enter", stage: "verification", project: "b" }],
    ["исход проверок", { t: 2_000, type: "draft_check", ok: true, project: "b" }],
  ])("принимает пометку project у события: %s", (_name, event) => {
    const raw = { ...uneditedDraft(), events: [event] };

    const draft = parseDraft(raw);

    expect(draft.events).toEqual([event]);
  });

  it.each([
    ["событие цеха", { t: 2_000, type: "stage_enter", stage: "verification", project: 5 }],
    ["исход проверок", { t: 2_000, type: "draft_check", ok: true, project: 5 }],
  ])("отклоняет нестроковую пометку project у события: %s", (_name, event) => {
    const raw = { ...uneditedDraft(), events: [event] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/project must be a string/);
  });

  it("называет id и startedAt, когда их нет у черновика", () => {
    const raw = { ...uneditedDraft(), startedAt: undefined };

    const act = () => parseDraft(raw);

    expect(act).toThrow("draft must have id and startedAt");
  });

  it("отклоняет черновик без сборок", () => {
    const raw = { ...uneditedDraft(), builds: [] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/at least one build/);
  });

  it("отклоняет id сборки, который не подходит в имя файла", () => {
    const raw = { ...uneditedDraft(), builds: [{ ...uneditedDraft().builds[0], id: "../x" }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(DraftError);
  });

  it("отклоняет повторяющийся id сборки", () => {
    const [first] = uneditedDraft().builds;
    const raw = { ...uneditedDraft(), builds: [first, { ...first, runs: ["a1"] }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/twice/);
  });

  it("отклоняет запуск, указанный в двух сборках", () => {
    const [first] = uneditedDraft().builds;
    const raw = {
      ...uneditedDraft(),
      builds: [
        { ...first, runs: ["a1"] },
        { ...first, id: "second", runs: ["a1"] },
      ],
    };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/a1.*two builds/);
  });

  it("отклоняет runs не списком строк", () => {
    const raw = { ...uneditedDraft(), builds: [{ ...uneditedDraft().builds[0], runs: [5] }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/runs/);
  });

  it.each([
    ["промпт", { t: 1, type: "draft_prompt", said: "а", goal: "", requirements: [] }],
    ["реплика", messageDraft()],
  ])("отклоняет %s со ссылкой на неизвестную сборку", (_name, event) => {
    const raw = { ...uneditedDraft(), events: [{ ...event, build: "unknown" }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/unknown build unknown/);
  });

  it("принимает промпт и реплику со ссылкой на сборку черновика", () => {
    const prompt = { t: 1, type: "draft_prompt", said: "а", goal: "", requirements: [] };
    const events = [
      { ...prompt, build: BUILD_ID },
      { ...messageDraft(), build: BUILD_ID, run: "a1" },
    ];

    const draft = parseDraft({ ...uneditedDraft(), events });

    expect(draft.events).toEqual(events);
  });

  it("отклоняет build не строкой", () => {
    const event = { t: 0, type: "draft_prompt", said: "а", goal: "", requirements: [], build: 1 };

    const act = () => parseDraft({ ...uneditedDraft(), events: [event] });

    expect(act).toThrow(/build/);
  });

  it("принимает окно запуска, исход проверок и событие цеха с запуском", () => {
    const events = [
      { t: 1, type: "draft_run", run: "a1", agent: "coder", until: 9 },
      { t: 2, type: "draft_check", ok: false, run: "a1" },
      { t: 3, type: "draft_check", ok: true },
      { t: 4, type: "stage_enter", stage: "implementation", run: "a1" },
    ];

    const draft = parseDraft({ ...uneditedDraft(), events });

    expect(draft.events).toEqual(events);
  });

  it.each([
    ["окно запуска без until", { t: 1, type: "draft_run", run: "a1", agent: "coder" }],
    ["окно запуска без agent", { t: 1, type: "draft_run", run: "a1", until: 2 }],
    ["проверка без ok", { t: 1, type: "draft_check" }],
    ["проверка с run не строкой", { t: 1, type: "draft_check", ok: true, run: 5 }],
    [
      "событие цеха с run не строкой",
      { t: 1, type: "stage_enter", stage: "implementation", run: 5 },
    ],
    ["реплика с run не строкой", { ...messageDraft(), run: 5 }],
  ])("отклоняет %s", (_name, event) => {
    const act = () => parseDraft({ ...uneditedDraft(), events: [event] });

    expect(act).toThrow(DraftError);
  });

  it("отклоняет промпт без исходного текста", () => {
    const raw = {
      ...editedDraft(),
      events: [{ t: 0, type: "draft_prompt", goal: "Цель", requirements: [] }],
    };

    const act = () => parseDraft(raw);

    expect(act).toThrow(DraftError);
  });

  it("отклоняет модель не строкой", () => {
    const raw = {
      ...editedDraft(),
      events: [{ t: 0, type: "draft_prompt", said: "текст", goal: "", requirements: [], model: 5 }],
    };

    const act = () => parseDraft(raw);

    expect(act).toThrow(/model/);
  });

  it.each(["assignment", "report", "answer"] as const)(
    "принимает реплику с source %s",
    (source) => {
      const raw = { ...uneditedDraft(), events: [messageDraft({ source })] };

      const draft = parseDraft(raw);

      expect(draft.events).toEqual([messageDraft({ source })]);
    },
  );

  it("принимает реплику с ещё пустой редактурой и промпт с пометкой «склеен»", () => {
    const joined = {
      t: 2_000,
      type: "draft_prompt",
      said: "да",
      goal: "",
      requirements: [],
      joined: true,
    };
    const raw = { ...uneditedDraft(), events: [messageDraft(), joined] };

    const draft = parseDraft(raw);

    expect(draft.events).toEqual([messageDraft(), joined]);
  });

  it.each([
    ["неизвестный говорящий", { from: "human" }],
    ["неизвестный адресат", { to: "deploy" }],
    ["неизвестный source", { source: "question" }],
    ["без source", { source: undefined }],
    ["без исходного текста", { said: undefined }],
    ["строка не строкой", { line: 5 }],
  ])("отклоняет реплику: %s", (_name, patch) => {
    const raw = { ...uneditedDraft(), events: [{ ...messageDraft(), ...patch }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(DraftError);
  });

  it("отклоняет пометку «склеен» не булевым значением", () => {
    const event = { t: 0, type: "draft_prompt", said: "да", goal: "", requirements: [], joined: 1 };

    const act = () => parseDraft({ ...uneditedDraft(), events: [event] });

    expect(act).toThrow(/joined/);
  });

  it.each(["question", "plan_review", "rework_limit", "stop_gate"] as const)(
    "принимает вмешательство с причиной %s",
    (reason) => {
      const event = intervention({ t: 2_000, reason, line: "", text: "" });
      const raw = { ...uneditedDraft(), events: [event] };

      const draft = parseDraft(raw);

      expect(draft.events).toEqual([event]);
    },
  );

  it.each([
    ["неизвестная причина", { reason: "approval" }, /reason approval/],
    ["без исходного текста", { said: undefined }, /said/],
    ["строка не строкой", { line: 5 }, /line/],
    ["сборка не строкой", { build: 1 }, /build/],
  ])("отклоняет вмешательство: %s", (_name, patch, message) => {
    const event = { ...intervention({ t: 2_000 }), ...patch };

    const act = () => parseDraft({ ...uneditedDraft(), events: [event] });

    expect(act).toThrow(message);
  });

  it("отклоняет вмешательство со ссылкой на неизвестную сборку", () => {
    const event = intervention({ t: 2_000, build: "nowhere" });

    const act = () => parseDraft({ ...uneditedDraft(), events: [event] });

    expect(act).toThrow(/unknown build/);
  });

  it("отклоняет событие цеха не по формату ядра", () => {
    const raw = { ...editedDraft(), events: [{ t: 0, type: "stage_enter", stage: "deploy" }] };

    const act = () => parseDraft(raw);

    expect(act).toThrow(RecordError);
  });

  it("читает черновик из нескольких сборок без потерь", () => {
    const raw: unknown = JSON.parse(JSON.stringify(interleavedDraft()));

    const draft = parseDraft(raw);

    expect(draft).toEqual(interleavedDraft());
  });
});

describe("carryOverEdits", () => {
  it("переносит заголовок и редактуру промпта с тем же временем и текстом", () => {
    const previous = editedDraft();
    const next = uneditedDraft();

    const draft = carryOverEdits(previous, next);

    expect(draft).toEqual(editedDraft());
  });

  it("берёт сборки из прошлого черновика вместе с их запусками", () => {
    const previous = interleavedDraft();
    const next = uneditedDraft();

    const draft = carryOverEdits(previous, next);

    expect(draft.builds).toEqual(interleavedDraft().builds);
  });

  it("переносит метку задачи, которую редактор поставил сборке", () => {
    const previous = editedDraft();

    previous.builds = [{ ...buildOf(previous, 0), task: "split-bill" }];
    const next = uneditedDraft();

    const draft = carryOverEdits(previous, next);

    expect(buildOf(draft, 0).task).toBe("split-bill");
  });

  it("переносит заполненные редактором проект и версию harness первой сборки", () => {
    const previous = editedDraft();

    previous.builds = [{ ...buildOf(previous, 0), project: "demo", harness: "0.2.0" }];
    const next = uneditedDraft();

    next.builds = [{ ...buildOf(next, 0), project: "cyberzavod", harness: "0.1.0" }];

    const draft = carryOverEdits(previous, next);

    expect(draft.builds[0]).toMatchObject({ project: "demo", harness: "0.2.0" });
  });

  it("берёт проект и версию harness первой сборки из журнала, если редактор их не заполнил", () => {
    const previous = editedDraft();

    previous.builds = [{ ...buildOf(previous, 0), project: "", harness: "" }];
    const next = uneditedDraft();

    next.builds = [{ ...buildOf(next, 0), project: "cyberzavod", harness: "0.1.0" }];

    const draft = carryOverEdits(previous, next);

    expect(draft.builds[0]).toMatchObject({ project: "cyberzavod", harness: "0.1.0" });
  });

  it("не подставляет проект журнала в сборку, которую завёл редактор", () => {
    const previous = interleavedDraft();

    previous.builds = previous.builds.map((build) => ({ ...build, project: "", harness: "" }));
    const next = uneditedDraft();

    next.builds = [
      { ...buildOf(next, 0), id: FIRST_BUILD_ID, project: "cyberzavod", harness: "0.1.0" },
    ];

    const draft = carryOverEdits(previous, next);

    expect(draft.builds.map(({ project }) => project)).toEqual(["cyberzavod", ""]);
  });

  it("сохраняет найденную раньше модель, если транскрипта уже нет", () => {
    const previous = editedDraft();
    const next: Draft = {
      ...uneditedDraft(),
      events: [
        {
          t: 1_000,
          type: "draft_prompt",
          said: "добавь плз счетчик токенов над цехом",
          goal: "",
          requirements: [],
        },
      ],
    };

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toMatchObject({ model: "claude-opus-5-5" });
  });

  it("оставляет пустым новый промпт и промпт с другим текстом", () => {
    const previous = editedDraft();
    const next: Draft = {
      ...uneditedDraft(),
      events: [
        { t: 1_000, type: "draft_prompt", said: "другой текст", goal: "", requirements: [] },
        { t: 5_000, type: "draft_prompt", said: "новый промпт", goal: "", requirements: [] },
      ],
    };

    const draft = carryOverEdits(previous, next);

    expect(draft.events).toEqual(next.events);
  });

  it("переносит сборку, назначенную промпту, даже если больше ничего не заполнено", () => {
    const prompt: DraftPrompt = {
      t: 1_000,
      type: "draft_prompt",
      said: "начни вторую задачу",
      goal: "",
      requirements: [],
    };
    const previous = draftWith({ ...prompt, build: "second" });
    const next = draftWith(prompt);

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toEqual({ ...prompt, build: "second" });
  });
});

describe("carryOverEdits: реплики и склейка", () => {
  const edited = messageDraft({ line: "Сделай счётчик", text: "Сделай счётчик токенов." });

  it("переносит строку и текст реплики с тем же временем и исходным текстом", () => {
    const previous = draftWith(edited);
    const next = draftWith(messageDraft());

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toEqual(edited);
  });

  it("берёт маршрут, source и запуск из пересобранного черновика, а редактуру из прошлого", () => {
    const previous = draftWith(edited);
    const next = draftWith(
      messageDraft({ from: "verification", to: "implementation", source: "report", run: "a1" }),
    );

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toEqual({
      ...edited,
      from: "verification",
      to: "implementation",
      source: "report",
      run: "a1",
    });
  });

  it("переносит сборку, назначенную реплике, вместе с отсутствующей строкой", () => {
    const previous = draftWith(messageDraft({ build: "second" }));
    const next = draftWith(messageDraft());

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toMatchObject({ build: "second", line: "" });
  });

  it("оставляет пустой реплику с другим исходным текстом", () => {
    const previous = draftWith(edited);
    const next = draftWith(messageDraft({ said: "Другой текст" }));

    const draft = carryOverEdits(previous, next);

    expect(draft.events).toEqual(next.events);
  });

  it("не путает реплику с промптом того же времени и текста", () => {
    const previous = draftWith({
      t: 1_500,
      type: "draft_prompt",
      said: messageDraft().said,
      goal: "Цель",
      requirements: [],
    });
    const next = draftWith(messageDraft());

    const draft = carryOverEdits(previous, next);

    expect(draft.events).toEqual(next.events);
  });

  it("переносит пометку «склеен» у промпта без чистовой версии", () => {
    const joined: DraftPrompt = {
      t: 2_000,
      type: "draft_prompt",
      said: "да",
      goal: "",
      requirements: [],
    };
    const previous = draftWith({ ...joined, joined: true });
    const next = draftWith(joined);

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toMatchObject({ joined: true });
  });
});

describe("carryOverEdits: вмешательства", () => {
  it("переносит строку, текст и сборку вмешательства", () => {
    const previous = draftWith(intervention({ t: 2_000, build: BUILD_ID }));
    const next = draftWith(intervention({ t: 2_000, line: "", text: "" }));

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toEqual(intervention({ t: 2_000, build: BUILD_ID }));
  });

  it("берёт причину из пересобранного черновика", () => {
    const previous = draftWith(intervention({ t: 2_000, reason: "plan_review" }));
    const next = draftWith(intervention({ t: 2_000, reason: "stop_gate", line: "", text: "" }));

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toMatchObject({ reason: "stop_gate", line: "Одобряю, делай по плану" });
  });

  it("оставляет пустым вмешательство с другим исходным текстом", () => {
    const previous = draftWith(intervention({ t: 2_000 }));
    const next = draftWith(intervention({ t: 2_000, said: "другое", line: "", text: "" }));

    const draft = carryOverEdits(previous, next);

    expect(draft.events[0]).toMatchObject({ line: "", text: "" });
  });
});

describe("orphanedEdits", () => {
  it("находит редактуру промпта, исходный текст которого поменялся", () => {
    const previous = editedDraft();
    const next: Draft = {
      ...uneditedDraft(),
      events: [
        { t: 1_000, type: "draft_prompt", said: "другой текст", goal: "", requirements: [] },
      ],
    };

    const orphaned = promptsOnly(orphanedEdits(previous, next)).map((prompt) => prompt.goal);

    expect(orphaned).toEqual(["Добавь счётчик токенов"]);
  });

  it("находит и редактуру, где заполнены только требования", () => {
    const previous = uneditedDraft();

    previous.events[0] = {
      t: 1_000,
      type: "draft_prompt",
      said: "добавь плз счетчик токенов над цехом",
      goal: "",
      requirements: ["Показывай его над цехом"],
    };
    const next: Draft = { ...uneditedDraft(), events: [] };

    const orphaned = promptsOnly(orphanedEdits(previous, next)).map(
      (prompt) => prompt.requirements,
    );

    expect(orphaned).toEqual([["Показывай его над цехом"]]);
  });

  it("находит отредактированную реплику, исходный текст которой поменялся", () => {
    const previous = draftWith(messageDraft({ line: "Сделай счётчик", text: "Текст" }));
    const next = draftWith(messageDraft({ said: "Другой текст" }));

    const orphaned = orphanedEdits(previous, next);

    expect(orphaned).toEqual([messageDraft({ line: "Сделай счётчик", text: "Текст" })]);
  });

  it("находит промпт с пометкой «склеен», которого больше нет", () => {
    const previous = draftWith({
      t: 2_000,
      type: "draft_prompt",
      said: "да",
      goal: "",
      requirements: [],
      joined: true,
    });
    const next = draftWith();

    const orphaned = orphanedEdits(previous, next);

    expect(orphaned).toHaveLength(1);
  });

  it("не считает потерей промпт, который ещё не редактировали", () => {
    const previous = uneditedDraft();
    const next: Draft = { ...uneditedDraft(), events: [] };

    const orphaned = orphanedEdits(previous, next);

    expect(orphaned).toEqual([]);
  });
});

describe("orphanedRuns", () => {
  it("находит запуски из сборок, которых нет среди окон запусков журнала", () => {
    const draft = interleavedDraft();

    buildOf(draft, 1).runs.push("опечатка");

    const runs = orphanedRuns(draft);

    expect(runs).toEqual(["опечатка"]);
  });

  it("не находит ничего, если окна есть у каждого запуска", () => {
    const draft = interleavedDraft();

    const runs = orphanedRuns(draft);

    expect(runs).toEqual([]);
  });
});

describe("reroutedMessages", () => {
  it("находит заполненную реплику, у которой поменялся маршрут", () => {
    const previous = draftWith(messageDraft({ to: "verification", line: "Держи" }));
    const next = draftWith(messageDraft({ to: "foreman", line: "Держи" }));

    const rerouted = reroutedMessages(previous, next);

    expect(rerouted).toHaveLength(1);
  });

  it.each([
    ["у реплики не поменялся маршрут", messageDraft({ line: "Держи" })],
    ["реплика ещё не заполнена", messageDraft({ to: "verification" })],
  ])("не находит ничего, если %s", (_name, now) => {
    const previous = draftWith(messageDraft({ line: "Держи" }));

    const rerouted = reroutedMessages(previous, draftWith(now));

    expect(rerouted).toEqual([]);
  });

  it("не считает потерей новую реплику без пары в прошлом черновике", () => {
    const previous = draftWith();
    const next = draftWith(messageDraft({ line: "Держи" }));

    const rerouted = reroutedMessages(previous, next);

    expect(rerouted).toEqual([]);
  });
});

describe("publishBuild", () => {
  it("публикует промпты без исходного текста, но с моделью, а время считает от начала сборки", () => {
    const draft = editedDraft();

    const recording = publishOnly(draft);

    expect(recording.data.events[1]).toEqual({
      t: 0,
      type: "prompt",
      goal: "Добавь счётчик токенов",
      requirements: ["Показывай его над цехом"],
      model: "claude-opus-5-5",
    });
  });

  it("кладёт метку задачи сборки в запись", () => {
    const draft = editedDraft();

    buildOf(draft, 0).task = "split-bill";

    const recording = publishOnly(draft);

    expect(recording.data.task).toBe("split-bill");
  });

  it.each([undefined, ""])("не пишет метку задачи, если она %j", (task) => {
    const draft = editedDraft();

    buildOf(draft, 0).task = task;

    const recording = publishOnly(draft);

    expect(recording.data).not.toHaveProperty("task");
  });

  it("отклоняет метку задачи с пробелом", () => {
    const draft = editedDraft();

    buildOf(draft, 0).task = "split bill";

    const act = () => publishOnly(draft);

    expect(act).toThrow(RecordError);
    expect(act).toThrow(/task/);
  });

  it("проверяет на утечки метку задачи", () => {
    const draft = editedDraft();

    buildOf(draft, 0).task = "sk-abcdefgh12345678";

    const act = () => publishOnly(draft);

    expect(act).toThrow(KitError);
  });

  it("кладёт модель на вход на этап, а без неё поля не пишет", () => {
    const draft = editedDraft();

    draft.events = [
      { t: 1_000, type: "stage_enter", stage: "planning", model: "claude-opus-5-5" },
      { t: 2_000, type: "draft_prompt", said: "а", goal: "Добавь", requirements: [] },
      { t: 3_000, type: "stage_enter", stage: "implementation" },
    ];

    const recording = publishOnly(draft);

    expect(recording.data.events.filter((event) => event.type === "stage_enter")).toEqual([
      { t: 0, type: "stage_enter", stage: "planning", model: "claude-opus-5-5" },
      { t: 2_000, type: "stage_enter", stage: "implementation" },
    ]);
  });

  it("проверяет на утечки модель на входе на этап", () => {
    const draft = editedDraft();

    draft.events = [
      { t: 1_000, type: "draft_prompt", said: "а", goal: "Добавь", requirements: [] },
      { t: 2_000, type: "stage_enter", stage: "planning", model: "arn:aws:bedrock:203.0.113.7" },
    ];

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("публикует вмешательство без исходного текста", () => {
    const draft = editedDraft();

    draft.events.push(intervention({ t: 2_500, reason: "question" }));

    const recording = publishOnly(draft);

    expect(recording.data.events.filter((event) => event.type === "intervention")).toEqual([
      {
        t: 1_500,
        type: "intervention",
        reason: "question",
        line: "Одобряю, делай по плану",
        text: "Одобряю постановку, делай по плану.",
      },
    ]);
  });

  it("отклоняет вмешательство с пустой строкой", () => {
    const draft = editedDraft();

    draft.events.push(intervention({ t: 2_500, line: "" }));

    const act = () => publishOnly(draft);

    expect(act).toThrow(RecordError);
    expect(act).toThrow(/line/);
  });

  it("утечка — ошибка адаптера: текст на каждом языке называет вид и место", () => {
    const draft = editedDraft();

    draft.events.push(intervention({ t: 2_500, text: "Зайди на 203.0.113.7" }));

    const act = () => publishOnly(draft);
    const error = thrownBy(act) as KitError;

    expect(error).toBeInstanceOf(KitError);
    expect([error.describe(KIT_MESSAGES.en), error.describe(KIT_MESSAGES.ru)]).toEqual([
      expect.stringContaining("IP address in “Зайди на 203.0.113.7”") as string,
      expect.stringContaining("IP-адрес в «Зайди на 203.0.113.7»") as string,
    ]);
  });

  it("не публикует адрес сервера в тексте вмешательства", () => {
    const draft = editedDraft();

    draft.events.push(intervention({ t: 2_500, text: "Зайди на 203.0.113.7" }));

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("не публикует черновик без чистовой версии промпта", () => {
    const draft = uneditedDraft();

    buildOf(draft, 0).title = "Счётчик токенов";

    const act = () => publishOnly(draft);

    expect(act).toThrow(/goal/);
  });

  it("собирает запись сессии с проектом, версией harness, процессом и переданным источником", () => {
    const draft = editedDraft();

    const recording = publishOnly(draft);

    expect(recording).toMatchObject({
      version: 1,
      type: "session",
      projectId: "cyberzavod",
      source: SOURCE,
      data: { harness: "0.1.0", workflow: "default", language: "ru" },
    });
  });

  it.each(["project", "harness", "language"] as const)(
    "не публикует сборку с пустым полем %s",
    (field) => {
      const draft = editedDraft();

      buildOf(draft, 0)[field] = "";

      const act = () => publishOnly(draft);

      expect(act).toThrow(RecordError);
      expect(act).toThrow(new RegExp(field));
    },
  );

  it("проверяет на утечки версию harness", () => {
    const draft = editedDraft();

    buildOf(draft, 0).harness = "сервер 203.0.113.7";

    const act = () => publishOnly(draft);

    expect(act).toThrow(KitError);
  });

  it("не публикует сборку без заголовка", () => {
    const draft = editedDraft();

    buildOf(draft, 0).title = "";

    const act = () => publishOnly(draft);

    expect(act).toThrow(/title/);
  });

  it("проверяет на утечки и причину возврата на доработку", () => {
    const draft = editedDraft();

    draft.events[1] = {
      t: 2_000,
      type: "stage_fail",
      stage: "verification",
      reason: "нет доступа к 203.0.113.7",
    };

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("проверяет на утечки и модель промпта", () => {
    const draft = editedDraft();

    draft.events[0] = {
      t: 1_000,
      type: "draft_prompt",
      said: "текст",
      goal: "Добавь счётчик",
      requirements: [],
      model: "arn:aws:bedrock:203.0.113.7",
    };

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("не публикует адрес сервера, попавший в чистовую версию", () => {
    const draft = editedDraft();

    draft.events[0] = {
      t: 1_000,
      type: "draft_prompt",
      said: "зайди на 203.0.113.7",
      goal: "Зайти на сервер 203.0.113.7",
      requirements: [],
    };

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("публикует реплику без исходного текста, source и запуска", () => {
    const draft = editedDraft();

    draft.events.splice(
      1,
      0,
      messageDraft({
        t: 1_500,
        run: "a1",
        line: "Сделай счётчик",
        text: "Сделай счётчик токенов.",
      }),
    );

    const recording = publishOnly(draft);

    expect(recording.data.events[2]).toEqual({
      t: 500,
      type: "message",
      from: "implementation",
      to: "foreman",
      line: "Сделай счётчик",
      text: "Сделай счётчик токенов.",
    });
  });

  it("не публикует черновик с непроставленной репликой", () => {
    const draft = editedDraft();

    draft.events.splice(1, 0, messageDraft());

    const act = () => publishOnly(draft);

    expect(act).toThrow(/line/);
  });

  it("пропускает склеенные промпты", () => {
    const draft = editedDraft();

    draft.events.splice(1, 0, {
      t: 1_800,
      type: "draft_prompt",
      said: "да",
      goal: "",
      requirements: [],
      joined: true,
    });

    const recording = publishOnly(draft);

    expect(recording.data.events.filter((event) => event.type === "prompt")).toHaveLength(1);
  });

  it("не публикует склеенный первый промпт", () => {
    const draft = editedDraft();

    draft.events.splice(0, 0, {
      t: 500,
      type: "draft_prompt",
      said: "да",
      goal: "",
      requirements: [],
      joined: true,
    });

    const act = () => publishOnly(draft);

    expect(act).toThrow(DraftError);
  });

  it("не публикует промпт, склеенный первым в сборке, даже если в другой сборке промпты есть", () => {
    const draft = interleavedDraft();

    draft.events = draft.events.map((event) =>
      event.type === "draft_prompt" && event.build === SECOND_BUILD_ID
        ? { ...event, joined: true }
        : event,
    );

    const act = () => publishBuild(draft, SECOND_BUILD_ID, SOURCE);

    expect(act).toThrow(DraftError);
  });

  it.each([
    ["строке", { line: "Зайти на 203.0.113.7", text: "Текст" }],
    ["тексте", { line: "Зайти", text: "Зайди на 203.0.113.7" }],
  ])("не публикует адрес сервера в %s реплики", (_name, patch) => {
    const draft = editedDraft();

    draft.events.splice(1, 0, messageDraft(patch));

    const act = () => publishOnly(draft);

    expect(act).toThrow(/IP address/);
  });

  it("не повторяет этап, на котором сборка уже стоит", () => {
    const draft = editedDraft();

    draft.events.push(
      { t: 2_500, type: "stage_enter", stage: "implementation", run: "a2" },
      { t: 3_000, type: "stage_enter", stage: "verification" },
      { t: 3_500, type: "stage_enter", stage: "implementation" },
    );

    const recording = publishOnly(draft);

    const stages = recording.data.events.flatMap((event) =>
      event.type === "stage_enter" ? [event.stage] : [],
    );

    expect(stages).toEqual(["implementation", "verification", "implementation"]);
  });

  it("ставит build_start в нуль и отбрасывает старые начало и конец черновика", () => {
    const draft = editedDraft();

    draft.events = [
      { t: 0, type: "build_start" },
      ...draft.events,
      { t: 99_000_000, type: "build_end", ok: false },
    ];

    const recording = publishOnly(draft);

    expect(recording.data.events.map((event) => [event.t, event.type])).toEqual([
      [0, "build_start"],
      [0, "prompt"],
      [1_000, "stage_enter"],
      [1_000, "build_end"],
    ]);
  });

  it("не оставляет в записи пометок project у событий", () => {
    const draft = editedDraft();

    draft.events.push(
      { t: 3_000, type: "stage_enter", stage: "verification", project: "cyberzavod" },
      { t: 3_000, type: "draft_check", ok: false, project: "cyberzavod" },
      {
        t: 3_000,
        type: "stage_fail",
        stage: "verification",
        reason: "checks failed",
        project: "cyberzavod",
      },
    );

    const recording = publishOnly(draft);

    expect(JSON.stringify(recording.data.events)).not.toContain("project");
  });

  it("считает сборку без проверок удачной", () => {
    const draft = editedDraft();

    const recording = publishOnly(draft);

    expect(recording.data.events.at(-1)).toMatchObject({ type: "build_end", ok: true });
  });

  it("не оставляет в записи служебных событий и пометок черновика", () => {
    const draft = interleavedDraft();

    const recording = publishBuild(draft, FIRST_BUILD_ID, SOURCE);

    const marks = ["draft_", "run", "said", "source", 'build":'];

    expect(
      marks.filter((mark) => JSON.stringify(recording.data.events).includes(`"${mark}`)),
    ).toEqual([]);
  });

  it("не публикует сборку из неизвестной сборки и сборку без событий", () => {
    const draft = editedDraft();

    draft.builds.push({
      id: "empty",
      project: "p",
      harness: "0.1.0",
      workflow: "default",
      title: "Пустая",
      language: "ru",
      runs: [],
    });

    const unknown = () => publishBuild(draft, "no-such-build", SOURCE);
    const empty = () => publishBuild(draft, "empty", SOURCE);

    expect(unknown).toThrow(/no build no-such-build/);
    expect(empty).toThrow(/build empty has no events/);
  });
});

describe("recordOfBuild", () => {
  it("собирает запись с адресом в тексте: утечки проверяет publishBuild, а не она", () => {
    const draft = editedDraft();

    draft.events.push(intervention({ t: 2_500, text: "Зайди на 203.0.113.7" }));

    const record = recordOfBuild(draft, BUILD_ID, SOURCE);
    const act = () => publishBuild(draft, BUILD_ID, SOURCE);

    expect(record.data.events).toContainEqual(
      expect.objectContaining({ type: "intervention", text: "Зайди на 203.0.113.7" }),
    );
    expect(act).toThrow(/IP address/);
  });

  it("совпадает с публикацией, когда в тексте утечек нет", () => {
    const draft = editedDraft();

    const record = recordOfBuild(draft, BUILD_ID, SOURCE);

    expect(record).toEqual(publishBuild(draft, BUILD_ID, SOURCE));
  });
});

describe("publishDraft: несколько сборок", () => {
  it("публикует две записи со своими id, проектом, версией, заголовком и временем начала", () => {
    const draft = interleavedDraft();

    const recordings = publishDraft(draft, SOURCE);

    expect(
      recordings.map(({ id, projectId, timestamp, data }) => ({
        id,
        projectId,
        harness: data.harness,
        title: data.title,
        timestamp,
      })),
    ).toEqual([
      {
        id: FIRST_BUILD_ID,
        projectId: "cyberzavod",
        harness: "0.1.0",
        title: "Счётчик токенов",
        timestamp: "2026-10-04T09:52:13.000Z",
      },
      {
        id: SECOND_BUILD_ID,
        projectId: "personal-finance-lab",
        harness: "0.1.0",
        title: "Движок финансов",
        timestamp: "2026-10-04T09:52:15.000Z",
      },
    ]);
  });

  it("кладёт в каждую запись только события своих запусков и участков основной сессии", () => {
    const draft = interleavedDraft();

    const recordings = publishDraft(draft, SOURCE);

    const summary = recordings.map((recording) =>
      recording.data.events.flatMap((event) => {
        if (event.type === "prompt") return [event.goal];
        if (event.type === "stage_enter") return [event.stage];
        if (event.type === "stage_fail") return [`fail:${event.stage}`];

        return [];
      }),
    );

    expect(summary).toEqual([
      ["Добавь счётчик токенов", "planning", "implementation", "verification", "fail:verification"],
      ["Сделай движок финансов", "implementation", "verification"],
    ]);
  });

  it("сжимает паузу ожидания первой задачи и не трогает вторую", () => {
    const draft = interleavedDraft();

    const recordings = publishDraft(draft, SOURCE);

    const lastEventBeforeWaiting = 31_000;
    const waiting = 200_000 - lastEventBeforeWaiting;
    const ends = recordings.map((recording) => recording.data.events.at(-1)?.t);

    expect(ends).toEqual([250_000 - (waiting - IDLE_GAP_MS), 58_000]);
  });

  it("считает токены записи по её станциям и участкам основной сессии", () => {
    const draft = interleavedDraft();

    const recordings = publishDraft(draft, SOURCE);

    const tokens = recordings.map((recording) =>
      recording.data.events.reduce(
        (sum, event) => sum + (event.type === "usage" ? event.tokens : 0),
        0,
      ),
    );

    expect(tokens).toEqual([822, 370]);
  });

  it("даёт в сумме по записям столько токенов, сколько в черновике", () => {
    const draft = interleavedDraft();
    const inDraft = draft.events.reduce((sum, e) => sum + (e.type === "usage" ? e.tokens : 0), 0);

    const recordings = publishDraft(draft, SOURCE);

    const inRecordings = recordings
      .flatMap((recording) => recording.data.events)
      .reduce((sum, event) => sum + (event.type === "usage" ? event.tokens : 0), 0);

    expect(inRecordings).toBe(inDraft);
  });

  it("оставляет usage на своих местах, а не складывает их перед build_end", () => {
    const draft = interleavedDraft();

    const [, recording] = publishDraft(draft, SOURCE);

    expect(recording?.data.events.map((event) => event.type)).toEqual([
      "build_start",
      "prompt",
      "usage",
      "stage_enter",
      "message",
      "usage",
      "stage_enter",
      "usage",
      "message",
      "build_end",
    ]);
  });

  it("оставляет модель и разбивку usage и не пишет в запись тег запуска", () => {
    const draft = interleavedDraft();
    const breakdown = {
      input: 20,
      output: 100,
      cacheRead: 5_000,
      cacheWrite5m: 70,
      cacheWrite1h: 10,
    };

    draft.events = draft.events.map((event) =>
      event.type === "usage" && event.run === "b1"
        ? { ...event, tokens: 200, model: "claude-sonnet-5-5", breakdown }
        : event,
    );

    const [, recording] = publishDraft(draft, SOURCE);

    expect(usagesIn(recording)).toContainEqual({
      t: 18_000,
      type: "usage",
      tokens: 200,
      model: "claude-sonnet-5-5",
      breakdown,
    });
  });

  it("публикует usage старого черновика без модели и разбивки как есть", () => {
    const draft = interleavedDraft();

    const [recording] = publishDraft(draft, SOURCE);

    expect(
      usagesIn(recording).every((usage) => !("model" in usage) && !("breakdown" in usage)),
    ).toBe(true);
  });

  it("ставит usage до первого события сборки в её начало", () => {
    const draft = interleavedDraft();
    const secondPrompt = draft.events.findIndex(
      (event) => event.type === "draft_prompt" && event.build === SECOND_BUILD_ID,
    );

    draft.events.splice(secondPrompt, 0, { t: 1_500, type: "usage", tokens: 1, run: "b1" });

    const [, recording] = publishDraft(draft, SOURCE);

    expect(usagesIn(recording)[0]?.t).toBe(0);
    expect(timesIn(recording)).toEqual(timesIn(recording).toSorted((a, b) => a - b));
  });

  it("не ставит usage внутри сжатой паузы позже следующего события", () => {
    const draft = interleavedDraft();
    const lastEventBeforeWaiting = 31_000;
    const insideWaiting = lastEventBeforeWaiting + IDLE_GAP_MS + 10_000;
    const nextWindow = draft.events.findIndex((event) => event.t >= 200_000);

    draft.events.splice(nextWindow, 0, { t: insideWaiting, type: "usage", tokens: 1, run: "a1" });

    const [recording] = publishDraft(draft, SOURCE);

    expect(timesIn(recording)).toEqual(timesIn(recording).toSorted((a, b) => a - b));
  });

  it("не ставит usage позже конца сборки", () => {
    const draft = interleavedDraft();

    draft.events.push({ t: 900_000, type: "usage", tokens: 1, run: "b2" });

    const [, recording] = publishDraft(draft, SOURCE);

    expect(usagesIn(recording).at(-1)?.t).toBe(timesIn(recording).at(-1));
  });

  it("ищет утечки в модели usage", () => {
    const draft = interleavedDraft();

    draft.events = draft.events.map((event) =>
      event.type === "usage" && event.run === "b1" ? { ...event, model: "gpt-203.0.113.7" } : event,
    );

    const act = () => publishBuild(draft, SECOND_BUILD_ID, SOURCE);

    expect(act).toThrow(/IP address/);
  });

  it("берёт итог сборки из её последней проверки: провал соседней сборки не мешает", () => {
    const draft = interleavedDraft();

    const recordings = publishDraft(draft, SOURCE);

    const outcomes = recordings.map((recording) => recording.data.events.at(-1));

    expect(outcomes).toEqual([
      { t: expect.any(Number), type: "build_end", ok: false },
      { t: expect.any(Number), type: "build_end", ok: true },
    ]);
  });

  it("публикует вторую сборку, даже если первая не заполнена", () => {
    const draft = interleavedDraft();

    buildOf(draft, 0).title = "";

    const recording = publishBuild(draft, SECOND_BUILD_ID, SOURCE);

    expect(recording.id).toBe(SECOND_BUILD_ID);
  });

  it("не публикует ничего, если не готова хоть одна сборка", () => {
    const draft = interleavedDraft();

    buildOf(draft, 0).title = "";

    const act = () => publishDraft(draft, SOURCE);

    expect(act).toThrow(/title/);
  });

  it("ищет утечки в каждой записи отдельно", () => {
    const draft = interleavedDraft();

    draft.events = draft.events.map((event) =>
      event.type === "draft_message" && event.run === "b2"
        ? { ...event, text: "Зайди на 203.0.113.7" }
        : event,
    );

    const first = () => publishBuild(draft, FIRST_BUILD_ID, SOURCE);
    const second = () => publishBuild(draft, SECOND_BUILD_ID, SOURCE);

    expect(first).not.toThrow();
    expect(second).toThrow(/IP address/);
  });

  it("публикует черновик с одной сборкой одной записью с id черновика", () => {
    const draft = editedDraft();

    const recordings = publishDraft(draft, SOURCE);

    expect(recordings.map((recording) => recording.id)).toEqual([draft.id]);
  });
});

describe("unfilledHeader", () => {
  it("не называет ничего, если шапка каждой сборки заполнена", () => {
    const draft = interleavedDraft();

    const names = unfilledHeader(draft);

    expect(names).toEqual([]);
  });

  it("называет все пустые поля сборки по порядку шапки", () => {
    const draft = editedDraft();

    draft.builds = [{ ...buildOf(draft, 0), title: "", language: "", project: "", harness: "" }];

    const names = unfilledHeader(draft);

    expect(names).toEqual([
      { buildId: BUILD_ID, fields: ["title", "language", "project", "harness"] },
    ]);
  });

  it("называет пустые поля по каждой сборке и пропускает заполненные", () => {
    const draft = interleavedDraft();

    draft.builds[1] = { ...buildOf(draft, 1), title: "", project: "" };

    const names = unfilledHeader(draft);

    expect(names).toEqual([{ buildId: SECOND_BUILD_ID, fields: ["title", "project"] }]);
  });
});
