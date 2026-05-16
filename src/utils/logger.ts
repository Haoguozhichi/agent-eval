type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  const env = (process.env.AGENT_EVAL_LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function emit(level: LogLevel, scope: string, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < currentLevel()) return;
  const ts = new Date().toISOString();
  const tail = fields && Object.keys(fields).length > 0 ? " " + JSON.stringify(fields) : "";
  const line = `[${ts}] ${level.toUpperCase()} ${scope} ${msg}${tail}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  scope: string;
  child(suffix: string): Logger;
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  return {
    scope,
    child(suffix) {
      return createLogger(`${scope}:${suffix}`);
    },
    debug(msg, fields) { emit("debug", scope, msg, fields); },
    info(msg, fields) { emit("info", scope, msg, fields); },
    warn(msg, fields) { emit("warn", scope, msg, fields); },
    error(msg, fields) { emit("error", scope, msg, fields); },
  };
}
