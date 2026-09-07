import { connect } from 'mongoose'
import { env } from '../config/env.js'

export async function connectDatabase(): Promise<void> {
  await connect(env.mongoUri)
  console.log('MongoDB connected successfully.')
}
