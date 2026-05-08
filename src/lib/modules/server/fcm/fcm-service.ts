import type { NotificationPayload } from '$lib/types';

import admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function isFCMConfigured(): boolean {
  return !!(
    process.env.FCM_PROJECT_ID &&
    process.env.FCM_CLIENT_EMAIL &&
    process.env.FCM_PRIVATE_KEY
  );
}

export async function sendFCMNotification(
  deviceToken: string,
  payload: NotificationPayload
): Promise<{ error?: string; messageId?: string; success: boolean }> {
  try {
    const fcmApp = getApp();

    // Use DATA-ONLY messages (not notification messages)
    // This is critical: notification messages are auto-displayed by Android
    // and cannot have custom action buttons. Data messages always reach
    // onMessageReceived() giving the app full control.
    const message: admin.messaging.Message = {
      android: {
        priority: 'high', // Ensures delivery even in Doze mode
        ttl: 300000, // 5 minutes TTL (matches pending request expiry)
      },
      data: {
        body: payload.body || payload.message || '',
        category:
          payload.category ??
          (typeof payload.data?.category === 'string' ? payload.data.category : ''),
        project: typeof payload.data?.project === 'string' ? payload.data.project : '',
        requestId: typeof payload.data?.requestId === 'string' ? payload.data.requestId : '',
        source: typeof payload.data?.source === 'string' ? payload.data.source : '',
        subtitle: payload.subtitle ?? '',
        timestamp: new Date().toISOString(),
        title: payload.title,
        toolInput: payload.data?.toolInput ? JSON.stringify(payload.data.toolInput) : '',
        toolName: typeof payload.data?.toolName === 'string' ? payload.data.toolName : '',
        type: typeof payload.data?.type === 'string' ? payload.data.type : '',
      },
      token: deviceToken,
    };

    const messageId = await admin.messaging(fcmApp).send(message);
    return { messageId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[FCM] Send failed:', errorMessage);
    return { error: errorMessage, success: false };
  }
}

function getApp(): admin.app.App {
  if (!app) {
    const projectId = process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'FCM not configured: missing FCM_PROJECT_ID, FCM_CLIENT_EMAIL, or FCM_PRIVATE_KEY'
      );
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({ clientEmail, privateKey, projectId }),
    });
  }
  return app;
}
