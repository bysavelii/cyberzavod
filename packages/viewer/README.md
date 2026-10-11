# @cyberzavod/viewer

The Cyberzavod factory floor for your own recordings and drafts: the project's journal sessions and the builds of its session drafts play on the same pixel-art floor as on [cyberzavod.com](https://cyberzavod.com).

This package has no commands to run by hand. [`npx cyberzavod view`](https://www.npmjs.com/package/cyberzavod) fetches it into the npx cache on the first run, starts a server on `127.0.0.1` that reads your project's journal and opens the floor in the browser. Later runs take the package from the cache and need no network.

## What is inside

- `dist/`: the floor as static files. It loads nothing from the network, and the fonts are included. `dist/THIRD_PARTY_LICENSES` carries the licenses of the third-party packages and fonts it contains.
- `bin/cyberzavod-viewer.mjs`: prints the absolute path of `dist/` and exits. `cyberzavod view` reads it and serves the files itself, together with your recordings.

The package has no dependencies and changes nothing in your project.

## Versions

The version is the same as the `cyberzavod` package's: `cyberzavod@X.Y.Z` fetches `@cyberzavod/viewer@X.Y.Z`.

## License

MIT
