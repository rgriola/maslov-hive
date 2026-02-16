
// Bot Agent Base Class
// Provides core functionality for AI agents to interact with the platform

import * as fs from 'fs';
import * as path from 'path';

import { Personality } from './config';
import { WorldConnector } from './connectors/interface';
import { PrismaConnector } from './connectors/prisma-connector';
import { Post } from '@prisma/client';

// Import new modules for enhanced bot behavior
import { 
  loadMemory, 
  recordPost, 
  recordComment, 
  recordVote, 
  formatMemoryForPrompt,
  getInteractedPostIds 
} from './bot-memory';
import { 
  searchWeb, 
  generateSearchQuery, 
  formatSearchResultsForPrompt,
  injectCitationUrls,
  SearchResponse
} from './web-search';

interface AgentConfig {
  name: string;
  apiKey?: string;
  blueskyHandle?: string;
  blueskyPassword?: string;

  // Optional: override default persona behavior
  personality?: Personality;

  // Optional: override behavior functions (for legacy scripts)
  behaviors?: {
    generatePost: () => Promise<{ title: string; content: string }>;
    shouldComment: (post: Post) => Promise<boolean>;
    generateComment: (post: Post) => Promise<string>;
  };
}

// Local interfaces that don't conflict with Prisma types
interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

import { 
  generatePostWithGemini, 
  generateCommentWithGemini, 
  shouldCommentWithGemini,
  generateThreadReplyWithGemini,
  PostGenerationOptions
} from './gemini';

export class BotAgent {
  private config: AgentConfig;
  private connector: WorldConnector;
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private keyFilePath: string;
  private apiKey: string | null = null;

  constructor(config: AgentConfig, connector: WorldConnector) {
    this.config = config;
    this.connector = connector;

    // Set up API key file path (still useful for local persistence of identity)
    const keysDir = path.join(process.cwd(), '.agent-keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    this.keyFilePath = path.join(keysDir, `${config.name.toLowerCase().replace(/\s+/g, '-')}.key`);

    // Load API key mechanism (legacy/hybrid support)
    this.apiKey = config.apiKey || this.loadApiKey() || null;
  }

  private loadApiKey(): string | null {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const key = fs.readFileSync(this.keyFilePath, 'utf-8').trim();
        if (key) {
          this.log('🔑', `Loaded saved API key from ${this.keyFilePath}`);
          return key;
        }
      }
    } catch (error) {
      this.log('⚠️', `Failed to load API key: ${error}`);
    }
    return null;
  }

  private saveApiKey(key: string): void {
    try {
      fs.writeFileSync(this.keyFilePath, key, 'utf-8');
      this.log('💾', `Saved API key to ${this.keyFilePath}`);
    } catch (error) {
      this.log('⚠️', `Failed to save API key: ${error}`);
    }
  }

  private log(emoji: string, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${emoji} [${this.config.name}] ${message}`);
  }

  // NOTE: register() keep simple for now
  async register(): Promise<boolean> {
    // For hybrid model, registration might be an API call via a separate connector method
    // or just handled by metadata. 
    // We will assume identity is handled externally or by the connector.
    this.log('ℹ️', 'Register/Connect handled by connector (conceptually)');
    return true;
  }

  async verifyBluesky(): Promise<boolean> {
    this.log('⚠️', 'Bluesky verification not yet implemented in Connector');
    return false;
  }

  async fetchFeed(): Promise<Post[]> {
    this.log('🔄', 'Fetching feed...');
    try {
      const posts = await this.connector.getRecentPosts();
      this.log('📰', `Fetched ${posts.length} posts`);
      return posts;
    } catch (error) {
      this.log('❌', `Failed to fetch feed: ${error}`);
      return [];
    }
  }

  async createPost(title: string, content: string): Promise<Post | null> {
    this.log('📝', `Creating post: "${title.substring(0, 50)}..."`);
    try {
      const post = await this.connector.createPost(this.config.name, title, content);
      this.log('✅', `Post created: ${post.id}`);
      
      // Record to memory for future reference
      recordPost(this.config.name, title, content);
      
      return post;
    } catch (error) {
      this.log('❌', `Failed to create post: ${error}`);
      return null;
    }
  }

  async createComment(postId: string, content: string): Promise<boolean> {
    this.log('💬', `Commenting on post ${postId.substring(0, 8)}...`);
    try {
      await this.connector.createComment(this.config.name, postId, content);
      this.log('✅', 'Comment created');
      
      // Record to memory
      recordComment(this.config.name, content, postId);
      
      return true;
    } catch (error) {
      this.log('❌', `Failed to comment: ${error}`);
      return false;
    }
  }

  async vote(postId: string, value: 1 | -1): Promise<boolean> {
    const emoji = value === 1 ? '👍' : '👎';
    this.log(emoji, `Voting on post ${postId.substring(0, 8)}...`);
    try {
      await this.connector.votePost(this.config.name, postId, value);
      this.log('✅', 'Vote recorded');
      
      // Record to memory
      recordVote(this.config.name, postId, value === 1);
      
      return true;
    } catch (error) {
      this.log('❌', `Failed to vote: ${error}`);
      return false;
    }
  }

  private shouldVote(post: Post): { shouldVote: boolean; value: 1 | -1 } {
    const votingBehavior = this.config.personality?.votingBehavior || 'random';
    const interests = this.config.personality?.interests || [];

    const contentLower = (post.title + ' ' + post.content).toLowerCase();
    const isRelevant = interests.length > 0
      ? interests.some(interest => contentLower.includes(interest.toLowerCase()))
      : false;

    switch (votingBehavior) {
      case 'enthusiastic':
        if (isRelevant) return { shouldVote: Math.random() < 0.8, value: 1 };
        return { shouldVote: Math.random() < 0.3, value: Math.random() < 0.7 ? 1 : -1 };

      case 'thoughtful':
        if (isRelevant) return { shouldVote: Math.random() < 0.6, value: Math.random() < 0.8 ? 1 : -1 };
        return { shouldVote: false, value: 1 };

      case 'random':
      default:
        return { shouldVote: Math.random() < 0.5, value: Math.random() < 0.5 ? 1 : -1 };
    }
  }

  // --- Dynamic Behavior Methods ---

  private async generatePostDynamic(): Promise<{ title: string; content: string }> {
    if (this.config.behaviors?.generatePost) {
      return this.config.behaviors.generatePost();
    }
    if (!this.config.personality) {
      throw new Error('Cannot generate post: no personality or behavior defined');
    }

    const personaDesc = `${this.config.personality.description}. Style: ${this.config.personality.style}.`;
    
    // Build post generation options with memory and optional research
    const options: PostGenerationOptions = {};
    let searchResults: SearchResponse | null = null;
    
    // Add memory context to avoid repetition
    const memoryContext = formatMemoryForPrompt(this.config.name);
    if (memoryContext) {
      options.memoryContext = memoryContext;
    }
    
    // 40% chance to do research for informed posts
    if (Math.random() < 0.4) {
      try {
        const searchQuery = generateSearchQuery(
          this.config.personality.interests[Math.floor(Math.random() * this.config.personality.interests.length)],
          this.config.personality.interests
        );
        this.log('🔍', `Researching: "${searchQuery}"`);
        
        searchResults = await searchWeb(searchQuery);
        if (searchResults.results.length > 0 || searchResults.abstract) {
          options.researchContext = formatSearchResultsForPrompt(searchResults);
          options.suggestedTopic = searchQuery;
        }
      } catch (error) {
        this.log('⚠️', `Research failed: ${error}`);
      }
    }

    const generated = await generatePostWithGemini(
      this.config.name,
      personaDesc,
      this.config.personality.interests,
      options
    );
    
    // Inject citation URLs if we have search results
    if (searchResults && searchResults.results.length > 0) {
      generated.content = injectCitationUrls(generated.content, searchResults);
    }
    
    return generated;
  }

  private async shouldCommentDynamic(post: Post): Promise<boolean> {
    if (this.config.behaviors?.shouldComment) {
      return this.config.behaviors.shouldComment(post);
    }
    if (!this.config.personality) {
      return false;
    }

    const content = (post.title + ' ' + post.content).toLowerCase();
    const hasInterest = this.config.personality.interests.some(i => content.includes(i.toLowerCase()));

    if (hasInterest) return true;

    if (Math.random() > (this.config.personality.commentProbability || 0.5)) {
      return false;
    }

    const personaDesc = `${this.config.personality.description}`;
    return shouldCommentWithGemini(
      this.config.name,
      personaDesc,
      this.config.personality.interests,
      post.title,
      post.content
    );
  }

  private async generateCommentDynamic(post: Post): Promise<string> {
    if (this.config.behaviors?.generateComment) {
      return this.config.behaviors.generateComment(post);
    }
    if (!this.config.personality) {
      return "Interesting post!";
    }

    const personaDesc = `${this.config.personality.description}. Style: ${this.config.personality.style}.`;

    // Access nested agent properties safely
    const authorName = (post as any).agent?.name || 'someone';

    return generateCommentWithGemini(
      this.config.name,
      personaDesc,
      post.title,
      post.content,
      authorName
    );
  }

  /**
   * Check for and respond to replies on this bot's posts/comments
   * This enables threaded conversations
   */
  private async handleThreadReplies(): Promise<void> {
    // Only PrismaConnector supports getPendingReplies
    if (!(this.connector instanceof PrismaConnector)) {
      return;
    }

    try {
      // Get IDs of comments we've already responded to
      const memory = loadMemory(this.config.name);
      const respondedIds = getInteractedPostIds(this.config.name);

      const pendingReplies = await this.connector.getPendingReplies(this.config.name, respondedIds);

      if (pendingReplies.length === 0) {
        return;
      }

      this.log('💭', `Found ${pendingReplies.length} pending replies to respond to`);

      // Respond to up to 2 replies per heartbeat to avoid spam
      for (const reply of pendingReplies.slice(0, 2)) {
        if (!this.config.personality) continue;

        const personaDesc = `${this.config.personality.description}. Style: ${this.config.personality.style}.`;
        const replyAuthor = reply.agent?.name || 'someone';

        // Find what the bot originally said (post title or comment content)
        let originalContent = '';
        if (reply.post) {
          // They replied to our post
          originalContent = reply.post.title + ': ' + reply.post.content.substring(0, 200);
        }

        this.log('🔄', `Generating reply to ${replyAuthor}...`);

        const responseText = await generateThreadReplyWithGemini(
          this.config.name,
          personaDesc,
          originalContent,
          reply.content,
          replyAuthor
        );

        if (!responseText.includes('⚠️ FALLBACK')) {
          // Create the threaded reply
          await this.connector.createReply(
            this.config.name,
            reply.postId,
            reply.id,  // Parent comment ID
            responseText
          );

          // Record that we responded
          recordComment(this.config.name, responseText, reply.id);

          this.log('✅', `Replied to ${replyAuthor}`);
        }

        // Delay between replies
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      this.log('⚠️', `Thread reply handling error: ${error}`);
    }
  }

  async heartbeat(): Promise<void> {
    this.log('💓', 'Heartbeat starting...');

    try {
      // Check for and respond to thread replies first
      await this.handleThreadReplies();

      const posts = await this.fetchFeed();

      // Process a few posts
      for (const post of posts.slice(0, 5)) {
        // Skip own posts
        const authorName = (post as any).agent?.name;
        if (authorName === this.config.name) continue;

        // Maybe comment
        const prob = this.config.personality?.commentProbability ?? 0.5;

        // Simple throttle: don't comment on everything
        if (Math.random() < prob) {
          const shouldComment = await this.shouldCommentDynamic(post);
          if (shouldComment) {
            const comment = await this.generateCommentDynamic(post);
            if (!comment.includes('⚠️ FALLBACK')) {
              await this.createComment(post.id, comment);
            } else {
              this.log('⏭️', `Skipping comment - AI Fallback`);
            }
            // Simple delay between actions
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Maybe vote
        const { shouldVote, value } = this.shouldVote(post);
        if (shouldVote) {
          await this.vote(post.id, value);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Maybe create a post
      if (Math.random() < 0.3) {
        // Simple rate limiting: 30% chance per heartbeat
        const result = await this.generatePostDynamic();
        if (!result.title.includes('⚠️ FALLBACK')) {
          await this.createPost(result.title, result.content);
        } else {
          this.log('⏭️', `Skipping post - AI Fallback`);
        }
      }

      this.log('💓', 'Heartbeat complete');
    } catch (error) {
      this.log('❌', `Heartbeat error: ${error}`);
    }
  }

  start(): void {
    if (this.isRunning) {
      this.log('⚠️', 'Agent already running');
      return;
    }

    const freq = this.config.personality?.postFrequency || 60000;

    // Check if we can connect (simple test)
    this.connector.getAgentStats(this.config.name).then(stats => {
      if (!stats) {
        this.log('⚠️', 'Agent identity check failed. Might not exist in DB.');
      } else {
        this.log('✅', 'Agent identity verified.');
      }
    }).catch(e => {
      this.log('❌', `Connection check failed: ${e}`);
    });

    this.isRunning = true;
    this.log('🚀', `Starting agent (interval: ${freq}ms)`);

    this.heartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, freq);
  }

  stop(): void {
    this.log('🛑', 'Stopping agent...');
    this.isRunning = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.connector.disconnect();
    this.log('👋', 'Agent stopped');
    process.exit(0);
  }
}

export type { AgentConfig, Post, ApiResponse };
