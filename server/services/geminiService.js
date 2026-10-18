const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function generateReply(messages) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: messages.map(({ role, text }) => ({ role, parts: [{ text }] })),
  });

  const reply = response.text?.trim();
  if (!reply) {
    throw new Error("Gemini returned an empty response.");
  }

  return reply;
}

module.exports = { generateReply };
