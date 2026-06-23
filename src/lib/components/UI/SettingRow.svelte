<!--
  SettingRow — one labelled control in the SettingsModal. Renders the control itself (checkbox / select
  / disabled placeholder slider) so the row + control styling lives in one place, keeping the parent
  modal small. Driven by props, not snippets, so its scoped CSS reaches the controls.
-->
<script lang="ts">
  type Option = { value: string; label: string };
  let {
    label,
    sub = '',
    type,
    checked = false,
    value = '',
    options = [],
    disabled = false,
    onToggle,
    onSelect
  }: {
    label: string;
    /** Faint trailing note, e.g. "— coming soon" on the disabled audio placeholders. */
    sub?: string;
    type: 'checkbox' | 'select' | 'slider';
    checked?: boolean;
    value?: string;
    options?: Option[];
    disabled?: boolean;
    onToggle?: () => void;
    onSelect?: (v: string) => void;
  } = $props();
</script>

<label class="opt" class:is-disabled={disabled}>
  <span class="opt-label"
    >{label}{#if sub}<em class="soon">{sub}</em>{/if}</span
  >
  {#if type === 'checkbox'}
    <input type="checkbox" {checked} {disabled} onchange={onToggle} />
  {:else if type === 'select'}
    <select
      class="opt-select"
      {value}
      {disabled}
      onchange={(e) => onSelect?.(e.currentTarget.value)}
    >
      {#each options as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
  {:else}
    <input type="range" min="0" max="100" value="80" disabled aria-label={label} />
  {/if}
</label>

<style>
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 2px;
    color: var(--text);
    font-size: 12px;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .opt-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .soon {
    color: var(--text-muted);
    font-size: 9px;
    font-style: italic;
    letter-spacing: 0.02em;
  }
  .opt.is-disabled {
    color: var(--text-muted);
    cursor: default;
  }
  input[type='checkbox'] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
  input[type='range'] {
    accent-color: var(--accent);
    width: 130px;
    /* Disabled "coming soon" slider — keep the app pointer (inherited from the row) rather than the
       OS not-allowed cursor; inputs are excluded from the global app-cursor rule, so opt in here. */
    cursor: inherit;
    opacity: 0.5;
  }
  /* Retro-terminal dropdown — mirrors the construction material picker / fuel panel: flat dark field,
     thin border that warms to orange on hover/focus (the global option styling in app.css handles the
     popup list + kills the native blue). */
  .opt-select {
    background: var(--bg);
    color: var(--accent-hi);
    border: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 3px 6px;
    cursor: pointer;
    outline: none;
    transition:
      border-color 0.12s,
      color 0.12s;
  }
  .opt-select:hover {
    border-color: var(--border-hi);
  }
  .opt-select:focus {
    border-color: var(--accent-hi);
  }
  .opt.is-disabled .opt-select {
    color: var(--text-muted);
    cursor: default;
  }
</style>
