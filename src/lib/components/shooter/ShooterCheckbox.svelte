<!--
  ShooterCheckbox - Checkbox component with consistent Shooter styling
  Features: Checked/unchecked states, indeterminate, disabled, labels
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  export let checked = false;
  export let indeterminate = false;
  export let disabled = false;
  export let label: string | null = null;
  export let description: string | null = null;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let value: string | number | null = null;
  export let name: string | null = null;
  export let id: string | null = null;
  export let ariaLabel: string | null = null;
  export let ariaDescribedBy: string | null = null;
  
  const dispatch = createEventDispatcher<{
    change: { checked: boolean; value: string | number | null };
    input: Event;
  }>();
  
  let checkboxElement: HTMLInputElement;
  let checkboxId: string;
  let descriptionId: string;
  
  // Generate unique IDs if not provided
  onMount(() => {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    checkboxId = id || `shooter-checkbox-${uniqueId}`;
    descriptionId = `${checkboxId}-desc`;
    
    // Set indeterminate state (can't be done with attribute)
    if (checkboxElement) {
      checkboxElement.indeterminate = indeterminate;
    }
  });
  
  // Update indeterminate state when prop changes
  $: if (checkboxElement) {
    checkboxElement.indeterminate = indeterminate;
  }
  
  // Computed values
  $: describedBy = [
    ariaDescribedBy,
    description ? descriptionId : null
  ].filter(Boolean).join(' ') || null;
  
  // Event handlers
  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    checked = target.checked;
    
    dispatch('change', { 
      checked: target.checked, 
      value 
    });
  }
  
  function handleInput(event: Event) {
    dispatch('input', event);
  }

  // Public methods
  export function focus() {
    checkboxElement?.focus();
  }
  
  export function blur() {
    checkboxElement?.blur();
  }
</script>

<div class="shooter-checkbox-group" class:shooter-checkbox-group--disabled={disabled}>
  <div class="shooter-checkbox-control">
    <input
      bind:this={checkboxElement}
      bind:checked
      type="checkbox"
      {disabled}
      {value}
      {name}
      id={checkboxId}
      class="shooter-checkbox shooter-checkbox--{size}"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      on:change={handleChange}
      on:input={handleInput}
    />
    
    <div 
      class="shooter-checkbox-indicator shooter-checkbox-indicator--{size}"
      class:shooter-checkbox-indicator--checked={checked}
      class:shooter-checkbox-indicator--indeterminate={indeterminate}
      class:shooter-checkbox-indicator--disabled={disabled}
    >
      {#if indeterminate}
        <svg class="shooter-checkbox-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      {:else if checked}
        <svg class="shooter-checkbox-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13 4L6 11l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      {/if}
    </div>
  </div>
  
  {#if label || $$slots.default || description}
    <div class="shooter-checkbox-content">
      {#if label || $$slots.default}
        <label
          for={checkboxId}
          class="shooter-checkbox-label shooter-checkbox-label--{size}"
          class:shooter-checkbox-label--disabled={disabled}
        >
          {#if label}
            {label}
          {:else}
            <slot />
          {/if}
        </label>
      {/if}
      
      {#if description}
        <div id={descriptionId} class="shooter-checkbox-description">
          {description}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .shooter-checkbox-group {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-start;
  }
  
  .shooter-checkbox-group--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .shooter-checkbox-control {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .shooter-checkbox {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    margin: 0;
    padding: 0;
  }
  
  .shooter-checkbox:disabled {
    cursor: not-allowed;
  }
  
  .shooter-checkbox:focus + .shooter-checkbox-indicator {
    box-shadow: var(--shadow-focus);
  }

  /* Size variants for checkbox */
  .shooter-checkbox--sm {
    width: 1rem;
    height: 1rem;
  }

  .shooter-checkbox--md {
    width: 1.25rem;
    height: 1.25rem;
  }

  .shooter-checkbox--lg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .shooter-checkbox-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-color-primary);
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);
    transition: all 0.2s ease;
  }
  
  .shooter-checkbox-indicator--sm {
    width: 1rem;
    height: 1rem;
  }
  
  .shooter-checkbox-indicator--md {
    width: 1.25rem;
    height: 1.25rem;
  }
  
  .shooter-checkbox-indicator--lg {
    width: 1.5rem;
    height: 1.5rem;
  }
  
  .shooter-checkbox-indicator--checked {
    background: var(--status-color-info) 0%, var(--status-color-info-hover) 100%);
    border-color: var(--status-color-info);
  }

  .shooter-checkbox-indicator--indeterminate {
    background: var(--status-color-info) 0%, var(--status-color-info-hover) 100%);
    border-color: var(--status-color-info);
  }

  .shooter-checkbox-indicator--disabled {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-tertiary);
  }

  .shooter-checkbox-indicator--disabled.shooter-checkbox-indicator--checked,
  .shooter-checkbox-indicator--disabled.shooter-checkbox-indicator--indeterminate {
    background: var(--bg-color-elevated);
    border-color: var(--bg-color-elevated);
  }
  
  .shooter-checkbox-icon {
    width: 0.75em;
    height: 0.75em;
    stroke-width: 2.5;
  }
  
  .shooter-checkbox-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xxs);
  }
  
  .shooter-checkbox-label {

    cursor: pointer;

    user-select: none;
  }
  
  .shooter-checkbox-label--disabled {
    cursor: not-allowed;
  }
  
  /* Hover states */
  .shooter-checkbox-group:not(.shooter-checkbox-group--disabled):hover .shooter-checkbox-indicator:not(.shooter-checkbox-indicator--checked):not(.shooter-checkbox-indicator--indeterminate) {
    border-color: var(--text-color-placeholder);
    background: var(--bg-color-secondary);
  }

  .shooter-checkbox-group:not(.shooter-checkbox-group--disabled):hover .shooter-checkbox-indicator--checked {
    background: linear-gradient(135deg, var(--status-color-info-hover) 0%, var(--status-color-info-active) 100%);
    border-color: var(--status-color-info-hover);
  }

  .shooter-checkbox-group:not(.shooter-checkbox-group--disabled):hover .shooter-checkbox-indicator--indeterminate {
    background: linear-gradient(135deg, var(--status-color-info-hover) 0%, var(--status-color-info-active) 100%);
    border-color: var(--status-color-info-hover);
  }
  
  /* Active states */
  .shooter-checkbox:active + .shooter-checkbox-indicator:not(.shooter-checkbox-indicator--disabled) {
    transform: scale(0.95);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-checkbox-group {
      gap: 0.625rem;
    }
    
    .shooter-checkbox-control {
      margin-top: var(--spacing-xxxs); /* Align with first line of text */
    }
    
    /* Increase touch target size */
    .shooter-checkbox--sm {
      width: 1.125rem;
      height: 1.125rem;
    }
    
    .shooter-checkbox--md {
      width: 1.375rem;
      height: 1.375rem;
    }
    
    .shooter-checkbox--lg {
      width: 1.625rem;
      height: 1.625rem;
    }
    
    .shooter-checkbox-indicator--sm {
      width: 1.125rem;
      height: 1.125rem;
    }
    
    .shooter-checkbox-indicator--md {
      width: 1.375rem;
      height: 1.375rem;
    }
    
    .shooter-checkbox-indicator--lg {
      width: 1.625rem;
      height: 1.625rem;
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .shooter-checkbox-indicator {
      border-width: 3px;
    }
    
    .shooter-checkbox-indicator--checked,
    .shooter-checkbox-indicator--indeterminate {
      border-color: var(--text-color-inverse);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-checkbox-indicator {
      transition: none;
    }
    
    .shooter-checkbox:active + .shooter-checkbox-indicator {
      transform: none;
    }
  }
  
  /* Focus-visible support for better keyboard navigation */
  .shooter-checkbox:focus-visible + .shooter-checkbox-indicator {
    box-shadow: var(--shadow-focus);
  }

  .shooter-checkbox:focus:not(:focus-visible) + .shooter-checkbox-indicator {
    box-shadow: none;
  }
</style>