<!--
  ShooterModal - Modal dialog component with focus management
  Features: Backdrop, animations, keyboard navigation, accessibility
  Enhanced with Juspay foundation for production-quality experience
-->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  
  export let open = false;
  export let title: string | null = null;
  export let size: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen' = 'md';
  export let closable = true;
  export let closeOnBackdrop = true;
  export let closeOnEscape = true;
  export let centered = true;
  export let scrollable = false;
  export let persistent = false;
  export let ariaLabel: string | null = null;
  export let ariaDescribedBy: string | null = null;
  
  const dispatch = createEventDispatcher<{
    open: void;
    close: void;
    beforeClose: { preventDefault: () => void };
  }>();
  
  let modalElement: HTMLElement;
  let backdropElement: HTMLElement;
  let previousActiveElement: HTMLElement | null = null;
  let modalId: string;
  let titleId: string;
  
  // Animation state
  let isVisible = false;
  let isAnimating = false;
  
  onMount(() => {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    modalId = `shooter-modal-${uniqueId}`;
    titleId = `${modalId}-title`;
  });
  
  // Handle open/close state changes
  $: if (browser) {
    if (open && !isVisible) {
      openModal();
    } else if (!open && isVisible) {
      closeModal();
    }
  }
  
  function openModal() {
    if (isAnimating) {
return;
}
    
    // Store currently focused element
    previousActiveElement = document.activeElement as HTMLElement;
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Show modal
    isVisible = true;
    isAnimating = true;
    
    dispatch('open');
    
    // Focus management
    setTimeout(() => {
      focusModal();
      isAnimating = false;
    }, 150);
  }
  
  function closeModal() {
    if (isAnimating || persistent) {
return;
}
    
    let prevented = false;
    dispatch('beforeClose', {
      preventDefault: () => {
 prevented = true; 
}
    });
    
    if (prevented) {
return;
}
    
    isAnimating = true;
    
    // Start closing animation
    setTimeout(() => {
      isVisible = false;
      isAnimating = false;
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      // Restore focus
      if (previousActiveElement) {
        previousActiveElement.focus();
        previousActiveElement = null;
      }
      
      dispatch('close');
    }, 150);
  }
  
  function focusModal() {
    if (modalElement) {
      const focusableElements = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstFocusable = focusableElements[0] as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        modalElement.focus();
      }
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (!isVisible) {
return;
}
    
    if (event.key === 'Escape' && closeOnEscape && closable) {
      event.preventDefault();
      handleClose();
    } else if (event.key === 'Tab') {
      trapFocus(event);
    }
  }
  
  function trapFocus(event: KeyboardEvent) {
    if (!modalElement) {
return;
}
    
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (!firstFocusable || !lastFocusable) {
return;
}

    if (event.shiftKey) {
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && closable && event.target === backdropElement) {
      handleClose();
    }
  }
  
  function handleClose() {
    if (closable) {
      open = false;
    }
  }
  
  onDestroy(() => {
    if (browser && isVisible) {
      document.body.style.overflow = '';
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isVisible}
  <!-- Backdrop -->
  <div
    bind:this={backdropElement}
    class="shooter-modal-backdrop"
    class:shooter-modal-backdrop--visible={open}
    on:click={handleBackdropClick}
    on:keydown={(e) => {
      if ((e.key === 'Enter' || e.key === ' ') && closeOnBackdrop && closable) {
        e.preventDefault();
        handleClose();
      }
    }}
    role="presentation"
  >
    <!-- Modal Container -->
    <div
      class="shooter-modal-container shooter-modal-container--{size}"
      class:shooter-modal-container--centered={centered}
      class:shooter-modal-container--scrollable={scrollable}
    >
      <!-- Modal Content -->
      <div
        bind:this={modalElement}
        id={modalId}
        class="shooter-modal"
        class:shooter-modal--visible={open}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        aria-labelledby={title ? titleId : null}
        aria-describedby={ariaDescribedBy}
        tabindex="-1"
      >
        <!-- Header -->
        {#if title || closable || $$slots.header}
          <header class="shooter-modal__header">
            {#if $$slots.header}
              <slot name="header" />
            {:else if title}
              <h2 id={titleId} class="shooter-modal__title">
                {title}
              </h2>
            {/if}
            
            {#if closable}
              <button
                type="button"
                class="shooter-modal__close"
                on:click={handleClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            {/if}
          </header>
        {/if}
        
        <!-- Body -->
        <div class="shooter-modal__body" class:shooter-modal__body--scrollable={scrollable}>
          <slot />
        </div>
        
        <!-- Footer -->
        {#if $$slots.footer}
          <footer class="shooter-modal__footer">
            <slot name="footer" />
          </footer>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .shooter-modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-color-overlay);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md);
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  
  .shooter-modal-backdrop--visible {
    opacity: 1;
  }
  
  .shooter-modal-container {
    width: 100%;
    max-height: 100%;
    display: flex;
    position: relative;
  }
  
  .shooter-modal-container--centered {
    align-items: center;
    justify-content: center;
  }
  
  .shooter-modal-container--scrollable {
    align-items: flex-start;
    padding-top: 2rem;
    padding-bottom: 2rem;
  }
  
  /* Size variants */
  .shooter-modal-container--sm {
    max-width: 400px;
  }
  
  .shooter-modal-container--md {
    max-width: 600px;
  }
  
  .shooter-modal-container--lg {
    max-width: 800px;
  }
  
  .shooter-modal-container--xl {
    max-width: 1200px;
  }
  
  .shooter-modal-container--fullscreen {
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
  }
  
  .shooter-modal {
    background: var(--bg-color-secondary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    max-height: 100%;
    width: 100%;
    transform: scale(0.95) translateY(20px);
    opacity: 0;
    transition: all 0.15s ease;
  }

  .shooter-modal--visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  .shooter-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--bg-color-elevated);
    flex-shrink: 0;
  }
  
  .shooter-modal__title {
    margin: 0;


  }
  
  .shooter-modal__close {
    background: none;
    border: none;

    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: all 0.2s;
    margin: -0.5rem;
    flex-shrink: 0;
  }
  
  .shooter-modal__close:hover {
    background: var(--bg-color-tertiary);
  }

  .shooter-modal__close:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .shooter-modal__body {
    padding: var(--spacing-lg);
    flex: 1;
  }

  .shooter-modal__body--scrollable {
    overflow-y: auto;
  }

  .shooter-modal__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-top: 1px solid var(--bg-color-elevated);
    flex-shrink: 0;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-modal-backdrop {
      padding: 0;
      align-items: flex-end;
    }
    
    .shooter-modal-container {
      max-width: 100%;
      align-items: stretch;
    }
    
    .shooter-modal-container--centered {
      align-items: flex-end;
    }
    
    .shooter-modal {
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      max-height: 90vh;
      margin: 0;
      transform: translateY(100%);
    }
    
    .shooter-modal--visible {
      transform: translateY(0);
    }


    .shooter-modal__header {
      padding: var(--spacing-md);
    }

    .shooter-modal__body {
      padding: var(--spacing-md);
    }

    .shooter-modal__footer {
      padding: var(--spacing-md);
      flex-direction: column-reverse;
      gap: var(--spacing-xs);
    }

    .shooter-modal__footer :global(button) {
      width: 100%;
    }
  }
  
  /* Extra small screens */
  @media (max-width: 480px) {
    .shooter-modal-backdrop {
      padding: 0;
    }
    
    .shooter-modal-container--fullscreen,
    .shooter-modal-container--xl,
    .shooter-modal-container--lg,
    .shooter-modal-container--md,
    .shooter-modal-container--sm {
      max-width: 100%;
    }
    
    .shooter-modal {
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      max-height: 95vh;
    }
  }
  
  /* Scrollbar styling for modal body */
  .shooter-modal__body--scrollable::-webkit-scrollbar {
    width: 6px;
  }

  .shooter-modal__body--scrollable::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }

  .shooter-modal__body--scrollable::-webkit-scrollbar-thumb {
    background: var(--bg-color-elevated);
    border-radius: var(--radius-xs);
  }

  .shooter-modal__body--scrollable::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-muted);
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .shooter-modal-backdrop,
    .shooter-modal {
      transition: none;
    }
    
    .shooter-modal {
      transform: none;
    }
    
    .shooter-modal--visible {
      transform: none;
    }
  }
</style>
