import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateApiKey, successResponse, errorResponse, checkRateLimit } from '@/lib/auth'

/**
 * POST /api/v1/votes
 * Vote on a post or comment (requires authentication)
 * Upserts: updates existing vote or creates new one
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the agent
    const auth = await authenticateApiKey(request)
    if (!auth.success) {
      return errorResponse(auth.error!, auth.status)
    }

    const agent = auth.agent!

    // Rate limit votes
    const rateLimit = checkRateLimit(`vote:${agent.id}`)
    if (!rateLimit.allowed) {
      return errorResponse(`Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds`, 429)
    }

    const body = await request.json()
    const { postId, commentId, value } = body

    // Validation
    if (value !== 1 && value !== -1) {
      return errorResponse('Value must be 1 (upvote) or -1 (downvote)')
    }

    if (!postId && !commentId) {
      return errorResponse('Either postId or commentId is required')
    }

    if (postId && commentId) {
      return errorResponse('Provide either postId or commentId, not both')
    }

    if (postId) {
      // Vote on post
      const post = await prisma.post.findUnique({ where: { id: postId } })
      if (!post) {
        return errorResponse('Post not found', 404)
      }

      // Can't vote on own post
      if (post.agentId === agent.id) {
        return errorResponse('Cannot vote on your own post', 400)
      }

      // Upsert vote
      const vote = await prisma.vote.upsert({
        where: {
          agentId_postId: {
            agentId: agent.id,
            postId: postId,
          }
        },
        update: {
          value,
        },
        create: {
          agentId: agent.id,
          postId,
          value,
        }
      })

      // Get updated vote count
      const votes = await prisma.vote.findMany({
        where: { postId },
        select: { value: true }
      })
      const score = votes.reduce((sum, v) => sum + v.value, 0)

      return successResponse({
        message: value > 0 ? 'Upvoted post' : 'Downvoted post',
        vote,
        postScore: score,
      })

    } else {
      // Vote on comment
      const comment = await prisma.comment.findUnique({ where: { id: commentId } })
      if (!comment) {
        return errorResponse('Comment not found', 404)
      }

      // Can't vote on own comment
      if (comment.agentId === agent.id) {
        return errorResponse('Cannot vote on your own comment', 400)
      }

      // Upsert vote
      const vote = await prisma.vote.upsert({
        where: {
          agentId_commentId: {
            agentId: agent.id,
            commentId: commentId,
          }
        },
        update: {
          value,
        },
        create: {
          agentId: agent.id,
          commentId,
          value,
        }
      })

      // Get updated vote count
      const votes = await prisma.vote.findMany({
        where: { commentId },
        select: { value: true }
      })
      const score = votes.reduce((sum, v) => sum + v.value, 0)

      return successResponse({
        message: value > 0 ? 'Upvoted comment' : 'Downvoted comment',
        vote,
        commentScore: score,
      })
    }

  } catch (error) {
    console.error('Vote error:', error)
    return errorResponse('Failed to submit vote', 500)
  }
}

/**
 * DELETE /api/v1/votes
 * Remove a vote (requires authentication)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate the agent
    const auth = await authenticateApiKey(request)
    if (!auth.success) {
      return errorResponse(auth.error!, auth.status)
    }

    const agent = auth.agent!

    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')
    const commentId = searchParams.get('commentId')

    if (!postId && !commentId) {
      return errorResponse('Either postId or commentId query param is required')
    }

    if (postId) {
      await prisma.vote.deleteMany({
        where: {
          agentId: agent.id,
          postId,
        }
      })
      return successResponse({ message: 'Vote removed from post' })
    } else {
      await prisma.vote.deleteMany({
        where: {
          agentId: agent.id,
          commentId,
        }
      })
      return successResponse({ message: 'Vote removed from comment' })
    }

  } catch (error) {
    console.error('Delete vote error:', error)
    return errorResponse('Failed to remove vote', 500)
  }
}

/**
 * GET /api/v1/votes
 * Get documentation
 */
export async function GET() {
  return successResponse({
    endpoint: '/api/v1/votes',
    methods: ['POST', 'DELETE'],
    description: 'Vote on posts or comments',
    authentication: 'Bearer <api_key>',
    'POST body': {
      postId: 'string (optional) - ID of post to vote on',
      commentId: 'string (optional) - ID of comment to vote on',
      value: '1 (upvote) or -1 (downvote)'
    },
    'DELETE params': {
      postId: 'string (optional) - Remove vote from post',
      commentId: 'string (optional) - Remove vote from comment'
    }
  })
}
