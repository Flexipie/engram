import type { Memory } from '../db/memories.js'

export function recencyFactor(lastValidated: string | null): number {
  if (!lastValidated) return 0.9
  const days = (Date.now() - new Date(lastValidated).getTime()) / 86_400_000
  if (days <= 30) return 1.0
  if (days <= 90) return 1.0 - ((days - 30) / 60) * 0.5
  return 0.5
}

export function scopeMatchBoost(memoryScope: string, detectedScopes: string[]): number {
  if (detectedScopes.includes(memoryScope)) return 1.5
  if (memoryScope === 'general') return 1.0
  return 0.8
}

export function computeScore(memory: Memory, detectedScopes: string[]): number {
  return memory.confidence * recencyFactor(memory.last_validated) * scopeMatchBoost(memory.scope, detectedScopes)
}

export function rankMemories(memories: Memory[], detectedScopes: string[]): (Memory & { _score: number })[] {
  return [...memories]
    .map(m => ({ ...m, _score: computeScore(m, detectedScopes) }))
    .sort((a, b) => b._score - a._score || b.evidence_count - a.evidence_count)
}
