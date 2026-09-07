import { UserModel, type UserDocument } from '../models/User.js'
import type { GoogleProfileData } from '../types/auth.js'

/**
 * User/session-related business logic.
 * Passport configuration itself stays in config/passport.ts; it delegates here.
 */

/** Find a user by their Google id, creating or refreshing their profile as needed. */
export async function findOrCreateGoogleUser(
  profile: GoogleProfileData,
): Promise<UserDocument> {
  let user = await UserModel.findOne({ googleId: profile.googleId })

  if (!user) {
    user = await UserModel.create({
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    })
  } else {
    // Update user info if changed
    user.email = profile.email
    user.name = profile.name
    user.avatarUrl = profile.avatarUrl
    await user.save()
  }

  return user
}

/** Find a user by id. Used by GET /api/auth/me and passport.deserializeUser. */
export async function findUserById(id: string): Promise<UserDocument | null> {
  return UserModel.findById(id)
}
