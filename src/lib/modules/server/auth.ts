import { env } from '$env/dynamic/private';
import { timingSafeEqual } from 'crypto';

/**
 * Validate Bearer token authentication against the API_KEY environment variable.
 * Returns a 401 Response if auth fails, or null if auth passed.
 */
export function validateAuth(request: Request): null | Response {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  const token = auth.slice(7);
  const expectedKey = env.API_KEY?.trim();
  if (!expectedKey) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  // Timing-safe comparison to prevent timing attacks on the API key.
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedKey);
  if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  return null; // auth passed
}
