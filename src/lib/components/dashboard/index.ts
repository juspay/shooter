// Dashboard Components
// Centralized exports for all dashboard-related components

export { default as MetricCard } from './MetricCard.svelte';
export { default as Chart } from './Chart.svelte';
export { default as Timeline } from './Timeline.svelte';
export { default as ActivityFeed } from './ActivityFeed.svelte';

// Dashboard component types and interfaces
export interface MetricData {
  title: string;
  value: number | string;
  previousValue?: number | null;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral' | null;
  trendPercentage?: number | null;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string | undefined;
}

export interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  tension?: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description?: string | undefined;
  type: 'coding' | 'debugging' | 'testing' | 'deployment' | 'collaboration' | 'system';
  status: 'completed' | 'in-progress' | 'failed' | 'pending' | 'cancelled';
  icon?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  duration?: number | undefined;
  user?: string | undefined;
  clickable?: boolean | undefined;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'notification' | 'webhook' | 'error' | 'success' | 'info' | 'warning' | 'debug';
  category: 'coding' | 'debugging' | 'testing' | 'deployment' | 'collaboration' | 'system';
  title: string;
  description?: string;
  user?: string;
  icon?: string;
  action?: string; // Action type/name (e.g., 'sent', 'received')
  metadata?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'medium' | 'high' | 'urgent';
  read?: boolean;
  clickable?: boolean;
  actions?: Array<{
    id: string;
    label: string;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  }>;
}

// Mock data generators for testing and development
export function generateMockMetrics(): MetricData[] {
  return [
    {
      title: 'Total Notifications',
      value: 1247,
      previousValue: 1180,
      unit: '',
      trend: 'up'
    },
    {
      title: 'Success Rate',
      value: 94.7,
      previousValue: 92.1,
      unit: '%',
      trend: 'up'
    },
    {
      title: 'Avg Response Time',
      value: 142,
      previousValue: 198,
      unit: 'ms',
      trend: 'down'
    },
    {
      title: 'Active Sessions',
      value: 23,
      previousValue: 23,
      unit: '',
      trend: 'neutral'
    },
    {
      title: 'Error Rate',
      value: 2.3,
      previousValue: 4.1,
      unit: '%',
      trend: 'down'
    },
    {
      title: 'Daily Usage',
      value: '4.2K',
      previousValue: null,
      unit: 'requests'
    }
  ];
}

export function generateMockChartData(type: 'line' | 'bar' | 'area' = 'line'): ChartDataPoint[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const baseValues = [120, 145, 132, 168, 155, 189, 174];

  return labels.map((label, index) => ({
    label,
    value: baseValues[index]! + Math.floor(Math.random() * 50) - 25,
    color: type === 'bar' ? `hsl(${index * 45}, 70%, 60%)` : undefined
  }));
}

export function generateMockTimelineEvents(count: number = 10): TimelineEvent[] {
  const types: TimelineEvent['type'][] = [
    'coding',
    'debugging',
    'testing',
    'deployment',
    'collaboration',
    'system'
  ];
  const statuses: TimelineEvent['status'][] = [
    'completed',
    'in-progress',
    'failed',
    'pending',
    'cancelled'
  ];

  const titles = [
    'Code review completed',
    'Deployment to staging started',
    'Bug fix merged to main',
    'Test suite updated',
    'Database migration executed',
    'Feature branch created',
    'Security scan completed',
    'Performance optimization applied',
    'Documentation updated',
    'API endpoint added'
  ];

  const descriptions = [
    'Successfully reviewed and approved pull request #234',
    'Automated deployment pipeline initiated for staging environment',
    'Critical bug fix for user authentication merged to main branch',
    'Added new unit tests for payment processing module',
    'Database schema migration completed without errors',
    'Created new feature branch for user dashboard improvements',
    'Security vulnerability scan completed with no critical issues found',
    'Applied performance optimizations reducing load time by 30%',
    'Updated API documentation with new endpoint specifications',
    'Added new REST API endpoint for user profile management'
  ];

  const users = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Eve Brown'];

  return Array.from({ length: count }, (_, index) => {
    const now = new Date();
    const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    return {
      id: `event_${index + 1}_${Date.now()}`,
      timestamp: timestamp.toISOString(),
      title: titles[Math.floor(Math.random() * titles.length)]!,
      description:
        Math.random() > 0.3
          ? descriptions[Math.floor(Math.random() * descriptions.length)]!
          : undefined,
      type: types[Math.floor(Math.random() * types.length)]!,
      status: statuses[Math.floor(Math.random() * statuses.length)]!,
      duration: Math.random() > 0.5 ? Math.floor(Math.random() * 120) + 5 : undefined,
      user: Math.random() > 0.2 ? users[Math.floor(Math.random() * users.length)]! : undefined,
      metadata:
        Math.random() > 0.7
          ? {
              PR: `#${Math.floor(Math.random() * 999) + 1}`,
              Branch: `feature/${Math.random().toString(36).substr(2, 8)}`
            }
          : undefined
    };
  });
}

export function generateMockActivityFeed(count: number = 20): ActivityItem[] {
  const types: ActivityItem['type'][] = [
    'notification',
    'error',
    'success',
    'info',
    'warning',
    'debug'
  ];
  const categories: ActivityItem['category'][] = [
    'coding',
    'debugging',
    'testing',
    'deployment',
    'collaboration',
    'system'
  ];

  const titles = [
    'New notification sent',
    'Error in payment processing',
    'Deployment completed successfully',
    'System maintenance scheduled',
    'Code review requested',
    'Performance alert triggered',
    'User session started',
    'Database backup completed',
    'Security scan initiated',
    'Feature flag updated'
  ];

  const descriptions = [
    'Push notification delivered to 1,247 devices',
    'Payment processing failed for transaction ID 12345',
    'Application successfully deployed to production environment',
    'Scheduled maintenance window begins at 2:00 AM UTC',
    'Pull request #456 requires code review from team lead',
    'CPU usage exceeded 80% threshold for 5 minutes',
    'User alice@example.com started new session from mobile app',
    'Daily database backup completed in 45 minutes',
    'Automated security vulnerability scan started',
    'Feature flag "new-dashboard" enabled for 50% of users'
  ];

  const users = ['System', 'Alice Johnson', 'Bob Smith', 'Carol Davis', 'Automated Task'];

  return Array.from({ length: count }, (_, index) => {
    const now = new Date();
    const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    const type = types[Math.floor(Math.random() * types.length)]!;
    const category = categories[Math.floor(Math.random() * categories.length)]!;
    const description = Math.random() > 0.3
      ? descriptions[Math.floor(Math.random() * descriptions.length)]!
      : null;
    const user = Math.random() > 0.2 ? users[Math.floor(Math.random() * users.length)]! : null;
    const metadata = Math.random() > 0.7
      ? {
          ID: Math.random().toString(36).substr(2, 8).toUpperCase(),
          Duration: `${Math.floor(Math.random() * 300) + 10}ms`
        }
      : null;
    const actions = type === 'error' || Math.random() > 0.8
      ? [
          {
            id: 'view',
            label: 'View Details',
            icon: '👁️',
            variant: 'ghost' as const
          },
          ...(type === 'error'
            ? [
                {
                  id: 'retry',
                  label: 'Retry',
                  icon: '🔄',
                  variant: 'secondary' as const
                }
              ]
            : [])
        ]
      : null;

    return {
      id: `activity_${index + 1}_${Date.now()}`,
      timestamp: timestamp.toISOString(),
      type,
      category,
      title: titles[Math.floor(Math.random() * titles.length)]!,
      ...(description && { description }),
      ...(user && { user }),
      read: Math.random() > 0.4,
      ...(metadata && { metadata }),
      ...(actions && { actions })
    };
  });
}

// Utility functions for dashboard data
export function calculateTrendPercentage(current: number, previous: number): number {
  if (previous === 0) {
return current > 0 ? 100 : 0;
}
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatMetricValue(
  value: number | string,
  format?: 'number' | 'currency' | 'percentage'
): string {
  if (typeof value === 'string') {
return value;
}

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return value.toString();
  }
}

export function aggregateMetricsByPeriod(
  data: Array<{ timestamp: string; value: number }>,
  period: 'hour' | 'day' | 'week' | 'month'
): ChartDataPoint[] {
  const groups: Record<string, number[]> = {};

  data.forEach(item => {
    const date = new Date(item.timestamp);
    let key: string;

    switch (period) {
      case 'hour':
        key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        break;
      case 'day':
        key = date.toDateString();
        break;
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toDateString();
        break;
      }
      case 'month':
        key = `${date.getFullYear()}-${date.getMonth()}`;
        break;
    }

    if (!groups[key]) {
groups[key] = [];
}
    groups[key]!.push(item.value);
  });

  return Object.entries(groups).map(([key, values]) => ({
    label: key,
    value: values.reduce((sum, val) => sum + val, 0) / values.length
  }));
}

// Dashboard layout utilities
export interface DashboardLayout {
  metrics: MetricData[];
  charts: Array<{
    id: string;
    title: string;
    type: 'line' | 'bar' | 'area';
    data: ChartDataPoint[];
  }>;
  timeline: TimelineEvent[];
  activities: ActivityItem[];
}

export function createDashboardLayout(): DashboardLayout {
  return {
    metrics: generateMockMetrics(),
    charts: [
      {
        id: 'notifications',
        title: 'Notifications Over Time',
        type: 'line',
        data: generateMockChartData('line')
      },
      {
        id: 'performance',
        title: 'Performance Metrics',
        type: 'bar',
        data: generateMockChartData('bar')
      }
    ],
    timeline: generateMockTimelineEvents(8),
    activities: generateMockActivityFeed(15)
  };
}
