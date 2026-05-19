import { supabase } from "@/lib/supabase";
import { EnhancedClusteringService } from "@/services/enhanced-clustering.service";
import { PostForClustering } from "@/types";
import { embeddingsService } from "./utils/embeddings";
// import "dotenv/config";

// Sample data similar to your example
const samplePostsRaw: PostForClustering[] = [
  {
    idx: 0,
    id: "reddit-20250925-001",
    source: "reddit",
    body: "Launched my service marketplace 2 months ago — 120 providers signed up but zero job requests. Ads cost too much. How do I generate demand without burning cash?",
    keywords: ["marketplace", "supply", "demand", "growth", "ads"],
    category_id: 23,
    classification: "question",
    classification_confidence: 0.9,
    created_at: "2025-09-25T10:00:00Z",
  },

  {
    idx: 1,
    id: "quora-20250920-002",
    source: "quora",
    body: "Providers flood my marketplace but customers don't come. Are there low-cost tactics to kickstart buyer demand?",
    keywords: ["marketplace", "demand-generation", "growth-tactics"],
    category_id: 23,
    classification: "question",
    classification_confidence: 0.86,
    created_at: "2025-09-20T11:02:00Z",
  },

  {
    idx: 2,
    id: "twitter-20250923-003",
    source: "twitter",
    body: "150 signups, 0 transactions. How do you fix cold-start for a services marketplace without paid channels?",
    keywords: ["cold-start", "marketplace", "growth"],
    category_id: 23,
    classification: "short",
    classification_confidence: 0.8,
    created_at: "2025-09-23T08:10:00Z",
  },

  {
    idx: 3,
    id: "hn-20250926-004",
    source: "hackernews",
    body: "Is hiring a CMO for equity wise at seed stage when the marketplace has supply but no demand?",
    keywords: ["CMO", "equity", "marketplace", "hiring"],
    category_id: 23,
    classification: "discussion",
    classification_confidence: 0.7,
    created_at: "2025-09-26T09:30:00Z",
  },

  {
    idx: 4,
    id: "reddit-20250924-005",
    source: "reddit",
    body: "Concierge MVP worked: we manually fulfilled initial orders and seeded demand. Here's how we convinced suppliers this would scale.",
    keywords: ["concierge-mvp", "manual", "demand", "marketplace", "solution"],
    category_id: 23,
    classification: "tip",
    classification_confidence: 0.95,
    created_at: "2025-09-24T14:22:00Z",
  },

  {
    idx: 5,
    id: "medium-20250922-006",
    source: "medium",
    body: "The Ultimate Guide to Solving Marketplace Cold Start Problems — seed supply, create ethical fake demand, incentivize early customers.",
    keywords: ["guide", "cold-start", "marketplace", "incentives"],
    category_id: 23,
    classification: "article",
    classification_confidence: 0.92,
    created_at: "2025-09-22T10:15:00Z",
  },

  {
    idx: 6,
    id: "linkedin-20250921-007",
    source: "linkedin",
    body: "We shipped a matching feature that increased successful connections 40%—smart notifications and friction reduction were key.",
    keywords: ["feature", "matching", "notifications", "growth"],
    category_id: 23,
    classification: "update",
    classification_confidence: 0.88,
    created_at: "2025-09-21T16:45:00Z",
  },

  // onboarding / activation
  {
    idx: 7,
    id: "reddit-20250910-008",
    source: "reddit",
    body: "Our onboarding dropoff is 60% — users sign up then never complete profile. What UX changes actually help?",
    keywords: ["onboarding", "activation", "dropoff", "UX"],
    category_id: 12,
    classification: "question",
    classification_confidence: 0.9,
    created_at: "2025-09-10T09:00:00Z",
  },

  {
    idx: 8,
    id: "quora-20250912-009",
    source: "quora",
    body: "Should we force profile completion or make it optional? For service providers, many abandon at first-run tasks.",
    keywords: ["profile", "onboarding", "friction"],
    category_id: 12,
    classification: "question",
    classification_confidence: 0.83,
    created_at: "2025-09-12T12:00:00Z",
  },

  {
    idx: 9,
    id: "medium-20250915-010",
    source: "medium",
    body: "Case study: progressive profiling reduced onboarding friction and boosted activation by 18% over 3 months.",
    keywords: ["progressive-profiling", "onboarding", "case-study"],
    category_id: 12,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-15T07:00:00Z",
  },

  // retention / churn
  {
    idx: 10,
    id: "twitter-20250918-011",
    source: "twitter",
    body: "Daily active users halved after week two. Retention funnel shows biggest drop after first transaction—what to do?",
    keywords: ["retention", "churn", "funnel", "transactions"],
    category_id: 5,
    classification: "question",
    classification_confidence: 0.84,
    created_at: "2025-09-18T08:30:00Z",
  },

  {
    idx: 11,
    id: "hn-20250919-012",
    source: "hackernews",
    body: "We have great signups but low long-term retention — billing, onboarding, and poor first experience suspected.",
    keywords: ["retention", "billing", "first-impact"],
    category_id: 5,
    classification: "discussion",
    classification_confidence: 0.78,
    created_at: "2025-09-19T11:00:00Z",
  },

  // payments / checkout
  {
    idx: 12,
    id: "stripe-forum-20250905-013",
    source: "forum",
    body: "Multiple customers report checkout failures on iOS Safari with our Stripe integration — only mobile web affected.",
    keywords: ["payments", "checkout", "stripe", "ios", "safari"],
    category_id: 9,
    classification: "issue",
    classification_confidence: 0.9,
    created_at: "2025-09-05T09:20:00Z",
  },

  {
    idx: 13,
    id: "stack-20250906-014",
    source: "stackoverflow",
    body: "Why are tokenized payments failing with 'invalid_request_error' intermittently? Happens across regions.",
    keywords: ["payments", "api", "errors", "tokens"],
    category_id: 9,
    classification: "question",
    classification_confidence: 0.88,
    created_at: "2025-09-06T08:00:00Z",
  },

  // fraud / trust
  {
    idx: 14,
    id: "reddit-20250902-015",
    source: "reddit",
    body: "We've had multiple fake provider signups and chargebacks — how do others verify identity cheaply?",
    keywords: ["fraud", "verification", "chargebacks", "KYC"],
    category_id: 16,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-02T10:00:00Z",
  },

  {
    idx: 15,
    id: "quora-20250903-016",
    source: "quora",
    body: "What's a lightweight KYC flow that doesn't kill conversion for marketplaces?",
    keywords: ["KYC", "fraud", "conversion"],
    category_id: 16,
    classification: "question",
    classification_confidence: 0.85,
    created_at: "2025-09-03T11:00:00Z",
  },

  // search / discovery / relevance
  {
    idx: 16,
    id: "producthunt-20250908-017",
    source: "producthunt",
    body: "Search results are terrible — providers with perfect profiles don't appear. Relevance weighting? embeddings for search?",
    keywords: ["search", "ranking", "relevance", "embeddings"],
    category_id: 18,
    classification: "issue",
    classification_confidence: 0.9,
    created_at: "2025-09-08T09:00:00Z",
  },

  {
    idx: 17,
    id: "medium-20250910-018",
    source: "medium",
    body: "Using vector embeddings for semantic search improved discovery for long-tail service queries in our marketplace.",
    keywords: ["vector-search", "discovery", "embeddings"],
    category_id: 18,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-10T07:00:00Z",
  },

  // infrastructure / scaling
  {
    idx: 18,
    id: "hn-20250901-019",
    source: "hackernews",
    body: "API latency spikes under load — autoscaling doesn't keep up. How do you size workers for unpredictable bursts?",
    keywords: ["scaling", "autoscaling", "latency", "workers"],
    category_id: 8,
    classification: "discussion",
    classification_confidence: 0.82,
    created_at: "2025-09-01T12:34:00Z",
  },

  {
    idx: 19,
    id: "reddit-20250902-020",
    source: "reddit",
    body: "We hit timeouts during Black Friday tests — our Redis-based job queue backed up. Best patterns to drain queues?",
    keywords: ["queues", "redis", "timeouts", "jobs"],
    category_id: 8,
    classification: "issue",
    classification_confidence: 0.88,
    created_at: "2025-09-02T15:00:00Z",
  },

  // analytics / instrumentation
  {
    idx: 20,
    id: "analytics-20250911-021",
    source: "forum",
    body: "Our product metrics are inconsistent between backend and client — how do people design resilient event pipelines?",
    keywords: ["analytics", "events", "telemetry", "pipelines"],
    category_id: 14,
    classification: "question",
    classification_confidence: 0.85,
    created_at: "2025-09-11T10:00:00Z",
  },

  {
    idx: 21,
    id: "medium-20250913-022",
    source: "medium",
    body: "Event-driven design patterns for accurate analytics: deduplication, schema versioning, and retry logic.",
    keywords: ["event-driven", "analytics", "schema", "dedup"],
    category_id: 14,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-13T09:00:00Z",
  },

  // legal / privacy / compliance
  {
    idx: 22,
    id: "lawforum-20250914-023",
    source: "forum",
    body: "We're expanding to EU — do we need new contracts for suppliers and a GDPR audit? How to approach minimally?",
    keywords: ["gdpr", "contracts", "legal", "eu"],
    category_id: 20,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-14T09:00:00Z",
  },

  {
    idx: 23,
    id: "reddit-20250916-024",
    source: "reddit",
    body: "User deleted their account but some logs still contain PII — what's a practical retention/purge policy?",
    keywords: ["pii", "retention", "privacy", "logs"],
    category_id: 20,
    classification: "question",
    classification_confidence: 0.83,
    created_at: "2025-09-16T08:00:00Z",
  },

  // pricing / monetization
  {
    idx: 24,
    id: "quora-20250917-025",
    source: "quora",
    body: "How to price marketplace transactions? Flat fee vs percentage vs subscription for power-users?",
    keywords: ["pricing", "monetization", "fee-structure"],
    category_id: 6,
    classification: "question",
    classification_confidence: 0.86,
    created_at: "2025-09-17T09:00:00Z",
  },

  {
    idx: 25,
    id: "medium-20250918-026",
    source: "medium",
    body: "We moved from 10% transaction fee to freemium + subscription for power users — revenue per user increased but churn rose slightly.",
    keywords: ["pricing", "subscription", "revenue", "churn"],
    category_id: 6,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-18T10:00:00Z",
  },

  // notifications / engagement
  {
    idx: 26,
    id: "reddit-20250907-027",
    source: "reddit",
    body: "Push notifications are driving 20% reopens but also many users opt-out. How to tune timing and content?",
    keywords: ["notifications", "engagement", "push", "opt-out"],
    category_id: 11,
    classification: "question",
    classification_confidence: 0.84,
    created_at: "2025-09-07T07:00:00Z",
  },

  {
    idx: 27,
    id: "medium-20250909-028",
    source: "medium",
    body: "Behavioral-triggered notifications improved conversion when paired with personalization — case study.",
    keywords: ["notifications", "personalization", "case-study"],
    category_id: 11,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-09T08:00:00Z",
  },

  // developer experience / API
  {
    idx: 28,
    id: "stackoverflow-20250904-029",
    source: "stackoverflow",
    body: "Our public API has broken versioning — existing clients fail on new responses. Best versioning strategy?",
    keywords: ["api", "versioning", "breaking-changes"],
    category_id: 15,
    classification: "question",
    classification_confidence: 0.88,
    created_at: "2025-09-04T09:30:00Z",
  },

  {
    idx: 29,
    id: "hn-20250902-030",
    source: "hackernews",
    body: "Third-party SDK caused a memory leak in our mobile app — how do teams find and prevent these regressions?",
    keywords: ["sdk", "memory", "mobile", "regressions"],
    category_id: 8,
    classification: "issue",
    classification_confidence: 0.82,
    created_at: "2025-09-02T13:00:00Z",
  },

  // customer support / ops
  {
    idx: 30,
    id: "support-20250919-031",
    source: "forum",
    body: "Support overhead is growing — many tickets are repetitive 'where is my order' or 'how to refund'. How to automate while keeping quality?",
    keywords: ["support", "automation", "tickets", "refunds"],
    category_id: 16,
    classification: "question",
    classification_confidence: 0.86,
    created_at: "2025-09-19T11:00:00Z",
  },

  {
    idx: 31,
    id: "reddit-20250920-032",
    source: "reddit",
    body: "Refund abuse is rising — unclear policy and manual processing open us to exploitation. Need ideas to scale fair refunds.",
    keywords: ["refunds", "policy", "abuse", "ops"],
    category_id: 16,
    classification: "issue",
    classification_confidence: 0.88,
    created_at: "2025-09-20T12:00:00Z",
  },

  // hiring / team
  {
    idx: 32,
    id: "linkedin-20250905-033",
    source: "linkedin",
    body: "As a small startup, how do we prioritize hiring first PM or sales lead? We need product direction and revenue.",
    keywords: ["hiring", "pm", "sales", "prioritization"],
    category_id: 21,
    classification: "question",
    classification_confidence: 0.84,
    created_at: "2025-09-05T09:00:00Z",
  },

  {
    idx: 33,
    id: "quora-20250906-034",
    source: "quora",
    body: "Equity-for-growth hires: have you given equity to a growth lead and seen measurable impact?",
    keywords: ["equity", "hiring", "growth"],
    category_id: 21,
    classification: "question",
    classification_confidence: 0.8,
    created_at: "2025-09-06T09:30:00Z",
  },

  // content moderation / safety
  {
    idx: 34,
    id: "reddit-20250903-035",
    source: "reddit",
    body: "We need to moderate listings quickly but manual review is costly. Anyone built fast heuristics to escalate risky listings?",
    keywords: ["moderation", "safety", "listings", "heuristics"],
    category_id: 19,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-03T10:00:00Z",
  },

  {
    idx: 35,
    id: "medium-20250904-036",
    source: "medium",
    body: "Hybrid moderation approach: automated models + sampled human review kept accuracy high while reducing cost.",
    keywords: ["moderation", "ml", "human-in-loop", "hybrid"],
    category_id: 19,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-04T11:00:00Z",
  },
];
async function testClustering() {
  console.log("🧪 Testing Enhanced Clustering System");
  console.log("=".repeat(50));

  try {
    console.log("🔄 Step 1: Generating embeddings for all posts...");
    const startEmbedding = Date.now();

    // Generate embeddings for all posts
    const samplePosts: PostForClustering[] = await Promise.all(
      samplePostsRaw.map(async (post) => {
        const enhancedBody =
          post.body +
          " [KEYWORDS: " +
          post.keywords.join(", ") +
          "] [TYPE: " +
          post.classification +
          "]";
        const embedding =
          await embeddingsService.generateEmbedding(enhancedBody);
        return {
          ...post,
          embedding,
        };
      
      })
    );

    const embeddingTime = Date.now() - startEmbedding;
    console.log(
      `✅ Generated ${samplePosts.length} embeddings in ${embeddingTime}ms`
    );
    console.log();

    // Initialize the clustering service
    const clusteringService = new EnhancedClusteringService(supabase);

    console.log(
      `📊 Input: ${samplePosts.length} posts from different sources:`
    );
    const sourceCounts = samplePosts.reduce(
      (acc, post) => {
        acc[post.source] = (acc[post.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    Object.entries(sourceCounts).forEach(([source, count]) => {
      console.log(`   - ${source}: ${count} posts`);
    });
    console.log();

    // Perform clustering
    console.log("🔄 Step 2: Running clustering algorithm...");
    const startTime = Date.now();

    const result = await clusteringService.clusterPosts(samplePosts);

    const endTime = Date.now();
    console.log(`✅ Clustering completed in ${endTime - startTime}ms`);
    console.log();

    // Display results
    console.log("📋 CLUSTERING RESULTS");
    console.log("=".repeat(50));

    console.log(`🎯 Created ${result.clusters.length} clusters`);
    console.log(`🏷️  ${result.unclustered.length} unclustered posts`);
    console.log();

    // Display each cluster
    result.clusters.forEach((cluster, index) => {
      console.log(`📦 CLUSTER ${index + 1}: ${cluster.name}`);
      console.log(`   Type: ${cluster.type.toUpperCase()}`);
      console.log(`   Description: ${cluster.description}`);
      console.log(`   Category ID: ${cluster.category_id}`);
      console.log(`   Members: ${cluster.member_count} posts`);
      console.log(`   Representative Post: ${cluster.representative_post_id}`);
      console.log(`   Keywords: ${cluster.metadata.keywords.join(", ")}`);
      console.log(`   Sources: ${JSON.stringify(cluster.metadata.sources)}`);
      console.log(
        `   Confidence: ${cluster.metadata.aggregated_confidence.toFixed(3)}`
      );
      console.log(
        `   Date Range: ${cluster.metadata.first_seen.split("T")[0]} to ${cluster.metadata.last_seen.split("T")[0]}`
      );
      console.log(`   Member IDs:`);
      cluster.member_ids.forEach((id) => console.log(`     - ${id}`));
      console.log();
    });

    if (result.unclustered.length > 0) {
      console.log(`🏷️  UNCLUSTERED POSTS:`);
      result.unclustered.forEach((id) => console.log(`   - ${id}`));
      console.log();
    }

    // Summary stats
    console.log("📊 SUMMARY STATISTICS");
    console.log("=".repeat(50));
    console.log(`Total posts: ${samplePosts.length}`);
    console.log(
      `Clustered: ${samplePosts.length - result.unclustered.length} (${(((samplePosts.length - result.unclustered.length) / samplePosts.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `Unclustered: ${result.unclustered.length} (${((result.unclustered.length / samplePosts.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `Average cluster size: ${result.clusters.length > 0 ? (result.clusters.reduce((sum, c) => sum + c.member_count, 0) / result.clusters.length).toFixed(1) : 0}`
    );
    console.log();

    // Output JSON format
    console.log("📤 JSON OUTPUT:");
    console.log("=".repeat(50));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Error during clustering test:", error);
    process.exit(1);
  }
}

testClustering();