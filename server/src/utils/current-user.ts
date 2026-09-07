import type { Request } from 'express'
import type { AuthenticatedRequest } from '../types/auth.js'

/**
 * Get the current authenticated user's ID.
 * This is safe to use in route handlers after requireAuth middleware.
 */
export function getCurrentUserId(request: Request): string {
  return (request as AuthenticatedRequest).userId
}
