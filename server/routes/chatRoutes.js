import express from "express";
import Session from "../models/Session.js";
import {
  generateRoleplayTurn,
  updateRollingSummaryIfNeeded
} from "../services/geminiService.js";

const router = express.Router();

function createDefaultCharacters(friendName, friendGender) {
  const title = friendGender === "girl" ? "Queen" : "King";
  return [
    {
      name: friendName,
      role: `${title} of Xavier's College`,
      personality:
        "Brilliant, wealthy, charismatic, fiercely arrogant, and sharp-tongued.",
      isActive: true
    },
    {
      name: "Vivaan",
      role: "Campus Rival",
      personality:
        `Rich, arrogant, and quick to challenge newcomers or compete with ${friendName}.`,
      isActive: true
    },
    {
      name: "Kritika",
      role: "Nervous Classmate & Informant",
      personality:
        "Friendly to newcomers, whispered gossip expert, terrified of the campus clique.",
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
}

// 1. Initialize or Resume Session
router.post("/init", async (req, res) => {
  try {
    const {
      sessionId,
      playerName,
      playerGender = "male",
      friendName = "Isha",
      friendGender = "girl"
    } = req.body;

    if (sessionId) {
      const existing = await Session.findById(sessionId);
      if (existing) return res.json(existing);
    }

    if (typeof playerName !== "string" || !playerName.trim()) {
      return res
        .status(400)
        .json({ error: "Player name is required to start." });
    }

    const cleanName = playerName.trim();
    if (cleanName.length > 40) {
      return res.status(400).json({ error: "Player name must be 40 characters or fewer." });
    }
    if (!["male", "female", "nonbinary"].includes(playerGender)) {
      return res.status(400).json({ error: "Choose a valid player gender." });
    }
    if (typeof friendName !== "string" || !friendName.trim()) {
      return res.status(400).json({ error: "AI friend name is required." });
    }
    const cleanFriendName = friendName.trim();
    if (cleanFriendName.length > 40) {
      return res.status(400).json({ error: "AI friend name must be 40 characters or fewer." });
    }
    if (!["boy", "girl"].includes(friendGender)) {
      return res.status(400).json({ error: "Choose whether your AI friend is a boy or a girl." });
    }

    const friendTitle = friendGender === "girl" ? "Queen" : "King";
    const playerNewcomer = playerGender === "female" ? "nayi" : "naye";
    const playerMovingVerb = playerGender === "female" ? "rahi" : "rahe";
    const initialAiMessage = {
      sender: "ai",
      loveScore: 0,
      hateScore: 100,
      loveDelta: 0,
      blocks: [
        {
          type: "narration",
          speaker: "",
          text: `Xavier's College mein aaj tumhara pehla din hai. Haath mein kitabein pakde tum main corridor se apni class ki taraf badh hi ${playerMovingVerb} ho ki saamne ${cleanFriendName}, college ke brilliant, wealthy aur arrogant ${friendTitle}, tumhara raasta rok lete hain. ${cleanFriendName} tumhe upar se neeche tak ek cold, judging nazar se dekhte hain.`
        },
        {
          type: "dialogue",
          speaker: cleanFriendName,
          text: `Excuse me? Dekh kar nahi chal sakte kya, Newcomer? Ya pehle din hi Xavier's ke corridor mein girne ka shauk hai?`
        },
        {
          type: "narration",
          speaker: "",
          text: `Vivaan ek arrogant smirk ke saath aage aata hai aur tumhare kandhe ke paas khada ho jata hai, jaise tumhe challenge kar raha ho.`
        },
        {
          type: "dialogue",
          speaker: "Vivaan",
          text: `Sun, Xavier's mein ${playerNewcomer} ho toh apni aukaat mein reh. ${cleanFriendName} ke saamne aane ki galti dubara mat karna. Tumhara naam kya hai?`
        }
      ]
    };

    const newSession = await Session.create({
      playerName: cleanName,
      playerGender,
      friendName: cleanFriendName,
      friendGender,
      love: 0,
      hate: 100,
      storySummary: `First day at Xavier's College. ${cleanName}, a newly admitted ${playerGender} student, is meeting ${cleanFriendName}, the ${friendTitle} of Xavier's College, while Vivaan challenges them in the main corridor.`,
      characters: createDefaultCharacters(cleanFriendName, friendGender),
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