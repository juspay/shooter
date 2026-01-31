import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac } from 'node:crypto';

// GitHub webhook payload interfaces
interface GitHubWebhookPayload {
  action?: string;
  repository?: {
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
  };
  sender?: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    state: 'open' | 'closed';
    merged: boolean;
    user: {
      login: string;
    };
  };
  commits?: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    url: string;
  }>;
  issue?: {
    number: number;
    title: string;
    html_url: string;
    state: 'open' | 'closed';
    user: {
      login: string;
    };
  };
  deployment?: {
    id: number;
    environment: string;
    description: string;
    created_at: string;
  };
  workflow_run?: {
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: 'success' | 'failure' | 'cancelled' | 'neutral';
    html_url: string;
  };
}

// Mock storage for webhook events
const recentEvents: Array<{
  id: string;
  event: string;
  payload: GitHubWebhookPayload;
  timestamp: string;
  processed: boolean;
}> = [];

function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const receivedSignature = signature.substring(7); // Remove 'sha256=' prefix
  
  return receivedSignature === expectedSignature;
}

export const POST: RequestHandler = async ({ request, url }) => {
  const startTime = Date.now();

  try {
    const body = await request.text();
    const payload: GitHubWebhookPayload = JSON.parse(body);

    // Get GitHub webhook headers
    const githubEvent = request.headers.get('x-github-event');
    const githubSignature = request.headers.get('x-hub-signature-256');
    const githubDelivery = request.headers.get('x-github-delivery');

    if (!githubEvent || !githubDelivery) {
      return json(
        {
          success: false,
          error: 'Missing required GitHub webhook headers',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Verify webhook signature (in production)
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && githubSignature) {
      if (!verifyGitHubSignature(body, githubSignature, webhookSecret)) {
        return json(
          {
            success: false,
            error: 'Invalid webhook signature',
            timestamp: new Date().toISOString()
          },
          { status: 403 }
        );
      }
    }

    // Store the event
    const eventRecord = {
      id: githubDelivery,
      event: githubEvent,
      payload,
      timestamp: new Date().toISOString(),
      processed: false
    };

    recentEvents.unshift(eventRecord);
    if (recentEvents.length > 100) {
      recentEvents.splice(100);
    }

    // Process webhook based on event type
    let shouldSendNotification = false;
    let notificationTitle = '';
    let notificationBody = '';
    let notificationCategory = 'system';

    switch (githubEvent) {
      case 'push':
        if (payload.commits && payload.commits.length > 0) {
          shouldSendNotification = true;
          notificationTitle = `📝 New push to ${payload.repository?.name}`;
          notificationBody = `${payload.commits.length} commit(s) by ${payload.sender?.login}`;
          notificationCategory = 'feature';
        }
        break;

      case 'pull_request':
        if (payload.action === 'opened') {
          shouldSendNotification = true;
          notificationTitle = `🔄 PR opened: ${payload.repository?.name}`;
          notificationBody = `"${payload.pull_request?.title}" by ${payload.pull_request?.user.login}`;
          notificationCategory = 'feature';
        } else if (payload.action === 'closed' && payload.pull_request?.merged) {
          shouldSendNotification = true;
          notificationTitle = `✅ PR merged: ${payload.repository?.name}`;
          notificationBody = `"${payload.pull_request?.title}" was merged`;
          notificationCategory = 'feature';
        }
        break;

      case 'issues':
        if (payload.action === 'opened') {
          shouldSendNotification = true;
          notificationTitle = `🐛 New issue: ${payload.repository?.name}`;
          notificationBody = `"${payload.issue?.title}" by ${payload.issue?.user.login}`;
          notificationCategory = 'debug';
        }
        break;

      case 'workflow_run':
        if (payload.workflow_run?.status === 'completed') {
          const success = payload.workflow_run.conclusion === 'success';
          shouldSendNotification = true;
          notificationTitle = `${success ? '✅' : '❌'} Workflow ${success ? 'passed' : 'failed'}`;
          notificationBody = `${payload.workflow_run.name} in ${payload.repository?.name}`;
          notificationCategory = success ? 'system' : 'debug';
        }
        break;

      case 'deployment':
        shouldSendNotification = true;
        notificationTitle = `🚀 Deployment to ${payload.deployment?.environment}`;
        notificationBody = `${payload.repository?.name}: ${payload.deployment?.description}`;
        notificationCategory = 'system';
        break;

      case 'release':
        if (payload.action === 'published') {
          shouldSendNotification = true;
          notificationTitle = `🎉 Release published: ${payload.repository?.name}`;
          notificationBody = `New release available`;
          notificationCategory = 'feature';
        }
        break;
    }

    // Send notification if needed
    let notificationSent = false;
    if (shouldSendNotification) {
      try {
        const authToken = process.env.GITHUB_WEBHOOK_TOKEN || 'dev-token-github-hooks';
        const notifyResponse = await fetch(`${url.origin}/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            title: notificationTitle,
            body: notificationBody,
            category: notificationCategory,
            data: {
              source: 'github-webhook',
              repository: payload.repository?.full_name,
              event: githubEvent,
              action: payload.action,
              url: payload.repository?.html_url
            }
          })
        });

        notificationSent = notifyResponse.ok;
      } catch (notifyError) {
        console.error('Failed to send GitHub notification:', notifyError);
      }
    }

    // Mark event as processed
    eventRecord.processed = true;

    const processingTime = Date.now() - startTime;

    console.log(`GitHub webhook processed: ${githubEvent}/${payload.action} in ${processingTime}ms`);

    return json({
      success: true,
      message: `GitHub ${githubEvent} webhook processed successfully`,
      event: githubEvent,
      action: payload.action,
      repository: payload.repository?.name,
      notificationSent,
      processingTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('GitHub webhook error:', error);

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
    const event = url.searchParams.get('event');

    let filteredEvents = recentEvents;
    if (event) {
      filteredEvents = recentEvents.filter(e => e.event === event);
    }

    const limitedEvents = filteredEvents.slice(0, Math.min(limit, 50));

    // Calculate stats
    const eventTypes: Record<string, number> = {};
    recentEvents.forEach(e => {
      eventTypes[e.event] = (eventTypes[e.event] || 0) + 1;
    });

    return json({
      success: true,
      stats: {
        totalEvents: recentEvents.length,
        processedEvents: recentEvents.filter(e => e.processed).length,
        eventTypes,
        lastEventTime: recentEvents[0]?.timestamp || null,
        uniqueRepositories: [...new Set(recentEvents.map(e => e.payload.repository?.name).filter(Boolean))].length
      },
      events: limitedEvents.map(e => ({
        id: e.id,
        event: e.event,
        action: e.payload.action,
        repository: e.payload.repository?.name,
        sender: e.payload.sender?.login,
        timestamp: e.timestamp,
        processed: e.processed
      })),
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
