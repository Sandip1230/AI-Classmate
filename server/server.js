require("dotenv").config();

const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const chatRoutes = require("./routes/chatRoutes");

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", chatRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({ error: "The server could not complete the request." });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => {
    console.log(`Classmate API listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start the Classmate API:", error);
    process.exitCode = 1;
  });
}

module.exports = app;
