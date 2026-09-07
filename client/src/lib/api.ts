import type { ItemType, NoteItem } from '../types/note'
import type { User } from '../types/user'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export function getItems(): Promise<NoteItem[]> {
  return request<NoteItem[]>('/items')
}

export function createItem(data: {
  title: string
  content: string
  type: ItemType
}): Promise<NoteItem> {
  return request<NoteItem>('/items', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateItem(
  id: string,
  data: {
    title?: string
    content?: string
    type?: ItemType
    completed?: boolean
  },
): Promise<NoteItem> {
  return request<NoteItem>(`/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteItem(id: string): Promise<void> {
  return request<void>(`/items/${id}`, { method: 'DELETE' })
}

// Auth functions
export function getCurrentUser(): Promise<User> {
  return request<User>('/auth/me')
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

export function getGoogleAuthUrl(): string {
  return `${BASE_URL}/auth/google`
}
