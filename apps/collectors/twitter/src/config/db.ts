import mongoose from 'mongoose';
import { config } from './index';
import { logger } from '../lib/logger';

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodb.uri);
    logger.info('✅ MongoDB connected');
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;