// The whole path of a human on Codex, with a real `codex exec` and a scripted model: connect with
// `init`, work under the hooks, make a recording draft and publish it, disconnect. The hooks run
// through the real trust check (no bypass), the real subagent roles and the real npx.
//
// One `codex exec` per scenario is shared by several `it`: a run takes seconds, and the checks
// look at different traces it leaves.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDraft, parseRawLog, type Draft, type RawEvent } from "@cyberzavod/adapter-kit";
import { parseRecord } from "@cyberzavod/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODEX_MESSAGES, CODEX_SOURCE } from "../src/index.ts";
import { startMockResponses, type MockResponses, type ModelRequest } from "./mock-responses.ts";
import { createConnectedProject, cyberzavod, FIX_FILE, runCodex } from "./project.ts";
import {
  CURL_EXIT_PREFIX,
  DONE_REPLY,
  featureScenario,
  hookPromptsIn,
  REVIEW_REPLY,
  sandboxScenario,
  stubbornScenario,
} from "./scenarios.ts";
import {
  cliVersion,
  discardToolchain,
  prepareToolchain,
  readProjectFile,
  type Project,
  type RunResult,
  type Toolchain,
} from "./workspace.ts";

const RAW_DIRECTORY = ".cyberzavod/journal/capture/codex/raw";
const DRAFTS_DIRECTORY = ".cyberzavod/journal/capture/codex/drafts";
const SECRET_VALUE = "do-not-read";
const MAX_ATTEMPTS = 3;
const BLOCKED_HOOK = "hook: Stop Blocked";
// The shell's code for a missing program: the probe must fail on the network, not on a missing curl.
const COMMAND_NOT_FOUND = 127;

interface Session {
  project: Project;
  mock: MockResponses;
  codex: RunResult;
}

let tools: Toolchain;

async function rawEventsOf(project: Project): Promise<RawEvent[]> {
  const directory = path.join(project.directory, RAW_DIRECTORY);
  const [file] = await readdir(directory);

  if (file === undefined) throw new Error(`no raw log in ${directory}`);

  return parseRawLog(await readFile(path.join(directory, file), "utf8"));
}

// The records of the first events are written by asynchronous hooks, so the start may follow the
// prompt in the file; the draft orders the events by time.
function startOf(events: readonly RawEvent[]): RawEvent | undefined {
  return events.find((event) => event.kind === "session_start");
}

function lastRequestOf(mock: MockResponses): ModelRequest {
  const request = mock.requests.at(-1);

  if (request === undefined) throw new Error("the model was never called");

  return request;
}

function toolOutputsOf(request: ModelRequest): string[] {
  return request.input.flatMap((item) =>
    item.type === "function_call_output" && typeof item.output === "string" ? [item.output] : [],
  );
}

function countLines(text: string, line: string): number {
  return text.split("\n").filter((candidate) => candidate.includes(line)).length;
}

async function draftOf(project: Project): Promise<{ file: string; draft: Draft }> {
  const run = await cyberzavod(project, tools, ["draft"]);

  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

  const [, relative] = /^draft: (.+)$/m.exec(run.stdout) ?? [];

  if (relative === undefined) throw new Error(`draft printed no file:\n${run.stdout}`);

  const file = path.join(project.directory, relative);

  return { file, draft: parseDraft(JSON.parse(await readFile(file, "utf8"))) };
}

// What the human and the editor do between `draft` and `publish`, as little of it as the format
// demands: a title, a language and the clean text of each prompt and message.
function filledIn(draft: Draft): Draft {
  return {
    ...draft,
    builds: draft.builds.map((build) => ({ ...build, title: "Greeting", language: "en" })),
    events: draft.events.map((event) => {
      switch (event.type) {
        case "draft_prompt":
          return { ...event, goal: "Add a greeting", requirements: ["Greet the world"] };
        case "draft_message":
          return { ...event, line: "Checking the change.", text: "Checking the change." };
        default:
          return event;
      }
    }),
  };
}

describe("codex exec", () => {
  beforeAll(async () => {
    tools = await prepareToolchain();
  });

  afterAll(async () => {
    if (process.env.CODEX_E2E_KEEP !== "1") await discardToolchain(tools);
  });

  describe("процесс завода: подагент, защита .env, возврат на остановке, запись", () => {
    let session: Session;

    beforeAll(async () => {
      const mock = await startMockResponses(featureScenario);
      const project = await createConnectedProject(tools, "feature", mock.baseUrl);
      const codex = await runCodex(project, tools, { prompt: "$feature Add a greeting" });

      session = { project, mock, codex };
    });

    afterAll(async () => {
      await session.mock.close();
    });

    it("доводит работу до конца и не падает", () => {
      expect(session.codex).toMatchObject({ status: 0 });
      expect(session.codex.stdout).toContain(DONE_REPLY);
    });

    it("не даёт модели прочитать .env: отказ защиты приходит ответом инструмента", () => {
      const outputs = toolOutputsOf(lastRequestOf(session.mock));

      expect(
        outputs.some((output) => output.includes(CODEX_MESSAGES.en.guard.secretFile(".env"))),
      ).toBe(true);
      expect(JSON.stringify(session.mock.requests)).not.toContain(SECRET_VALUE);
    });

    it("возвращает модель к работе ровно один раз, пока проверка красная", async () => {
      const request = lastRequestOf(session.mock);

      expect(hookPromptsIn(request)).toBe(1);
      expect(countLines(session.codex.stderr, BLOCKED_HOOK)).toBe(1);
      expect(await readProjectFile(session.project.directory, FIX_FILE)).toBe("fixed\n");
    });

    it("пишет сырой журнал: старт с проектом, промпт, правку без текста патча, подагента и остановки", async () => {
      const events = await rawEventsOf(session.project);
      const kinds = events.map((event) => event.kind);
      const patched = events.filter(
        (event) => event.kind === "tool" && event.tool === "apply_patch",
      );
      const started = events.find((event) => event.kind === "subagent_start");
      const stopped = events.find((event) => event.kind === "subagent_stop");
      const startedPath = started?.kind === "subagent_start" ? started.transcriptPath : undefined;

      expect(startOf(events)).toMatchObject({ project: "e2e-project", workflow: "default" });
      expect(kinds).toContain("prompt");
      expect(
        patched.map((event) => event.kind === "tool" && path.basename(event.file ?? "")),
      ).toEqual(["app.js", FIX_FILE]);
      expect(started).toMatchObject({
        agent: "reviewer",
        transcriptPath: expect.any(String) as string,
      });
      expect(stopped).toMatchObject({
        agent: "reviewer",
        verdict: "APPROVED",
        transcriptPath: startedPath,
      });
      expect(kinds.filter((kind) => kind === "stop")).toHaveLength(2);
      expect(JSON.stringify(events)).not.toContain("hello, world");
    });

    it("собирает черновик: запуск reviewer на этапе ревью, модель промпта, токены", async () => {
      const { draft } = await draftOf(session.project);
      const [prompt] = draft.events.filter((event) => event.type === "draft_prompt");
      const stages = draft.events.flatMap((event) =>
        event.type === "stage_enter" ? [event.stage] : [],
      );
      const runs = draft.events.filter((event) => event.type === "draft_run");
      const tokens = draft.events.reduce(
        (sum, event) => (event.type === "usage" ? sum + event.tokens : sum),
        0,
      );
      const report = draft.events.find(
        (event) => event.type === "draft_message" && event.source === "report",
      );

      expect(prompt).toMatchObject({ model: session.mock.requests[0]?.model });
      expect(stages).toContain("review");
      expect(runs).toMatchObject([{ agent: "reviewer" }]);
      expect(report).toMatchObject({ said: REVIEW_REPLY });
      expect(tokens).toBeGreaterThan(0);
    });

    it("публикует запись с источником openai/codex, и она проходит проверку ядра", async () => {
      const { file, draft } = await draftOf(session.project);

      await writeFile(file, JSON.stringify(filledIn(draft)));

      const published = await cyberzavod(session.project, tools, ["publish", "--draft", file]);
      const sessions = path.join(session.project.directory, ".cyberzavod/journal/sessions");
      const [recordFile] = await readdir(sessions);
      const record = parseRecord(
        JSON.parse(await readFile(path.join(sessions, recordFile ?? ""), "utf8")),
      );

      expect(published.status, `${published.stdout}\n${published.stderr}`).toBe(0);
      expect(record.source).toEqual(CODEX_SOURCE);
    });

    it("при отключении возвращает конфиг Codex человека в прежний вид", async () => {
      const disconnect = await cyberzavod(session.project, tools, ["disconnect", "--yes"]);
      const config = await readFile(path.join(session.project.codexHome, "config.toml"), "utf8");

      expect(disconnect.status, `${disconnect.stdout}\n${disconnect.stderr}`).toBe(0);
      expect(config).toBe(session.project.initialCodexConfig);
    });
  });

  describe("сессия в подкаталоге, модель не чинит проверку", () => {
    let session: Session;

    beforeAll(async () => {
      const mock = await startMockResponses(stubbornScenario);
      const project = await createConnectedProject(tools, "stubborn", mock.baseUrl);
      const codex = await runCodex(project, tools, {
        prompt: "Fix the answer",
        cwd: path.join(project.directory, "src", "lib"),
      });

      session = { project, mock, codex };
    });

    afterAll(async () => {
      await session.mock.close();
    });

    it("пишет журнал в корень проекта, а не в каталог сессии", async () => {
      const events = await rawEventsOf(session.project);
      const subdirectory = path.join(session.project.directory, "src", "lib");
      const leftovers = (await readdir(subdirectory)).filter((name) => name.startsWith("."));

      expect(startOf(events)).toMatchObject({ project: "e2e-project" });
      expect(leftovers).toEqual([]);
    });

    it(`возвращает модель к работе ${MAX_ATTEMPTS} раза, на следующей остановке отпускает с сообщением`, () => {
      const request = lastRequestOf(session.mock);

      expect(session.codex).toMatchObject({ status: 0 });
      expect(hookPromptsIn(request)).toBe(MAX_ATTEMPTS);
      expect(countLines(session.codex.stderr, BLOCKED_HOOK)).toBe(MAX_ATTEMPTS);
      expect(session.codex.stderr).not.toMatch(/hook: \w+ (Failed|Stopped)/);
      expect(session.mock.requests).toHaveLength(MAX_ATTEMPTS + 2);
    });
  });

  describe("draft в песочнице Codex: без сети", () => {
    let session: Session;

    beforeAll(async () => {
      const mock = await startMockResponses(sandboxScenario(await cliVersion()));
      const project = await createConnectedProject(tools, "sandbox", mock.baseUrl);
      const codex = await runCodex(project, tools, { prompt: "Make the draft" });

      session = { project, mock, codex };
    });

    afterAll(async () => {
      await session.mock.close();
    });

    it("собирает черновик командой скилла: npx зарегистрированной версии берёт пакет из проекта", async () => {
      const [draftOutput] = toolOutputsOf(lastRequestOf(session.mock));
      const drafts = await readdir(path.join(session.project.directory, DRAFTS_DIRECTORY));

      expect(draftOutput).toContain("draft: .cyberzavod/journal/capture/codex/drafts/");
      expect(drafts).toHaveLength(1);
    });

    it("сеть в этой песочнице закрыта, значит draft обошёлся без неё", () => {
      const [, probeOutput] = toolOutputsOf(lastRequestOf(session.mock));

      const exitCode = Number(new RegExp(`${CURL_EXIT_PREFIX}(\\d+)`).exec(probeOutput ?? "")?.[1]);

      expect(exitCode).toBeGreaterThan(0);
      expect(exitCode).not.toBe(COMMAND_NOT_FOUND);
    });
  });
});

describe("startMockResponses", () => {
  it("отвечает 500 с причиной, если сценарий бросил исключение, и сообщает о ней при закрытии", async () => {
    const mock = await startMockResponses(() => {
      throw new Error("сценарий сломан");
    });

    const response = await fetch(`${mock.baseUrl}/responses`, {
      method: "POST",
      body: JSON.stringify({ input: [] }),
    });
    const reply = await response.text();

    expect(response.status).toBe(500);
    expect(reply).toContain("сценарий сломан");
    await expect(mock.close()).rejects.toThrow("сценарий сломан");
  });
});
