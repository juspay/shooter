import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';
import { mkdirSync, writeFileSync } from 'fs';

import type { RequestHandler } from './$types';

// POST /api/terminals/[id]/paste-image — Write clipboard image for a terminal
export const POST: RequestHandler = async ({ params, request }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const terminalId = params.id;

  // Validate terminalId to prevent path traversal
  if (!/^[A-Za-z0-9_-]+$/.test(terminalId)) {
    return json({ error: 'Invalid terminal ID' }, { status: 400 });
  }

  let body: { image: string };
  try {
    body = (await request.json()) as { image: string };
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.image || typeof body.image !== 'string') {
    return json({ error: 'image (base64) is required' }, { status: 400 });
  }

  // Decode base64 image
  let imageBuffer: Buffer;
  try {
    // Strip data URI prefix if present
    const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');

    // Validate base64 encoding via round-trip check
    // Buffer.from silently ignores invalid chars, so verify re-encoding matches
    const decoded = Buffer.from(base64Data, 'base64');
    if (decoded.length === 0 || decoded.toString('base64') !== base64Data) {
      return json({ error: 'Invalid base64 image data' }, { status: 400 });
    }
    imageBuffer = decoded;
  } catch {
    return json({ error: 'Invalid base64 image data' }, { status: 400 });
  }

  // Write to per-terminal clipboard directory
  const clipboardDir = `/tmp/shooter-clipboard-${terminalId}`;
  const imagePath = `${clipboardDir}/image.png`;

  try {
    mkdirSync(clipboardDir, { recursive: true });
    writeFileSync(imagePath, imageBuffer);
  } catch (err) {
    console.error('[paste-image] Failed to write image:', toErrorMessage(err));
    return json({ error: 'Failed to write image' }, { status: 500 });
  }

  return json({ size: imageBuffer.length, success: true });
};
