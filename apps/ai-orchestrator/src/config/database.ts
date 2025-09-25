import mongoose from "mongoose";
import { config } from "./env";

export const databaseConfig = {
  url: config.supabase.url,
  key: config.supabase.key,
};

export const connectMongoDB = async (): Promise<void> => {
  try {
    const mongoUri = config.mongo_url || "mongodb://localhost:27017/myapp";

    await mongoose.connect(mongoUri);

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1);
  }
};
