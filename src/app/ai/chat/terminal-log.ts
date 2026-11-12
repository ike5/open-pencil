import { IS_TAURI } from '@open-pencil/core/constants'

type Level = 'log' | 'warn' | 'error'

let invokePromise: Promise<(level: string, message: string) => void> | null = null

function getInvoker() {
  if (!IS_TAURI) return null
  if (!invokePromise) {
    invokePromise = import('@tauri-apps/api/core').then(({ invoke }) => {
      return (level: string, message: string) => {
        invoke('log_to_terminal', { level, message }).catch(() => {})
      }
    })
  }
  return invokePromise
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? '\n' + a.stack : ''}`
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

function emit(level: Level, args: unknown[]) {
  console[level](...args)
  const invoker = getInvoker()
  if (!invoker) return
  const msg = format(args)
  invoker.then((fn) => fn(level, msg)).catch(() => {})
}

export const terminalLog = {
  log: (...args: unknown[]) => emit('log', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args)
}
