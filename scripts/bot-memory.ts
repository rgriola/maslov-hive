/**
 * Bot Memory System
 * Tracks what each bot has posted to avoid repetition.
 * Includes Jaccard-based title similarity detection.
 * Refactored: 2026-02-17 @ title deduplication
 */

import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.join(process.cwd(), '.agent-memory');
const MAX_MEMORY_ITEMS = 50;
const TITLE_SIMILARITY_THRESHOLD = 0.5; // 50% word overlap = too similar
const TITLE_HISTORY_COUNT = 15; // compare against last N titles

/** Common words to ignore when comparing titles */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'it', 'be', 'as', 'do', 'no', 'so', 'up', 'if', 'my',
  'that', 'this', 'with', 'from', 'about', 'what', 'when', 'where',
  'which', 'how', 'who', 'why', 'are', 'was', 'were', 'has', 'have',
  'had', 'not', 'can', 'will', 'our', 'its', 'your', 'their', 'we',
  'they', 'i', 'me', 'us', 'him', 'her', 'all', 'just', 'into',
]);

/**
 * Normalize a title to a set of meaningful words for comparison.
 */
function normalizeTitle(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

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
 * Check if a candidate title is too similar to recent titles.
 * Uses Jaccard similarity on normalized word sets.
 * Returns { similar: true, matchedTitle } if overlap ≥ threshold.
 */
export function isTitleTooSimilar(
  botName: string,
  candidateTitle: string,
  threshold: number = TITLE_SIMILARITY_THRESHOLD
): { similar: boolean; matchedTitle?: string } {
  const recentTitles = getRecentPostTitles(botName, TITLE_HISTORY_COUNT);
  if (recentTitles.length === 0) return { similar: false };

  const candidateWords = normalizeTitle(candidateTitle);
  if (candidateWords.size === 0) return { similar: false };

  for (const pastTitle of recentTitles) {
    const pastWords = normalizeTitle(pastTitle);
    if (pastWords.size === 0) continue;

    // Jaccard similarity = |intersection| / |union|
    let intersection = 0;
    for (const word of candidateWords) {
      if (pastWords.has(word)) intersection++;
    }
    const union = new Set([...candidateWords, ...pastWords]).size;
    const similarity = intersection / union;

    if (similarity >= threshold) {
      return { similar: true, matchedTitle: pastTitle };
    }
  }

  return { similar: false };
}

/**
 * Format memory for prompt injection
 */
export function formatMemoryForPrompt(botName: string): string {
  const recentTitles = getRecentPostTitles(botName, 8);
  const recentTopics = getRecentTopics(botName, 8);

  if (recentTitles.length === 0) {
    return '';
  }

  let prompt = '\n--- YOUR RECENT ACTIVITY (DO NOT REPEAT) ---\n';
  prompt += 'Your recent post titles (you MUST NOT reuse these or similar wording):\n';
  for (const title of recentTitles) {
    prompt += `- "${title}"\n`;
  }

  if (recentTopics.length > 0) {
    prompt += '\nTopics already covered (pick something DIFFERENT):\n';
    const uniqueTopics = [...new Set(recentTopics)];
    for (const topic of uniqueTopics) {
      prompt += `- ${topic}\n`;
    }
  }

  prompt += '\nCRITICAL: Your title and topic MUST be completely different from the above. Do NOT rephrase or reword old titles.\n';

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
