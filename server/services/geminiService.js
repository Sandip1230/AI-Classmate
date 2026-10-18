import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const roleplayResponseSchema = {
  type: Type.OBJECT,
  properties: {
    loveDelta: {
      type: Type.INTEGER,
      description:
        "Change in Isha's Love score this turn. MUST be an integer between -2 and +2. 0 is default. +1 is semi-hard (witty comeback, unbothered confidence). +2 is extremely hard (major heroic/power move or emotional turning point). -1 or -2 for needy, boring, or cowardly behavior."
    },
    reasonForDelta: {
      type: Type.STRING,
      description: "Short internal note explaining why loveDelta changed or stayed 0."
    },
    blocks: {
      type: Type.ARRAY,
      description:
        "Sequence of 3rd-person action narration and character dialogues in Hinglish.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ["narration", "dialogue"],
            description:
              "'narration' for 3rd-person action/scene description, 'dialogue' for spoken lines."
          },
          speaker: {
            type: Type.STRING,
            description:
              "Speaking character's name (e.g., 'Isha', 'Vivaan', 'Kritika', 'Kabir') when type is 'dialogue'. Empty string when type is 'narration'."
          },
          text: {
            type: Type.STRING,
            description:
              "Hinglish text. Do NOT wrap narration in asterisks or dialogue in quotes."
          }
        },
        required: ["type", "speaker", "text"]
      }
    }
  },
  required: ["loveDelta", "reasonForDelta", "blocks"]
};

export async function generateRoleplayTurn({ session, userRawText, isSkip }) {
  const activeNPCs = session.characters
    .filter((c) => c.isActive)
    .map((c) => `- ${c.name} (${c.role}): ${c.personality}`)
    .join("\n");

  const systemInstruction = `
You are an interactive Hinglish College Roleplay Game Master & Character Engine set at "Xavier's College".
The user is playing as "${session.playerName}", a newly admitted boy in Isha's class.

### MAIN CHARACTER: ISHA
- **Persona**: Brilliant, ultra-wealthy, breathtakingly beautiful, and fiercely arrogant ("Queen of Xavier's College"). Not sweet at all.
- **Current Feelings toward ${session.playerName}**: Love: ${session.love}/100 | Hate: ${session.hate}/100.
- **Talking Style**: Natural, sharp Hinglish (Hindi in Latin script mixed with crisp English phrases like "Excuse me?", "Tum meri league mein nahi ho", "Compliments se main pighal nahi jati").
- **Behavior & Micro-Actions**:
  - When Hate is high (80-100): Mocking, dismissive, intimidating, smirking. Yet when intrigued or challenged, she uses dominant close-proximity gestures (fixing ${session.playerName}'s collar, brushing imaginary dust off his shoulder, leaning close to whisper a challenge, or hiding a tiny blush when caught off guard).
  - She HATES desperate behavior, cheap compliments ("buttering"), or weakness.
  - She RESPECTS unbothered confidence, sharp counter-roasts, real power/status ("Dimag aur rutba"), and fearless audacity.

### ACTIVE WORLD CHARACTERS (Single Unified Scene)
${activeNPCs}
- Any of these characters (or new spontaneous background characters like guards, professors, classmates, commandos, etc.) can speak or act voluntarily or involuntarily based on the scenario.
- Keep the story completely open-ended and sandbox-driven. NEVER follow a pre-written script. React 100% dynamically to ${session.playerName}'s words and actions.

### HOW TO PARSE ${session.playerName.toUpperCase()}'S INPUT
- Text inside double quotes ("...") or asterisks (*...*) represents physical ACTIONS or world events triggered by ${session.playerName}.
- Normal text outside quotes represents ${session.playerName}'s spoken dialogue.
- If the turn is "[SKIP_TURN]", ${session.playerName} stays silent and observes; advance the scene naturally with Isha and/or other characters speaking or acting.

### LOVE / HATE SCALE RULES (STRICT SLOW-BURN)
- Love + Hate ALWAYS equals 100.
- Return \`loveDelta\` as an integer strictly in [-2, -1, 0, 1, 2].
- **0 (Default - 85% of turns)**: Normal conversation, standard banter, or cheap compliments.
- **+1 (Semi-Hard)**: ${session.playerName} delivers a savage witty comeback that leaves Isha speechless, shows genuine high status/iq, or stands up to Vivaan fearlessly.
- **+2 (Extremely Hard)**: ${session.playerName} pulls off a massive power move, protects/rescues Isha in a high-stakes moment, or creates an unforgettable emotional/dominant turning point.
- **-1 or -2**: ${session.playerName} acts needy, apologetic without reason, boring, or overly submissive.

### OUTPUT STRUCTURE
- Provide 2 to 4 \`blocks\` alternating between \`narration\` (3rd-person atmospheric description addressing the player as "tum" / "tumhara") and \`dialogue\` (spoken lines by Isha and/or other present NPCs).
`;

  const recentMessages = session.messages.slice(-16).map((m) => {
    if (m.sender === "user") {
      return `${session.playerName}: ${
        m.isSkipTurn
          ? "[Stays silent and watches what happens next]"
          : m.rawInput
      }`;
    } else {
      const formattedBlocks = m.blocks
        .map((b) =>
          b.type === "narration" ? `*${b.text}*` : `${b.speaker}: "${b.text}"`
        )
        .join("\n");
      return `[Love: ${m.loveScore}/100 | Hate: ${m.hateScore}/100]\n${formattedBlocks}`;
    }
  });

  const prompt = `
### STORY MEMORY SUMMARY SO FAR:
${session.storySummary}

### RECENT CHAT HISTORY:
${recentMessages.join("\n\n")}

### NEW TURN FROM ${session.playerName}:
${
  isSkip
    ? "[SKIP_TURN: The player says nothing and waits/observes. Continue the scene with Isha and/or NPCs reacting or escalating the moment.]"
    : userRawText
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: roleplayResponseSchema,
      temperature: 0.85
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const cleaned = response.text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  }

  // Enforce strict [-2, +2] clamp and Love + Hate = 100
  const rawDelta = Number(parsed.loveDelta) || 0;
  const clampedDelta = Math.max(-2, Math.min(2, Math.round(rawDelta)));
  const newLove = Math.max(0, Math.min(100, session.love + clampedDelta));
  const newHate = 100 - newLove;

  const sanitizedBlocks =
    Array.isArray(parsed.blocks) && parsed.blocks.length > 0
      ? parsed.blocks.map((b) => ({
          type: b.type === "dialogue" ? "dialogue" : "narration",
          speaker: b.type === "dialogue" ? b.speaker || "Isha" : "",
          text: String(b.text || "")
            .replace(/^\*+|\*+$/g, "")
            .replace(/^"+|"+$/g, "")
            .trim()
        }))
      : [
          {
            type: "narration",
            speaker: "",
            text: "Isha tumhari taraf ekenberg teekhi nazar se dekhti hai."
          },
          {
            type: "dialogue",
            speaker: "Isha",
            text: "Kuch bolna bhi hai tumhe ya bas aise hi khade rahoge?"
          }
        ];

  return {
    loveScore: newLove,
    hateScore: newHate,
    loveDelta: newLove - session.love,
    blocks: sanitizedBlocks
  };
}

export async function updateRollingSummaryIfNeeded(session) {
  if (session.messages.length < 20 || session.messages.length % 10 !== 0) return;

  const sliceToSummarize = session.messages.slice(-12).map((m) => {
    if (m.sender === "user") return `${session.playerName}: ${m.rawInput}`;
    return m.blocks
      .map((b) =>
        b.type === "narration" ? `*${b.text}*` : `${b.speaker}: "${b.text}"`
      )
      .join(" ");
  });

  try {
    const res = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Update the running roleplay summary concisely (under 180 words), preserving key plot twists, current location in Xavier's College, relationship shifts with Isha, and active NPC dynamics.\n\nPrevious Summary:\n${session.storySummary}\n\nRecent Events:\n${sliceToSummarize.join("\n")}`
    });
    if (res.text) {
      session.storySummary = res.text.trim();
      await session.save();
    }
  } catch (err) {
    console.error("⚠️ Rolling summary update skipped:", err.message);
  }
}