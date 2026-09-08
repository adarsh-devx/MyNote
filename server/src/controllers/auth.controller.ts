import type { Request, Response } from 'express'
import { env } from '../config/env.js'
import type { AuthenticatedRequest, AuthUserDTO } from '../types/auth.js'
import type { UserDocument } from '../models/User.js'
import * as authService from '../services/auth.service.js'

/** Map a user document to the exact GET /api/auth/me response shape used since Phase 3. */
function toAuthUserDTO(user: UserDocument): AuthUserDTO {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
  }
}

/**
 * Google OAuth callback (runs after passport.authenticate succeeded).
 * Establishes the server-side session, then redirects to the client.
 */
export function googleCallback(req: Request, res: Response): void {
  if (req.user) {
    req.session.userId = (req.user as { _id: { toString(): string } })._id.toString()
    req.session.save(() => {
      res.redirect(env.clientUrl)
    })
  } else {
    res.redirect('/')
  }
}

/**
 * GET /api/auth/me
 *
 * Note: this intentionally keeps the Phase 3 behavior of mapping any internal
 * failure to a generic 500 instead of forwarding to the error middleware,
 * so responses stay byte-identical (e.g. a corrupted session id must not
 * surface as a 400 CastError response).
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  try {
    const user = await authService.findUserById(req.session.userId)
    if (!user) {
      res.status(401).json({ error: 'User not found' })
      return
    }
    res.json(toAuthUserDTO(user))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** PATCH /api/auth/me — update the authenticated user's display name. */
export async function updateMe(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest

  try {
    const { name } = (req.body ?? {}) as Record<string, unknown>

    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name must be a non-empty string.' })
      return
    }
    if (name.trim().length > 100) {
      res.status(400).json({ error: 'Name must be 100 characters or less.' })
      return
    }

    const user = await authService.updateUserProfile(userId, { name: name.trim() })
    if (!user) {
      res.status(404).json({ error: 'User not found.' })
      return
    }

    res.json(toAuthUserDTO(user))
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

/** POST /api/auth/logout — destroy the server-side session and clear the cookie. */
export function logout(req: Request, res: Response): void {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' })
      return
    }
    res.clearCookie('connect.sid')
    res.json({ message: 'Logged out successfully' })
  })
}
