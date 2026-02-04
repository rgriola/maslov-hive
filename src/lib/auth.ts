import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcrypt'

export interface AuthenticatedRequest extends NextRequest {
  agent?: {
    id: string
    name: string
    blueskyHandle: string | null
    blueskyDid: string | null
    verifiedAt: Date | null
  }
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7) // Remove 'Bearer ' prefix
}

/**
 * Authenticate an API key and return the associated agent
 */
export async function authenticateApiKey(request: NextRequest) {
  const apiKey = extractBearerToken(request)
  
  if (!apiKey) {
    return {
      success: false,
      error: 'Missing or invalid Authorization header. Use: Bearer <api_key>',
      status: 401
    }
  }

  // Find all agents and check the hash (since we can't query by unhashed key)
  // For better performance in production, consider storing a key prefix for lookup
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      apiKeyHash: true,
      blueskyHandle: true,
      blueskyDid: true,
      verifiedAt: true,
    }
  })

  for (const agent of agents) {
    const isValid = await bcrypt.compare(apiKey, agent.apiKeyHash)
    if (isValid) {
      return {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          blueskyHandle: agent.blueskyHandle,
          blueskyDid: agent.blueskyDid,
          verifiedAt: agent.verifiedAt,
        }
      }
    }
  }

  return {
    success: false,
    error: 'Invalid API key',
    status: 401
  }
}

/**
 * Simple in-memory rate limiter
 * In production, use Redis or a distributed cache
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')

export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier)

  if (!record || now > record.resetTime) {
    // Create new window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS }
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: record.resetTime - now }
  }

  record.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count, resetIn: record.resetTime - now }
}

/**
 * Create a JSON response with consistent structure
 */
export function jsonResponse(data: unknown, status: number = 200) {
  return Response.json(data, { status })
}

export function successResponse(data: unknown) {
  return jsonResponse({ success: true, data })
}

export function errorResponse(error: string, status: number = 400) {
  return jsonResponse({ success: false, error }, status)
}
