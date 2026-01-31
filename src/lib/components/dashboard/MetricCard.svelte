<!--
  MetricCard - Dashboard metric display component
  Features: Animated counters, trend indicators, customizable styling
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { ShooterBadge } from '$lib/components/shooter';
  
  // Props
  export let title: string;
  export let value: number | string;
  export let previousValue: number | null = null;
  export let unit = '';
  export let icon: string | null = null;
  export let trend: 'up' | 'down' | 'neutral' | null = null;
  export let trendPercentage: number | null = null;
  export let color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let loading = false;
  export let animated = true;
  export let clickable = false;
  export let subtitle: string | null = null;
  export let formatValue = true;
  
  // Internal state
  let displayValue: number | string = 0;
  let mounted = false;
  
  // Animation duration based on size
  $: animationDuration = size === 'sm' ? 800 : size === 'md' ? 1200 : 1600;
  
  // Format large numbers
  function formatNumber(num: number): string {
    if (!formatValue || typeof num !== 'number') {
return String(num);
}
    
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
  
  // Animate number counter
  function animateValue(start: number, end: number, duration: number) {
    if (!animated || !mounted) {
      displayValue = formatValue ? formatNumber(end) : end;
      return;
    }
    
    const startTime = performance.now();
    const difference = end - start;
    
    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = start + (difference * easeOutQuart);
      
      displayValue = formatValue ? formatNumber(Math.round(current)) : Math.round(current);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    
    requestAnimationFrame(step);
  }
  
  // Calculate trend
  $: if (mounted && typeof value === 'number') {
    const numValue = value;
    const startValue = displayValue === 0 ? 0 : (typeof displayValue === 'string' ? 0 : displayValue);
    animateValue(typeof startValue === 'number' ? startValue : 0, numValue, animationDuration);
  }
  
  // Calculate trend percentage
  $: calculatedTrendPercentage = (() => {
    if (trendPercentage !== null) {
return trendPercentage;
}
    if (previousValue === null || typeof value !== 'number') {
return null;
}
    if (previousValue === 0) {
return value > 0 ? 100 : 0;
}
    return ((value - previousValue) / Math.abs(previousValue)) * 100;
  })();
  
  // Determine trend direction
  $: calculatedTrend = (() => {
    if (trend !== null) {
return trend;
}
    if (calculatedTrendPercentage === null) {
return null;
}
    if (calculatedTrendPercentage > 0) {
return 'up';
}
    if (calculatedTrendPercentage < 0) {
return 'down';
}
    return 'neutral';
  })();
  
  // Get trend icon
  function getTrendIcon(trendDirection: typeof calculatedTrend): string {
    switch (trendDirection) {
      case 'up': return '📈';
      case 'down': return '📉';
      case 'neutral': return '➡️';
      default: return '';
    }
  }
  
  // Get trend color
  function getTrendColor(trendDirection: typeof calculatedTrend): 'success' | 'error' | 'neutral' {
    switch (trendDirection) {
      case 'up': return 'success';
      case 'down': return 'error';
      default: return 'neutral';
    }
  }
  
  onMount(() => {
    mounted = true;
    if (typeof value === 'string') {
      displayValue = value;
    }
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="metric-card metric-card--{size} metric-card--{color}"
  class:metric-card--clickable={clickable}
  class:metric-card--loading={loading}
  role={clickable ? 'button' : undefined}
  tabindex={clickable ? 0 : undefined}
  on:click
  on:keydown={(e) => {
    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.currentTarget.click();
    }
  }}
>
  {#if loading}
    <div class="metric-loading">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading...</span>
    </div>
  {:else}
    <!-- Header -->
    <div class="metric-header">
      {#if icon}
        <div class="metric-icon" aria-hidden="true">
          {icon}
        </div>
      {/if}
      
      <div class="metric-title-section">
        <h3 class="metric-title">{title}</h3>
        {#if subtitle}
          <p class="metric-subtitle">{subtitle}</p>
        {/if}
      </div>
      
      {#if calculatedTrend && calculatedTrendPercentage !== null}
        <div class="metric-trend">
          <ShooterBadge 
            variant={getTrendColor(calculatedTrend)} 
            size="sm"
            outlined
          >
            {getTrendIcon(calculatedTrend)} {Math.abs(calculatedTrendPercentage).toFixed(1)}%
          </ShooterBadge>
        </div>
      {/if}
    </div>
    
    <!-- Value -->
    <div class="metric-value">
      <span class="metric-number" aria-live="polite">
        {displayValue}
      </span>
      {#if unit}
        <span class="metric-unit">{unit}</span>
      {/if}
    </div>
    
    <!-- Footer (optional slot) -->
    {#if $$slots.footer}
      <div class="metric-footer">
        <slot name="footer" />
      </div>
    {/if}
  {/if}
</div>

<style>
  /* Import Shooter design system */

  .metric-card {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    transition: all var(--transition-base);
    position: relative;
    overflow: hidden;
  }
  
  .metric-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--status-color-info);
    transition: opacity var(--transition-base);
    opacity: 0;
  }
  
  .metric-card--primary::before {
    background: var(--status-color-info);
  }
  
  .metric-card--success::before {
    background: var(--status-color-success);
  }
  
  .metric-card--warning::before {
    background: var(--status-color-warning);
  }
  
  .metric-card--error::before {
    background: var(--status-color-error);
  }
  
  .metric-card--info::before {
    background: var(--status-color-info-primary);
  }
  
  .metric-card--neutral::before {
    background: var(--text-color-tertiary);
  }
  
  .metric-card:hover::before {
    opacity: 1;
  }
  
  .metric-card--clickable {
    cursor: pointer;
  }
  
  .metric-card--clickable:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--border-color-focus);
  }
  
  .metric-card--clickable:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  
  /* Size variants */
  .metric-card--sm {
    padding: var(--spacing-md);
    gap: var(--spacing-xs);
  }
  
  .metric-card--lg {
    padding: var(--spacing-xl);
    gap: var(--spacing-md);
  }
  
  /* Loading state */
  .metric-card--loading {
    justify-content: center;
    align-items: center;
    min-height: 120px;
  }
  
  .metric-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
  }
  
  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-color-primary);
    border-top-color: var(--status-color-info);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Header */
  .metric-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    justify-content: space-between;
  }
  
  .metric-icon {

    flex-shrink: 0;
  }

  .metric-title-section {
    flex: 1;
    min-width: 0;
  }
  
  .metric-title {
    margin: 0;
  }

  .metric-subtitle {
    margin: var(--spacing-xxs) 0 0;
  }
  
  .metric-trend {
    flex-shrink: 0;
  }
  
  /* Value */
  .metric-value {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xxs);
  }
  
  .metric-number {
    font-variant-numeric: tabular-nums;
  }

  /* Footer */
  .metric-footer {
    border-top: 1px solid var(--border-color-primary);
    padding-top: var(--spacing-xs);
    margin-top: var(--spacing-xxs);
  }
  
  /* Color variants - border accent */
  .metric-card--primary:hover {
    border-color: var(--status-color-info);
  }
  
  .metric-card--success:hover {
    border-color: var(--status-color-success);
  }
  
  .metric-card--warning:hover {
    border-color: var(--status-color-warning);
  }
  
  .metric-card--error:hover {
    border-color: var(--status-color-error);
  }
  
  .metric-card--info:hover {
    border-color: var(--status-color-info-primary);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .metric-card {
      padding: var(--spacing-sm);
      gap: var(--spacing-xs);
    }
    
    .metric-card--lg {
      padding: var(--spacing-md);
      gap: var(--spacing-sm);
    }
    
    .metric-header {
      gap: var(--spacing-xs);
    }

    .metric-card--clickable:hover {
      transform: none;
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .metric-card {
      border-width: 2px;
    }
    
    .metric-card::before {
      height: 4px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .metric-card,
    .metric-card--clickable:hover {
      transition: none;
      transform: none;
    }
    
    .loading-spinner {
      animation: none;
    }
  }
</style>