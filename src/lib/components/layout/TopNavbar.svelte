<!--
  TopNavbar - Header navigation component
  Features: User menu, notifications, search, responsive design
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterButton, ShooterInput, ShooterBadge } from '$lib/components/shooter';
  import type { User, NavbarNotification } from './types';

  // Props
  export let user: User | null = null;
  export let notifications: NavbarNotification[] = [];
  export let showSearch = true;
  export let showNotifications = true;
  export let showUserMenu = true;
  export let searchPlaceholder = 'Search...';
  export let title: string | null = null;
  export let breadcrumbs: Array<{ label: string; href?: string }> = [];
  export let mobile = false;
  export let sidebarCollapsed = false;
  
  // Internal state
  let searchTerm = '';
  let notificationMenuOpen = false;
  let userMenuOpen = false;
  let searchFocused = false;
  
  const dispatch = createEventDispatcher<{
    search: { query: string };
    toggleSidebar: void;
    notificationClick: NavbarNotification;
    markAllNotificationsRead: void;
    userMenuClick: { action: string };
    logout: void;
    breadcrumbClick: { label: string; href?: string };
  }>();
  
  // Computed values
  $: unreadNotifications = notifications.filter(n => !n.read);
  $: unreadCount = unreadNotifications.length;
  
  function handleSearch() {
    if (searchTerm.trim()) {
      dispatch('search', { query: searchTerm.trim() });
    }
  }
  
  function handleSearchKeydown(event: CustomEvent<KeyboardEvent>) {
    if (event.detail.key === 'Enter') {
      handleSearch();
    }
  }
  
  function toggleSidebar() {
    dispatch('toggleSidebar');
  }
  
  function toggleNotificationMenu() {
    notificationMenuOpen = !notificationMenuOpen;
    userMenuOpen = false;
  }
  
  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
    notificationMenuOpen = false;
  }
  
  function closeMenus() {
    notificationMenuOpen = false;
    userMenuOpen = false;
  }
  
  function handleNotificationClick(notification: NavbarNotification) {
    dispatch('notificationClick', notification);
    closeMenus();
  }
  
  function markAllNotificationsRead() {
    dispatch('markAllNotificationsRead');
  }
  
  function handleUserMenuAction(action: string) {
    dispatch('userMenuClick', { action });
    
    if (action === 'logout') {
      dispatch('logout');
    }
    
    closeMenus();
  }
  
  function handleBreadcrumbClick(item: typeof breadcrumbs[0]) {
    dispatch('breadcrumbClick', item);
  }
  
  function formatNotificationTime(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) {
return 'Just now';
}
    if (minutes < 60) {
return `${minutes}m ago`;
}
    if (hours < 24) {
return `${hours}h ago`;
}
    return `${days}d ago`;
  }
  
  function getNotificationIcon(type: NavbarNotification['type']): string {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type] || 'ℹ️';
  }
  
  function getAvatarInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
</script>

<svelte:window on:click={closeMenus} />

<header class="top-navbar" class:top-navbar--mobile={mobile}>
  <div class="navbar-content">
    <!-- Left section -->
    <div class="navbar-left">
      <!-- Sidebar toggle -->
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={toggleSidebar}
        ariaLabel="Toggle sidebar"
        class="sidebar-toggle"
      >
        {sidebarCollapsed ? '☰' : '×'}
      </ShooterButton>
      
      <!-- Title and breadcrumbs -->
      <div class="navbar-title-section">
        {#if title}
          <h1 class="navbar-title">{title}</h1>
        {/if}
        
        {#if breadcrumbs.length > 0}
          <nav class="breadcrumbs" aria-label="Breadcrumb">
            <ol class="breadcrumb-list">
              {#each breadcrumbs as item, index}
                <li class="breadcrumb-item">
                  {#if item.href}
                    <button
                      class="breadcrumb-link"
                      on:click={() => handleBreadcrumbClick(item)}
                    >
                      {item.label}
                    </button>
                  {:else}
                    <span class="breadcrumb-text">{item.label}</span>
                  {/if}
                  
                  {#if index < breadcrumbs.length - 1}
                    <span class="breadcrumb-separator" aria-hidden="true">/</span>
                  {/if}
                </li>
              {/each}
            </ol>
          </nav>
        {/if}
      </div>
    </div>
    
    <!-- Right section -->
    <div class="navbar-right">
      <!-- Search -->
      {#if showSearch}
        <div class="search-container" class:search-container--focused={searchFocused}>
          <ShooterInput
            bind:value={searchTerm}
            placeholder={searchPlaceholder}
            type="search"
            size="sm"
            on:keydown={handleSearchKeydown}
            on:focus={() => searchFocused = true}
            on:blur={() => searchFocused = false}
          />
          {#if searchTerm}
            <ShooterButton
              variant="ghost"
              size="sm"
              on:click={handleSearch}
              ariaLabel="Search"
            >
              🔍
            </ShooterButton>
          {/if}
        </div>
      {/if}
      
      <!-- Notifications -->
      {#if showNotifications}
        <div class="notification-menu" class:notification-menu--open={notificationMenuOpen}>
          <ShooterButton
            variant="ghost"
            size="sm"
            on:click={(e) => {
 e.stopPropagation(); toggleNotificationMenu(); 
}}
            ariaLabel="Notifications"
            class="notification-button"
          >
            🔔
            {#if unreadCount > 0}
              <ShooterBadge variant="error" size="sm" class="notification-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </ShooterBadge>
            {/if}
          </ShooterButton>
          
          {#if notificationMenuOpen}
            <div
              class="notification-dropdown"
              role="menu"
              tabindex="-1"
              on:click|stopPropagation
              on:keydown|stopPropagation
            >
              <div class="notification-header">
                <h3>Notifications</h3>
                {#if unreadCount > 0}
                  <ShooterButton
                    variant="ghost"
                    size="sm"
                    on:click={markAllNotificationsRead}
                  >
                    Mark all read
                  </ShooterButton>
                {/if}
              </div>
              
              <div class="notification-list">
                {#if notifications.length === 0}
                  <div class="notification-empty">
                    <span class="empty-icon">🔕</span>
                    <p>No notifications</p>
                  </div>
                {:else}
                  {#each notifications.slice(0, 10) as notification}
                    <button
                      class="notification-item"
                      class:notification-item--unread={!notification.read}
                      on:click={() => handleNotificationClick(notification)}
                    >
                      <div class="notification-icon">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div class="notification-content">
                        <h3 class="notification-title">{notification.title}</h3>
                        <p class="notification-message">{notification.message}</p>
                        <span class="notification-time">
                          {formatNotificationTime(notification.timestamp)}
                        </span>
                      </div>
                      {#if !notification.read}
                        <div class="notification-dot"></div>
                      {/if}
                    </button>
                  {/each}
                  
                  {#if notifications.length > 10}
                    <div class="notification-footer">
                      <ShooterButton variant="ghost" size="sm">
                        View all notifications
                      </ShooterButton>
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- User menu -->
      {#if showUserMenu && user}
        <div class="user-menu" class:user-menu--open={userMenuOpen}>
          <button
            class="user-button"
            on:click|stopPropagation={toggleUserMenu}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <div class="user-avatar">
              {#if user.avatar}
                <img src={user.avatar} alt={user.name} class="avatar-image" />
              {:else}
                <span class="avatar-initials">{getAvatarInitials(user.name)}</span>
              {/if}
            </div>
            <div class="user-info">
              <span class="user-name">{user.name}</span>
              {#if user.role}
                <span class="user-role">{user.role}</span>
              {/if}
            </div>
            <span class="user-arrow" aria-hidden="true">
              {userMenuOpen ? '⌄' : '⌃'}
            </span>
          </button>
          
          {#if userMenuOpen}
            <div
              class="user-dropdown"
              role="menu"
              tabindex="-1"
              on:click|stopPropagation
              on:keydown|stopPropagation
            >
              <div class="user-dropdown-header">
                <div class="user-avatar user-avatar--large">
                  {#if user.avatar}
                    <img src={user.avatar} alt={user.name} class="avatar-image" />
                  {:else}
                    <span class="avatar-initials">{getAvatarInitials(user.name)}</span>
                  {/if}
                </div>
                <div class="user-details">
                  <span class="user-name">{user.name}</span>
                  <span class="user-email">{user.email}</span>
                  {#if user.role}
                    <ShooterBadge variant="neutral" size="sm">{user.role}</ShooterBadge>
                  {/if}
                </div>
              </div>
              
              <div class="user-menu-items">
                <button
                  class="user-menu-item"
                  on:click={() => handleUserMenuAction('profile')}
                >
                  👤 Profile
                </button>
                <button
                  class="user-menu-item"
                  on:click={() => handleUserMenuAction('settings')}
                >
                  ⚙️ Settings
                </button>
                <button
                  class="user-menu-item"
                  on:click={() => handleUserMenuAction('help')}
                >
                  ❓ Help
                </button>
                <hr class="user-menu-divider" />
                <button
                  class="user-menu-item user-menu-item--danger"
                  on:click={() => handleUserMenuAction('logout')}
                >
                  🚪 Sign out
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  /* Import Shooter design system */

  .top-navbar {
    background: var(--bg-color-secondary);
    border-bottom: 1px solid var(--border-color-primary);
    height: 64px;
    position: sticky;
    top: 0;
    z-index: var(--shooter-z-sticky);
  }
  
  .navbar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 var(--spacing-md);
    gap: var(--spacing-md);
  }
  
  /* Left section */
  .navbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex: 1;
    min-width: 0;
  }
  
  .navbar-title-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xxs);
    min-width: 0;
    flex: 1;
  }
  
  .navbar-title {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .breadcrumb-list {
    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  
  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xxs);
  }
  
  .breadcrumb-link {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: color var(--transition-base);
  }

  .breadcrumb-link:hover {
    background: var(--bg-color-tertiary);
  }
  
  /* Right section */
  .navbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }
  
  /* Search */
  .search-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  
  /* Notifications */
  .notification-menu {
    position: relative;
  }

  .notification-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    width: 380px;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    z-index: var(--shooter-z-dropdown);
    margin-top: var(--spacing-xs);
  }
  
  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .notification-header h3 {
    margin: 0;
  }

  .notification-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .notification-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xxl);
  }
  
  .empty-icon {

    opacity: 0.5;
  }
  
  .notification-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-base);
    position: relative;
  }
  
  .notification-item:hover {
    background: var(--bg-color-tertiary);
  }
  
  .notification-item--unread {
    background: var(--status-color-info-bg-light);
  }
  
  .notification-icon {

    flex-shrink: 0;
    margin-top: var(--spacing-xxs);
  }
  
  .notification-content {
    flex: 1;
    min-width: 0;
  }
  
  .notification-title {
    margin: 0 0 var(--spacing-xxs);
  }

  .notification-message {
    margin: 0 0 var(--spacing-xxs);
  }
  
  .notification-dot {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-md);
    width: 8px;
    height: 8px;
    background: var(--status-color-info);
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .notification-footer {
    padding: var(--spacing-sm);
    border-top: 1px solid var(--border-color-primary);
    text-align: center;
  }
  
  /* User menu */
  .user-menu {
    position: relative;
  }
  
  .user-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    padding: var(--spacing-xs);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-base);
  }
  
  .user-button:hover {
    background: var(--bg-color-tertiary);
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--status-color-info);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .user-avatar--large {
    width: 48px;
    height: 48px;
  }
  
  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  
  .user-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }
  
  .user-arrow {

    transition: transform var(--transition-base);
  }
  
  .user-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    width: 280px;
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    z-index: var(--shooter-z-dropdown);
    margin-top: var(--spacing-xs);
  }
  
  .user-dropdown-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .user-details {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xxs);
    min-width: 0;
    flex: 1;
  }
  
  .user-email {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .user-menu-items {
    padding: var(--spacing-xs) 0;
  }
  
  .user-menu-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-md);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .user-menu-item:hover {
    background: var(--bg-color-tertiary);
  }

  .user-menu-item--danger:hover {
    background: var(--status-color-error-bg-light);
  }
  
  .user-menu-divider {
    border: none;
    border-top: 1px solid var(--border-color-primary);
    margin: var(--spacing-xs) 0;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .top-navbar--mobile {
      height: 56px;
    }
    
    .navbar-content {
      padding: 0 var(--spacing-sm);
      gap: var(--spacing-xs);
    }
    
    .navbar-left {
      gap: var(--spacing-xs);
    }
    
    .breadcrumbs {
      display: none;
    }
    
    .navbar-right {
      gap: var(--spacing-xs);
    }
    
    .search-container {
      display: none;
    }
    
    .user-info {
      display: none;
    }
    
    .notification-dropdown,
    .user-dropdown {
      width: calc(100vw - var(--spacing-xl));
      right: calc(-100vw + 100% + var(--spacing-sm));
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .top-navbar {
      border-bottom-width: 2px;
    }
    
    .notification-dot {
      border: 2px solid var(--bg-color-secondary);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .user-arrow,
    .breadcrumb-link,
    .notification-item,
    .user-button,
    .user-menu-item {
      transition: none;
    }
  }
</style>