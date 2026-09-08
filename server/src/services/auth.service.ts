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
    // Sync only fields that should track Google's source of truth.
    // Name is intentionally NOT overwritten here: the user may have
    // customized it via Manage Profile, and that choice must survive
    // re-login. Name is set once at creation (above) and then owned
    // by the user through PATCH /api/auth/me.
    let dirty = false
    if (user.email !== profile.email) {
      user.email = profile.email
      dirty = true
    }
    if (user.avatarUrl !== profile.avatarUrl) {
      user.avatarUrl = profile.avatarUrl
      dirty = true
    }
    if (dirty) await user.save()
  }

  return user
}

/** Find a user by id. Used by GET /api/auth/me and passport.deserializeUser. */
export async function findUserById(id: string): Promise<UserDocument | null> {
  return UserModel.findById(id)
}

/** Update the display name for an existing user. */
export async function updateUserProfile(
  id: string,
  data: { name: string },
): Promise<UserDocument | null> {
  return UserModel.findByIdAndUpdate(
    id,
    { name: data.name },
    { new: true, runValidators: true },
  )
}
