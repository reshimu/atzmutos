import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScopeDefinition } from '@reshimu/aryeh'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const SESSIONS_DIR = join(__dirname, '..', 'data', 'sessions')
export const BEIUR_DIR = join(__dirname, '..', 'data', 'beiur')
export const VERDICTS_DIR = join(__dirname, '..', 'data', 'verdicts')

export interface SessionRecord {
  sessionId: string
  agentId: string
  covenant: ScopeDefinition | null
  metadata: Record<string, unknown>
  createdAt: string
}

export async function readSession(sessionId: string): Promise<SessionRecord | null> {
  try {
    const raw = await readFile(join(SESSIONS_DIR, `${sessionId}.json`), 'utf8')
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

export async function writeSession(record: SessionRecord): Promise<void> {
  await writeFile(
    join(SESSIONS_DIR, `${record.sessionId}.json`),
    JSON.stringify(record, null, 2),
    'utf8',
  )
}

// ─── Beiur ────────────────────────────────────────────────────────────────────

export interface BeiurRecord {
  beiurId: string
  actionId: string
  sessionId: string
  beiur: string
  override: 'ALLOW' | 'BLOCK' | null
  filedAt: string
}

export async function writeBeiur(record: BeiurRecord): Promise<void> {
  await writeFile(
    join(BEIUR_DIR, `${record.beiurId}.json`),
    JSON.stringify(record, null, 2),
    'utf8',
  )
}

export async function readBeiur(beiurId: string): Promise<BeiurRecord | null> {
  try {
    const raw = await readFile(join(BEIUR_DIR, `${beiurId}.json`), 'utf8')
    return JSON.parse(raw) as BeiurRecord
  } catch {
    return null
  }
}

// ─── Verdicts ─────────────────────────────────────────────────────────────────

export interface VerdictRecord {
  verdictId: string
  sessionId: string
  actionId: string
  action: string
  decision: string
  reasoning: string
  reasons: string[]
  nesherLevel: string
  shorLevel: string | null
  aryehLevel: string | null
  beiurFiled: boolean
  beiurId: string | null
  timestamp: string
}

export async function writeVerdict(record: VerdictRecord): Promise<void> {
  await writeFile(
    join(VERDICTS_DIR, `${record.verdictId}.json`),
    JSON.stringify(record, null, 2),
    'utf8',
  )
}

export async function readVerdictsBySession(sessionId: string): Promise<VerdictRecord[]> {
  let entries: string[] = []
  try {
    entries = await readdir(VERDICTS_DIR)
  } catch {
    return []
  }
  const records: VerdictRecord[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const raw = await readFile(join(VERDICTS_DIR, entry), 'utf8')
      const record = JSON.parse(raw) as VerdictRecord
      if (record.sessionId === sessionId) {
        records.push(record)
      }
    } catch {
      // skip unreadable/malformed files
    }
  }
  return records
}
