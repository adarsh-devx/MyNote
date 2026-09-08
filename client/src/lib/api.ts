import type { ItemType, NoteItem } from '../types/note'
import type { User } from '../types/user'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request<T>(
  path: string,
  options: RequestInit = {},
  okStatuses: readonly number[] = [],
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Some endpoints treat specific non-2xx statuses as acceptable outcomes
  // (e.g. DELETE returns 404 when the item is already gone).
  if (okStatuses.includes(response.status)) {
    return (await response.json()) as T
  }

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
  // Deleting an already-deleted item (404) achieves the desired final state, so
  // treat 404 as success instead of an error.
  return request<void>(`/items/${id}`, { method: 'DELETE' }, [404])
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
