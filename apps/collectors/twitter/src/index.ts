import * as dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import connectDB from './config/db';
import { logger } from './lib/logger';
import { scheduleTwitterFetch, startWorker } from './lib/scheduler';
import { OrchestratorIntegration } from './services/orchestratorIntegration';
import { TweetCollector } from './services/tweetCollector';

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'twitter-collector' });
});

// Manual trigger endpoint
app.post('/collect', async (req, res) => {
  try {
    const collector = new TweetCollector();
    const orchestrator = new OrchestratorIntegration();

    const tweets = await collector.collectAllQueries();
    if (tweets.length > 0) {
      await orchestrator.sendBatchToOrchestrator(tweets);
      for (const tweet of tweets) {
        await collector.markAsProcessed(tweet.tweetId);
      }
    }

    res.json({
      success: true,
      tweetsCollected: tweets.length
    });
  } catch (error) {
    logger.error('Manual collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Collection failed'
    });
  }
});

// Queue status endpoint
app.get('/status', async (req, res) => {
  try {
    const orchestrator = new OrchestratorIntegration();
    const status = await orchestrator.getOrchestratorQueueStatus();

    res.json({
      orchestratorQueue: status,
      service: 'twitter-collector'
    });
  } catch (error) {
    logger.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Status check failed'
    });
  }
});

const init = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start the worker
    const worker = startWorker();
    logger.info('✅ Worker started');

    // Schedule regular fetches
    await scheduleTwitterFetch();
    logger.info('✅ Scheduled tasks initialized');

    // Start the Express server
    const PORT = process.env.PORT || 3002;
    app.listen(PORT, () => {
      logger.info(`🚀 Twitter collector running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await worker.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await worker.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Initialization error:', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  init();
}

export { app };