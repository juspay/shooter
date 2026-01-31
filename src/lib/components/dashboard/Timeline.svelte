<!--
  Timeline - Chronological event display component
  Features: Interactive timeline, status indicators, responsive design
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ShooterBadge } from '$lib/components/shooter';
  import type { TimelineEvent } from './index';

  // Props
  export let events: TimelineEvent[] = [];
  export let loading = false;
  export let showRelativeTime = true;
  export let showDuration = true;
  export let showUser = true;
  export let maxHeight: string | null = null;
  export let interactive = true;
  export let groupByDate = false;
  export let emptyMessage = 'No events to display';
  
  const dispatch = createEventDispatcher<{
    eventClick: TimelineEvent;
    loadMore: void;
  }>();
  
  // Sort events by timestamp (most recent first)
  $: sortedEvents = [...events].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  // Group events by date if enabled
  $: groupedEvents = groupByDate ? groupEventsByDate(sortedEvents) : [{ date: null, events: sortedEvents }];
  
  function groupEventsByDate(events: TimelineEvent[]): { date: string; events: TimelineEvent[] }[] {
    const groups: Record<string, TimelineEvent[]> = {};
    
    events.forEach(event => {
      const date = new Date(event.timestamp).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
    });
    
    return Object.entries(groups)
      .map(([date, events]) => ({ date, events }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  
  function getTypeIcon(type: TimelineEvent['type']): string {
    const icons = {
      coding: '🚀',
      debugging: '🐛',
      testing: '🧪',
      deployment: '🌍',
      collaboration: '👥',
      system: '⚙️'
    };
    return icons[type] || '📝';
  }
  
  function getStatusColor(status: TimelineEvent['status']): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
    const colors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
      completed: 'success',
      'in-progress': 'info',
      failed: 'error',
      pending: 'warning',
      cancelled: 'neutral'
    };
    return colors[status] || 'neutral';
  }
  
  function getStatusIcon(status: TimelineEvent['status']): string {
    const icons = {
      completed: '✅',
      'in-progress': '🔄',
      failed: '❌',
      pending: '⏳',
      cancelled: '⚪'
    };
    return icons[status] || '📋';
  }
  
  function formatRelativeTime(timestamp: string): string {
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
    if (days < 7) {
return `${days}d ago`;
}
    
    return time.toLocaleDateString();
  }
  
  function formatDuration(minutes: number): string {
    if (minutes < 60) {
return `${minutes}m`;
}
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  function handleEventClick(event: TimelineEvent) {
    if (interactive && event.clickable !== false) {
      dispatch('eventClick', event);
    }
  }
  
  function handleLoadMore() {
    dispatch('loadMore');
  }
</script>

<div class="timeline-container" style={maxHeight ? `max-height: ${maxHeight}` : ''}>
  {#if loading && events.length === 0}
    <div class="timeline-loading">
      <div class="loading-spinner"></div>
      <span>Loading timeline...</span>
    </div>
  {:else if events.length === 0}
    <div class="timeline-empty">
      <span class="empty-icon">📅</span>
      <p class="empty-message">{emptyMessage}</p>
    </div>
  {:else}
    <div class="timeline-content">
      {#each groupedEvents as group}
        {#if group.date && groupByDate}
          <div class="timeline-date-group">
            <h3 class="date-header">{group.date}</h3>
          </div>
        {/if}
        
        <div class="timeline-events">
          {#each group.events as event, index (event.id)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="timeline-item"
              class:timeline-item--clickable={interactive && event.clickable !== false}
              class:timeline-item--last={index === group.events.length - 1 && group === groupedEvents[groupedEvents.length - 1]}
              role={interactive && event.clickable !== false ? 'button' : undefined}
              tabindex={interactive && event.clickable !== false ? 0 : undefined}
              on:click={() => handleEventClick(event)}
              on:keydown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && interactive && event.clickable !== false) {
                  e.preventDefault();
                  handleEventClick(event);
                }
              }}
            >
              <!-- Timeline connector -->
              <div class="timeline-connector">
                <div class="timeline-dot timeline-dot--{getStatusColor(event.status)}">
                  <span class="dot-icon" aria-hidden="true">
                    {event.icon || getTypeIcon(event.type)}
                  </span>
                </div>
                {#if !index || index < group.events.length - 1 || group !== groupedEvents[groupedEvents.length - 1]}
                  <div class="timeline-line"></div>
                {/if}
              </div>
              
              <!-- Event content -->
              <div class="timeline-content-item">
                <div class="event-header">
                  <div class="event-title-section">
                    <h3 class="event-title">{event.title}</h3>
                    <div class="event-meta">
                      <span class="event-time">
                        {showRelativeTime ? formatRelativeTime(event.timestamp) : new Date(event.timestamp).toLocaleString()}
                      </span>
                      {#if showDuration && event.duration}
                        <span class="event-duration">
                          • {formatDuration(event.duration)}
                        </span>
                      {/if}
                      {#if showUser && event.user}
                        <span class="event-user">
                          • by {event.user}
                        </span>
                      {/if}
                    </div>
                  </div>
                  
                  <div class="event-status">
                    <ShooterBadge 
                      variant={getStatusColor(event.status)} 
                      size="sm"
                      outlined
                    >
                      {getStatusIcon(event.status)} {event.status}
                    </ShooterBadge>
                  </div>
                </div>
                
                {#if event.description}
                  <p class="event-description">{event.description}</p>
                {/if}
                
                {#if event.metadata && Object.keys(event.metadata).length > 0}
                  <div class="event-metadata">
                    {#each Object.entries(event.metadata) as [key, value]}
                      <span class="metadata-item">
                        <span>{key}:</span> {value}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
      
      <!-- Load more button -->
      {#if $$slots.loadMore}
        <div class="timeline-load-more">
          <slot name="loadMore" {handleLoadMore} />
        </div>
      {/if}
      
      <!-- Loading indicator for additional items -->
      {#if loading && events.length > 0}
        <div class="timeline-loading-more">
          <div class="loading-spinner small"></div>
          <span>Loading more events...</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Import Shooter design system */

  .timeline-container {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    overflow-y: auto;
  }
  
  .timeline-content {
    padding: var(--spacing-md);
  }
  
  .timeline-loading,
  .timeline-empty {
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
  
  .timeline-date-group {
    margin-bottom: var(--spacing-md);
  }
  
  .date-header {
    margin: 0;


    padding-bottom: var(--spacing-xs);
    border-bottom: 1px solid var(--border-color-primary);
  }
  
  .timeline-events {
    position: relative;
  }
  
  .timeline-item {
    display: flex;
    gap: var(--spacing-md);
    position: relative;
    transition: all var(--transition-base);
  }
  
  .timeline-item--clickable {
    cursor: pointer;
    border-radius: var(--radius-md);
    margin: 0 calc(-1 * var(--spacing-xs));
    padding: var(--spacing-xs);
  }
  
  .timeline-item--clickable:hover {
    background: var(--bg-color-tertiary);
  }
  
  .timeline-item--clickable:focus {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .timeline-item:not(:last-child) .timeline-content-item {
    border-bottom-color: var(--border-color-primary);
  }
  
  .timeline-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }
  
  .timeline-dot {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-color-secondary);

    position: relative;
    z-index: 2;
  }
  
  .timeline-dot--success {
    border-color: var(--status-color-success);
  }
  
  .timeline-dot--warning {
    border-color: var(--status-color-warning);
  }
  
  .timeline-dot--error {
    border-color: var(--status-color-error);
  }
  
  .timeline-dot--info {
    border-color: var(--status-color-info-primary);
  }
  
  .timeline-dot--neutral {
    border-color: var(--text-color-tertiary);
  }
  
  .timeline-line {
    width: 2px;
    background: var(--border-color-primary);
    flex: 1;
    min-height: 20px;
    margin-top: var(--spacing-xs);
  }
  
  .timeline-item--last .timeline-line {
    display: none;
  }
  
  .timeline-content-item {
    flex: 1;
    min-width: 0;
    padding-bottom: var(--spacing-md);
    border-bottom: 2px solid transparent;
  }
  
  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }
  
  .event-title-section {
    flex: 1;
    min-width: 0;
  }
  
  .event-title {
    margin: 0 0 var(--spacing-xs);


  }
  
  .event-meta {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;


  }
  
  .event-duration,
  .event-user {
    white-space: nowrap;
  }
  
  .event-status {
    flex-shrink: 0;
  }
  
  .event-description {
    margin: 0 0 var(--spacing-xs);


  }
  
  .event-metadata {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);


  }

  .timeline-load-more,
  .timeline-loading-more {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-md);
    margin-top: var(--spacing-md);
    border-top: 1px solid var(--border-color-primary);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .timeline-content {
      padding: var(--spacing-sm);
    }
    
    .timeline-item {
      gap: var(--spacing-sm);
    }
    
    .timeline-dot {
      width: 32px;
      height: 32px;

    }
    
    .event-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xs);
    }
    
    .event-meta {
      flex-direction: column;
      gap: var(--spacing-xxs);
    }
    
    .event-metadata {
      flex-direction: column;
      gap: var(--spacing-xxs);
    }
    
    .timeline-item--clickable {
      margin: 0 calc(-1 * var(--spacing-xxs));
      padding: var(--spacing-xxs);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .timeline-dot {
      border-width: 4px;
    }
    
    .timeline-line {
      width: 3px;
    }
  }
  
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .timeline-item,
    .timeline-item--clickable:hover {
      transition: none;
    }
    
    .loading-spinner {
      animation: none;
    }
  }
  
  /* Custom scrollbar */
  .timeline-container::-webkit-scrollbar {
    width: 6px;
  }
  
  .timeline-container::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }
  
  .timeline-container::-webkit-scrollbar-thumb {
    background: var(--border-color-primary);
    border-radius: var(--radius-xs);
  }
  
  .timeline-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-tertiary);
  }
</style>
