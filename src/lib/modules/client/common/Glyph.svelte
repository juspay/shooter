<script lang="ts">
  // Decorative SVG glyph. Renders a trusted, build-time SVG string WITHOUT the
  // Icon component's hardcoded role=button/tabindex — so it never becomes a
  // nested, unlabeled focus stop inside an already-labeled button or link.
  const { size = 24, svg }: { size?: number; svg: string } = $props();
</script>

<span class="glyph" style="--glyph-size: {size}px" aria-hidden="true">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted static SVG asset, never user input -->
  {@html svg}
</span>

<style>
  .glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .glyph :global(svg) {
    display: block;
    width: var(--glyph-size);
    height: var(--glyph-size);
  }
</style>
