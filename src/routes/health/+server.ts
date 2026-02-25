import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/config/env';

/**
 * GET /health — admin panel health check.
 * Verifies the app is running and the backend API is reachable.
 */
export const GET: RequestHandler = async () => {
  const start = Date.now();

  const checks: Record<string, { status: string; error?: string; responseTimeMs?: number }> = {
    app: { status: 'ok' },
    backend: { status: 'unknown' }
  };

  // Check backend API connectivity
  try {
    const backendUrl = env.backend.url;
    const backendStart = Date.now();
    const response = await fetch(`${backendUrl}/health/live`, {
      signal: AbortSignal.timeout(5000)
    });
    checks.backend = response.ok
      ? { status: 'ok', responseTimeMs: Date.now() - backendStart }
      : { status: 'error', error: `HTTP ${response.status}` };
  } catch (err) {
    checks.backend = { status: 'error', error: err instanceof Error ? err.message : 'Unreachable' };
  }

  const allOk = checks.backend.status === 'ok';

  return json({
    status: allOk ? 'healthy' : 'degraded',
    responseTimeMs: Date.now() - start,
    checks
  }, { status: allOk ? 200 : 503 });
};
