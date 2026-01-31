<!--
  StatusScreen - Full-screen status display component
  Features: Loading, error, empty, success states with animations
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterButton } from '$lib/components/shooter';
  import type { StatusType } from './types';

  // Props
  export let status: StatusType = 'loading';
  export let title: string = '';
  export let message: string = '';
  export let icon: string = '';
  export let animated = true;
  export let showRetry = true;
  export let showGoHome = false;
  export let retryLabel = 'Try Again';
  export let homeLabel = 'Go Home';
  export let fullHeight = true;
  export let backgroundPattern = false;
  export let customActions: Array<{
    id: string;
    label: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    href?: string;
  }> = [];

  // Aliases for backward compatibility
  export const action: (() => void) | null = null; // Single action callback
  export const actions: Array<{ label: string; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }> = []; // Alternative actions array

  // Allow custom classes
  const className: string = '';
  export { className as class };
  
  const dispatch = createEventDispatcher<{
    retry: void;
    goHome: void;
    actionClick: { actionId: string; href?: string };
  }>();
  
  // Default content for each status type
  const defaultContent = {
    loading: {
      title: 'Loading...',
      message: 'Please wait while we load your content.',
      icon: '⏳'
    },
    error: {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Please try again.',
      icon: '❌'
    },
    empty: {
      title: 'No data found',
      message: 'There\'s nothing to display here yet.',
      icon: '📭'
    },
    success: {
      title: 'Success!',
      message: 'Your action was completed successfully.',
      icon: '✅'
    },
    warning: {
      title: 'Warning',
      message: 'Please review this information carefully.',
      icon: '⚠️'
    },
    maintenance: {
      title: 'Under maintenance',
      message: 'We\'re currently performing maintenance. Please check back later.',
      icon: '🔧'
    },
    offline: {
      title: 'You\'re offline',
      message: 'Please check your internet connection and try again.',
      icon: '📡'
    },
    unauthorized: {
      title: 'Access denied',
      message: 'You don\'t have permission to access this resource.',
      icon: '🔒'
    },
    'not-found': {
      title: 'Page not found',
      message: 'The page you\'re looking for doesn\'t exist.',
      icon: '🔍'
    }
  };
  
  // Computed values
  $: displayTitle = title || defaultContent[status]?.title || '';
  $: displayMessage = message || defaultContent[status]?.message || '';
  $: displayIcon = icon || defaultContent[status]?.icon || '';
  $: shouldShowRetry = showRetry && ['error', 'offline'].includes(status);
  $: shouldShowGoHome = showGoHome || ['unauthorized', 'not-found'].includes(status);
  
  function handleRetry() {
    dispatch('retry');
  }
  
  function handleGoHome() {
    dispatch('goHome');
  }
  
  function handleActionClick(action: typeof customActions[0]) {
    dispatch('actionClick', {
      actionId: action.id,
      ...(action.href && { href: action.href })
    });
  }
  
  function getStatusClass(): string {
    return `status-screen--${status}`;
  }
  
  function getAnimationClass(): string {
    if (!animated) {
return '';
}
    
    switch (status) {
      case 'loading':
        return 'status-animation--pulse';
      case 'error':
        return 'status-animation--shake';
      case 'success':
        return 'status-animation--bounce';
      default:
        return 'status-animation--fade';
    }
  }
</script>

<div 
  class="status-screen {getStatusClass()}"
  class:status-screen--full-height={fullHeight}
  class:status-screen--pattern={backgroundPattern}
  role="status"
  aria-live="polite"
>
  {#if backgroundPattern}
    <div class="background-pattern" aria-hidden="true"></div>
  {/if}
  
  <div class="status-content">
    <!-- Status icon -->
    {#if displayIcon}
      <div 
        class="status-icon {getAnimationClass()}"
        aria-hidden="true"
      >
        {#if status === 'loading'}
          <div class="loading-spinner"></div>
        {:else}
          <span class="icon-emoji">{displayIcon}</span>
        {/if}
      </div>
    {/if}
    
    <!-- Status text -->
    <div class="status-text">
      {#if displayTitle}
        <h1 class="status-title">{displayTitle}</h1>
      {/if}
      
      {#if displayMessage}
        <p class="status-message">{displayMessage}</p>
      {/if}
    </div>
    
    <!-- Actions -->
    <div class="status-actions">
      {#if shouldShowRetry}
        <ShooterButton
          variant="primary"
          on:click={handleRetry}
        >
          {retryLabel}
        </ShooterButton>
      {/if}
      
      {#if shouldShowGoHome}
        <ShooterButton
          variant="secondary"
          on:click={handleGoHome}
        >
          {homeLabel}
        </ShooterButton>
      {/if}
      
      {#each customActions as action}
        <ShooterButton
          variant={action.variant || 'ghost'}
          on:click={() => handleActionClick(action)}
        >
          {action.label}
        </ShooterButton>
      {/each}
    </div>
    
    <!-- Additional content slot -->
    {#if $$slots.default}
      <div class="status-extra">
        <slot />
      </div>
    {/if}
  </div>
</div>

<style>
  /* Import Shooter design system */

  .status-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--spacing-xxl);
    position: relative;
    background: var(--bg-color-primary);
  }
  
  .status-screen--full-height {
    min-height: 100vh;
  }
  
  .status-screen--pattern {
    overflow: hidden;
  }
  
  .background-pattern {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0.05;
    background-image: 
      radial-gradient(circle at 20% 50%, var(--status-color-info) 1px, transparent 1px),
      radial-gradient(circle at 80% 50%, var(--status-color-info) 1px, transparent 1px);
    background-size: 100px 100px;
    background-position: 0 0, 50px 50px;
    animation: patternMove 20s linear infinite;
  }
  
  @keyframes patternMove {
    0% { transform: translate(0, 0); }
    100% { transform: translate(100px, 100px); }
  }
  
  .status-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xl);
    max-width: 500px;
    width: 100%;
    z-index: 1;
    position: relative;
  }
  
  .icon-emoji {
    display: inline-block;
  }
  
  .loading-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--border-color-primary);
    border-top-color: var(--status-color-info);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .status-text {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  
  .status-title {
    margin: 0;
  }

  .status-message {
    margin: 0;
    max-width: 400px;
  }
  
  .status-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .status-extra {
    max-width: 100%;
  }
  
  /* Status type specific styles */
  .status-screen--loading {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--bg-color-secondary));
  }
  
  .status-screen--error {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--status-color-error-bg-light));
  }
  
  .status-screen--error .status-icon {
    color: var(--status-color-error);
  }

  .status-screen--success {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--status-color-success-bg-light));
  }

  .status-screen--success .status-icon {
    color: var(--status-color-success);
  }

  .status-screen--empty {
    background: var(--bg-color-primary);
  }

  .status-screen--empty .status-icon {
    color: var(--text-color-tertiary);
  }

  .status-screen--maintenance {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--status-color-warning-bg-light));
  }

  .status-screen--maintenance .status-icon {
    color: var(--status-color-warning);
  }

  .status-screen--offline {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--status-color-info-bg-lighter));
  }

  .status-screen--offline .status-icon {
    color: var(--status-color-info-primary);
  }

  .status-screen--unauthorized {
    background: linear-gradient(135deg, var(--bg-color-primary), var(--status-color-error-bg-light));
  }

  .status-screen--unauthorized .status-icon {
    color: var(--status-color-error);
  }

  .status-screen--not-found {
    background: var(--bg-color-primary);
  }

  .status-screen--not-found .status-icon {
    color: var(--text-color-tertiary);
  }
  
  /* Animation classes */
  .status-animation--pulse .icon-emoji {
    animation: pulse 2s ease-in-out infinite;
  }
  
  .status-animation--shake .icon-emoji {
    animation: shake 0.5s ease-in-out;
  }
  
  .status-animation--bounce .icon-emoji {
    animation: bounce 0.6s ease-in-out;
  }
  
  .status-animation--fade .icon-emoji {
    animation: fadeIn 0.5s ease-out;
  }
  
  @keyframes pulse {
    0%, 100% { 
      transform: scale(1);
      opacity: 1;
    }
    50% { 
      transform: scale(1.1);
      opacity: 0.8;
    }
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
  }
  
  @keyframes fadeIn {
    from { 
      opacity: 0;
      transform: translateY(20px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .status-screen {
      padding: var(--spacing-xl) var(--spacing-md);
    }
    
    .status-content {
      gap: var(--spacing-md);
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border-width: 3px;
    }
    
    .status-actions {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-xs);
      width: 100%;
      max-width: 300px;
    }
  }
  
  /* Compact mobile screens */
  @media (max-width: 480px) {
    .status-screen {
      padding: var(--spacing-md);
    }
  }
  
  /* Landscape mobile optimization */
  @media (orientation: landscape) and (max-height: 500px) {
    .status-screen {
      padding: var(--spacing-md);
    }
    
    .status-content {
      gap: var(--spacing-sm);
    }
    
    .loading-spinner {
      width: 30px;
      height: 30px;
    }
  }
  
  /* Dark mode enhancements */
  @media (prefers-color-scheme: dark) {
    .background-pattern {
      opacity: 0.03;
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .status-screen {
      border: 2px solid var(--border-color-primary);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .background-pattern {
      animation: none;
    }
    
    .status-animation--pulse .icon-emoji,
    .status-animation--shake .icon-emoji,
    .status-animation--bounce .icon-emoji,
    .status-animation--fade .icon-emoji {
      animation: none;
    }
    
    .loading-spinner {
      animation: none;
      border-top-color: var(--status-color-info);
      border-right-color: var(--status-color-info);
    }
  }
  
  /* Focus states */
  .status-screen:focus-within {
    outline: none;
  }
  
  /* Print styles */
  @media print {
    .status-screen {
      background: white !important;
    }
    
    .background-pattern {
      display: none;
    }
    
    .loading-spinner {
      display: none;
    }
    
    .status-actions {
      display: none;
    }
  }
</style>