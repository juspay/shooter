import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  // NOTE: Authentication has been removed from this application
  // Load integration statuses and configurations
  return {
    integrations: {
      claude: {
        enabled: true,
        status: 'connected',
        lastActivity: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
        hooksConfigured: 5,
        successRate: 98.5
      },
      github: {
        enabled: false,
        status: 'disconnected',
        lastActivity: null,
        webhooksCount: 0,
        successRate: 0
      },
      vercel: {
        enabled: true,
        status: 'connected',
        lastActivity: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        deploymentsTracked: 12,
        successRate: 100
      },
      webhooks: {
        totalConfigured: 3,
        activeEndpoints: 2,
        requestsToday: 247,
        averageResponseTime: 145
      }
    },
    integrationConfig: {
      maxWebhooks: 10,
      retryAttempts: 3,
      timeoutMs: 30000,
      allowedDomains: [
        'api.github.com',
        'hooks.slack.com',
        'discord.com'
      ]
    }
  };
};