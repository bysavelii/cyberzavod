import { describe, expect, it } from "vitest";
import {
  badgeImageUrl,
  badgeMarkdown,
  galleryUrl,
  queryParamOf,
  sharedRecordingUrl,
} from "./url.ts";

describe("galleryUrl", () => {
  it.each([
    ["en", "/gallery/?user=alice"],
    ["ru", "/ru/gallery/?user=alice"],
  ] as const)("ведёт на галерею автора на языке %s", (locale, expected) => {
    const url = galleryUrl("alice", locale);

    expect(url).toBe(expected);
  });

  it("кодирует логин в параметре", () => {
    const url = galleryUrl("a&b", "en");

    expect(url).toBe("/gallery/?user=a%26b");
  });
});

describe("sharedRecordingUrl", () => {
  it.each([
    ["en", "/r/?id=k3f9x2m1q8zt"],
    ["ru", "/ru/r/?id=k3f9x2m1q8zt"],
  ] as const)("ведёт на запись по секретной ссылке на языке %s", (locale, expected) => {
    const url = sharedRecordingUrl("k3f9x2m1q8zt", locale);

    expect(url).toBe(expected);
  });
});

describe("badgeImageUrl", () => {
  it("ведёт на картинку бейджа в API", () => {
    const url = badgeImageUrl("alice");

    expect(url).toBe("/api/badges/alice.svg");
  });
});

describe("badgeMarkdown", () => {
  it("собирает бейдж с абсолютными адресами картинки и галереи", () => {
    const markdown = badgeMarkdown("alice", "https://example.com/");

    expect(markdown).toBe(
      "[![Built at Cyberzavod](https://example.com/api/badges/alice.svg)](https://example.com/gallery/?user=alice)",
    );
  });
});

describe("queryParamOf", () => {
  it("читает slug записи", () => {
    const slug = queryParamOf("?id=k3f9x2m1q8zt", "recording");

    expect(slug).toBe("k3f9x2m1q8zt");
  });

  it("читает логин автора", () => {
    const login = queryParamOf("?user=alice", "galleryOwner");

    expect(login).toBe("alice");
  });

  it.each(["", "?id=", "?user=alice"])("не находит slug в %j", (search) => {
    const slug = queryParamOf(search, "recording");

    expect(slug).toBeUndefined();
  });
});
