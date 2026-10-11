// Entry of the `cyberzavod view` page: the Solid app on top of the factory floor widgets. Vite
// builds it on its own (`packages/viewer`); the site's Astro build does not know it.

import "@fontsource-variable/rubik";
import "@fontsource-variable/nunito";
import "@/app/styles/global.css";
import { render } from "solid-js/web";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { Viewer } from "./Viewer.tsx";
import { viewerLocaleOf } from "./viewer-locale.ts";

const root = document.getElementById("root");

if (root === null) throw new Error("в index.html нет #root");

const locale = viewerLocaleOf(window.location.search);

document.documentElement.lang = locale;
document.title = UI_TEXT.viewer.title[locale];
render(() => <Viewer locale={locale} />, root);
