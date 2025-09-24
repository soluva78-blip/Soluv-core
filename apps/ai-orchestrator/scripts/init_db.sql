-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enum types
CREATE TYPE post_status AS ENUM ('unprocessed', 'processing', 'processed', 'failed');
CREATE TYPE post_classification AS ENUM ('bug', 'feature_request', 'question', 'discussion', 'documentation', 'other');
CREATE TYPE sentiment_label AS ENUM ('positive', 'neutral', 'negative');

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    score NUMERIC DEFAULT 0,
    url TEXT NOT NULL,
    
    -- Processing status
    status post_status DEFAULT 'unprocessed',
    processing_started_at TIMESTAMP,
    processed_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Validity check results
    is_valid BOOLEAN,
    validity_reason TEXT,
    
    -- Classification results
    classification post_classification,
    classification_confidence NUMERIC,
    
    -- Semantic analysis results
    summary TEXT,
    embedding vector(1536),
    keywords TEXT[],
    
    -- Sentiment analysis results
    sentiment_label sentiment_label,
    sentiment_score NUMERIC,
    
    -- Category assignment
    category_id INTEGER,
    
    -- Cluster assignment
    cluster_id INTEGER,
    
    -- Spam/PII detection
    is_spam BOOLEAN DEFAULT FALSE,
    has_pii BOOLEAN DEFAULT FALSE,
    moderation_notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES categories(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Clusters table
CREATE TABLE IF NOT EXISTS clusters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    centroid vector(1536) NOT NULL,
    member_count INTEGER DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_recomputed_at TIMESTAMP
);

-- Mentions table for trend tracking
CREATE TABLE IF NOT EXISTS mentions (
    id SERIAL PRIMARY KEY,
    post_id VARCHAR(255) REFERENCES posts(id),
    cluster_id INTEGER REFERENCES clusters(id),
    category_id INTEGER REFERENCES categories(id),
    mentioned_at TIMESTAMP DEFAULT NOW(),
    sentiment_score NUMERIC,
    engagement_score NUMERIC
);

-- Trends table
CREATE TABLE IF NOT EXISTS trends (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER REFERENCES clusters(id),
    category_id INTEGER REFERENCES categories(id),
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    mention_count INTEGER DEFAULT 0,
    growth_rate NUMERIC,
    trend_score NUMERIC,
    avg_sentiment NUMERIC,
    metadata JSONB DEFAULT '{}',
    calculated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(cluster_id, period_start, period_end)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    post_id VARCHAR(255),
    agent_name VARCHAR(100),
    action VARCHAR(100),
    input JSONB,
    output JSONB,
    tokens_used INTEGER,
    latency_ms INTEGER,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_processed_at ON posts(processed_at);
CREATE INDEX IF NOT EXISTS idx_posts_embedding ON posts USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_cluster ON posts(cluster_id);

CREATE INDEX IF NOT EXISTS idx_clusters_centroid ON clusters USING ivfflat (centroid vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_clusters_category ON clusters(category_id);

CREATE INDEX IF NOT EXISTS idx_mentions_cluster ON mentions(cluster_id);
CREATE INDEX IF NOT EXISTS idx_mentions_category ON mentions(category_id);
CREATE INDEX IF NOT EXISTS idx_mentions_time ON mentions(mentioned_at);

CREATE INDEX IF NOT EXISTS idx_trends_cluster ON trends(cluster_id);
CREATE INDEX IF NOT EXISTS idx_trends_period ON trends(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_audit_post ON audit_log(post_id);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Database functions

-- Function to find nearest cluster using pgvector
CREATE OR REPLACE FUNCTION find_nearest_cluster(p_embedding text, p_threshold float)
RETURNS TABLE(id int, name text, centroid vector(1536), member_count int, similarity float) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.centroid,
        c.member_count,
        1 - (c.centroid <=> p_embedding::vector) AS similarity
    FROM clusters c
    WHERE 1 - (c.centroid <=> p_embedding::vector) >= p_threshold
    ORDER BY c.centroid <=> p_embedding::vector
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to increment retry count atomically
CREATE OR REPLACE FUNCTION increment_retry(p_post_id text)
RETURNS void AS $$
BEGIN
    UPDATE posts 
    SET retry_count = COALESCE(retry_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment member count atomically
CREATE OR REPLACE FUNCTION increment_member_count(p_cluster_id int)
RETURNS int AS $$
DECLARE
    new_count int;
BEGIN
    UPDATE clusters 
    SET member_count = member_count + 1,
        updated_at = NOW()
    WHERE id = p_cluster_id
    RETURNING member_count INTO new_count;
    
    RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate trend scores
CREATE OR REPLACE FUNCTION calculate_trend_score(
    p_cluster_id int, 
    p_period_start timestamp, 
    p_period_end timestamp
)
RETURNS TABLE(
    current_count bigint,
    previous_count bigint,
    growth_rate numeric,
    avg_sentiment numeric
) AS $$
DECLARE
    prev_period_start timestamp := p_period_start - (p_period_end - p_period_start);
BEGIN
    RETURN QUERY
    WITH current_period AS (
        SELECT 
            COUNT(*) as count,
            AVG(sentiment_score) as avg_sent
        FROM mentions 
        WHERE cluster_id = p_cluster_id 
          AND mentioned_at >= p_period_start 
          AND mentioned_at <= p_period_end
    ),
    previous_period AS (
        SELECT COUNT(*) as count
        FROM mentions 
        WHERE cluster_id = p_cluster_id 
          AND mentioned_at >= prev_period_start 
          AND mentioned_at < p_period_start
    )
    SELECT 
        c.count as current_count,
        p.count as previous_count,
        CASE 
            WHEN p.count > 0 THEN ((c.count - p.count)::numeric / p.count * 100)
            WHEN c.count > 0 THEN 100::numeric
            ELSE 0::numeric
        END as growth_rate,
        COALESCE(c.avg_sent, 0) as avg_sentiment
    FROM current_period c, previous_period p;
END;
$$ LANGUAGE plpgsql;