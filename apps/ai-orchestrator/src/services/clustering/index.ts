import { PostClusteringService } from "./clustering-service";
import { PostClusteringController } from "./controller";
import { PostForClustering } from "./types";

const existingPosts: PostForClustering[] = [
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

// New posts coming into the system
const newPosts: PostForClustering[] = [
  // growth hacking
  {
    idx: 36,
    id: "reddit-20250911-037",
    source: "reddit",
    body: "Is it better to focus on SEO or partnerships first when trying to kickstart a niche marketplace?",
    keywords: ["seo", "partnerships", "growth", "marketplace"],
    category_id: 23,
    classification: "question",
    classification_confidence: 0.86,
    created_at: "2025-09-11T09:00:00Z",
  },
  {
    idx: 37,
    id: "twitter-20250912-038",
    source: "twitter",
    body: "We offered free credits to buyers—usage spiked but retention dropped. Incentives can backfire.",
    keywords: ["growth", "incentives", "retention"],
    category_id: 23,
    classification: "short",
    classification_confidence: 0.82,
    created_at: "2025-09-12T12:10:00Z",
  },

  // onboarding
  {
    idx: 38,
    id: "medium-20250913-039",
    source: "medium",
    body: "We redesigned first-run UX to show value before asking for data—activation jumped 22%.",
    keywords: ["onboarding", "activation", "ux", "growth"],
    category_id: 12,
    classification: "article",
    classification_confidence: 0.91,
    created_at: "2025-09-13T10:30:00Z",
  },
  {
    idx: 39,
    id: "reddit-20250915-040",
    source: "reddit",
    body: "How do you reduce friction in onboarding when your service needs trust (payments, addresses, ID)?",
    keywords: ["onboarding", "friction", "trust"],
    category_id: 12,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-15T15:00:00Z",
  },

  // retention
  {
    idx: 40,
    id: "quora-20250916-041",
    source: "quora",
    body: "What frameworks help analyze user churn in marketplaces beyond standard cohort analysis?",
    keywords: ["retention", "churn", "frameworks", "analysis"],
    category_id: 5,
    classification: "question",
    classification_confidence: 0.85,
    created_at: "2025-09-16T08:45:00Z",
  },
  {
    idx: 41,
    id: "medium-20250917-042",
    source: "medium",
    body: "We launched loyalty credits for repeat buyers—repeat purchase rate increased 30% in 6 weeks.",
    keywords: ["retention", "loyalty", "rewards", "growth"],
    category_id: 5,
    classification: "article",
    classification_confidence: 0.92,
    created_at: "2025-09-17T09:50:00Z",
  },

  // payments
  {
    idx: 42,
    id: "stackoverflow-20250918-043",
    source: "stackoverflow",
    body: "Stripe webhooks occasionally fail silently—how do you ensure retries and idempotency?",
    keywords: ["stripe", "webhooks", "payments", "idempotency"],
    category_id: 9,
    classification: "question",
    classification_confidence: 0.9,
    created_at: "2025-09-18T11:20:00Z",
  },
  {
    idx: 43,
    id: "reddit-20250919-044",
    source: "reddit",
    body: "Users in some regions can’t complete payments due to 3DS—what’s the simplest fallback?",
    keywords: ["payments", "3ds", "fallback", "regional"],
    category_id: 9,
    classification: "issue",
    classification_confidence: 0.88,
    created_at: "2025-09-19T14:00:00Z",
  },

  // fraud
  {
    idx: 44,
    id: "hn-20250920-045",
    source: "hackernews",
    body: "Fraudulent chargebacks are eating margin—does anyone use ML scoring before transactions?",
    keywords: ["fraud", "chargebacks", "ml", "risk"],
    category_id: 16,
    classification: "discussion",
    classification_confidence: 0.82,
    created_at: "2025-09-20T16:10:00Z",
  },
  {
    idx: 45,
    id: "linkedin-20250921-046",
    source: "linkedin",
    body: "Partnering with a third-party fraud detection vendor reduced disputes 40%.",
    keywords: ["fraud", "vendor", "disputes"],
    category_id: 16,
    classification: "update",
    classification_confidence: 0.9,
    created_at: "2025-09-21T17:30:00Z",
  },

  // search / discovery
  {
    idx: 46,
    id: "reddit-20250922-047",
    source: "reddit",
    body: "Search results feel random to users. Should we default to popularity or semantic relevance?",
    keywords: ["search", "ranking", "popularity", "relevance"],
    category_id: 18,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-22T12:00:00Z",
  },
  {
    idx: 47,
    id: "medium-20250923-048",
    source: "medium",
    body: "We layered collaborative filtering on top of embeddings to balance personalization with fairness.",
    keywords: [
      "recommendations",
      "search",
      "embeddings",
      "collaborative-filtering",
    ],
    category_id: 18,
    classification: "article",
    classification_confidence: 0.92,
    created_at: "2025-09-23T09:00:00Z",
  },

  // infra
  {
    idx: 48,
    id: "stackoverflow-20250924-049",
    source: "stackoverflow",
    body: "How to design queues that gracefully degrade when downstream APIs throttle?",
    keywords: ["queues", "api", "backpressure", "scaling"],
    category_id: 8,
    classification: "question",
    classification_confidence: 0.88,
    created_at: "2025-09-24T11:15:00Z",
  },
  {
    idx: 49,
    id: "hn-20250925-050",
    source: "hackernews",
    body: "We migrated to serverless workers—cold starts add latency but ops costs dropped significantly.",
    keywords: ["serverless", "workers", "latency", "costs"],
    category_id: 8,
    classification: "discussion",
    classification_confidence: 0.83,
    created_at: "2025-09-25T14:20:00Z",
  },

  // analytics
  {
    idx: 50,
    id: "reddit-20250926-051",
    source: "reddit",
    body: "Our Mixpanel vs BigQuery numbers don’t match—what’s the right source of truth?",
    keywords: ["analytics", "mixpanel", "bigquery", "truth"],
    category_id: 14,
    classification: "question",
    classification_confidence: 0.86,
    created_at: "2025-09-26T10:40:00Z",
  },
  {
    idx: 51,
    id: "medium-20250927-052",
    source: "medium",
    body: "Designing an event taxonomy early saved us months of rework down the line.",
    keywords: ["analytics", "taxonomy", "events", "design"],
    category_id: 14,
    classification: "article",
    classification_confidence: 0.9,
    created_at: "2025-09-27T12:30:00Z",
  },

  // compliance
  {
    idx: 52,
    id: "quora-20250928-053",
    source: "quora",
    body: "Launching in California — what minimal steps for CCPA compliance without heavy legal overhead?",
    keywords: ["ccpa", "compliance", "privacy"],
    category_id: 20,
    classification: "question",
    classification_confidence: 0.87,
    created_at: "2025-09-28T09:30:00Z",
  },
  {
    idx: 53,
    id: "reddit-20250929-054",
    source: "reddit",
    body: "Our app stores logs with partial PII for fraud monitoring — how to anonymize but keep useful?",
    keywords: ["privacy", "pii", "logging", "anonymization"],
    category_id: 20,
    classification: "discussion",
    classification_confidence: 0.84,
    created_at: "2025-09-29T10:00:00Z",
  },
];



const main = async () => {
  const openAIApiKey = process.env.OPENAI_API_KEY!;

  const service = new PostClusteringService(openAIApiKey);
  const controller = new PostClusteringController(service);
  const fs = require("fs").promises;

  // Initial setup
  const state = await controller.setupInitialClusters(existingPosts);
  const report = controller.exportResults(state);
  await fs.writeFile("initial-clusters.md", report);  

  console.log("Results saved to initial-clusters.md");

//   After optimization
//   const optimizedState = await controller.batchProcessWithOptimization(
//     newPosts,
//     state
//   );
//   const optimizedReport = controller.exportResults(optimizedState);
//   await fs.writeFile("initial-clusters-optimized.md", optimizedReport);
//   console.log("Results saved to initial-clusters-optimized.md");

//   // Process incoming stream
  const { updatedState, incrementalResult } = await controller.processNewPosts(
    newPosts,
    state
  );

  const changeReportInitial = controller.exportResults(updatedState);
  const changeReport = controller.exportIncrementalResults(
    incrementalResult,
    newPosts
  );
  await fs.writeFile("new-clusters.md", changeReportInitial);
  await fs.writeFile("incremental-clusters.md", changeReport);
};


main()