// Web Search Module for Bot Agents
// Provides web search capabilities to make bots more informed

// Load env vars (entry point scripts already load, but this is a safety fallback)
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;        // News outlet name (e.g., "NYT", "CNN", "BBC")
  publishDate?: string;  // ISO date string for citation
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  abstract?: string; // Summary if available
}

/**
 * Parse Google News RSS XML and extract articles
 */
function parseGoogleNewsRSS(xml: string): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Simple regex-based XML parsing (no external dependency)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const linkRegex = /<link>(.*?)<\/link>/;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
  const sourceRegex = /<source[^>]*>(.*?)<\/source>/;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    
    const titleMatch = item.match(titleRegex);
    const linkMatch = item.match(linkRegex);
    const pubDateMatch = item.match(pubDateRegex);
    const sourceMatch = item.match(sourceRegex);
    
    if (titleMatch && linkMatch) {
      const fullTitle = titleMatch[1] || titleMatch[2] || '';
      // Google News titles often include " - Source" at the end
      const titleParts = fullTitle.split(' - ');
      const title = titleParts.slice(0, -1).join(' - ') || fullTitle;
      const sourceFromTitle = titleParts[titleParts.length - 1];
      
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();
      const source = sourceMatch ? sourceMatch[1] : sourceFromTitle || 'Google News';
      
      results.push({
        title: title.substring(0, 200),
        url: linkMatch[1],
        snippet: title, // RSS doesn't provide snippets, use title
        source: source,
        publishDate: pubDate.toISOString()
      });
    }
    
    if (results.length >= 5) break;
  }
  
  return results;
}

/**
 * Search Google News RSS (free, no API key needed, current news)
 */
async function searchGoogleNews(query: string): Promise<SearchResponse> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BotTalker/1.0)'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Google News RSS error: ${response.status}`);
    }
    
    const xml = await response.text();
    const results = parseGoogleNewsRSS(xml);
    
    console.log(`[Search] Google News returned ${results.length} results for "${query}"`);
    
    return { query, results };
  } catch (error) {
    console.error('Google News RSS failed:', error);
    return { query, results: [] };
  }
}

/**
 * Search using DuckDuckGo Instant Answer API (free, no API key needed)
 * Good for quick facts and definitions, limited for news
 */
async function searchDuckDuckGo(query: string): Promise<SearchResponse> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
    );
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.status}`);
    }
    
    const data = await response.json();
    const results: SearchResult[] = [];
    
    // Extract abstract (main answer)
    const abstract = data.Abstract || data.AbstractText || '';
    
    // Extract related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'DuckDuckGo'
          });
        }
        // Handle nested topics
        if (topic.Topics) {
          for (const subtopic of topic.Topics.slice(0, 2)) {
            if (subtopic.Text && subtopic.FirstURL) {
              results.push({
                title: subtopic.Text.split(' - ')[0] || subtopic.Text.substring(0, 50),
                url: subtopic.FirstURL,
                snippet: subtopic.Text,
                source: 'DuckDuckGo'
              });
            }
          }
        }
      }
    }
    
    return { query, results: results.slice(0, 5), abstract };
  } catch (error) {
    console.error('DuckDuckGo search failed:', error);
    return { query, results: [], abstract: '' };
  }
}

/**
 * Search using Tavily API (better for AI agents, requires API key)
 * Sign up at https://tavily.com for free tier (1000 searches/month)
 */
async function searchTavily(query: string): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    console.warn('TAVILY_API_KEY not set, falling back to DuckDuckGo');
    return searchDuckDuckGo(query);
  }
  
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5
      })
    });
    
    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }
    
    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: SearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      source: 'Tavily'
    }));
    
    return {
      query,
      results,
      abstract: data.answer || ''
    };
  } catch (error) {
    console.error('Tavily search failed, falling back to DuckDuckGo:', error);
    return searchDuckDuckGo(query);
  }
}

/**
 * Main search function - uses Google News for current events
 */
export async function searchWeb(query: string): Promise<SearchResponse> {
  // Try Google News first for current events
  const newsResults = await searchGoogleNews(query);
  if (newsResults.results.length > 0) {
    return newsResults;
  }
  
  // Fall back to Tavily if available, then DuckDuckGo
  if (process.env.TAVILY_API_KEY) {
    return searchTavily(query);
  }
  return searchDuckDuckGo(query);
}

/**
 * Search specifically for news (always uses Google News RSS)
 */
export async function searchNews(query: string): Promise<SearchResponse> {
  return searchGoogleNews(query);
}

/**
 * Generate a search query from a topic and interests
 */
export function generateSearchQuery(topic: string, interests: string[]): string {
  // Pick a random interest to combine with topic for variety
  const interest = interests[Math.floor(Math.random() * interests.length)];
  
  const queryTemplates = [
    `${topic} latest news 2026`,
    `${topic} ${interest} developments`,
    `${interest} trends ${new Date().getFullYear()}`,
    `${topic} research findings`,
    `${interest} innovations recent`,
  ];
  
  return queryTemplates[Math.floor(Math.random() * queryTemplates.length)];
}

/**
 * Format a date for citation (MM-DD-YYYY)
 */
function formatCitationDate(isoDate?: string): string {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}-${day}-${year}`;
  } catch {
    return '';
  }
}

/**
 * Format search results for inclusion in a prompt
 * Includes citation format with URL for clickable links
 */
export function formatSearchResultsForPrompt(response: SearchResponse): string {
  if (!response.results.length && !response.abstract) {
    return 'No search results found.';
  }
  
  let formatted = '';
  
  if (response.abstract) {
    formatted += `Summary: ${response.abstract}\n\n`;
  }
  
  if (response.results.length > 0) {
    formatted += 'NEWS SOURCES (cite these when using this info):\n\n';
    
    for (const result of response.results) {
      const citation = result.publishDate 
        ? `${result.source}, ${formatCitationDate(result.publishDate)}`
        : result.source;
      // Provide a ready-to-copy citation format
      formatted += `SOURCE: ${result.title}\n`;
      formatted += `CITE AS: ***${citation}***\n`;
      formatted += `URL: ${result.url}\n\n`;
    }
    
    formatted += 'HOW TO CITE:\n';
    formatted += '- Wrap source and date in triple asterisks: ***CNN, 02-15-2026***\n';
    formatted += '- Example sentence: "Recent studies ***WIRED, 02-15-2026*** show progress."\n';
    formatted += '- Just use ***Source, Date*** - no need for [link] syntax\n';
  }
  
  return formatted;
}

/**
 * Inject URLs into citations after AI generates content
 * Finds ***Source, Date*** patterns and adds [source](URL) after them
 */
export function injectCitationUrls(content: string, searchResults: SearchResponse): string {
  if (!searchResults.results.length) return content;
  
  // Build a map of source names to URLs (case-insensitive)
  const sourceUrlMap = new Map<string, string>();
  for (const result of searchResults.results) {
    // Store multiple variations of the source name
    sourceUrlMap.set(result.source.toLowerCase(), result.url);
    // Also store without common suffixes
    const simplified = result.source.toLowerCase()
      .replace(/\s+(news|times|post|journal|report|magazine|daily|weekly)$/i, '');
    sourceUrlMap.set(simplified, result.url);
  }
  
  // Find ***Source, Date*** patterns and inject URLs
  const citationPattern = /\*{3}([^*]+),\s*(\d{1,2}-\d{1,2}-\d{4})\*{3}/g;
  
  return content.replace(citationPattern, (match, source) => {
    const sourceLower = source.trim().toLowerCase();
    
    // Try to find a matching URL
    let url = sourceUrlMap.get(sourceLower);
    
    // If no exact match, try partial matching
    if (!url) {
      for (const [key, value] of sourceUrlMap.entries()) {
        if (sourceLower.includes(key) || key.includes(sourceLower)) {
          url = value;
          break;
        }
      }
    }
    
    if (url) {
      return `${match} [source](${url})`;
    }
    return match;
  });
}
