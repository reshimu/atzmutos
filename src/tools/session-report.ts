// DECISION: We scan data/beiur/*.json at call time rather than maintaining an
// index because beiur volume per session is expected to be low (hundreds, not
// millions). A full glob+parse is cheap enough and avoids index drift bugs.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readSession, readVerdictsBySession, BEIUR_DIR } from '../store.js'
import type { BeiurRecord, VerdictRecord } from '../store.js'

export interface SessionReportResult {
  session: import('../store.js').SessionRecord
  // # DECISION: full verdict array vs. summary table — returning the full
  // VerdictRecord[] array preserves all classifier detail for replay and
  // forensics. A summary table (decision counts, timeline) is a natural next
  // step for sessions with high intercept volume but is deferred until there
  // is a concrete caller need.
  interceptCount: number
  verdicts: VerdictRecord[]
  beiurCount: number
  beiurs: BeiurRecord[]
}

export interface SessionReportError {
  error: string
}

export async function sessionReport(
  sessionId: string,
): Promise<SessionReportResult | SessionReportError> {
  const session = await readSession(sessionId)
  if (!session) {
    return { error: `session not found: ${sessionId}` }
  }

  // Scan all beiur files and collect those belonging to this session
  let entries: string[] = []
  try {
    entries = await readdir(BEIUR_DIR)
  } catch {
    // Directory may not exist yet — treat as empty
    entries = []
  }

  const beiurs: BeiurRecord[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const raw = await readFile(join(BEIUR_DIR, entry), 'utf8')
      const record = JSON.parse(raw) as BeiurRecord
      if (record.sessionId === sessionId) {
        beiurs.push(record)
      }
    } catch {
      // Skip unreadable/malformed files
    }
  }

  const verdicts = await readVerdictsBySession(sessionId)
  // Sort ascending by timestamp (earliest first — chronological replay)
  verdicts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return {
    session,
    interceptCount: verdicts.length,
    verdicts,
    beiurCount: beiurs.length,
    beiurs,
  }
}
