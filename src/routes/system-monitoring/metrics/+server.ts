import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import os from 'os';

interface SystemMetrics {
  timestamp: string;
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: NodeJS.MemoryUsage;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    requests: number;
    responseTime: number;
    errors: number;
  };
  uptime: number;
  platform: {
    type: string;
    release: string;
    arch: string;
    nodeVersion: string;
  };
}

// Mock request counter and response time tracking
let requestCounter = 0;
let errorCounter = 0;
let responseTimes: number[] = [];

export const GET: RequestHandler = async ({ url }) => {
  const startTime = Date.now();
  
  try {
    requestCounter++;
    
    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    const loadAverage = os.loadavg();
    const cpuCores = os.cpus().length;
    
    // Calculate approximate CPU usage (simplified)
    const cpuUsage = Math.min(100, (loadAverage[0]! / cpuCores) * 100);
    
    // Mock disk usage (in production, use actual disk metrics)
    const diskTotal = 100 * 1024 * 1024 * 1024; // 100GB mock
    const diskUsed = diskTotal * 0.45; // 45% used
    
    // Calculate average response time
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    const metrics: SystemMetrics = {
      timestamp: new Date().toISOString(),
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: usedMemory / totalMemory,
        heap: memoryUsage
      },
      cpu: {
        usage: cpuUsage,
        loadAverage: loadAverage,
        cores: cpuCores
      },
      disk: {
        used: diskUsed,
        total: diskTotal,
        percentage: diskUsed / diskTotal
      },
      network: {
        requests: requestCounter,
        responseTime: Math.round(avgResponseTime),
        errors: errorCounter
      },
      uptime: process.uptime(),
      platform: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        nodeVersion: process.version
      }
    };

    // Filter metrics based on query parameters
    const filter = url.searchParams.get('filter');
    if (filter) {
      const filters = filter.split(',');
      const filteredMetrics: Partial<SystemMetrics> = { timestamp: metrics.timestamp };

      filters.forEach(f => {
        const key = f as keyof SystemMetrics;
        if (key in metrics) {
          (filteredMetrics as Record<string, unknown>)[key] = metrics[key];
        }
      });

      const responseTime = Date.now() - startTime;
      responseTimes.push(responseTime);

      // Keep only last 100 response times
      if (responseTimes.length > 100) {
        responseTimes = responseTimes.slice(-100);
      }

      return json(filteredMetrics);
    }

    const responseTime = Date.now() - startTime;
    responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (responseTimes.length > 100) {
      responseTimes = responseTimes.slice(-100);
    }

    return json(metrics);
  } catch (error) {
    errorCounter++;
    console.error('Error fetching system metrics:', error);

    const responseTime = Date.now() - startTime;
    responseTimes.push(responseTime);
    
    return json({ 
      error: 'Failed to fetch system metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    
    // Reset counters if requested
    if (body.reset) {
      if (body.reset.includes('requests')) {
requestCounter = 0;
}
      if (body.reset.includes('errors')) {
errorCounter = 0;
}
      if (body.reset.includes('responseTimes')) {
responseTimes = [];
}
    }

    // Record custom metrics if provided
    if (body.recordResponseTime && typeof body.recordResponseTime === 'number') {
      responseTimes.push(body.recordResponseTime);
      if (responseTimes.length > 100) {
        responseTimes = responseTimes.slice(-100);
      }
    }

    if (body.incrementRequests) {
      requestCounter += body.incrementRequests;
    }

    if (body.incrementErrors) {
      errorCounter += body.incrementErrors;
    }

    return json({ 
      success: true, 
      message: 'Metrics updated successfully',
      counters: {
        requests: requestCounter,
        errors: errorCounter,
        responseTimes: responseTimes.length
      }
    });

    } catch (error) {
    console.error('Error updating metrics:', error);
    return json({ error: 'Failed to update metrics' }, { status: 500 });
  }
};