import type { Request } from 'express'

/** Request that has passed the requireAuth middleware (userId attached). */
export interface AuthenticatedRequest extends Request {
  userId: string
}

/** Google profile data extracted by the Passport strategy and consumed by the auth service. */
export interface GoogleProfileData {
  googleId: string
  email: string
  name: string
  avatarUrl?: string
}

/** Shape returned by GET /api/auth/me (identical to the Phase 3 response). */
export interface AuthUserDTO {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}
