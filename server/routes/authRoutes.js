import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import AuthSession from "../models/AuthSession.js";
import User from "../models/User.js";
import {
  AUTH_COOKIE_NAME,
  getSessionToken,
  optionalAuth,
  requireAuth
} from "../middleware/requireAuth.js";

const defaultGoogleClient = new OAuth2Client();
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function getCookieOptions(nodeEnv) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: nodeEnv === "production" ? "none" : "lax",
    path: "/api",
    maxAge: SESSION_LIFETIME_MS
  };
}

function serializeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    picture: user.picture
  };
}

export function createAuthRouter({
  googleClientId = "",
  nodeEnv = "development",
  googleClient = defaultGoogleClient
} = {}) {
  const authRouter = express.Router();

  authRouter.get("/config", (req, res) => {
    res.json({ googleClientId: googleClientId || null });
  });

  authRouter.post("/google", async (req, res, next) => {
    try {
      if (!googleClientId) {
        return res.status(503).json({
          error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the server."
        });
      }
      const credential = req.body?.credential;
      if (typeof credential !== "string" || credential.length > 10_000) {
        return res.status(400).json({ error: "A valid Google sign-in credential is required." });
      }

      let ticket;
      try {
        ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: googleClientId
        });
      } catch (error) {
        if (error?.name === "GaxiosError" || error?.code) {
          console.error(
            "Google sign-in verification unavailable:",
            error.name || "Error",
            error.code || ""
          );
          return res.status(503).json({
            error: "Google sign-in verification is temporarily unavailable. Please try again."
          });
        }
        return res.status(401).json({
          error: "Google sign-in could not be verified. Please try again."
        });
      }
      const payload = ticket.getPayload();
      if (
        typeof payload?.sub !== "string" ||
        typeof payload.email !== "string" ||
        payload.email_verified !== true ||
        typeof payload.name !== "string" ||
        !payload.name.trim()
      ) {
        return res.status(401).json({ error: "Google did not provide a verified account." });
      }

      const user = await User.findOneAndUpdate(
        { googleId: payload.sub },
        {
          $set: {
            email: payload.email.toLowerCase(),
            name: payload.name.trim(),
            picture: typeof payload.picture === "string" ? payload.picture : ""
          }
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
      await AuthSession.create({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId: user._id,
        expiresAt
      });

      res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions(nodeEnv));
      return res.json({ user: serializeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  authRouter.get("/me", optionalAuth, (req, res) => {
    res.json({ user: req.user ? serializeUser(req.user) : null });
  });

  authRouter.post("/logout", async (req, res, next) => {
    try {
      const token = getSessionToken(req);
      if (token) {
        await AuthSession.deleteOne({
          tokenHash: createHash("sha256").update(token).digest("hex")
        });
      }
    } catch (error) {
      res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions(nodeEnv));
      return next(error);
    }
    res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions(nodeEnv));
    return res.json({ ok: true });
  });

  return authRouter;
}
