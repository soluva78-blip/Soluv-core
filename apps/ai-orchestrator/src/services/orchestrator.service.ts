import { CategoryAgent } from "@/agents/category.agent";
import { ClassificationAgent } from "@/agents/classification.agent";
import { ClusterAgent } from "@/agents/cluster.agent";
import { SemanticAgent } from "@/agents/semantic.agent";
import { SentimentAgent } from "@/agents/sentiment.agent";
import { SpamAgent } from "@/agents/spam.agent";
import { ValidityAgent } from "@/agents/validity.agent";
import { CategoriesRepository } from "@/repositories/categories.repository";
import { ClustersRepository } from "@/repositories/clusters.repository";
import { MentionsRepository } from "@/repositories/mentions.repository";
import { PostsRepository } from "@/repositories/posts.repository";
import { AgentResult, ProcessedPost } from "@/types";
import { metricsCollector } from "@/utils/metrics";
import { StateGraph } from "@langchain/langgraph";
import { SupabaseClient } from "@supabase/supabase-js";

export interface OrchestrationState {
  postId: string;
  post?: ProcessedPost;
  validityResult?: AgentResult<{
    isValid: boolean;
    reason: string;
  }>;
  classificationResult?: AgentResult<{
    classification: string;
    confidence: number;
  }>;
  semanticResult?: AgentResult<{
    summary: string;
    embedding: number[];
    keywords: string[];
  }>;
  sentimentResult?: AgentResult<{
    sentiment: string;
    score: number;
    confidence: number;
  }>;
  categoryResult?: AgentResult<{ categoryId: string; categoryName: string }>;
  clusterResult?: AgentResult<{ clusterId: string; isNewCluster: boolean }>;
  spamResult?: AgentResult<{
    isSpam: boolean;
    hasPii: boolean;
    notes?: string;
  }>;
  error?: string;
}

export class OrchestratorService {
  private postsRepo: PostsRepository;
  private categoriesRepo: CategoriesRepository;
  private clustersRepo: ClustersRepository;
  private mentionsRepo: MentionsRepository;

  private validityAgent: ValidityAgent;
  private classificationAgent: ClassificationAgent;
  private semanticAgent: SemanticAgent;
  private sentimentAgent: SentimentAgent;
  private categoryAgent: CategoryAgent;
  private clusterAgent: ClusterAgent;
  private spamAgent: SpamAgent;

  private app: ReturnType<
    StateGraph<OrchestrationState, typeof this.channels>["compile"]
  >;

  constructor(supabase: SupabaseClient) {
    this.postsRepo = new PostsRepository(supabase);
    this.categoriesRepo = new CategoriesRepository(supabase);
    this.clustersRepo = new ClustersRepository(supabase);
    this.mentionsRepo = new MentionsRepository(supabase);

    this.validityAgent = new ValidityAgent();
    this.classificationAgent = new ClassificationAgent();
    this.semanticAgent = new SemanticAgent();
    this.sentimentAgent = new SentimentAgent();
    this.categoryAgent = new CategoryAgent(this.categoriesRepo);
    this.clusterAgent = new ClusterAgent(this.clustersRepo);
    this.spamAgent = new SpamAgent();

    this.app = this.initializeGraph();
  }

  private channels = Object.fromEntries(
    (
      [
        "postId",
        "post",
        "validityResult",
        "classificationResult",
        "semanticResult",
        "sentimentResult",
        "categoryResult",
        "clusterResult",
        "spamResult",
        "error",
      ] as const
    ).map((key) => [key, { reducer: (_: any, y: any) => y }])
  );

  private initializeGraph() {
    const graph = new StateGraph<OrchestrationState, typeof this.channels>({
      channels: this.channels,
    })
      .addNode("load_post", this.loadPost.bind(this))
      .addNode("spam_check", this.spamCheck.bind(this))
      .addNode("validity_check", this.validityCheck.bind(this))
      .addNode("classification", this.classification.bind(this))
      .addNode("semantic_analysis", this.semanticAnalysis.bind(this))
      .addNode("sentiment_analysis", this.sentimentAnalysis.bind(this))
      .addNode("category_assignment", this.categoryAssignment.bind(this))
      .addNode("cluster_assignment", this.clusterAssignment.bind(this))
      .addNode("record_mention", this.recordMention.bind(this))
      .addNode("finalize", this.finalize.bind(this))
      .addEdge("load_post", "spam_check")
      .addConditionalEdges("spam_check", this.shouldContinue.bind(this), {
        continue: "validity_check",
        stop: "finalize",
      })
      .addConditionalEdges("validity_check", this.shouldContinue.bind(this), {
        continue: "classification",
        stop: "finalize",
      })
      .addEdge("classification", "semantic_analysis")
      .addEdge("semantic_analysis", "sentiment_analysis")
      .addEdge("sentiment_analysis", "category_assignment")
      .addEdge("category_assignment", "cluster_assignment")
      .addEdge("cluster_assignment", "record_mention")
      .addEdge("record_mention", "finalize")
      .addEdge("__start__", "load_post");

    // ✅ cast the type to satisfy TS
    return graph.compile() as ReturnType<
      StateGraph<OrchestrationState, typeof this.channels>["compile"]
    >;
  }

  async processPost(postId: string): Promise<void> {
    const startTime = Date.now();
    try {
      const lockAcquired = await this.postsRepo.acquireLock(postId);
      if (!lockAcquired) {
        console.log(`Post ${postId} already processing/failed too often`);
        return;
      }

      console.log(`Processing post ${postId}...`);

      const initialState: OrchestrationState = { postId };
      await this.app.invoke(initialState); // ✅ FIXED

      await this.postsRepo.releaseLock(postId, true);

      const processingTime = Date.now() - startTime;
      metricsCollector.recordPostProcessed(processingTime);
      console.log(`Finished post ${postId} in ${processingTime}ms`);
    } catch (error) {
      console.error(`Failed post ${postId}:`, error);
      await this.postsRepo.releaseLock(postId, false, (error as Error).message);
      metricsCollector.recordError();
      throw error;
    }
  }
  // === Graph Nodes ===

  private async loadPost(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const post = await this.postsRepo.findById(state.postId);
    if (!post) throw new Error(`Post ${state.postId} not found`);
    return { post };
  }

  private async spamCheck(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.spamAgent.checkSpamAndPii(
      post.title,
      post.body,
      post.author
    );

    if (result.success) {
      await this.postsRepo.updateSpamPiiFlags(
        post.id,
        result.data.isSpam,
        result.data.hasPii,
        result.data.notes
      );
    }
    return { spamResult: result };
  }

  private async validityCheck(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.validityAgent.checkValidity(
      post.title,
      post.body
    );

    if (result.success) {
      await this.postsRepo.updateValidityCheck(
        post.id,
        result.data.isValid,
        result.data.reason
      );
    }
    return { validityResult: result };
  }

  private async classification(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.classificationAgent.classifyPost(
      post.title,
      post.body
    );

    if (result.success) {
      await this.postsRepo.updateClassification(
        post.id,
        result.data.classification,
        result.data.confidence
      );
    }
    return { classificationResult: result };
  }

  private async semanticAnalysis(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.semanticAgent.analyzePost(post.title, post.body);

    if (result.success) {
      await this.postsRepo.updateSemanticAnalysis(
        post.id,
        result.data.summary,
        result.data.embedding,
        result.data.keywords
      );
    }
    return { semanticResult: result };
  }

  private async sentimentAnalysis(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.sentimentAgent.analyzeSentiment(
      post.title,
      post.body
    );

    if (result.success) {
      await this.postsRepo.updateSentiment(
        post.id,
        result.data.sentiment,
        result.data.score
      );
    }
    return { sentimentResult: result };
  }

  private async categoryAssignment(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post, classificationResult } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.categoryAgent.assignCategory(
      post.title,
      post.body,
      classificationResult?.data?.classification!
    );

    if (result.success) {
      await this.postsRepo.updateCategory(post.id, result.data.categoryId);
    }
    return { categoryResult: result };
  }

  private async clusterAssignment(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post, semanticResult, categoryResult } = state;
    if (!post) throw new Error("Post not loaded");
    const result = await this.clusterAgent.assignCluster(
      post.id,
      semanticResult?.data?.embedding ?? [],
      parseInt(categoryResult?.data?.categoryId!),
      post.title
    );

    if (result.success) {
      await this.postsRepo.updateCluster(post.id, result.data.clusterId);
    }
    return { clusterResult: result };
  }

  private async recordMention(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { post, clusterResult, categoryResult, sentimentResult } = state;
    if (!post) throw new Error("Post not loaded");

    if (
      clusterResult?.success &&
      categoryResult?.success &&
      sentimentResult?.success
    ) {
      await this.mentionsRepo.create(
        post.id,
        parseInt(clusterResult.data?.clusterId ?? "0"),
        parseInt(categoryResult.data?.categoryId ?? "0"),
        sentimentResult.data?.score
      );
    }
    return {};
  }

  private async finalize(
    _: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    return {};
  }

  private shouldContinue(state: OrchestrationState): string {
    if (state.spamResult?.data?.isSpam || state.spamResult?.data?.hasPii) {
      return "stop";
    }
    if (state.validityResult && !state.validityResult.data?.isValid) {
      return "stop";
    }
    return "continue";
  }
}
