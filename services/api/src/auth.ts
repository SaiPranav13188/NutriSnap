import type { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAdmin, supabaseForUser } from './supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `requireAuth`. */
    user: { id: string; email: string | null };
    accessToken: string;
    /** RLS-scoped client for the authenticated user. */
    db: SupabaseClient;
  }
}

interface CacheEntry {
  userId: string;
  email: string | null;
  expiresAt: number;
}

/**
 * Verifying a JWT costs a round trip to Supabase's auth server. Cache the
 * result briefly so a burst of requests from one screen does not multiply
 * into a burst of auth calls. Entries are short-lived so a signed-out session
 * stops working quickly.
 */
const TOKEN_CACHE_TTL_MS = 60_000;
const tokenCache = new Map<string, CacheEntry>();

function pruneCache(now: number): void {
  if (tokenCache.size < 500) return;
  for (const [token, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(token);
  }
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function bearerFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

/**
 * Fastify preHandler that rejects anonymous requests and attaches the user
 * plus an RLS-scoped database client to the request.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = bearerFrom(request);
  if (!token) {
    throw new HttpError(401, 'Missing bearer token.', 'unauthenticated');
  }

  const now = Date.now();
  const cached = tokenCache.get(token);

  if (cached && cached.expiresAt > now) {
    request.user = { id: cached.userId, email: cached.email };
    request.accessToken = token;
    request.db = supabaseForUser(token);
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    tokenCache.delete(token);
    throw new HttpError(401, 'Invalid or expired session.', 'unauthenticated');
  }

  pruneCache(now);
  tokenCache.set(token, {
    userId: data.user.id,
    email: data.user.email ?? null,
    expiresAt: now + TOKEN_CACHE_TTL_MS,
  });

  request.user = { id: data.user.id, email: data.user.email ?? null };
  request.accessToken = token;
  request.db = supabaseForUser(token);
}
