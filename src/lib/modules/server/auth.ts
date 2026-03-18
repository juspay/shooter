import { env } from '$env/dynamic/private';

/**
 * Validate Bearer token authentication against the API_KEY environment variable.
 * Returns a 401 Response if auth fails, or null if auth passed.
 */
export function validateAuth(request: Request): Response | null {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = auth.slice(7);
  const expectedKey = env.API_KEY?.trim();
  if (!expectedKey || token !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null; // auth passed
}
