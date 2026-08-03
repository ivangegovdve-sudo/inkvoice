import { createServer, type Server as HttpServer } from 'node:http'
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { readingContextService } from '@/lib/services/readingContext/readingContext.service'
import { readingRangeRequestSchema } from '@/lib/services/readingContext/readingContext.types'
import { SETTINGS_KEYS } from '@/lib/services/settings/settings.keys'
import { settingsService } from '@/lib/services/settings/settings.service'
import { getReadingContextMcpPort, READING_CONTEXT_MCP_HOST } from './readingContextMcp.consts'

interface ReadingContextMcpState {
  server: HttpServer | null
  starting: Promise<boolean> | null
}

declare global {
  var readingContextMcpState: ReadingContextMcpState | undefined
}

const state = (globalThis.readingContextMcpState ??= { server: null, starting: null })

const toToolResult = (output: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
})

const createReadingContextMcpServer = () => {
  const server = new McpServer({
    name: 'inkvoice-reading-context',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
  })

  server.registerTool(
    'get_reading_context',
    {
      title: 'Get live reading context',
      description:
        'Get the book currently open in InkVoice, the current playback paragraph, and the current text selection.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await readingContextService.getSnapshot()),
  )

  server.registerTool(
    'read_paragraph_range',
    {
      title: 'Read a bounded paragraph range',
      description:
        'Read an inclusive paragraph range from one chapter. InkVoice always caps the result at the live reading pointer.',
      inputSchema: readingRangeRequestSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async request => {
      try {
        return toToolResult(await readingContextService.readRange(request))
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: error instanceof Error ? error.message : 'Unable to read the requested range',
            },
          ],
          isError: true,
        }
      }
    },
  )

  return server
}

const fetchHandler = createMcpHandler(createReadingContextMcpServer)
const nodeHandler = toNodeHandler(fetchHandler)
const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

const start = (): Promise<boolean> => {
  if (state.server?.listening) return Promise.resolve(true)
  if (state.starting) return state.starting

  const starting = new Promise<boolean>(resolve => {
    const port = getReadingContextMcpPort()
    const server = createServer(async (request, response) => {
      if (!validateHost(request, response) || !validateOrigin(request, response)) return

      const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname

      if (pathname !== '/mcp') {
        response.writeHead(404).end()
        return
      }

      try {
        await nodeHandler(request, response)
      } catch (error) {
        console.error('[reading-context] MCP request failed:', error)
        if (!response.headersSent) response.writeHead(500).end()
      }
    })

    server.once('error', error => {
      console.warn(`[reading-context] MCP endpoint unavailable on port ${port}:`, error)
      state.server = null
      resolve(false)
    })
    server.listen(port, READING_CONTEXT_MCP_HOST, () => {
      state.server = server
      resolve(true)
    })
  }).finally(() => {
    if (state.starting === starting) state.starting = null
  })

  state.starting = starting
  return starting
}

const stop = async (): Promise<void> => {
  const server = state.server

  state.server = null
  if (!server) return

  await new Promise<void>(resolve => server.close(() => resolve()))
}

const setEnabled = async (enabled: boolean): Promise<boolean> => {
  if (!enabled) {
    await stop()
    return false
  }

  return start()
}

const initialize = async (): Promise<void> => {
  const enabled = await settingsService.get(SETTINGS_KEYS.READING_CONTEXT_MCP_ENABLED)

  if (enabled === true) await start()
}

export const readingContextMcpService = { initialize, setEnabled }
