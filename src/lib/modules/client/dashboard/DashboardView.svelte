<script lang="ts">
  import type { DashboardCard } from '$lib/types';

  import DashboardCardComponent from './DashboardCard.svelte';

  const {
    cards,
    onCardClick,
  }: {
    cards: DashboardCard[];
    onCardClick?: (card: DashboardCard) => void;
  } = $props();

  const runningCards = $derived(cards.filter((c) => c.status === 'running'));
  const otherCards = $derived(cards.filter((c) => c.status !== 'running'));

  function handleClick(card: DashboardCard): void {
    onCardClick?.(card);
  }
</script>

{#if runningCards.length > 0}
  <div class="section">
    <h3 class="section-label">Active</h3>
    {#each runningCards as card (card.terminalId)}
      <DashboardCardComponent
        {card}
        onclick={(): void => {
          handleClick(card);
        }}
      />
    {/each}
  </div>
{/if}

{#if otherCards.length > 0}
  <div class="section">
    <h3 class="section-label">Recent</h3>
    {#each otherCards as card (card.terminalId)}
      <DashboardCardComponent
        {card}
        onclick={(): void => {
          handleClick(card);
        }}
      />
    {/each}
  </div>
{/if}

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-6, 24px);
  }

  .section-label {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary, #a1a1a1);
    margin: 0 0 var(--space-1, 4px) 0;
  }
</style>
