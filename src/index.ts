#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { ScopeDefinition } from '@reshimu/aryeh'
import { runInterceptLogged } from './intercept.js'
import { readSession, writeSession, writeBeiur } from './store.js'
import { sessionReport } from './tools/session-report.js'
import { auditQuery } from './tools/audit-query.js'
import { classifyAction } from './tools/classify-action.js'

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'atzmutos', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'atzmutos_register_session',
      description:
        'Register a new agent session with Atzmut OS. Returns a sessionId used in all subsequent calls.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Identifier for the agent instance.' },
          covenant: {
            type: 'object',
            description: 'Scope covenant: allowedTools, deniedTools, allowedDomains, deniedDomains, allowedActions, deniedActions, allowedResources, deniedResources, strictMode.',
          },
          metadata: { type: 'object', description: 'Optional key-value metadata.' },
        },
        required: ['agentId'],
      },
    },
    {
      name: 'atzmutos_intercept',
      description:
        'Run an action through all four Chayyot (NESHER + SHOR + ARYEH + PANIM ADAM) and return a unified ChayyotVerdict.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Active session ID.' },
          action: { type: 'string', description: 'Verb describing the action (e.g. "delete", "send_email").' },
          tool: { type: 'string', description: 'Tool name invoking the action. When provided, passed as StructuredAction to ARYEH so deniedTools rules are evaluated.' },
          target: { type: 'string', description: 'Object of the action (e.g. "user_records").' },
          output: { type: 'string', description: 'Agent output text to ground-check via SHOR. Must be paired with context.' },
          context: { type: 'string', description: 'Source context for SHOR grounding.' },
          environment: {
            type: 'string',
            enum: ['production', 'staging', 'development', 'test'],
            description: 'Execution environment. "production" elevates NESHER risk.',
          },
          scope: {
            type: 'object',
            description: 'Override scope for ARYEH. If omitted, uses the covenant from register_session.',
          },
          metadata: { type: 'object', description: 'Extra context forwarded to NESHER.' },
        },
        required: ['sessionId', 'action'],
      },
    },
    {
      name: 'atzmutos_classify_action',
      description:
        'Stateless preview classification through NESHER + SHOR (if output+context) + ARYEH (if covenantScope). No session write, no Beiur filed.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Verb describing the action.' },
          tool: { type: 'string', description: 'Tool name. When provided with covenantScope, passed as StructuredAction to ARYEH.' },
          output: { type: 'string', description: 'Agent output text for SHOR grounding. Requires context.' },
          context: { type: 'string', description: 'Source context for SHOR grounding.' },
          covenantScope: { type: 'object', description: 'ScopeDefinition for ARYEH evaluation.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'atzmutos_file_beiur',
      description:
        'Record a Beiur (clarification) for a flagged intercept verdict. Stored to data/beiur/ as JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', description: 'The actionId from a prior ChayyotVerdict.' },
          sessionId: { type: 'string' },
          beiur: { type: 'string', description: 'Human or supervisor clarification text.' },
          override: {
            type: 'string',
            enum: ['ALLOW', 'BLOCK'],
            description: 'Optional explicit override of the original verdict.',
          },
        },
        required: ['actionId', 'sessionId', 'beiur'],
      },
    },
    {
      name: 'atzmutos_get_covenant',
      description: 'Retrieve the scope covenant registered for a session.',
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
      description:
        'Return the session record and all associated Beiur filings for a given sessionId.',
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
      description: 'Query the Beiur audit log. Requires at least sessionId or actionId.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Filter by session.' },
          actionId: { type: 'string', description: 'Filter by action.' },
          decision: {
            type: 'string',
            enum: ['ALLOW', 'BLOCK'],
            description: 'Filter by beiur override value.',
          },
          since: {
            type: 'string',
            description: 'ISO 8601 timestamp. Only return records filed at or after this time.',
          },
          limit: { type: 'number', description: 'Max records to return. Default 50, max 200.' },
          verdicts: {
            type: 'boolean',
            description: 'When true and sessionId is provided, include VerdictRecords for the session alongside Beiur results.',
          },
        },
      },
    },
  ],
}))

// ─── Tool Handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  switch (name) {
    case 'atzmutos_register_session': {
      const sessionId = `session_${Date.now()}`
      await writeSession({
        sessionId,
        agentId: String(a.agentId ?? ''),
        covenant: (a.covenant as Record<string, unknown> | null) ?? null,
        metadata: (a.metadata as Record<string, unknown>) ?? {},
        createdAt: new Date().toISOString(),
      })
      return ok({ sessionId, status: 'registered' })
    }

    case 'atzmutos_intercept': {
      const sessionId = String(a.sessionId ?? '')
      const actionId = `action_${Date.now()}`

      // Resolve scope: inline override takes precedence, then session covenant
      let scope = (a.scope as ScopeDefinition | undefined) ?? undefined
      if (scope === undefined) {
        const session = await readSession(sessionId)
        scope = session?.covenant ?? undefined
      }

      const verdict = await runInterceptLogged(
        {
          sessionId,
          action: String(a.action ?? ''),
          tool: a.tool !== undefined ? String(a.tool) : undefined,
          target: a.target !== undefined ? String(a.target) : undefined,
          output: a.output !== undefined ? String(a.output) : undefined,
          context: a.context !== undefined ? String(a.context) : undefined,
          environment: a.environment !== undefined ? String(a.environment) : undefined,
          scope,
          metadata: (a.metadata as Record<string, unknown>) ?? {},
        },
        actionId,
      )

      return ok(verdict)
    }

    case 'atzmutos_classify_action': {
      const result = classifyAction({
        action: String(a.action ?? ''),
        tool: a.tool !== undefined ? String(a.tool) : undefined,
        output: a.output !== undefined ? String(a.output) : undefined,
        context: a.context !== undefined ? String(a.context) : undefined,
        covenantScope: a.covenantScope as ScopeDefinition | undefined,
      })
      return ok(result)
    }

    case 'atzmutos_file_beiur': {
      const actionId = String(a.actionId ?? '')
      const sessionId = String(a.sessionId ?? '')
      const beiurText = String(a.beiur ?? '')
      const rawOverride = a.override as string | undefined
      const override =
        rawOverride === 'ALLOW' || rawOverride === 'BLOCK' ? rawOverride : null

      if (!actionId || !sessionId || !beiurText) {
        return ok({ error: 'actionId, sessionId, and beiur are required' })
      }

      const beiurId = `beiur_${Date.now()}`
      await writeBeiur({
        beiurId,
        actionId,
        sessionId,
        beiur: beiurText,
        override,
        filedAt: new Date().toISOString(),
      })

      return ok({ beiurId, actionId, override, status: 'filed' })
    }

    case 'atzmutos_get_covenant': {
      const session = await readSession(String(a.sessionId ?? ''))
      if (!session) return ok({ error: 'session not found', covenant: null })
      return ok({ covenant: session.covenant })
    }

    case 'atzmutos_session_report': {
      const result = await sessionReport(String(a.sessionId ?? ''))
      return ok(result)
    }

    case 'atzmutos_audit_query': {
      const result = await auditQuery({
        sessionId: a.sessionId !== undefined ? String(a.sessionId) : undefined,
        actionId: a.actionId !== undefined ? String(a.actionId) : undefined,
        decision: a.decision !== undefined ? String(a.decision) : undefined,
        since: a.since !== undefined ? String(a.since) : undefined,
        limit: typeof a.limit === 'number' ? a.limit : undefined,
        verdicts: a.verdicts === true,
      })
      return ok(result)
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('atzmutos boot error:', err)
  process.exit(1)
})
