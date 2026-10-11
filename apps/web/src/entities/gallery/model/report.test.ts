import { describe, expect, it } from "vitest";
import { site } from "@/shared/config/site.ts";
import {
  galleryReportUrl,
  recordingReportUrl,
  REPORT_LINK_FIELD,
  REPORT_TEMPLATE,
} from "./report.ts";

const SITE_URL = "https://example.com/";

describe("recordingReportUrl", () => {
  it("открывает форму жалобы в репозитории сайта", () => {
    const url = new URL(recordingReportUrl("k3f9x2m1q8zt", SITE_URL));

    expect(`${url.origin}${url.pathname}`).toBe(`${site.repoUrl}/issues/new`);
    expect(url.searchParams.get("template")).toBe(REPORT_TEMPLATE);
  });

  it("кладёт в поле ссылки абсолютный адрес записи на языке по умолчанию", () => {
    const url = new URL(recordingReportUrl("k3f9x2m1q8zt", SITE_URL));

    expect(url.searchParams.get(REPORT_LINK_FIELD)).toBe("https://example.com/r/?id=k3f9x2m1q8zt");
  });

  it("экранирует адрес записи в параметре", () => {
    const url = recordingReportUrl("a&b=c", SITE_URL);

    expect(url).not.toContain("&b=c");
    expect(new URL(url).searchParams.get(REPORT_LINK_FIELD)).toBe(
      "https://example.com/r/?id=a%26b%3Dc",
    );
  });
});

describe("galleryReportUrl", () => {
  it("кладёт в поле ссылки абсолютный адрес галереи на языке по умолчанию", () => {
    const url = new URL(galleryReportUrl("alice", SITE_URL));

    expect(url.searchParams.get(REPORT_LINK_FIELD)).toBe("https://example.com/gallery/?user=alice");
    expect(url.searchParams.get("template")).toBe(REPORT_TEMPLATE);
  });

  it("экранирует логин в адресе галереи", () => {
    const url = new URL(galleryReportUrl("a&b", SITE_URL));

    expect(url.searchParams.get(REPORT_LINK_FIELD)).toBe("https://example.com/gallery/?user=a%26b");
  });
});
