import 'dotenv/config'
import dns from 'node:dns'

// Set DNS fallback servers so MongoDB SRV lookups succeed even if local network DNS blocks SRV queries
try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch {
  // Ignore if custom DNS servers cannot be set
}
import cors from 'cors'
import express from 'express'
import passport from 'passport'
import { connectDatabase } from './db/connect.js'
import { configurePassport } from './config/passport.js'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { createSessionMiddleware } from './middleware/session.js'
import { itemRouter } from './routes/item.routes.js'
import { authRouter } from './routes/auth.routes.js'

const app = express()

// Render terminates TLS at its proxy and forwards plain HTTP to the app with
// X-Forwarded-Proto. Without this, Express sees an insecure request and
// express-session refuses to send the `secure` cookie (Set-Cookie is silently
// dropped), so the OAuth session never reaches the browser -> login loop.
app.set('trust proxy', 1)

const port = env.port
const clientUrl = env.clientUrl

// CORS with credentials
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  }),
)

app.use(express.json({ limit: '100kb' }))

// Session middleware (throws early if MONGODB_URI / SESSION_SECRET are not set)
app.use(createSessionMiddleware(env.mongoUri))

// Passport configuration
configurePassport()
app.use(passport.initialize())
app.use(passport.session())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mynotes-api' })
})

// Auth routes
app.use('/api/auth', authRouter)

// Item routes
app.use('/api/items', itemRouter)

app.use(notFoundHandler)
app.use(errorHandler)

async function main(): Promise<void> {
  try {
    await connectDatabase()
    app.listen(port, () => {
      console.log(`MyNotes API running on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exitCode = 1
  }
}

void main()
