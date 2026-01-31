# SHOOTER CSS Style Guide

## Overview

This style guide documents the SHOOTER design system CSS architecture implemented in `static/css/shooter-styles.css`. The design system provides a unified, maintainable, and scalable approach to styling across all SHOOTER application pages.

## Shared Utility Expectations (2025 Refresh)

- Use the `global-*` component classes (`global-card-*`, `global-button-*`, `global-input-base`, etc.) for layout and interaction patterns instead of bespoke selectors.
- Prefer utility helpers from `src/lib/styles/utilities.css` for spacing, flexbox, grid, and alignment before introducing new CSS.
- Route components must not include inline `style=` attributes, direct `font-*` declarations, or hard-coded hex values; rely on design tokens from `tokens.css`.
- Reusable visual feedback should use badge and status helpers (`global-badge-*`, `global-status-*`) rather than custom colors or animations.
- Any new styling primitives should live alongside existing utilities/components and be documented here before use.

## Design Principles

### 1. **Consistency**

- All colors, spacing, and typography use CSS custom properties (variables)
- Consistent naming conventions across all components
- Standardized responsive breakpoints

### 2. **Performance**

- CSS file is cached for 1 year with proper MIME types
- Optimized for mobile-first responsive design
- Minimal CSS resets for faster loading

### 3. **Accessibility**

- High contrast color scheme
- Focus states for all interactive elements
- Support for `prefers-reduced-motion` and `prefers-contrast`
- Semantic HTML structure support

## Color System

### Primary Colors

```css
--color-primary: #0066cc; /* Primary blue */
--color-primary-hover: #0052a3; /* Darker blue for hover states */
--color-success: #00ff88; /* Success green */
```

### Background Colors

```css
--color-background: #000; /* Main background (black) */
--color-surface: #1a1a1a; /* Card/surface background */
--color-surface-light: #333; /* Lighter surface elements */
```

### Text Colors

```css
--color-text: #fff; /* Primary text (white) */
--color-text-muted: #ccc; /* Secondary text */
--color-text-subtle: #999; /* Subtle text (timestamps, etc.) */
```

## Typography Scale

### Font Family

```css
--font-family-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
```

### Font Sizes

```css
--font-size-xs: 0.8rem; /* 12.8px */
--font-size-sm: 0.9rem; /* 14.4px */
--font-size-base: 1rem; /* 16px */
--font-size-lg: 1.1rem; /* 17.6px */
--font-size-xl: 1.2rem; /* 19.2px */
--font-size-2xl: 1.8rem; /* 28.8px */
--font-size-3xl: 2.5rem; /* 40px */
--font-size-4xl: 3rem; /* 48px */
```

## Spacing System

### Spacing Scale

```css
--spacing-xs: 0.25rem; /* 4px */
--spacing-sm: 0.5rem; /* 8px */
--spacing-md: 1rem; /* 16px */
--spacing-lg: 1.5rem; /* 24px */
--spacing-xl: 2rem; /* 32px */
--spacing-2xl: 3rem; /* 48px */
```

## Component Documentation

### Header Components

#### `.header`

Main page header with centered content and bottom border.

```html
<header class="header">
  <h1>🎯 SHOOTER</h1>
  <div class="status">✅ System Online</div>
</header>
```

#### `.status`

Status indicator with rounded corners and success color.

```html
<div class="status">✅ Express Server - ACTUALLY WORKING!</div>
```

### Button Components

#### `.btn`

Primary button component with hover effects and transitions.

```html
<button class="btn" onclick="handleClick()">📊 View Dashboard</button>
```

**States:**

- Default: Blue background with white text
- Hover: Darker blue with slight upward movement
- Focus: Blue outline for accessibility

### Layout Components

#### `.main`

Main content container with maximum width and centering.

```html
<main class="main">
  <!-- Content -->
</main>
```

#### `.main.homepage`

Homepage-specific main container with center alignment.

```html
<main class="main homepage">
  <!-- Homepage content -->
</main>
```

### Card Components

#### `.feature`

Feature card component for showcasing functionality.

```html
<div class="feature">
  <div class="feature-icon">🔧</div>
  <h3>SHOOTER Integration</h3>
  <p>Automatic notifications when SHOOTER tools are used</p>
</div>
```

#### `.stat-card`

Statistics display card with large numbers.

```html
<div class="stat-card">
  <h3>📊 Total Notifications</h3>
  <div class="stat-value">127</div>
</div>
```

### Notification Components

#### `.notification-item`

Individual notification display component.

```html
<div class="notification-item">
  <div class="notification-icon">🔧</div>
  <div class="notification-content">
    <div class="notification-title">SHOOTER Tool Used</div>
    <div class="notification-time">2 minutes ago</div>
  </div>
</div>
```

## Layout Patterns

### Grid Layouts

- **Features Grid**: `repeat(auto-fit, minmax(280px, 1fr))`
- **Stats Grid**: `repeat(auto-fit, minmax(200px, 1fr))`

### Flexbox Patterns

- **Button Groups**: Horizontal flex with gap
- **Notification Items**: Flex with icon and content areas

## Responsive Design

### Breakpoints

- **Mobile**: `max-width: 480px`
- **Tablet**: `max-width: 768px`
- **Desktop**: Default (no media query)

### Mobile-First Approach

```css
/* Mobile styles (default) */
.feature {
  padding: 1rem;
}

/* Tablet and up */
@media (max-width: 768px) {
  .features {
    grid-template-columns: 1fr;
  }
}
```

## Animation System

### Transitions

```css
--transition-fast: 0.2s ease;
--transition-medium: 0.3s ease;
```

### Animations

- **Pulse Animation**: Used for status indicators
- **Button Hover**: Subtle upward movement
- **Reduced Motion**: Respects user preferences

## Accessibility Features

### Focus Management

```css
.btn:focus,
button:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### High Contrast Support

```css
@media (prefers-contrast: high) {
  :root {
    --color-background: #000;
    --color-text: #fff;
  }
}
```

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  .status-dot {
    animation: none;
  }
}
```

## Usage Guidelines

### Do's

✅ Use CSS custom properties for all colors and spacing  
✅ Follow the established component patterns  
✅ Maintain responsive design principles  
✅ Include proper focus states for accessibility  
✅ Use semantic HTML structure

### Don'ts

❌ Use inline styles  
❌ Hardcode colors or spacing values  
❌ Break the established grid systems  
❌ Ignore accessibility requirements  
❌ Override core design tokens without reason

## File Structure

```
static/
├── css/
│   └── shooter-styles.css     # Main stylesheet
├── working-homepage.html      # Homepage (uses external CSS)
└── working-dashboard.html     # Dashboard (uses external CSS)
```

## Browser Support

The CSS is designed to work with modern browsers including:

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Performance Considerations

- **Caching**: CSS files cached for 1 year
- **MIME Types**: Proper `text/css` content type
- **File Size**: Optimized for minimal download size
- **Critical CSS**: All styles in single file for reduced requests

## Future Enhancements

### Planned Features

- [ ] Dark/Light theme toggle
- [ ] CSS minification for production
- [ ] PostCSS build process
- [ ] Additional component variants
- [ ] Advanced animation system

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Maintainer**: SHOOTER Development Team
