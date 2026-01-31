<!--
  ShooterButton - Core button component with consistent Shooter branding
  Features: Multiple variants, loading states, icons, accessibility
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let icon: string | null = null;
  export let iconPosition: 'left' | 'right' = 'left';
  export let fullWidth = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let ariaLabel: string | null = null;
  export let ariaExpanded: boolean | null = null;

  // Allow custom classes to be passed
  let className = '';
  export { className as class };
  
  const dispatch = createEventDispatcher<{
    click: MouseEvent;
  }>();
  
  function handleClick(event: MouseEvent) {
    if (!disabled && !loading) {
      dispatch('click', event);
    }
  }
</script>

<button
  {type}
  class="shooter-btn shooter-btn--{variant} shooter-btn--{size} {className}"
  class:shooter-btn--disabled={disabled}
  class:shooter-btn--loading={loading}
  class:shooter-btn--full-width={fullWidth}
  class:shooter-btn--icon-only={icon && !$$slots.default}
  {disabled}
  on:click={handleClick}
  aria-label={ariaLabel}
  aria-busy={loading}
  aria-expanded={ariaExpanded}
>
  {#if loading}
    <span class="shooter-btn__spinner" aria-hidden="true">
      <svg class="spinner" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416" />
      </svg>
    </span>
  {:else if icon && iconPosition === 'left'}
    <span class="shooter-btn__icon shooter-btn__icon--left" aria-hidden="true">
      {icon}
    </span>
  {/if}
  
  {#if $$slots.default}
    <span class="shooter-btn__text" class:shooter-btn__text--hidden={loading}>
      <slot />
    </span>
  {/if}
  
  {#if !loading && icon && iconPosition === 'right'}
    <span class="shooter-btn__icon shooter-btn__icon--right" aria-hidden="true">
      {icon}
    </span>
  {/if}
</button>

<style>
  .shooter-btn {
    /* Base styles */
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);

    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    white-space: nowrap;
    user-select: none;
    overflow: hidden;
  }
  
  .shooter-btn:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  
  /* Size variants */
  .shooter-btn--sm {

    padding: var(--spacing-xs) var(--spacing-md);
    min-height: 2rem;
  }

  .shooter-btn--md {

    padding: var(--spacing-sm) var(--spacing-lg);
    min-height: 2.5rem;
  }

  .shooter-btn--lg {

    padding: var(--spacing-md) var(--spacing-xl);
    min-height: 3rem;
  }

  /* Icon-only adjustments */
  .shooter-btn--icon-only.shooter-btn--sm {
    padding: var(--spacing-xs);
    width: 2rem;
  }

  .shooter-btn--icon-only.shooter-btn--md {
    padding: var(--spacing-sm);
    width: 2.5rem;
  }

  .shooter-btn--icon-only.shooter-btn--lg {
    padding: var(--spacing-md);
    width: 3rem;
  }
  
  /* Color variants */
  .shooter-btn--primary {
    background: var(--status-color-info) 0%, var(--status-color-info-hover) 100%);
    border-color: var(--status-color-info);
  }

  .shooter-btn--primary:hover:not(.shooter-btn--disabled):not(.shooter-btn--loading) {
    background: linear-gradient(135deg, var(--status-color-info-hover) 0%, var(--status-color-info-active) 100%);
    border-color: var(--status-color-info-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--status-color-info-strong);
  }
  
  .shooter-btn--secondary {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-elevated);
  }

  .shooter-btn--secondary:hover:not(.shooter-btn--disabled):not(.shooter-btn--loading) {
    background: var(--bg-color-elevated);
    border-color: var(--text-color-placeholder);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }
  
  .shooter-btn--danger {
    background: var(--status-color-error) 100%);
    border-color: var(--status-color-error-hover);
  }

  .shooter-btn--danger:hover:not(.shooter-btn--disabled):not(.shooter-btn--loading) {
    background: var(--status-color-error-hover);
    border-color: var(--status-color-error-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--status-color-error-strong);
  }
  
  .shooter-btn--ghost {
    background: transparent;
    border-color: transparent;
  }

  .shooter-btn--ghost:hover:not(.shooter-btn--disabled):not(.shooter-btn--loading) {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-elevated);
  }

  .shooter-btn--outline {
    background: transparent;
    border-color: var(--status-color-info);
  }

  .shooter-btn--outline:hover:not(.shooter-btn--disabled):not(.shooter-btn--loading) {
    background: var(--status-color-info);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--status-color-info-border);
  }
  
  /* States */
  .shooter-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }
  
  .shooter-btn--loading {
    cursor: wait;
    transform: none !important;
  }
  
  .shooter-btn--full-width {
    width: 100%;
  }
  
  /* Content elements */
  .shooter-btn__icon {

    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .shooter-btn__text {
    transition: opacity 0.2s ease;
  }
  
  .shooter-btn__text--hidden {
    opacity: 0;
  }
  
  .shooter-btn__spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .spinner {
    width: 1.25em;
    height: 1.25em;
    animation: spin 1s linear infinite;
  }
  
  .spinner circle {
    animation: dash 1.5s ease-in-out infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  @keyframes dash {
    0% {
      stroke-dasharray: 1, 150;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -35;
    }
    100% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -124;
    }
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-btn {
      min-height: 44px; /* Touch target size */
    }
    
    .shooter-btn--sm {
      min-height: 36px;
    }
    
    .shooter-btn--lg {
      min-height: 52px;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .shooter-btn {
      border-width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-btn {
      transition: none;
    }
    
    .spinner {
      animation: none;
    }
    
    .spinner circle {
      animation: none;
      stroke-dasharray: none;
      stroke-dashoffset: 0;
    }
  }
</style>