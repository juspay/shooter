import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { toErrorMessage } from '$lib/modules/server/utils/error';
import { json } from '@sveltejs/kit';
import QRCode from 'qrcode';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = validateAuth(request);
  if (authError) {
    return authError;
  }

  const apiKey = env.API_KEY?.trim();
  if (!apiKey) {
    return json({ error: 'API_KEY not configured on server' }, { status: 500 });
  }

  // Use a configured server URL from env when available (trusted), otherwise
  // fall back to url.origin (derived from the incoming request URL by SvelteKit).
  const serverUrl = env.ORIGIN?.trim() || url.origin;

  const configPayload = JSON.stringify({ apiKey, serverUrl });

  try {
    const dataUrl = await QRCode.toDataURL(configPayload, {
      color: {
        dark: '#ededed',
        light: '#0a0a0a',
      },
      errorCorrectionLevel: 'M',
      margin: 2,
      type: 'image/png',
      width: 280,
    });

    return json({ dataUrl, serverUrl });
  } catch (error) {
    console.error('[qr-config] QR generation failed:', toErrorMessage(error));
    return json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
};
