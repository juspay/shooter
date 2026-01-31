import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Summary data interface for the analytics layout to consume
interface AnalyticsSummary {
  notifications: {
    enabled: boolean;
    totalEvents: number;
    todayEvents: number;
    successRate: number;
  };
  webhooks: {
    enabled: boolean;
    totalRequests: number;
    todayRequests: number;
    averageResponseTime: number;
  };
  systemMetrics: {
    enabled: boolean;
    samplingRate: number; // in ms
    metricsRetained: number; // in minutes
  };
  userActivity: {
    enabled: boolean;
    sessionTracking: boolean;
    eventTracking: boolean;
  };
}

export const GET: RequestHandler = async () => {
  try {
    const currentHour = new Date().getHours();
    
    // Generate dynamic summary data based on time of day
    const baseNotifications = 1200;
    const hourlyVariation = Math.sin(currentHour * Math.PI / 12) * 50;
    
    const summary: AnalyticsSummary = {
      notifications: {
        enabled: true,
        totalEvents: Math.floor(baseNotifications + hourlyVariation + Math.random() * 100),
        todayEvents: 35 + Math.floor(Math.random() * 20),
        successRate: 98.2 + Math.random() * 1.8
      },
      webhooks: {
        enabled: true,
        totalRequests: 850 + Math.floor(Math.random() * 100),
        todayRequests: 18 + Math.floor(Math.random() * 15),
        averageResponseTime: 140 + Math.floor(Math.random() * 20)
      },
      systemMetrics: {
        enabled: true,
        samplingRate: 60000, // 1 minute
        metricsRetained: 4320 // 72 hours worth of minutes
      },
      userActivity: {
        enabled: true,
        sessionTracking: true,
        eventTracking: true
      }
    };

    return json(summary);
  } catch (error) {
    console.error('Analytics summary error:', error);

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
