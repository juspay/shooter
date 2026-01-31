<!--
  ActivityFeed - Real-time activity feed component
  Features: Live updates, filtering, grouping, infinite scroll
-->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { ShooterBadge, ShooterButton, ShooterInput, ShooterSelect } from '$lib/components/shooter';
  import type { SelectOption } from '$lib/components/shooter';
  
  // Activity item interface
  interface ActivityItem {
    id: string;
    timestamp: string;
    type: 'notification' | 'webhook' | 'error' | 'success' | 'info' | 'warning' | 'debug';
    category: 'coding' | 'debugging' | 'testing' | 'deployment' | 'collaboration' | 'system';
    title: string;
    action?: string;
    description?: string;
    user?: string;
    icon?: string;
    metadata?: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'medium' | 'high' | 'urgent';
    read?: boolean;
    clickable?: boolean;
    actions?: Array<{
      id: string;
      label: string;
      icon?: string;
      variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    }>;
  }
  
  // Props
  export let activities: ActivityItem[] = [];
  export let loading = false;
  export let realTime = true;
  export let showFilters = true;
  export let showSearch = true;
  export let maxItems = 100;
  export let groupByDate = false;
  export let autoRefresh = false;
  export let refreshInterval = 30000; // 30 seconds
  export let emptyMessage = 'No activities to display';
  export let title = 'Activity Feed';
  export let subtitle: string | null = null;

  // Test-compatible props
  export const showUser: boolean = false;
  export const showRelativeTime: boolean = false;
  export const interactive: boolean = false;
  export const searchable: boolean = true;
  export const filterable: boolean = true;
  export const maxHeight: string | undefined = undefined;
  export const infiniteScroll: boolean = false;
  export const showCounts: boolean = false;
  export const refreshable: boolean = false;

  // Internal state
  let searchTerm = '';
  let typeFilter = 'all';
  let categoryFilter = 'all';
  let unreadOnly = false;
  let refreshTimer: ReturnType<typeof setInterval>;
  let feedElement: HTMLElement;
  
  const dispatch = createEventDispatcher<{
    activityClick: ActivityItem;
    actionClick: { activity: ActivityItem; action: string };
    markAsRead: { ids: string[] };
    markAllAsRead: void;
    refresh: void;
    loadMore: void;
  }>();
  
  // Filter options
  const typeOptions: SelectOption[] = [
    { value: 'all', label: 'All Types' },
    { value: 'notification', label: 'Notifications' },
    { value: 'error', label: 'Errors' },
    { value: 'success', label: 'Success' },
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warnings' },
    { value: 'debug', label: 'Debug' }
  ];
  
  const categoryOptions: SelectOption[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'coding', label: 'Coding' },
    { value: 'debugging', label: 'Debugging' },
    { value: 'testing', label: 'Testing' },
    { value: 'deployment', label: 'Deployment' },
    { value: 'collaboration', label: 'Collaboration' },
    { value: 'system', label: 'System' }
  ];
  
  // Computed values
  $: filteredActivities = filterActivities(activities, searchTerm, typeFilter, categoryFilter, unreadOnly);
  $: groupedActivities = groupByDate ? groupActivitiesByDate(filteredActivities) : [{ date: null, activities: filteredActivities }];
  $: unreadCount = activities.filter(a => !a.read).length;
  
  function filterActivities(
    items: ActivityItem[],
    search: string,
    type: string,
    category: string,
    unreadOnly: boolean
  ): ActivityItem[] {
    return items.filter(item => {
      const matchesSearch = !search || 
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
        (item.user && item.user.toLowerCase().includes(search.toLowerCase()));
      
      const matchesType = type === 'all' || item.type === type;
      const matchesCategory = category === 'all' || item.category === category;
      const matchesReadStatus = !unreadOnly || !item.read;
      
      return matchesSearch && matchesType && matchesCategory && matchesReadStatus;
    });
  }
  
  function groupActivitiesByDate(activities: ActivityItem[]): { date: string; activities: ActivityItem[] }[] {
    const groups: Record<string, ActivityItem[]> = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.timestamp).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
    });
    
    return Object.entries(groups)
      .map(([date, activities]) => ({ date, activities }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  
  function getTypeIcon(type: ActivityItem['type']): string {
    const icons = {
      notification: '🔔',
      webhook: '🔗',
      error: '❌',
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      debug: '🐛'
    };
    return icons[type] || '📝';
  }

  function getTypeColor(type: ActivityItem['type']): 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' {
    const colors = {
      notification: 'primary' as const,
      webhook: 'info' as const,
      error: 'error' as const,
      success: 'success' as const,
      info: 'info' as const,
      warning: 'warning' as const,
      debug: 'neutral' as const
    };
    return colors[type] || 'neutral';
  }
  
  function getCategoryIcon(category: ActivityItem['category']): string {
    const icons = {
      coding: '🚀',
      debugging: '🐛',
      testing: '🧪',
      deployment: '🌍',
      collaboration: '👥',
      system: '⚙️'
    };
    return icons[category] || '📋';
  }
  
  function formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (seconds < 30) {
return 'Just now';
}
    if (seconds < 60) {
return `${seconds}s ago`;
}
    if (minutes < 60) {
return `${minutes}m ago`;
}
    if (hours < 24) {
return `${hours}h ago`;
}
    if (days < 7) {
return `${days}d ago`;
}
    
    return time.toLocaleDateString();
  }
  
  function handleActivityClick(activity: ActivityItem) {
    if (activity.clickable !== false) {
      dispatch('activityClick', activity);
      
      // Mark as read if unread
      if (!activity.read) {
        markAsRead([activity.id]);
      }
    }
  }
  
  function handleActionClick(activity: ActivityItem, actionId: string) {
    dispatch('actionClick', { activity, action: actionId });
  }
  
  function markAsRead(ids: string[]) {
    dispatch('markAsRead', { ids });
  }
  
  function markAllAsRead() {
    dispatch('markAllAsRead');
  }
  
  function handleRefresh() {
    dispatch('refresh');
  }
  
  function handleLoadMore() {
    dispatch('loadMore');
  }
  
  function clearFilters() {
    searchTerm = '';
    typeFilter = 'all';
    categoryFilter = 'all';
    unreadOnly = false;
  }
  
  // Auto-refresh setup
  onMount(() => {
    if (autoRefresh && refreshInterval > 0) {
      refreshTimer = setInterval(() => {
        handleRefresh();
      }, refreshInterval);
    }
  });
  
  onDestroy(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
</script>

<div class="activity-feed">
  <!-- Header -->
  <div class="feed-header">
    <div class="header-info">
      <h2 class="feed-title">
        {title}
        {#if unreadCount > 0}
          <ShooterBadge variant="primary" size="sm">
            {unreadCount}
          </ShooterBadge>
        {/if}
      </h2>
      {#if subtitle}
        <p class="feed-subtitle">{subtitle}</p>
      {/if}
    </div>
    
    <div class="header-actions">
      {#if unreadCount > 0}
        <ShooterButton
          variant="ghost"
          size="sm"
          on:click={markAllAsRead}
        >
          Mark All Read
        </ShooterButton>
      {/if}
      
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={handleRefresh}
        disabled={loading}
      >
        {#if realTime}🔄{:else}↻{/if} Refresh
      </ShooterButton>
    </div>
  </div>
  
  <!-- Filters -->
  {#if showFilters || showSearch}
    <div class="feed-filters">
      {#if showSearch}
        <div class="filter-search">
          <ShooterInput
            bind:value={searchTerm}
            placeholder="Search activities..."
            type="search"
            size="sm"
          />
        </div>
      {/if}
      
      {#if showFilters}
        <div class="filter-controls">
          <ShooterSelect
            bind:value={typeFilter}
            options={typeOptions}
            size="sm"
          />
          
          <ShooterSelect
            bind:value={categoryFilter}
            options={categoryOptions}
            size="sm"
          />
          
          <span class="unread-filter">
            <input
              type="checkbox"
              bind:checked={unreadOnly}
              class="unread-checkbox"
            />
            <span>Unread only</span>
          </span>
          
          <ShooterButton
            variant="ghost"
            size="sm"
            on:click={clearFilters}
          >
            Clear
          </ShooterButton>
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Activity List -->
  <div class="feed-content" bind:this={feedElement}>
    {#if loading && activities.length === 0}
      <div class="feed-loading">
        <div class="loading-spinner"></div>
        <span>Loading activities...</span>
      </div>
    {:else if filteredActivities.length === 0}
      <div class="feed-empty">
        <span class="empty-icon">📭</span>
        <p class="empty-message">{emptyMessage}</p>
        {#if searchTerm || typeFilter !== 'all' || categoryFilter !== 'all' || unreadOnly}
          <ShooterButton
            variant="ghost"
            size="sm"
            on:click={clearFilters}
          >
            Clear Filters
          </ShooterButton>
        {/if}
      </div>
    {:else}
      {#each groupedActivities as group}
        {#if group.date && groupByDate}
          <div class="date-group">
            <h3 class="date-header">{group.date}</h3>
          </div>
        {/if}
        
        <div class="activity-list">
          {#each group.activities as activity (activity.id)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="activity-item"
              class:activity-item--unread={!activity.read}
              class:activity-item--clickable={activity.clickable !== false}
              role={activity.clickable !== false ? 'button' : undefined}
              tabindex={activity.clickable !== false ? 0 : undefined}
              on:click={() => handleActivityClick(activity)}
              on:keydown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && activity.clickable !== false) {
                  e.preventDefault();
                  handleActivityClick(activity);
                }
              }}
            >
              <!-- Activity icon -->
              <div class="activity-icon">
                <div class="icon-container icon-container--{getTypeColor(activity.type)}">
                  <span class="icon" aria-hidden="true">
                    {activity.icon || getTypeIcon(activity.type)}
                  </span>
                </div>
              </div>
              
              <!-- Activity content -->
              <div class="activity-content">
                <div class="activity-header">
                  <h3 class="activity-title">{activity.title}</h3>
                  <div class="activity-meta">
                    <span class="activity-time">
                      {formatRelativeTime(activity.timestamp)}
                    </span>
                    <span class="activity-category">
                      {getCategoryIcon(activity.category)} {activity.category}
                    </span>
                    {#if activity.user}
                      <span class="activity-user">
                        by {activity.user}
                      </span>
                    {/if}
                  </div>
                </div>
                
                {#if activity.description}
                  <p class="activity-description">{activity.description}</p>
                {/if}
                
                {#if activity.metadata && Object.keys(activity.metadata).length > 0}
                  <div class="activity-metadata">
                    {#each Object.entries(activity.metadata) as [key, value]}
                      <span class="metadata-item">
                        <span>{key}:</span> {value}
                      </span>
                    {/each}
                  </div>
                {/if}
                
                {#if activity.actions && activity.actions.length > 0}
                  <div class="activity-actions">
                    {#each activity.actions as action}
                      <ShooterButton
                        variant={action.variant || 'ghost'}
                        size="sm"
                        on:click={(e) => {
 e.stopPropagation(); handleActionClick(activity, action.id); 
}}
                      >
                        {#if action.icon}{action.icon} {/if}{action.label}
                      </ShooterButton>
                    {/each}
                  </div>
                {/if}
              </div>
              
              <!-- Unread indicator -->
              {#if !activity.read}
                <div class="unread-indicator" aria-label="Unread"></div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
      
      <!-- Load more -->
      {#if filteredActivities.length >= maxItems}
        <div class="feed-load-more">
          <ShooterButton
            variant="ghost"
            on:click={handleLoadMore}
            disabled={loading}
          >
            Load More Activities
          </ShooterButton>
        </div>
      {/if}
      
      <!-- Loading more indicator -->
      {#if loading && activities.length > 0}
        <div class="feed-loading-more">
          <div class="loading-spinner small"></div>
          <span>Loading more activities...</span>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Import Shooter design system */

  .activity-feed {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    max-height: 100%;
  }
  
  .feed-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .header-info {
    flex: 1;
    min-width: 0;
  }
  
  .feed-title {
    margin: 0;


    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  
  .feed-subtitle {
    margin: var(--spacing-xxs) 0 0;


  }
  
  .header-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }
  
  .feed-filters {
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border-color-primary);
    background: var(--bg-color-primary);
  }
  
  .filter-search {
    margin-bottom: var(--spacing-sm);
  }
  
  .filter-controls {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    flex-wrap: wrap;
  }
  
  .unread-filter {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);


    cursor: pointer;
  }
  
  .unread-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--status-color-info);
  }
  
  .feed-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  
  .feed-loading,
  .feed-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xxl);

  }
  
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-color-primary);
    border-top-color: var(--status-color-info);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .loading-spinner.small {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .empty-icon {

    opacity: 0.5;
  }
  
  .empty-message {
    margin: 0;

  }
  
  .date-group {
    padding: var(--spacing-md) var(--spacing-md) 0;
  }
  
  .date-header {
    margin: 0;


    padding-bottom: var(--spacing-xs);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .activity-list {
    padding: 0;
  }
  
  .activity-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--border-color-primary);
    position: relative;
    transition: all var(--transition-base);
  }
  
  .activity-item--clickable {
    cursor: pointer;
  }
  
  .activity-item--clickable:hover {
    background: var(--bg-color-tertiary);
  }
  
  .activity-item--clickable:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--border-color-focus);
  }
  
  .activity-item--unread {
    background: var(--status-color-info-bg-light);
  }
  
  .activity-icon {
    flex-shrink: 0;
  }
  
  .icon-container {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;

  }
  
  .icon-container--primary {
    background: var(--status-color-info-bg-light);
  }
  
  .icon-container--success {
    background: var(--status-color-success-bg-light);
  }
  
  .icon-container--warning {
    background: var(--status-color-warning-bg-light);
  }
  
  .icon-container--error {
    background: var(--status-color-error-bg-light);
  }
  
  .icon-container--info {
    background: var(--status-color-info-bg-lighter);
  }
  
  .icon-container--neutral {
    background: var(--bg-color-tertiary);
  }
  
  .activity-content {
    flex: 1;
    min-width: 0;
  }
  
  .activity-header {
    margin-bottom: var(--spacing-xs);
  }
  
  .activity-title {
    margin: 0 0 var(--spacing-xs);


  }
  
  .activity-meta {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;


  }
  
  .activity-category,
  .activity-user {
    white-space: nowrap;
  }
  
  .activity-description {
    margin: 0 0 var(--spacing-xs);


  }
  
  .activity-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);


  }

  .activity-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
    margin-top: var(--spacing-xs);
  }
  
  .unread-indicator {
    position: absolute;
    top: var(--spacing-md);
    right: var(--spacing-md);
    width: 8px;
    height: 8px;
    background: var(--status-color-info);
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .feed-load-more,
  .feed-loading-more {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-md);
    border-top: 1px solid var(--border-color-primary);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .feed-header {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-sm);
    }
    
    .header-actions {
      justify-content: flex-end;
    }
    
    .filter-controls {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-xs);
    }
    
    .activity-item {
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
    }
    
    .icon-container {
      width: 32px;
      height: 32px;

    }
    
    .activity-meta {
      flex-direction: column;
      gap: var(--spacing-xxs);
    }
    
    .activity-metadata {
      flex-direction: column;
      gap: var(--spacing-xxs);
    }
    
    .activity-actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
  
  /* Custom scrollbar */
  .feed-content::-webkit-scrollbar {
    width: 6px;
  }
  
  .feed-content::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }
  
  .feed-content::-webkit-scrollbar-thumb {
    background: var(--border-color-primary);
    border-radius: var(--radius-xs);
  }
  
  .feed-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-tertiary);
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .activity-item {
      border-bottom-width: 3px;
    }
    
    .unread-indicator {
      border: 2px solid var(--bg-color-secondary);
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .activity-item,
    .activity-item--clickable:hover {
      transition: none;
    }
    
    .loading-spinner {
      animation: none;
    }
  }
</style>