<!--
  ShooterBadge - Badge/tag component for status and labels
  Features: Multiple variants, sizes, icons, removable badges
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let icon: string | null = null;
  export let iconPosition: 'left' | 'right' = 'left';
  export let removable = false;
  export let outlined = false;
  export let rounded = false;
  export let uppercase = false;
  export let href: string | null = null;
  export let target: '_blank' | '_self' | '_parent' | '_top' | null = null;
  export let ariaLabel: string | null = null;
  
  const dispatch = createEventDispatcher<{
    click: MouseEvent;
    remove: void;
  }>();
  
  $: isLink = href !== null;
  $: tagName = isLink ? 'a' : 'span';
  
  function handleClick(event: MouseEvent) {
    dispatch('click', event);
  }
  
  function handleRemove(event: MouseEvent) {
    event.stopPropagation();
    dispatch('remove');
  }
</script>

<svelte:element
  this={tagName}
  {...(isLink ? { href, target } : {})}
  class="shooter-badge shooter-badge--{variant} shooter-badge--{size}"
  class:shooter-badge--outlined={outlined}
  class:shooter-badge--rounded={rounded}
  class:shooter-badge--uppercase={uppercase}
  class:shooter-badge--clickable={isLink || $$props.onclick}
  class:shooter-badge--with-icon={icon}
  class:shooter-badge--removable={removable}
  aria-label={ariaLabel}
  on:click={handleClick}
>
  {#if icon && iconPosition === 'left'}
    <span class="shooter-badge__icon shooter-badge__icon--left" aria-hidden="true">
      {icon}
    </span>
  {/if}
  
  <span class="shooter-badge__text">
    <slot />
  </span>
  
  {#if icon && iconPosition === 'right'}
    <span class="shooter-badge__icon shooter-badge__icon--right" aria-hidden="true">
      {icon}
    </span>
  {/if}
  
  {#if removable}
    <button
      type="button"
      class="shooter-badge__remove"
      on:click={handleRemove}
      aria-label="Remove badge"
    >
      ✕
    </button>
  {/if}
</svelte:element>

<style>
  .shooter-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xxs);

    white-space: nowrap;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    text-decoration: none;
    vertical-align: middle;
    transition: all 0.2s ease;
  }
  
  /* Size variants */
  .shooter-badge--sm {
    padding: var(--spacing-xxxs) var(--spacing-xs);

  }
  
  .shooter-badge--md {
    padding: var(--spacing-xxs) 0.75rem;

  }
  
  .shooter-badge--lg {
    padding: var(--spacing-xs) var(--spacing-md);

  }
  
  /* Rounded variant */
  .shooter-badge--rounded {
    border-radius: var(--radius-full);
  }
  
  /* Uppercase text */
  
  /* Clickable states */
  .shooter-badge--clickable {
    cursor: pointer;
  }
  
  .shooter-badge--clickable:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--overlay-dark-hint);
  }
  
  .shooter-badge--clickable:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  /* Color variants - solid */
  .shooter-badge--primary {
    background: var(--status-color-info);
    border-color: var(--status-color-info);
  }

  .shooter-badge--secondary {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-elevated);
  }

  .shooter-badge--success {
    background: var(--status-color-success-hover);
    border-color: var(--status-color-success-hover);
  }

  .shooter-badge--warning {
    background: var(--status-color-warning-hover);
    border-color: var(--status-color-warning-hover);
  }

  .shooter-badge--error {
    background: var(--status-color-error-hover);
    border-color: var(--status-color-error-hover);
  }

  .shooter-badge--info {
    background: var(--status-color-info-hover);
    border-color: var(--status-color-info-hover);
  }

  .shooter-badge--neutral {
    background: var(--text-color-muted);
    border-color: var(--text-color-placeholder);
  }
  
  /* Color variants - outlined */
  .shooter-badge--outlined.shooter-badge--primary {
    background: transparent;
    border-color: var(--status-color-info);
  }

  .shooter-badge--outlined.shooter-badge--secondary {
    background: transparent;
    border-color: var(--bg-color-elevated);
  }

  .shooter-badge--outlined.shooter-badge--success {
    background: transparent;
    border-color: var(--status-color-success-hover);
  }

  .shooter-badge--outlined.shooter-badge--warning {
    background: transparent;
    border-color: var(--status-color-warning-hover);
  }

  .shooter-badge--outlined.shooter-badge--error {
    background: transparent;
    border-color: var(--status-color-error-hover);
  }

  .shooter-badge--outlined.shooter-badge--info {
    background: transparent;
    border-color: var(--status-color-info-hover);
  }

  .shooter-badge--outlined.shooter-badge--neutral {
    background: transparent;
    border-color: var(--text-color-placeholder);
  }
  
  /* Hover states for outlined variants */
  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--primary {
    background: var(--status-color-info);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--secondary {
    background: var(--bg-color-tertiary);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--success {
    background: var(--status-color-success-hover);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--warning {
    background: var(--status-color-warning-hover);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--error {
    background: var(--status-color-error-hover);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--info {
    background: var(--status-color-info-hover);
  }

  .shooter-badge--outlined.shooter-badge--clickable:hover.shooter-badge--neutral {
    background: var(--text-color-muted);
  }
  
  /* Content elements */
  .shooter-badge__text {
    flex: 1;
    min-width: 0;
  }
  
  .shooter-badge__icon {

    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .shooter-badge__remove {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: var(--spacing-xxs);

    opacity: 0.7;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }
  
  .shooter-badge__remove:hover {
    opacity: 1;
  }
  
  .shooter-badge__remove:focus {
    outline: none;
    opacity: 1;
  }
  
  /* Size adjustments for removable badges */
  .shooter-badge--removable.shooter-badge--sm {
    padding-right: 0.25rem;
  }
  
  .shooter-badge--removable.shooter-badge--md {
    padding-right: 0.375rem;
  }
  
  .shooter-badge--removable.shooter-badge--lg {
    padding-right: 0.5rem;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-badge--clickable {
      min-height: 32px;
      min-width: 32px;
    }
    
    .shooter-badge--sm.shooter-badge--clickable {
      min-height: 28px;
      min-width: 28px;
    }
    
    .shooter-badge--lg.shooter-badge--clickable {
      min-height: 36px;
      min-width: 36px;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .shooter-badge {
      border-width: 2px;
    }
    
    .shooter-badge--outlined {
      border-width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-badge {
      transition: none;
    }
    
    .shooter-badge--clickable:hover {
      transform: none;
    }
  }
  
  /* Focus-visible support */
  .shooter-badge--clickable:focus-visible {
    box-shadow: var(--shadow-focus);
  }

  .shooter-badge--clickable:focus:not(:focus-visible) {
    box-shadow: none;
  }
</style>