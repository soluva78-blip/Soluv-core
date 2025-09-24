# AI Orchestrator Service

A complete AI-powered post processing orchestrator built with Node.js, TypeScript, and LangGraph. This service processes posts through a multi-stage pipeline including validity checks, classification, sentiment analysis, semantic analysis, clustering, and trend detection.

## <× Architecture

The orchestrator uses a graph-based pipeline with the following stages:

1. **Load Post** - Fetches post from database
2. **Spam/PII Check** - Detects spam and personal information
3. **Validity Check** - Determines if post contains actionable problems
4. **Classification** - Categorizes posts (bug, feature request, question, etc.)
5. **Semantic Analysis** - Generates summary, keywords, and embeddings
6. **Sentiment Analysis** - Analyzes emotional tone
7. **Category Assignment** - Assigns to industry/domain categories
8. **Cluster Assignment** - Groups similar posts using vector similarity
9. **Record Mention** - Tracks mentions for trend analysis
10. **Finalize** - Marks processing complete

## =€ Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL with pgvector extension
- Redis server
- Supabase account (or direct Postgres connection)
- OpenAI API key

### Installation

1. **Clone and install dependencies**:
```bash
cd apps/ai-orchestrator
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your actual values
```

3. **Initialize database**:
```bash
# If using Supabase, run this in the SQL editor
# If using direct Postgres, run:
psql -d your_database -f scripts/init_db.sql
```

4. **Generate database types** (if using Supabase):
```bash
npm run generate-types
```

### Running the Service

**Development mode**:
```bash
npm run dev
```

**Production**:
```bash
npm run build
npm start
```

### Processing Posts

To add posts to the processing queue, you can use the orchestrator queue:

```typescript
import { addPostToQueue } from './src/queues/orchestrator.queue';

// Add a post for processing
await addPostToQueue('post-id-123');
```

Or directly run the worker:
```bash
npm run dev src/worker.ts
```

## =Ê Monitoring & Scripts

### Calculate Trends
```bash
npm run trends:calculate
```

### Recompute Clusters
```bash
npm run clusters:recompute
```

### Check Queue Status
The orchestrator exposes queue metrics that you can monitor programmatically.

## =' Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 3000 |
| `SUPABASE_URL` | Supabase project URL | - |
| `SUPABASE_KEY` | Supabase anon key | - |
| `REDIS_HOST` | Redis hostname | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_MODEL` | GPT model to use | gpt-4-turbo-preview |
| `EMBEDDING_MODEL` | Embedding model | text-embedding-ada-002 |
| `ORCH_CONCURRENCY` | Worker concurrency | 5 |
| `CLUSTER_SIMILARITY_THRESHOLD` | Clustering threshold | 0.7 |
| `MAX_TOKENS_PER_MINUTE` | Rate limit for tokens | 100000 |
| `MAX_REQUESTS_PER_MINUTE` | Rate limit for requests | 100 |

### Rate Limiting & Cost Controls

The service includes built-in rate limiting and cost controls:

- Token bucket algorithm for OpenAI API calls
- Configurable retry logic with exponential backoff  
- Request batching for embeddings
- Comprehensive metrics collection

## >é Components

### Agents

Each processing stage is handled by specialized agents:

- **ValidityAgent**: Checks if posts contain actionable problems
- **ClassificationAgent**: Categorizes posts into predefined types
- **SemanticAgent**: Generates summaries, keywords, and embeddings
- **SentimentAgent**: Analyzes emotional tone and sentiment
- **CategoryAgent**: Assigns posts to industry/domain categories
- **ClusterAgent**: Groups similar posts using vector similarity
- **SpamAgent**: Detects spam and PII content

### Repositories

Data access layer with methods for:

- **PostsRepository**: CRUD operations and processing status management
- **CategoriesRepository**: Category management with auto-creation
- **ClustersRepository**: Cluster management and centroid updates
- **MentionsRepository**: Mention tracking for trend calculation

### Services

- **OrchestratorService**: Main orchestration logic using LangGraph
- **ClusteringService**: Vector similarity and clustering algorithms
- **TrendsService**: Trend detection and scoring

## =Ä Database Schema

The service uses PostgreSQL with pgvector extension. Key tables:

- **posts**: Main post data with processing results
- **categories**: Hierarchical categories
- **clusters**: Vector clusters with centroids
- **mentions**: Mention tracking for trends
- **trends**: Calculated trend scores
- **audit_log**: Processing audit trail

## = Processing Flow

```mermaid
graph TD
    A[Queue Post] --> B[Load Post]
    B --> C[Spam/PII Check]
    C --> D{Valid Content?}
    D -->|No| E[Mark Failed]
    D -->|Yes| F[Validity Check]
    F --> G{Is Valid?}
    G -->|No| E
    G -->|Yes| H[Classification]
    H --> I[Semantic Analysis]
    I --> J[Sentiment Analysis]
    J --> K[Category Assignment]
    K --> L[Cluster Assignment]
    L --> M[Record Mention]
    M --> N[Mark Complete]
```

## =¨ Error Handling

- **Idempotency**: Posts won't be processed twice
- **Retry Logic**: Failed posts retry with exponential backoff
- **Graceful Degradation**: Individual stage failures don't block the entire pipeline
- **Comprehensive Logging**: Full audit trail of all processing steps

## =È Metrics & Observability

The service collects comprehensive metrics:

- Posts processed per minute
- Processing latency by stage
- Token usage and costs
- Error rates by agent
- Queue depth and processing times

## = Security Features

- **PII Detection**: Automatic detection and flagging of personal information
- **Spam Filtering**: Multi-layer spam detection
- **Rate Limiting**: Protection against API abuse
- **Input Validation**: Comprehensive input sanitization

## >ê Testing

Run the test suite:
```bash
npm test
```

The tests cover:
- Repository operations
- Agent functionality (with mocked LLM calls)
- Orchestration flow
- Error handling scenarios

## = Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Verify Supabase credentials
   - Ensure database is accessible
   - Check if pgvector extension is installed

2. **OpenAI API Errors**:
   - Verify API key is correct and has credits
   - Check rate limits in OpenAI dashboard
   - Ensure model names are correct

3. **Redis Connection Issues**:
   - Verify Redis server is running
   - Check connection credentials
   - Ensure Redis is accessible from your network

4. **Processing Stuck**:
   - Check queue status: `orchestratorQueue.getQueueStatus()`
   - Look for failed jobs: `orchestratorQueue.getFailed()`
   - Review logs for error patterns

### Logs Location

Logs are output to console in development. Configure log persistence as needed for production.

## > Contributing

1. Follow TypeScript strict mode guidelines
2. Add tests for new functionality
3. Update documentation for API changes
4. Use conventional commit messages

## =Ä License

[Your License Here]