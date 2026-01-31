<!--
  Chart - Lightweight chart component using vanilla Canvas
  Features: Line charts, bar charts, responsive, touch-friendly
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { ChartDataPoint, ChartOptions } from './index';

  // Props
  export let type: 'line' | 'bar' | 'area' = 'line';
  export let data: ChartDataPoint[] = [];
  export let width = 400;
  export let height = 200;
  export let options: ChartOptions = {};
  export let loading = false;
  export let title: string | null = null;
  export const subtitle: string | null = null;
  export const interactive: boolean = false;
  export const showLegend: boolean = false;
  export const error: string | null = null;

  // Default options
  const defaultOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    showGrid: true,
    showAxes: true,
    showLabels: true,
    showTooltip: true,
    animate: true,
    tension: 0.4
  };

  $: chartOptions = { ...defaultOptions, ...options };

  // Canvas elements
  let canvasElement: HTMLCanvasElement;
  let containerElement: HTMLDivElement;
  let ctx: CanvasRenderingContext2D;

  // Chart state
  let animationFrame: number;
  let animationProgress = 0;
  let hoveredIndex = -1;
  let tooltip = { visible: false, x: 0, y: 0, content: '' };

  // Colors from Shooter design system (read from CSS variables)
  function getColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      primary: style.getPropertyValue('--color-blue-600').trim(),
      success: style.getPropertyValue('--color-green-600').trim(),
      warning: style.getPropertyValue('--color-orange-700').trim(),
      error: style.getPropertyValue('--color-red-700').trim(),
      info: style.getPropertyValue('--color-blue-600').trim(),
      text: style.getPropertyValue('--color-text-primary').trim(),
      textMuted: style.getPropertyValue('--color-gray-600').trim(),
      border: style.getPropertyValue('--border-color-primary').trim()
    };
  }

  let colors = getColors();

  // Responsive handling
  let resizeObserver: ResizeObserver;

  onMount(() => {
    if (!browser || !canvasElement) {
return;
}

    ctx = canvasElement.getContext('2d')!;
    setupCanvas();

    if (chartOptions.responsive) {
      setupResizeObserver();
    }

    if (chartOptions.animate) {
      startAnimation();
    } else {
      animationProgress = 1;
      drawChart();
    }
  });

  onDestroy(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  function setupCanvas() {
    if (!canvasElement || !containerElement) {
return;
}

    const rect = containerElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (chartOptions.responsive) {
      width = rect.width;
      if (chartOptions.maintainAspectRatio) {
        height = width * 0.5; // 2:1 aspect ratio
      }
    }

    canvasElement.width = width * dpr;
    canvasElement.height = height * dpr;
    canvasElement.style.width = width + 'px';
    canvasElement.style.height = height + 'px';

    ctx.scale(dpr, dpr);
  }

  function setupResizeObserver() {
    resizeObserver = new ResizeObserver(() => {
      setupCanvas();
      drawChart();
    });
    resizeObserver.observe(containerElement);
  }

  function startAnimation() {
    const duration = 1000; // 1 second
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      animationProgress = Math.min(elapsed / duration, 1);

      // Easing function
      const easeOutQuart = 1 - Math.pow(1 - animationProgress, 4);
      animationProgress = easeOutQuart;

      drawChart();

      if (animationProgress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function drawChart() {
    if (!ctx || data.length === 0) {
return;
}

    ctx.clearRect(0, 0, width, height);

    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Calculate data bounds
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const valueRange = maxValue - minValue || 1;

    // Draw grid
    if (chartOptions.showGrid) {
      drawGrid(padding, chartWidth, chartHeight);
    }

    // Draw axes
    if (chartOptions.showAxes) {
      drawAxes(padding, chartWidth, chartHeight, minValue, maxValue);
    }

    // Draw chart based on type
    switch (type) {
      case 'line':
        drawLineChart(padding, chartWidth, chartHeight, minValue, valueRange);
        break;
      case 'bar':
        drawBarChart(padding, chartWidth, chartHeight, minValue, valueRange);
        break;
      case 'area':
        drawAreaChart(padding, chartWidth, chartHeight, minValue, valueRange);
        break;
    }

    // Draw labels
    if (chartOptions.showLabels) {
      drawLabels(padding, chartWidth, chartHeight);
    }
  }

  function drawGrid(padding: number, chartWidth: number, chartHeight: number) {
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= data.length - 1; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function drawAxes(padding: number, chartWidth: number, chartHeight: number, minValue: number, maxValue: number) {
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.stroke();

    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = colors.textMuted;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 5; i++) {
      const value = minValue + ((maxValue - minValue) / 5) * (5 - i);
      const y = padding + (chartHeight / 5) * i;
      ctx.fillText(value.toFixed(0), padding - 10, y);
    }
  }

  function drawLineChart(padding: number, chartWidth: number, chartHeight: number, minValue: number, valueRange: number) {
    if (data.length < 2) {
return;
}

    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const normalizedValue = (data[i]!.value - minValue) / valueRange;
      const y = padding + chartHeight - (normalizedValue * chartHeight * animationProgress);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        if (chartOptions.tension && chartOptions.tension > 0) {
          // Smooth curve
          const prevX = padding + (chartWidth / (data.length - 1)) * (i - 1);
          const prevY = padding + chartHeight - ((data[i - 1]!.value - minValue) / valueRange * chartHeight * animationProgress);
          const cpX = prevX + (x - prevX) * chartOptions.tension;
          ctx.quadraticCurveTo(cpX, prevY, x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    }

    ctx.stroke();

    // Draw points
    ctx.fillStyle = colors.primary;
    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const normalizedValue = (data[i]!.value - minValue) / valueRange;
      const y = padding + chartHeight - (normalizedValue * chartHeight * animationProgress);

      ctx.beginPath();
      ctx.arc(x, y, hoveredIndex === i ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBarChart(padding: number, chartWidth: number, chartHeight: number, minValue: number, valueRange: number) {
    const barWidth = chartWidth / data.length * 0.8;
    const barSpacing = chartWidth / data.length * 0.2;

    data.forEach((point, i) => {
      const x = padding + (chartWidth / data.length) * i + barSpacing / 2;
      const normalizedValue = (point.value - minValue) / valueRange;
      const barHeight = normalizedValue * chartHeight * animationProgress;
      const y = padding + chartHeight - barHeight;

      ctx.fillStyle = point.color || colors.primary;
      ctx.fillRect(x, y, barWidth, barHeight);

      // Highlight hovered bar
      if (hoveredIndex === i) {
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawAreaChart(padding: number, chartWidth: number, chartHeight: number, minValue: number, valueRange: number) {
    if (data.length < 2) {
return;
}

    // Fill area
    ctx.fillStyle = colors.primary + '40'; // Add transparency
    ctx.beginPath();

    // Start from bottom left
    ctx.moveTo(padding, padding + chartHeight);

    // Draw line to first point
    const firstX = padding;
    const firstNormalizedValue = (data[0]!.value - minValue) / valueRange;
    const firstY = padding + chartHeight - (firstNormalizedValue * chartHeight * animationProgress);
    ctx.lineTo(firstX, firstY);

    // Draw curve through all points
    for (let i = 1; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const normalizedValue = (data[i]!.value - minValue) / valueRange;
      const y = padding + chartHeight - (normalizedValue * chartHeight * animationProgress);
      ctx.lineTo(x, y);
    }

    // Close area at bottom right
    const lastX = padding + chartWidth;
    ctx.lineTo(lastX, padding + chartHeight);
    ctx.closePath();
    ctx.fill();

    // Draw line on top
    drawLineChart(padding, chartWidth, chartHeight, minValue, valueRange);
  }

  function drawLabels(padding: number, chartWidth: number, chartHeight: number) {
    ctx.fillStyle = colors.textMuted;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    data.forEach((point, i) => {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const labelY = padding + chartHeight + 10;
      ctx.fillText(point.label, x, labelY);
    });
  }

  function handleMouseMove(event: MouseEvent) {
    if (!chartOptions.showTooltip) {
return;
}

    const rect = canvasElement.getBoundingClientRect();
    const x = event.clientX - rect.left;

    const padding = 40;
    const chartWidth = width - padding * 2;

    // Find closest data point
    let closestIndex = -1;
    let closestDistance = Infinity;

    data.forEach((point, i) => {
      const pointX = padding + (chartWidth / (data.length - 1)) * i;
      const distance = Math.abs(x - pointX);

      if (distance < closestDistance && distance < 20) {
        closestDistance = distance;
        closestIndex = i;
      }
    });

    if (closestIndex !== hoveredIndex) {
      hoveredIndex = closestIndex;
      drawChart();

      if (closestIndex >= 0) {
        tooltip = {
          visible: true,
          x: event.clientX,
          y: event.clientY,
          content: `${data[closestIndex]!.label}: ${data[closestIndex]!.value}`
        };
      } else {
        tooltip.visible = false;
      }
    }
  }

  function handleMouseLeave() {
    hoveredIndex = -1;
    tooltip.visible = false;
    drawChart();
  }

  // Reactive updates
  $: if (ctx && data.length > 0) {
    if (chartOptions.animate) {
      animationProgress = 0;
      startAnimation();
    } else {
      animationProgress = 1;
      drawChart();
    }
  }
</script>

<div class="chart-container" bind:this={containerElement}>
  {#if title}
    <h3 class="chart-title">{title}</h3>
  {/if}

  {#if loading}
    <div class="chart-loading">
      <div class="loading-spinner"></div>
      <span>Loading chart data...</span>
    </div>
  {:else if data.length === 0}
    <div class="chart-empty">
      <span>📊</span>
      <p>No data available</p>
    </div>
  {:else}
    <canvas
      bind:this={canvasElement}
      on:mousemove={handleMouseMove}
      on:mouseleave={handleMouseLeave}
      class="chart-canvas"
    ></canvas>
  {/if}
</div>

<!-- Tooltip -->
{#if tooltip.visible}
  <div
    class="chart-tooltip"
    style="left: {tooltip.x + 10}px; top: {tooltip.y - 10}px;"
  >
    {tooltip.content}
  </div>
{/if}

<style>
  /* Import Shooter design system */

  .chart-container {
    position: relative;
    width: 100%;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
  }

  .chart-title {
    margin: 0 0 var(--spacing-md);


    text-align: center;
  }

  .chart-canvas {
    display: block;
    max-width: 100%;
    cursor: crosshair;
  }

  .chart-loading,
  .chart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    min-height: 200px;

  }

  .chart-empty span {

    opacity: 0.5;
  }

  .chart-empty p {
    margin: 0;

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

  .chart-tooltip {
    position: fixed;
    background: var(--bg-color-tertiary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);

    pointer-events: none;
    z-index: var(--shooter-z-tooltip);
    box-shadow: var(--shadow-md);
    white-space: nowrap;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    .chart-container {
      padding: var(--spacing-sm);
    }

    .chart-title {

      margin-bottom: var(--spacing-sm);
    }

    .chart-canvas {
      cursor: default;
    }

    .chart-loading,
    .chart-empty {
      min-height: 150px;
    }
  }

  /* High contrast support */
  @media (prefers-contrast: high) {
    .chart-container {
      border-width: 2px;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }
  }
</style>
