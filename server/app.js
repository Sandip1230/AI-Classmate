import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import chatRoutes from "./routes/chatRoutes.js";

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

const aiTurnLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI turns. Please wait before sending another message." }
});

export function createApp({ clientOrigins, trustProxy } = {}) {
  const app = express();
  const allowedOrigins = clientOrigins ?? (process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable("x-powered-by");
  const proxySetting = trustProxy ?? process.env.TRUST_PROXY ?? "0";
  app.set(
    "trust proxy",
    typeof proxySetting === "string" && /^\d+$/.test(proxySetting)
      ? Number(proxySetting)
      : proxySetting
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || allowedOrigins.includes(origin));
      },
      methods: ["GET", "POST", "PUT", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600
    })
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? "ok" : "unavailable",
      database: databaseReady ? "connected" : "disconnected"
    });
  });

  app.use("/api", generalApiLimiter);
  app.use("/api/session/:id/message", aiTurnLimiter);
  app.use("/api/session/:id/edit-last", aiTurnLimiter);
  app.use("/api/session/:id/regenerate", aiTurnLimiter);
  app.use("/api/session", chatRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const status =
      error.status === 413 || error.type === "entity.too.large"
        ? 413
        : error instanceof SyntaxError && error.status === 400
          ? 400
          : Number.isInteger(error.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 500;
    if (status >= 500) {
      console.error("Unhandled request error:", error);
    }
    res.status(status).json({
      error:
        status === 413
          ? "Request body is too large."
          : status === 400
            ? "Request body must contain valid JSON."
            : status === 429
              ? "Too many requests. Please try again later."
              : "The server could not complete your request."
    });
  });

  return app;
}
