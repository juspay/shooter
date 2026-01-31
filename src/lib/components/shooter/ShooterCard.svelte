<script lang="ts">
  // Shooter Card component - Wrapper around content for consistent styling
  import { createEventDispatcher } from 'svelte';

  type ShooterCardVariant = 'default' | 'outlined' | 'elevated' | 'filled';
  type ShooterCardSize = 'sm' | 'md' | 'lg';

  // Props
  export let variant: ShooterCardVariant = 'default';
  export let size: ShooterCardSize = 'md';
  export let padding: boolean = true;
  export let clickable: boolean = false;
  export let disabled: boolean = false;
  export let title: string | null = null;
  export let subtitle: string | null = null;
  export let href: string | null = null;
  export let target: string | null = null;

  const dispatch = createEventDispatcher<{
    click: MouseEvent;
    keydown: KeyboardEvent;
    focus: FocusEvent;
    blur: FocusEvent;
  }>();

  function handleClick(event: MouseEvent) {
    if (!disabled && clickable) {
      dispatch('click', event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!disabled && clickable && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      dispatch('keydown', event);
      // Simulate click for keyboard users
      dispatch('click', new MouseEvent('click'));
    }
  }

  function handleFocus(event: FocusEvent) {
    if (clickable && !disabled) {
      dispatch('focus', event);
    }
  }

  function handleBlur(event: FocusEvent) {
    if (clickable && !disabled) {
      dispatch('blur', event);
    }
  }
</script>

{#if href && !disabled}
  <a
    {href}
    {target}
    class="shooter-card shooter-card--{variant} shooter-card--{size}"
    class:shooter-card--padding={padding}
    class:shooter-card--clickable={clickable}
    class:shooter-card--disabled={disabled}
    on:click={handleClick}
    on:keydown={handleKeydown}
    on:focus={handleFocus}
    on:blur={handleBlur}
    role="button"
    tabindex={clickable ? 0 : undefined}
  >
    <div class="shooter-card__content">
      {#if title || subtitle}
        <div class="shooter-card__header">
          {#if title}
            <h3 class="shooter-card__title">{title}</h3>
          {/if}
          {#if subtitle}
            <p class="shooter-card__subtitle">{subtitle}</p>
          {/if}
        </div>
      {/if}
      
      {#if $$slots.default}
        <div class="shooter-card__body">
          <slot />
        </div>
      {/if}
      
      {#if $$slots.actions}
        <div class="shooter-card__actions">
          <slot name="actions" />
        </div>
      {/if}
    </div>
  </a>
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="shooter-card shooter-card--{variant} shooter-card--{size}"
    class:shooter-card--padding={padding}
    class:shooter-card--clickable={clickable}
    class:shooter-card--disabled={disabled}
    on:click={handleClick}
    on:keydown={handleKeydown}
    on:focus={handleFocus}
    on:blur={handleBlur}
    role={clickable ? 'button' : undefined}
    tabindex={clickable ? (disabled ? -1 : 0) : undefined}
    aria-disabled={clickable && disabled ? 'true' : undefined}
  >
    <div class="shooter-card__content">
      {#if title || subtitle}
        <div class="shooter-card__header">
          {#if title}
            <h3 class="shooter-card__title">{title}</h3>
          {/if}
          {#if subtitle}
            <p class="shooter-card__subtitle">{subtitle}</p>
          {/if}
        </div>
      {/if}
      
      {#if $$slots.default}
        <div class="shooter-card__body">
          <slot />
        </div>
      {/if}
      
      {#if $$slots.actions}
        <div class="shooter-card__actions">
          <slot name="actions" />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .shooter-card {
    display: block;
    position: relative;
    background-color: var(--bg-color-primary);
    border-radius: var(--radius-lg);
    transition: all var(--transition-base);
    text-decoration: none;
    overflow: hidden;
  }

  .shooter-card__content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* Size variations */
  .shooter-card--sm {
    --card-spacing: var(--spacing-sm);
    --card-border-radius: var(--radius-md);
  }

  .shooter-card--md {
    --card-spacing: var(--spacing-lg);
    --card-border-radius: var(--radius-lg);
  }

  .shooter-card--lg {
    --card-spacing: var(--spacing-lg);
    --card-border-radius: var(--radius-xl);
  }

  /* Variant styles */
  .shooter-card--default {
    background-color: var(--bg-color-primary);
    border: 1px solid var(--border-color-primary);
  }

  .shooter-card--outlined {
    background-color: transparent;
    border: 2px solid var(--border-color-primary);
  }

  .shooter-card--elevated {
    background-color: var(--bg-color-primary);
    border: 1px solid var(--border-color-primary);
    box-shadow: var(--shadow-md);
  }

  .shooter-card--filled {
    background-color: var(--bg-color-secondary);
    border: 1px solid var(--border-color-secondary);
  }

  /* Padding */
  .shooter-card--padding {
    padding: var(--card-spacing);
  }

  /* Clickable states */
  .shooter-card--clickable {
    cursor: pointer;
    user-select: none;
  }

  .shooter-card--clickable:hover:not(.shooter-card--disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--border-color-secondary);
  }

  .shooter-card--clickable:focus-visible:not(.shooter-card--disabled) {
    outline: 2px solid var(--status-color-info);
    outline-offset: 2px;
  }

  .shooter-card--clickable:active:not(.shooter-card--disabled) {
    transform: translateY(0);
    box-shadow: var(--shadow-sm);
  }

  /* Disabled state */
  .shooter-card--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Header section */
  .shooter-card__header {
    margin-bottom: var(--spacing-sm);
  }

  .shooter-card__title {
    margin: 0;
  }

  .shooter-card__subtitle {
    margin: var(--spacing-xxs) 0 0 0;
  }

  /* Body section */
  .shooter-card__body {
    flex: 1;
  }

  .shooter-card__body :global(p:first-child) {
    margin-top: 0;
  }

  .shooter-card__body :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Actions section */
  .shooter-card__actions {
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--border-color-secondary);
    display: flex;
    gap: var(--spacing-xs);
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .shooter-card--lg {
      --card-spacing: var(--spacing-md);
    }

    .shooter-card__actions {
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .shooter-card__actions :global(button) {
      width: 100%;
    }
  }

  /* Dark mode adjustments */
  @media (prefers-color-scheme: dark) {
    .shooter-card--elevated {
      box-shadow: 0 4px 6px -1px var(--bg-color-subtle), 0 2px 4px -1px var(--overlay-dark-subtle);
    }

    .shooter-card--clickable:hover:not(.shooter-card--disabled) {
      box-shadow: 0 10px 15px -3px var(--bg-color-subtle), 0 4px 6px -2px var(--overlay-dark-subtle);
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .shooter-card {
      border-width: 2px;
    }
    
    .shooter-card--outlined {
      border-width: 3px;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-card {
      transition: none;
    }
    
    .shooter-card--clickable:hover:not(.shooter-card--disabled) {
      transform: none;
    }
    
    .shooter-card--clickable:active:not(.shooter-card--disabled) {
      transform: none;
    }
  }
</style>