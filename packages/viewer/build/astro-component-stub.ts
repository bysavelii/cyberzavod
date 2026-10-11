import type { Plugin } from "vite";

const ASTRO_FILE = /\.astro$/;
const STUB_PREFIX = "\0astro-component-stub:";

/**
 * Vite plugin that stands in for Astro components. The site's slices export their `.astro` pages
 * and their Solid islands from one `index.ts`, and the floor imports only the islands; the stub
 * lets the build read that file without Astro and is dropped as unused. A component that were
 * really used would throw when called.
 * @returns {Plugin} Plugin for the build.
 */
export function astroComponentStub(): Plugin {
  return {
    name: "cyberzavod-astro-component-stub",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!ASTRO_FILE.test(source)) return undefined;

      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });

      return resolved === null ? undefined : `${STUB_PREFIX}${resolved.id}`;
    },
    load(id) {
      if (!id.startsWith(STUB_PREFIX)) return undefined;

      const component = id.slice(STUB_PREFIX.length);

      return `export default function AstroComponent() { throw new Error(${JSON.stringify(
        `the Astro component ${component} cannot be used on the viewer's floor`,
      )}); }`;
    },
  };
}
