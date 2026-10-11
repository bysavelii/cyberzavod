import { RECORD_LIMITS } from "@cyberzavod/core";
import { describe, expect, it, vi } from "vitest";
import { CommandError } from "../errors.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import { ApiError } from "../sharing/api.ts";
import {
  author,
  fakeApi,
  fakeSharing,
  memoryCredentials,
  SECRET_TOKEN,
  summary,
  temporaryProject,
  TEST_SITE_URL,
  validSession,
  writeSessionFile,
  captureOutput,
} from "../sharing/fixtures.ts";
import { shareRecording, unshareRecording } from "./share.ts";

const SESSION_ID = "2026-10-07-demo";

async function projectWithSession(): Promise<string> {
  const root = await temporaryProject();

  await writeSessionFile(root, SESSION_ID, JSON.stringify(validSession(SESSION_ID)));

  return root;
}

describe("shareRecording", () => {
  const printed = captureOutput();
  const messages = CLI_MESSAGES.ru;

  it("отправляет запись и печатает секретную ссылку", async () => {
    const root = await projectWithSession();
    const api = fakeApi({
      uploadRecording: vi.fn(async () => ({ recording: summary({ slug: "abc123" }), isNew: true })),
    });

    await shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });

    expect(api.uploadRecording).toHaveBeenCalledWith(SECRET_TOKEN, SESSION_ID, validSession());
    expect(printed()).toContain(`запись ${SESSION_ID} отправлена`);
    expect(printed()).toContain(`ссылка: ${TEST_SITE_URL}/r/?id=abc123`);
  });

  it("подсказывает открыть галерею, пока она закрыта", async () => {
    const root = await projectWithSession();

    await shareRecording(fakeSharing(), { directory: root, id: SESSION_ID, messages });

    expect(printed()).toContain("cyberzavod gallery --public");
  });

  it("не подсказывает про открытие, если галерея уже открыта", async () => {
    const root = await projectWithSession();
    const api = fakeApi({ me: vi.fn(async () => author({ galleryPublic: true })) });

    await shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });

    expect(printed()).not.toContain("--public");
  });

  it("повторная отправка сообщает, что запись заменена", async () => {
    const root = await projectWithSession();
    const api = fakeApi({
      uploadRecording: vi.fn(async () => ({ recording: summary(), isNew: false })),
    });

    await shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });

    expect(printed()).toContain(`запись ${SESSION_ID} заменена`);
  });

  it("не печатает токен", async () => {
    const root = await projectWithSession();

    await shareRecording(fakeSharing(), { directory: root, id: SESSION_ID, messages });

    expect(printed()).not.toContain(SECRET_TOKEN);
  });

  it("limit_reached показывает записи и команду unshare", async () => {
    const root = await projectWithSession();
    const full = author({
      recordings: [summary({ id: "old-one", title: "Старая сборка" })],
      limit: 1,
    });
    const api = fakeApi({
      uploadRecording: vi.fn(async () =>
        Promise.reject(new ApiError("Лимит записей исчерпан", "limit_reached", 409)),
      ),
      me: vi.fn(async () => full),
    });

    const act = () =>
      shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });
    const error = await act().then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).describe(messages)).toMatch(
      /максимум записей[\s\S]*1 из 1[\s\S]*old-one {2}Старая сборка[\s\S]*cyberzavod unshare <id>/,
    );
  });

  it("id_mismatch от сервера доходит до человека без изменений", async () => {
    const root = await projectWithSession();
    const api = fakeApi({
      uploadRecording: vi.fn(async () =>
        Promise.reject(new ApiError("id в записи не совпадает", "id_mismatch", 400)),
      ),
    });

    const act = () =>
      shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toMatchObject({ code: "id_mismatch" });
  });

  it("без записи в журнале — понятная ошибка и ничего не уходит на сервер", async () => {
    const root = await temporaryProject();
    const sharing = fakeSharing();

    const act = () => shareRecording(sharing, { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/no recording 2026-10-07-demo in the journal/);
    expect(sharing.api.uploadRecording).not.toHaveBeenCalled();
  });

  it("запись, не прошедшая parseRecord, не отправляется", async () => {
    const root = await temporaryProject();

    await writeSessionFile(root, SESSION_ID, JSON.stringify({ type: "session", id: SESSION_ID }));
    const sharing = fakeSharing();

    const act = () => shareRecording(sharing, { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/failed validation/);
    expect(sharing.api.uploadRecording).not.toHaveBeenCalled();
  });

  it("запись с полем длиннее предела не отправляется", async () => {
    const root = await temporaryProject();
    const session = validSession(SESSION_ID);
    const longText = "а".repeat(RECORD_LIMITS.textLength + 1);
    const events = [
      { t: 0, type: "build_start" },
      { t: 5, type: "message", from: "foreman", to: "planning", line: "Задача", text: longText },
      { t: 10, type: "build_end", ok: true },
    ];

    await writeSessionFile(
      root,
      SESSION_ID,
      JSON.stringify({ ...session, data: { ...session.data, events } }),
    );
    const sharing = fakeSharing();

    const act = () => shareRecording(sharing, { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(
      `failed validation: event #1: text must be at most ${RECORD_LIMITS.textLength}`,
    );
    expect(sharing.api.uploadRecording).not.toHaveBeenCalled();
  });

  it("битый JSON — ошибка проверки, а не трасса стека", async () => {
    const root = await temporaryProject();

    await writeSessionFile(root, SESSION_ID, "{не json");

    const act = () => shareRecording(fakeSharing(), { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/failed validation/);
  });

  it("решение вместо сессии не отправляется", async () => {
    const root = await temporaryProject();
    const decision = {
      version: 1,
      type: "decision",
      id: SESSION_ID,
      timestamp: "2026-10-07T10:24:00.000Z",
      projectId: "demo",
      source: { type: "manual" },
      data: { title: "Решение", description: "" },
    };

    await writeSessionFile(root, SESSION_ID, JSON.stringify(decision));

    const act = () => shareRecording(fakeSharing(), { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/a session is required/);
  });

  it("без входа просит войти", async () => {
    const root = await projectWithSession();
    const sharing = fakeSharing({ credentials: memoryCredentials() });

    const act = () => shareRecording(sharing, { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/not signed in: sign in with npx cyberzavod login/);
    expect(sharing.api.uploadRecording).not.toHaveBeenCalled();
  });

  it("токен, который сервер не принял, — просьба войти заново", async () => {
    const root = await projectWithSession();
    const api = fakeApi({
      uploadRecording: vi.fn(async () =>
        Promise.reject(new ApiError("Не авторизован", "unauthorized", 401)),
      ),
    });

    const act = () =>
      shareRecording(fakeSharing({ api }), { directory: root, id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/did not accept the token: sign in again/);
  });

  it("id с путём не читает файлы вне журнала", async () => {
    const root = await temporaryProject();

    const act = () =>
      shareRecording(fakeSharing(), { directory: root, id: "../../secret", messages });

    await expect(act()).rejects.toThrow(/does not look like a recording id/);
  });

  it("вне проекта — ошибка команды", async () => {
    const act = () => shareRecording(fakeSharing(), { directory: "/", id: SESSION_ID, messages });

    await expect(act()).rejects.toThrow(/is not in a Cyberzavod project/);
  });
});

describe("unshareRecording", () => {
  const printed = captureOutput();
  const messages = CLI_MESSAGES.ru;

  it("удаляет запись на сервере", async () => {
    const sharing = fakeSharing();

    await unshareRecording(sharing, SESSION_ID, messages);

    expect(sharing.api.deleteRecording).toHaveBeenCalledWith(SECRET_TOKEN, SESSION_ID);
    expect(printed()).toContain(`запись ${SESSION_ID} удалена из галереи`);
  });

  it("без входа просит войти", async () => {
    const sharing = fakeSharing({ credentials: memoryCredentials() });

    const act = () => unshareRecording(sharing, SESSION_ID, messages);

    await expect(act()).rejects.toThrow(/not signed in/);
  });

  it("not_found от сервера доходит до человека", async () => {
    const api = fakeApi({
      deleteRecording: vi.fn(async () =>
        Promise.reject(new ApiError("Записи нет", "not_found", 404)),
      ),
    });

    const act = () => unshareRecording(fakeSharing({ api }), SESSION_ID, messages);

    await expect(act()).rejects.toThrow("Записи нет");
  });
});
