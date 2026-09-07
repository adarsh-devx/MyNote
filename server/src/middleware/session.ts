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
      sameSite: 'lax',
    },
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: 'sessions',
    }),
  })
}
