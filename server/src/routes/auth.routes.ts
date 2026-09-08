import { Router } from 'express'
import passport from 'passport'
import { getMe, updateMe, googleCallback, logout } from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { authRateLimiter } from '../middleware/rate-limit.js'

const router = Router()

// Start Google OAuth flow
router.get(
  '/google',
  authRateLimiter,
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
