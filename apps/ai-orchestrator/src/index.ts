#!/usr/bin/env node

import { logger } from "@/lib/logger";
import "dotenv/config";

// Main entry point - can be extended to include API server, admin interface, etc.
async function main() {
  const mode = process.argv[2] || "worker";

  switch (mode) {
    case "worker":
      logger.info("Starting orchestrator in worker mode...");
      require("./worker");
      break;

    case "server":
      logger.info("Starting orchestrator in server mode...");
      require("./server");
      break;

    default:
      logger.info("Usage: npm start [worker|server]");
      logger.info("Defaulting to worker mode...");
      require("./worker");
  }
}

// Handle uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason:, ${reason}`);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", {
    error,
  });
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    logger.error("Failed to start orchestrator:", error);
    process.exit(1);
  });
}
