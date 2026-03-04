<script lang="ts">
  import AlertTriangle from '$lib/assets/icons/alert-triangle.svg?raw';
  import Bell from '$lib/assets/icons/bell.svg?raw';
  import CheckCircle from '$lib/assets/icons/check-circle.svg?raw';
  import File from '$lib/assets/icons/file.svg?raw';
  import Folder from '$lib/assets/icons/folder.svg?raw';
  import Play from '$lib/assets/icons/play.svg?raw';
  import Refresh from '$lib/assets/icons/refresh.svg?raw';
  import Settings from '$lib/assets/icons/settings.svg?raw';
  import Tool from '$lib/assets/icons/tool.svg?raw';
  import XCircle from '$lib/assets/icons/x-circle.svg?raw';

  const icons: Record<string, string> = {
    'alert-triangle': AlertTriangle,
    'bell': Bell,
    'check-circle': CheckCircle,
    'file': File,
    'folder': Folder,
    'play': Play,
    'refresh': Refresh,
    'settings': Settings,
    'tool': Tool,
    'x-circle': XCircle,
  };

  interface Props {
    class?: string;
    name: keyof typeof icons;
    size?: number;
  }

  const { class: className = '', name, size = 16 }: Props = $props();

  const svgContent = $derived(icons[name] || '');
</script>

<span
  class="icon {className}"
  style="width: {size}px; height: {size}px;"
  role="img"
  aria-hidden="true"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG content is from trusted local assets -->
  {@html svgContent}
</span>

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
