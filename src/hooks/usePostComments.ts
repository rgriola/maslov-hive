/**
 * usePostComments — shared hook for fetching and caching post comments.
 * Shared fetch/normalize/cache pattern for post comments. Currently used by the bot profile page.
 * Refactored: 2026-02-21 — Phase 3 shared UI components
 */

'use client';

import { useState, useCallback } from 'react';
import type { PostComment } from '@/types/post';

interface UsePostCommentsReturn {
  /** Cached comments keyed by post ID */
  comments: Record<string, PostComment[]>;
  /** Set of post IDs currently being fetched */
  loading: Set<string>;
  /** Fetch comments for a post (with caching — won't re-fetch if already loaded) */
  fetchComments: (postId: string) => Promise<PostComment[]>;
  /** Force re-fetch comments for a post (bypasses cache) */
  refetchComments: (postId: string) => Promise<PostComment[]>;
  /** Clear cached comments for a post (or all if no ID given) */
  clearComments: (postId?: string) => void;
}

/**
 * Hook for fetching and caching post comments.
 * Normalizes the API response (`data.data?.comments || data.comments || []`)
 * so consumers don't need to handle this.
 */
export function usePostComments(): UsePostCommentsReturn {
  const [comments, setComments] = useState<Record<string, PostComment[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const doFetch = useCallback(async (postId: string): Promise<PostComment[]> => {
    setLoading(prev => new Set(prev).add(postId));
    try {
      const res = await fetch(`/api/v1/comments?postId=${postId}`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      const data = await res.json();
      const fetched: PostComment[] = data.data?.comments || data.comments || [];
      setComments(prev => ({ ...prev, [postId]: fetched }));
      return fetched;
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      return [];
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }, []);

  const fetchComments = useCallback(async (postId: string): Promise<PostComment[]> => {
    // Return cached if available
    if (comments[postId]) return comments[postId];
    return doFetch(postId);
  }, [comments, doFetch]);

  const refetchComments = useCallback(async (postId: string): Promise<PostComment[]> => {
    return doFetch(postId);
  }, [doFetch]);

  const clearComments = useCallback((postId?: string) => {
    if (postId) {
      setComments(prev => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    } else {
      setComments({});
    }
  }, []);

  return { comments, loading, fetchComments, refetchComments, clearComments };
}
