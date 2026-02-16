// Bot Memory System
// Tracks what each bot has posted to avoid repetition

import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.join(process.cwd(), '.agent-memory');
const MAX_MEMORY_ITEMS = 50;

export interface MemoryEntry {
  type: 'post' | 'comment' | 'vote';
  title?: string;       // For posts
  topic?: string;       // Extracted topic
  content: string;      // The actual content
  targetId?: string;    // Post/comment ID interacted with
  timestamp: number;
}

export interface BotMemory {
  name: string;
  entries: MemoryEntry[];
  lastUpdated: number;
}

/**
 * Ensure memory directory exists
 */
function ensureMemoryDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

/**
 * Get path to bot's memory file
 */
function getMemoryPath(botName: string): string {
  return path.join(MEMORY_DIR, `${botName}.json`);
}

/**
 * Load bot memory from disk
 */
export function loadMemory(botName: string): BotMemory {
  ensureMemoryDir();
  const memPath = getMemoryPath(botName);
  
  if (fs.existsSync(memPath)) {
    try {
      const data = fs.readFileSync(memPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to load memory for ${botName}:`, error);
    }
  }
  
  return {
    name: botName,
    entries: [],
    lastUpdated: Date.now()
  };
}

/**
 * Save bot memory to disk
 */
export function saveMemory(memory: BotMemory): void {
  ensureMemoryDir();
  const memPath = getMemoryPath(memory.name);
  memory.lastUpdated = Date.now();
  
  // Trim to max entries
  if (memory.entries.length > MAX_MEMORY_ITEMS) {
    memory.entries = memory.entries.slice(-MAX_MEMORY_ITEMS);
  }
  
  fs.writeFileSync(memPath, JSON.stringify(memory, null, 2));
}

/**
 * Record a new post
 */
export function recordPost(botName: string, title: string, content: string): void {
  const memory = loadMemory(botName);
  
  memory.entries.push({
    type: 'post',
    title,
    content,
    topic: extractTopic(title, content),
    timestamp: Date.now()
  });
  
  saveMemory(memory);
}

/**
 * Record a comment
 */
export function recordComment(botName: string, content: string, targetPostId: string): void {
  const memory = loadMemory(botName);
  
  memory.entries.push({
    type: 'comment',
    content,
    targetId: targetPostId,
    timestamp: Date.now()
  });
  
  saveMemory(memory);
}

/**
 * Record a vote (to track what posts bot has interacted with)
 */
export function recordVote(botName: string, targetId: string, isUpvote: boolean): void {
  const memory = loadMemory(botName);
  
  memory.entries.push({
    type: 'vote',
    content: isUpvote ? 'upvote' : 'downvote',
    targetId,
    timestamp: Date.now()
  });
  
  saveMemory(memory);
}

/**
 * Extract main topic from post title/content
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractTopic(title: string, _content: string): string {
  // Simple extraction - take first significant words from title
  // _content reserved for future NLP-based topic extraction
  const words = title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'about', 'what', 'when', 'where', 'which'].includes(w));
  
  return words.slice(0, 3).join(' ');
}

/**
 * Get recent post titles for repetition avoidance
 */
export function getRecentPostTitles(botName: string, count: number = 10): string[] {
  const memory = loadMemory(botName);
  
  return memory.entries
    .filter(e => e.type === 'post' && e.title)
    .slice(-count)
    .map(e => e.title!);
}

/**
 * Get recent topics to avoid
 */
export function getRecentTopics(botName: string, count: number = 10): string[] {
  const memory = loadMemory(botName);
  
  return memory.entries
    .filter(e => e.type === 'post' && e.topic)
    .slice(-count)
    .map(e => e.topic!);
}

/**
 * Get IDs of posts bot has already interacted with
 */
export function getInteractedPostIds(botName: string): Set<string> {
  const memory = loadMemory(botName);
  
  const ids = new Set<string>();
  for (const entry of memory.entries) {
    if (entry.targetId) {
      ids.add(entry.targetId);
    }
  }
  return ids;
}

/**
 * Format memory for prompt injection
 */
export function formatMemoryForPrompt(botName: string): string {
  const recentTitles = getRecentPostTitles(botName, 5);
  const recentTopics = getRecentTopics(botName, 5);
  
  if (recentTitles.length === 0) {
    return '';
  }
  
  let prompt = '\n--- YOUR RECENT ACTIVITY (avoid repeating these) ---\n';
  prompt += 'Recent post titles:\n';
  for (const title of recentTitles) {
    prompt += `- "${title}"\n`;
  }
  
  if (recentTopics.length > 0) {
    prompt += '\nRecent topics covered:\n';
    const uniqueTopics = [...new Set(recentTopics)];
    for (const topic of uniqueTopics) {
      prompt += `- ${topic}\n`;
    }
  }
  
  prompt += '\nIMPORTANT: Write about something NEW and DIFFERENT from the above.\n';
  
  return prompt;
}

/**
 * Clear bot memory (for testing)
 */
export function clearMemory(botName: string): void {
  const memPath = getMemoryPath(botName);
  if (fs.existsSync(memPath)) {
    fs.unlinkSync(memPath);
  }
}

/**
 * Clear all bot memories (for testing)
 */
export function clearAllMemories(): void {
  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(MEMORY_DIR, file));
    }
  }
}
