import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  eventBuilds,
  IDLE_GAP_MS,
  projectsWithoutBuild,
  unassignedRuns,
} from "./builds.ts";
import type { Draft, DraftEvent } from "./draft.ts";
import {
  FIRST_BUILD_ID,
  interleavedDraft,
  intervention,
  message,
  SECOND_BUILD_ID,
} from "./draft.fixtures.ts";

function draftOf(events: DraftEvent[]): Draft {
  return {
    id: "first",
    startedAt: "2026-10-04T09:52:13.000Z",
    builds: [
      {
        id: "first",
        project: "p",
        harness: "0.1.0",
        workflow: "default",
        title: "",
        language: "ru",
        runs: ["a1"],
      },
      {
        id: "second",
        project: "p",
        harness: "0.1.0",
        workflow: "default",
        title: "",
        language: "ru",
        runs: ["b1", "b2"],
      },
    ],
    events,
  };
}

function prompt(t: number, build?: string): DraftEvent {
  return {
    t,
    type: "draft_prompt",
    said: "текст",
    goal: "",
    requirements: [],
    ...(build === undefined ? {} : { build }),
  };
}

function stageEnter(t: number, run?: string): DraftEvent {
  return { t, type: "stage_enter", stage: "implementation", ...(run === undefined ? {} : { run }) };
}

function projectCheck(t: number, project: string): DraftEvent {
  return { t, type: "draft_check", ok: true, project };
}

// Two builds of project `a` around a build of project `b`: the first in order is `first`.
function projectDraftOf(events: DraftEvent[]): Draft {
  return {
    id: "first",
    startedAt: "2026-10-04T09:52:13.000Z",
    builds: [
      {
        id: "first",
        project: "a",
        harness: "0.1.0",
        workflow: "default",
        title: "",
        language: "ru",
        runs: ["a1"],
      },
      {
        id: "other",
        project: "b",
        harness: "0.1.0",
        workflow: "default",
        title: "",
        language: "ru",
        runs: ["b1"],
      },
      {
        id: "third",
        project: "a",
        harness: "0.1.0",
        workflow: "default",
        title: "",
        language: "ru",
        runs: ["a3"],
      },
    ],
    events,
  };
}

function runWindow(t: number, run: string, until: number): DraftEvent {
  return { t, type: "draft_run", run, agent: "coder", until };
}

describe("eventBuilds", () => {
  it("относит событие запуска к сборке, в чьём списке указан запуск", () => {
    const draft = draftOf([stageEnter(1, "b2"), runWindow(1, "b1", 5), stageEnter(2, "a1")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["second", "second", "first"]);
  });

  it("относит промпт к сборке из его поля build", () => {
    const draft = draftOf([prompt(1), prompt(2, "second"), prompt(3, "first")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["first", "second", "first"]);
  });

  it("вмешательство относится к сборке из поля build", () => {
    const draft = draftOf([
      prompt(1),
      intervention({ t: 2, build: "second" }),
      intervention({ t: 3 }),
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["first", "second", "second"]);
  });

  it("отдаёт остальные события основной сессии сборке ближайшего предыдущего события", () => {
    const draft = draftOf([
      prompt(1, "second"),
      { t: 2, type: "draft_check", ok: true },
      { t: 3, type: "usage", tokens: 5 },
      stageEnter(4, "a1"),
      { t: 5, type: "stage_enter", stage: "record" },
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["second", "second", "second", "first", "first"]);
  });

  it("отдаёт события до первого определённого первой сборке", () => {
    const draft = draftOf([
      { t: 0, type: "usage", tokens: 5 },
      { t: 1, type: "stage_enter", stage: "implementation" },
      stageEnter(2, "b1"),
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["first", "first", "second"]);
  });

  it("относит запуск, не указанный ни в одной сборке, к первой", () => {
    const draft = draftOf([
      prompt(1, "second"),
      stageEnter(2, "unknown"),
      { t: 3, type: "draft_check", ok: true },
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["second", "first", "first"]);
  });

  it("позволяет реплике сменить сборку полем build вместо запуска", () => {
    const draft = draftOf([
      message({ t: 1, run: "a1", build: "second" }),
      message({ t: 2, run: "a1" }),
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["second", "first"]);
  });

  it("раскладывает вперемешку идущие запуски и участки основной сессии по задачам", () => {
    const draft = interleavedDraft();

    const builds = eventBuilds(draft);

    const owned = draft.events.flatMap((event, index) => {
      if (event.type === "draft_run") return [[event.run, builds[index]]];
      if (event.type === "usage" && !("run" in event)) return [[event.tokens, builds[index]]];

      return [];
    });

    expect(owned).toEqual([
      [10, FIRST_BUILD_ID],
      [5, FIRST_BUILD_ID],
      ["a1", FIRST_BUILD_ID],
      [20, SECOND_BUILD_ID],
      ["b1", SECOND_BUILD_ID],
      ["b2", SECOND_BUILD_ID],
      [7, FIRST_BUILD_ID],
      ["a2", FIRST_BUILD_ID],
      ["a3", FIRST_BUILD_ID],
    ]);
  });
});

describe("eventBuilds: проект события", () => {
  it("относит событие к сборке его проекта вопреки предыдущему событию", () => {
    const draft = projectDraftOf([stageEnter(1, "a1"), projectCheck(2, "b")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["first", "other"]);
  });

  it("выбирает из сборок проекта ту, к которой относилось ближайшее предыдущее событие", () => {
    const draft = projectDraftOf([stageEnter(1, "a3"), stageEnter(2, "b1"), projectCheck(3, "a")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["third", "other", "third"]);
  });

  it("выбирает первую по порядку сборку проекта, пока его событий не было", () => {
    const draft = projectDraftOf([stageEnter(1, "b1"), projectCheck(2, "a")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["other", "first"]);
  });

  it("оставляет событие проекта без сборки в текущей сборке", () => {
    const draft = projectDraftOf([stageEnter(1, "b1"), projectCheck(2, "unknown")]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["other", "other"]);
  });

  it("не меняет сборку, которую наследуют следующие события", () => {
    const draft = projectDraftOf([
      prompt(1, "third"),
      projectCheck(2, "b"),
      { t: 3, type: "usage", tokens: 5 },
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["third", "other", "third"]);
  });

  it("ставит запуск выше проекта", () => {
    const draft = projectDraftOf([
      { t: 1, type: "stage_enter", stage: "implementation", run: "a1", project: "b" },
    ]);

    const builds = eventBuilds(draft);

    expect(builds).toEqual(["first"]);
  });
});

describe("unassignedRuns", () => {
  it("находит окна запусков, не указанных ни в одной сборке", () => {
    const draft = draftOf([runWindow(1, "a1", 2), runWindow(3, "x1", 4), runWindow(5, "x2", 6)]);

    const runs = unassignedRuns(draft).map(({ run }) => run);

    expect(runs).toEqual(["x1", "x2"]);
  });

  it("называет запуск один раз, когда у него два окна", () => {
    const draft = draftOf([runWindow(1, "x1", 2), runWindow(3, "x1", 4)]);

    const runs = unassignedRuns(draft);

    expect(runs).toEqual([runWindow(1, "x1", 2)]);
  });
});

describe("projectsWithoutBuild", () => {
  it("находит проект без сборки и пропускает проект со сборкой", () => {
    const draft = projectDraftOf([
      projectCheck(1, "a"),
      projectCheck(2, "lab"),
      projectCheck(3, "b"),
    ]);

    const projects = projectsWithoutBuild(draft);

    expect(projects).toEqual(["lab"]);
  });

  it("называет проект один раз, в порядке появления", () => {
    const draft = projectDraftOf([
      projectCheck(1, "lab"),
      projectCheck(2, "docs"),
      { t: 3, type: "stage_enter", stage: "implementation", project: "lab" },
    ]);

    const projects = projectsWithoutBuild(draft);

    expect(projects).toEqual(["lab", "docs"]);
  });
});

describe("buildTimeline", () => {
  it("отсчитывает время от первого события и заканчивает последним", () => {
    const events = [stageEnter(5_000), stageEnter(9_000)];

    const timeline = buildTimeline(events);

    expect([timeline?.start, timeline?.at(5_000), timeline?.end]).toEqual([5_000, 0, 4_000]);
  });

  it("сжимает паузу длиннее IDLE_GAP_MS до IDLE_GAP_MS", () => {
    const events = [
      stageEnter(0),
      stageEnter(10 * IDLE_GAP_MS),
      stageEnter(10 * IDLE_GAP_MS + 500),
    ];

    const timeline = buildTimeline(events);

    expect([timeline?.at(10 * IDLE_GAP_MS), timeline?.end]).toEqual([
      IDLE_GAP_MS,
      IDLE_GAP_MS + 500,
    ]);
  });

  it("оставляет паузу не длиннее IDLE_GAP_MS как есть", () => {
    const events = [stageEnter(0), stageEnter(IDLE_GAP_MS)];

    const timeline = buildTimeline(events);

    expect(timeline?.end).toBe(IDLE_GAP_MS);
  });

  it("не сжимает долгую работу станции без событий внутри окна", () => {
    const longRun = 10 * IDLE_GAP_MS;
    const events = [runWindow(0, "a1", longRun), stageEnter(longRun)];

    const timeline = buildTimeline(events);

    expect(timeline?.end).toBe(longRun);
  });

  it("заканчивает сборку концом последнего окна, если оно позже последнего события", () => {
    const events = [runWindow(1_000, "a1", 9_000), stageEnter(2_000)];

    const timeline = buildTimeline(events);

    expect(timeline?.end).toBe(8_000);
  });

  it("сжимает несколько пауз и сдвигает по ним время событий", () => {
    const gap = 5 * IDLE_GAP_MS;
    const events = [
      stageEnter(0),
      stageEnter(gap),
      stageEnter(2 * gap),
      stageEnter(2 * gap + 1_000),
    ];

    const timeline = buildTimeline(events);

    expect([timeline?.at(gap), timeline?.at(2 * gap + 1_000)]).toEqual([
      IDLE_GAP_MS,
      2 * IDLE_GAP_MS + 1_000,
    ]);
  });

  it("не даёт времени идти назад внутри сжатой паузы: момент паузы встаёт в конец оставленной части", () => {
    const gap = 10 * IDLE_GAP_MS;
    const events = [stageEnter(0), stageEnter(gap)];

    const timeline = buildTimeline(events);

    const inside = [2 * IDLE_GAP_MS, gap - 1].map((t) => timeline?.at(t));

    expect(inside).toEqual([IDLE_GAP_MS, IDLE_GAP_MS]);
    expect(timeline?.at(gap)).toBe(IDLE_GAP_MS);
  });

  it("не считает временем сборки токены, начало и конец черновика", () => {
    const events: DraftEvent[] = [
      { t: 0, type: "build_start" },
      { t: 0, type: "usage", tokens: 10 },
      stageEnter(4_000),
      { t: 90_000_000, type: "build_end", ok: true },
    ];

    const timeline = buildTimeline(events);

    expect([timeline?.start, timeline?.end]).toEqual([4_000, 0]);
  });

  it("не даёт времени сборке без событий со временем", () => {
    const events: DraftEvent[] = [{ t: 0, type: "usage", tokens: 10 }];

    const timeline = buildTimeline(events);

    expect(timeline).toBeUndefined();
  });
});
