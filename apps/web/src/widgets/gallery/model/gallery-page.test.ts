import { describe, expect, it, vi } from "vitest";
import type { Gallery } from "@/entities/gallery";
import { ApiRequestError } from "@/shared/api/errors.ts";
import { createGalleryPageModel, type GalleryRequests } from "./gallery-page.ts";

function aliceGallery(): Gallery {
  return { login: "alice", recordings: [] };
}

function requestsOf(galleries: readonly string[]): GalleryRequests {
  return {
    fetchGallery: (login) =>
      galleries.includes(login)
        ? Promise.resolve(aliceGallery())
        : Promise.reject(new ApiRequestError(404, "not_found", "нет")),
  };
}

describe("createGalleryPageModel", () => {
  it("начинает с открытия: адрес ещё не прочитан", () => {
    const model = createGalleryPageModel(requestsOf(["alice"]));

    const page = model.$page.get();

    expect(page).toEqual({ view: "opening" });
  });

  it("показывает вступление, если в адресе нет автора", async () => {
    const requests = { fetchGallery: vi.fn(() => Promise.resolve(aliceGallery())) };
    const model = createGalleryPageModel(requests);

    await model.open("");

    expect(model.$page.get()).toEqual({ view: "intro" });
    expect(requests.fetchGallery).not.toHaveBeenCalled();
  });

  it("показывает галерею автора из адреса", async () => {
    const model = createGalleryPageModel(requestsOf(["alice"]));

    await model.open("?user=alice");

    expect(model.$page.get()).toEqual({
      view: "author",
      login: "alice",
      gallery: { status: "ready", value: aliceGallery() },
    });
  });

  it("называет закрытую галерею отсутствующей", async () => {
    const model = createGalleryPageModel(requestsOf(["alice"]));

    await model.open("?user=bob");

    expect(model.$page.get()).toEqual({
      view: "author",
      login: "bob",
      gallery: { status: "missing" },
    });
  });
});
