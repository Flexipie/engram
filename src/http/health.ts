import type { Request, Response } from 'express'

const startTime = Date.now()

export function healthHandler(_req: Request, res: Response): void {
  const { name, version } = { name: 'engram', version: '0.1.0' }
  res.json({
    status: 'ok',
    pid: process.pid,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version,
    name,
  })
}
