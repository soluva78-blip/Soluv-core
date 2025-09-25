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
import { AgentResult, ProcessedPost, RawPost } from "@/types";
import { metricsCollector } from "@/utils/metrics";
import { SupabaseClient } from "@supabase/supabase-js";

export interface OrchestrationState {
  postId: string;
  rawPost: RawPost;
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
  categoryResult?: AgentResult<{ categoryId: number; categoryName: string }>;
  clusterResult?: AgentResult<{ clusterId: number; isNewCluster: boolean }>;
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
  }

  async processPost(rawPost: RawPost): Promise<void> {
    const startTime = Date.now();
    const postId = rawPost.id;
    
    try {
      // Check if post already processed to avoid duplicates
      const existingPost = await this.postsRepo.findById(postId);
      if (existingPost && existingPost.status === 'processed') {
        console.log(`Post ${postId} already processed, skipping...`);
        return;
      }

      console.log(`Processing post ${postId}...`);

      // Create initial database record for tracking
      await this.postsRepo.createFromRawPost(rawPost);

      // Execute orchestration pipeline sequentially
      await this.executeOrchestrationPipeline(rawPost);

      // Mark as completed
      await this.postsRepo.updateById(postId, {
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const processingTime = Date.now() - startTime;
      metricsCollector.recordPostProcessed(processingTime);
      console.log(`Finished post ${postId} in ${processingTime}ms`);
    } catch (error) {
      console.error(`Failed post ${postId}:`, error);
      
      // Mark as failed
      await this.postsRepo.updateById(postId, {
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: (error as Error).message,
        updated_at: new Date().toISOString(),
      });
      
      metricsCollector.recordError();
      throw error;
    }
  }

  private async executeOrchestrationPipeline(rawPost: RawPost): Promise<void> {
    let state: OrchestrationState = {
      postId: rawPost.id,
      rawPost
    };

    // Step 1: Spam/PII Check
    const spamResult = await this.spamCheck(state);
    state = { ...state, ...spamResult };
    
    if (this.shouldStop(state)) {
      console.log(`Stopping processing for post ${rawPost.id} - spam/PII detected`);
      return;
    }

    // Step 2: Validity Check
    const validityResult = await this.validityCheck(state);
    state = { ...state, ...validityResult };
    
    if (this.shouldStop(state)) {
      console.log(`Stopping processing for post ${rawPost.id} - not valid`);
      return;
    }

    // Step 3: Classification
    const classificationResult = await this.classification(state);
    state = { ...state, ...classificationResult };

    // Step 4: Semantic Analysis
    const semanticResult = await this.semanticAnalysis(state);
    state = { ...state, ...semanticResult };

    // Step 5: Sentiment Analysis
    const sentimentResult = await this.sentimentAnalysis(state);
    state = { ...state, ...sentimentResult };

    // Step 6: Category Assignment
    const categoryResult = await this.categoryAssignment(state);
    state = { ...state, ...categoryResult };

    // Step 7: Cluster Assignment
    const clusterResult = await this.clusterAssignment(state);
    state = { ...state, ...clusterResult };

    // Step 8: Record Mention
    await this.recordMention(state);

    console.log(`Successfully completed orchestration pipeline for post ${rawPost.id}`);
  }

  private shouldStop(state: OrchestrationState): boolean {
    if (state.spamResult?.data?.isSpam || state.spamResult?.data?.hasPii) {
      return true;
    }
    if (state.validityResult && !state.validityResult.data?.isValid) {
      return true;
    }
    return false;
  }

  // === Pipeline Steps ===

  private async spamCheck(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.spamAgent.checkSpamAndPii(
      rawPost.title,
      rawPost.body,
      rawPost.author.name
    );

    if (result.success) {
      await this.postsRepo.updateSpamPiiFlags(
        rawPost.id,
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
    const { rawPost } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.validityAgent.checkValidity(
      rawPost.title,
      rawPost.body
    );

    console.log({result})

    if (result.success) {
      await this.postsRepo.updateValidityCheck(
        rawPost.id,
        result.data.isValid,
        result.data.reason
      );
    }
    return { validityResult: result };
  }

  private async classification(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.classificationAgent.classifyPost(
      rawPost.title,
      rawPost.body
    );

    if (result.success) {
      await this.postsRepo.updateClassification(
        rawPost.id,
        result.data.classification,
        result.data.confidence
      );
    }
    return { classificationResult: result };
  }

  private async semanticAnalysis(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.semanticAgent.analyzePost(rawPost.title, rawPost.body);

    if (result.success) {
      await this.postsRepo.updateSemanticAnalysis(
        rawPost.id,
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
    const { rawPost } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.sentimentAgent.analyzeSentiment(
      rawPost.title,
      rawPost.body
    );

    if (result.success) {
      await this.postsRepo.updateSentiment(
        rawPost.id,
        result.data.sentiment,
        result.data.score
      );
    }
    return { sentimentResult: result };
  }

  private async categoryAssignment(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost, classificationResult } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.categoryAgent.assignCategory(
      rawPost.title,
      rawPost.body,
      classificationResult?.data?.classification!
    );

    if (result.success) {
      await this.postsRepo.updateCategory(rawPost.id, result.data.categoryId);
    }
    return { categoryResult: result };
  }

  private async clusterAssignment(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost, semanticResult, categoryResult } = state;
    if (!rawPost) throw new Error("Raw post not provided");
    
    const result = await this.clusterAgent.assignCluster(
      rawPost.id,
      semanticResult?.data?.embedding ?? [],
      categoryResult?.data?.categoryId!,
      rawPost.title
    );

    if (result.success) {
      await this.postsRepo.updateCluster(rawPost.id, result.data.clusterId);
    }
    return { clusterResult: result };
  }

  private async recordMention(
    state: OrchestrationState
  ): Promise<Partial<OrchestrationState>> {
    const { rawPost, clusterResult, categoryResult, sentimentResult } = state;
    if (!rawPost) throw new Error("Raw post not provided");

    if (
      clusterResult?.success &&
      categoryResult?.success &&
      sentimentResult?.success
    ) {
      await this.mentionsRepo.create(
        rawPost.id,
        clusterResult.data?.clusterId!,
        categoryResult.data?.categoryId!,
        sentimentResult.data?.score
      );
    }
    return {};
  }


}
