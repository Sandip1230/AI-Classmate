import express from "express";
import Session from "../models/Session.js";
import {
  generateRoleplayTurn,
  updateRollingSummaryIfNeeded
} from "../services/geminiService.js";

const router = express.Router();

const DEFAULT_CHARACTERS = [
  {
    name: "Isha",
    role: "Queen of Xavier's College",
    personality:
      "Brilliant, rich, gorgeous, fiercely arrogant, sharp-tongued Tsundere.",
    isActive: true
  },
  {
    name: "Vivaan",
    role: "Isha's Shadow / 'Golden Boy'",
    personality:
      "Rich, arrogant, fiercely possessive of Isha, quick to bully newcomers.",
    isActive: true
  },
  {
    name: "Kritika",
    role: "Nervous Classmate & Informant",
    personality:
      "Friendly to newcomers, whispered gossip expert, terrified of Isha's clique.",
    isActive: true
  },
  {
    name: "Kabir",
    role: "Backbench Witty Classmate",
    personality:
      "Loves drama, whistles at bold moments, makes humorous observations.",
    isActive: true
  }
];

// 1. Initialize or Resume Session
router.post("/init", async (req, res) => {
  try {
    const { sessionId, playerName } = req.body;

    if (sessionId) {
      const existing = await Session.findById(sessionId);
      if (existing) return res.json(existing);
    }

    if (!playerName || !playerName.trim()) {
      return res
        .status(400)
        .json({ error: "Player name is required to start." });
    }

    const cleanName = playerName.trim();

    const initialAiMessage = {
      sender: "ai",
      loveScore: 0,
      hateScore: 100,
      loveDelta: 0,
      blocks: [
        {
          type: "narration",
          speaker: "",
          text: `Xavier's College mein aaj tumhara pehla din hai. Haath mein kitabein pakde tum main corridor se apni class ki taraf badh hi rahe ho ki saamne se aati Isha—college ki sabse brilliant, rich aur arrogant 'Queen'—aur uska possessive dost Vivaan tumhara raasta block kar lete hain. Isha tumhe upar se neeche tak ek cold, judging nazar se dekhti hai.`
        },
        {
          type: "dialogue",
          speaker: "Isha",
          text: `Excuse me? Dekh kar nahi chal sakte kya, Newcomer? Ya pehle din hi Xavier's ke corridor mein girne ka shauk hai?`
        },
        {
          type: "narration",
          speaker: "",
          text: `Vivaan ek arrogant smirk ke saath aage aata hai aur tumhare kandhe ke paas khada ho jata hai.`
        },
        {
          type: "dialogue",
          speaker: "Vivaan",
          text: `Sun be चश्मिश, naya admission hai toh apni aukaat mein reh. Isha ke saamne aane ki galti dubara mat karna. Naam kya hai tera?`
        }
      ]
    };

    const newSession = await Session.create({
      playerName: cleanName,
      love: 0,
      hate: 100,
      characters: DEFAULT_CHARACTERS,
      messages: [initialAiMessage]
    });

    res.status(201).json(newSession);
  } catch (err) {
    console.error("Init Session Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Send Message OR Skip Turn
router.post("/:id/message", async (req, res) => {
  try {
    const { text, isSkip } = req.body;
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const userMsg = {
      sender: "user",
      rawInput: isSkip
        ? '*"Kuch nahi bolta aur chupchap dekhta hai ki aage kya hota hai"*'
        : text,
      isSkipTurn: Boolean(isSkip),
      loveScore: session.love,
      hateScore: session.hate,
      blocks: []
    };
    session.messages.push(userMsg);

    const aiTurn = await generateRoleplayTurn({
      session,
      userRawText: text || "",
      isSkip: Boolean(isSkip)
    });

    session.love = aiTurn.loveScore;
    session.hate = aiTurn.hateScore;

    session.messages.push({
      sender: "ai",
      loveScore: aiTurn.loveScore,
      hateScore: aiTurn.hateScore,
      loveDelta: aiTurn.loveDelta,
      blocks: aiTurn.blocks
    });

    await session.save();
    updateRollingSummaryIfNeeded(session);

    res.json(session);
  } catch (err) {
    console.error("Message Turn Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Edit Last User Message & Regenerate
router.put("/:id/edit-last", async (req, res) => {
  try {
    const { newText } = req.body;
    const session = await Session.findById(req.params.id);
    if (!session || session.messages.length < 3) {
      return res.status(400).json({ error: "No editable user turn found." });
    }

    // Remove last AI message and last User message
    session.messages.pop();
    const lastUserMsg = session.messages.pop();

    // Roll back Love & Hate to snapshot before that turn
    session.love = lastUserMsg.loveScore;
    session.hate = lastUserMsg.hateScore;

    session.messages.push({
      sender: "user",
      rawInput: newText,
      isSkipTurn: false,
      loveScore: session.love,
      hateScore: session.hate,
      blocks: []
    });

    const aiTurn = await generateRoleplayTurn({
      session,
      userRawText: newText,
      isSkip: false
    });

    session.love = aiTurn.loveScore;
    session.hate = aiTurn.hateScore;

    session.messages.push({
      sender: "ai",
      loveScore: aiTurn.loveScore,
      hateScore: aiTurn.hateScore,
      loveDelta: aiTurn.loveDelta,
      blocks: aiTurn.blocks
    });

    await session.save();
    res.json(session);
  } catch (err) {
    console.error("Edit Last Turn Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Regenerate Last AI Response
router.post("/:id/regenerate", async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session || session.messages.length < 3) {
      return res
        .status(400)
        .json({ error: "Cannot regenerate initial opening." });
    }

    session.messages.pop();
    const lastUserMsg = session.messages[session.messages.length - 1];

    session.love = lastUserMsg.loveScore;
    session.hate = lastUserMsg.hateScore;

    const aiTurn = await generateRoleplayTurn({
      session,
      userRawText: lastUserMsg.rawInput,
      isSkip: lastUserMsg.isSkipTurn
    });

    session.love = aiTurn.loveScore;
    session.hate = aiTurn.hateScore;

    session.messages.push({
      sender: "ai",
      loveScore: aiTurn.loveScore,
      hateScore: aiTurn.hateScore,
      loveDelta: aiTurn.loveDelta,
      blocks: aiTurn.blocks
    });

    await session.save();
    res.json(session);
  } catch (err) {
    console.error("Regenerate Turn Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Add Custom Character to Active World
router.post("/:id/characters", async (req, res) => {
  try {
    const { name, role, personality } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: "Name and role are required." });
    }

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.characters.push({
      name: name.trim(),
      role: role.trim(),
      personality: (personality || "Dynamic college character").trim(),
      isActive: true
    });

    await session.save();
    res.json(session);
  } catch (err) {
    console.error("Add Character Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;