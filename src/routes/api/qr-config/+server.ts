import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';
import QRCode from 'qrcode';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const authError = validateAuth(request);
	if (authError) {
		return authError;
	}

	const apiKey = env.API_KEY?.trim();
	if (!apiKey) {
		return json({ error: 'API_KEY not configured on server' }, { status: 500 });
	}

	// Derive the server URL from the incoming request's Host header so the QR
	// code always points to the right address (works behind tunnels, proxies, etc.)
	const proto = request.headers.get('x-forwarded-proto') || 'http';
	const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
	const serverUrl = `${proto}://${host}`;

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
		const err = error as Error;
		console.error('[qr-config] QR generation failed:', err.message);
		return json({ error: 'Failed to generate QR code' }, { status: 500 });
	}
};
