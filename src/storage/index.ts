import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Covenant, InterceptEvent, BeiurReport, SessionStore, InterceptStore, BeiurStore } from './schema.js'

function getDataDir(): string {
  return process.env['ATZMUTOS_DATA_DIR'] ?? join(process.cwd(), 'data')
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  ensureDir(getDataDir())
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function readSessions(): SessionStore {
  return readJson(join(getDataDir(), 'sessions.json'), { sessions: {} })
}

export function writeSessions(store: SessionStore): void {
  writeJson(join(getDataDir(), 'sessions.json'), store)
}

export function readIntercepts(): InterceptStore {
  return readJson(join(getDataDir(), 'intercepts.json'), { events: [] })
}

export function writeIntercepts(store: InterceptStore): void {
  writeJson(join(getDataDir(), 'intercepts.json'), store)
}

export function readBeiurs(): BeiurStore {
  return readJson(join(getDataDir(), 'beiurs.json'), { reports: [] })
}

export function writeBeiurs(store: BeiurStore): void {
  writeJson(join(getDataDir(), 'beiurs.json'), store)
}

export function getSession(sessionId: string): Covenant | null {
  const store = readSessions()
  return store.sessions[sessionId] ?? null
}

export function saveSession(covenant: Covenant): void {
  const store = readSessions()
  store.sessions[covenant.sessionId] = covenant
  writeSessions(store)
}

export function appendIntercept(event: InterceptEvent): void {
  const store = readIntercepts()
  store.events.push(event)
  writeIntercepts(store)
}

export function appendBeiur(report: BeiurReport): void {
  const store = readBeiurs()
  store.reports.push(report)
  writeBeiurs(store)
}

export function getInterceptsBySession(sessionId: string): InterceptEvent[] {
  return readIntercepts().events.filter((e) => e.sessionId === sessionId)
}

export function getBeiursBySession(sessionId: string): BeiurReport[] {
  return readBeiurs().reports.filter((r) => r.sessionId === sessionId)
}

export function getBeiurById(reportId: string): BeiurReport | null {
  return readBeiurs().reports.find((r) => r.reportId === reportId) ?? null
}

export function updateBeiurStatus(reportId: string, update: Partial<BeiurReport>): void {
  const store = readBeiurs()
  const idx = store.reports.findIndex((r) => r.reportId === reportId)
  if (idx !== -1) {
    store.reports[idx] = { ...store.reports[idx]!, ...update }
    writeBeiurs(store)
  }
}
