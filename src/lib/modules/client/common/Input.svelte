<script lang="ts">
  interface Props {
    autocomplete?: AutoFill;
    disabled?: boolean;
    hint?: string;
    id: string;
    label: string;
    mono?: boolean;
    onchange?: (value: string) => void;
    placeholder?: string;
    type?: 'email' | 'password' | 'text';
    value?: string;
  }

  /* eslint-disable prefer-const -- $props() requires let for bindable props */
  let {
    autocomplete = 'off' as AutoFill,
    disabled = false,
    hint,
    id,
    label,
    mono = false,
    onchange,
    placeholder = '',
    type = 'text',
    value = $bindable(''),
  }: Props = $props();
  /* eslint-enable prefer-const */

  function handleInput(): void {
    onchange?.(value);
  }
</script>

<div class="form-group">
  <label for={id} class="form-label">{label}</label>
  <input
    {id}
    {type}
    bind:value
    {placeholder}
    {disabled}
    {autocomplete}
    class="input"
    class:input-mono={mono}
    oninput={handleInput}
  />
  {#if hint}
    <span class="form-hint">{hint}</span>
  {/if}
</div>
