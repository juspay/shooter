import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Usage statistics interfaces
interface UsageStatistics {
  overview: {
    totalUsers: number;
    activeUsers: {
      daily: number;
      weekly: number;
      monthly: number;
    };
    sessionMetrics: {
      totalSessions: number;
      averageSessionDuration: number;
      sessionsPerUser: number;
      bounceRate: number;
    };
    retentionMetrics: {
      day1: number;
      day7: number;
      day30: number;
    };
  };
  features: {
    mostUsed: Array<{
      feature: string;
      usageCount: number;
      uniqueUsers: number;
      averageTimeSpent: number;
      growthRate: number;
    }>;
    leastUsed: Array<{
      feature: string;
      usageCount: number;
      uniqueUsers: number;
      lastUsed: string;
    }>;
    featureAdoption: Record<string, {
      adoptionRate: number;
      timeToFirstUse: number;
      powerUsers: number;
    }>;
  };
  endpoints: {
    apiUsage: Array<{
      endpoint: string;
      method: string;
      calls: number;
      uniqueUsers: number;
      averageResponseTime: number;
      errorRate: number;
      popularityRank: number;
    }>;
    webhookUsage: Array<{
      webhook: string;
      totalEvents: number;
      successRate: number;
      averageProcessingTime: number;
      mostActiveSource: string;
    }>;
  };
  temporal: {
    hourlyDistribution: Array<{
      hour: number;
      users: number;
      sessions: number;
      requests: number;
    }>;
    dailyTrends: Array<{
      date: string;
      activeUsers: number;
      sessions: number;
      requests: number;
      averageSessionDuration: number;
    }>;
    weeklyPatterns: {
      monday: number;
      tuesday: number;
      wednesday: number;
      thursday: number;
      friday: number;
      saturday: number;
      sunday: number;
    };
  };
  geographical: {
    topCountries: Array<{
      country: string;
      users: number;
      sessions: number;
      averageSessionDuration: number;
    }>;
    timezoneDistribution: Record<string, number>;
  };
  technical: {
    deviceTypes: Record<string, { count: number; percentage: number }>;
    platforms: Record<string, { count: number; percentage: number }>;
    browserDistribution: Record<string, number>;
    screenResolutions: Array<{
      resolution: string;
      count: number;
      percentage: number;
    }>;
  };
}

interface UsageResponse {
  success: boolean;
  data: UsageStatistics;
  insights: Array<{
    category: string;
    type: 'positive' | 'neutral' | 'negative';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    actionable: boolean;
  }>;
  comparisons: {
    previousPeriod: {
      activeUsers: number;
      sessions: number;
      avgSessionDuration: number;
      changePercentage: {
        activeUsers: number;
        sessions: number;
        avgSessionDuration: number;
      };
    };
  };
  metadata: {
    generatedAt: string;
    dataRange: {
      start: string;
      end: string;
    };
    totalDataPoints: number;
  };
}

function generateMockUsageStats(): UsageStatistics {
  const now = new Date();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    return {
      date: date.toISOString().split('T')[0]!,
      activeUsers: 80 + Math.floor(Math.random() * 40),
      sessions: 150 + Math.floor(Math.random() * 80),
      requests: 800 + Math.floor(Math.random() * 400),
      averageSessionDuration: 180000 + Math.floor(Math.random() * 120000) // 3-5 minutes
    };
  });

  return {
    overview: {
      totalUsers: 89 + Math.floor(Math.random() * 20),
      activeUsers: {
        daily: 65 + Math.floor(Math.random() * 15),
        weekly: 89 + Math.floor(Math.random() * 20),
        monthly: 156 + Math.floor(Math.random() * 30)
      },
      sessionMetrics: {
        totalSessions: 234 + Math.floor(Math.random() * 50),
        averageSessionDuration: 240000 + Math.floor(Math.random() * 180000), // 4-7 minutes
        sessionsPerUser: 2.8 + Math.random() * 1.2,
        bounceRate: 15 + Math.random() * 10 // 15-25%
      },
      retentionMetrics: {
        day1: 85 + Math.random() * 10,
        day7: 65 + Math.random() * 15,
        day30: 45 + Math.random() * 20
      }
    },
    features: {
      mostUsed: [
        {
          feature: 'notifications',
          usageCount: 1247,
          uniqueUsers: 89,
          averageTimeSpent: 180000,
          growthRate: 12.3
        },
        {
          feature: 'integrations',
          usageCount: 892,
          uniqueUsers: 67,
          averageTimeSpent: 320000,
          growthRate: 8.9
        },
        {
          feature: 'system-monitoring',
          usageCount: 567,
          uniqueUsers: 45,
          averageTimeSpent: 240000,
          growthRate: 15.6
        },
        {
          feature: 'analytics',
          usageCount: 234,
          uniqueUsers: 34,
          averageTimeSpent: 420000,
          growthRate: 22.1
        },
        {
          feature: 'authentication',
          usageCount: 2890,
          uniqueUsers: 89,
          averageTimeSpent: 30000,
          growthRate: 5.2
        }
      ],
      leastUsed: [
        {
          feature: 'admin',
          usageCount: 23,
          uniqueUsers: 5,
          lastUsed: new Date(Date.now() - 86400000 * 3).toISOString() // 3 days ago
        },
        {
          feature: 'debug-tools',
          usageCount: 45,
          uniqueUsers: 8,
          lastUsed: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }
      ],
      featureAdoption: {
        notifications: {
          adoptionRate: 100, // All users use notifications
          timeToFirstUse: 300000, // 5 minutes
          powerUsers: 34 // Users who use it >10 times per day
        },
        integrations: {
          adoptionRate: 75.3,
          timeToFirstUse: 1200000, // 20 minutes
          powerUsers: 12
        },
        'system-monitoring': {
          adoptionRate: 50.6,
          timeToFirstUse: 1800000, // 30 minutes
          powerUsers: 8
        },
        analytics: {
          adoptionRate: 38.2,
          timeToFirstUse: 3600000, // 1 hour
          powerUsers: 5
        }
      }
    },
    endpoints: {
      apiUsage: [
        {
          endpoint: '/notifications/send',
          method: 'POST',
          calls: 1247,
          uniqueUsers: 89,
          averageResponseTime: 145,
          errorRate: 1.2,
          popularityRank: 1
        },
        {
          endpoint: '/integrations/status',
          method: 'GET',
          calls: 892,
          uniqueUsers: 67,
          averageResponseTime: 89,
          errorRate: 0.5,
          popularityRank: 2
        },
        {
          endpoint: '/system-monitoring/metrics',
          method: 'GET',
          calls: 567,
          uniqueUsers: 45,
          averageResponseTime: 234,
          errorRate: 2.1,
          popularityRank: 3
        },
        {
          endpoint: '/analytics/data',
          method: 'GET',
          calls: 234,
          uniqueUsers: 34,
          averageResponseTime: 456,
          errorRate: 3.2,
          popularityRank: 4
        },
        {
          endpoint: '/authentication/login',
          method: 'POST',
          calls: 2890,
          uniqueUsers: 89,
          averageResponseTime: 123,
          errorRate: 0.8,
          popularityRank: 5
        }
      ],
      webhookUsage: [
        {
          webhook: 'claude',
          totalEvents: 456,
          successRate: 98.9,
          averageProcessingTime: 145,
          mostActiveSource: 'tool_call'
        },
        {
          webhook: 'github',
          totalEvents: 312,
          successRate: 96.2,
          averageProcessingTime: 189,
          mostActiveSource: 'push'
        },
        {
          webhook: 'vercel',
          totalEvents: 124,
          successRate: 99.1,
          averageProcessingTime: 98,
          mostActiveSource: 'deployment'
        }
      ]
    },
    temporal: {
      hourlyDistribution: Array.from({ length: 24 }, (_, hour) => {
        // Simulate realistic usage patterns (higher during work hours)
        const baseActivity = hour >= 9 && hour <= 17 ? 1.5 : 
                           hour >= 19 && hour <= 23 ? 1.2 : 0.6;
        return {
          hour,
          users: Math.floor((20 + Math.random() * 15) * baseActivity),
          sessions: Math.floor((35 + Math.random() * 25) * baseActivity),
          requests: Math.floor((150 + Math.random() * 100) * baseActivity)
        };
      }),
      dailyTrends: last7Days,
      weeklyPatterns: {
        monday: 18.2,
        tuesday: 19.8,
        wednesday: 20.1,
        thursday: 18.7,
        friday: 15.4,
        saturday: 4.2,
        sunday: 3.6
      }
    },
    geographical: {
      topCountries: [
        {
          country: 'United States',
          users: 40,
          sessions: 95,
          averageSessionDuration: 260000
        },
        {
          country: 'United Kingdom',
          users: 15,
          sessions: 32,
          averageSessionDuration: 210000
        },
        {
          country: 'Canada',
          users: 12,
          sessions: 28,
          averageSessionDuration: 245000
        },
        {
          country: 'Germany',
          users: 8,
          sessions: 18,
          averageSessionDuration: 180000
        },
        {
          country: 'Australia',
          users: 6,
          sessions: 14,
          averageSessionDuration: 220000
        }
      ],
      timezoneDistribution: {
        'UTC-8': 25, // PST
        'UTC-5': 20, // EST
        'UTC+0': 15, // GMT
        'UTC+1': 12, // CET
        'UTC+8': 8,  // CST
        'UTC+10': 6, // AEST
        'Other': 14
      }
    },
    technical: {
      deviceTypes: {
        Desktop: { count: 67, percentage: 75.3 },
        Mobile: { count: 18, percentage: 20.2 },
        Tablet: { count: 4, percentage: 4.5 }
      },
      platforms: {
        macOS: { count: 45, percentage: 50.6 },
        Windows: { count: 32, percentage: 36.0 },
        Linux: { count: 8, percentage: 9.0 },
        iOS: { count: 3, percentage: 3.4 },
        Android: { count: 1, percentage: 1.0 }
      },
      browserDistribution: {
        Chrome: 45.2,
        Safari: 28.1,
        Firefox: 15.7,
        Edge: 8.9,
        Other: 2.1
      },
      screenResolutions: [
        { resolution: '1920x1080', count: 34, percentage: 38.2 },
        { resolution: '2560x1440', count: 18, percentage: 20.2 },
        { resolution: '1366x768', count: 12, percentage: 13.5 },
        { resolution: '3840x2160', count: 8, percentage: 9.0 },
        { resolution: 'Other', count: 17, percentage: 19.1 }
      ]
    }
  };
}

function generateUsageInsights(stats: UsageStatistics): UsageResponse['insights'] {
  const insights = [];

  // Feature adoption insights
  if (stats.features.featureAdoption.analytics && stats.features.featureAdoption.analytics.adoptionRate < 50) {
    insights.push({
      category: 'features',
      type: 'negative' as const,
      title: 'Low Analytics Feature Adoption',
      description: `Only ${stats.features.featureAdoption.analytics.adoptionRate.toFixed(1)}% of users have adopted the analytics feature. Consider improving discoverability or providing better onboarding.`,
      impact: 'medium' as const,
      actionable: true
    });
  }

  // Session insights
  if (stats.overview.sessionMetrics.bounceRate > 20) {
    insights.push({
      category: 'engagement',
      type: 'negative' as const,
      title: 'High Bounce Rate Detected',
      description: `Current bounce rate of ${stats.overview.sessionMetrics.bounceRate.toFixed(1)}% indicates users may not be finding what they need quickly.`,
      impact: 'high' as const,
      actionable: true
    });
  }

  // Retention insights
  if (stats.overview.retentionMetrics.day7 < 70) {
    insights.push({
      category: 'retention',
      type: 'negative' as const,
      title: 'Week 1 Retention Needs Improvement',
      description: `7-day retention rate of ${stats.overview.retentionMetrics.day7.toFixed(1)}% is below industry standards. Focus on improving early user experience.`,
      impact: 'high' as const,
      actionable: true
    });
  }

  // Performance insights
  const slowEndpoints = stats.endpoints.apiUsage.filter(ep => ep.averageResponseTime > 300);
  if (slowEndpoints.length > 0) {
    insights.push({
      category: 'performance',
      type: 'negative' as const,
      title: 'Slow API Endpoints Detected',
      description: `${slowEndpoints.length} endpoints have response times > 300ms. This may impact user experience.`,
      impact: 'medium' as const,
      actionable: true
    });
  }

  // Positive insights
  if (stats.overview.activeUsers.weekly > stats.overview.totalUsers * 0.8) {
    insights.push({
      category: 'engagement',
      type: 'positive' as const,
      title: 'Excellent Weekly Engagement',
      description: `${((stats.overview.activeUsers.weekly / stats.overview.totalUsers) * 100).toFixed(1)}% of users are active weekly, indicating strong product-market fit.`,
      impact: 'high' as const,
      actionable: false
    });
  }

  return insights;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const startTime = Date.now();

    // Parse query parameters
    const dateRange = url.searchParams.get('range') || '7d';
    const category = url.searchParams.get('category'); // 'features', 'endpoints', 'temporal', etc.
    const detailed = url.searchParams.get('detailed') === 'true';

    // Generate usage statistics
    const usageStats = generateMockUsageStats();

    // Filter by category if specified
    let filteredStats = usageStats;
    if (category && usageStats[category as keyof UsageStatistics]) {
      filteredStats = {
        [category]: usageStats[category as keyof UsageStatistics]
      } as unknown as UsageStatistics;
    }

    const insights = generateUsageInsights(usageStats);

    // Calculate comparisons (mock previous period data)
    const previousPeriodMultiplier = 0.9 + Math.random() * 0.2; // 90-110% of current
    const comparisons = {
      previousPeriod: {
        activeUsers: Math.floor(usageStats.overview.activeUsers.weekly * previousPeriodMultiplier),
        sessions: Math.floor(usageStats.overview.sessionMetrics.totalSessions * previousPeriodMultiplier),
        avgSessionDuration: Math.floor(usageStats.overview.sessionMetrics.averageSessionDuration * previousPeriodMultiplier),
        changePercentage: {
          activeUsers: ((usageStats.overview.activeUsers.weekly / (usageStats.overview.activeUsers.weekly * previousPeriodMultiplier)) - 1) * 100,
          sessions: ((usageStats.overview.sessionMetrics.totalSessions / (usageStats.overview.sessionMetrics.totalSessions * previousPeriodMultiplier)) - 1) * 100,
          avgSessionDuration: ((usageStats.overview.sessionMetrics.averageSessionDuration / (usageStats.overview.sessionMetrics.averageSessionDuration * previousPeriodMultiplier)) - 1) * 100
        }
      }
    };

    // Calculate date range
    const now = new Date();
    const rangeMs = dateRange === '1d' ? 24 * 60 * 60 * 1000 :
                   dateRange === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                   dateRange === '30d' ? 30 * 24 * 60 * 60 * 1000 :
                   7 * 24 * 60 * 60 * 1000;
    const startDate = new Date(now.getTime() - rangeMs);

    const response: UsageResponse = {
      success: true,
      data: filteredStats,
      insights: detailed ? insights : insights.filter(i => i.impact === 'high'),
      comparisons,
      metadata: {
        generatedAt: new Date().toISOString(),
        dataRange: {
          start: startDate.toISOString(),
          end: now.toISOString()
        },
        totalDataPoints: 15420 + Math.floor(Math.random() * 1000)
      }
    };

    const responseTime = Date.now() - startTime;
    console.log(`Usage statistics generated in ${responseTime}ms`);

    // Add caching headers
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600' // 10 minutes cache for usage stats
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Usage statistics generation error:', error);

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
