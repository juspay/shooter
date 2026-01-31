# SHOOTER Testing Procedures Guide

## Overview

This document provides comprehensive guidelines for testing the SHOOTER notification system. Our testing strategy covers unit tests, integration tests, performance testing, accessibility testing, security testing, and more.

## Test Architecture

### Testing Stack

- **Unit Testing**: Jest with Supertest for API testing
- **Browser Testing**: Puppeteer for automated browser testing
- **Performance Testing**: Custom Puppeteer-based performance monitoring
- **Accessibility Testing**: Custom a11y validation scripts
- **Code Quality**: ESLint + Prettier with pre-commit hooks
- **Build System**: Bun for fast test execution

### Test Categories

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: API endpoint testing
3. **End-to-End Tests**: Full workflow testing
4. **Performance Tests**: Load and response time testing
5. **Accessibility Tests**: WCAG compliance testing
6. **Security Tests**: Vulnerability and configuration testing
7. **Browser Compatibility Tests**: Cross-browser validation
8. **Mobile Responsiveness Tests**: Multi-device testing

## Test Scripts Overview

### Core Test Commands

```bash
# Run all tests
bun run test

# Run quality checks (lint + format + test)
bun run quality

# Run full verification suite
bun run verify

# Individual test categories
bun run test:mobile          # Mobile responsiveness
bun run test:browsers        # Browser compatibility
bun run test:accessibility   # Accessibility compliance
bun run test:performance     # Performance benchmarks
```

### Development Workflow

```bash
# Before committing (automated via pre-commit hook)
bun run lint                 # Check code style
bun run format:check         # Check formatting
bun run test                 # Run unit tests
bun run type-check           # TypeScript validation
bun run build:css            # Build optimized CSS

# Manual testing
bun run dev                  # Start development server
bun run screenshot           # Take visual verification screenshots
```

## Testing Standards

### Test Coverage Requirements

- **Unit Tests**: Minimum 80% code coverage
- **API Endpoints**: 100% endpoint coverage
- **Error Scenarios**: All error paths tested
- **Performance**: All pages under 3s load time
- **Accessibility**: Minimum 80% compliance score
- **Browser Support**: Chrome, Safari, Firefox, Edge

### Test Data Standards

```javascript
// Example test data structure
const testNotification = {
  title: 'Test Notification',
  message: 'This is a test message',
  timestamp: new Date().toISOString(),
  category: 'test'
};

// Error simulation
const errorTestCases = [
  { title: 'ERROR_TEST', expectedStatus: 500 },
  { title: 'TIMEOUT_TEST', expectedStatus: 408 },
  { title: 'RATE_LIMIT_TEST', expectedStatus: 429 }
];
```

## Detailed Test Categories

### 1. Unit Tests (`tests/server-bun.test.js`)

**Purpose**: Test individual server components and API endpoints

**Coverage**:

- ✅ Server startup and port binding
- ✅ Homepage route functionality
- ✅ Dashboard route functionality
- ✅ Health API endpoint
- ✅ Notification API endpoint
- ✅ Static file serving
- ✅ 404 error handling

**Example Test**:

```javascript
test('should return healthy status from health endpoint', async () => {
  const response = await request(app).get('/api/health').expect(200);

  expect(response.body.status).toBe('healthy');
  expect(response.body.message).toContain('WORKING');
});
```

### 2. Error Handling Tests (`tests/error-handling.test.js`)

**Purpose**: Validate error scenarios and edge cases

**Coverage**:

- ✅ API error responses (400, 500, 408, 429)
- ✅ HTTP method validation
- ✅ Payload size limits
- ✅ Content type handling
- ✅ Malformed request handling
- ✅ Security headers validation

**Key Scenarios**:

```javascript
// Test error simulation
{
  title: 'ERROR_TEST';
} // → 500 Internal Server Error
{
  title: 'TIMEOUT_TEST';
} // → 408 Request Timeout
{
  title: 'RATE_LIMIT_TEST';
} // → 429 Rate Limit Exceeded
```

### 3. CORS Tests (`tests/cors.test.js`)

**Purpose**: Validate Cross-Origin Resource Sharing configuration

**Coverage**:

- ✅ Allowed origins validation
- ✅ Preflight request handling
- ✅ Credentials support
- ✅ Security origin filtering
- ✅ Custom headers support

**Allowed Origins**:

- `http://localhost:3000` (Development)
- `http://localhost:5173` (Vite)
- `http://localhost:7777` (Local server)
- `https://shooter-notifications.vercel.app` (Production)

### 4. Mobile Responsiveness Tests (`scripts/test-mobile-responsiveness.js`)

**Purpose**: Validate responsive design across device sizes

**Test Viewports**:

- **Mobile Portrait**: 375×667 (iPhone SE)
- **Mobile Landscape**: 667×375 (iPhone SE Landscape)
- **Tablet Portrait**: 768×1024 (iPad)
- **Tablet Landscape**: 1024×768 (iPad Landscape)
- **Desktop**: 1200×800 (Standard Desktop)

**Validation Checks**:

- Layout adaptation (column vs row)
- Grid responsiveness (single vs multi-column)
- Scrolling behavior
- Touch target sizes
- Text readability

### 5. Browser Compatibility Tests (`scripts/test-browser-compatibility.js`)

**Purpose**: Ensure consistent behavior across browsers

**Browser Matrix**:

- Chrome Desktop (latest)
- Safari Desktop (latest)
- Firefox Desktop (latest)
- Edge Desktop (latest)
- Chrome Mobile (iOS)
- Safari Mobile (iOS)

**CSS Feature Testing**:

- ✅ CSS Custom Properties (variables)
- ✅ CSS Grid Layout
- ✅ Flexbox Layout
- ✅ Border Radius
- ✅ Box Shadow
- ✅ CSS Transitions
- ✅ Media Queries
- ✅ Backdrop Filter

### 6. Accessibility Tests (`scripts/test-accessibility.js`)

**Purpose**: Ensure WCAG 2.1 compliance and inclusive design

**Test Categories**:

- **Semantic HTML**: Proper HTML5 elements
- **Heading Hierarchy**: Logical h1→h6 structure
- **Alt Text**: Image accessibility
- **Focus Management**: Keyboard navigation
- **Color Contrast**: Sufficient contrast ratios
- **Form Labels**: Proper input labeling
- **ARIA Attributes**: Screen reader support
- **Keyboard Navigation**: Tab order and shortcuts

**Current Score**: 82% (Excellent)

**Remaining Issues**:

- Add `<main>` element to homepage
- Improve heading hierarchy

### 7. Performance Tests (`scripts/test-performance.js`)

**Purpose**: Monitor and optimize application performance

**Test Categories**:

#### Page Load Performance

- **Threshold**: < 3000ms
- **Current**: ✅ Homepage: 582ms, Dashboard: 997ms

#### API Performance

- **Threshold**: < 500ms
- **Current**: ⚠️ Health: 999ms, Notify: 6ms

#### Asset Performance

- **Threshold**: < 1000ms
- **Current**: ⚠️ CSS: 993ms, HTML files: >1000ms

#### Concurrent Load Testing

- **Test**: 5 simultaneous requests
- **Current**: ✅ 100% success rate, 665ms average

**Performance Score**: 61% (Good)

**Recommendations**:

- Implement API response caching
- Enable gzip compression for static assets
- Add CDN for asset delivery

## Screenshot Testing

### Automated Visual Verification

**Scripts**:

- `scripts/take-screenshots.js` - Basic verification
- `scripts/test-mobile-responsiveness.js` - Mobile screenshots
- `scripts/test-browser-compatibility.js` - Browser screenshots
- `scripts/test-accessibility.js` - Accessibility screenshots

**Screenshot Categories**:

1. **Verification Screenshots**: Homepage, Dashboard, API responses
2. **Mobile Screenshots**: 5 viewports × 2 pages = 10 screenshots
3. **Browser Screenshots**: 6 browsers × 2 pages = 12 screenshots
4. **Accessibility Screenshots**: Visual verification of a11y features

**Storage Structure**:

```
screenshots/
├── homepage-verified-working.png
├── dashboard-verified-working.png
├── api-health-response.png
├── mobile-tests/
│   ├── mobile-portrait-homepage.png
│   ├── tablet-landscape-dashboard.png
│   └── mobile-responsiveness-report.json
├── browser-tests/
│   ├── chrome-desktop-homepage.png
│   ├── safari-mobile-dashboard.png
│   └── browser-compatibility-report.json
└── accessibility-tests/
    ├── accessibility-homepage.png
    └── accessibility-report.json
```

## Quality Gates

### Pre-commit Requirements (Automated)

All commits must pass:

1. ✅ ESLint code style checks
2. ✅ Prettier formatting validation
3. ✅ Unit test suite (100% pass rate)
4. ✅ TypeScript type checking
5. ✅ CSS minification build

### Deployment Requirements

Before production deployment:

1. ✅ All unit tests passing
2. ✅ All integration tests passing
3. ✅ Performance score > 60%
4. ✅ Accessibility score > 80%
5. ✅ Browser compatibility verified
6. ✅ Mobile responsiveness verified
7. ✅ Security scan completed

## Continuous Integration

### Test Automation Pipeline

```yaml
# Example CI configuration
steps:
  - name: Install Dependencies
    run: bun install

  - name: Lint and Format Check
    run: bun run quality

  - name: Unit Tests
    run: bun run test

  - name: Build CSS
    run: bun run build:css

  - name: Performance Tests
    run: bun run test:performance

  - name: Accessibility Tests
    run: bun run test:accessibility

  - name: Browser Tests
    run: bun run test:browsers

  - name: Mobile Tests
    run: bun run test:mobile

  - name: Deploy Verification
    run: bun run verify
```

## Test Data Management

### Mock Data Standards

```javascript
// Standard test notification
const mockNotification = {
  title: 'Test Notification',
  message: 'This is a test message for validation',
  category: 'test',
  timestamp: '2025-01-18T12:00:00.000Z'
};

// Performance test payloads
const performanceTestData = {
  small: { title: 'Small', message: 'Test' },
  medium: { title: 'Medium', message: 'A'.repeat(1000) },
  large: { title: 'Large', message: 'A'.repeat(10000) }
};
```

### Test Environment Setup

```bash
# Required environment variables for testing
PORT=7777
NODE_ENV=test

# Optional for extended testing
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_DETAILED_LOGGING=true
```

## Performance Monitoring

### Key Metrics Tracked

1. **Load Time Metrics**:
   - First Contentful Paint (FCP)
   - Largest Contentful Paint (LCP)
   - Dom Content Loaded (DCL)
   - Load Complete

2. **API Metrics**:
   - Response time per endpoint
   - Success/error rates
   - Concurrent request handling

3. **Asset Metrics**:
   - CSS load time
   - HTML parsing time
   - Resource count and sizes

### Performance Thresholds

```javascript
const performanceThresholds = {
  pageLoad: 3000, // 3 seconds
  apiResponse: 500, // 500ms
  assetLoad: 1000, // 1 second
  firstContentfulPaint: 2000, // 2 seconds
  largestContentfulPaint: 4000, // 4 seconds
  cumulativeLayoutShift: 0.1 // Layout stability
};
```

## Debugging Failed Tests

### Common Issues and Solutions

1. **Port Already in Use**:

   ```bash
   # Kill existing server
   lsof -ti:7777 | xargs kill -9
   ```

2. **Puppeteer Launch Issues**:

   ```bash
   # Install dependencies
   bun add puppeteer
   # Check Chrome availability
   node -e "console.log(require('puppeteer').executablePath())"
   ```

3. **Screenshot Directory Issues**:

   ```bash
   # Create required directories
   mkdir -p screenshots/{mobile-tests,browser-tests,accessibility-tests,performance-tests}
   ```

4. **Permission Issues**:
   ```bash
   # Make scripts executable
   chmod +x scripts/*.js
   chmod +x .husky/pre-commit
   ```

## Test Reporting

### Report Formats

All test suites generate detailed JSON reports:

1. **Mobile Report**: `screenshots/mobile-tests/mobile-responsiveness-report.json`
2. **Browser Report**: `screenshots/browser-tests/browser-compatibility-report.json`
3. **Accessibility Report**: `screenshots/accessibility-tests/accessibility-report.json`
4. **Performance Report**: `screenshots/performance-tests/performance-report.json`

### Report Analysis

```javascript
// Example report structure
{
  "timestamp": "2025-01-18T12:00:00.000Z",
  "totalTests": 10,
  "successful": 9,
  "failed": 1,
  "scores": {
    "overall": 90,
    "performance": 85,
    "accessibility": 95
  },
  "results": [/* detailed test results */]
}
```

## Future Testing Enhancements

### Planned Additions

1. **Load Testing**: Stress testing with multiple concurrent users
2. **Security Testing**: Automated vulnerability scanning
3. **API Testing**: Extended API validation and contract testing
4. **Visual Regression**: Automated visual diff testing
5. **Integration Testing**: Full end-to-end workflow testing

### Tool Upgrades

1. **Test Framework**: Consider Playwright for advanced browser testing
2. **Performance**: Add Lighthouse integration for detailed audits
3. **Accessibility**: Add axe-core for comprehensive a11y testing
4. **Security**: Add OWASP ZAP for security scanning

---

## Quick Reference

### Essential Commands

```bash
# Development
bun run dev                    # Start server
bun run test                   # Run unit tests
bun run verify                 # Full verification

# Quality
bun run lint                   # Check code style
bun run format                 # Fix formatting
bun run quality                # Run all quality checks

# Specialized Testing
bun run test:mobile            # Mobile responsiveness
bun run test:browsers          # Browser compatibility
bun run test:accessibility     # Accessibility compliance
bun run test:performance       # Performance benchmarks

# Build & Deploy
bun run build:css              # Build optimized CSS
bun run screenshot             # Take verification screenshots
```

### Test File Locations

```
tests/
├── server-bun.test.js         # Unit tests
├── error-handling.test.js     # Error scenario tests
├── cors.test.js               # CORS configuration tests
└── verification.test.js       # Deployment verification

scripts/
├── test-mobile-responsiveness.js    # Mobile testing
├── test-browser-compatibility.js    # Browser testing
├── test-accessibility.js            # Accessibility testing
├── test-performance.js              # Performance testing
└── take-screenshots.js              # Visual verification
```

---

**Last Updated**: January 2025  
**Version**: 2.0.0  
**Maintainer**: SHOOTER Development Team
