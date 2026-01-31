<!--
  ShooterInput - Form input component with validation and consistent styling
  Features: Multiple types, validation states, icons, accessibility
  Enhanced with Juspay foundation for production-quality experience
-->
<script lang="ts">
  import { Input, type InputProperties, defaultInputProperties } from '@juspay/svelte-ui-components';
  import { createEventDispatcher, onMount } from 'svelte';

  export let type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number' = 'text';
  export let value = '';
  export let placeholder = '';
  export let label: string | null = null;
  export let hint: string | null = null;
  export let error: string | null = null;
  export let disabled = false;
  export const readonly: boolean = false;
  export let required = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let fullWidth = false;
  export let icon: string | null = null;
  export let iconPosition: 'left' | 'right' = 'left';
  export const autocomplete: string | null = null;
  export let maxlength: number | null = null;
  export let minlength: number | null = null;
  export const pattern: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export const ariaLabel: string | null = null;
  export let ariaDescribedBy: string | null = null;

  const _dispatch = createEventDispatcher<{
    input: Event;
    change: Event;
    focus: Event;
    blur: Event;
    keydown: KeyboardEvent;
    keyup: KeyboardEvent;
  }>();

  let inputElement: InstanceType<typeof Input> | undefined;
  let inputId: string;
  let hintId: string;
  let errorId: string;
  
  // Generate unique IDs if not provided
  onMount(() => {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    inputId = id || `shooter-input-${uniqueId}`;
    hintId = `${inputId}-hint`;
    errorId = `${inputId}-error`;
  });
  
  // Reactive computed values
  $: hasIcon = icon !== null;
  $: hasError = error !== null;

  // Map Shooter props to Juspay InputProperties
  let inputProps: InputProperties;
  $: {
    // Map type to supported InputDataType (Juspay doesn't support 'url', 'search')
    const mappedType = (type === 'url' || type === 'search') ? 'text' : type;

    // Build props object by spreading defaults and overriding with our values
    const props: InputProperties = {
      ...defaultInputProperties,
      placeholder: placeholder || '',
      disable: disabled,
      value: value,
      dataType: mappedType,
      label: label || '',
      name: name || '',
      message: {
        onError: error || '',
        info: hint || ''
      },
      ...(maxlength !== null && { maxLength: maxlength }),
      ...(minlength !== null && { minLength: minlength })
    };

    inputProps = props;
  }

  // Public methods (maintained for backward compatibility)
  export function focus() {
    inputElement?.focus();
  }
  
  export function blur() {
    inputElement?.blur();
  }
  
  export function select() {
    inputElement?.select();
  }
</script>

<div class="shooter-input-group" class:shooter-input-group--full-width={fullWidth}>
  {#if label}
    <label for={inputId} class="shooter-input__label" class:shooter-input__label--required={required}>
      {label}
    </label>
  {/if}
  
  <div 
    class="shooter-input-wrapper shooter-input-wrapper--{size}"
    class:shooter-input-wrapper--disabled={disabled}
    class:shooter-input-wrapper--error={hasError}
    class:shooter-input-wrapper--icon-left={hasIcon && iconPosition === 'left'}
    class:shooter-input-wrapper--icon-right={hasIcon && iconPosition === 'right'}
  >
    {#if hasIcon && iconPosition === 'left'}
      <span class="shooter-input__icon shooter-input__icon--left" aria-hidden="true">
        {icon}
      </span>
    {/if}
    
    <!-- Juspay Input with Shooter styling overrides -->
    <!-- Note: Juspay Input component doesn't support event forwarding in its types -->
    <!-- TODO: Investigate alternative approach for event handling or replace with native input -->
    <Input
      properties={inputProps}
      bind:this={inputElement}
    />
    
    {#if hasIcon && iconPosition === 'right'}
      <span class="shooter-input__icon shooter-input__icon--right" aria-hidden="true">
        {icon}
      </span>
    {/if}
  </div>
  
  {#if hint && !hasError}
    <div id={hintId} class="shooter-input__hint">
      {hint}
    </div>
  {/if}
  
  {#if hasError}
    <div id={errorId} class="shooter-input__error" role="alert">
      ⚠️ {error}
    </div>
  {/if}
</div>

<style>
  .shooter-input-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .shooter-input-group--full-width {
    width: 100%;
  }
  
  .shooter-input__label {

    display: block;
  }
  
  .shooter-input__label--required::after {
    content: ' *';
  }
  
  .shooter-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--bg-color-primary);
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    overflow: hidden;
  }

  .shooter-input-wrapper:focus-within {
    border-color: var(--status-color-info);
    box-shadow: var(--shadow-focus);
  }

  .shooter-input-wrapper--error {
    border-color: var(--status-color-error-hover);
  }

  .shooter-input-wrapper--error:focus-within {
    border-color: var(--status-color-error-hover);
    box-shadow: var(--shadow-error);
  }

  .shooter-input-wrapper--disabled {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-tertiary);
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* Size variants */
  .shooter-input-wrapper--sm {
    min-height: 2rem;
  }
  
  .shooter-input-wrapper--md {
    min-height: 2.5rem;
  }
  
  .shooter-input-wrapper--lg {
    min-height: 3rem;
  }
  
  /* Icon positioning */
  .shooter-input-wrapper--icon-left {
    padding-left: 0.75rem;
  }
  
  .shooter-input-wrapper--icon-right {
    padding-right: 0.75rem;
  }
  
  /* Override Juspay Input styles to maintain Shooter appearance */
  .shooter-input-wrapper :global(input) {
    flex: 1;
    background: transparent !important;
    border: none !important;
    outline: none !important;

    padding: var(--spacing-sm) var(--spacing-md) !important;
    box-shadow: none !important;
    width: 100% !important;
  }

  .shooter-input-wrapper :global(input:disabled) {
    cursor: not-allowed !important;
  }
  
  .shooter-input-wrapper :global(input:read-only) {
    cursor: default !important;
  }
  
  /* Size-specific input padding */
  .shooter-input-wrapper--sm :global(input) {
    padding: var(--spacing-xs) var(--spacing-sm) !important;

  }

  .shooter-input-wrapper--lg :global(input) {
    padding: var(--spacing-md) var(--spacing-lg) !important;

  }
  
  /* Icon padding adjustments */
  .shooter-input-wrapper--icon-left :global(input) {
    padding-left: 0.5rem !important;
  }
  
  .shooter-input-wrapper--icon-right :global(input) {
    padding-right: 0.5rem !important;
  }
  
  .shooter-input__icon {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;
  }
  
  .shooter-input__icon--left {
    margin-right: var(--spacing-xs);
  }
  
  .shooter-input__icon--right {
    margin-left: var(--spacing-xs);
  }

  .shooter-input__hint {
    color: var(--text-color-tertiary);
  }

  .shooter-input__error {
    color: var(--status-color-error);
    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);

  }
  
  /* Autofill styles */
  .shooter-input-wrapper :global(input:-webkit-autofill),
  .shooter-input-wrapper :global(input:-webkit-autofill:hover),
  .shooter-input-wrapper :global(input:-webkit-autofill:focus) {
    -webkit-box-shadow: 0 0 0 1000px var(--bg-color-primary) inset !important;
    -webkit-text-fill-color: var(--text-color-secondary) !important;
    transition: background-color 5000s ease-in-out 0s !important;
  }
  
  /* Number input arrows removal */
  .shooter-input-wrapper :global(input[type="number"]::-webkit-outer-spin-button),
  .shooter-input-wrapper :global(input[type="number"]::-webkit-inner-spin-button) {
    -webkit-appearance: none !important;
    appearance: none !important;
    margin: 0 !important;
  }
  
  .shooter-input-wrapper :global(input[type="number"]) {
    -moz-appearance: textfield !important;
    appearance: textfield !important;
  }
  
  /* Search input clear button */
  .shooter-input-wrapper :global(input[type="search"]::-webkit-search-decoration),
  .shooter-input-wrapper :global(input[type="search"]::-webkit-search-cancel-button),
  .shooter-input-wrapper :global(input[type="search"]::-webkit-search-results-button),
  .shooter-input-wrapper :global(input[type="search"]::-webkit-search-results-decoration) {
    -webkit-appearance: none !important;
    appearance: none !important;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-input-wrapper {
      min-height: 44px; /* Touch target size */
    }
    
    .shooter-input-wrapper--sm {
      min-height: 40px;
    }
    
    .shooter-input-wrapper--lg {
      min-height: 48px;
    }
    
    .shooter-input-wrapper :global(input) {
      font-size: 16px !important; /* Prevent zoom on iOS */
    }
  }
  
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .shooter-input-wrapper {
      border-width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-input-wrapper {
      transition: none;
    }
  }
  
  /* Dark mode specific adjustments */
  @media (prefers-color-scheme: dark) {
    /* Placeholder styles handled by global theme */
  }
</style>
