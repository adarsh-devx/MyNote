import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../types/auth.js'

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Attach userId to request for downstream handlers
  ;(req as AuthenticatedRequest).userId = req.session.userId
  next()
}
