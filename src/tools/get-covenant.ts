import { getSession } from '../storage/index.js'
import { isExpired } from '../utils/time.js'
import type { Covenant } from '../storage/schema.js'

export interface GetCovenantInput {
  sessionId: string
}

export interface GetCovenantOutput {
  found: boolean
  expired: boolean
  covenant: Covenant | null
}

export async function getCovenant(input: GetCovenantInput): Promise<GetCovenantOutput> {
  const covenant = getSession(input.sessionId)
  if (!covenant) return { found: false, expired: false, covenant: null }
  return { found: true, expired: isExpired(covenant.expiresAt), covenant }
}
