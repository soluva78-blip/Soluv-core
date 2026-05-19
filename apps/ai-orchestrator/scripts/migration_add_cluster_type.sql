-- Migration: Add cluster type and enhanced metadata fields
-- Date: 2025-09-27

-- Add post_type enum if it doesn't exist (already exists in current schema)
-- CREATE TYPE post_type AS ENUM ('problem', 'solution');

-- Add new fields to clusters table
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS type post_type DEFAULT 'problem';
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS representative_post_id VARCHAR(255) REFERENCES posts(id);
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS member_ids TEXT[] DEFAULT '{}';

-- Add indices for new fields
CREATE INDEX IF NOT EXISTS idx_clusters_type ON clusters(type);
CREATE INDEX IF NOT EXISTS idx_clusters_representative_post ON clusters(representative_post_id);

-- Update find_nearest_cluster function to include new fields
CREATE OR REPLACE FUNCTION find_nearest_cluster(p_embedding text, p_threshold float)
RETURNS TABLE(
    id int,
    name text,
    type post_type,
    centroid vector(1536),
    member_count int,
    similarity float,
    description text,
    representative_post_id text,
    member_ids text[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.type,
        c.centroid,
        c.member_count,
        1 - (c.centroid <=> p_embedding::vector) AS similarity,
        c.description,
        c.representative_post_id,
        c.member_ids
    FROM clusters c
    WHERE 1 - (c.centroid <=> p_embedding::vector) >= p_threshold
    ORDER BY c.centroid <=> p_embedding::vector
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to add post to cluster member list
CREATE OR REPLACE FUNCTION add_post_to_cluster_members(p_cluster_id int, p_post_id text)
RETURNS void AS $$
BEGIN
    UPDATE clusters
    SET member_ids = array_append(
        COALESCE(member_ids, '{}'),
        p_post_id
    ),
    updated_at = NOW()
    WHERE id = p_cluster_id
    AND NOT (p_post_id = ANY(COALESCE(member_ids, '{}')));
END;
$$ LANGUAGE plpgsql;

-- Create function to remove post from cluster member list
CREATE OR REPLACE FUNCTION remove_post_from_cluster_members(p_cluster_id int, p_post_id text)
RETURNS void AS $$
BEGIN
    UPDATE clusters
    SET member_ids = array_remove(member_ids, p_post_id),
    updated_at = NOW()
    WHERE id = p_cluster_id;
END;
$$ LANGUAGE plpgsql;