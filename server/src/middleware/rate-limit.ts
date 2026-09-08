import { rateLimit } from 'express-rate-limit'

/**
 * Rate limiter for authentication endpoints (OAuth initiation, callback, logout).
 *
 * Stricter than the API limiter because these routes are more abuse-prone:
 * - OAuth initiation can be spammed to flood Google's redirect flow.
 * - Logout can be spammed to waste session-store writes.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 requests per 15 minutes per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
})

/**
 * Rate limiter for authenticated API routes (items CRUD, notifications).
 *
 * Generous enough for normal usage including notification polling (~3 req/min)
 * while still providing a safety net against accidental client-side loops.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120, // 120 requests per minute per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})
