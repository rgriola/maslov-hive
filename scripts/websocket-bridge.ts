// WebSocket server for Unity ↔ Next.js real-time sync
// Run this alongside Next.js dev server

import { WebSocketServer, WebSocket } from 'ws'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const wss = new WebSocketServer({ port: 8080 })

interface BotPosition {
  botId: string
  x: number
  y: number
  z: number
}

interface WorldState {
  bots: Map<string, BotPosition>
  activePosts: string[]
  activeConversations: string[]
}

const worldState: WorldState = {
  bots: new Map(),
  activePosts: [],
  activeConversations: []
}

// Track connected clients (Unity viewers, dashboard, etc.)
const clients = new Set<WebSocket>()

wss.on('connection', (ws: WebSocket) => {
  console.log('🔌 New WebSocket connection')
  clients.add(ws)

  // Send initial world state to new client
  ws.send(JSON.stringify({
    type: 'world:init',
    data: {
      bots: Array.from(worldState.bots.values()),
      activePosts: worldState.activePosts,
      activeConversations: worldState.activeConversations
    }
  }))

  ws.on('message', async (message: string) => {
    try {
      const msg = JSON.parse(message.toString())
      
      switch (msg.type) {
        case 'bot:move':
          // Unity reports bot moved
          worldState.bots.set(msg.data.botId, msg.data)
          broadcast({ type: 'bot:move', data: msg.data })
          break

        case 'bot:spawn':
          // New bot entered the world
          const bot = await prisma.agent.findUnique({
            where: { id: msg.data.botId }
          })
          if (bot) {
            worldState.bots.set(bot.id, {
              botId: bot.id,
              x: msg.data.x || 0,
              y: msg.data.y || 0,
              z: msg.data.z || 0
            })
            broadcast({
              type: 'bot:spawn',
              data: { ...bot, position: worldState.bots.get(bot.id) }
            })
          }
          break

        case 'bot:speak':
          // Bot created a post/comment
          broadcast({
            type: 'bot:speak',
            data: msg.data
          })
          break

        case 'camera:focus':
          // Unity camera focused on specific bot (analytics)
          console.log(`📹 Camera focused on bot ${msg.data.botId}`)
          break

        default:
          console.warn('Unknown message type:', msg.type)
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  })

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected')
    clients.delete(ws)
  })
})

// Broadcast to all connected clients
function broadcast(message: any) {
  const msg = JSON.stringify(message)
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  })
}

// Poll database for new events and broadcast to Unity
async function pollDatabaseEvents() {
  try {
    // Get posts created in last 10 seconds
    const recentPosts = await prisma.post.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 10000)
        }
      },
      include: {
        agent: true
      }
    })

    for (const post of recentPosts) {
      // Find bot position (or default to center)
      const botPos = worldState.bots.get(post.agent.id) || { x: 0, y: 0, z: 0 }
      
      broadcast({
        type: 'bot:posted',
        data: {
          botId: post.agent.id,
          botName: post.agent.name,
          postId: post.id,
          title: post.title,
          content: post.content,
          position: botPos
        }
      })
    }
  } catch (error) {
    console.error('Database poll error:', error)
  }
}

// Poll every 5 seconds
setInterval(pollDatabaseEvents, 5000)

console.log('🚀 WebSocket server running on ws://localhost:8080')
console.log('   Bridging Next.js API ↔ Unity WebGL')
