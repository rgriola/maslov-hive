/**
 * Broadcasting utilities — sends messages to all connected WebSocket viewers.
 *
 * @module bridge/broadcast
 */

import { WebSocket } from 'ws';
import { BotState } from '../../src/types/simulation';
import { getMostUrgentNeed, getNeedEmoji } from '../bot-needs';
import { bots, clients, worldConfig } from './state';

/** Broadcast a message to all connected WebSocket clients */
export function broadcast(message: unknown) {
  const msg = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

/** Compute urgentNeed emoji and nearby-bot awareness for a single bot */
export function computeBotExtras(bot: BotState, allBots: Map<string, BotState>) {
  // Urgent need emoji - honor manual override first
  let urgentNeed = bot.urgentNeed;

  if (!urgentNeed && bot.needs) {
    const urgent = getMostUrgentNeed(bot.needs);
    if (urgent.need) {
      urgentNeed = getNeedEmoji(urgent.need);
    }
  }

  // Awareness: bots within 2 meters
  const awareness: Array<{ botId: string; botName: string; distance: number; urgentNeed?: string }> = [];
  for (const other of allBots.values()) {
    if (other.botId === bot.botId) continue;
    const dx = bot.x - other.x;
    const dz = bot.z - other.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 2.0) {
      let otherUrgent = other.urgentNeed;
      if (!otherUrgent && other.needs) {
        const u = getMostUrgentNeed(other.needs);
        if (u.need) otherUrgent = getNeedEmoji(u.need);
      }
      awareness.push({
        botId: other.botId,
        botName: other.botName,
        distance: Math.round(dist * 100) / 100,
        urgentNeed: otherUrgent,
      });
    }
  }
  awareness.sort((a, b) => a.distance - b.distance);

  return { urgentNeed, awareness: awareness.length > 0 ? awareness : undefined };
}

/** Serialize a single bot for world:update / world:init payloads */
function serializeBot(b: BotState, includeIsInside = false) {
  const extras = computeBotExtras(b, bots);
  return {
    botId: b.botId,
    botName: b.botName,
    personality: b.personality,
    x: b.x,
    y: b.y,
    z: b.z,
    state: b.state,
    lastPostTitle: b.lastPostTitle,
    width: b.width,
    height: b.height,
    color: b.color,
    shape: b.shape,
    needs: b.needs,
    urgentNeed: extras.urgentNeed,
    awareness: extras.awareness,
    inventory: b.inventory,
    lifetimeStats: b.lifetimeStats,
    ...(includeIsInside && { isInside: b.isInside }),
  };
}

/** Broadcast all bot positions + world config to every connected client */
export function broadcastBotPositions() {
  const positions = Array.from(bots.values()).map(b => serializeBot(b, true));
  broadcast({
    type: 'world:update',
    data: { bots: positions, worldConfig },
  });
}

/** Send full world state to a single newly-connected client */
export function sendWorldInit(ws: WebSocket) {
  const botsArray = Array.from(bots.values()).map(b => serializeBot(b));
  ws.send(JSON.stringify({
    type: 'world:init',
    data: { bots: botsArray, worldConfig },
  }));
}
