# Screenshots

This directory contains comprehensive screenshots of all Shooter application pages at all supported responsive breakpoints.

## Directory Structure

```
screenshots/
├── mobile/       (12 screenshots - 375x667px)
├── tablet/       (12 screenshots - 768x1024px)
├── laptop/       (12 screenshots - 1024x768px)
└── desktop/      (12 screenshots - 1920x1080px)
```

**Total: 48 screenshots** (12 pages × 4 breakpoints)

## Breakpoints

The breakpoints match the application's CSS media queries:

| Breakpoint | Dimensions | Device Reference | Media Query |
|------------|------------|------------------|-------------|
| **Mobile** | 375×667px | iPhone SE | ≤480px |
| **Tablet** | 768×1024px | iPad Portrait | ≤768px |
| **Laptop** | 1024×768px | Small Laptop | ≤1024px |
| **Desktop** | 1920×1080px | Standard Desktop | ≥1200px |

All screenshots are captured at 2x deviceScaleFactor (Retina quality) as full-page screenshots.

## Pages Captured

1. **Homepage** (`/`) - Landing page
2. **Analytics** (`/analytics`) - Analytics dashboard
3. **Config** (`/config`) - Configuration page
4. **Dashboard** (`/dashboard`) - Main SHOOTER analytics dashboard
5. **Integrations** (`/integrations`) - Integrations overview
6. **Integrations - Claude** (`/integrations/claude`) - Claude integration settings
7. **Notifications** (`/notifications`) - Notification history
8. **Notifications - Settings** (`/notifications/settings`) - Notification preferences
9. **System Monitoring** (`/system-monitoring`) - System monitoring overview
10. **System Monitoring - Admin** (`/system-monitoring/admin`) - Admin controls
11. **System Monitoring - Config** (`/system-monitoring/config`) - System configuration
12. **System Monitoring - Debug** (`/system-monitoring/debug`) - Debug tools

## File Naming Convention

Screenshots follow the pattern: `{page-name}.png`

Examples:
- `homepage.png` - Root page (`/`)
- `dashboard.png` - Dashboard page (`/dashboard`)
- `integrations-claude.png` - Nested route (`/integrations/claude`)
- `system-monitoring-admin.png` - Nested route (`/system-monitoring/admin`)

## Regenerating Screenshots

To regenerate all screenshots:

1. **Start the development server:**
   ```bash
   bun run dev --port 7777
   ```

2. **Run the screenshot script:**
   ```bash
   node scripts/take-screenshots.js
   ```

The script will:
- Create/verify directory structure
- Launch headless Chromium browser
- Visit each page at each breakpoint
- Capture full-page screenshots
- Save organized by breakpoint

## Screenshot Script

The automated screenshot generation script is located at `scripts/take-screenshots.js`.

**Features:**
- Playwright-based automation
- Full-page screenshots with scroll
- Retina quality (2x deviceScaleFactor)
- Waits for network idle before capture
- Error handling for failed pages
- Progress logging

**Configuration:**
```javascript
const BREAKPOINTS = {
  mobile: { width: 375, height: 667, name: 'mobile' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  laptop: { width: 1024, height: 768, name: 'laptop' },
  desktop: { width: 1920, height: 1080, name: 'desktop' }
};
```

## Use Cases

These screenshots serve as:
- **Visual regression testing** - Compare before/after changes
- **Design reference** - Document current UI state
- **Responsive design validation** - Verify layout at all breakpoints
- **Documentation** - Visual guide for new developers
- **QA testing** - Manual testing reference
- **Client presentations** - Show application appearance

## Maintenance

Screenshots should be regenerated when:
- Major UI changes are deployed
- New pages are added to the application
- Responsive breakpoints are modified
- Design system tokens are updated
- Before major releases

Last generated: 2025-11-11
