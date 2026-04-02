import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBuffer, type ToolEvent } from '../../observer/buffer.js'

function makeEvent(tool = 'Write', file_path = 'src/api/handler.ts'): ToolEvent {
  return { tool, file_path, exit_status: 0, timestamp: new Date().toISOString() }
}

describe('EventBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty', () => {
    const buf = new EventBuffer(10, 30000, () => {})
    expect(buf.size()).toBe(0)
    buf.destroy()
  })

  it('accumulates events', () => {
    const buf = new EventBuffer(10, 30000, () => {})
    buf.add(makeEvent())
    buf.add(makeEvent())
    expect(buf.size()).toBe(2)
    buf.destroy()
  })

  it('flushes when batchSize is reached', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(3, 30000, onFlush)
    buf.add(makeEvent())
    buf.add(makeEvent())
    expect(onFlush).not.toHaveBeenCalled()
    buf.add(makeEvent())
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ tool: 'Write' })]))
    buf.destroy()
  })

  it('resets to empty after size flush', () => {
    const buf = new EventBuffer(2, 30000, () => {})
    buf.add(makeEvent())
    buf.add(makeEvent()) // triggers flush
    expect(buf.size()).toBe(0)
    buf.destroy()
  })

  it('flushes on timer expiry', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(10, 5000, onFlush)
    buf.add(makeEvent())
    buf.add(makeEvent())
    expect(onFlush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5001)
    expect(onFlush).toHaveBeenCalledOnce()
    expect(onFlush).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ tool: 'Write' })]))
    buf.destroy()
  })

  it('does not flush on timer when buffer is empty', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(10, 5000, onFlush)
    vi.advanceTimersByTime(5001)
    expect(onFlush).not.toHaveBeenCalled()
    buf.destroy()
  })

  it('resets timer after size flush so timer does not double-fire', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(2, 5000, onFlush)
    buf.add(makeEvent())
    buf.add(makeEvent()) // size flush
    buf.add(makeEvent()) // new event after flush
    vi.advanceTimersByTime(5001) // timer flush
    expect(onFlush).toHaveBeenCalledTimes(2)
    buf.destroy()
  })

  it('manual flush works', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(10, 30000, onFlush)
    buf.add(makeEvent())
    buf.flush()
    expect(onFlush).toHaveBeenCalledOnce()
    expect(buf.size()).toBe(0)
    buf.destroy()
  })

  it('passes all buffered events to onFlush', () => {
    const received: ToolEvent[][] = []
    const buf = new EventBuffer(3, 30000, (evts) => received.push(evts))
    buf.add(makeEvent('Write', 'a.ts'))
    buf.add(makeEvent('Read', 'b.ts'))
    buf.add(makeEvent('Bash', 'npm test'))
    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(3)
    expect(received[0][0].file_path).toBe('a.ts')
    expect(received[0][1].tool).toBe('Read')
    buf.destroy()
  })

  it('destroy stops the timer', () => {
    const onFlush = vi.fn()
    const buf = new EventBuffer(10, 5000, onFlush)
    buf.add(makeEvent())
    buf.destroy()
    vi.advanceTimersByTime(10000)
    expect(onFlush).not.toHaveBeenCalled()
  })
})
