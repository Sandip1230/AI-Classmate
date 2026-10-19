import { createHash } from "node:crypto";
import AuthSession from "../models/AuthSession.js";
import User from "../models/User.js";

export const AUTH_COOKIE_NAME = "ai_classmate_session";

function getCookieValue(header, name) {
  for (const part of (header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return "";
}

export function getSessionToken(req) {
  const token = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
  return /^[a-f\d]{64}$/i.test(token) ? token : "";
}

async function authenticateRequest(req, res, next, required) {
  try {
    const token = getSessionToken(req);
    if (!token) {
      if (!required) return next();
      return res.status(401).json({ error: "Sign in with Google to continue." });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const authSession = await AuthSession.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() }
    }).select("userId");
    if (!authSession) {
      if (!required) return next();
      return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    }

    const user = await User.findById(authSession.userId).select(
      "_id email name picture"
    );
    if (!user) {
      if (!required) return next();
      return res.status(401).json({ error: "Your account could not be found. Please sign in again." });
    }

    req.user = user;
    req.authSessionId = authSession._id;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  return authenticateRequest(req, res, next, true);
}

export function optionalAuth(req, res, next) {
  return authenticateRequest(req, res, next, false);
}
