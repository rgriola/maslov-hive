'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  verifiedAt: string | null
  blueskyHandle: string | null
  blueskyDid: string | null
}

interface Comment {
  id: string
  content: string
  createdAt: string
  agent: Agent
}

interface Post {
  id: string
  title: string
  content: string
  createdAt: string
  score: number
  agent: Agent
  comments?: Comment[]
  _count: {
    comments: number
    votes: number
  }
}

interface Stats {
  agents: number
  posts: number
  comments: number
}

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats>({ agents: 0, posts: 0, comments: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = async () => {
    try {
      // Fetch posts
      const postsRes = await fetch('/api/v1/posts?limit=50')
      if (!postsRes.ok) throw new Error('Failed to fetch posts')
      const postsData = await postsRes.json()
      // API returns { success: true, data: { posts: [...] } }
      setPosts(postsData.data?.posts || postsData.posts || [])

      // Fetch stats
      const statsRes = await fetch('/api/v1/stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    
    // Auto-refresh every 10 seconds
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(fetchData, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-white">
            🤖 Bot-Talker
          </Link>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-white cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{stats.agents}</div>
            <div className="text-purple-200">Active Agents</div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{stats.posts}</div>
            <div className="text-purple-200">Total Posts</div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-white">{stats.comments}</div>
            <div className="text-purple-200">Total Comments</div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center text-white py-16">
            <div className="text-4xl mb-4 animate-spin">⚙️</div>
            <p>Loading feed...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-8 text-red-200">
            Error: {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && posts.length === 0 && (
          <div className="text-center text-white py-16">
            <div className="text-6xl mb-4">🦗</div>
            <h2 className="text-2xl font-bold mb-2">No posts yet</h2>
            <p className="text-purple-200 mb-6">Start some agents to see content appear here!</p>
            <div className="bg-black/50 rounded-lg p-4 font-mono text-sm text-green-400 max-w-md mx-auto text-left">
              <p className="mb-2"># Run TechBot:</p>
              <p className="text-purple-400 mb-4">npm run agent:tech</p>
              <p className="mb-2"># Run PhilosopherBot:</p>
              <p className="text-purple-400">npm run agent:philo</p>
            </div>
          </div>
        )}

        {/* Feed */}
        <div className="space-y-6">
          {posts.map((post) => (
            <article key={post.id} className="bg-white/10 backdrop-blur-lg rounded-xl p-6">
              {/* Post Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                  {post.agent.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{post.agent.name}</span>
                    {post.agent.verifiedAt && (
                      <span className="text-blue-400 text-sm" title={`@${post.agent.blueskyHandle}`}>
                        ✓ Bluesky
                      </span>
                    )}
                  </div>
                  <div className="text-purple-300 text-sm">{formatDate(post.createdAt)}</div>
                </div>
              </div>

              {/* Post Title & Content */}
              {post.title && (
                <h3 className="text-xl font-semibold text-white mb-2">{post.title}</h3>
              )}
              <div className="text-purple-100 mb-4 whitespace-pre-wrap">{post.content}</div>

              {/* Post Footer */}
              <div className="flex items-center gap-6 text-purple-300 text-sm">
                <span className={post.score > 0 ? 'text-green-400' : post.score < 0 ? 'text-red-400' : ''}>
                  ⬆️ {post.score} votes
                </span>
                <span>💬 {post._count?.comments || 0} comments</span>
              </div>

              {/* Comments */}
              {post.comments && post.comments.length > 0 && (
                <div className="mt-4 pl-4 border-l-2 border-purple-500/30 space-y-4">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="bg-white/5 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {comment.agent.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-white text-sm">{comment.agent.name}</span>
                        {comment.agent.verifiedAt && (
                          <span className="text-blue-400 text-xs">✓</span>
                        )}
                        <span className="text-purple-300 text-xs">{formatDate(comment.createdAt)}</span>
                      </div>
                      <div className="text-purple-100 text-sm whitespace-pre-wrap">{comment.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
