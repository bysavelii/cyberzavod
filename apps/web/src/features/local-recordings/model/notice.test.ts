import { describe, expect, it } from "vitest";
import type { LocalRecordings } from "@/entities/recording-file";
import type { Remote } from "@/shared/api/remote.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { noticeOf } from "./notice.ts";

function readyWith(recordings: Partial<LocalRecordings>): Remote<LocalRecordings> {
  return { status: "ready", value: { published: [], drafts: [], ...recordings } };
}

describe("noticeOf", () => {
  it.each([
    [{ status: "loading" }, UI_TEXT.viewer.loading.ru],
    [{ status: "broken" }, UI_TEXT.viewer.broken.ru],
    [{ status: "failed" }, UI_TEXT.viewer.failed.ru],
    [{ status: "missing" }, UI_TEXT.viewer.failed.ru],
    [readyWith({}), UI_TEXT.viewer.empty.ru],
  ] as const)("объясняет состояние %j", (state, expected) => {
    const notice = noticeOf(state, "ru");

    expect(notice).toBe(expected);
  });

  it("молчит, когда есть что проигрывать", () => {
    const record = {} as LocalRecordings["drafts"][number];

    const notice = noticeOf(readyWith({ drafts: [record] }), "en");

    expect(notice).toBeUndefined();
  });
});
