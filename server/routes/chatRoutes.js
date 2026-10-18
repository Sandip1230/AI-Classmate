const express = require("express");
const mongoose = require("mongoose");
const Session = require("../models/Session");
const { generateReply } = require("../services/geminiService");

const router = express.Router();

router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await Session.find()
      .select("title updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.post("/sessions", async (req, res, next) => {
  try {
    const session = await Session.create();
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.get("/sessions/:sessionId", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }

  try {
    const session = await Session.findById(req.params.sessionId).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/sessions/:sessionId/messages", async (req, res, next) => {
  const { sessionId } = req.params;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!mongoose.isValidObjectId(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }
  if (!text || text.length > 10000) {
    return res
      .status(400)
      .json({ error: "Message must contain 1 to 10000 characters." });
  }

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const history = session.messages.map(({ role, text: messageText }) => ({
      role,
      text: messageText,
    }));
    const reply = await generateReply([...history, { role: "user", text }]);

    session.messages.push({ role: "user", text }, { role: "model", text: reply });
    if (session.messages.length === 2) {
      session.title = text.slice(0, 80);
    }
    await session.save();

    res.json({ session, reply });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
