import { Router, type Request, type Response, type NextFunction } from 'express'
import passport from 'passport'
import { getMe, updateMe, googleCallback, logout } from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { authRateLimiter } from '../middleware/rate-limit.js'
import { env } from '../config/env.js'

const router = Router()

/**
 * Name of the short-lived cookie used to carry the client origin across the
 * Google OAuth round-trip. A plain cookie is used instead of the session
 * because Passport calls req.session.regenerate() on login (session-fixation
 * protection), which destroys any session data written before the callback —
 * including a clientOrigin stored in the session. Plain cookies are unaffected
 * by session regeneration.
 */
export const OAUTH_ORIGIN_COOKIE = 'oauth_origin'

/**
 * Capture the client's origin at the start of the OAuth flow so the callback
 * can redirect back to the correct frontend port.
 *
 * The value is stored in a short-lived HttpOnly cookie (not the session) so it
 * survives Passport's session.regenerate() at the callback step.
 *
 * The Origin header (sent by browsers on same-origin/first-party navigation)
 * reflects the actual port the user opened — localhost:4173 for preview,
 * localhost:5173 for dev, or the production URL. The Referer header is a
 * fallback for browsers that may omit Origin on some navigation types.
 *
 * The candidate is validated against env.allowedOrigins before being stored,
 * preventing open-redirect attacks.
 */
function captureClientOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin || req.headers.referer
  if (origin) {
    try {
      const url = new URL(origin)
      const candidate = `${url.protocol}//${url.host}`
      const allowedOrigins = env.allowedOrigins.map((o) => o.toLowerCase())
      if (allowedOrigins.includes(candidate.toLowerCase())) {
        // Short-lived HttpOnly cookie — expires in 5 minutes, just long enough
        // for the OAuth round-trip. SameSite=Lax allows it to be sent on the
        // top-level GET redirect from Google back to the callback URL.
        res.cookie(OAUTH_ORIGIN_COOKIE, candidate, {
          httpOnly: true,
          secure: env.isProduction,
          sameSite: 'lax',
          maxAge: 5 * 60 * 1000, // 5 minutes
          path: '/',
        })
      }
    } catch {
      // Malformed URL — ignore and fall back to env.clientUrl.
    }
  }
  next()
}

// Start Google OAuth flow
router.get(
  '/google',
  authRateLimiter,
  captureClientOrigin,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  }),
)

// Google OAuth callback
router.get(
  '/google/callback',
  authRateLimiter,
  passport.authenticate('google', { failureRedirect: '/' }),
  googleCallback,
)

// Get current user
router.get('/me', getMe)

// Update current user profile
router.patch('/me', requireAuth, updateMe)

// Logout
router.post('/logout', authRateLimiter, logout)

export { router as authRouter }
