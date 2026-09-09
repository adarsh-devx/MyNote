import session from 'express-session'
import MongoStore from 'connect-mongo'
import { env } from '../config/env.js'

declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}


export function createSessionMiddleware(mongoUri: string) {
  return session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // 'none' in production: the frontend (mynotes-pooq.onrender.com) and the
      // API (mynote-ydld.onrender.com) are cross-site, so Lax would prevent the
      // browser from sending the session cookie on fetch requests.
      // SameSite=None requires Secure, which is guaranteed above in production.
      sameSite: env.isProduction ? 'none' : 'lax',
    },
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: 'sessions',
    }),
  })
}
