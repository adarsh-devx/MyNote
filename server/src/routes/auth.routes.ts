import { Router } from 'express'
import passport from 'passport'
import { getMe, updateMe, googleCallback, logout } from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Start Google OAuth flow
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  }),
)

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  googleCallback,
)

// Get current user
router.get('/me', getMe)

// Update current user profile
router.patch('/me', requireAuth, updateMe)

// Logout
router.post('/logout', logout)

export { router as authRouter }
