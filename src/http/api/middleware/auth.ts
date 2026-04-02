import type { RequestHandler } from 'express'
import { createHash } from 'crypto'
import type { EngramConfig } from '../../../config.js'

export function createAuthMiddleware(config: Pick<EngramConfig, 'apiKeyRequired' | 'apiKeys'>): RequestHandler {
  return (req, res, next): void => {
    if (!config.apiKeyRequired) {
      next()
      return
    }

    const authHeader = req.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const rawKey = authHeader.slice(7)
    const hash = createHash('sha256').update(rawKey).digest('hex')

    if (!config.apiKeys.includes(hash)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  }
}
