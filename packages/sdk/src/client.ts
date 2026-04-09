import { Transport } from './transport.js'
import type {
  EngramClientOptions,
  SessionStartResult,
  Task,
  TaskState,
  UpdateTaskInput,
  RememberInput,
  RecallInput,
  ContextPacket,
  ContradictionWarning,
  GetMemoriesInput,
  Memory,
  ErrorPattern,
  CheckErrorResult,
  RecordErrorResult,
  EnforcementResult,
  StatsResponse,
} from './types.js'
import { EngramApiError } from './errors.js'

export class EngramClient {
  private readonly transport: Transport

  constructor(options: EngramClientOptions = {}) {
    this.transport = new Transport({
      baseUrl: options.baseUrl ?? 'http://localhost:7337',
      apiKey: options.apiKey,
      defaultWorktree: options.worktree ?? process.cwd(),
    })
  }

  private worktree(override?: string): string {
    return override ?? this.transport.defaultWorktree
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  sessionStart(params?: { worktree?: string; contextHint?: string }): Promise<SessionStartResult> {
    return this.transport.post<SessionStartResult>('/v1/sessions', {
      worktree: this.worktree(params?.worktree),
      context_hint: params?.contextHint,
    })
  }

  async getCurrentSession(
    worktree?: string,
  ): Promise<{ task: Task & { state?: TaskState }; state: TaskState | null } | null> {
    try {
      return await this.transport.get<{ task: Task & { state?: TaskState }; state: TaskState | null }>(
        '/v1/sessions/current',
        { worktree: this.worktree(worktree) },
      )
    } catch (err) {
      if (err instanceof EngramApiError && err.status === 404) return null
      throw err
    }
  }

  updateTask(params: UpdateTaskInput): Promise<{ task_id: string }> {
    return this.transport.patch<{ task_id: string }>('/v1/sessions/current', {
      ...params,
      worktree: this.worktree(params.worktree),
    })
  }

  createSnapshot(sessionId: string, trigger?: string, worktree?: string): Promise<{ snapshot_id: string }> {
    return this.transport.post<{ snapshot_id: string }>(`/v1/sessions/${sessionId}/snapshot`, {
      trigger,
      worktree: this.worktree(worktree),
    })
  }

  // ── Memories ───────────────────────────────────────────────────────────────

  remember(params: RememberInput): Promise<{ id: string; contradicts_with?: ContradictionWarning[] }> {
    return this.transport.post<{ id: string; contradicts_with?: ContradictionWarning[] }>('/v1/memories', {
      content: params.content,
      type: params.type,
      scope: params.scope,
      source: params.source ?? 'agent',
      global: params.global,
      worktree: this.worktree(params.worktree),
    })
  }

  recall(params?: RecallInput): Promise<ContextPacket> {
    return this.transport.post<ContextPacket>('/v1/recall', {
      scopes: params?.scopes,
      types: params?.types,
      query: params?.query,
      include_global: params?.include_global,
      limit: params?.limit,
      worktree: this.worktree(params?.worktree),
    })
  }

  getMemories(params?: GetMemoriesInput): Promise<{ memories: Memory[]; total: number }> {
    return this.transport.get<{ memories: Memory[]; total: number }>('/v1/memories', {
      scope: params?.scope,
      type: params?.type,
      query: params?.query,
      minConfidence: params?.minConfidence,
      limit: params?.limit,
      worktree: this.worktree(params?.worktree),
    })
  }

  async getMemory(id: string, worktree?: string): Promise<Memory | null> {
    try {
      return await this.transport.get<Memory>(`/v1/memories/${id}`, {
        worktree: this.worktree(worktree),
      })
    } catch (err) {
      if (err instanceof EngramApiError && err.status === 404) return null
      throw err
    }
  }

  updateMemory(
    id: string,
    params: { content?: string; confidence?: number },
    worktree?: string,
  ): Promise<{ ok: boolean }> {
    return this.transport.patch<{ ok: boolean }>(`/v1/memories/${id}`, {
      ...params,
      worktree: this.worktree(worktree),
    })
  }

  invalidate(id: string, reason?: string, worktree?: string): Promise<{ ok: boolean }> {
    return this.transport.delete<{ ok: boolean }>(`/v1/memories/${id}`, {
      reason,
      worktree: this.worktree(worktree),
    })
  }

  // ── Errors ─────────────────────────────────────────────────────────────────

  checkError(params: { errorRaw: string; scope?: string; worktree?: string }): Promise<CheckErrorResult> {
    return this.transport.post<CheckErrorResult>('/v1/errors/check', {
      error_raw: params.errorRaw,
      scope: params.scope,
      worktree: this.worktree(params.worktree),
    })
  }

  recordError(params: {
    errorRaw: string
    cause?: string
    fix?: string
    scope?: string
    worktree?: string
  }): Promise<RecordErrorResult> {
    return this.transport.post<RecordErrorResult>('/v1/errors/record', {
      error_raw: params.errorRaw,
      cause: params.cause,
      fix: params.fix,
      scope: params.scope,
      worktree: this.worktree(params.worktree),
    })
  }

  getErrors(params?: { scope?: string; limit?: number; worktree?: string }): Promise<{ errors: ErrorPattern[] }> {
    return this.transport.get<{ errors: ErrorPattern[] }>('/v1/errors', {
      scope: params?.scope,
      limit: params?.limit,
      worktree: this.worktree(params?.worktree),
    })
  }

  // ── Enforcement ────────────────────────────────────────────────────────────

  enforce(params: { filePath: string; scope?: string; worktree?: string }): Promise<EnforcementResult> {
    return this.transport.post<EnforcementResult>('/v1/enforce', {
      file_path: params.filePath,
      scope: params.scope,
      worktree: this.worktree(params.worktree),
    })
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats(): Promise<StatsResponse> {
    return this.transport.get<StatsResponse>('/v1/stats')
  }
}
