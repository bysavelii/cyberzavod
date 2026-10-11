// Opening an address in the human's default browser with the system's own program, so the CLI
// needs no dependency for it.

import { spawn } from "node:child_process";

/** A program and its arguments. */
export interface BrowserCommand {
  command: string;
  args: string[];
}

const WINDOWS_PLATFORM: NodeJS.Platform = "win32";
const MAC_PLATFORM: NodeJS.Platform = "darwin";

/**
 * The system program that opens an address in the default browser. Windows goes through
 * `rundll32`, not `cmd start`: no shell parses the address, so an `&` in it stays in it.
 * @param {string} url Address to open.
 * @param {string} platform Node.js platform name the CLI runs on, for example `win32`.
 * @returns {BrowserCommand} Program and arguments; a shell is not needed.
 */
export function browserCommandOf(url: string, platform: NodeJS.Platform): BrowserCommand {
  if (platform === WINDOWS_PLATFORM) {
    return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  }

  if (platform === MAC_PLATFORM) return { command: "open", args: [url] };

  return { command: "xdg-open", args: [url] };
}

/**
 * Starts the program and does not wait for it: it is detached from the terminal's process group,
 * so Ctrl+C stops `view` and not the human's browser, and a program that stays running (a text
 * browser, a slow desktop) cannot keep `view` from stopping.
 * @param {BrowserCommand} command Program and arguments.
 * @returns {Promise<boolean>} true once the program has started; false if it could not start, for
 *   example because it is not installed.
 */
export function launchBrowser({ command, args }: BrowserCommand): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });

    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/**
 * Opens the address in the default browser.
 * @param {string} url Address to open.
 * @returns {Promise<boolean>} false if the program is missing: not an error, the human opens the
 *   address themselves.
 */
export function openInBrowser(url: string): Promise<boolean> {
  return launchBrowser(browserCommandOf(url, process.platform));
}
