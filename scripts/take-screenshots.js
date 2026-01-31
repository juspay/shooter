#!/usr/bin/env node

/**
 * Screenshot Generator
 * Takes screenshots of all pages at different breakpoints
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Breakpoints based on CSS media queries
const BREAKPOINTS = {
  mobile: { width: 375, height: 667, name: 'mobile' },      // iPhone SE
  tablet: { width: 768, height: 1024, name: 'tablet' },     // iPad portrait
  laptop: { width: 1024, height: 768, name: 'laptop' },     // Small laptop
  desktop: { width: 1920, height: 1080, name: 'desktop' }   // Standard desktop
};

// Pages to screenshot
const PAGES = [
  { path: '/', name: 'homepage' },
  { path: '/analytics', name: 'analytics' },
  { path: '/config', name: 'config' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/integrations', name: 'integrations' },
  { path: '/integrations/claude', name: 'integrations-claude' },
  { path: '/notifications', name: 'notifications' },
  { path: '/notifications/settings', name: 'notifications-settings' },
  { path: '/system-monitoring', name: 'system-monitoring' },
  { path: '/system-monitoring/admin', name: 'system-monitoring-admin' },
  { path: '/system-monitoring/config', name: 'system-monitoring-config' },
  { path: '/system-monitoring/debug', name: 'system-monitoring-debug' }
];

const BASE_URL = 'http://localhost:7777';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function ensureDirectories() {
  for (const breakpoint of Object.values(BREAKPOINTS)) {
    const dir = path.join(SCREENSHOT_DIR, breakpoint.name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

async function takeScreenshots() {
  console.log('🎯 Starting screenshot generation...\n');
  await ensureDirectories();

  const browser = await chromium.launch({
    headless: true
  });

  try {
    for (const breakpoint of Object.values(BREAKPOINTS)) {
      console.log(`📱 ${breakpoint.name.toUpperCase()} (${breakpoint.width}x${breakpoint.height})`);

      const context = await browser.newContext({
        viewport: {
          width: breakpoint.width,
          height: breakpoint.height
        },
        deviceScaleFactor: 1 // Retina display
      });

      const page = await context.newPage();

      // Listen for console messages
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log(`    🔴 Browser Error: ${msg.text()}`);
        }
      });

      // Listen for page errors
      page.on('pageerror', error => {
        console.log(`    ❌ Page Error: ${error.message}`);
      });

      // Listen for failed requests
      page.on('requestfailed', request => {
        console.log(`    ⚠️  Failed Request: ${request.url()}`);
      });

      for (const pageInfo of PAGES) {
        try {
          const url = `${BASE_URL}${pageInfo.path}`;
          console.log(`  📸 ${pageInfo.name}...`);

          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 15000
          });

          // Wait for the app to render - check for body content
          await page.waitForSelector('body', { state: 'attached', timeout: 5000 });

          // Wait for any content to appear (not just black screen)
          await page.waitForTimeout(2000);

          // Wait for CSS to be injected by checking if background is not black
          await page.waitForFunction(() => {
            const body = document.body;
            const bg = window.getComputedStyle(body).backgroundColor;
            return bg !== 'rgba(0, 0, 0, 0)' && bg !== '';
          }, { timeout: 5000 }).catch(() => {
            console.log('    ⚠️  Warning: Background color check timed out');
          });

          // Take full page screenshot
          const filename = `${pageInfo.name}.png`;
          const filepath = path.join(SCREENSHOT_DIR, breakpoint.name, filename);

          await page.screenshot({
            path: filepath,
            fullPage: true
          });

          console.log(`     ✅ Saved: ${breakpoint.name}/${filename}`);
        } catch (error) {
          console.log(`     ❌ Failed: ${pageInfo.name} - ${error.message}`);
        }
      }

      await context.close();
      console.log('');
    }
  } finally {
    await browser.close();
  }

  console.log('✨ Screenshot generation complete!\n');
  console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}`);
}

// Run the script
takeScreenshots().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
