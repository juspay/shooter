import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Claude Code webhook interface
interface ClaudeWebhookPayload {
  type: 'tool_call' | 'user_prompt' | 'session_start' | 'session_end' | 'error';
  timestamp: string;
  sessionId: string;
  userId?: string;
  data: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    prompt?: string;
    errorMessage?: string;
    duration?: number;
    success?: boolean;
    context?: {
      workingDirectory: string;
      fileCount: number;
      projectName?: string;
    };
  };
  metadata: {
    version: string;
    environment: 'development' | 'production';
    userAgent: string;
  };
}

interface ClaudeHookResponse {
  success: boolean;
  message: string;
  notificationSent?: boolean;
  processingTime: number;
  timestamp: string;
}

// Mock storage for webhook events (in production, use database)
const recentEvents: ClaudeWebhookPayload[] = [];

export const POST: RequestHandler = async ({ request, url }) => {
  const startTime = Date.now();
  
  try {
    // Validate authentication
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CLAUDE_WEBHOOK_TOKEN || 'dev-token-claude-hooks';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json(
        { 
          success: false, 
          error: 'Missing or invalid authorization header',
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    if (token !== expectedToken) {
      return json(
        { 
          success: false, 
          error: 'Invalid authentication token',
          timestamp: new Date().toISOString()
        },
        { status: 403 }
      );
    }

    // Parse webhook payload
    const payload: ClaudeWebhookPayload = await request.json();

    // Validate required fields
    if (!payload.type || !payload.timestamp || !payload.sessionId) {
      return json(
        {
          success: false,
          error: 'Missing required fields: type, timestamp, sessionId',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Store event (add to recent events, keep last 100)
    recentEvents.unshift(payload);
    if (recentEvents.length > 100) {
      recentEvents.splice(100);
    }

    // Process the webhook based on type
    let notificationSent = false;
    let shouldSendNotification = false;
    let notificationTitle = '';
    let notificationBody = '';

    switch (payload.type) {
      case 'tool_call':
        if (payload.data.toolName === 'Bash' || payload.data.toolName === 'Write' || payload.data.toolName === 'Edit') {
          shouldSendNotification = true;
          notificationTitle = `🛠️ ${payload.data.toolName} executed`;
          notificationBody = `Used ${payload.data.toolName} tool in project ${payload.data.context?.projectName || 'Unknown'}`;
        }
        break;

      case 'user_prompt':
        if (payload.data.prompt && payload.data.prompt.length > 50) {
          shouldSendNotification = true;
          notificationTitle = '💬 New complex prompt';
          notificationBody = `${payload.data.prompt.substring(0, 80)}...`;
        }
        break;

      case 'session_start':
        shouldSendNotification = true;
        notificationTitle = '🚀 Claude Code session started';
        notificationBody = `Working in ${payload.data.context?.workingDirectory || 'unknown directory'}`;
        break;

      case 'session_end':
        if (payload.data.duration && payload.data.duration > 300000) { // 5 minutes
          shouldSendNotification = true;
          notificationTitle = '⏰ Long session ended';
          notificationBody = `Session lasted ${Math.round(payload.data.duration / 60000)} minutes`;
        }
        break;

      case 'error':
        shouldSendNotification = true;
        notificationTitle = '⚠️ Claude Code error';
        notificationBody = payload.data.errorMessage || 'An error occurred';
        break;
    }

    // Send notification if needed
    if (shouldSendNotification) {
      try {
        const notifyResponse = await fetch(`${url.origin}/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${expectedToken}`
          },
          body: JSON.stringify({
            title: notificationTitle,
            body: notificationBody,
            category: payload.type === 'error' ? 'system' : 'debug',
            data: {
              source: 'claude-webhook',
              sessionId: payload.sessionId,
              type: payload.type
            }
          })
        });

        notificationSent = notifyResponse.ok;
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }
    }

    const processingTime = Date.now() - startTime;

    const response: ClaudeHookResponse = {
      success: true,
      message: `Claude webhook processed successfully`,
      notificationSent,
      processingTime,
      timestamp: new Date().toISOString()
    };

    // Log successful webhook processing
    console.log(`Claude webhook processed: ${payload.type} in ${processingTime}ms`);

    return json(response, { status: 200 });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Claude webhook error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};

// GET endpoint for webhook status and recent events
export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const type = url.searchParams.get('type');

    let filteredEvents = recentEvents;
    if (type) {
      filteredEvents = recentEvents.filter(event => event.type === type);
    }

    const limitedEvents = filteredEvents.slice(0, Math.min(limit, 50));

    return json({
      success: true,
      stats: {
        totalEvents: recentEvents.length,
        eventTypes: {
          tool_call: recentEvents.filter(e => e.type === 'tool_call').length,
          user_prompt: recentEvents.filter(e => e.type === 'user_prompt').length,
          session_start: recentEvents.filter(e => e.type === 'session_start').length,
          session_end: recentEvents.filter(e => e.type === 'session_end').length,
          error: recentEvents.filter(e => e.type === 'error').length
        },
        lastEventTime: recentEvents[0]?.timestamp || null
      },
      events: limitedEvents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
};
