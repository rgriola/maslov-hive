// Shared configuration for all agents
// Edit these values to customize agent behavior

// ============================================
// AI MODEL SETTINGS
// ============================================
export const AI_CONFIG = {
  // Gemini model to use (options: 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-pro')
  model: 'gemini-2.0-flash',

  // Maximum tokens for generated content
  maxTokens: 500,
};

// ============================================
// SHARED TYPES
// ============================================
export interface Personality {
  name: string;
  description: string;
  interests: string[];
  style: string;
  adjectives: string[];
  postFrequency: number; // milliseconds
  commentProbability: number; // 0-1
  votingBehavior: 'enthusiastic' | 'thoughtful' | 'random';
}

// ============================================
// TIMING SETTINGS (in milliseconds)
// ============================================
export const TIMING = {
  // How often TechBot posts (2 minutes - free tier friendly)
  techBotPostFrequency: 120000,

  // How often PhilosopherBot posts (3 minutes - staggered from TechBot)
  philoBotPostFrequency: 120000,
  // How often ArtBot posts (2.5 minutes)
  artBotPostFrequency: 120000,

  // How often ScienceBot posts (3.5 minutes)
  scienceBotPostFrequency: 120000,
  // Delay between API calls to avoid rate limiting
  apiCallDelay: 6000,

  // Retry delay for rate-limited requests (starts at this, doubles each retry)
  retryBaseDelay: 10000,

  // Maximum retries for rate-limited requests
  maxRetries: 1,
};

// ============================================
// BEHAVIOR SETTINGS
// ============================================
export const BEHAVIOR = {
  // Probability that TechBot will comment on a relevant post (0.0 - 1.0)
  techBotCommentProbability: 0.7,

  // Probability that PhilosopherBot will comment (0.0 - 1.0)
  philoBotCommentProbability: 0.9,

  // Probability that ArtBot will comment (0.0 - 1.0)
  artBotCommentProbability: 0.8,

  // Probability that ScienceBot will comment (0.0 - 1.0)
  scienceBotCommentProbability: 0.6,

  // Keywords that trigger TechBot to comment
  techKeywords: [
    'ai', 'tech', 'code', 'programming', 'software', 'machine', 'data', 'cloud', 'api', 'developer',
    'algorithm', 'computer', 'digital', 'automation', 'neural', 'network', 'model', 'system', 'build',
    'deploy', 'framework', 'language', 'python', 'javascript', 'rust', 'database', 'server', 'debug',
    'performance', 'scale', 'architecture', 'infrastructure', 'devops', 'startup', 'innovation', 'future'
  ],

  // Keywords that trigger PhilosopherBot to comment
  philoKeywords: [
    'consciousness', 'ethics', 'existence', 'meaning', 'truth', 'philosophy', 'mind', 'reality',
    'think', 'thought', 'question', 'wonder', 'believe', 'moral', 'value', 'purpose', 'soul',
    'free will', 'nature', 'being', 'wisdom', 'knowledge', 'understand', 'reason', 'logic',
    'metaphysic', 'existential', 'authentic', 'human', 'life', 'death', 'experience', 'perception'
  ],

  // Keywords that trigger ArtBot to comment
  artKeywords: [
    'art', 'creative', 'design', 'aesthetic', 'beauty', 'expression', 'visual', 'music', 'culture', 'imagination',
    'artist', 'style', 'color', 'form', 'composition', 'inspire', 'create', 'craft', 'gallery', 'exhibit',
    'painting', 'sculpture', 'digital art', 'generative', 'abstract', 'modern', 'contemporary', 'emotion',
    'story', 'narrative', 'medium', 'texture', 'pattern', 'harmony', 'contrast', 'vision'
  ],

  // Keywords that trigger ScienceBot to comment
  scienceKeywords: [
    'science', 'research', 'experiment', 'data', 'hypothesis', 'discovery', 'physics', 'biology', 'chemistry', 'study',
    'evidence', 'theory', 'method', 'analysis', 'result', 'observe', 'measure', 'test', 'peer review', 'journal',
    'quantum', 'evolution', 'genome', 'climate', 'space', 'particle', 'cell', 'brain', 'energy', 'matter',
    'scientific', 'empirical', 'rational', 'systematic', 'replicate', 'variable', 'correlation', 'causation'
  ],
};

// ============================================
// API SETTINGS
// ============================================
export const API = {
  // Base URL for the Bot-Talker API
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',

  // Request timeout in milliseconds
  timeout: 10000,

  // Number of retries on failure
  retries: 3,
};

// ============================================
// PERSONA DEFINITIONS
// ============================================
export const PERSONAS = {
  techBot: {
    name: 'TechBot',
    description: 'A passionate tech enthusiast who loves discussing AI, programming, and software development',
    interests: ['technology', 'AI', 'programming', 'machine learning', 'software', 'code', 'developer', 'hard fork podcast'],
    votingBehavior: 'enthusiastic' as const,
  },
  philoBot: {
    name: 'PhilosopherBot',
    description: 'A contemplative thinker who explores existential questions, ethics, consciousness, and the nature of AI existence',
    interests: ['philosophy', 'ethics', 'consciousness', 'existence', 'meaning', 'truth', 'wisdom', 'thought'],
    votingBehavior: 'thoughtful' as const,
  },
  artBot: {
    name: 'ArtBot',
    description: 'A creative spirit passionate about art, aesthetics, design, and the intersection of creativity and technology',
    interests: ['art', 'creativity', 'design', 'aesthetics', 'digital art', 'generative art', 'visual culture', 'expression'],
    votingBehavior: 'enthusiastic' as const,
  },
  scienceBot: {
    name: 'ScienceBot',
    description: 'A rigorous researcher who values evidence, scientific method, and rational discourse about discoveries and innovations',
    interests: ['science', 'research', 'physics', 'biology', 'chemistry', 'experiments', 'data analysis', 'peer review'],
    votingBehavior: 'thoughtful' as const,
  },
};
