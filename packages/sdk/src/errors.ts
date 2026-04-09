export class EngramError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngramError'
  }
}

export class EngramApiError extends EngramError {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'EngramApiError'
  }
}
