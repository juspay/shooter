<!--
  DashboardLayout - Complete dashboard layout with all components
  Features: Responsive design, mobile navigation, toast system, full integration
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { 
    Sidebar, 
    TopNavbar, 
    MobileNav, 
    Toast, 
    StatusScreen,
    type NavigationItem,
    type User,
    type NavbarNotification,
    type MobileNavItem,
    type ToastNotification,
    type LayoutState,
    createDefaultLayoutState,
    getBreakpoint,
    isMobileBreakpoint,
    generateMockUser,
    generateMockNotifications,
    generateMockNavigation,
    generateMockMobileNavigation
  } from './index';
  
  // Props
  export let title: string = 'Shooter Dashboard';
  export let user: User | null = null;
  export let navigationItems: NavigationItem[] = [];
  export let mobileNavItems: MobileNavItem[] = [];
  export let notifications: NavbarNotification[] = [];

  // Backward compatibility alias
  export let navigation: NavigationItem[] = [];
  export let currentPath: string = '';
  export let showMobileNav = true;
  export let showTopNavbar = true;
  export let showSidebar = true;
  export let logo: string | null = null;
  export let breadcrumbs: Array<{ label: string; href?: string }> = [];
  export let loading = false;
  export let error: string | null = null;
  export const searchable: boolean = false; // Enable search functionality
  export const showThemeToggle: boolean = true; // Show theme toggle button
  export let toasts: ToastNotification[] = []; // Toast notifications

  // Layout state
  const layoutState = writable<LayoutState>(createDefaultLayoutState());
  let currentBreakpoint: keyof typeof import('./index').LAYOUT_BREAKPOINTS | 'xs' = 'lg';
  let windowWidth = 1024;
  let sidebarCollapsed = false;
  let showMobileSidebar = false;
  
  // Initialize with mock data if not provided
  $: actualUser = user || generateMockUser();
  $: actualNavItems = navigationItems.length > 0 ? navigationItems : (navigation.length > 0 ? navigation : generateMockNavigation());
  $: actualMobileNavItems = (mobileNavItems.length > 0
    ? mobileNavItems
    : (navigation.length > 0
      ? navigation.filter(item => item.icon).map(item => ({
          id: item.id,
          label: item.label,
          icon: item.icon!,
          href: item.href,
          badge: item.badge,
          disabled: item.disabled,
          onClick: item.onClick
        })).slice(0, 5)
      : generateMockMobileNavigation())) as MobileNavItem[];
  $: actualNotifications = notifications.length > 0 ? notifications : generateMockNotifications();
  
  // Responsive breakpoint detection
  function updateBreakpoint() {
    if (typeof window !== 'undefined') {
      windowWidth = window.innerWidth;
      currentBreakpoint = getBreakpoint(windowWidth);
      
      layoutState.update(state => ({
        ...state,
        currentBreakpoint: currentBreakpoint,
        sidebarMobile: isMobileBreakpoint(currentBreakpoint)
      }));
      
      // Auto-collapse sidebar on small screens
      if (isMobileBreakpoint(currentBreakpoint)) {
        sidebarCollapsed = true;
        showMobileSidebar = false;
      }
    }
  }
  
  // Toast management
  function removeToast(toastId: string) {
    toasts = toasts.filter(t => t.id !== toastId);
    layoutState.update(state => ({ ...state, toasts }));
  }
  
  // Navigation handlers
  function handleSidebarToggle() {
    if (isMobileBreakpoint(currentBreakpoint)) {
      showMobileSidebar = !showMobileSidebar;
    } else {
      sidebarCollapsed = !sidebarCollapsed;
    }
    
    layoutState.update(state => ({
      ...state,
      sidebarCollapsed,
      sidebarMobile: showMobileSidebar
    }));
  }
  
  function handleSidebarNavigation(event: CustomEvent<{ item: NavigationItem; path: string }>) {
    const { item, path } = event.detail;
    currentPath = path;
    
    // Close mobile sidebar after navigation
    if (isMobileBreakpoint(currentBreakpoint)) {
      showMobileSidebar = false;
    }
    
    // Emit navigation event
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path, item } }));
  }
  
  function handleMobileNavigation(event: CustomEvent<{ item: MobileNavItem; path: string }>) {
    const { item, path } = event.detail;
    currentPath = path;
    
    // Emit navigation event
    window.dispatchEvent(new CustomEvent('navigate', { detail: { path, item } }));
  }
  
  function handleTopNavbarAction(event: CustomEvent) {
    const { type, detail } = event;
    
    switch (type) {
      case 'toggleSidebar':
        handleSidebarToggle();
        break;
      case 'search':
        // Emit search event
        window.dispatchEvent(new CustomEvent('search', { detail }));
        break;
      case 'notificationClick': {
        // Mark notification as read and emit click event
        const notification = detail as NavbarNotification;
        markNotificationAsRead(notification.id);
        window.dispatchEvent(new CustomEvent('notificationClick', { detail: notification }));
        break;
      }
      case 'markAllNotificationsRead':
        markAllNotificationsAsRead();
        break;
      case 'logout':
        // Emit logout event
        window.dispatchEvent(new CustomEvent('logout'));
        break;
    }
  }
  
  function markNotificationAsRead(notificationId: string) {
    actualNotifications = actualNotifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
  }
  
  function markAllNotificationsAsRead() {
    actualNotifications = actualNotifications.map(n => ({ ...n, read: true }));
  }
  
  // Toast handlers
  function handleToastDismiss(event: CustomEvent<{ id: string; reason: string }>) {
    removeToast(event.detail.id);
  }
  
  function handleToastAction(event: CustomEvent<{ toastId: string; actionId: string }>) {
    const { toastId, actionId } = event.detail;
    
    // Emit toast action event
    window.dispatchEvent(new CustomEvent('toastAction', { 
      detail: { toastId, actionId } 
    }));
    
    // Remove toast after action
    removeToast(toastId);
  }
  
  // Error handling
  function handleRetry() {
    error = null;
    loading = true;
    
    // Emit retry event
    window.dispatchEvent(new CustomEvent('retry'));
  }
  
  function handleGoHome() {
    currentPath = '/';
    error = null;
    
    // Emit navigation to home
    window.dispatchEvent(new CustomEvent('navigate', { 
      detail: { path: '/', item: null } 
    }));
  }
  
  // Keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          handleSidebarToggle();
          break;
        case 'k': {
          event.preventDefault();
          // Focus search
          const searchInput = document.querySelector('[type="search"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
          break;
        }
      }
    }
    
    if (event.key === 'Escape') {
      if (showMobileSidebar) {
        showMobileSidebar = false;
      }
    }
  }
  
  // Window resize handler
  let resizeTimer: ReturnType<typeof setTimeout>;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateBreakpoint, 150);
  }
  
  onMount(() => {
    updateBreakpoint();
    
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeydown);
    }
  });
  
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
    }
    clearTimeout(resizeTimer);
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="dashboard-layout" class:dashboard-layout--mobile={isMobileBreakpoint(currentBreakpoint)}>
  <!-- Mobile Sidebar Overlay -->
  {#if showMobileSidebar && isMobileBreakpoint(currentBreakpoint)}
    <div 
      class="mobile-sidebar-overlay"
      on:click={() => showMobileSidebar = false}
      on:keydown={(e) => e.key === 'Enter' && (showMobileSidebar = false)}
      role="button"
      tabindex="0"
      aria-label="Close sidebar"
    ></div>
  {/if}
  
  <!-- Sidebar -->
  {#if showSidebar}
    <Sidebar
      items={actualNavItems}
      collapsed={sidebarCollapsed && !isMobileBreakpoint(currentBreakpoint)}
      mobile={showMobileSidebar && isMobileBreakpoint(currentBreakpoint)}
      {logo}
      logoText={title}
      {currentPath}
      on:toggle={handleSidebarToggle}
      on:navigate={handleSidebarNavigation}
      on:itemClick={(e) => window.dispatchEvent(new CustomEvent('sidebarItemClick', { detail: e.detail }))}
    />
  {/if}
  
  <!-- Main Content Area -->
  <div class="dashboard-main" class:dashboard-main--sidebar-collapsed={sidebarCollapsed && !isMobileBreakpoint(currentBreakpoint)}>
    <!-- Top Navigation -->
    {#if showTopNavbar}
      <TopNavbar
        user={actualUser}
        notifications={actualNotifications}
        {title}
        {breadcrumbs}
        mobile={isMobileBreakpoint(currentBreakpoint)}
        {sidebarCollapsed}
        on:toggleSidebar={handleSidebarToggle}
        on:search={(e) => handleTopNavbarAction(new CustomEvent('search', { detail: e.detail }))}
        on:notificationClick={(e) => handleTopNavbarAction(new CustomEvent('notificationClick', { detail: e.detail }))}
        on:markAllNotificationsRead={() => handleTopNavbarAction(new CustomEvent('markAllNotificationsRead'))}
        on:userMenuClick={(e) => window.dispatchEvent(new CustomEvent('userMenuClick', { detail: e.detail }))}
        on:logout={() => handleTopNavbarAction(new CustomEvent('logout'))}
        on:breadcrumbClick={(e) => window.dispatchEvent(new CustomEvent('breadcrumbClick', { detail: e.detail }))}
      />
    {/if}
    
    <!-- Content Area -->
    <main class="dashboard-content">
      {#if error}
        <StatusScreen
          status="error"
          title="Something went wrong"
          message={error}
          on:retry={handleRetry}
          on:goHome={handleGoHome}
        />
      {:else if loading}
        <StatusScreen
          status="loading"
          title="Loading..."
          message="Please wait while we load your dashboard."
        />
      {:else}
        <slot />
      {/if}
    </main>
  </div>
  
  <!-- Mobile Navigation -->
  {#if showMobileNav && isMobileBreakpoint(currentBreakpoint)}
    <MobileNav
      items={actualMobileNavItems}
      {currentPath}
      position="bottom"
      floating={true}
      on:navigate={handleMobileNavigation}
      on:itemClick={(e) => window.dispatchEvent(new CustomEvent('mobileNavItemClick', { detail: e.detail }))}
      on:swipe={(e) => window.dispatchEvent(new CustomEvent('mobileNavSwipe', { detail: e.detail }))}
    />
  {/if}
  
  <!-- Toast Container -->
  <div class="toast-container toast-container--top-right">
    {#each toasts as toast, index (toast.id)}
      <Toast
        {toast}
        {index}
        position="top-right"
        on:dismiss={handleToastDismiss}
        on:actionClick={handleToastAction}
      />
    {/each}
  </div>
</div>

<style>
  /* Import Shooter design system */

  .dashboard-layout {
    display: flex;
    min-height: 100vh;
    background: var(--bg-color-primary);
    position: relative;
    align-items: stretch; /* Sidebar and main stretch full height */
  }
  
  .mobile-sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--overlay-dark-light);
    z-index: var(--shooter-z-modal);
    backdrop-filter: blur(4px);
  }
  
  .dashboard-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    transition: margin-left var(--transition-base);
  }
  
  .dashboard-main--sidebar-collapsed {
    margin-left: 0;
  }
  
  .dashboard-content {
    flex: 1;
    padding: var(--spacing-xl);
    overflow-y: auto;
    position: relative;
  }
  
  .toast-container {
    position: fixed;
    z-index: var(--shooter-z-toast);
    pointer-events: none;
  }
  
  .toast-container--top-right {
    top: var(--spacing-md);
    right: var(--spacing-md);
  }
  
  .toast-container > :global(*) {
    pointer-events: auto;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .dashboard-layout--mobile {
      flex-direction: column;
    }
    
    .dashboard-main {
      margin-left: 0;
    }
    
    .dashboard-content {
      padding: var(--spacing-md);
      padding-bottom: calc(var(--spacing-md) + 80px); /* Account for mobile nav */
    }
    
    .toast-container--top-right {
      top: var(--spacing-xs);
      right: var(--spacing-xs);
      left: var(--spacing-xs);
    }
    
    .toast-container--top-right > :global(*) {
      max-width: 100%;
    }
  }
  
  /* Compact mobile screens */
  @media (max-width: 480px) {
    .dashboard-content {
      padding: var(--spacing-sm);
      padding-bottom: calc(var(--spacing-sm) + 80px);
    }
  }
  
  /* Landscape mobile optimization */
  @media (orientation: landscape) and (max-height: 500px) {
    .dashboard-content {
      padding: var(--spacing-xs);
      padding-bottom: calc(var(--spacing-xs) + 64px);
    }
  }
  
  /* Large screens */
  @media (min-width: 1280px) {
    .dashboard-content {
      padding: var(--spacing-xxl);
    }
  }
  
  /* Custom scrollbar for main content */
  .dashboard-content::-webkit-scrollbar {
    width: 8px;
  }
  
  .dashboard-content::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }
  
  .dashboard-content::-webkit-scrollbar-thumb {
    background: var(--border-color-primary);
    border-radius: var(--radius-xs);
  }
  
  .dashboard-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-tertiary);
  }
  
  /* Focus management */
  .dashboard-layout:focus-within {
    outline: none;
  }
  
  /* Print styles */
  @media print {
    .dashboard-layout {
      display: block;
    }
    
    .mobile-sidebar-overlay,
    .toast-container {
      display: none !important;
    }
    
    .dashboard-content {
      padding: 0;
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .mobile-sidebar-overlay {
      background: var(--overlay-dark-heavy);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .dashboard-main {
      transition: none;
    }
    
    .mobile-sidebar-overlay {
      backdrop-filter: none;
    }
  }
</style>
