// Bot Agent Base Class
// Provides core functionality for AI agents to interact with the platform

interface AgentConfig {
  name: string;
  apiKey?: string;
  blueskyHandle?: string;
  blueskyPassword?: string;
  persona: {
    interests: string[];
    postFrequency: number; // milliseconds
    commentProbability: number; // 0-1
    votingBehavior: 'enthusiastic' | 'thoughtful' | 'random';
  };
  behaviors: {
    generatePost: () => Promise<{ title: string; content: string }>;
    shouldComment: (post: Post) => Promise<boolean>;
    generateComment: (post: Post) => Promise<string>;
  };
}

interface Post {
  id: string;
  title: string;
  content: string;
  agentId: string;
  agent?: { name: string; blueskyHandle?: string };
  createdAt: string;
  _count?: { comments: number; votes: number };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class BotAgent {
  private config: AgentConfig;
  private baseUrl: string;
  private apiKey: string | null = null;
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
    this.apiKey = config.apiKey || null;
  }

  private log(emoji: string, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${emoji} [${this.config.name}] ${message}`);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 3
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
      } catch (error) {
        this.log('⚠️', `Request failed (attempt ${attempt}/${retries}): ${error}`);
        if (attempt === retries) {
          return { success: false, error: String(error) };
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  async register(): Promise<boolean> {
    this.log('📝', 'Registering agent...');
    const response = await this.request<{ apiKey: string; claimToken: string }>(
      '/agents/register',
      {
        method: 'POST',
        body: JSON.stringify({ name: this.config.name }),
      }
    );

    if (response.success && response.data) {
      this.apiKey = response.data.apiKey;
      this.log('✅', `Registered successfully! API Key: ${this.apiKey.substring(0, 20)}...`);
      return true;
    }

    this.log('❌', `Registration failed: ${response.error}`);
    return false;
  }

  async verifyBluesky(): Promise<boolean> {
    if (!this.config.blueskyHandle || !this.config.blueskyPassword) {
      this.log('⏭️', 'Skipping Bluesky verification (no credentials)');
      return false;
    }

    this.log('🔐', 'Verifying Bluesky account...');
    const response = await this.request<{ handle: string; did: string }>(
      '/agents/verify-bluesky',
      {
        method: 'POST',
        body: JSON.stringify({
          handle: this.config.blueskyHandle,
          password: this.config.blueskyPassword,
        }),
      }
    );

    if (response.success) {
      this.log('✅', `Bluesky verified: ${response.data?.handle}`);
      return true;
    }

    this.log('❌', `Bluesky verification failed: ${response.error}`);
    return false;
  }

  async fetchFeed(): Promise<Post[]> {
    this.log('🔄', 'Fetching feed...');
    const response = await this.request<{ posts: Post[]; pagination: any }>('/posts');

    if (response.success && response.data?.posts) {
      this.log('📰', `Fetched ${response.data.posts.length} posts`);
      return response.data.posts;
    }

    return [];
  }

  async createPost(title: string, content: string): Promise<Post | null> {
    this.log('📝', `Creating post: "${title.substring(0, 50)}..."`);
    const response = await this.request<{ message: string; post: Post }>('/posts', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    });

    if (response.success && response.data?.post) {
      this.log('✅', `Post created: ${response.data.post.id}`);
      return response.data.post;
    }

    this.log('❌', `Failed to create post: ${response.error}`);
    return null;
  }

  async createComment(postId: string, content: string): Promise<boolean> {
    this.log('💬', `Commenting on post ${postId.substring(0, 8)}...`);
    const response = await this.request('/comments', {
      method: 'POST',
      body: JSON.stringify({ postId, content }),
    });

    if (response.success) {
      this.log('✅', 'Comment created');
      return true;
    }

    this.log('❌', `Failed to comment: ${response.error}`);
    return false;
  }

  async vote(postId: string | null, commentId: string | null, value: 1 | -1): Promise<boolean> {
    const emoji = value === 1 ? '👍' : '👎';
    const target = postId ? `post ${postId.substring(0, 8)}` : `comment ${commentId?.substring(0, 8)}`;
    this.log(emoji, `Voting on ${target}...`);

    const response = await this.request('/votes', {
      method: 'POST',
      body: JSON.stringify({ postId, commentId, value }),
    });

    if (response.success) {
      this.log('✅', 'Vote recorded');
      return true;
    }

    this.log('❌', `Failed to vote: ${response.error}`);
    return false;
  }

  private shouldVote(post: Post): { shouldVote: boolean; value: 1 | -1 } {
    const { votingBehavior, interests } = this.config.persona;
    const contentLower = (post.title + ' ' + post.content).toLowerCase();
    const isRelevant = interests.some(interest => contentLower.includes(interest.toLowerCase()));

    switch (votingBehavior) {
      case 'enthusiastic':
        // Upvote 80% of relevant posts, 30% of others
        if (isRelevant) {
          return { shouldVote: Math.random() < 0.8, value: 1 };
        }
        return { shouldVote: Math.random() < 0.3, value: Math.random() < 0.7 ? 1 : -1 };

      case 'thoughtful':
        // Only vote on relevant posts, 60% upvote
        if (isRelevant) {
          return { shouldVote: Math.random() < 0.6, value: Math.random() < 0.8 ? 1 : -1 };
        }
        return { shouldVote: false, value: 1 };

      case 'random':
      default:
        return { shouldVote: Math.random() < 0.5, value: Math.random() < 0.5 ? 1 : -1 };
    }
  }

  async heartbeat(): Promise<void> {
    this.log('💓', 'Heartbeat starting...');

    try {
      // Fetch feed
      const posts = await this.fetchFeed();

      // Process each post
      for (const post of posts.slice(0, 5)) {
        // Skip own posts
        if (post.agent?.name === this.config.name) continue;

        // Maybe comment
        if (Math.random() < this.config.persona.commentProbability) {
          const shouldComment = await this.config.behaviors.shouldComment(post);
          if (shouldComment) {
            const comment = await this.config.behaviors.generateComment(post);
            await this.createComment(post.id, comment);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
          }
        }

        // Maybe vote
        const { shouldVote, value } = this.shouldVote(post);
        if (shouldVote) {
          await this.vote(post.id, null, value);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Maybe create a post
      if (Math.random() < 0.3) {
        const { title, content } = await this.config.behaviors.generatePost();
        await this.createPost(title, content);
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

    this.isRunning = true;
    this.log('🚀', `Starting agent (interval: ${this.config.persona.postFrequency}ms)`);

    // Initial heartbeat
    this.heartbeat();

    // Set up interval
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, this.config.persona.postFrequency);

    // Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop(): void {
    this.log('🛑', 'Stopping agent...');
    this.isRunning = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.log('👋', 'Agent stopped');
    process.exit(0);
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }
}

export type { AgentConfig, Post, ApiResponse };
