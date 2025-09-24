import { config } from "@/config";
import { AppLogger, buildDevLogger, prodDevLogger } from "./loggings";

const baseLogger =
  config.app.environment === "production" ? prodDevLogger() : buildDevLogger();

export const logger = new AppLogger(baseLogger, "ai-orchestrator");
