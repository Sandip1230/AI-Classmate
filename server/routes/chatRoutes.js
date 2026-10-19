import express from "express";
import Session from "../models/Session.js";
import {
  generateRoleplayTurn,
  updateRollingSummaryIfNeeded
} from "../services/geminiService.js";

const router = express.Router();
const MAX_PLAYER_NAME_LENGTH = 40;
const MAX_FRIEND_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_CHARACTER_NAME_LENGTH = 80;
const MAX_CHARACTER_ROLE_LENGTH = 120;
const MAX_CHARACTER_PERSONALITY_LENGTH = 500;
const MAX_CUSTOM_CHARACTERS = 50;
const MAX_SESSION_MESSAGES = 1_000;

function isValidSessionId(id) {
  return /^[a-f\d]{24}$/i.test(id);
}

function getUserApiKey(req, res) {
  const apiKey = req.get("X-Gemini-Api-Key");
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 512) {
    res.status(400).json({
      error: "Add a valid Gemini API key in Chat options before generating a reply."
    });
    return null;
  }
  return apiKey.trim();
}

export function getAiProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  const providerMessage = String(error?.message || "").toLowerCase();

  if (/api.?key|unauthorized|permission denied|credential/.test(providerMessage)) {
    return {
      status: 502,
      message: "Gemini rejected this API key. Use a key created in Google AI Studio and confirm the Gemini API is enabled for its project."
    };
  }
  if (status === 401 || status === 403) {
    return {
      status: 502,
      message: "Gemini denied access. Check that your Google AI Studio key is valid and has Gemini API access."
    };
  }
  if (status === 404) {
    return {
      status: 502,
      message: "The configured Gemini model was not found or is unavailable to this key. Check GEMINI_MODEL in the server environment."
    };
  }
  if (status === 429) {
    return {
      status: 429,
      message: "Gemini quota or rate limit reached for this key. Check its Google AI Studio project limits and try again later."
    };
  }
  if (status >= 500) {
    return {
      status: 502,
      message: "Gemini is temporarily unavailable. Please try again shortly."
    };
  }
  if (status === 400) {
    return {
      status: 502,
      message: "Gemini rejected the request. Check the configured model and try again."
    };
  }
  if (/APIConnectionTimeoutError/.test(error?.name || "")) {
    return {
      status: 504,
      message: "The connection from Render to Gemini timed out. Check Render service logs and try again."
    };
  }
  if (/APIConnectionError/.test(error?.name || "")) {
    return {
      status: 503,
      message: "Render could not connect to Google's Gemini API. Check the Render service logs and try again."
    };
  }
  return {
    status: 502,
    message: "Gemini returned an unexpected error. Check the Render service logs and try again."
  };
}

function sendAiRouteError(res, label, error, apiKey) {
  const redact = (value) =>
    String(value || "Unknown error").split(apiKey || "\u0000").join("[redacted]");
  const errorDetails = [
    `${error?.name || "Error"}${error?.status ? ` (${error.status})` : ""}: ${redact(error?.message)}`
  ];
  if (error?.cause) {
    errorDetails.push(
      `Cause: ${error.cause.name || "Error"}: ${redact(error.cause.message)}`
    );
  }
  console.error(label, errorDetails.join(" | "));
  const providerError = getAiProviderError(error);
  return res.status(providerError.status).json({ error: providerError.message });
}

function sendRouteError(res, label, error, message) {
  console.error(label, error?.name || "Error", error?.message || "Unknown error");
  return res.status(500).json({ error: message });
}

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
    } = req.body ?? {};

    if (sessionId) {
      if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) {
        return res.status(400).json({ error: "Session ID is invalid." });
      }
      const existing = await Session.findById(sessionId);
      if (existing) return res.json(existing);
    }

    if (typeof playerName !== "string" || !playerName.trim()) {
      return res
        .status(400)
        .json({ error: "Player name is required to start." });
    }

    const cleanName = playerName.trim();
    if (cleanName.length > MAX_PLAYER_NAME_LENGTH) {
      return res.status(400).json({
        error: `Player name must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`
      });
    }
    if (!["male", "female", "nonbinary"].includes(playerGender)) {
      return res.status(400).json({ error: "Choose a valid player gender." });
    }
    if (typeof friendName !== "string" || !friendName.trim()) {
      return res.status(400).json({ error: "AI friend name is required." });
    }
    const cleanFriendName = friendName.trim();
    if (cleanFriendName.length > MAX_FRIEND_NAME_LENGTH) {
      return res.status(400).json({
        error: `AI friend name must be ${MAX_FRIEND_NAME_LENGTH} characters or fewer.`
      });
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
    sendRouteError(res, "Init Session Error:", err, "Unable to start a session.");
  }
});

// 2. Send Message OR Skip Turn
router.post("/:id/message", async (req, res) => {
  try {
    const { text, isSkip } = req.body ?? {};
    if (!isValidSessionId(req.params.id)) {
      return res.status(400).json({ error: "Session ID is invalid." });
    }
    if (isSkip !== undefined && typeof isSkip !== "boolean") {
      return res.status(400).json({ error: "isSkip must be a boolean." });
    }
    if (
      !isSkip &&
      (typeof text !== "string" || !text.trim() || text.length > MAX_MESSAGE_LENGTH)
    ) {
      return res.status(400).json({
        error: `Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`
      });
    }
    const apiKey = getUserApiKey(req, res);
    if (!apiKey) return;

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.messages.length + 2 > MAX_SESSION_MESSAGES) {
      return res.status(409).json({
        error: "This story has reached its message limit. Start a new story to continue."
      });
    }

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
      isSkip: Boolean(isSkip),
      apiKey
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
    updateRollingSummaryIfNeeded(session, apiKey);

    res.json(session);
  } catch (err) {
    sendAiRouteError(
      res,
      "Message Turn Error:",
      err,
      req.get("X-Gemini-Api-Key")
    );
  }
});

// 3. Edit Last User Message & Regenerate
router.put("/:id/edit-last", async (req, res) => {
  try {
    const { newText } = req.body ?? {};
    if (!isValidSessionId(req.params.id)) {
      return res.status(400).json({ error: "Session ID is invalid." });
    }
    if (
      typeof newText !== "string" ||
      !newText.trim() ||
      newText.length > MAX_MESSAGE_LENGTH
    ) {
      return res.status(400).json({
        error: `Edited message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`
      });
    }
    const apiKey = getUserApiKey(req, res);
    if (!apiKey) return;

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
      isSkip: false,
      apiKey
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
    sendAiRouteError(
      res,
      "Edit Last Turn Error:",
      err,
      req.get("X-Gemini-Api-Key")
    );
  }
});

// 4. Regenerate Last AI Response
router.post("/:id/regenerate", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      return res.status(400).json({ error: "Session ID is invalid." });
    }
    const apiKey = getUserApiKey(req, res);
    if (!apiKey) return;
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
      isSkip: lastUserMsg.isSkipTurn,
      apiKey
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
    sendAiRouteError(
      res,
      "Regenerate Turn Error:",
      err,
      req.get("X-Gemini-Api-Key")
    );
  }
});

// 5. Add Custom Character to Active World
router.post("/:id/characters", async (req, res) => {
  try {
    const { name, role, personality } = req.body ?? {};
    if (!isValidSessionId(req.params.id)) {
      return res.status(400).json({ error: "Session ID is invalid." });
    }
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > MAX_CHARACTER_NAME_LENGTH ||
      typeof role !== "string" ||
      !role.trim() ||
      role.length > MAX_CHARACTER_ROLE_LENGTH ||
      (personality !== undefined &&
        (typeof personality !== "string" ||
          personality.length > MAX_CHARACTER_PERSONALITY_LENGTH))
    ) {
      return res.status(400).json({
        error: `Character name (1-${MAX_CHARACTER_NAME_LENGTH}), role (1-${MAX_CHARACTER_ROLE_LENGTH}), and personality (up to ${MAX_CHARACTER_PERSONALITY_LENGTH}) must be valid.`
      });
    }

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.characters.length >= MAX_CUSTOM_CHARACTERS + 4) {
      return res.status(409).json({
        error: "This story has reached its custom character limit."
      });
    }

    session.characters.push({
      name: name.trim(),
      role: role.trim(),
      personality: personality?.trim() || "Dynamic college character",
      isActive: true
    });

    await session.save();
    res.json(session);
  } catch (err) {
    sendRouteError(
      res,
      "Add Character Error:",
      err,
      "Unable to add the character. Please try again."
    );
  }
});

export default router;