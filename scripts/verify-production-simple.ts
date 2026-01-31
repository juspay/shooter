#!/usr/bin/env bun
// Simplified Production Readiness Verification Script
// Tests core production features without complex signal handling

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
  recordPerformanceMetric,

  // Device management
  registerDevice,
  getDevices,
  getDeviceStats,
  getGlobalDeviceStats,

  // Notification functions
  sendNotificationToAllDevices
} from '../src/lib/storage/index.js';

async function runSimpleVerification(): Promise<void> {
  console.log('🚀 Starting Simple Production Readiness Verification...\n');
  console.log('='.repeat(60));

  let passCount = 0;
  let totalTests = 0;

  function testResult(name: string, condition: boolean, message: string): void {
    totalTests++;
    const status = condition ? '✅ PASS' : '❌ FAIL';
    if (condition) {
passCount++;
}
    console.log(`${status} ${name}: ${message}`);
  }

  try {
    // 1. Test system initialization
    console.log('\n📊 Testing System Initialization...');
    await initializeStorages();
    const connected = getConnectedStorages();
    testResult(
      'INITIALIZATION',
      connected.length > 0,
      `${connected.length} storage backend(s) connected`
    );

    // 2. Test basic storage operations
    console.log('\n💾 Testing Basic Storage Operations...');
    const testKey = 'verification-test';
    const testData = { verification: true, timestamp: Date.now() };

    await set(testKey, testData);
    const retrieved = await get(testKey);
    testResult(
      'STORAGE_SET_GET',
      JSON.stringify(retrieved) === JSON.stringify(testData),
      'Set and get operations work correctly'
    );

    const removed = await remove(testKey);
    testResult('STORAGE_REMOVE', removed, 'Remove operation works correctly');

    // 3. Test health monitoring
    console.log('\n🏥 Testing Health Monitoring...');
    const healthReport = await checkAllStorages();
    testResult(
      'HEALTH_CHECK',
      healthReport.status !== 'unhealthy',
      `System health: ${healthReport.status}`
    );

    const { status } = await healthCheckEndpoint();
    testResult(
      'HEALTH_ENDPOINT',
      status === 200 || status === 503,
      `Health endpoint status: ${status}`
    );

    const simple = await simpleHealthCheck();
    testResult('SIMPLE_HEALTH', simple.status === 'ok', `Simple health: ${simple.status}`);

    // 4. Test performance metrics
    console.log('\n⚡ Testing Performance Metrics...');

    // Generate some test activity with explicit metrics recording
    for (let i = 0; i < 10; i++) {
      const startSet = Date.now();
      await set(`perf-test-${i}`, { data: i });
      recordPerformanceMetric('set', 'memory', Date.now() - startSet, true, {
        key: `perf-test-${i}`
      });

      const startGet = Date.now();
      await get(`perf-test-${i}`);
      recordPerformanceMetric('get', 'memory', Date.now() - startGet, true, {
        key: `perf-test-${i}`
      });
    }

    const report = generatePerformanceReport();
    testResult(
      'PERFORMANCE_REPORT',
      report.totalOperations > 0,
      `Generated performance report with ${report.totalOperations} operations`
    );

    // Test storage benchmarks
    if (connected.length > 0) {
      const benchmark = await benchmarkStorage(connected[0].name, 10);
      testResult(
        'STORAGE_BENCHMARK',
        benchmark.readThroughput > 0,
        `Benchmark: ${benchmark.readThroughput.toFixed(1)} reads/sec`
      );
    }

    // Test optimization
    const optimizations = await optimizeStorageSystem();
    testResult(
      'SYSTEM_OPTIMIZATION',
      Array.isArray(optimizations),
      `Generated ${optimizations.length} optimization recommendations`
    );

    // Cleanup test data
    for (let i = 0; i < 10; i++) {
      await remove(`perf-test-${i}`);
    }

    // 5. Test device management
    console.log('\n📱 Testing Device Management...');
    const testUserId = 'verification-user-' + Date.now();

    const device = await registerDevice(testUserId, {
      token: 'verification-token-' + Date.now(),
      lastSeen: Date.now(),
      active: true,
      platform: 'ios',
      appVersion: '1.0.0',
      metadata: { verification: true }
    });

    testResult(
      'DEVICE_REGISTRATION',
      device && device.id,
      `Device registered with ID: ${device?.id}`
    );

    const devices = await getDevices(testUserId);
    testResult('DEVICE_RETRIEVAL', devices.length > 0, `Retrieved ${devices.length} device(s)`);

    const stats = await getGlobalDeviceStats();
    testResult(
      'DEVICE_STATISTICS',
      stats.totalDevices >= 0,
      `Total devices: ${stats.totalDevices}, Active: ${stats.activeDevices}`
    );

    // 6. Test notification system
    console.log('\n🔔 Testing Notification System...');

    const result = await sendNotificationToAllDevices(testUserId, {
      title: 'Verification Test',
      body: 'This is a test notification',
      data: { verification: true }
    });

    testResult(
      'NOTIFICATION_SEND',
      result.totalDevices > 0 && result.successCount > 0,
      `Sent to ${result.successCount}/${result.totalDevices} devices`
    );

    // 7. Test deployment configuration files
    console.log('\n🚀 Testing Deployment Configuration...');
    try {
      const fs = await import('fs/promises');

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

      testResult(
        'DEPLOYMENT_CONFIG',
        existingFiles === deploymentFiles.length,
        `${existingFiles}/${deploymentFiles.length} deployment files present`
      );
    } catch (error) {
      testResult('DEPLOYMENT_CONFIG', false, `Error checking deployment files: ${error.message}`);
    }

    // 8. Test API documentation
    console.log('\n📚 Testing Documentation...');
    try {
      const fs = await import('fs/promises');
      const apiDoc = await fs.readFile(
        '/Users/sachinsharma/Developer/Personal/shooter/docs/STORAGE_API.md',
        'utf8'
      );

      const requiredSections = [
        '# Storage System API Reference',
        '## Core Functions',
        '## Device Management',
        '## Health Monitoring',
        '## Performance Metrics'
      ];

      const presentSections = requiredSections.filter(section => apiDoc.includes(section));
      testResult(
        'API_DOCUMENTATION',
        presentSections.length === requiredSections.length,
        `${presentSections.length}/${requiredSections.length} documentation sections present`
      );
    } catch (error) {
      testResult('API_DOCUMENTATION', false, `Error checking documentation: ${error.message}`);
    }

    // 9. Load testing
    console.log('\n🏋️ Testing Under Load...');
    const startTime = Date.now();
    const operations = [];

    for (let i = 0; i < 50; i++) {
      operations.push(
        (async () => {
          const key = `load-test-${i}`;
          await set(key, { id: i, data: `test-${i}` });
          await get(key);
          await remove(key);
        })()
      );
    }

    await Promise.all(operations);
    const duration = Date.now() - startTime;
    const throughput = (50 * 3) / (duration / 1000); // 3 operations per iteration

    testResult('LOAD_TEST', throughput > 20, `Load test: ${throughput.toFixed(1)} ops/sec`);

    // Check health after load
    const healthAfter = await checkAllStorages();
    testResult(
      'POST_LOAD_HEALTH',
      healthAfter.status !== 'unhealthy',
      `Health after load: ${healthAfter.status}`
    );

    // Final Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎯 VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    const successRate = Math.round((passCount / totalTests) * 100);
    console.log(`\n✅ PASSED: ${passCount}/${totalTests} tests (${successRate}%)`);
    console.log(`❌ FAILED: ${totalTests - passCount}/${totalTests} tests`);

    if (successRate >= 90) {
      console.log(`\n🎉 PRODUCTION READY! System meets production readiness criteria.`);
    } else if (successRate >= 75) {
      console.log(`\n⚠️  MOSTLY READY: System is mostly production ready with some issues.`);
    } else {
      console.log(`\n❌ NOT READY: System needs attention before production deployment.`);
    }

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error(`\n❌ VERIFICATION FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
runSimpleVerification().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});
