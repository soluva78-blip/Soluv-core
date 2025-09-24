import { config } from "@/config";
import { AppLogger, buildDevLogger, prodDevLogger } from "./loggings";

const baseLogger =
  config.appEnvironment === "production" ? prodDevLogger() : buildDevLogger();

export const logger = new AppLogger(baseLogger, "queue-service");
