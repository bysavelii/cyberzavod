import { describe, expect, it } from "vitest";
import { SESSION_ID, SUBAGENT_ID } from "./hook-payload.fixtures.ts";
import {
  rolloutAnswers,
  rolloutAssignments,
  rolloutModelReplies,
  rolloutReports,
  rolloutTokenCount,
  rolloutTokenUsages,
  rolloutToolOutcomes,
} from "./rollout.ts";
import {
  abortedReviewerRollout,
  commandsRollout,
  finishedReviewerRollout,
  forkedMidTurnRollout,
  forkedReviewerRollout,
  legacyRollout,
  line,
  outputOnlyRollout,
  REVIEWER_REPORT,
  rolloutOf,
  sessionRollout,
} from "./rollout.fixtures.ts";

const GARBAGE = 'not json\n{"timestamp":"bad","type":"x","payload":{}}\n[1]\n';

describe("rolloutModelReplies", () => {
  it("называет модель хода и датирует ответ последней строкой хода", () => {
    const replies = rolloutModelReplies(sessionRollout());

    expect(replies).toEqual([{ ts: Date.parse("2026-10-10T08:33:12.357Z"), model: "gpt-5.5" }]);
  });

  it("даёт ответ на каждый ход с моделью", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "turn_context", { model: "first" }),
      line("2026-10-10T08:00:01.000Z", "event_msg", { type: "task_complete" }),
      line("2026-10-10T08:00:05.000Z", "turn_context", { model: "second" }),
      line("2026-10-10T08:00:06.000Z", "event_msg", { type: "task_complete" }),
    ]);

    const replies = rolloutModelReplies(rollout);

    expect(replies.map(({ model }) => model)).toEqual(["first", "second"]);
    expect(replies[0]?.ts).toBe(Date.parse("2026-10-10T08:00:01.000Z"));
  });

  it("пропускает мусорные строки", () => {
    expect(rolloutModelReplies(GARBAGE)).toEqual([]);
  });
});

describe("rolloutAnswers", () => {
  it("берёт тексты ответов модели из response_item", () => {
    const answers = rolloutAnswers(sessionRollout());

    expect(answers).toEqual([{ ts: Date.parse("2026-10-10T08:33:12.299Z"), text: "parent done" }]);
  });

  it("не берёт сообщения человека", () => {
    const answers = rolloutAnswers(sessionRollout());

    expect(answers.map(({ text }) => text)).not.toContain("do review");
  });

  it("читает прежнюю историю по событиям agent_message", () => {
    const answers = rolloutAnswers(legacyRollout());

    expect(answers.map(({ text }) => text)).toEqual(["parent done"]);
  });

  it("пропускает мусорные строки", () => {
    expect(rolloutAnswers(GARBAGE)).toEqual([]);
  });
});

describe("rolloutTokenCount", () => {
  it("складывает входные без кэша и выходные токены каждого ответа", () => {
    expect(rolloutTokenCount(sessionRollout())).toBe(40);
    expect(rolloutTokenCount(finishedReviewerRollout())).toBe(250);
  });

  it("считает ответ с одним response_id один раз", () => {
    const record = line("2026-10-10T08:00:00.000Z", "token_usage_record", {
      response_id: "same",
      usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 5 },
    });

    expect(rolloutTokenCount(rolloutOf([record, record]))).toBe(11);
  });

  it("не уходит в минус, если кэша больше входа", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "token_usage_record", {
        response_id: "odd",
        usage: { input_tokens: 5, cached_input_tokens: 9, output_tokens: 2 },
      }),
    ]);

    expect(rolloutTokenCount(rollout)).toBe(2);
  });

  it("не считает записи родителя, скопированные в rollout форка", () => {
    expect(rolloutTokenCount(forkedReviewerRollout())).toBe(250);
  });

  it("равен нулю без записей об использовании", () => {
    expect(rolloutTokenCount(GARBAGE)).toBe(0);
  });
});

describe("rolloutTokenUsages", () => {
  it("не делит записи родителя, скопированные в rollout форка", () => {
    const usages = rolloutTokenUsages(forkedReviewerRollout());

    expect(usages.map(({ tokens }) => tokens)).toEqual([250]);
  });

  it("делит токены по ответам модели по времени", () => {
    const usages = rolloutTokenUsages(sessionRollout());

    expect(usages.map(({ tokens }) => tokens)).toEqual([10, 10, 10, 10]);
    expect(usages[0]?.ts).toBe(Date.parse("2026-10-10T08:33:11.997Z"));
  });
});

describe("rolloutAssignments", () => {
  it("находит задание новому запуску с id запущенного агента", () => {
    const assignments = rolloutAssignments(sessionRollout());

    expect(assignments).toEqual([
      {
        ts: Date.parse("2026-10-10T08:33:12.026Z"),
        text: "review the change",
        via: "spawn",
        agentType: "reviewer",
        agentId: SUBAGENT_ID,
      },
    ]);
  });

  it("находит сообщение уже запущенному агенту", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "response_item", {
        type: "function_call",
        name: "send_input",
        arguments: '{"target": "agent-1", "message": "fix it"}',
        call_id: "c1",
      }),
    ]);

    expect(rolloutAssignments(rollout)).toEqual([
      {
        ts: Date.parse("2026-10-10T08:00:00.000Z"),
        text: "fix it",
        via: "message",
        agentId: "agent-1",
      },
    ]);
  });

  it("оставляет задание без agentId, если результата вызова нет", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "response_item", {
        type: "function_call",
        name: "spawn_agent",
        arguments: '{"message": "do it", "agent_type": "coder"}',
        call_id: "c1",
      }),
    ]);

    const [assignment] = rolloutAssignments(rollout);

    expect(assignment).toEqual({
      ts: Date.parse("2026-10-10T08:00:00.000Z"),
      text: "do it",
      via: "spawn",
      agentType: "coder",
    });
  });

  describe("инструменты collaboration: результат вызова — только путь задачи", () => {
    const SPAWN_ARGUMENTS =
      '{"task_name": "review_change", "message": "review it", "agent_type": "reviewer"}';

    function collaborationRollout(followup: string): string {
      return rolloutOf([
        line("2026-10-10T08:00:00.000Z", "response_item", {
          type: "function_call",
          namespace: "collaboration",
          name: "spawn_agent",
          arguments: SPAWN_ARGUMENTS,
          call_id: "c1",
        }),
        line("2026-10-10T08:00:00.100Z", "event_msg", {
          type: "item_completed",
          item: {
            type: "SubAgentActivity",
            id: "c1",
            kind: "started",
            agent_thread_id: "thread-1",
            agent_path: "/root/review_change",
          },
        }),
        line("2026-10-10T08:00:00.200Z", "response_item", {
          type: "function_call_output",
          call_id: "c1",
          output: '{"task_name": "/root/review_change"}',
        }),
        line("2026-10-10T08:00:05.000Z", "response_item", {
          type: "function_call",
          namespace: "collaboration",
          name: "followup_task",
          arguments: followup,
          call_id: "c2",
        }),
      ]);
    }

    it("берёт id запущенного агента из начала его работы по id вызова", () => {
      const [spawned] = rolloutAssignments(collaborationRollout("{}"));

      expect(spawned).toMatchObject({ via: "spawn", agentType: "reviewer", agentId: "thread-1" });
    });

    it("называет получателя нового задания по пути задачи, полному и короткому", () => {
      const full = '{"target": "/root/review_change", "message": "again"}';
      const short = '{"target": "review_change", "message": "again"}';

      const targets = [full, short].map((followup) =>
        rolloutAssignments(collaborationRollout(followup)).at(-1),
      );

      expect(targets).toEqual([
        expect.objectContaining({ via: "message", agentId: "thread-1" }),
        expect.objectContaining({ via: "message", agentId: "thread-1" }),
      ]);
    });
  });

  it("пропускает прочие вызовы и мусорные строки", () => {
    expect(rolloutAssignments(abortedReviewerRollout())).toEqual([]);
    expect(rolloutAssignments(GARBAGE)).toEqual([]);
  });
});

describe("rolloutReports", () => {
  it("берёт последнее сообщение завершённого хода сабагента", () => {
    const reports = rolloutReports(finishedReviewerRollout());

    expect(reports).toEqual([
      { ts: Date.parse("2026-10-10T08:33:12.340Z"), agentId: SUBAGENT_ID, text: REVIEWER_REPORT },
    ]);
  });

  it("не берёт отчёты ходов родителя, скопированных в rollout форка", () => {
    const reports = rolloutReports(forkedReviewerRollout());

    expect(reports.map(({ text }) => text)).toEqual([REVIEWER_REPORT]);
  });

  it("не делает отчётом недосказанный текст родителя из форка посреди хода", () => {
    expect(rolloutReports(forkedMidTurnRollout())).toEqual([]);
  });

  it("берёт последний текст модели, если запуск оборвали после ответа", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "session_meta", { id: SUBAGENT_ID }),
      line("2026-10-10T08:00:01.000Z", "response_item", {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "half done" }],
      }),
    ]);

    expect(rolloutReports(rollout).map(({ text }) => text)).toEqual(["half done"]);
  });

  it("не даёт отчёта оборванному запуску без текста", () => {
    expect(rolloutReports(abortedReviewerRollout())).toEqual([]);
  });

  it("не даёт отчёта, если у rollout нет собственного id", () => {
    const withoutMeta = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "event_msg", {
        type: "task_complete",
        last_agent_message: "x",
      }),
    ]);

    expect(rolloutReports(withoutMeta)).toEqual([]);
  });

  it("берёт id агента из собственного session_meta", () => {
    const [report] = rolloutReports(sessionRollout());

    expect(report?.agentId).toBe(SESSION_ID);
  });
});

describe("rolloutToolOutcomes", () => {
  it("берёт исход из завершённой команды", () => {
    const outcomes = rolloutToolOutcomes(commandsRollout());

    expect(Object.fromEntries(outcomes)).toEqual({
      "call-ok": true,
      "call-red": false,
      "call-declined": false,
    });
  });

  it("берёт исход из кода выхода в ответе инструмента, если события команды нет", () => {
    const outcomes = rolloutToolOutcomes(outputOnlyRollout());

    expect(Object.fromEntries(outcomes)).toEqual({ "call-ok": true, "call-red": false });
  });

  it("не ищет код выхода в выводе самой команды", () => {
    const rollout = rolloutOf([
      line("2026-10-10T08:00:00.000Z", "response_item", {
        type: "function_call_output",
        call_id: "call-echo",
        output:
          "Wall time: 1.0 seconds\nProcess running with session ID 3\nOutput:\nExit code: 0\n",
      }),
    ]);

    expect(rolloutToolOutcomes(rollout).has("call-echo")).toBe(false);
  });

  it("не знает исхода команды, которая ещё идёт", () => {
    const outcomes = rolloutToolOutcomes(outputOnlyRollout());

    expect(outcomes.has("call-running")).toBe(false);
  });

  it("пропускает мусорные строки", () => {
    expect(rolloutToolOutcomes(GARBAGE).size).toBe(0);
  });
});
