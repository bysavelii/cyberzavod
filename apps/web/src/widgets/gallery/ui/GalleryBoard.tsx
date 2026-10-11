import { Match, onMount, Show, Switch, type JSX } from "solid-js";
import { cabinetUrl } from "@/entities/account";
import { fetchGallery } from "@/entities/gallery";
import { readyValue } from "@/shared/api/remote.ts";
import { remoteNoticeOf } from "@/shared/api/remote-notice.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { useStoreValue } from "@/shared/lib/use-store-value.ts";
import { ButtonLink, Title } from "@/shared/ui";
import { createGalleryPageModel, type GalleryPage } from "../model/gallery-page.ts";
import { AuthorGallery } from "./AuthorGallery.tsx";
import styles from "./GalleryBoard.module.css";

interface Props {
  /** Page language. */
  locale: Locale;
  /** Site address, `site` from the Astro config: for the badge line in the README. */
  siteUrl: string;
}

type AuthorPage = Extract<GalleryPage, { view: "author" }>;

function IntroView(props: { locale: Locale }): JSX.Element {
  return (
    <>
      <Title as="h1" size="xl">
        {UI_TEXT.pages.galleriesTitle[props.locale]}
      </Title>
      <p class={styles.note}>{UI_TEXT.gallery.intro[props.locale]}</p>
      <p class={styles.note}>{UI_TEXT.account.ownGallery[props.locale]}</p>
      <div class={styles.links}>
        <ButtonLink href={cabinetUrl(props.locale)}>
          {UI_TEXT.pages.cabinetTitle[props.locale]}
        </ButtonLink>
      </div>
    </>
  );
}

function AuthorView(props: { page: AuthorPage; siteUrl: string; locale: Locale }): JSX.Element {
  return (
    <>
      <Title as="h1" size="xl">
        {UI_TEXT.gallery.authorHeading[props.locale](props.page.login)}
      </Title>
      <Show
        when={readyValue(props.page.gallery)}
        fallback={
          <p class={styles.note}>
            {remoteNoticeOf(props.page.gallery, UI_TEXT.gallery.missing, props.locale)}
          </p>
        }
      >
        {(gallery) => (
          <AuthorGallery gallery={gallery()} siteUrl={props.siteUrl} locale={props.locale} />
        )}
      </Show>
    </>
  );
}

/**
 * The galleries page: with `?user=<login>`, an author's gallery with a badge for the README;
 * without it, an introduction saying a gallery opens by its author's link. Data comes from the
 * API in the browser.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Page language.
 * @param {string} props.siteUrl Site address.
 * @returns {JSX.Element} The introduction or an author's gallery.
 */
export function GalleryBoard(props: Props): JSX.Element {
  const model = createGalleryPageModel({ fetchGallery: (login) => fetchGallery(login) });
  const page = useStoreValue(model.$page);
  const isIntro = () => page().view === "intro";
  const authorPage = () => {
    const current = page();

    return current.view === "author" ? current : undefined;
  };

  onMount(() => void model.open(window.location.search));

  // While the page is `opening`, nothing is shown but the loading text: the introduction must not
  // flash for those who came by an author's link.
  return (
    <div class={styles.board}>
      <Switch fallback={<p class={styles.note}>{UI_TEXT.remote.loading[props.locale]}</p>}>
        <Match when={isIntro()}>
          <IntroView locale={props.locale} />
        </Match>
        <Match when={authorPage()}>
          {(author) => <AuthorView page={author()} siteUrl={props.siteUrl} locale={props.locale} />}
        </Match>
      </Switch>
    </div>
  );
}
