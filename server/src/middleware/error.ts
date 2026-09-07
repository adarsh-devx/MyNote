import type { ErrorRequestHandler, RequestHandler } from 'express'

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.name === 'ValidationError') {
    const details = Object.values(err.errors ?? {}).map(
      (error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'message' in error
        ) {
          return String((error as { message: unknown }).message)
        }
        return 'Unknown validation error'
      },
    )
    res.status(400).json({ error: 'Validation failed', details })
    return
  }

  if (err?.name === 'CastError') {
    res.status(400).json({ error: 'Invalid identifier' })
    return
  }

  if (err?.code === 11000) {
    res.status(409).json({ error: 'Duplicate key' })
    return
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
