import mongoose from "mongoose";
import AuthSession from "../models/AuthSession.js";
import Session from "../models/Session.js";
import User from "../models/User.js";

export const connectDB = async (config) => {
  const conn = await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    autoIndex: config.nodeEnv !== "production"
  });
  await Promise.all([
    AuthSession.createIndexes(),
    Session.createIndexes(),
    User.createIndexes()
  ]);
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
};