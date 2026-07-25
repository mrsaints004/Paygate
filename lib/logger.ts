/**
 * Structured logger for PayGate.
 * Outputs JSON in production, pretty-prints in development.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

function formatEntry(entry: LogEntry): string {
  if (isDev) {
    const { timestamp, level, component, message, ...meta } = entry;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp.slice(11, 19)}] [${component}] ${message}${metaStr}`;
  }
  return JSON.stringify(entry);
}

function createLogFn(level: LogLevel) {
  return (component: string, message: string, meta?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...meta,
    };

    const formatted = formatEntry(entry);

    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "debug":
        if (isDev) console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  };
}

export const logger = {
  info: createLogFn("info"),
  warn: createLogFn("warn"),
  error: createLogFn("error"),
  debug: createLogFn("debug"),
};
