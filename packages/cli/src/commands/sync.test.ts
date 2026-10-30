import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_TOOL_FILE } from "@cyberzavod/storage";
import { adapters } from "../agents/fixtures.ts";
import { confirmWithoutAsking } from "../confirmation.ts";
import {
  HARNESS_VERSION,
  readInstallation,
  type Installation,
} from "../installation/installation.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import { initProject } from "./init.ts";
import { requireProjectAt } from "./project.ts";
import { inspectProjectFiles } from "./sync.ts";

const messages = CLI_MESSAGES.en;

let root: string;
let installation: Installation;

describe("inspectProjectFiles", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cyberzavod-sync-"));
    installation = await readInstallation();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await initProject(root, {
      confirm: confirmWithoutAsking,
      overrides: {},
      installation,
      messages,
      adapters,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("на свежем проекте ничего не находит", async () => {
    const project = await requireProjectAt(root);

    const inspection = await inspectProjectFiles(project, installation, [adapters.claude]);

    expect(inspection).toEqual({
      report: { added: [], updated: [], removed: [], conflicts: [], edited: [] },
      configVersion: HARNESS_VERSION,
      isHarnessOutdated: false,
    });
  });

  it("находит исправленный руками файл, ничего не записывая", async () => {
    await appendFile(path.join(root, "CLAUDE.md"), "\nstale\n");
    const project = await requireProjectAt(root);

    const first = await inspectProjectFiles(project, installation, [adapters.claude]);
    const second = await inspectProjectFiles(project, installation, [adapters.claude]);

    expect({ edited: first.report.edited, again: second.report.edited }).toEqual({
      edited: ["CLAUDE.md"],
      again: ["CLAUDE.md"],
    });
  });

  it("называет заменённый человеком сгенерированный файл исправленным руками", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Mine\n");
    const project = await requireProjectAt(root);

    const inspection = await inspectProjectFiles(project, installation, [adapters.claude]);

    expect(inspection.report.edited).toEqual(["CLAUDE.md"]);
  });

  it("находит прежний вшитый CLI как лишний файл", async () => {
    const legacyTool = path.join(root, ...LEGACY_TOOL_FILE.split("/"));

    await mkdir(path.dirname(legacyTool), { recursive: true });
    await writeFile(legacyTool, "// old");
    const project = await requireProjectAt(root);

    const inspection = await inspectProjectFiles(project, installation, [adapters.claude]);

    expect(inspection.report.removed).toEqual([LEGACY_TOOL_FILE]);
  });

  it("отмечает версию harness в конфиге, которая отстала от CLI", async () => {
    const project = await requireProjectAt(root);
    const outdated = { ...project, config: { ...project.config, harness: "0.1.0" } };

    const inspection = await inspectProjectFiles(outdated, installation, [adapters.claude]);

    expect({ version: inspection.configVersion, outdated: inspection.isHarnessOutdated }).toEqual({
      version: "0.1.0",
      outdated: true,
    });
  });
});
