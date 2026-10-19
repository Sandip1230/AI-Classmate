import mongoose from "mongoose";

export const connectDB = async (config) => {
  const conn = await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    autoIndex: config.nodeEnv !== "production"
  });
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
};