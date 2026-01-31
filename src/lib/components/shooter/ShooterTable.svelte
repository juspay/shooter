<!--
  ShooterTable - Data table component with sorting, pagination, selection
  Features: Responsive design, keyboard navigation, customizable columns
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TableRow, TableColumn } from './index';

  export let data: TableRow[] = [];
  export let columns: TableColumn<TableRow>[] = [];
  export let sortBy: string | null = null;
  export let sortDirection: 'asc' | 'desc' = 'asc';
  export let selectable = false;
  export let selectedRows: Array<string | number> = [];
  export let keyField = 'id';
  export let loading = false;
  export let emptyMessage = 'No data available';
  export let striped = false;
  export let bordered = false;
  export let hoverable = true;
  export let compact = false;
  export let responsive = true;
  export let stickyHeader = false;
  export let maxHeight: string | null = null;
  
  const dispatch = createEventDispatcher<{
    sort: { column: string; direction: 'asc' | 'desc' };
    select: { row: TableRow; selected: boolean };
    selectAll: { selected: boolean };
    rowClick: { row: TableRow; index: number };
  }>();
  
  let tableElement: HTMLElement;
  let allSelected = false;
  let indeterminate = false;
  let ariaSortValue: 'ascending' | 'descending' | 'none' = 'none';

  // Computed values
  $: sortedData = sortData(data, sortBy, sortDirection);
  $: ariaSortValue = sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none';
  $: {
    const totalRows = data.length;
    const selectedCount = selectedRows.length;
    allSelected = totalRows > 0 && selectedCount === totalRows;
    indeterminate = selectedCount > 0 && selectedCount < totalRows;
  }
  
  function sortData(data: TableRow[], sortBy: string | null, direction: 'asc' | 'desc') {
    if (!sortBy) {
return data;
}

    return [...data].sort((a, b) => {
      const aVal = a[sortBy as keyof TableRow];
      const bVal = b[sortBy as keyof TableRow];
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) {
return 0;
}
      if (aVal == null) {
return direction === 'asc' ? 1 : -1;
}
      if (bVal == null) {
return direction === 'asc' ? -1 : 1;
}
      
      // Handle different data types
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return direction === 'asc' ? comparison : -comparison;
    });
  }
  
  function handleSort(column: string) {
    const columnConfig = columns.find(col => col.key === column);
    if (!columnConfig?.sortable) {
return;
}
    
    let newDirection: 'asc' | 'desc' = 'asc';
    
    if (sortBy === column) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    sortBy = column;
    sortDirection = newDirection;
    
    dispatch('sort', { column, direction: newDirection });
  }
  
  function handleRowSelect(row: TableRow, selected: boolean) {
    const rowKey = row[keyField] as string | number;

    if (selected) {
      selectedRows = [...selectedRows, rowKey];
    } else {
      selectedRows = selectedRows.filter(key => key !== rowKey);
    }

    dispatch('select', { row, selected });
  }
  
  function handleSelectAll(selected: boolean) {
    if (selected) {
      selectedRows = data.map(row => row[keyField] as string | number);
    } else {
      selectedRows = [];
    }

    dispatch('selectAll', { selected });
  }
  
  function handleRowClick(row: TableRow, index: number) {
    dispatch('rowClick', { row, index });
  }

  function isRowSelected(row: TableRow): boolean {
    return selectedRows.includes(row[keyField] as string | number);
  }

  function getCellValue(row: TableRow, column: TableColumn<TableRow>): string {
    const value = row[column.key];

    if (column.render) {
      return column.render(value, row);
    }

    if (value == null) {
return '';
}

    return String(value);
  }
  
  function getSortIcon(column: string): string {
    if (sortBy !== column) {
return '↕️';
}
    return sortDirection === 'asc' ? '↑' : '↓';
  }
</script>

<div class="shooter-table-container" class:shooter-table-container--responsive={responsive}>
  {#if loading}
    <div class="shooter-table-loading">
      <div class="loading-spinner"></div>
      <span>Loading data...</span>
    </div>
  {:else}
    <div 
      class="shooter-table-wrapper"
      class:shooter-table-wrapper--max-height={maxHeight}
      style={maxHeight ? `max-height: ${maxHeight}` : ''}
    >
      <table
        bind:this={tableElement}
        class="shooter-table"
        class:shooter-table--striped={striped}
        class:shooter-table--bordered={bordered}
        class:shooter-table--hoverable={hoverable}
        class:shooter-table--compact={compact}
        class:shooter-table--sticky-header={stickyHeader}
      >
        <!-- Header -->
        <thead class="shooter-table__head">
          <tr class="shooter-table__row">
            {#if selectable}
              <th class="shooter-table__header shooter-table__header--checkbox">
                <span class="shooter-table__checkbox-label">
                  <input
                    type="checkbox"
                    class="shooter-table__checkbox"
                    checked={allSelected}
                    indeterminate={indeterminate}
                    on:change={(e) => handleSelectAll(e.currentTarget.checked)}
                    aria-label="Select all rows"
                  />
                  <span class="shooter-table__checkbox-indicator"></span>
                </span>
              </th>
            {/if}
            
            {#each columns as column}
              <th
                class="shooter-table__header"
                class:shooter-table__header--sortable={column.sortable}
                class:shooter-table__header--sorted={sortBy === column.key}
                style={column.width ? `width: ${column.width}` : ''}
                on:click={() => handleSort(column.key)}
                on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort(column.key)}
                tabindex={column.sortable ? 0 : -1}
                aria-sort={sortBy === column.key ? ariaSortValue : 'none'}
              >
                <div class="shooter-table__header-content" class:shooter-table__header-content--left={!column.align || column.align === 'left'} class:shooter-table__header-content--center={column.align === 'center'} class:shooter-table__header-content--right={column.align === 'right'}>
                  <span class="shooter-table__header-text">
                    {column.label}
                  </span>
                  {#if column.sortable}
                    <span class="shooter-table__sort-icon" aria-hidden="true">
                      {getSortIcon(column.key)}
                    </span>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        
        <!-- Body -->
        <tbody class="shooter-table__body">
          {#each sortedData as row, index}
            {@const isSelected = isRowSelected(row)}
            <tr
              class="shooter-table__row"
              class:shooter-table__row--selected={isSelected}
              on:click={() => handleRowClick(row, index)}
              tabindex="0"
              aria-selected={selectable ? isSelected : null}
            >
              {#if selectable}
                <td class="shooter-table__cell shooter-table__cell--checkbox">
                  <span class="shooter-table__checkbox-label">
                    <input
                      type="checkbox"
                      class="shooter-table__checkbox"
                      checked={isSelected}
                      on:change={(e) => handleRowSelect(row, e.currentTarget.checked)}
                      on:click|stopPropagation
                      aria-label={`Select row ${index + 1}`}
                    />
                    <span class="shooter-table__checkbox-indicator"></span>
                  </span>
                </td>
              {/if}
              
              {#each columns as column}
                <td
                  class="shooter-table__cell"
                  class:shooter-table__cell--left={!column.align || column.align === 'left'} class:shooter-table__cell--center={column.align === 'center'} class:shooter-table__cell--right={column.align === 'right'}
                >
                  <div class="shooter-table__cell-content">
                    {@html getCellValue(row, column)}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
          
          {#if sortedData.length === 0}
            <tr class="shooter-table__row--empty">
              <td class="shooter-table__cell--empty" colspan={columns.length + (selectable ? 1 : 0)}>
                <div class="shooter-table__empty">
                  <div class="shooter-table__empty-icon">📄</div>
                  <div class="shooter-table__empty-message">{emptyMessage}</div>
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .shooter-table-container {
    background: var(--bg-color-secondary);
    border: 1px solid var(--bg-color-elevated);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .shooter-table-container--responsive {
    overflow-x: auto;
  }

  .shooter-table-wrapper {
    overflow: auto;
  }

  .shooter-table-wrapper--max-height {
    overflow-y: auto;
  }

  .shooter-table-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xxl);
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--bg-color-elevated);
    border-top-color: var(--status-color-info);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .shooter-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-color-secondary);
  }

  .shooter-table--bordered {
    border: 1px solid var(--bg-color-elevated);
  }

  .shooter-table__head {
    background: var(--bg-color-tertiary);
  }

  .shooter-table--sticky-header .shooter-table__head th {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .shooter-table__header {
    padding: var(--spacing-sm);
    text-align: left;
    border-bottom: 2px solid var(--bg-color-elevated);
    background: var(--bg-color-tertiary);
    position: relative;
  }

  .shooter-table--compact .shooter-table__header {
    padding: var(--spacing-xs);
  }

  .shooter-table__header--sortable {
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }

  .shooter-table__header--sortable:hover {
    background: var(--bg-color-elevated);
  }

  .shooter-table__header--sortable:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--status-color-info);
  }

  .shooter-table__header--sorted {
    background: var(--status-color-info-light);
  }
  
  .shooter-table__header--checkbox {
    width: 48px;
    padding: var(--spacing-sm) var(--spacing-md);
  }
  
  .shooter-table__header-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  
  .shooter-table__header-content--center {
    justify-content: center;
  }
  
  .shooter-table__header-content--right {
    justify-content: flex-end;
  }
  
  .shooter-table__header-text {
    flex: 1;
  }
  
  .shooter-table__sort-icon {

    opacity: 0.7;
    transition: opacity 0.2s;
  }
  
  .shooter-table__header--sortable:hover .shooter-table__sort-icon {
    opacity: 1;
  }
  
  .shooter-table__body {
    background: var(--bg-color-secondary);
  }

  .shooter-table__row {
    border-bottom: 1px solid var(--bg-color-elevated);
    transition: background 0.2s;
  }

  .shooter-table--hoverable .shooter-table__row:hover {
    background: var(--bg-color-tertiary);
  }

  .shooter-table__row:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--status-color-info);
  }

  .shooter-table__row--selected {
    background: var(--status-color-info-light);
  }

  .shooter-table--striped .shooter-table__row:nth-child(even) {
    background: var(--bg-color-primary);
  }

  .shooter-table--striped.shooter-table--hoverable .shooter-table__row:nth-child(even):hover {
    background: var(--bg-color-tertiary);
  }

  .shooter-table__row--empty {
    background: transparent;
  }

  .shooter-table__cell {
    padding: var(--spacing-sm);
    border-bottom: 1px solid var(--bg-color-elevated);
    vertical-align: middle;
  }

  .shooter-table--compact .shooter-table__cell {
    padding: var(--spacing-xs);
  }

  .shooter-table--bordered .shooter-table__cell {
    border-right: 1px solid var(--bg-color-elevated);
  }
  
  .shooter-table--bordered .shooter-table__cell:last-child {
    border-right: none;
  }
  
  .shooter-table__cell--center {
    text-align: center;
  }
  
  .shooter-table__cell--right {
    text-align: right;
  }
  
  .shooter-table__cell--checkbox {
    width: 48px;
    padding: var(--spacing-sm) var(--spacing-md);
  }
  
  .shooter-table__cell--empty {
    padding: var(--spacing-xxl);
    text-align: center;
    background: transparent;
  }
  
  .shooter-table__cell-content {
    word-break: break-word;

  }
  
  .shooter-table__checkbox-label {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
  }
  
  .shooter-table__checkbox {
    position: absolute;
    opacity: 0;
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .shooter-table__checkbox-indicator {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--bg-color-elevated);
    border-radius: var(--radius-xs);
    background: var(--bg-color-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    position: relative;
  }

  .shooter-table__checkbox:checked + .shooter-table__checkbox-indicator {
    background: var(--status-color-info);
    border-color: var(--status-color-info);
  }

  .shooter-table__checkbox:checked + .shooter-table__checkbox-indicator::after {
    content: '✓';
  }

  .shooter-table__checkbox:indeterminate + .shooter-table__checkbox-indicator {
    background: var(--status-color-info);
    border-color: var(--status-color-info);
  }

  .shooter-table__checkbox:indeterminate + .shooter-table__checkbox-indicator::after {
    content: '−';
  }

  .shooter-table__checkbox:focus + .shooter-table__checkbox-indicator {
    box-shadow: var(--shadow-focus);
  }
  
  .shooter-table__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
  }
  
  .shooter-table__empty-icon {

    opacity: 0.5;
  }
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    .shooter-table-container--responsive {
      overflow-x: scroll;
      -webkit-overflow-scrolling: touch;
    }
    
    .shooter-table {
      min-width: 600px;
    }
    
    .shooter-table__header,
    .shooter-table__cell {
      padding: var(--spacing-xs);

    }
    
    .shooter-table__header--checkbox,
    .shooter-table__cell--checkbox {
      padding: var(--spacing-xs) 0.75rem;
    }
  }
  
  /* Scrollbar styling */
  .shooter-table-wrapper::-webkit-scrollbar,
  .shooter-table-container--responsive::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .shooter-table-wrapper::-webkit-scrollbar-track,
  .shooter-table-container--responsive::-webkit-scrollbar-track {
    background: var(--bg-color-tertiary);
  }

  .shooter-table-wrapper::-webkit-scrollbar-thumb,
  .shooter-table-container--responsive::-webkit-scrollbar-thumb {
    background: var(--bg-color-elevated);
    border-radius: var(--radius-xs);
  }

  .shooter-table-wrapper::-webkit-scrollbar-thumb:hover,
  .shooter-table-container--responsive::-webkit-scrollbar-thumb:hover {
    background: var(--text-color-muted);
  }
</style>
