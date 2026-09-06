import "server-only";

/**
 * Minimal structured logging.
 *
 * Everything here used to go out as bare `console.log` strings, which is fine
 * to read over your own shoulder and useless once it is in a log aggregator —
 * you cannot filter on a field that does not exist. In production each line is
 * a single JSON object so it can be queried; in development it stays readable.
 *
 * This is not an observability platform. It is the one seam where a real one
 * would be attached: give `reportError` a body and every unhandled API error
 * reaches Sentry or OTel without touching a route.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
  /** The route or subsystem, e.g. "api:rooms/[code]/join" or "worker:eval". */
  scope?: string;
  [key: string]: unknown;
}

const isProduction = process.env.NODE_ENV === "production";

/** Errors do not survive JSON.stringify — pull out the parts worth keeping. */
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      // Stacks are noise in development, where the console prints one anyway.
      ...(isProduction && error.stack ? { stack: error.stack } : {}),
    };
  }
  return { errorMessage: String(error) };
}

const CONSOLE_FOR: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const write = CONSOLE_FOR[level];

  if (!isProduction) {
    const scope = fields.scope ? `[${fields.scope}] ` : "";
    const rest = Object.entries(fields).filter(
      ([key]) => key !== "scope" && key !== "requestId",
    );
    write(`${scope}${message}`, ...(rest.length ? [Object.fromEntries(rest)] : []));
    return;
  }

  write(
    JSON.stringify({
      level,
      message,
      time: new Date().toISOString(),
      ...fields,
    }),
  );
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, error?: unknown, fields?: LogFields) =>
    emit("error", message, {
      ...fields,
      ...(error === undefined ? {} : describeError(error)),
    }),
};

/**
 * The hook for an error reporter.
 *
 * Called for every unhandled error that reaches an API route. Wire Sentry,
 * Bugsnag or an OTel exporter in here and the whole surface is covered at
 * once; leave it as-is and errors are still structured in the logs.
 */
export function reportError(error: unknown, fields: LogFields = {}): void {
  void error;
  void fields;
  // Intentionally empty. See the note above.
}
