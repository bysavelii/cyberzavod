// Builds the factory floor of `cyberzavod view` from the site's sources: the entry and the widgets
// live in `apps/web`, this package only turns them into static files and ships them.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { astroComponentStub } from "./build/astro-component-stub.ts";
import { thirdPartyLicenses } from "./build/licenses.ts";

const WEB_SOURCES = fileURLToPath(new URL("../../apps/web/src/", import.meta.url));
const VIEWER_ENTRY = fileURLToPath(new URL("../../apps/web/src/app/viewer", import.meta.url));
const OUTPUT = fileURLToPath(new URL("./dist", import.meta.url));

export default defineConfig({
  root: VIEWER_ENTRY,
  // Relative addresses: the server may put the files at any path, and nothing is fetched from a
  // network.
  base: "./",
  plugins: [astroComponentStub(), solid(), thirdPartyLicenses()],
  resolve: { alias: [{ find: /^@\//, replacement: WEB_SOURCES }] },
  build: { outDir: OUTPUT, emptyOutDir: true, sourcemap: false },
});
