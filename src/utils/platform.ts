import { platform } from "node:os";

const isWin = platform() === "win32";

/** Whether the current platform is Windows */
export const IS_WIN32 = isWin;

/**
 * Default shell for the current platform.
 * - Windows: "cmd.exe" (available everywhere, supports `/c`)
 * - Unix: "/bin/sh"
 */
export const DEFAULT_SHELL = isWin ? "cmd.exe" : "/bin/sh";

/**
 * Build spawn args for running a command in a shell.
 * - Windows: `["/c", command]`
 * - Unix: `["-c", command]`
 */
export function shellArgs(command: string): string[] {
  return isWin ? ["/c", command] : ["-c", command];
}

/**
 * Resolve the command name for opencode CLI.
 * On Windows, npm global installs produce `.cmd` wrappers;
 * `spawn("opencode", ...)` fails without `shell: true`.
 * We use `shell: true` on Windows so the `.cmd` wrapper is found.
 */
export function opencodeSpawnOpts(): { shell: boolean; windowsHide?: boolean } {
  return isWin ? { shell: true, windowsHide: true } : { shell: false };
}

/**
 * Kill signal that works on the current platform.
 * - Windows: SIGTERM is not supported; use "SIGKILL" or just `.kill()`.
 * - Unix: SIGTERM → graceful, SIGKILL → force.
 */
export function gracefulKillSignal(): NodeJS.Signals {
  return isWin ? "SIGKILL" : "SIGTERM";
}

export function forceKillSignal(): NodeJS.Signals {
  return "SIGKILL";
}
