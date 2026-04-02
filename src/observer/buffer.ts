export interface ToolEvent {
  tool: string
  file_path: string
  exit_status: number
  timestamp: string
}

export class EventBuffer {
  private events: ToolEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly batchSize: number,
    private readonly flushIntervalMs: number,
    private readonly onFlush: (events: ToolEvent[]) => void,
  ) {
    this.startTimer()
  }

  add(event: ToolEvent): void {
    this.events.push(event)
    if (this.events.length >= this.batchSize) {
      this.flush()
    }
  }

  flush(): void {
    if (this.events.length === 0) return
    const batch = [...this.events]
    this.events = []
    this.resetTimer()
    this.onFlush(batch)
  }

  size(): number {
    return this.events.length
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs)
    // Don't block process exit — timer is background
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as { unref(): void }).unref()
    }
  }

  private resetTimer(): void {
    this.destroy()
    this.startTimer()
  }
}
