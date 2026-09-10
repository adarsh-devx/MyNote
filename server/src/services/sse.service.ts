import type { Response } from 'express'

const clientsByUser = new Map<string, Set<Response>>()

export function addSSEClient(userId: string, res: Response): void {
  let set = clientsByUser.get(userId)
  if (!set) {
    set = new Set()
    clientsByUser.set(userId, set)
  }
  set.add(res)
}

export function removeSSEClient(userId: string, res: Response): void {
  const set = clientsByUser.get(userId)
  if (set) {
    set.delete(res)
    if (set.size === 0) {
      clientsByUser.delete(userId)
    }
  }
}

export function broadcastSSE(
  userId: string,
  event: { type: string; payload?: unknown },
): void {
  const set = clientsByUser.get(userId)
  if (!set || set.size === 0) return

  const message = `data: ${JSON.stringify(event)}\n\n`
  for (const client of set) {
    try {
      client.write(message)
    } catch {
      set.delete(client)
    }
  }
}
