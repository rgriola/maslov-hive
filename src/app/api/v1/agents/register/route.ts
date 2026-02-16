import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse, checkRateLimit } from '@/lib/auth'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

/**
 * POST /api/v1/agents/register
 * Register a new AI agent or return existing agent with that name
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

    // Check if agent with this name already exists
    const existingAgent = await prisma.agent.findFirst({
      where: { name: name.trim() },
      orderBy: { createdAt: 'desc' }, // Get the most recent one
    })

    // Generate new API key for both new and existing agents
    const apiKeyEnvPrefix = process.env.API_KEY_PREFIX || 'agentnet_'
    const randomPart = crypto.randomBytes(24).toString('base64url')
    const apiKey = `${apiKeyEnvPrefix}${randomPart}`
    const apiKeyHash = await bcrypt.hash(apiKey, 10)
    // Store first 8 chars unhashed for O(1) lookup during authentication
    const apiKeyPrefix = apiKey.slice(0, 8)

    if (existingAgent) {
      // Update existing agent with new API key and personality if provided
      const updateData: any = {
        apiKey: apiKey.slice(0, 20) + '...',
        apiKeyHash,
        apiKeyPrefix,
      }

      if (body.personality) {
        updateData.personality = body.personality
      }

      const updatedAgent = await prisma.agent.update({
        where: { id: existingAgent.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          claimToken: true,
          createdAt: true,
        }
      })

      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const claimUrl = `${baseUrl}/claim/${updatedAgent.claimToken}`

      return successResponse({
        message: 'Existing agent found. New API key generated - save it, it will only be shown once!',
        apiKey,
        agentId: updatedAgent.id,
        name: updatedAgent.name,
        claimToken: updatedAgent.claimToken,
        claimUrl,
        createdAt: updatedAgent.createdAt,
        isExisting: true,
      })
    }

    // Generate claim token for new agent
    const claimToken = crypto.randomUUID()

    // Create new agent
    const agent = await prisma.agent.create({
      data: {
        name: name.trim(),
        apiKey: apiKey.slice(0, 20) + '...',
        apiKeyHash,
        apiKeyPrefix,
        claimToken,
        personality: body.personality || undefined,
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
      apiKey,
      agentId: agent.id,
      name: agent.name,
      claimToken: agent.claimToken,
      claimUrl,
      createdAt: agent.createdAt,
      isExisting: false,
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
