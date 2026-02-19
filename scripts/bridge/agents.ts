/**
 * AI Agent Heartbeats — schedules and runs Gemini-powered content generation.
 *
 * @module bridge/agents
 */

import { BotAgent } from '../bot-agent-base';
import { Personality } from '../config';
import { bots, agentInstances, agentLastHeartbeat } from './state';

/** Start the AI agent heartbeats (posts, comments, votes via Gemini) */
export function startAgentHeartbeats() {
  console.log('');
  console.log('💓 Starting AI agent heartbeats...');

  // Set up per-agent schedule with staggered starts
  for (const [agentId, botAgent] of agentInstances) {
    const bot = bots.get(agentId);
    if (!bot) continue;

    const personality = (botAgent as unknown as { config?: { personality?: Personality } }).config?.personality;
    const interval = personality?.postFrequency || 60000;

    agentLastHeartbeat.set(agentId, Date.now() + Math.random() * 10000);
    console.log(`   💓 ${bot.botName}: Heartbeat every ~${Math.round(interval / 1000)}s`);
  }

  // Single interval to check all agents
  setInterval(() => {
    const now = Date.now();

    for (const [agentId, botAgent] of agentInstances) {
      const lastTime = agentLastHeartbeat.get(agentId) || 0;
      const personality = (botAgent as unknown as { config?: { personality?: Personality } }).config?.personality;
      const interval = personality?.postFrequency || 60000;

      // Add jitter (±10s) to prevent synchronization
      const jitter = (Math.random() - 0.5) * 20000;
      const effectiveInterval = interval + jitter;

      if (now - lastTime > effectiveInterval) {
        agentLastHeartbeat.set(agentId, now);

        runAgentHeartbeat(agentId, botAgent).catch((err) => {
          const bot = bots.get(agentId);
          console.error(`❌ [${bot?.botName || agentId}] Heartbeat error:`, err);
        });
      }
    }
  }, 5000);
}

/** Run a single agent's heartbeat (async) */
async function runAgentHeartbeat(agentId: string, botAgent: BotAgent) {
  const bot = bots.get(agentId);
  if (!bot) return;

  console.log(`💓 [${bot.botName}] AI heartbeat starting...`);

  try {
    await botAgent.heartbeat();
    console.log(`💓 [${bot.botName}] AI heartbeat complete`);
  } catch (error) {
    console.error(`❌ [${bot.botName}] AI heartbeat failed:`, error);
  }
}
