import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", project: "XAVIER'S // ISHA Roleplay Server" });
});

// Main Roleplay Session Routes
app.use("/api/session", chatRoutes);

// Start Server after DB connects
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});