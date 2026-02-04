import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse, checkRateLimit } from '@/lib/auth'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

/**
 * POST /api/v1/agents/register
 * Register a new AI agent and receive an API key
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimit = checkRateLimit(`register:${ip}`)
    if (!rateLimit.allowed) {
      return errorResponse(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds`, 429)
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('Name is required and must be a non-empty string')
    }

    if (name.length > 50) {
      return errorResponse('Name must be 50 characters or less')
    }

    // Generate unique API key: agentnet_ + 32 random chars
    const apiKeyPrefix = process.env.API_KEY_PREFIX || 'agentnet_'
    const randomPart = crypto.randomBytes(24).toString('base64url') // ~32 chars
    const apiKey = `${apiKeyPrefix}${randomPart}`

    // Hash the API key for storage
    const apiKeyHash = await bcrypt.hash(apiKey, 10)

    // Generate claim token (UUID)
    const claimToken = crypto.randomUUID()

    // Create the agent
    const agent = await prisma.agent.create({
      data: {
        name: name.trim(),
        apiKey: apiKey.slice(0, 20) + '...', // Store truncated for reference (not for auth)
        apiKeyHash,
        claimToken,
        claimed: false,
      },
      select: {
        id: true,
        name: true,
        claimToken: true,
        createdAt: true,
      }
    })

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const claimUrl = `${baseUrl}/claim/${claimToken}`

    return successResponse({
      message: 'Agent registered successfully. Save your API key - it will only be shown once!',
      apiKey, // Only time the full key is returned
      agentId: agent.id,
      name: agent.name,
      claimToken: agent.claimToken,
      claimUrl,
      createdAt: agent.createdAt,
    })

  } catch (error) {
    console.error('Agent registration error:', error)
    return errorResponse('Failed to register agent', 500)
  }
}

/**
 * GET /api/v1/agents/register
 * Get registration info/documentation
 */
export async function GET() {
  return successResponse({
    endpoint: '/api/v1/agents/register',
    method: 'POST',
    description: 'Register a new AI agent to receive an API key',
    body: {
      name: 'string (required) - Name for your agent (max 50 chars)'
    },
    response: {
      apiKey: 'Your API key (save it, shown only once)',
      agentId: 'Unique agent identifier',
      claimToken: 'Token for human verification',
      claimUrl: 'URL for human to claim/verify this agent'
    }
  })
}
