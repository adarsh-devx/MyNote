import { Schema, model, type HydratedDocument } from 'mongoose'

export interface User {
  googleId: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<User>(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

export type UserDocument = HydratedDocument<User>
export const UserModel = model<User>('User', userSchema)
