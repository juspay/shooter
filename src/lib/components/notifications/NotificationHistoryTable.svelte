<!--
  NotificationHistoryTable - Comprehensive notification history using Shooter components
  Features: Sorting, filtering, pagination, status badges, action buttons
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { ShooterTable, ShooterButton, ShooterInput, ShooterSelect, ShooterModal } from '$lib/components/shooter';
  import type { TableColumn, SelectOption, TableRow } from '$lib/components/shooter';
  
  // Types
  interface NotificationHistoryItem {
    id: string;
    timestamp: string;
    title: string;
    message: string;
    type: 'coding' | 'debugging' | 'testing' | 'deployment' | 'collaboration';
    status: 'sent' | 'delivered' | 'failed' | 'filtered' | 'pending';
    priority: 'low' | 'normal' | 'high' | 'critical';
    deviceType: 'desktop' | 'mobile' | 'email' | 'slack';
    deviceId?: string;
    errorMessage?: string;
    retryCount: number;
    readAt?: string;
    [key: string]: unknown;
  }
  
  export let data: NotificationHistoryItem[] = [];
  export let loading = false;
  export let pageSize = 20;
  export let currentPage = 1;
  export let totalItems = 0;
  
  // Table state
  let sortBy: string | null = 'timestamp';
  let sortDirection: 'asc' | 'desc' = 'desc';
  let selectedRows: string[] = [];
  let searchTerm = '';
  let statusFilter = 'all';
  let typeFilter = 'all';
  let priorityFilter = 'all';
  let deviceFilter = 'all';
  
  // Modal state
  let detailModalOpen = false;
  let selectedNotification: NotificationHistoryItem | null = null;
  
  const dispatch = createEventDispatcher<{
    refresh: void;
    retry: { ids: string[] };
    delete: { ids: string[] };
    bulkAction: { action: string; ids: string[] };
    pageChange: { page: number };
    sortChange: { column: string; direction: 'asc' | 'desc' };
  }>();
  
  // Filter options
  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'sent', label: 'Sent' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'failed', label: 'Failed' },
    { value: 'filtered', label: 'Filtered' },
    { value: 'pending', label: 'Pending' }
  ];
  
  const typeOptions: SelectOption[] = [
    { value: 'all', label: 'All Types' },
    { value: 'coding', label: 'Coding' },
    { value: 'debugging', label: 'Debugging' },
    { value: 'testing', label: 'Testing' },
    { value: 'deployment', label: 'Deployment' },
    { value: 'collaboration', label: 'Collaboration' }
  ];
  
  const priorityOptions: SelectOption[] = [
    { value: 'all', label: 'All Priorities' },
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ];
  
  const deviceOptions: SelectOption[] = [
    { value: 'all', label: 'All Devices' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'email', label: 'Email' },
    { value: 'slack', label: 'Slack' }
  ];
  
  // Table columns
  const columns: TableColumn[] = [
    {
      key: 'timestamp',
      label: 'Time',
      sortable: true,
      width: '140px',
      render: (value) => new Date(value as string).toLocaleString()
    },
    { 
      key: 'title', 
      label: 'Title', 
      sortable: true,
      render: (value) => `<strong>${value}</strong>`
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      width: '100px',
      render: (value) => getTypeIcon(value as string) + ' ' + value
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '110px',
      align: 'center' as const,
      render: (value) => getStatusBadge(value as string)
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      width: '90px',
      align: 'center' as const,
      render: (value) => getPriorityBadge(value as string)
    },
    {
      key: 'deviceType',
      label: 'Device',
      sortable: true,
      width: '90px',
      align: 'center' as const,
      render: (value) => getDeviceIcon(value as string)
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '120px',
      align: 'center' as const,
      render: (_value, row) => getActionButtons(row as unknown as NotificationHistoryItem)
    }
  ];
  
  // Computed filtered data
  $: filteredData = filterData(data, searchTerm, statusFilter, typeFilter, priorityFilter, deviceFilter);
  $: totalPages = Math.ceil(totalItems / pageSize);
  
  // Helper functions
  function filterData(
    items: NotificationHistoryItem[], 
    search: string, 
    status: string, 
    type: string, 
    priority: string, 
    device: string
  ): NotificationHistoryItem[] {
    return items.filter(item => {
      const matchesSearch = !search || 
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.message.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = status === 'all' || item.status === status;
      const matchesType = type === 'all' || item.type === type;
      const matchesPriority = priority === 'all' || item.priority === priority;
      const matchesDevice = device === 'all' || item.deviceType === device;
      
      return matchesSearch && matchesStatus && matchesType && matchesPriority && matchesDevice;
    });
  }
  
  function getTypeIcon(type: string): string {
    const icons = {
      coding: '🚀',
      debugging: '🐛',
      testing: '🧪',
      deployment: '🌍',
      collaboration: '👥'
    };
    return icons[type as keyof typeof icons] || '📱';
  }
  
  function getStatusBadge(status: string): string {
    const variants = {
      sent: 'info',
      delivered: 'success',
      failed: 'error',
      filtered: 'warning',
      pending: 'neutral'
    };
    const variant = variants[status as keyof typeof variants] || 'neutral';
    return `<span class="status-badge status-badge--${variant}">${status}</span>`;
  }
  
  function getPriorityBadge(priority: string): string {
    const variants = {
      low: 'neutral',
      normal: 'info',
      high: 'warning',
      critical: 'error'
    };
    const variant = variants[priority as keyof typeof variants] || 'neutral';
    return `<span class="priority-badge priority-badge--${variant}">${priority}</span>`;
  }
  
  function getDeviceIcon(deviceType: string): string {
    const icons = {
      desktop: '🖥️',
      mobile: '📱',
      email: '📧',
      slack: '💬'
    };
    return icons[deviceType as keyof typeof icons] || '📱';
  }
  
  function getActionButtons(row: NotificationHistoryItem): string {
    return `
      <div class="action-buttons">
        <button class="action-btn view-btn" data-action="view" data-id="${row.id}">👁️</button>
        ${row.status === 'failed' ? `<button class="action-btn retry-btn" data-action="retry" data-id="${row.id}">🔄</button>` : ''}
        <button class="action-btn delete-btn" data-action="delete" data-id="${row.id}">🗑️</button>
      </div>
    `;
  }
  
  // Event handlers
  function handleSort(event: CustomEvent<{ column: string; direction: 'asc' | 'desc' }>) {
    sortBy = event.detail.column;
    sortDirection = event.detail.direction;
    dispatch('sortChange', event.detail);
  }
  
  function handleRowClick(event: CustomEvent<{ row: TableRow; index: number }>) {
    showNotificationDetails(event.detail.row as unknown as NotificationHistoryItem);
  }
  
  function handleTableClick(event: Event) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('action-btn')) {
      const action = target.dataset.action;
      const id = target.dataset.id;
      
      if (action && id) {
        handleAction(action, id);
      }
    }
  }
  
  function handleAction(action: string, id: string) {
    const notification = data.find(n => n.id === id);
    if (!notification) {
return;
}
    
    switch (action) {
      case 'view':
        showNotificationDetails(notification);
        break;
      case 'retry':
        dispatch('retry', { ids: [id] });
        break;
      case 'delete':
        dispatch('delete', { ids: [id] });
        break;
    }
  }
  
  function showNotificationDetails(notification: NotificationHistoryItem) {
    selectedNotification = notification;
    detailModalOpen = true;
  }
  
  function handleBulkAction(action: string) {
    if (selectedRows.length === 0) {
return;
}
    dispatch('bulkAction', { action, ids: selectedRows });
    selectedRows = [];
  }
  
  function handleRefresh() {
    dispatch('refresh');
  }
  
  function changePage(newPage: number) {
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      dispatch('pageChange', { page: newPage });
    }
  }
  
  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    typeFilter = 'all';
    priorityFilter = 'all';
    deviceFilter = 'all';
  }
  
  // Mount table click handler
  onMount(() => {
    const handleGlobalClick = (event: Event) => {
      if (event.target instanceof HTMLElement) {
        const tableContainer = event.target.closest('.shooter-table-container');
        if (tableContainer) {
          handleTableClick(event);
        }
      }
    };
    
    document.addEventListener('click', handleGlobalClick);
    
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  });
</script>

<div class="notification-history">
  <!-- Header and Controls -->
  <div class="table-header">
    <div class="header-left">
      <h2>Notification History</h2>
      <p class="subtitle">{totalItems} total notifications</p>
    </div>
    
    <div class="header-right">
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={handleRefresh}
        disabled={loading}
      >
        🔄 Refresh
      </ShooterButton>
    </div>
  </div>
  
  <!-- Filters -->
  <div class="filters">
    <div class="filter-row">
      <ShooterInput
        bind:value={searchTerm}
        placeholder="Search notifications..."
        type="search"
        size="sm"
      />
      
      <ShooterSelect
        bind:value={statusFilter}
        options={statusOptions}
        size="sm"
      />
      
      <ShooterSelect
        bind:value={typeFilter}
        options={typeOptions}
        size="sm"
      />
      
      <ShooterSelect
        bind:value={priorityFilter}
        options={priorityOptions}
        size="sm"
      />
      
      <ShooterSelect
        bind:value={deviceFilter}
        options={deviceOptions}
        size="sm"
      />
      
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={clearFilters}
      >
        Clear
      </ShooterButton>
    </div>
  </div>
  
  <!-- Bulk Actions -->
  {#if selectedRows.length > 0}
    <div class="bulk-actions">
      <span class="selected-count">{selectedRows.length} selected</span>
      
      <ShooterButton
        variant="ghost"
        size="sm"
        on:click={() => handleBulkAction('retry')}
      >
        Retry Selected
      </ShooterButton>
      
      <ShooterButton
        variant="danger"
        size="sm"
        on:click={() => handleBulkAction('delete')}
      >
        Delete Selected
      </ShooterButton>
    </div>
  {/if}
  
  <!-- Table -->
  <ShooterTable
    data={filteredData as unknown as TableRow[]}
    {columns}
    bind:sortBy
    bind:sortDirection
    bind:selectedRows
    keyField="id"
    {loading}
    selectable
    striped
    hoverable
    responsive
    stickyHeader
    maxHeight="600px"
    emptyMessage="No notifications found"
    on:sort={handleSort}
    on:rowClick={handleRowClick}
  />
  
  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="pagination">
      <ShooterButton
        variant="ghost"
        size="sm"
        disabled={currentPage === 1}
        on:click={() => changePage(currentPage - 1)}
      >
        ← Previous
      </ShooterButton>
      
      <span class="page-info">
        Page {currentPage} of {totalPages}
      </span>
      
      <ShooterButton
        variant="ghost"
        size="sm"
        disabled={currentPage === totalPages}
        on:click={() => changePage(currentPage + 1)}
      >
        Next →
      </ShooterButton>
    </div>
  {/if}
</div>

<!-- Notification Detail Modal -->
{#if selectedNotification}
  <ShooterModal
    bind:open={detailModalOpen}
    title="Notification Details"
    size="md"
    closable
  >
    <div class="notification-details">
      <div class="detail-row">
        <span>Title:</span>
        {selectedNotification.title}
      </div>
      
      <div class="detail-row">
        <span>Message:</span>
        {selectedNotification.message}
      </div>
      
      <div class="detail-row">
        <span>Type:</span>
        {getTypeIcon(selectedNotification.type)} {selectedNotification.type}
      </div>
      
      <div class="detail-row">
        <span>Status:</span>
        {@html getStatusBadge(selectedNotification.status)}
      </div>
      
      <div class="detail-row">
        <span>Priority:</span>
        {@html getPriorityBadge(selectedNotification.priority)}
      </div>
      
      <div class="detail-row">
        <span>Device:</span>
        {getDeviceIcon(selectedNotification.deviceType)} {selectedNotification.deviceType}
        {#if selectedNotification.deviceId}
          <span class="device-id">({selectedNotification.deviceId})</span>
        {/if}
      </div>
      
      <div class="detail-row">
        <span>Timestamp:</span>
        {new Date(selectedNotification.timestamp).toLocaleString()}
      </div>
      
      {#if selectedNotification.readAt}
        <div class="detail-row">
          <span>Read At:</span>
          {new Date(selectedNotification.readAt).toLocaleString()}
        </div>
      {/if}
      
      <div class="detail-row">
        <span>Retry Count:</span>
        {selectedNotification.retryCount}
      </div>
      
      {#if selectedNotification.errorMessage}
        <div class="detail-row">
          <span>Error:</span>
          <span class="error-message">{selectedNotification.errorMessage}</span>
        </div>
      {/if}
    </div>
    
    <svelte:fragment slot="footer">
      {#if selectedNotification.status === 'failed'}
        <ShooterButton
          variant="secondary"
          on:click={() => {
            if (selectedNotification) {
              dispatch('retry', { ids: [selectedNotification.id] });
              detailModalOpen = false;
            }
          }}
        >
          Retry
        </ShooterButton>
      {/if}
      
      <ShooterButton
        variant="ghost"
        on:click={() => detailModalOpen = false}
      >
        Close
      </ShooterButton>
    </svelte:fragment>
  </ShooterModal>
{/if}

<style>
  /* Import Shooter design system */

  .notification-history {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--bg-color-primary);
    border-radius: var(--radius-lg);
  }
  
  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
  }
  
  .header-left h2 {
    margin: 0;
  }

  .subtitle {
    margin: 0;
  }
  
  .filters {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
  }
  
  .filter-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    flex-wrap: wrap;
  }
  
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--status-color-info-bg-light);
    border: 1px solid var(--status-color-info);
    border-radius: var(--radius-md);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
  }
  
  .notification-details {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  
  .detail-row {
    display: flex;
    gap: var(--spacing-xs);
    align-items: flex-start;
  }

  .error-message {
    background: var(--status-color-error-bg-light);
    padding: var(--spacing-xxs) var(--spacing-xs);
    border-radius: var(--radius-sm);
  }
  
  /* Action buttons (global styles) */
  :global(.action-buttons) {
    display: flex;
    gap: var(--spacing-xxs);
    justify-content: center;
  }

  :global(.action-btn) {
    background: none;
    border: none;
    padding: var(--spacing-xxs);
    cursor: pointer;
    border-radius: var(--radius-xs);

    transition: background-color 0.2s;
  }
  
  :global(.action-btn:hover) {
    background: var(--bg-color-tertiary);
  }
  
  :global(.view-btn:hover) {
    background: var(--status-color-info-bg-lighter);
  }
  
  :global(.retry-btn:hover) {
    background: var(--status-color-warning-bg-light);
  }
  
  :global(.delete-btn:hover) {
    background: var(--status-color-error-bg-light);
  }
  
  /* Status and priority badges (global styles) */
  :global(.status-badge),
  :global(.priority-badge) {
    padding: var(--spacing-xxxs) var(--spacing-xs);
    border-radius: var(--radius-lg);

  }
  
  :global(.status-badge--success),
  :global(.priority-badge--success) {
    background: var(--status-color-success);
  }
  
  :global(.status-badge--error),
  :global(.priority-badge--error) {
    background: var(--status-color-error);
  }
  
  :global(.status-badge--warning),
  :global(.priority-badge--warning) {
    background: var(--status-color-warning);
  }
  
  :global(.status-badge--info),
  :global(.priority-badge--info) {
    background: var(--status-color-info-primary);
  }
  
  :global(.status-badge--neutral),
  :global(.priority-badge--neutral) {
    background: var(--text-color-tertiary);
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .notification-history {
      padding: var(--spacing-xs);
      gap: var(--spacing-sm);
    }
    
    .table-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-xs);
    }
    
    .filter-row {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-xs);
    }
    
    .bulk-actions {
      flex-wrap: wrap;
      gap: var(--spacing-xs);
    }
    
    .pagination {
      gap: var(--spacing-xs);
    }

    .detail-row {
      flex-direction: column;
      gap: var(--spacing-xxs);
    }
  }
  
  /* High contrast support */
  @media (prefers-contrast: high) {
    .filters {
      border-width: 2px;
    }
    
    .bulk-actions {
      border-width: 2px;
    }
  }
</style>
