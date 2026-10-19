import mongoose from "mongoose";

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  personality: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
});

const BlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["narration", "dialogue"],
      required: true
    },
    speaker: { type: String, default: "" },
    text: { type: String, required: true }
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ["user", "ai"],
    required: true
  },
  rawInput: { type: String, default: "" },
  isSkipTurn: { type: Boolean, default: false },
  loveScore: { type: Number, required: true, min: 0, max: 100 },
  hateScore: { type: Number, required: true, min: 0, max: 100 },
  loveDelta: { type: Number, default: 0 },
  blocks: [BlockSchema],
  createdAt: { type: Date, default: Date.now }
});

const SessionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    playerName: { type: String, required: true, trim: true },
    playerGender: {
      type: String,
      enum: ["male", "female", "nonbinary"],
      default: "male"
    },
    friendName: { type: String, required: true, trim: true, default: "Isha" },
    friendGender: {
      type: String,
      enum: ["boy", "girl"],
      default: "girl"
    },
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

SessionSchema.index({ ownerId: 1, updatedAt: -1 });

export default mongoose.model("Session", SessionSchema);