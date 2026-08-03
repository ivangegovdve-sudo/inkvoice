import { ChildProcess, spawn, spawnSync } from 'child_process'
import path from 'path'
import { startControlServer, type ControlServer } from './controlServer'
import { paths } from './paths'
import { findAvailablePort, Ports } from './ports'
import { createPythonLifecycle, PythonLifecycle } from './pythonLifecycle'

const LOCALHOST = '127.0.0.1'
const HEALTH_POLL_INTERVAL_MS = 2_000
const STARTUP_TIMEOUT_MS = 5 * 60 * 1_000 // 5 minutes
const SHUTDOWN_GRACE_MS = 60_000 // tolerate in-flight TTS generation
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1_000

type State = {
  nextJs: ChildProcess | null
  pythonLifecycle: PythonLifecycle | null
  controlServer: ControlServer | null
}

const state: State = { nextJs: null, pythonLifecycle: null, controlServer: null }

const extendedPath = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':')

const buildBaseEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  INKVOICE_RUNTIME: 'packaged',
  PATH: extendedPath,
  INKVOICE_BOOKS_DIR: paths.booksDir,
  INKVOICE_VOICES_DIR: paths.voicesDir,
  INKVOICE_CACHE_DIR: paths.cacheDir,
  INKVOICE_DB_PATH: paths.dbPath,
  INKVOICE_DEVICE: 'mps',
})

const pipeProcessLogs = (proc: ChildProcess, label: string): void => {
  proc.stdout?.on('data', (data: Buffer) => console.log(`[${label}] ${data.toString().trimEnd()}`))
  proc.stderr?.on('data', (data: Buffer) => console.log(`[${label}] ${data.toString().trimEnd()}`))
  proc.on('exit', code => console.log(`[${label}] Exited with code ${code}`))
}

const runMigrations = (env: NodeJS.ProcessEnv): void => {
  console.log('[servers] Running database migrations...')
  const result = spawnSync(
    paths.bundledPython,
    [paths.bundledMigrateScript, paths.dbPath, paths.bundledMigrations],
    { env, stdio: 'pipe', timeout: 30_000 },
  )

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || 'unknown error'
    throw new Error(`Migration failed: ${stderr}`)
  }
  console.log('[servers] Migrations complete.')
}

const spawnPython = (port: number, env: NodeJS.ProcessEnv): ChildProcess => {
  console.log(`[servers] Starting Python TTS on port ${port}...`)
  const proc = spawn(
    paths.bundledPython,
    ['-m', 'uvicorn', 'api.app.main:app', '--host', LOCALHOST, '--port', port.toString()],
    {
      env: { ...env, INKVOICE_PARENT_PID: process.pid.toString() },
      cwd: path.dirname(paths.bundledApi),
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  pipeProcessLogs(proc, 'python')
  return proc
}

const spawnNextJs = (env: NodeJS.ProcessEnv, port: number): ChildProcess => {
  console.log(`[servers] Starting Next.js on port ${port}...`)
  const proc = spawn(paths.bundledNode, [paths.nextJsServer], {
    env: { ...env, PORT: port.toString(), HOSTNAME: LOCALHOST },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  pipeProcessLogs(proc, 'nextjs')
  return proc
}

const pollHealthOnce = async (url: string, signal: AbortSignal): Promise<boolean> => {
  try {
    const res = await fetch(url, { signal })
    return res.ok
  } catch {
    return false
  }
}

const pollHealth = async (url: string, label: string, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3_000)
    try {
      const ok = await pollHealthOnce(url, controller.signal)
      if (ok) {
        console.log(`[servers] ${label} is ready.`)
        return true
      }
    } finally {
      clearTimeout(timeout)
    }
    await new Promise(r => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }
  return false
}

export type StartResult = { ok: true; appUrl: string } | { ok: false; error: string }

const getIdleTimeoutMs = (): number => {
  const raw = process.env.INKVOICE_PYTHON_IDLE_MS
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MS
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_TIMEOUT_MS
}

export const startServers = async (ports: Ports): Promise<StartResult> => {
  const baseEnv = buildBaseEnv()

  try {
    runMigrations(baseEnv)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Migration failed: ${message}` }
  }

  const lifecycle = createPythonLifecycle({
    spawn: port => spawnPython(port, baseEnv),
    findAvailablePort,
    pollHealth: pollHealthOnce,
    idleTimeoutMs: getIdleTimeoutMs(),
    shutdownGraceMs: SHUTDOWN_GRACE_MS,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    healthPollIntervalMs: HEALTH_POLL_INTERVAL_MS,
  })

  let controlServer: ControlServer
  try {
    controlServer = await startControlServer(lifecycle, ports.controlServer)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Control server failed: ${message}` }
  }

  const nextJsEnv = { ...baseEnv, INKVOICE_PYTHON_CONTROL_URL: controlServer.url }
  const nextJs = spawnNextJs(nextJsEnv, ports.nextJs)

  state.nextJs = nextJs
  state.pythonLifecycle = lifecycle
  state.controlServer = controlServer

  const nextReady = await pollHealth(
    `http://${LOCALHOST}:${ports.nextJs}`,
    'Next.js',
    STARTUP_TIMEOUT_MS,
  )
  if (!nextReady) {
    return { ok: false, error: 'Failed to start: Next.js server' }
  }

  return { ok: true, appUrl: `http://${LOCALHOST}:${ports.nextJs}` }
}

export const stopServers = (): void => {
  console.log('[servers] Shutting down...')

  if (state.pythonLifecycle) state.pythonLifecycle.forceStop()
  if (state.controlServer) state.controlServer.close()

  if (state.nextJs && state.nextJs.exitCode === null) {
    state.nextJs.kill('SIGTERM')
    const killTimer = setTimeout(() => {
      if (state.nextJs && state.nextJs.exitCode === null) {
        console.log('[servers] Force killing Next.js...')
        state.nextJs.kill('SIGKILL')
      }
    }, 5_000)
    killTimer.unref()
  }

  state.nextJs = null
  state.pythonLifecycle = null
  state.controlServer = null
}
