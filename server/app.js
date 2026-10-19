import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import { requireAuth } from "./middleware/requireAuth.js";
import { createAuthRouter } from "./routes/authRoutes.js";
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait before trying again." }
});

function requireTrustedOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("Origin");
    if (!origin || !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: "This request origin is not allowed." });
    }
    return next();
  };
}

export function createApp({
  clientOrigins,
  trustProxy,
  googleClientId,
  googleClient,
  nodeEnv
} = {}) {
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
      credentials: true,
      methods: ["GET", "POST", "PUT", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Gemini-Api-Key"],
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
  app.use("/api/auth", requireTrustedOrigin(allowedOrigins));
  app.post("/api/auth/google", authLimiter);
  app.use(
    "/api/auth",
    createAuthRouter({
      googleClientId: googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
      googleClient,
      nodeEnv: nodeEnv ?? process.env.NODE_ENV ?? "development"
    })
  );
  app.use("/api/session/:id/message", aiTurnLimiter);
  app.use("/api/session/:id/edit-last", aiTurnLimiter);
  app.use("/api/session/:id/regenerate", aiTurnLimiter);
  app.use("/api/session", requireTrustedOrigin(allowedOrigins), requireAuth, chatRoutes);

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
