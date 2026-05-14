// DECISION: Require at least one of sessionId or actionId (not just any filter)
// because scanning all beiur records with only a `decision` filter could be a
// very broad query returning unrelated sessions. Requiring an entity anchor
// keeps queries intentional and prevents accidental full-scans in production use.

// DECISION: verdicts is opt-in (default false) so existing callers that do not
// pass the flag receive the same { results, count, truncated } shape they always
// have. Adding verdicts only when requested is additive and non-breaking.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BEIUR_DIR, VERDICTS_DIR } from '../store.js'
import type { BeiurRecord, VerdictRecord } from '../store.js'

export interface AuditQueryInput {
  sessionId?: string
  actionId?: string
  decision?: string
  since?: string
  limit?: number
  verdicts?: boolean
}

export interface AuditQueryResult {
  results: BeiurRecord[]
  count: number
  truncated: boolean
  verdicts?: VerdictRecord[]
}

export interface AuditQueryError {
  error: string
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

export async function auditQuery(
  input: AuditQueryInput,
): Promise<AuditQueryResult | AuditQueryError> {
  if (input.sessionId === undefined && input.actionId === undefined) {
    return { error: 'At least one of sessionId or actionId is required' }
  }

  const effectiveLimit = Math.min(
    typeof input.limit === 'number' && input.limit > 0 ? input.limit : DEFAULT_LIMIT,
    MAX_LIMIT,
  )

  let entries: string[] = []
  try {
    entries = await readdir(BEIUR_DIR)
  } catch {
    entries = []
  }

  const records: BeiurRecord[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const raw = await readFile(join(BEIUR_DIR, entry), 'utf8')
      const record = JSON.parse(raw) as BeiurRecord

      // AND-filter: every specified criterion must match
      if (input.sessionId !== undefined && record.sessionId !== input.sessionId) continue
      if (input.actionId !== undefined && record.actionId !== input.actionId) continue
      if (input.decision !== undefined && record.override !== input.decision) continue
      // since filter: ISO string comparison is valid for UTC ISO timestamps
      if (input.since !== undefined && record.filedAt < input.since) continue

      records.push(record)
    } catch {
      // Skip unreadable/malformed files
    }
  }

  // Sort by filedAt descending (newest first)
  records.sort((a, b) => {
    const ta = new Date(a.filedAt).getTime()
    const tb = new Date(b.filedAt).getTime()
    return tb - ta
  })

  const truncated = records.length > effectiveLimit
  const results = truncated ? records.slice(0, effectiveLimit) : records

  const base: AuditQueryResult = {
    results,
    count: results.length,
    truncated,
  }

  if (input.verdicts === true && input.sessionId !== undefined) {
    let verdictEntries: string[] = []
    try {
      verdictEntries = await readdir(VERDICTS_DIR)
    } catch {
      verdictEntries = []
    }

    const verdictRecords: VerdictRecord[] = []
    for (const entry of verdictEntries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = await readFile(join(VERDICTS_DIR, entry), 'utf8')
        const record = JSON.parse(raw) as VerdictRecord
        if (record.sessionId !== input.sessionId) continue
        if (input.since !== undefined && record.timestamp < input.since) continue
        verdictRecords.push(record)
      } catch {
        // skip
      }
    }

    verdictRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    base.verdicts = verdictRecords
  }

  return base
}
