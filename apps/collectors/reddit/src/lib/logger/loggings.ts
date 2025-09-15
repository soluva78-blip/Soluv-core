import {
  createLogger,
  format,
  transports,
  Logger as WinstonLogger,
} from "winston";

const { combine, printf, timestamp, colorize, json } = format;

interface LogContext {
  id?: string;
  title?: string;
  score?: number;
  relevance?: number;
  reasons?: string[];
  error?: string | Error;
  subreddit?: string;
  loopAttempt?: number;
  [key: string]: unknown;
}

function devFormat() {
  return printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
  });
}

function prodFormat() {
  return json();
}

export function prodDevLogger(): WinstonLogger {
  return createLogger({
    level: "info",
    format: combine(timestamp(), prodFormat()),
    transports: [
      new transports.File({
        level: "info",
        filename: "src/appLogs/soluva-info.log",
      }),
      new transports.File({
        level: "error",
        filename: "src/appLogs/soluva-error.log",
      }),
    ],
  });
}

export function buildDevLogger(): WinstonLogger {
  return createLogger({
    level: "debug",
    format: combine(colorize(), timestamp(), devFormat()),
    transports: [new transports.Console()],
  });
}

// Context-aware wrapper
export class AppLogger {
  private logger: WinstonLogger;
  private serviceName: string;

  constructor(logger: WinstonLogger, serviceName: string) {
    this.logger = logger;
    this.serviceName = serviceName;
  }

  info(message: string, context?: LogContext): void {
    this.logger.info({
      service: this.serviceName,
      message,
      ...this.prepareContext(context),
    });
  }

  error(message: string, context?: LogContext): void {
    const errorInfo =
      context?.error instanceof Error ? context.error.stack : context?.error;

    this.logger.error({
      service: this.serviceName,
      message,
      error: errorInfo,
      ...this.prepareContext(context),
    });
  }

  private prepareContext(context?: LogContext): Record<string, unknown> {
    if (!context) return {};
    const { error, ...rest } = context; // prevent duplicate error field
    return rest;
  }
}
