import ListVideo from "lucide-solid/icons/list-video";
import MessageSquareText from "lucide-solid/icons/message-square-text";
import type { JSX } from "solid-js";
import { LocalJournal } from "@/widgets/build-journal";
import { LocalFactory } from "@/widgets/factory";
import { LocalRecordingList } from "@/widgets/local-recording-list";
import { PANELS } from "@/shared/config/panels.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { Button, Drawer } from "@/shared/ui";
import styles from "./Viewer.module.css";

interface Props {
  /** Interface language: the menu, panels and floor captions are in it. */
  locale: Locale;
}

const ICON_STROKE = 2.5;

/**
 * The page of `cyberzavod view`: the factory floor with the project's own recordings and drafts,
 * a menu of two tiles on the left and two slide-out panels, the list and the build log. This is the
 * one place that puts widgets side by side outside the Astro pages.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Interface language.
 * @returns {JSX.Element} The page.
 */
export function Viewer(props: Props): JSX.Element {
  const closeLabel = () => UI_TEXT.panels.close[props.locale];

  return (
    <>
      <div class={styles.viewer}>
        <nav class={styles.menu} aria-label={UI_TEXT.menu.label[props.locale]}>
          <ul class={styles.tiles}>
            <li>
              <Button layout="tile" popovertarget={PANELS.records}>
                <ListVideo stroke-width={ICON_STROKE} />
                {UI_TEXT.menu.records[props.locale]}
              </Button>
            </li>
            <li>
              <Button layout="tile" popovertarget={PANELS.journal}>
                <MessageSquareText stroke-width={ICON_STROKE} />
                {UI_TEXT.menu.journal[props.locale]}
              </Button>
            </li>
          </ul>
        </nav>
        <main class={styles.field}>
          <LocalFactory locale={props.locale} />
        </main>
      </div>
      <Drawer
        id={PANELS.records}
        title={UI_TEXT.panels.records[props.locale]}
        closeLabel={closeLabel()}
      >
        <LocalRecordingList locale={props.locale} />
      </Drawer>
      <Drawer
        id={PANELS.journal}
        title={UI_TEXT.panels.journal[props.locale]}
        closeLabel={closeLabel()}
      >
        <LocalJournal locale={props.locale} />
      </Drawer>
    </>
  );
}
