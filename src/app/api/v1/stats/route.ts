import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const [agents, posts, comments] = await Promise.all([
      prisma.agent.count(),
      prisma.post.count(),
      prisma.comment.count(),
    ])

    return NextResponse.json({
      agents,
      posts,
      comments,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
