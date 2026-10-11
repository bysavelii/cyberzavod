import { describe, expect, it } from "vitest";
import { ApiRequestError, ApiResponseError } from "./errors.ts";
import { getJson, sendCommand, type ApiRequest } from "./http.ts";

function respondWith(body: string, status: number): ApiRequest {
  return () => Promise.resolve(new Response(body, { status }));
}

describe("getJson", () => {
  it("отдаёт тело успешного ответа", async () => {
    const request = respondWith('{"recordings": 3}', 200);

    const body = await getJson("/api/me", request);

    expect(body).toEqual({ recordings: 3 });
  });

  it("бросает ошибку с кодом и статусом из ответа API", async () => {
    const request = respondWith('{"error": "not_found", "message": "нет"}', 404);

    const act = getJson("/api/galleries/ghost", request);

    await expect(act).rejects.toEqual(
      expect.objectContaining({ status: 404, code: "not_found" }) as ApiRequestError,
    );
  });

  it("помечает код неизвестным, если тело ошибки не JSON", async () => {
    const request = respondWith("<html>Bad Gateway</html>", 502);

    const act = getJson("/api/me", request);

    await expect(act).rejects.toEqual(
      expect.objectContaining({ status: 502, code: "unknown" }) as ApiRequestError,
    );
  });

  it("отклоняет успешный ответ, тело которого не JSON", async () => {
    const request = respondWith("<html></html>", 200);

    const act = getJson("/api/me", request);

    await expect(act).rejects.toBeInstanceOf(ApiResponseError);
  });
});

describe("sendCommand", () => {
  it("шлёт тело в JSON с методом и заголовком", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const request: ApiRequest = (path, init) => {
      calls.push([path, init]);

      return Promise.resolve(new Response('{"galleryPublic": true}', { status: 200 }));
    };

    await sendCommand({ method: "PUT", path: "/api/me/gallery", body: { public: true } }, request);

    expect(calls).toEqual([
      [
        "/api/me/gallery",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: '{"public":true}',
        },
      ],
    ]);
  });

  it("шлёт запрос без тела без заголовка", async () => {
    const calls: (RequestInit | undefined)[] = [];
    const request: ApiRequest = (_path, init) => {
      calls.push(init);

      return Promise.resolve(new Response(null, { status: 204 }));
    };

    await sendCommand({ method: "DELETE", path: "/api/me/recordings/a-1" }, request);

    expect(calls).toEqual([{ method: "DELETE" }]);
  });

  it("бросает ошибку с кодом из ответа API", async () => {
    const request = respondWith('{"error": "forbidden_origin", "message": "нет"}', 403);

    const act = sendCommand({ method: "POST", path: "/api/auth/logout" }, request);

    await expect(act).rejects.toEqual(
      expect.objectContaining({ status: 403, code: "forbidden_origin" }) as ApiRequestError,
    );
  });
});
