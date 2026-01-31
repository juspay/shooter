<!--
  ShooterSelect - Select dropdown component with consistent styling
  Features: Search, multi-select, option groups, validation states
  Enhanced with Juspay foundation for production-quality experience
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { SelectOption } from './index';

  export let value: string | string[] = '';
  export let options: SelectOption[] = [];
  export let placeholder = 'Select an option...';
  export let label: string | null = null;
  export let hint: string | null = null;
  export let error: string | null = null;
  export let disabled = false;
  export let multiple = false;
  export let searchable = false;
  export let clearable = false;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let fullWidth = false;
  export let maxHeight = '200px';
  export let id: string | null = null;
  export const name: string | null = null;
  export let ariaLabel: string | null = null;
  
  const dispatch = createEventDispatcher<{
    change: { value: string | string[]; option: SelectOption | null };
    select: { value: string; option: SelectOption };
    deselect: { value: string; option: SelectOption };
    clear: void;
    search: { query: string };
  }>();
  
  let selectElement: HTMLElement;
  let searchInput: HTMLInputElement;
  let isOpen = false;
  let searchQuery = '';
  let highlightedIndex = -1;
  let selectId: string;
  let listboxId: string;
  
  onMount(() => {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    selectId = id || `shooter-select-${uniqueId}`;
    listboxId = `${selectId}-listbox`;
  });
  
  $: filteredOptions = searchable && searchQuery
    ? options.filter(option => 
        option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        option.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;
  
  $: selectedOptions = multiple
    ? options.filter(option => Array.isArray(value) && value.includes(option.value))
    : options.find(option => option.value === value) ? [options.find(option => option.value === value)!] : [];
  
  $: displayValue = multiple
    ? selectedOptions.length > 0
      ? selectedOptions.length === 1
        ? selectedOptions[0]!.label
        : `${selectedOptions.length} selected`
      : placeholder
    : selectedOptions.length > 0
      ? selectedOptions[0]!.label
      : placeholder;
  
  $: hasError = error !== null;
  $: canClear = clearable && (multiple ? Array.isArray(value) && value.length > 0 : value !== '');
  
  function toggleDropdown() {
    if (disabled) {
return;
}
    isOpen = !isOpen;
    if (isOpen && searchable) {
      setTimeout(() => searchInput?.focus(), 0);
    }
    highlightedIndex = -1;
  }
  
  function closeDropdown() {
    isOpen = false;
    searchQuery = '';
    highlightedIndex = -1;
  }

  function selectOption(option: SelectOption) {
    if (option.disabled) {
return;
}
    
    if (multiple) {
      const currentValues = Array.isArray(value) ? [...value] : [];
      const index = currentValues.indexOf(option.value);
      
      if (index > -1) {
        currentValues.splice(index, 1);
        dispatch('deselect', { value: option.value, option });
      } else {
        currentValues.push(option.value);
        dispatch('select', { value: option.value, option });
      }
      
      value = currentValues;
      dispatch('change', { value: currentValues, option });
    } else {
      value = option.value;
      dispatch('change', { value: option.value, option });
      dispatch('select', { value: option.value, option });
      closeDropdown();
    }
  }
  
  function clearSelection() {
    if (multiple) {
      value = [];
    } else {
      value = '';
    }
    dispatch('clear');
    dispatch('change', { value, option: null });
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (disabled) {
return;
}
    
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isOpen) {
          toggleDropdown();
        } else if (highlightedIndex >= 0) {
          const selectedOption = filteredOptions[highlightedIndex];
          if (selectedOption) {
            selectOption(selectedOption);
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        closeDropdown();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          toggleDropdown();
        } else {
          highlightedIndex = Math.min(highlightedIndex + 1, filteredOptions.length - 1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) {
          highlightedIndex = Math.max(highlightedIndex - 1, -1);
        }
        break;
      case 'Tab':
        if (isOpen) {
          closeDropdown();
        }
        break;
    }
  }
  
  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;
    highlightedIndex = -1;
    dispatch('search', { query: searchQuery });
  }
  
  function handleClickOutside(event: MouseEvent) {
    if (selectElement && !selectElement.contains(event.target as Node)) {
      closeDropdown();
    }
  }
  
  $: if (typeof window !== 'undefined') {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
</script>

<div class="shooter-select-group" class:shooter-select-group--full-width={fullWidth}>
  {#if label}
    <label for={selectId} class="shooter-select__label">
      {label}
    </label>
  {/if}
  
  <div 
    bind:this={selectElement}
    class="shooter-select-wrapper shooter-select-wrapper--{size}"
    class:shooter-select-wrapper--disabled={disabled}
    class:shooter-select-wrapper--error={hasError}
    class:shooter-select-wrapper--open={isOpen}
  >
    <button
      type="button"
      id={selectId}
      class="shooter-select__trigger"
      {disabled}
      aria-label={ariaLabel}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-owns={listboxId}
      on:click={toggleDropdown}
      on:keydown={handleKeydown}
    >
      <span class="shooter-select__value" class:shooter-select__value--placeholder={selectedOptions.length === 0}>
        {displayValue}
      </span>
      
      <div class="shooter-select__icons">
        {#if canClear}
          <span
            role="button"
            tabindex="0"
            class="shooter-select__clear"
            on:click|stopPropagation={clearSelection}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), clearSelection())}
            aria-label="Clear selection"
          >
            ✕
          </span>
        {/if}
        
        <span class="shooter-select__arrow" class:shooter-select__arrow--open={isOpen}>
          ▼
        </span>
      </div>
    </button>
    
    {#if isOpen}
      <div class="shooter-select__dropdown" style="max-height: {maxHeight}">
        {#if searchable}
          <div class="shooter-select__search">
            <input
              bind:this={searchInput}
              type="text"
              class="shooter-select__search-input"
              placeholder="Search options..."
              value={searchQuery}
              on:input={handleSearchInput}
              on:keydown={handleKeydown}
            />
          </div>
        {/if}
        
        <ul
          id={listboxId}
          class="shooter-select__listbox"
          role="listbox"
          aria-multiselectable={multiple}
        >
          {#each filteredOptions as option, index}
            {@const isSelected = multiple 
              ? Array.isArray(value) && value.includes(option.value)
              : value === option.value}
            {@const isHighlighted = index === highlightedIndex}
            
            <li
              class="shooter-select__option"
              class:shooter-select__option--selected={isSelected}
              class:shooter-select__option--highlighted={isHighlighted}
              class:shooter-select__option--disabled={option.disabled}
              role="option"
              aria-selected={isSelected}
              on:click={() => selectOption(option)}
              on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectOption(option))}
              on:mouseenter={() => highlightedIndex = index}
            >
              {#if multiple}
                <span class="shooter-select__checkbox" class:shooter-select__checkbox--checked={isSelected}>
                  {#if isSelected}✓{/if}
                </span>
              {/if}
              
              <span class="shooter-select__option-label">
                {option.label}
              </span>
            </li>
          {/each}
          
          {#if filteredOptions.length === 0}
            <li class="shooter-select__no-options">
              {searchQuery ? 'No options found' : 'No options available'}
            </li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
  
  {#if hint && !hasError}
    <div class="shooter-select__hint">
      {hint}
    </div>
  {/if}
  
  {#if hasError}
    <div class="shooter-select__error" role="alert">
      ⚠️ {error}
    </div>
  {/if}
</div>

<style>
  .shooter-select-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    position: relative;
  }
  
  .shooter-select-group--full-width {
    width: 100%;
  }
  
  .shooter-select__label {

    margin-bottom: var(--spacing-xxs);
    display: block;
  }
  
  .shooter-select-wrapper {
    position: relative;
    z-index: 10;
  }
  
  .shooter-select-wrapper--open {
    z-index: 50;
  }
  
  .shooter-select__trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-color-primary);
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .shooter-select-wrapper--sm .shooter-select__trigger {
    padding: var(--spacing-xs) var(--spacing-sm);
    min-height: 2rem;
  }

  .shooter-select-wrapper--md .shooter-select__trigger {
    padding: var(--spacing-sm) var(--spacing-md);
    min-height: 2.5rem;
  }

  .shooter-select-wrapper--lg .shooter-select__trigger {
    padding: var(--spacing-md) var(--spacing-lg);
    min-height: 3rem;
  }

  .shooter-select__trigger:focus {
    outline: none;
    border-color: var(--status-color-info);
    box-shadow: var(--shadow-focus);
  }

  .shooter-select-wrapper--error .shooter-select__trigger {
    border-color: var(--status-color-error-hover);
  }

  .shooter-select-wrapper--error .shooter-select__trigger:focus {
    border-color: var(--status-color-error-hover);
    box-shadow: var(--shadow-error);
  }

  .shooter-select-wrapper--disabled .shooter-select__trigger {
    background: var(--bg-color-tertiary);
    border-color: var(--bg-color-tertiary);
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .shooter-select__value {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .shooter-select__icons {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-left: var(--spacing-xs);
  }
  
  .shooter-select__clear {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;

    transition: color 0.2s;
  }
  
  .shooter-select__arrow {

    transition: transform 0.2s;
  }
  
  .shooter-select__arrow--open {
    transform: rotate(180deg);
  }
  
  .shooter-select__dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-color-secondary);
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-xxs);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    z-index: 1000;
  }

  .shooter-select__search {
    padding: var(--spacing-sm);
    border-bottom: 1px solid var(--bg-color-elevated);
  }

  .shooter-select__search-input {
    width: 100%;
    background: var(--bg-color-primary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs);
  }

  .shooter-select__search-input:focus {
    outline: none;
    border-color: var(--status-color-info);
  }
  
  .shooter-select__listbox {
    max-height: inherit;
    overflow-y: auto;
    margin: 0;
    padding: var(--spacing-xxs) 0;
    list-style: none;
  }
  
  .shooter-select__option {
    display: flex;
    align-items: center;
    padding: var(--spacing-xs) 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
    gap: var(--spacing-xs);
  }
  
  .shooter-select__option--highlighted {
    background: var(--bg-color-tertiary);
  }

  .shooter-select__option--selected {
    background: var(--status-color-info-light);
  }

  .shooter-select__option--disabled {
    cursor: not-allowed;
  }

  .shooter-select__checkbox {
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .shooter-select__checkbox--checked {
    background: var(--status-color-info);
    border-color: var(--status-color-info);
  }
  
  .shooter-select__option-label {
    flex: 1;
  }
  
  .shooter-select__no-options {
    padding: var(--spacing-md) var(--spacing-sm);
    text-align: center;

  }
  
  .shooter-select__error {


    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);

  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-select__trigger {
      min-height: 44px;
    }
    
    .shooter-select__dropdown {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 50vh;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      margin: 0;
    }
  }
  
  /* Scrollbar styling */
  .shooter-select__listbox::-webkit-scrollbar {
    width: 6px;
  }
  
  .shooter-select__listbox::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }

  .shooter-select__listbox::-webkit-scrollbar-thumb {
    background: var(--bg-color-elevated);
    border-radius: var(--radius-xs);
  }

  .shooter-select__listbox::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-muted);
  }
</style>
