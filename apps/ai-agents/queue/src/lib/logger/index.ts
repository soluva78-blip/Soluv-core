import { Logger } from "winston";
import { config } from "../../config/config";
import { buildDevLogger, prodDevLogger } from "./loggings";

export const logger: Logger =
  config.appEnvironment === "production" ? prodDevLogger() : buildDevLogger();
