<!--
  Toast - Notification toast component
  Features: Auto-dismiss, stacking, animations, gesture support
-->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { ShooterButton } from '$lib/components/shooter';
  import type { ToastNotification } from './types';

  // Props
  export let toast: ToastNotification;
  export let position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center' = 'top-right';
  export let showIcon = true;
  export let showProgress = true;
  export let swipeToDismiss = true;
  export let pauseOnHover = true;
  export let index = 0;
  
  // Internal state
  let toastElement: HTMLElement;
  let progressTimer: ReturnType<typeof setTimeout>;
  let progressInterval: ReturnType<typeof setInterval>;
  let isPaused = false;
  let isVisible = false;
  let isRemoving = false;
  let timeRemaining = toast.duration || 0;
  let startTime: number;
  let touchStartX = 0;
  let touchCurrentX = 0;
  let isDragging = false;
  
  const dispatch = createEventDispatcher<{
    dismiss: { id: string; reason: 'auto' | 'user' | 'action' | 'swipe' };
    actionClick: { toastId: string; actionId: string };
  }>();
  
  // Auto-dismiss logic
  function startDismissTimer() {
    if (!toast.duration || toast.duration <= 0 || toast.persistent) {
return;
}
    
    startTime = Date.now();
    timeRemaining = toast.duration;
    
    progressTimer = setTimeout(() => {
      if (!isPaused && !isRemoving) {
        dismiss('auto');
      }
    }, toast.duration);
    
    if (showProgress && toast.progress !== false) {
      updateProgress();
    }
  }
  
  function pauseTimer() {
    if (!pauseOnHover || !progressTimer) {
return;
}
    
    isPaused = true;
    clearTimeout(progressTimer);
    
    const elapsed = Date.now() - startTime;
    timeRemaining = Math.max(0, timeRemaining - elapsed);
    
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
  
  function resumeTimer() {
    if (!pauseOnHover || isPaused === false) {
return;
}
    
    isPaused = false;
    
    if (timeRemaining > 0) {
      startTime = Date.now();
      progressTimer = setTimeout(() => {
        if (!isPaused && !isRemoving) {
          dismiss('auto');
        }
      }, timeRemaining);
      
      if (showProgress && toast.progress !== false) {
        updateProgress();
      }
    }
  }
  
  function updateProgress() {
    progressInterval = setInterval(() => {
      if (isPaused || isRemoving) {
return;
}
      
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, timeRemaining - elapsed);
      
      if (remaining <= 0) {
        clearInterval(progressInterval);
      }
    }, 16); // ~60fps
  }
  
  function dismiss(reason: 'auto' | 'user' | 'action' | 'swipe') {
    if (isRemoving) {
return;
}
    
    isRemoving = true;
    clearTimeout(progressTimer);
    clearInterval(progressInterval);
    
    // Add remove animation
    setTimeout(() => {
      dispatch('dismiss', { id: toast.id, reason });
    }, 300);
  }
  
  function handleActionClick(actionId: string, action: NonNullable<ToastNotification['actions']>[0]) {
    dispatch('actionClick', { toastId: toast.id, actionId });
    
    if (action.onClick) {
      action.onClick();
    }
    
    dismiss('action');
  }
  
  // Touch/swipe handling
  function handleTouchStart(event: TouchEvent) {
    if (!swipeToDismiss) {
return;
}
    
    touchStartX = event.touches[0]!.clientX;
    isDragging = true;
    
    if (toastElement) {
      toastElement.style.transition = 'none';
    }
  }
  
  function handleTouchMove(event: TouchEvent) {
    if (!swipeToDismiss || !isDragging) {
return;
}
    
    touchCurrentX = event.touches[0]!.clientX;
    const deltaX = touchCurrentX - touchStartX;
    
    if (toastElement) {
      toastElement.style.transform = `translateX(${deltaX}px)`;
      toastElement.style.opacity = String(Math.max(0.3, 1 - Math.abs(deltaX) / 200));
    }
  }
  
  function handleTouchEnd() {
    if (!swipeToDismiss || !isDragging) {
return;
}
    
    isDragging = false;
    const deltaX = touchCurrentX - touchStartX;
    const threshold = 100;
    
    if (toastElement) {
      toastElement.style.transition = '';
      
      if (Math.abs(deltaX) > threshold) {
        dismiss('swipe');
      } else {
        toastElement.style.transform = '';
        toastElement.style.opacity = '';
      }
    }
  }
  
  function getTypeIcon(type: ToastNotification['type']): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳'
    };
    return icons[type] || 'ℹ️';
  }
  
  function getTypeColor(type: ToastNotification['type']): string {
    const colors = {
      success: 'var(--status-color-success)',
      error: 'var(--status-color-error)',
      warning: 'var(--status-color-warning)',
      info: 'var(--status-color-info-primary)',
      loading: 'var(--status-color-info)'
    };
    return colors[type] || 'var(--status-color-info-primary)';
  }
  
  // Calculate progress percentage
  $: progressPercentage = toast.duration && timeRemaining 
    ? ((toast.duration - timeRemaining + (isPaused ? 0 : Date.now() - startTime)) / toast.duration) * 100
    : 0;
  
  onMount(() => {
    // Trigger entrance animation
    setTimeout(() => {
      isVisible = true;
    }, 10);
    
    startDismissTimer();
  });
  
  onDestroy(() => {
    clearTimeout(progressTimer);
    clearInterval(progressInterval);
  });
</script>

<div
  class="toast toast--{position} toast--{toast.type}"
  class:toast--visible={isVisible}
  class:toast--removing={isRemoving}
  class:toast--dismissible={toast.dismissible !== false}
  class:toast--dragging={isDragging}
  bind:this={toastElement}
  on:mouseenter={pauseTimer}
  on:mouseleave={resumeTimer}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  role="alert"
  aria-live="polite"
  style="--stack-index: {index}; --type-color: {getTypeColor(toast.type)}"
>
  <!-- Progress bar -->
  {#if showProgress && toast.progress !== false && toast.duration && !toast.persistent}
    <div 
      class="toast-progress"
      style="width: {Math.min(100, Math.max(0, progressPercentage))}%"
    ></div>
  {/if}
  
  <div class="toast-content">
    <!-- Icon -->
    {#if showIcon}
      <div class="toast-icon" aria-hidden="true">
        {#if toast.type === 'loading'}
          <div class="loading-spinner"></div>
        {:else}
          {getTypeIcon(toast.type)}
        {/if}
      </div>
    {/if}
    
    <!-- Content -->
    <div class="toast-text">
      <h3 class="toast-title">{toast.title}</h3>
      {#if toast.message}
        <p class="toast-message">{toast.message}</p>
      {/if}
      
      <!-- Actions -->
      {#if toast.actions && toast.actions.length > 0}
        <div class="toast-actions">
          {#each toast.actions as action}
            <ShooterButton
              variant={action.variant || 'ghost'}
              size="sm"
              on:click={() => handleActionClick(action.id, action)}
            >
              {action.label}
            </ShooterButton>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- Dismiss button -->
    {#if toast.dismissible !== false}
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={() => dismiss('user')}
        ariaLabel="Dismiss notification"
        class="toast-dismiss"
      >
        ×
      </ShooterButton>
    {/if}
  </div>
</div>

<style>
  /* Import Shooter design system */

  .toast {
    display: flex;
    flex-direction: column;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-left: 4px solid var(--type-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    min-width: 300px;
    max-width: 500px;
    position: relative;
    transform: translateX(100%);
    opacity: 0;
    transition: all var(--transition-base);
    margin-bottom: var(--spacing-xs);
    z-index: calc(var(--shooter-z-toast) + var(--stack-index));
  }
  
  .toast--visible {
    transform: translateX(0);
    opacity: 1;
  }
  
  .toast--removing {
    transform: translateX(100%);
    opacity: 0;
  }
  
  .toast--dragging {
    transition: opacity var(--transition-fast);
  }
  
  /* Position variants */
  .toast--top-left,
  .toast--bottom-left {
    transform: translateX(-100%);
  }
  
  .toast--top-left.toast--visible,
  .toast--bottom-left.toast--visible {
    transform: translateX(0);
  }
  
  .toast--top-left.toast--removing,
  .toast--bottom-left.toast--removing {
    transform: translateX(-100%);
  }
  
  .toast--center {
    transform: translateY(-50%) scale(0.8);
  }
  
  .toast--center.toast--visible {
    transform: translateY(-50%) scale(1);
  }
  
  .toast--center.toast--removing {
    transform: translateY(-50%) scale(0.8);
  }
  
  /* Type variants */
  .toast--success {
    background: linear-gradient(135deg, var(--bg-color-secondary), var(--status-color-success-bg-light));
  }
  
  .toast--error {
    background: linear-gradient(135deg, var(--bg-color-secondary), var(--status-color-error-bg-light));
  }
  
  .toast--warning {
    background: linear-gradient(135deg, var(--bg-color-secondary), var(--status-color-warning-bg-light));
  }
  
  .toast--info {
    background: linear-gradient(135deg, var(--bg-color-secondary), var(--status-color-info-bg-lighter));
  }
  
  .toast--loading {
    background: linear-gradient(135deg, var(--bg-color-secondary), var(--status-color-info-bg-light));
  }
  
  .toast-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--type-color);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    transition: width var(--transition-base);
  }
  
  .toast-content {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
  }
  
  .toast-icon {
    flex-shrink: 0;
    margin-top: var(--spacing-xxs);
  }
  
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color-primary);
    border-top-color: var(--type-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .toast-text {
    flex: 1;
    min-width: 0;
  }
  
  .toast-title {
    margin: 0 0 var(--spacing-xxs);
  }

  .toast-message {
    margin: 0;
  }
  
  .toast-actions {
    display: flex;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-sm);
    flex-wrap: wrap;
  }
  
  .toast-dismiss {
    flex-shrink: 0;

    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Hover effects */
  .toast--dismissible:hover {
    transform: translateX(0) scale(1.02);
    box-shadow: var(--shooter-shadow-2xl);
  }
  
  .toast--top-left.toast--dismissible:hover,
  .toast--bottom-left.toast--dismissible:hover {
    transform: translateX(0) scale(1.02);
  }
  
  .toast--center.toast--dismissible:hover {
    transform: translateY(-50%) scale(1.05);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .toast {
      min-width: 280px;
      max-width: calc(100vw - var(--spacing-xl));
      margin-bottom: var(--spacing-xxs);
    }
    
    .toast-content {
      padding: var(--spacing-sm);
      gap: var(--spacing-xs);
    }
    
    .toast-actions {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-xxs);
    }
  }
  
  /* Dark mode enhancements */
  @media (prefers-color-scheme: dark) {
    .toast {
      backdrop-filter: blur(10px);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .toast {
      border-width: 2px;
      border-left-width: 6px;
    }
    
    .toast-progress {
      height: 4px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      transition: opacity var(--transition-base);
    }
    
    .toast--visible {
      transform: none;
    }
    
    .toast--removing {
      transform: none;
    }
    
    .toast--dismissible:hover {
      transform: none;
    }
    
    .loading-spinner {
      animation: none;
    }
  }
  
  /* Focus states */
  .toast:focus-within {
    outline: 2px solid var(--border-color-focus);
    outline-offset: 2px;
  }
</style>