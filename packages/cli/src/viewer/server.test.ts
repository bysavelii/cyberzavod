import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalHost, startViewerServer, type ViewerServer } from "./server.ts";
import type { StaticFile } from "./static-files.ts";

const INDEX_TEXT = "<!doctype html><title>factory</title>";
const SCRIPT_TEXT = "console.log('floor');";
const RECORDINGS = { published: [{ id: "a" }], drafts: [] };

interface Reply {
  status: number | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let directory: string;
let server: ViewerServer;
let onFailure: (err: unknown) => void;

// The request goes out as written: `fetch` would normalize `..` and encoded dots in the path.
function send(options: { path?: string; method?: string; host?: string }): Promise<Reply> {
  const { hostname, port } = new URL(server.url);

  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname,
        port,
        path: options.path ?? "/",
        method: options.method ?? "GET",
        headers: options.host === undefined ? {} : { Host: options.host },
      },
      (incoming) => {
        const chunks: Buffer[] = [];

        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () =>
          resolve({
            status: incoming.statusCode,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );

    outgoing.on("error", reject);
    outgoing.end();
  });
}

function canConnect(target: { host: string; port: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(target, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => resolve(false));
  });
}

async function serve(recordings: () => Promise<unknown>): Promise<void> {
  const index = path.join(directory, "index.html");
  const script = path.join(directory, "app.js");
  const files = new Map<string, StaticFile>([
    ["/", { file: index, contentType: "text/html; charset=utf-8" }],
    ["/index.html", { file: index, contentType: "text/html; charset=utf-8" }],
    ["/assets/app.js", { file: script, contentType: "text/javascript; charset=utf-8" }],
  ]);

  server = await startViewerServer({ files, recordings, onFailure });
}

describe("startViewerServer", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-server-"));
    await writeFile(path.join(directory, "index.html"), INDEX_TEXT);
    await writeFile(path.join(directory, "app.js"), SCRIPT_TEXT);
    await writeFile(path.join(directory, "secret.txt"), "secret");
    onFailure = vi.fn();
    await serve(() => Promise.resolve(RECORDINGS));
  });

  afterEach(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("называет в адресе тот адрес, на котором слушает: 127.0.0.1", () => {
    const { hostname } = new URL(server.url);

    expect(hostname).toBe("127.0.0.1");
  });

  it("не принимает соединений на других адресах, например на ::1", async () => {
    const { port } = new URL(server.url);

    const isConnected = await canConnect({ host: "::1", port: Number(port) });

    expect(isConnected).toBe(false);
  });

  it("отдаёт index.html по корню с типом содержимого", async () => {
    const reply = await send({ path: "/" });

    expect({ status: reply.status, type: reply.headers["content-type"], body: reply.body }).toEqual(
      {
        status: 200,
        type: "text/html; charset=utf-8",
        body: INDEX_TEXT,
      },
    );
  });

  it("отдаёт скрипт с типом javascript и запретом угадывать тип", async () => {
    const reply = await send({ path: "/assets/app.js" });

    expect({
      status: reply.status,
      type: reply.headers["content-type"],
      nosniff: reply.headers["x-content-type-options"],
      body: reply.body,
    }).toEqual({
      status: 200,
      type: "text/javascript; charset=utf-8",
      nosniff: "nosniff",
      body: SCRIPT_TEXT,
    });
  });

  it("не учитывает строку запроса при поиске файла", async () => {
    const reply = await send({ path: "/?lang=ru" });

    expect(reply.body).toBe(INDEX_TEXT);
  });

  it("отдаёт список записей JSON без кэша", async () => {
    const reply = await send({ path: "/api/recordings" });

    expect({
      status: reply.status,
      type: reply.headers["content-type"],
      cache: reply.headers["cache-control"],
      body: JSON.parse(reply.body),
    }).toEqual({
      status: 200,
      type: "application/json; charset=utf-8",
      cache: "no-store",
      body: RECORDINGS,
    });
  });

  it("на HEAD отвечает заголовками без тела", async () => {
    const reply = await send({ path: "/", method: "HEAD" });

    expect({ status: reply.status, body: reply.body }).toEqual({ status: 200, body: "" });
  });

  it.each([
    ["обычный выход из каталога", "/../secret.txt"],
    ["закодированная косая черта", "/..%2f..%2fsecret.txt"],
    ["закодированные точки", "/%2e%2e/secret.txt"],
    ["файл рядом с цехом", "/secret.txt"],
    ["выход через каталог файлов", "/assets/../../secret.txt"],
    ["полный адрес в запросе", "http://example.com/"],
  ])("на %s отвечает 404", async (_name, requestedPath) => {
    const reply = await send({ path: requestedPath });

    expect({ status: reply.status, body: reply.body }).toEqual({ status: 404, body: "" });
  });

  it("с чужим Host отвечает 403, в том числе на запись списка", async () => {
    const pages = await Promise.all(
      ["/", "/api/recordings"].map((requestedPath) =>
        send({ path: requestedPath, host: "example.com" }),
      ),
    );

    expect(pages.map((reply) => reply.status)).toEqual([403, 403]);
  });

  it("с Host без порта отвечает 403", async () => {
    const reply = await send({ host: "127.0.0.1" });

    expect(reply.status).toBe(403);
  });

  it("принимает Host localhost с портом сервера", async () => {
    const { port } = new URL(server.url);

    const reply = await send({ host: `localhost:${port}` });

    expect(reply.status).toBe(200);
  });

  it.each(["POST", "PUT", "DELETE"])(
    "на %s отвечает 405 и называет допустимые методы",
    async (method) => {
      const reply = await send({ path: "/api/recordings", method });

      expect({ status: reply.status, allow: reply.headers.allow }).toEqual({
        status: 405,
        allow: "GET, HEAD",
      });
    },
  );

  it("при ошибке чтения журнала отвечает 500 и сообщает причину", async () => {
    await server.close();
    const failure = new Error("corrupt record");

    await serve(() => Promise.reject(failure));

    const reply = await send({ path: "/api/recordings" });

    expect({ status: reply.status, reported: vi.mocked(onFailure).mock.calls }).toEqual({
      status: 500,
      reported: [[failure]],
    });
  });

  it("не отдаёт причину ошибки браузеру", async () => {
    await server.close();
    await serve(() => Promise.reject(new Error("/home/user/secret path")));

    const reply = await send({ path: "/api/recordings" });

    expect(reply.body).not.toContain("secret");
  });
});

describe("isLocalHost", () => {
  it.each([
    ["127.0.0.1:4000", 4000, true],
    ["localhost:4000", 4000, true],
    ["127.0.0.1:4001", 4000, false],
    ["example.com:4000", 4000, false],
    ["localhost", 4000, false],
    ["127.0.0.1:4000.evil.com", 4000, false],
    ["[::1]:4000", 4000, false],
    ["LOCALHOST:4000", 4000, false],
    [undefined, 4000, false],
    ["127.0.0.1:4000", undefined, false],
  ])("для %s и порта %s даёт %s", (host, port, expected) => {
    const isLocal = isLocalHost(host, port);

    expect(isLocal).toBe(expected);
  });
});
