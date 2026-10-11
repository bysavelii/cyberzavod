import { describe, expect, it } from "vitest";
import {
  RECORD_LIMITS,
  parseRecord,
  type RecordSource,
  type SessionRecord,
} from "@cyberzavod/core";
import type { Draft, DraftIntervention, DraftMessage, DraftPrompt } from "./draft.ts";
import {
  FIRST_BUILD_ID,
  interleavedDraft,
  intervention,
  message,
  SECOND_BUILD_ID,
} from "./draft.fixtures.ts";
import { previewBuild, previewEvents, type PreviewHeader } from "./preview.ts";

const SOURCE: RecordSource = { type: "agent", provider: "openai", agent: "codex" };
const HEADER: PreviewHeader = {
  project: "lab",
  harness: "0.13.0",
  workflow: "default",
  language: "en",
  untitled: (buildId) => `Draft ${buildId}`,
};
const UNEDITED_MESSAGE_TIME = 4_000;

function uneditedPrompt(patch: Partial<DraftPrompt> = {}): DraftPrompt {
  return {
    t: 0,
    type: "draft_prompt",
    said: "add the token counter\nand cover it with tests",
    goal: "",
    requirements: [],
    ...patch,
  };
}

function uneditedMessage(patch: Partial<DraftMessage> = {}): DraftMessage {
  return message({ t: UNEDITED_MESSAGE_TIME, line: "", text: "", ...patch });
}

function uneditedIntervention(patch: Partial<DraftIntervention> = {}): DraftIntervention {
  return intervention({ t: UNEDITED_MESSAGE_TIME, line: "", text: "", ...patch });
}

function draftWith(...events: Draft["events"]): Draft {
  const draft = interleavedDraft();

  return { ...draft, events };
}

function twoBuildDraft(...events: Draft["events"]): Draft {
  const [first, second] = interleavedDraft().builds;
  const unheaded = { title: "", project: "", harness: "", workflow: "", language: "", runs: [] };

  return {
    id: FIRST_BUILD_ID,
    startedAt: "2026-10-04T09:52:13.000Z",
    builds: [
      { ...unheaded, id: first?.id ?? FIRST_BUILD_ID },
      { ...unheaded, id: second?.id ?? SECOND_BUILD_ID },
    ],
    events,
  };
}

function stagesIn(record: SessionRecord): string[] {
  return record.data.events.flatMap((event) => (event.type === "stage_enter" ? [event.stage] : []));
}

function uneditedDraft(): Draft {
  const draft = interleavedDraft();

  return {
    ...draft,
    builds: draft.builds.map((build) => ({
      ...build,
      title: "",
      project: "",
      harness: "",
      workflow: "",
      language: "",
    })),
    events: draft.events.map((event) =>
      event.type === "draft_prompt" ? { ...event, goal: "", requirements: [] } : event,
    ),
  };
}

describe("previewEvents", () => {
  it("кладёт первую строку сказанного в цель промпта", () => {
    const events = [uneditedPrompt({ said: "\n  \n add the counter \nand tests" })];

    const [prompt] = previewEvents(events);

    expect(prompt).toMatchObject({ type: "draft_prompt", goal: "add the counter" });
  });

  it("кладёт первую строку в реплику, а весь сказанный текст в её текст", () => {
    const events = [uneditedMessage({ said: "first line\nsecond line" })];

    const [event] = previewEvents(events);

    expect(event).toMatchObject({ line: "first line", text: "first line\nsecond line" });
  });

  it("не кладёт в текст пустые края сказанного", () => {
    const events = [uneditedMessage({ said: "\n  first line\nsecond line \n\n" })];

    const [event] = previewEvents(events);

    expect(event).toMatchObject({ text: "first line\nsecond line" });
  });

  it("делает то же с вмешательством", () => {
    const events = [uneditedIntervention({ said: "stop it\nright now" })];

    const [event] = previewEvents(events);

    expect(event).toMatchObject({ line: "stop it", text: "stop it\nright now" });
  });

  it("не трогает отредактированные тексты", () => {
    const edited = message({ t: 1_000 });
    const prompt = uneditedPrompt({ goal: "Добавь счётчик" });

    const events = previewEvents([prompt, edited]);

    expect(events).toEqual([prompt, edited]);
  });

  it("оставляет склеенный промпт как есть", () => {
    const joined = uneditedPrompt({ joined: true });

    const events = previewEvents([uneditedPrompt(), joined]);

    expect(events[1]).toEqual(joined);
  });

  it("обрезает тексты по границам записи в кодовых точках", () => {
    const longLine = "🏭".repeat(RECORD_LIMITS.lineLength + 10);
    const longText = "я".repeat(RECORD_LIMITS.textLength + 10);

    const [prompt, event] = previewEvents([
      uneditedPrompt({ said: longLine }),
      uneditedMessage({ said: longText }),
    ]);

    expect([prompt, event]).toMatchObject([
      { goal: "🏭".repeat(RECORD_LIMITS.lineLength) },
      { line: "я".repeat(RECORD_LIMITS.lineLength), text: "я".repeat(RECORD_LIMITS.textLength) },
    ]);
  });

  it("убирает событие, в котором ничего не сказано и ничего не написано", () => {
    const events = previewEvents([
      uneditedPrompt({ said: "  \n " }),
      uneditedMessage({ said: "" }),
      uneditedIntervention({ said: "\n" }),
    ]);

    expect(events).toEqual([]);
  });

  it("убирает склеенный промпт, у которого предыдущий промпт убран", () => {
    const events = previewEvents([
      uneditedPrompt({ said: "" }),
      uneditedPrompt({ said: "да", joined: true }),
    ]);

    expect(events).toEqual([]);
  });

  it("не меняет список, который получил", () => {
    const events = [uneditedPrompt()];

    previewEvents(events);

    expect(events).toEqual([uneditedPrompt()]);
  });
});

describe("previewBuild", () => {
  it("берёт пустые поля шапки из запасной шапки", () => {
    const draft = uneditedDraft();

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(record).toMatchObject({
      projectId: "lab",
      data: {
        title: `Draft ${FIRST_BUILD_ID}`,
        language: "en",
        workflow: "default",
        harness: "0.13.0",
      },
    });
  });

  it("оставляет заполненные поля шапки", () => {
    const draft = interleavedDraft();

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(record).toMatchObject({
      projectId: "cyberzavod",
      data: { title: "Счётчик токенов", language: "ru" },
    });
  });

  it("собирает запись, которую принимает проверка ядра", () => {
    const draft = uneditedDraft();

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(parseRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("показывает исходный текст неотредактированного промпта", () => {
    const draft = uneditedDraft();

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(record.data.events).toContainEqual(
      expect.objectContaining({ type: "prompt", goal: "добавь плз счетчик токенов над цехом" }),
    );
  });

  it("не мешает утечка в сыром тексте: проверки утечек тут нет", () => {
    const draft = draftWith(uneditedPrompt({ said: "зайди на 203.0.113.7" }), {
      t: 1_000,
      type: "stage_enter",
      stage: "implementation",
    });

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(record.data.events).toContainEqual(
      expect.objectContaining({ type: "prompt", goal: "зайди на 203.0.113.7" }),
    );
  });

  it("собирает разные записи из разных сборок черновика", () => {
    const draft = uneditedDraft();

    const first = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);
    const second = previewBuild(
      draft,
      SECOND_BUILD_ID,
      { ...HEADER, untitled: () => "Other" },
      SOURCE,
    );

    expect([first.id, second.id, second.data.title]).toEqual([
      FIRST_BUILD_ID,
      SECOND_BUILD_ID,
      "Other",
    ]);
  });

  it("делит события между сборками без пересечений, когда у сборок нет проекта", () => {
    const draft = twoBuildDraft(
      uneditedPrompt({ build: FIRST_BUILD_ID }),
      { t: 1_000, type: "stage_enter", stage: "implementation", project: "lab" },
      uneditedPrompt({ t: 2_000, said: "second task", build: SECOND_BUILD_ID }),
      { t: 3_000, type: "stage_enter", stage: "verification", project: "lab" },
    );

    const first = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);
    const second = previewBuild(draft, SECOND_BUILD_ID, HEADER, SOURCE);

    expect([stagesIn(first), stagesIn(second)]).toEqual([["implementation"], ["verification"]]);
  });

  it("называет каждую сборку без названия по её id", () => {
    const draft = twoBuildDraft(uneditedPrompt({ build: SECOND_BUILD_ID }));

    const record = previewBuild(draft, SECOND_BUILD_ID, HEADER, SOURCE);

    expect(record.data.title).toBe(`Draft ${SECOND_BUILD_ID}`);
  });

  it("не переносит события в другую сборку, когда убранная реплика называла её", () => {
    const draft = twoBuildDraft(
      uneditedPrompt({ build: FIRST_BUILD_ID }),
      uneditedMessage({ t: 1_000, said: "", build: SECOND_BUILD_ID }),
      { t: 2_000, type: "stage_enter", stage: "implementation" },
    );

    const second = previewBuild(draft, SECOND_BUILD_ID, HEADER, SOURCE);

    expect(stagesIn(second)).toEqual(["implementation"]);
  });

  it("собирает сборку, у которой убран промпт, а за ним идёт склеенный", () => {
    const draft = twoBuildDraft(
      uneditedPrompt({ said: "" }),
      uneditedPrompt({ t: 500, said: "да", joined: true }),
      { t: 1_000, type: "stage_enter", stage: "implementation" },
    );

    const record = previewBuild(draft, FIRST_BUILD_ID, HEADER, SOURCE);

    expect(stagesIn(record)).toEqual(["implementation"]);
  });
});
