import { createLogger, format, transports } from "winston";
const { combine, printf, timestamp, colorize } = format;

function logFormat() {
  return printf((info) => {
    return `${info.timestamp} ${info.level}: ${info.stack || info.message}`;
  });
}

export function prodDevLogger() {
  return createLogger({
    format: combine(colorize(), timestamp(), logFormat()),
    transports: [
      new transports.File({
        level: "info",
        filename: "src/appLogs/greenhurb-info.log",
      }),
      new transports.File({
        level: "error",
        filename: "src/appLogs/greenhurb-error.log",
      }),
    ],
  });
}

export function buildDevLogger() {
  return createLogger({
    format: combine(colorize(), timestamp(), logFormat()),
    transports: [new transports.Console()],
  });
}
