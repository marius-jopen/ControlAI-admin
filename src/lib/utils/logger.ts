/**
 * Lightweight structured logger for the admin panel.
 *
 * In production builds (`import.meta.env.PROD`), debug-level logs are suppressed.
 * All log methods accept an optional leading context object for structured data.
 *
 * Usage:
 *   import { createLogger } from '$lib/utils/logger';
 *   const log = createLogger('apps');
 *
 *   log.info('Apps loaded');
 *   log.debug({ count: 5 }, 'Fetched apps');
 *   log.error({ err }, 'Failed to load');
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD;
const minLevel: LogLevel = isProd ? 'info' : 'debug';

interface Logger {
  debug: (ctxOrMsg: unknown, msg?: string) => void;
  info: (ctxOrMsg: unknown, msg?: string) => void;
  warn: (ctxOrMsg: unknown, msg?: string) => void;
  error: (ctxOrMsg: unknown, msg?: string) => void;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatArgs(module: string, level: LogLevel, ctxOrMsg: unknown, msg?: string): unknown[] {
  const prefix = `[${module}]`;

  if (msg !== undefined && typeof ctxOrMsg === 'object' && ctxOrMsg !== null) {
    return [prefix, msg, ctxOrMsg];
  }
  return [prefix, ctxOrMsg];
}

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

export function createLogger(module: string): Logger {
  function emit(level: LogLevel, ctxOrMsg: unknown, msg?: string) {
    if (!shouldLog(level)) return;
    consoleMethods[level](...formatArgs(module, level, ctxOrMsg, msg));
  }

  return {
    debug: (ctxOrMsg, msg?) => emit('debug', ctxOrMsg, msg),
    info: (ctxOrMsg, msg?) => emit('info', ctxOrMsg, msg),
    warn: (ctxOrMsg, msg?) => emit('warn', ctxOrMsg, msg),
    error: (ctxOrMsg, msg?) => emit('error', ctxOrMsg, msg)
  };
}
