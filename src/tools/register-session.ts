import type { Covenant } from '../storage/schema.js'
import { saveSession, readSessions } from '../storage/index.js'
import { sessionId as genSessionId } from '../utils/ids.js'
import { now, isExpired } from '../utils/time.js'

export interface RegisterSessionInput {
  agentId: string
  intent: string
  authorizedTools: string[]
  authorizedScope: string[]
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface RegisterSessionOutput {
  sessionId: string
  covenant: Covenant
  alreadyExists: boolean
}

export async function registerSession(input: RegisterSessionInput): Promise<RegisterSessionOutput> {
  const store = readSessions()
  for (const covenant of Object.values(store.sessions)) {
    if (covenant.agentId === input.agentId && covenant.intent === input.intent) {
      if (!isExpired(covenant.expiresAt)) {
        return { sessionId: covenant.sessionId, covenant, alreadyExists: true }
      }
    }
  }

  const covenant: Covenant = {
    sessionId: genSessionId(),
    agentId: input.agentId,
    intent: input.intent,
    authorizedTools: input.authorizedTools,
    authorizedScope: input.authorizedScope,
    createdAt: now(),
    expiresAt: input.expiresAt,
    metadata: input.metadata,
  }

  saveSession(covenant)
  return { sessionId: covenant.sessionId, covenant, alreadyExists: false }
}
