#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { registerSession } from './tools/register-session.js'
import { intercept } from './tools/intercept.js'
import { classifyAction } from './tools/classify-action.js'
import { fileBeiur } from './tools/file-beiur.js'
import { getCovenant } from './tools/get-covenant.js'
import { sessionReport } from './tools/session-report.js'
import { auditQuery } from './tools/audit-query.js'

const server = new Server(
  { name: 'atzmutos', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'atzmutos_register_session',
      description: 'Register an agent session with a covenant defining intent, authorized tools, and scope.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          intent: { type: 'string' },
          authorizedTools: { type: 'array', items: { type: 'string' } },
          authorizedScope: { type: 'array', items: { type: 'string' } },
          expiresAt: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['agentId', 'intent', 'authorizedTools', 'authorizedScope'],
      },
    },
    {
      name: 'atzmutos_intercept',
      description: 'Classify a proposed agent action through all four Chayyot validators and return a governance decision.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          tool: { type: 'string' },
          input: { type: 'object' },
          outputSummary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
        required: ['sessionId', 'tool', 'input'],
      },
    },
    {
      name: 'atzmutos_classify_action',
      description: 'Classify an action in preview mode without requiring an active session. For testing and inspection.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string' },
          input: { type: 'object' },
          outputSummary: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
        required: ['tool', 'input'],
      },
    },
    {
      name: 'atzmutos_file_beiur',
      description: 'File a Beiur Report for manual human review of a gray-zone agent action.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          tool: { type: 'string' },
          input: { type: 'object' },
          reason: { type: 'string' },
          eventId: { type: 'string' },
        },
        required: ['sessionId', 'tool', 'input', 'reason'],
      },
    },
    {
      name: 'atzmutos_get_covenant',
      description: 'Retrieve the covenant for an active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'atzmutos_session_report',
      description: 'Get a structured report of all intercepts and Beiur Reports for a session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'atzmutos_audit_query',
      description: 'Query the audit log across sessions by time range, decision type, or tool name.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          decision: { type: 'string', enum: ['PASS', 'PASS_WITH_LOG', 'BLOCK', 'ESCALATE'] },
          tool: { type: 'string' },
          since: { type: 'string' },
          until: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }

  switch (name) {
    case 'atzmutos_register_session':
      return ok(await registerSession({
        agentId: String(a['agentId'] ?? ''),
        intent: String(a['intent'] ?? ''),
        authorizedTools: (a['authorizedTools'] as string[]) ?? [],
        authorizedScope: (a['authorizedScope'] as string[]) ?? [],
        expiresAt: a['expiresAt'] !== undefined ? String(a['expiresAt']) : undefined,
        metadata: a['metadata'] as Record<string, unknown> | undefined,
      }))

    case 'atzmutos_intercept':
      return ok(await intercept({
        sessionId: String(a['sessionId'] ?? ''),
        tool: String(a['tool'] ?? ''),
        input: (a['input'] as Record<string, unknown>) ?? {},
        outputSummary: a['outputSummary'] !== undefined ? String(a['outputSummary']) : undefined,
        sources: a['sources'] as string[] | undefined,
      }))

    case 'atzmutos_classify_action':
      return ok(await classifyAction({
        tool: String(a['tool'] ?? ''),
        input: (a['input'] as Record<string, unknown>) ?? {},
        outputSummary: a['outputSummary'] !== undefined ? String(a['outputSummary']) : undefined,
        sources: a['sources'] as string[] | undefined,
      }))

    case 'atzmutos_file_beiur':
      return ok(await fileBeiur({
        sessionId: String(a['sessionId'] ?? ''),
        tool: String(a['tool'] ?? ''),
        input: (a['input'] as Record<string, unknown>) ?? {},
        reason: String(a['reason'] ?? ''),
        eventId: a['eventId'] !== undefined ? String(a['eventId']) : undefined,
      }))

    case 'atzmutos_get_covenant':
      return ok(await getCovenant({ sessionId: String(a['sessionId'] ?? '') }))

    case 'atzmutos_session_report':
      return ok(await sessionReport({ sessionId: String(a['sessionId'] ?? '') }))

    case 'atzmutos_audit_query':
      return ok(await auditQuery({
        sessionId: a['sessionId'] !== undefined ? String(a['sessionId']) : undefined,
        decision: a['decision'] as 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE' | undefined,
        tool: a['tool'] !== undefined ? String(a['tool']) : undefined,
        since: a['since'] !== undefined ? String(a['since']) : undefined,
        until: a['until'] !== undefined ? String(a['until']) : undefined,
        limit: typeof a['limit'] === 'number' ? a['limit'] : undefined,
      }))

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('atzmutos boot error:', err)
  process.exit(1)
})
