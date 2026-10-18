import mongoose from "mongoose";

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  personality: { type: String, required: true },
  isActive: { type: Boolean, default: true }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["user", "ai"], required: true },
  // For user messages
  rawInput: { type: String, default: "" },
  isSkipTurn: { type: Boolean, default: false },
  // For AI responses (and score snapshot at this exact turn)
  loveScore: { type: Number, required: true },
  hateScore: { type: Number, required: true },
  loveDelta: { type: Number, default: 0 },
  blocks: [
    {
      type: { type: String, enum: ["narration", "dialogue"], required: true },
      speaker: { type: String, default: "" },
      text: { type: String, required: true }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const SessionSchema = new mongoose.Schema(
  {
    playerName: { type: String, required: true },
    love: { type: Number, default: 0, min: 0, max: 100 },
    hate: { type: Number, default: 100, min: 0, max: 100 },
    storySummary: {
      type: String,
      default:
        "First day at Xavier's College. The player is a newly admitted student walking through the main corridor carrying books when Isha (the arrogant, wealthy, brilliant Queen of Xavier's) and Vivaan (her possessive 'Golden Boy' best friend) block the corridor."
    },
    characters: [CharacterSchema],
    messages: [MessageSchema]
  },
  { timestamps: true }
);

export default mongoose.model("Session", SessionSchema);