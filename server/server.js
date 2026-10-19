import dotenv from "dotenv";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { getServerConfig } from "./config/env.js";

dotenv.config();

async function startServer() {
  const config = getServerConfig();
  const app = createApp(config);
  await connectDB(config);

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`AI-Classmate API listening on port ${config.port}`);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  let isShuttingDown = false;
  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received; shutting down gracefully.`);

    server.close(async (error) => {
      if (error) {
        console.error("HTTP server shutdown failed:", error);
        process.exitCode = 1;
      }
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error("MongoDB shutdown failed:", disconnectError);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});