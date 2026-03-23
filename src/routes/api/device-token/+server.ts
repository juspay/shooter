import { env } from '$env/dynamic/private';
import { validateAuth } from '$lib/modules/server/auth';
import { json } from '@sveltejs/kit';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RequestHandler } from './$types';

interface DeviceTokens {
	android?: string;
	ios?: string;
}

interface DeviceTokenRequest {
	bundleId?: string;
	deviceToken?: string;
	platform: string;
	token?: string;
}

const TOKENS_DIR = join(homedir(), '.shooter');
const TOKENS_FILE = join(TOKENS_DIR, 'device-tokens.json');

function readTokens(): DeviceTokens {
	try {
		if (existsSync(TOKENS_FILE)) {
			return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
		}
	} catch {
		// Corrupt file — start fresh
	}
	return {};
}

function writeTokens(tokens: DeviceTokens): void {
	if (!existsSync(TOKENS_DIR)) {
		mkdirSync(TOKENS_DIR, { recursive: true });
	}
	writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
}

export const POST: RequestHandler = async ({ request }) => {
	const authError = validateAuth(request);
	if (authError) return authError;

	let body: DeviceTokenRequest;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const platform = body.platform;
	if (!platform || (platform !== 'ios' && platform !== 'android')) {
		return json(
			{ error: 'Missing or invalid platform (must be "ios" or "android")' },
			{ status: 400 },
		);
	}

	// iOS sends "deviceToken", Android sends "token"
	const token = body.deviceToken || body.token;
	if (!token || typeof token !== 'string' || token.trim().length === 0) {
		return json({ error: 'Missing device token (deviceToken or token)' }, { status: 400 });
	}

	// Persist to ~/.shooter/device-tokens.json
	const tokens = readTokens();
	tokens[platform] = token;
	writeTokens(tokens);

	// Update in-memory env so APNs can use it immediately (iOS is the primary APNs target)
	if (platform === 'ios') {
		(env as Record<string, string>).DEVICE_TOKEN = token;
	}

	console.log(`[device-token] Registered ${platform} token (length: ${token.length})`);

	return json({
		platform,
		success: true,
		timestamp: new Date().toISOString(),
	});
};
