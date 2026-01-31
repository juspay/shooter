#!/usr/bin/env bun
// Production Readiness Verification Script
// Comprehensive verification of all Phase 5 production features

import {
  // Core storage functions
  initializeStorages,
  get,
  set,
  remove,
  getConnectedStorages,

  // Health monitoring
  checkAllStorages,
  healthCheckEndpoint,
  simpleHealthCheck,

  // Performance metrics
  generatePerformanceReport,
  benchmarkStorage,
  optimizeStorageSystem,
  exportPerformanceMetrics,

  // Monitoring and alerting
  startMonitoring,
  stopMonitoring,
  getMonitoringStats,
  configureMonitoring,

  // Shutdown management
  initializeShutdownHandler,
  getShutdownStatus,
  configureShutdown,

  // Logging
  getStorageLogs,
  getErrorStats,
  configureLogging,
  exportLogs,

  // Device management
  registerDevice,
  getDevices,
  getDeviceStats,
  cleanupInactiveDevices,

  // Notification functions
  sendNotificationToAllDevices
} from '../src/lib/storage/index.js';

interface VerificationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
  duration?: number;
}

class ProductionVerifier {
  private results: VerificationResult[] = [];
  private testUserId = 'verification-user-' + Date.now();
  private testDeviceId?: string;

  async runVerification(): Promise<void> {
    console.log('🚀 Starting Production Readiness Verification...\n');
    console.log('='.repeat(60));

    try {
      await this.initializeSystem();
      await this.verifyHealthMonitoring();
      await this.verifyPerformanceMetrics();
      await this.verifyMonitoringAlerting();
      await this.verifyLoggingErrorHandling();
      await this.verifyShutdownManagement();
      await this.verifyDeviceManagement();
      await this.verifyNotificationSystem();
      await this.verifyDeploymentConfiguration();
      await this.verifyDocumentation();
      await this.performLoadTesting();
      await this.generateFinalReport();
    } catch (error) {
      this.addResult('SYSTEM', 'FAIL', `Critical error during verification: ${error.message}`);
    } finally {
      await this.cleanup();
    }
  }

  private async initializeSystem(): Promise<void> {
    const start = Date.now();

    try {
      await initializeStorages();

      // Configure production-ready settings
      configureLogging({
        level: 'info',
        categories: ['storage', 'health', 'performance', 'monitoring'],
        enablePerformanceLogging: true
      });

      initializeShutdownHandler({
        gracefulTimeout: 30000,
        persistLogs: true,
        persistMetrics: true,
        exportPath: './verification-exports'
      });

      configureShutdown({
        gracefulTimeout: 30000,
        persistLogs: true,
        persistMetrics: true
      });

      const connected = getConnectedStorages();

      this.addResult(
        'INITIALIZATION',
        connected.length > 0 ? 'PASS' : 'FAIL',
        `System initialized with ${connected.length} storage backend(s)`,
        { connectedStorages: connected.map(s => s.name) },
        Date.now() - start
      );
    } catch (error) {
      this.addResult(
        'INITIALIZATION',
        'FAIL',
        `Failed to initialize: ${error.message}`,
        null,
        Date.now() - start
      );
    }
  }

  private async verifyHealthMonitoring(): Promise<void> {
    console.log('\n📊 Verifying Health Monitoring...');

    // Test comprehensive health check
    const start1 = Date.now();
    try {
      const healthReport = await checkAllStorages();

      const isHealthy = healthReport.status === 'healthy' || healthReport.status === 'degraded';
      this.addResult(
        'HEALTH_CHECK',
        isHealthy ? 'PASS' : 'FAIL',
        `System health: ${healthReport.status}`,
        {
          status: healthReport.status,
          connectedStorages: healthReport.summary.connectedStorages,
          avgLatency: Math.round(healthReport.summary.averageLatency * 100) / 100
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'HEALTH_CHECK',
        'FAIL',
        `Health check failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }

    // Test HTTP health endpoints
    const start2 = Date.now();
    try {
      const { status, body } = await healthCheckEndpoint();
      const isValidStatus = status === 200 || status === 503;

      this.addResult(
        'HEALTH_ENDPOINT',
        isValidStatus ? 'PASS' : 'FAIL',
        `Health endpoint returned status ${status}`,
        { httpStatus: status, systemStatus: body.status },
        Date.now() - start2
      );
    } catch (error) {
      this.addResult(
        'HEALTH_ENDPOINT',
        'FAIL',
        `Health endpoint failed: ${error.message}`,
        null,
        Date.now() - start2
      );
    }

    // Test simple health check
    const start3 = Date.now();
    try {
      const simple = await simpleHealthCheck();

      this.addResult(
        'SIMPLE_HEALTH',
        simple.status === 'ok' ? 'PASS' : 'WARNING',
        `Simple health check: ${simple.status}`,
        { status: simple.status },
        Date.now() - start3
      );
    } catch (error) {
      this.addResult(
        'SIMPLE_HEALTH',
        'FAIL',
        `Simple health check failed: ${error.message}`,
        null,
        Date.now() - start3
      );
    }
  }

  private async verifyPerformanceMetrics(): Promise<void> {
    console.log('\n⚡ Verifying Performance Metrics...');

    // Generate some activity for metrics
    const start0 = Date.now();
    try {
      for (let i = 0; i < 20; i++) {
        await set(`perf-test-${i}`, { data: i, timestamp: Date.now() });
        await get(`perf-test-${i}`);
      }

      this.addResult(
        'METRIC_GENERATION',
        'PASS',
        'Generated test activity for metrics',
        { operations: 40 },
        Date.now() - start0
      );
    } catch (error) {
      this.addResult(
        'METRIC_GENERATION',
        'WARNING',
        `Failed to generate test activity: ${error.message}`,
        null,
        Date.now() - start0
      );
    }

    // Test performance report
    const start1 = Date.now();
    try {
      const report = generatePerformanceReport();

      const isHealthyPerformance = report.operationsPerSecond > 0 && report.errorRate < 0.1;

      this.addResult(
        'PERFORMANCE_REPORT',
        isHealthyPerformance ? 'PASS' : 'WARNING',
        `Performance: ${report.operationsPerSecond.toFixed(1)} ops/sec, ${(report.errorRate * 100).toFixed(1)}% error rate`,
        {
          operationsPerSecond: Math.round(report.operationsPerSecond * 100) / 100,
          averageLatency: Math.round(report.averageLatency * 100) / 100,
          errorRate: Math.round(report.errorRate * 10000) / 100,
          memoryUsage: Math.round(report.resourceUsage.memoryUsage * 10000) / 100
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'PERFORMANCE_REPORT',
        'FAIL',
        `Performance report failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }

    // Test storage benchmarks
    const connectedStorages = getConnectedStorages();
    for (const storage of connectedStorages.slice(0, 2)) {
      // Test first 2 storages
      const start = Date.now();
      try {
        const benchmark = await benchmarkStorage(storage.name, 25);

        const isGoodPerformance =
          benchmark.readLatency.averageDuration < 100 && benchmark.errorRate < 0.1;

        this.addResult(
          `BENCHMARK_${storage.name.toUpperCase()}`,
          isGoodPerformance ? 'PASS' : 'WARNING',
          `${storage.name}: ${benchmark.readThroughput.toFixed(1)} reads/sec, ${benchmark.readLatency.averageDuration.toFixed(1)}ms avg`,
          {
            readThroughput: Math.round(benchmark.readThroughput * 100) / 100,
            writeThroughput: Math.round(benchmark.writeThroughput * 100) / 100,
            readLatency: Math.round(benchmark.readLatency.averageDuration * 100) / 100,
            errorRate: Math.round(benchmark.errorRate * 10000) / 100
          },
          Date.now() - start
        );
      } catch (error) {
        this.addResult(
          `BENCHMARK_${storage.name.toUpperCase()}`,
          'WARNING',
          `Benchmark failed: ${error.message}`,
          null,
          Date.now() - start
        );
      }
    }

    // Test optimization
    const start2 = Date.now();
    try {
      const optimizations = await optimizeStorageSystem();

      this.addResult(
        'SYSTEM_OPTIMIZATION',
        'PASS',
        `System optimization completed with ${optimizations.length} recommendations`,
        { optimizations: optimizations.slice(0, 3) }, // Show first 3
        Date.now() - start2
      );
    } catch (error) {
      this.addResult(
        'SYSTEM_OPTIMIZATION',
        'WARNING',
        `Optimization failed: ${error.message}`,
        null,
        Date.now() - start2
      );
    }

    // Test metrics export
    const start3 = Date.now();
    try {
      const exported = exportPerformanceMetrics('json');
      const isValidJson = JSON.parse(exported);

      this.addResult(
        'METRICS_EXPORT',
        'PASS',
        'Performance metrics export successful',
        { exportSize: exported.length },
        Date.now() - start3
      );
    } catch (error) {
      this.addResult(
        'METRICS_EXPORT',
        'WARNING',
        `Metrics export failed: ${error.message}`,
        null,
        Date.now() - start3
      );
    }

    // Cleanup test data
    try {
      for (let i = 0; i < 20; i++) {
        await remove(`perf-test-${i}`);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private async verifyMonitoringAlerting(): Promise<void> {
    console.log('\n🚨 Verifying Monitoring and Alerting...');

    const start1 = Date.now();
    try {
      configureMonitoring({
        enabled: true,
        checkInterval: 10000, // 10 seconds for testing
        alertCooldown: 30000,
        thresholds: {
          latencyWarning: 50,
          latencyCritical: 200,
          errorRateWarning: 5,
          errorRateCritical: 10,
          memoryWarning: 70,
          memoryCritical: 90,
          storageResponseWarning: 100,
          storageResponseCritical: 500,
          throughputWarning: 10,
          throughputCritical: 5
        }
      });

      startMonitoring();

      // Wait a moment for monitoring to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      const stats = getMonitoringStats();

      this.addResult(
        'MONITORING_START',
        'PASS',
        'Monitoring system started successfully',
        {
          totalAlerts: stats.totalAlerts,
          activeAlerts: stats.activeAlerts,
          uptime: Math.round(stats.uptime / 1000)
        },
        Date.now() - start1
      );

      stopMonitoring();
    } catch (error) {
      this.addResult(
        'MONITORING_START',
        'FAIL',
        `Monitoring system failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }
  }

  private async verifyLoggingErrorHandling(): Promise<void> {
    console.log('\n📝 Verifying Logging and Error Handling...');

    const start1 = Date.now();
    try {
      const errorStats = getErrorStats();

      this.addResult(
        'ERROR_TRACKING',
        'PASS',
        `Error tracking active: ${errorStats.totalErrors} total errors, ${(errorStats.errorRate * 100).toFixed(1)}% rate`,
        {
          totalErrors: errorStats.totalErrors,
          errorRate: Math.round(errorStats.errorRate * 10000) / 100,
          recentErrors: errorStats.recentErrors.length
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'ERROR_TRACKING',
        'WARNING',
        `Error tracking failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }

    const start2 = Date.now();
    try {
      const logs = getStorageLogs({ limit: 50 });

      this.addResult(
        'LOG_RETRIEVAL',
        'PASS',
        `Log retrieval successful: ${logs.length} entries`,
        { logCount: logs.length },
        Date.now() - start2
      );
    } catch (error) {
      this.addResult(
        'LOG_RETRIEVAL',
        'WARNING',
        `Log retrieval failed: ${error.message}`,
        null,
        Date.now() - start2
      );
    }

    const start3 = Date.now();
    try {
      const jsonLogs = exportLogs('json');
      const csvLogs = exportLogs('csv');

      // Validate exports
      JSON.parse(jsonLogs); // Should not throw
      const csvValid = csvLogs.includes('timestamp,level,category');

      this.addResult(
        'LOG_EXPORT',
        csvValid ? 'PASS' : 'WARNING',
        'Log export successful',
        {
          jsonSize: jsonLogs.length,
          csvSize: csvLogs.length,
          csvValid
        },
        Date.now() - start3
      );
    } catch (error) {
      this.addResult(
        'LOG_EXPORT',
        'WARNING',
        `Log export failed: ${error.message}`,
        null,
        Date.now() - start3
      );
    }
  }

  private async verifyShutdownManagement(): Promise<void> {
    console.log('\n🔌 Verifying Shutdown Management...');

    const start1 = Date.now();
    try {
      const status = getShutdownStatus();

      const isValidStatus = status.progress >= 0 && status.progress <= 100;

      this.addResult(
        'SHUTDOWN_STATUS',
        isValidStatus ? 'PASS' : 'WARNING',
        `Shutdown management initialized: ${status.phase} (${status.progress}%)`,
        {
          phase: status.phase,
          progress: status.progress,
          graceful: status.graceful
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'SHUTDOWN_STATUS',
        'WARNING',
        `Shutdown status failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }
  }

  private async verifyDeviceManagement(): Promise<void> {
    console.log('\n📱 Verifying Device Management...');

    const start1 = Date.now();
    try {
      const device = await registerDevice(this.testUserId, {
        token: 'verification-token-' + Date.now(),
        lastSeen: Date.now(),
        active: true,
        platform: 'ios',
        appVersion: '1.0.0',
        metadata: { verification: true }
      });

      this.testDeviceId = device.id;

      this.addResult(
        'DEVICE_REGISTRATION',
        'PASS',
        `Device registered successfully: ${device.id}`,
        {
          deviceId: device.id,
          platform: device.platform,
          active: device.active
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'DEVICE_REGISTRATION',
        'FAIL',
        `Device registration failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }

    const start2 = Date.now();
    try {
      const devices = await getDevices(this.testUserId);

      this.addResult(
        'DEVICE_RETRIEVAL',
        devices.length > 0 ? 'PASS' : 'WARNING',
        `Retrieved ${devices.length} device(s) for user`,
        { deviceCount: devices.length },
        Date.now() - start2
      );
    } catch (error) {
      this.addResult(
        'DEVICE_RETRIEVAL',
        'WARNING',
        `Device retrieval failed: ${error.message}`,
        null,
        Date.now() - start2
      );
    }

    const start3 = Date.now();
    try {
      const stats = await getDeviceStats();

      this.addResult(
        'DEVICE_STATISTICS',
        'PASS',
        `Device stats: ${stats.totalDevices} total, ${stats.activeDevices} active`,
        {
          totalDevices: stats.totalDevices,
          activeDevices: stats.activeDevices,
          platforms: Object.keys(stats.devicesByPlatform)
        },
        Date.now() - start3
      );
    } catch (error) {
      this.addResult(
        'DEVICE_STATISTICS',
        'WARNING',
        `Device statistics failed: ${error.message}`,
        null,
        Date.now() - start3
      );
    }
  }

  private async verifyNotificationSystem(): Promise<void> {
    console.log('\n🔔 Verifying Notification System...');

    if (!this.testDeviceId) {
      this.addResult(
        'NOTIFICATION_SEND',
        'WARNING',
        'No test device available for notification testing'
      );
      return;
    }

    const start1 = Date.now();
    try {
      const result = await sendNotificationToAllDevices(this.testUserId, {
        title: 'Verification Test',
        body: 'This is a production readiness verification test notification',
        data: { verification: true, timestamp: Date.now() }
      });

      this.addResult(
        'NOTIFICATION_SEND',
        result.totalDevices > 0 ? 'PASS' : 'WARNING',
        `Notification sent to ${result.successCount}/${result.totalDevices} devices`,
        {
          totalDevices: result.totalDevices,
          successCount: result.successCount,
          failureCount: result.failureCount
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'NOTIFICATION_SEND',
        'WARNING',
        `Notification sending failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }
  }

  private async verifyDeploymentConfiguration(): Promise<void> {
    console.log('\n🚀 Verifying Deployment Configuration...');

    const start1 = Date.now();
    try {
      const fs = await import('fs/promises');

      // Check key deployment files
      const deploymentFiles = [
        '/Users/sachinsharma/Developer/Personal/shooter/deployment/docker/Dockerfile',
        '/Users/sachinsharma/Developer/Personal/shooter/deployment/docker/docker-compose.yml',
        '/Users/sachinsharma/Developer/Personal/shooter/deployment/terraform/main.tf',
        '/Users/sachinsharma/Developer/Personal/shooter/deployment/kubernetes/service.yml'
      ];

      let existingFiles = 0;
      for (const file of deploymentFiles) {
        try {
          await fs.access(file);
          existingFiles++;
        } catch (error) {
          // File doesn't exist
        }
      }

      this.addResult(
        'DEPLOYMENT_CONFIG',
        existingFiles === deploymentFiles.length ? 'PASS' : 'WARNING',
        `Deployment configuration: ${existingFiles}/${deploymentFiles.length} files present`,
        {
          totalFiles: deploymentFiles.length,
          existingFiles,
          coverage: Math.round((existingFiles / deploymentFiles.length) * 100)
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'DEPLOYMENT_CONFIG',
        'WARNING',
        `Deployment config check failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }
  }

  private async verifyDocumentation(): Promise<void> {
    console.log('\n📚 Verifying Documentation...');

    const start1 = Date.now();
    try {
      const fs = await import('fs/promises');

      const apiDoc = await fs.readFile(
        '/Users/sachinsharma/Developer/Personal/shooter/docs/STORAGE_API.md',
        'utf8'
      );

      // Check for key sections
      const requiredSections = [
        '# Storage System API Reference',
        '## Core Functions',
        '## Device Management',
        '## Health Monitoring',
        '## Performance Metrics',
        '## Best Practices'
      ];

      const presentSections = requiredSections.filter(section => apiDoc.includes(section));

      this.addResult(
        'API_DOCUMENTATION',
        presentSections.length === requiredSections.length ? 'PASS' : 'WARNING',
        `API documentation: ${presentSections.length}/${requiredSections.length} sections present`,
        {
          totalSections: requiredSections.length,
          presentSections: presentSections.length,
          docSize: apiDoc.length,
          coverage: Math.round((presentSections.length / requiredSections.length) * 100)
        },
        Date.now() - start1
      );
    } catch (error) {
      this.addResult(
        'API_DOCUMENTATION',
        'WARNING',
        `Documentation check failed: ${error.message}`,
        null,
        Date.now() - start1
      );
    }
  }

  private async performLoadTesting(): Promise<void> {
    console.log('\n🏋️ Performing Load Testing...');

    const start = Date.now();
    const operationCount = 100;

    try {
      // Concurrent operations
      const operations = [];
      for (let i = 0; i < operationCount; i++) {
        operations.push(
          (async () => {
            const key = `load-test-${i}`;
            await set(key, { id: i, timestamp: Date.now(), data: `test-data-${i}` });
            await get(key);
            await remove(key);
          })()
        );
      }

      await Promise.all(operations);

      const duration = Date.now() - start;
      const throughput = (operationCount * 3) / (duration / 1000); // 3 operations per iteration

      this.addResult(
        'LOAD_TEST',
        throughput > 50 ? 'PASS' : 'WARNING', // Expect at least 50 ops/sec
        `Load test completed: ${throughput.toFixed(1)} ops/sec`,
        {
          operations: operationCount * 3,
          duration,
          throughput: Math.round(throughput * 100) / 100
        },
        duration
      );

      // Check system health after load test
      const healthAfter = await checkAllStorages();

      this.addResult(
        'POST_LOAD_HEALTH',
        healthAfter.status !== 'unhealthy' ? 'PASS' : 'WARNING',
        `System health after load test: ${healthAfter.status}`,
        {
          status: healthAfter.status,
          avgLatency: Math.round(healthAfter.summary.averageLatency * 100) / 100
        }
      );
    } catch (error) {
      this.addResult(
        'LOAD_TEST',
        'FAIL',
        `Load test failed: ${error.message}`,
        null,
        Date.now() - start
      );
    }
  }

  private async generateFinalReport(): Promise<void> {
    console.log('\n📋 Generating Final Report...');

    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const warningCount = this.results.filter(r => r.status === 'WARNING').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;

    const totalTests = this.results.length;
    const successRate = Math.round((passCount / totalTests) * 100);

    console.log('\n' + '='.repeat(60));
    console.log('🎯 PRODUCTION READINESS VERIFICATION REPORT');
    console.log('='.repeat(60));
    console.log(`\nOVERALL SUMMARY:`);
    console.log(
      `✅ PASS: ${passCount}/${totalTests} (${Math.round((passCount / totalTests) * 100)}%)`
    );
    console.log(
      `⚠️  WARNING: ${warningCount}/${totalTests} (${Math.round((warningCount / totalTests) * 100)}%)`
    );
    console.log(
      `❌ FAIL: ${failCount}/${totalTests} (${Math.round((failCount / totalTests) * 100)}%)`
    );
    console.log(`\nSUCCESS RATE: ${successRate}%`);

    if (successRate >= 90) {
      console.log(`\n🎉 PRODUCTION READY! System meets production readiness criteria.`);
    } else if (successRate >= 75) {
      console.log(`\n⚠️  MOSTLY READY: System is mostly production ready with some warnings.`);
    } else {
      console.log(`\n❌ NOT READY: System needs attention before production deployment.`);
    }

    console.log('\nDETAILED RESULTS:');
    console.log('-'.repeat(60));

    for (const result of this.results) {
      const statusIcon =
        result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️ ' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`${statusIcon} ${result.component}: ${result.message}${duration}`);

      if (result.details && Object.keys(result.details).length > 0) {
        console.log(`   Details: ${JSON.stringify(result.details)}`);
      }
    }

    // Export detailed report
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passCount,
        warningCount,
        failCount,
        successRate
      },
      results: this.results,
      conclusion:
        successRate >= 90 ? 'PRODUCTION_READY' : successRate >= 75 ? 'MOSTLY_READY' : 'NOT_READY'
    };

    try {
      const fs = await import('fs/promises');
      await fs.mkdir('./verification-exports', { recursive: true });
      await fs.writeFile(
        `./verification-exports/production-readiness-report-${Date.now()}.json`,
        JSON.stringify(reportData, null, 2)
      );
      console.log('\n📄 Detailed report exported to verification-exports/');
    } catch (error) {
      console.log(`\n⚠️  Could not export report: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
  }

  private async cleanup(): Promise<void> {
    try {
      // Clean up test device if created
      if (this.testDeviceId) {
        const { removeDevice } = await import('../src/lib/storage/index.js');
        await removeDevice(this.testUserId, this.testDeviceId);
      }

      // Clean up any remaining test data
      try {
        for (let i = 0; i < 20; i++) {
          await remove(`perf-test-${i}`);
          await remove(`load-test-${i}`);
        }
      } catch (error) {
        // Ignore cleanup errors
      }

      stopMonitoring();
    } catch (error) {
      console.log(`⚠️  Cleanup warning: ${error.message}`);
    }
  }

  private addResult(
    component: string,
    status: 'PASS' | 'FAIL' | 'WARNING',
    message: string,
    details?: any,
    duration?: number
  ): void {
    this.results.push({
      component,
      status,
      message,
      details,
      duration
    });
  }
}

// Run verification if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new ProductionVerifier();
  verifier.runVerification().catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

export { ProductionVerifier };
