#!/usr/bin/env node
// Prints where the built factory floor lies and exits. The package serves nothing itself:
// `npx cyberzavod view` runs this through npx, reads the path and serves the files from its own
// server, so reading the journal, drafts, messages and path safety stay in one place, the CLI.

import { fileURLToPath } from "node:url";

process.stdout.write(`${fileURLToPath(new URL("../dist/", import.meta.url))}\n`);
