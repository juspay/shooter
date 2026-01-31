<!--
  Sidebar - Navigation sidebar component
  Features: Collapsible, mobile-responsive, nested navigation, active states
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { page } from '$app/stores';
  import { ShooterBadge, ShooterButton } from '$lib/components/shooter';
  import type { NavigationItem } from './types';

  // Props
  export let items: NavigationItem[] = [];
  export let collapsed = false;
  export let mobile = false;
  export let showToggle = true;
  export let logo: string | null = null;
  export let logoText = 'Shooter Dashboard';
  export let currentPath: string = '';
  export const searchable: boolean = false; // Enable search functionality
  export const header: string | null = null; // Custom header content
  export const footer: string | null = null; // Custom footer content
  export const collapsible: boolean = true; // Allow collapsing (alias for showToggle compatibility)
  export const showTooltips: boolean = true; // Show tooltips on hover
  
  // Internal state
  let expandedItems: Set<string> = new Set();
  
  const dispatch = createEventDispatcher<{
    toggle: boolean;
    navigate: { item: NavigationItem; path: string };
    itemClick: NavigationItem;
  }>();
  
  // Get current path from page store if not provided
  $: activePath = currentPath || $page.url.pathname;
  
  function toggleSidebar() {
    collapsed = !collapsed;
    dispatch('toggle', collapsed);
  }
  
  function toggleExpanded(itemId: string) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
    }
    expandedItems = new Set(expandedItems);
  }
  
  function handleItemClick(item: NavigationItem) {
    if (item.disabled) {
return;
}
    
    dispatch('itemClick', item);
    
    if (item.onClick) {
      item.onClick();
    }
    
    if (item.href) {
      dispatch('navigate', { item, path: item.href });
    }
    
    if (item.children && item.children.length > 0) {
      toggleExpanded(item.id);
    }
  }
  
  function isActive(item: NavigationItem): boolean {
    if (item.href === activePath) {
return true;
}
    if (item.children) {
      return item.children.some(child => isActive(child));
    }
    return false;
  }
  
  function isExpanded(itemId: string): boolean {
    return expandedItems.has(itemId);
  }
  
</script>

<aside 
  class="sidebar"
  class:sidebar--collapsed={collapsed}
  class:sidebar--mobile={mobile}
  aria-label="Main navigation"
>
  <!-- Header -->
  <div class="sidebar-header">
    {#if logo || logoText}
      <div class="sidebar-logo">
        {#if logo}
          <img src={logo} alt={logoText} class="logo-image" />
        {/if}
        {#if !collapsed || mobile}
          <span class="logo-text">{logoText}</span>
        {/if}
      </div>
    {/if}
    
    {#if showToggle && !mobile}
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={toggleSidebar}
        ariaLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        class="sidebar-toggle"
      >
        {collapsed ? '▶️' : '◀️'}
      </ShooterButton>
    {/if}
  </div>
  
  <!-- Navigation -->
  <nav class="sidebar-nav">
    <ul class="nav-list" role="menubar">
      {#each items as item (item.id)}
        <li 
          class="nav-item"
          class:nav-item--disabled={item.disabled}
          role="none"
        >
          <div
            class="nav-link"
            class:nav-link--active={isActive(item)}
            class:nav-link--has-children={item.children && item.children.length > 0}
            class:nav-link--expanded={isExpanded(item.id)}
            role="menuitem"
            tabindex={item.disabled ? -1 : 0}
            aria-expanded={item.children ? isExpanded(item.id) : undefined}
            aria-disabled={item.disabled}
            on:click={() => handleItemClick(item)}
            on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleItemClick(item)}
          >
            {#if item.icon}
              <span class="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
            {/if}
            
            {#if !collapsed || mobile}
              <span class="nav-label">{item.label}</span>
              
              {#if item.badge}
                <ShooterBadge
                  variant={item.badge.variant || 'neutral'}
                  size="sm"
                  class="nav-badge"
                >
                  {item.badge.text}
                </ShooterBadge>
              {/if}
              
              {#if item.children && item.children.length > 0}
                <span class="nav-arrow" aria-hidden="true">
                  {isExpanded(item.id) ? '⌄' : '⌃'}
                </span>
              {/if}
              
              {#if item.external}
                <span class="nav-external" aria-hidden="true">↗</span>
              {/if}
            {/if}
          </div>
          
          <!-- Submenu -->
          {#if item.children && item.children.length > 0 && (isExpanded(item.id) || mobile)}
            <ul class="nav-submenu" role="menu">
              {#each item.children as childItem (childItem.id)}
                <li class="nav-item nav-item--child" role="none">
                  <div
                    class="nav-link nav-link--child"
                    class:nav-link--active={isActive(childItem)}
                    class:nav-link--disabled={childItem.disabled}
                    role="menuitem"
                    tabindex={childItem.disabled ? -1 : 0}
                    aria-disabled={childItem.disabled}
                    on:click={() => handleItemClick(childItem)}
                    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleItemClick(childItem)}
                  >
                    {#if childItem.icon}
                      <span class="nav-icon nav-icon--child" aria-hidden="true">
                        {childItem.icon}
                      </span>
                    {/if}
                    
                    <span class="nav-label">{childItem.label}</span>
                    
                    {#if childItem.badge}
                      <ShooterBadge
                        variant={childItem.badge.variant || 'neutral'}
                        size="sm"
                        class="nav-badge"
                      >
                        {childItem.badge.text}
                      </ShooterBadge>
                    {/if}
                    
                    {#if childItem.external}
                      <span class="nav-external" aria-hidden="true">↗</span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </nav>
  
  <!-- Footer slot -->
  {#if $$slots.footer}
    <div class="sidebar-footer">
      <slot name="footer" />
    </div>
  {/if}
</aside>

<style>
  /* Import Shooter design system */

  .sidebar {
    background: var(--bg-color-secondary);
    border-right: 1px solid var(--border-color-primary);
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 280px;
    transition: width var(--transition-base);
    position: relative;
    z-index: var(--shooter-z-sticky);
  }
  
  .sidebar--collapsed {
    width: 72px;
  }
  
  .sidebar--mobile {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    z-index: var(--shooter-z-modal);
    box-shadow: var(--shadow-xl);
  }
  
  /* Header */
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
    min-height: 64px;
  }
  
  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    min-width: 0;
  }
  
  .logo-image {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
  }
  
  .logo-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .sidebar--collapsed .logo-text {
    display: none;
  }
  
  /* Navigation */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-xs) 0;
  }
  
  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  
  .nav-item {
    margin: 0;
  }
  
  .nav-item--disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  
  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    cursor: pointer;
    transition: all var(--transition-base);
    border-radius: 0;
    position: relative;
    min-height: 44px;
  }

  .nav-link:hover {
    background: var(--bg-color-tertiary);
  }

  .nav-link--active {
    background: var(--status-color-info-bg-light);
  }
  
  .nav-link--active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--status-color-info);
  }
  
  .nav-link:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--border-color-focus);
  }
  
  .nav-icon {

    flex-shrink: 0;
    width: 24px;
    text-align: center;

  }
  
  .nav-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .sidebar--collapsed .nav-label {
    display: none;
  }

  .nav-arrow {

    transition: transform var(--transition-base);
    flex-shrink: 0;
  }
  
  .nav-link--expanded .nav-arrow {
    transform: rotate(180deg);
  }
  
  .sidebar--collapsed .nav-arrow {
    display: none;
  }
  
  .nav-external {

    opacity: 0.7;
    flex-shrink: 0;
  }
  
  .sidebar--collapsed .nav-external {
    display: none;
  }
  
  /* Submenu */
  .nav-submenu {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--bg-color-primary);
    border-top: 1px solid var(--border-color-primary);
  }
  
  .nav-item--child {
    border-left: 2px solid var(--border-color-primary);
    margin-left: var(--spacing-xxl);
  }
  
  .nav-link--child {
    padding-left: var(--spacing-xl);

  }
  
  .nav-icon--child {

    width: 20px;
  }
  
  .sidebar--collapsed .nav-submenu {
    display: none;
  }
  
  /* Footer */
  .sidebar-footer {
    border-top: 1px solid var(--border-color-primary);
    padding: var(--spacing-md);
  }
  
  /* Tooltip for collapsed state */
  .sidebar--collapsed .nav-link {
    position: relative;
    justify-content: center;
  }
  
  .sidebar--collapsed .nav-link:hover::after {
    content: attr(aria-label);
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    background: var(--bg-color-tertiary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-md);
    white-space: nowrap;
    z-index: var(--shooter-z-tooltip);
    margin-left: var(--spacing-xs);
    box-shadow: var(--shadow-md);
    pointer-events: none;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .sidebar {
      width: 100vw;
      max-width: 320px;
    }
    
    .sidebar--collapsed {
      width: 100vw;
      max-width: 320px;
    }
    
    .nav-link {
      padding: var(--spacing-md);
      min-height: 48px;
    }
    
    .nav-icon {

      width: 28px;
    }
  }
  
  /* Scrollbar styling */
  .sidebar-nav::-webkit-scrollbar {
    width: 4px;
  }
  
  .sidebar-nav::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .sidebar-nav::-webkit-scrollbar-thumb {
    background: var(--border-color-primary);
    border-radius: var(--radius-xxs);
  }
  
  .sidebar-nav::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-tertiary);
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .sidebar {
      border-right-width: 2px;
    }
    
    .nav-link--active::before {
      width: 4px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .nav-link,
    .nav-arrow {
      transition: none;
    }
    
    .nav-link--expanded .nav-arrow {
      transform: none;
    }
  }
</style>
