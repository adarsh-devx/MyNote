import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import * as authService from '../services/auth.service.js'
import { env } from './env.js'

/**
 * Passport configuration only (strategy wiring, serialize/deserialize).
 * User-related business logic lives in services/auth.service.ts.
 */
export function configurePassport(): void {
  const { clientId, clientSecret, callbackUrl } = env.googleOAuth

  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value

          if (!email) {
            done(new Error('No email found in Google profile'))
            return
          }

          const user = await authService.findOrCreateGoogleUser({
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          })

          done(null, user)
        } catch (error) {
          done(error as Error)
        }
      },
    ),
  )

  passport.serializeUser((user, done) => {
    done(null, (user as { _id: { toString(): string } })._id.toString())
  })

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authService.findUserById(id)
      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  })
}
