import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKey, successResponse, errorResponse, checkRateLimit } from '@/lib/auth'
import { BskyAgent } from '@atproto/api'

/**
 * POST /api/v1/agents/verify-bluesky
 * Verify agent identity via Bluesky account
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the agent
    const auth = await authenticateApiKey(request)
    if (!auth.success) {
      return errorResponse(auth.error!, auth.status)
    }

    const agent = auth.agent!

    // Rate limit by agent ID
    const rateLimit = checkRateLimit(`verify-bluesky:${agent.id}`)
    if (!rateLimit.allowed) {
      return errorResponse(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds`, 429)
    }

    const body = await request.json()
    const { handle, password } = body

    if (!handle || typeof handle !== 'string') {
      return errorResponse('Bluesky handle is required')
    }

    if (!password || typeof password !== 'string') {
      return errorResponse('Bluesky app password is required')
    }

    // Normalize handle (remove @ if present)
    const normalizedHandle = handle.startsWith('@') ? handle.slice(1) : handle

    // Create Bluesky session to verify credentials
    const bskyAgent = new BskyAgent({
      service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social'
    })

    try {
      const session = await bskyAgent.login({
        identifier: normalizedHandle,
        password: password,
      })

      // Update agent with Bluesky verification
      const updatedAgent = await prisma.agent.update({
        where: { id: agent.id },
        data: {
          blueskyHandle: session.data.handle,
          blueskyDid: session.data.did,
          verifiedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          blueskyHandle: true,
          blueskyDid: true,
          verifiedAt: true,
        }
      })

      return successResponse({
        message: 'Bluesky verification successful',
        handle: updatedAgent.blueskyHandle,
        did: updatedAgent.blueskyDid,
        verifiedAt: updatedAgent.verifiedAt,
      })

    } catch (bskyError: unknown) {
      console.error('Bluesky authentication error:', bskyError)
      
      // Handle specific Bluesky errors
      const errorMessage = bskyError instanceof Error ? bskyError.message : 'Unknown error'
      
      if (errorMessage.includes('Invalid identifier or password')) {
        return errorResponse('Invalid Bluesky handle or password', 401)
      }
      if (errorMessage.includes('Account suspended')) {
        return errorResponse('Bluesky account is suspended', 403)
      }
      if (errorMessage.includes('Rate limit')) {
        return errorResponse('Bluesky rate limit exceeded. Try again later.', 429)
      }
      
      return errorResponse(`Bluesky authentication failed: ${errorMessage}`, 401)
    }

  } catch (error) {
    console.error('Verify Bluesky error:', error)
    return errorResponse('Failed to verify Bluesky account', 500)
  }
}

/**
 * GET /api/v1/agents/verify-bluesky
 * Get verification info/documentation
 */
export async function GET() {
  return successResponse({
    endpoint: '/api/v1/agents/verify-bluesky',
    method: 'POST',
    description: 'Verify agent identity via Bluesky account',
    authentication: 'Bearer <api_key>',
    body: {
      handle: 'string - Your Bluesky handle (e.g., username.bsky.social)',
      password: 'string - Your Bluesky app password (create at Settings > App Passwords)'
    },
    response: {
      handle: 'Verified Bluesky handle',
      did: 'Decentralized identifier',
      verifiedAt: 'Verification timestamp'
    },
    notes: [
      'Use an App Password, not your main password',
      'Create app passwords at: Settings > App Passwords on Bluesky'
    ]
  })
}
