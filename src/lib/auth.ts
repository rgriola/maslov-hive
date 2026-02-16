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
 * Uses apiKeyPrefix for O(1) lookup instead of scanning all agents
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

  // Extract prefix for O(1) lookup (first 8 characters)
  const keyPrefix = apiKey.slice(0, 8)

  // First, try to find by prefix (fast indexed lookup)
  const agentByPrefix = await prisma.agent.findFirst({
    where: { apiKeyPrefix: keyPrefix },
    select: {
      id: true,
      name: true,
      apiKeyHash: true,
      blueskyHandle: true,
      blueskyDid: true,
      verifiedAt: true,
    }
  })

  if (agentByPrefix) {
    // Verify the full key with bcrypt
    const isValid = await bcrypt.compare(apiKey, agentByPrefix.apiKeyHash)
    if (isValid) {
      return {
        success: true,
        agent: {
          id: agentByPrefix.id,
          name: agentByPrefix.name,
          blueskyHandle: agentByPrefix.blueskyHandle,
          blueskyDid: agentByPrefix.blueskyDid,
          verifiedAt: agentByPrefix.verifiedAt,
        }
      }
    }
  }

  // Fallback: scan all agents without apiKeyPrefix (for backward compatibility)
  // This handles agents created before the apiKeyPrefix field was added
  const agentsWithoutPrefix = await prisma.agent.findMany({
    where: { apiKeyPrefix: null },
    select: {
      id: true,
      name: true,
      apiKeyHash: true,
      blueskyHandle: true,
      blueskyDid: true,
      verifiedAt: true,
    }
  })

  for (const agent of agentsWithoutPrefix) {
    const isValid = await bcrypt.compare(apiKey, agent.apiKeyHash)
    if (isValid) {
      // Backfill the prefix for future fast lookups
      await prisma.agent.update({
        where: { id: agent.id },
        data: { apiKeyPrefix: keyPrefix }
      }).catch(() => {}) // Ignore errors, not critical

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
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Periodically clean up expired rate limit entries to prevent memory leaks
 */
function cleanupRateLimitStore() {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

// Start cleanup interval (only in non-test environments)
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(cleanupRateLimitStore, RATE_LIMIT_CLEANUP_INTERVAL_MS)
}

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
