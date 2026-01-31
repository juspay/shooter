<!--
  MobileNav - Mobile-optimized navigation component
  Features: Bottom navigation, gesture support, compact design
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterBadge } from '$lib/components/shooter';
  import type { MobileNavItem } from './types';

  // Props
  export let items: MobileNavItem[] = [];
  export let activeItemId: string = '';
  export let position: 'bottom' | 'top' = 'bottom';
  export let showLabels = true;
  export let compact = false;
  export let floating = false;
  export let hapticFeedback = true;
  export let swipeGestures = true;
  export let currentPath: string = '';
  export const visible: boolean = true; // Visibility control
  export const autoClose: boolean = false; // Auto-close after navigation
  export const showOverlay: boolean = false; // Show backdrop overlay
  export const showCloseButton: boolean = false; // Show close button
  export const animation: string | null = null; // Animation type
  export const swipeToClose: boolean = false; // Enable swipe-to-close gesture
  export const header: string | null = null; // Header text
  export const autoHideTimeout: number = 0; // Auto-hide after milliseconds (0 = disabled)
  
  // Internal state
  let navElement: HTMLElement;
  let isVisible = true;
  let lastScrollY = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeThreshold = 50;
  
  const dispatch = createEventDispatcher<{
    itemClick: { item: MobileNavItem; path?: string };
    navigate: { item: MobileNavItem; path: string };
    swipe: { direction: 'left' | 'right' | 'up' | 'down' };
    visibilityChange: boolean;
  }>();
  
  // Auto-hide on scroll (for bottom navigation)
  function handleScroll() {
    if (position !== 'bottom' || floating) {
return;
}
    
    const currentScrollY = window.scrollY;
    const scrollingDown = currentScrollY > lastScrollY;
    const scrollingUp = currentScrollY < lastScrollY;
    const scrolledPastThreshold = Math.abs(currentScrollY - lastScrollY) > 10;
    
    if (scrollingDown && scrolledPastThreshold && isVisible) {
      isVisible = false;
      dispatch('visibilityChange', false);
    } else if (scrollingUp && scrolledPastThreshold && !isVisible) {
      isVisible = true;
      dispatch('visibilityChange', true);
    }
    
    lastScrollY = currentScrollY;
  }
  
  // Touch gesture handling
  function handleTouchStart(event: TouchEvent) {
    if (!swipeGestures) {
return;
}

    const touch = event.touches[0];
    if (!touch) {
return;
}

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!swipeGestures) {
return;
}

    const touch = event.changedTouches[0];
    if (!touch) {
return;
}

    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    // Determine swipe direction
    if (absDeltaX > swipeThreshold || absDeltaY > swipeThreshold) {
      let direction: 'left' | 'right' | 'up' | 'down';
      
      if (absDeltaX > absDeltaY) {
        direction = deltaX > 0 ? 'right' : 'left';
      } else {
        direction = deltaY > 0 ? 'down' : 'up';
      }
      
      dispatch('swipe', { direction });
    }
  }
  
  function handleItemClick(item: MobileNavItem) {
    if (item.disabled) {
return;
}

    // Haptic feedback
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }

    dispatch('itemClick', item.href ? { item, path: item.href } : { item });
    
    if (item.onClick) {
      item.onClick();
    }
    
    if (item.href) {
      dispatch('navigate', { item, path: item.href });
    }
  }
  
  function isActive(item: MobileNavItem): boolean {
    if (activeItemId) {
      return item.id === activeItemId;
    }
    return item.href === currentPath;
  }
  
  // Setup scroll listener
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true });
  }
</script>

<nav 
  class="mobile-nav"
  class:mobile-nav--top={position === 'top'}
  class:mobile-nav--bottom={position === 'bottom'}
  class:mobile-nav--compact={compact}
  class:mobile-nav--floating={floating}
  class:mobile-nav--hidden={!isVisible}
  class:mobile-nav--no-labels={!showLabels}
  bind:this={navElement}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  aria-label="Mobile navigation"
>
  <div class="nav-container">
    {#each items as item (item.id)}
      <button
        class="nav-item"
        class:nav-item--active={isActive(item)}
        class:nav-item--disabled={item.disabled}
        disabled={item.disabled}
        on:click={() => handleItemClick(item)}
        aria-label={item.label}
        aria-current={isActive(item) ? 'page' : undefined}
      >
        <div class="nav-icon-container">
          <span class="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          
          {#if item.badge}
            <ShooterBadge
              variant={item.badge.variant || 'primary'}
              size="sm"
              class="nav-badge"
            >
              {item.badge.text}
            </ShooterBadge>
          {/if}
        </div>
        
        {#if showLabels && !compact}
          <span class="nav-label">{item.label}</span>
        {/if}
        
        <!-- Active indicator -->
        {#if isActive(item)}
          <div class="nav-indicator" aria-hidden="true"></div>
        {/if}
      </button>
    {/each}
  </div>
  
  <!-- Floating navigation backdrop -->
  {#if floating}
    <div class="nav-backdrop" aria-hidden="true"></div>
  {/if}
</nav>

<style>
  /* Import Shooter design system */

  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    z-index: var(--shooter-z-sticky);
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    transition: transform var(--transition-base);
  }
  
  .mobile-nav--top {
    top: 0;
    border-bottom: 1px solid var(--border-color-primary);
    border-top: none;
  }
  
  .mobile-nav--bottom {
    bottom: 0;
    border-top: 1px solid var(--border-color-primary);
    border-bottom: none;
  }
  
  .mobile-nav--floating {
    margin: var(--spacing-sm);
    left: var(--spacing-sm);
    right: var(--spacing-sm);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    position: relative;
    overflow: hidden;
  }
  
  .mobile-nav--floating.mobile-nav--bottom {
    bottom: var(--spacing-sm);
  }
  
  .mobile-nav--floating.mobile-nav--top {
    top: var(--spacing-sm);
  }
  
  .mobile-nav--hidden {
    transform: translateY(100%);
  }
  
  .mobile-nav--top.mobile-nav--hidden {
    transform: translateY(-100%);
  }
  
  .mobile-nav--compact {
    height: 56px;
  }
  
  .nav-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-color-secondary);
    opacity: 0.95;
    backdrop-filter: blur(10px);
    z-index: -1;
  }
  
  .nav-container {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: var(--spacing-xs) var(--spacing-sm);
    min-height: 64px;
  }
  
  .mobile-nav--compact .nav-container {
    min-height: 56px;
    padding: var(--spacing-xxs) var(--spacing-sm);
  }
  
  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xxs);
    background: none;
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs);
    flex: 1;
    max-width: 80px;
    position: relative;
    min-height: 48px;
  }

  .mobile-nav--compact .nav-item {
    min-height: 40px;
    padding: var(--spacing-xxs);
  }

  .nav-item:hover:not(:disabled) {
    background: var(--bg-color-tertiary);
  }

  .nav-item:active:not(:disabled) {
    transform: scale(0.95);
    background: var(--bg-color-tertiary);
  }

  .nav-item--active {
    background: var(--status-color-info-bg-light);
  }
  
  .nav-item--disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
  
  .nav-icon-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .nav-icon {

    transition: transform var(--transition-base);
  }
  
  .mobile-nav--compact
  
  .nav-item--active .nav-icon {
    transform: scale(1.1);
  }

  .nav-label {

    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;

  }
  
  .mobile-nav--no-labels .nav-label {
    display: none;
  }
  
  .nav-indicator {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 3px;
    background: var(--status-color-info);
    border-radius: var(--radius-full);
  }
  
  .mobile-nav--top .nav-indicator {
    top: 0;
    bottom: auto;
  }
  
  /* Improved touch targets */
  @media (max-width: 768px) {
    .nav-item {
      min-height: 52px;
      padding: var(--spacing-xs);
    }
    
    .mobile-nav--compact .nav-item {
      min-height: 44px;
    }
  }

  /* Safe area support for devices with notches */
  @supports (bottom: env(safe-area-inset-bottom)) {
    .mobile-nav--bottom:not(.mobile-nav--floating) {
      padding-bottom: env(safe-area-inset-bottom);
    }
    
    .mobile-nav--top:not(.mobile-nav--floating) {
      padding-top: env(safe-area-inset-top);
    }
  }
  
  /* Dark mode optimization */
  @media (prefers-color-scheme: dark) {
    .nav-backdrop {
      backdrop-filter: blur(20px);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .mobile-nav {
      border-width: 2px;
    }
    
    .nav-item--active {
      border: 1px solid var(--status-color-info);
    }
    
    .nav-indicator {
      height: 4px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .mobile-nav,
    .nav-item,
    .nav-icon {
      transition: none;
    }
    
    .nav-item:active:not(:disabled) {
      transform: none;
    }
    
    .nav-item--active .nav-icon {
      transform: none;
    }
  }
  
  /* Landscape orientation optimization */
  @media (orientation: landscape) and (max-height: 500px) {
    .nav-container {
      min-height: 48px;
      padding: var(--spacing-xxs) var(--spacing-xs);
    }
    
    .nav-item {
      min-height: 40px;
      gap: 0;
    }
    
    .nav-label {
      display: none;
    }
  }
  
  /* Accessibility improvements */
  .nav-item:focus {
    outline: 2px solid var(--border-color-focus);
    outline-offset: 2px;
  }
  
  /* Animation for floating navigation */
  .mobile-nav--floating {
    animation: slideUp 0.3s ease-out;
  }
  
  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  /* Handle very small screens */
  @media (max-width: 320px) {
    .nav-container {
      padding: var(--spacing-xxs) var(--spacing-xs);
    }
    
    .nav-item {
      max-width: 60px;
      padding: var(--spacing-xxs);
    }
  }
</style>
