<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getAllPricingConfigs,
    createPricingConfig,
    updatePricingConfig,
    deletePricingConfig,
    type PricingConfig
  } from '$lib/api/client';

  let configs: PricingConfig[] = [];
  let loading = true;
  let saving: Record<string, boolean> = {};
  let error = '';
  let success = '';
  let showAddModal = false;
  let deleteConfirmId: string | null = null;

  // Track which rows have unsaved changes
  let dirtyIds: string[] = [];

  // Editable copies of each row (flat array, same order as configs)
  let editList: Array<PricingConfig & { _dirty?: boolean }> = [];

  // New entry form
  let newEntry = getEmptyEntry();

  function getEmptyEntry() {
    return {
      provider: 'google',
      model: '',
      display_name: '',
      unit: 'per_request',
      cost_per_unit_usd: 0,
      markup_multiplier: 2.5,
      fixed_credit_override: null as number | null,
      is_active: true,
      notes: ''
    };
  }

  const PROVIDERS = [
    { value: 'google', label: 'Google Gemini' },
    { value: 'fal', label: 'Fal.ai' },
    { value: 'runpod', label: 'RunPod' },
    { value: 'openai', label: 'OpenAI' }
  ];

  const UNITS = [
    { value: 'per_request', label: 'Per Request' },
    { value: 'per_1k_tokens_input', label: 'Per 1K Tokens (Input)' },
    { value: 'per_1k_tokens_output', label: 'Per 1K Tokens (Output)' },
    { value: 'per_second', label: 'Per Second' }
  ];

  onMount(async () => {
    await loadConfigs();
  });

  /**
   * Normalize numeric fields from Supabase (which may return strings for NUMERIC columns)
   */
  function normalizeConfig(c: PricingConfig): PricingConfig & { _dirty?: boolean } {
    return {
      ...c,
      cost_per_unit_usd: Number(c.cost_per_unit_usd) || 0,
      markup_multiplier: Number(c.markup_multiplier) || 2.5,
      fixed_credit_override: c.fixed_credit_override != null ? Number(c.fixed_credit_override) : null,
      _dirty: false
    };
  }

  async function loadConfigs() {
    loading = true;
    error = '';
    try {
      configs = await getAllPricingConfigs();
      editList = configs.map(normalizeConfig);
      dirtyIds = [];
    } catch (err: any) {
      console.error('Error loading pricing configs:', err);
      error = err.message || 'Failed to load pricing configs';
    } finally {
      loading = false;
    }
  }

  function markDirty(index: number) {
    const item = editList[index];
    if (item && !item._dirty) {
      item._dirty = true;
      dirtyIds = [...dirtyIds, item.id];
    }
  }

  function calculateCredits(costUsd: number, markup: number, fixedOverride: number | null): string {
    if (fixedOverride !== null && fixedOverride !== undefined && fixedOverride > 0) {
      return `${fixedOverride} credits (fixed)`;
    }
    if (costUsd <= 0) {
      return 'Cost TBD';
    }
    // 1 credit = $0.01, so credits = cost_in_dollars * 100 * markup
    const credits = Math.ceil(costUsd * 100 * markup);
    const chargeUsd = (credits * 0.01).toFixed(4);
    return `${credits} credits ($${chargeUsd})`;
  }

  function getProviderLabel(provider: string): string {
    return PROVIDERS.find(p => p.value === provider)?.label || provider;
  }

  function getUnitLabel(unit: string): string {
    return UNITS.find(u => u.value === unit)?.label || unit;
  }

  function getProviderColor(provider: string): string {
    switch (provider) {
      case 'google': return '#4285f4';
      case 'fal': return '#8b5cf6';
      case 'runpod': return '#673ab7';
      case 'openai': return '#10a37f';
      default: return '#6b7280';
    }
  }

  async function saveRow(index: number) {
    const data = editList[index];
    if (!data) return;

    saving = { ...saving, [data.id]: true };
    error = '';
    success = '';

    try {
      const updated = await updatePricingConfig(data.id, {
        provider: data.provider,
        model: data.model,
        display_name: data.display_name,
        unit: data.unit,
        cost_per_unit_usd: Number(data.cost_per_unit_usd),
        markup_multiplier: Number(data.markup_multiplier),
        fixed_credit_override: data.fixed_credit_override ? Number(data.fixed_credit_override) : null,
        is_active: data.is_active,
        notes: data.notes
      });

      // Update local state
      editList[index] = normalizeConfig(updated);
      editList = editList;
      dirtyIds = dirtyIds.filter(d => d !== data.id);

      success = 'Saved successfully!';
      setTimeout(() => success = '', 2000);
    } catch (err: any) {
      console.error('Error saving pricing config:', err);
      error = err.message || 'Failed to save';
    } finally {
      saving = { ...saving, [data.id]: false };
    }
  }

  async function handleAdd() {
    if (!newEntry.model) {
      error = 'Model identifier is required';
      return;
    }

    saving = { ...saving, new: true };
    error = '';
    success = '';

    try {
      const created = await createPricingConfig({
        provider: newEntry.provider,
        model: newEntry.model,
        display_name: newEntry.display_name || null,
        unit: newEntry.unit,
        cost_per_unit_usd: Number(newEntry.cost_per_unit_usd),
        markup_multiplier: Number(newEntry.markup_multiplier),
        fixed_credit_override: newEntry.fixed_credit_override ? Number(newEntry.fixed_credit_override) : null,
        is_active: newEntry.is_active,
        notes: newEntry.notes || null
      });

      configs = [...configs, created];
      editList = [...editList, normalizeConfig(created)];
      showAddModal = false;
      newEntry = getEmptyEntry();

      success = 'API pricing entry added!';
      setTimeout(() => success = '', 3000);
    } catch (err: any) {
      console.error('Error creating pricing config:', err);
      error = err.message || 'Failed to create';
    } finally {
      saving = { ...saving, new: false };
    }
  }

  async function handleDelete(id: string) {
    saving = { ...saving, [id]: true };
    error = '';

    try {
      await deletePricingConfig(id);
      configs = configs.filter(c => c.id !== id);
      editList = editList.filter(c => c.id !== id);
      dirtyIds = dirtyIds.filter(d => d !== id);
      deleteConfirmId = null;

      success = 'Entry deleted';
      setTimeout(() => success = '', 2000);
    } catch (err: any) {
      console.error('Error deleting pricing config:', err);
      error = err.message || 'Failed to delete';
      deleteConfirmId = null;
    } finally {
      saving = { ...saving, [id]: false };
    }
  }

  function toggleActive(index: number) {
    editList[index].is_active = !editList[index].is_active;
    editList = editList;
    markDirty(index);
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="pricing-page">
  <div class="page-header">
    <div>
      <h2>API Pricing Configuration</h2>
      <p class="page-description">
        Manage the cost and markup for each API endpoint you use. 
        Credits charged = API cost x markup. (1 credit = $0.01)
      </p>
    </div>
    <button class="btn btn-primary" on:click={() => showAddModal = true}>
      + Add API
    </button>
  </div>

  {#if error}
    <div class="alert alert-error">
      <span class="alert-icon">!</span>
      <span>{error}</span>
      <button class="alert-close" on:click={() => error = ''}>x</button>
    </div>
  {/if}

  {#if success}
    <div class="alert alert-success">
      <span>{success}</span>
    </div>
  {/if}

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading pricing configs...</p>
    </div>
  {:else if editList.length === 0}
    <div class="empty-state">
      <div class="empty-icon">💰</div>
      <h3>No API pricing configured</h3>
      <p>Add your first API pricing entry to start tracking costs and charging credits.</p>
      <button class="btn btn-primary" on:click={() => showAddModal = true}>
        + Add First API
      </button>
    </div>
  {:else}
    <div class="pricing-list">
      {#each editList as ed, index (ed.id)}
        <div class="pricing-card" class:inactive={!ed.is_active}>
          <div class="card-header">
            <div class="card-header-left">
              <span 
                class="provider-badge" 
                style="background: {getProviderColor(ed.provider || '')};"
              >
                {getProviderLabel(ed.provider || '')}
              </span>
              <div class="card-title">
                <span class="model-name">{ed.display_name || ed.model}</span>
                {#if ed.display_name}
                  <span class="model-id">{ed.model}</span>
                {/if}
              </div>
            </div>
            <div class="card-header-right">
              <div class="charge-display">
                {calculateCredits(Number(ed.cost_per_unit_usd), Number(ed.markup_multiplier), ed.fixed_credit_override ?? null)}
              </div>
              <button 
                class="btn-toggle" 
                class:active={ed.is_active}
                on:click={() => toggleActive(index)}
                title={ed.is_active ? 'Active — click to disable' : 'Inactive — click to enable'}
              >
                {ed.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>

          <div class="card-body">
            <div class="fields-grid">
              <div class="field">
                <label for="provider-{ed.id}">Provider</label>
                <select 
                  id="provider-{ed.id}"
                  bind:value={ed.provider} 
                  on:change={() => markDirty(index)}
                  class="input"
                >
                  {#each PROVIDERS as p}
                    <option value={p.value}>{p.label}</option>
                  {/each}
                </select>
              </div>

              <div class="field">
                <label for="model-{ed.id}">Model / Endpoint ID</label>
                <input 
                  id="model-{ed.id}"
                  type="text" 
                  class="input" 
                  bind:value={ed.model}
                  on:input={() => markDirty(index)}
                  placeholder="e.g. gemini-2.5-flash-image"
                />
              </div>

              <div class="field">
                <label for="display-{ed.id}">Display Name</label>
                <input 
                  id="display-{ed.id}"
                  type="text" 
                  class="input" 
                  bind:value={ed.display_name}
                  on:input={() => markDirty(index)}
                  placeholder="Human-readable name"
                />
              </div>

              <div class="field">
                <label for="unit-{ed.id}">Unit</label>
                <select 
                  id="unit-{ed.id}"
                  bind:value={ed.unit} 
                  on:change={() => markDirty(index)}
                  class="input"
                >
                  {#each UNITS as u}
                    <option value={u.value}>{u.label}</option>
                  {/each}
                </select>
              </div>

              <div class="field">
                <label for="cost-{ed.id}">Our Cost (USD)</label>
                <div class="input-with-prefix">
                  <span class="input-prefix">$</span>
                  <input 
                    id="cost-{ed.id}"
                    type="number" 
                    class="input input-prefixed" 
                    bind:value={ed.cost_per_unit_usd}
                    on:input={() => markDirty(index)}
                    step="0.000001"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
                <small>What the API charges us {getUnitLabel(ed.unit || 'per_request').toLowerCase()}</small>
              </div>

              <div class="field">
                <label for="markup-{ed.id}">Markup Multiplier</label>
                <div class="input-with-suffix">
                  <input 
                    id="markup-{ed.id}"
                    type="number" 
                    class="input input-suffixed" 
                    bind:value={ed.markup_multiplier}
                    on:input={() => markDirty(index)}
                    step="0.1"
                    min="1"
                    placeholder="2.5"
                  />
                  <span class="input-suffix">x</span>
                </div>
                <small>We charge {ed.markup_multiplier}x our cost</small>
              </div>

              <div class="field">
                <label for="override-{ed.id}">Fixed Credit Override</label>
                <input 
                  id="override-{ed.id}"
                  type="number" 
                  class="input" 
                  bind:value={ed.fixed_credit_override}
                  on:input={() => markDirty(index)}
                  min="0"
                  placeholder="Leave empty to use calculated"
                />
                <small>If set, charge this exact amount instead of cost x markup</small>
              </div>

              <div class="field field-wide">
                <label for="notes-{ed.id}">Notes</label>
                <input 
                  id="notes-{ed.id}"
                  type="text" 
                  class="input" 
                  bind:value={ed.notes}
                  on:input={() => markDirty(index)}
                  placeholder="e.g. Updated Feb 2026 per Google pricing page"
                />
              </div>
            </div>
          </div>

          <div class="card-footer">
            <div class="card-footer-left">
              <span class="updated-at">Updated: {formatDate(ed.updated_at)}</span>
            </div>
            <div class="card-footer-right">
              <button 
                class="btn btn-danger-outline btn-sm"
                on:click={() => deleteConfirmId = ed.id}
                disabled={saving[ed.id]}
              >
                Delete
              </button>
              <button 
                class="btn btn-primary btn-sm"
                on:click={() => saveRow(index)}
                disabled={saving[ed.id] || !ed._dirty}
                class:pulse={ed._dirty}
              >
                {saving[ed.id] ? 'Saving...' : ed._dirty ? 'Save Changes' : 'Saved'}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Add API Modal -->
{#if showAddModal}
  <div class="modal-backdrop" on:click={() => showAddModal = false}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Add API Pricing Entry</h3>
        <button class="modal-close" on:click={() => showAddModal = false}>x</button>
      </div>

      <div class="modal-body">
        <div class="modal-fields">
          <div class="field">
            <label>Provider <span class="required">*</span></label>
            <select bind:value={newEntry.provider} class="input">
              {#each PROVIDERS as p}
                <option value={p.value}>{p.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label>Model / Endpoint ID <span class="required">*</span></label>
            <input 
              type="text" 
              class="input" 
              bind:value={newEntry.model}
              placeholder="e.g. gemini-2.5-flash-image"
            />
            <small>Must match the model identifier used in the API call code</small>
          </div>

          <div class="field">
            <label>Display Name</label>
            <input 
              type="text" 
              class="input" 
              bind:value={newEntry.display_name}
              placeholder="e.g. Gemini 2.5 Flash (Image)"
            />
          </div>

          <div class="field">
            <label>Unit <span class="required">*</span></label>
            <select bind:value={newEntry.unit} class="input">
              {#each UNITS as u}
                <option value={u.value}>{u.label}</option>
              {/each}
            </select>
          </div>

          <div class="field">
            <label>Our Cost (USD)</label>
            <div class="input-with-prefix">
              <span class="input-prefix">$</span>
              <input 
                type="number" 
                class="input input-prefixed" 
                bind:value={newEntry.cost_per_unit_usd}
                step="0.000001"
                min="0"
                placeholder="0.00"
              />
            </div>
          </div>

          <div class="field">
            <label>Markup Multiplier</label>
            <div class="input-with-suffix">
              <input 
                type="number" 
                class="input input-suffixed" 
                bind:value={newEntry.markup_multiplier}
                step="0.1"
                min="1"
                placeholder="2.5"
              />
              <span class="input-suffix">x</span>
            </div>
          </div>

          <div class="field">
            <label>Fixed Credit Override</label>
            <input 
              type="number" 
              class="input" 
              bind:value={newEntry.fixed_credit_override}
              min="0"
              placeholder="Leave empty to use calculated"
            />
            <small>If set, charge this exact credit amount instead of calculated</small>
          </div>

          <div class="field field-wide">
            <label>Notes</label>
            <input 
              type="text" 
              class="input" 
              bind:value={newEntry.notes}
              placeholder="Optional notes about pricing source"
            />
          </div>
        </div>

        <div class="modal-preview">
          <strong>Preview:</strong> 
          {calculateCredits(Number(newEntry.cost_per_unit_usd), Number(newEntry.markup_multiplier), newEntry.fixed_credit_override)}
          {getUnitLabel(newEntry.unit).toLowerCase()}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => showAddModal = false} disabled={saving['new']}>
          Cancel
        </button>
        <button 
          class="btn btn-primary" 
          on:click={handleAdd}
          disabled={saving['new'] || !newEntry.model}
        >
          {saving['new'] ? 'Adding...' : 'Add API'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteConfirmId}
  {@const configToDelete = editList.find(c => c.id === deleteConfirmId)}
  <div class="modal-backdrop" on:click={() => deleteConfirmId = null}>
    <div class="modal-content modal-sm" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Delete API Pricing</h3>
        <button class="modal-close" on:click={() => deleteConfirmId = null}>x</button>
      </div>
      <div class="modal-body">
        <p>Delete pricing for <strong>{configToDelete?.display_name || configToDelete?.model}</strong>?</p>
        <p class="warning-text">This will stop credit calculation for this API.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => deleteConfirmId = null}>Cancel</button>
        <button 
          class="btn btn-danger" 
          on:click={() => deleteConfirmId && handleDelete(deleteConfirmId)}
          disabled={saving[deleteConfirmId || '']}
        >
          {saving[deleteConfirmId || ''] ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pricing-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e5e7eb;
  }

  .page-header h2 {
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .page-description {
    font-size: 14px;
    color: #6b7280;
    max-width: 600px;
  }

  /* Alerts */
  .alert {
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .alert-success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .alert-icon {
    font-size: 16px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #991b1b;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .alert-close {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    opacity: 0.6;
    color: inherit;
  }

  .alert-close:hover {
    opacity: 1;
  }

  /* Loading & Empty */
  .loading-state {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: #6b7280;
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state h3 {
    font-size: 20px;
    color: #1f2937;
    margin-bottom: 8px;
  }

  .empty-state p {
    margin-bottom: 24px;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  /* Pricing Cards */
  .pricing-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pricing-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: all 0.2s;
  }

  .pricing-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .pricing-card.inactive {
    opacity: 0.6;
    border-color: #d1d5db;
  }

  .card-header {
    padding: 16px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f3f4f6;
  }

  .card-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .provider-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
  }

  .card-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-name {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .model-id {
    font-size: 12px;
    font-family: monospace;
    color: #6b7280;
  }

  .card-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .charge-display {
    font-size: 14px;
    font-weight: 600;
    color: #059669;
    background: #ecfdf5;
    padding: 6px 12px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .btn-toggle {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-toggle.active {
    background: #d1fae5;
    border-color: #6ee7b7;
    color: #065f46;
  }

  .card-body {
    padding: 20px 24px;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-wide {
    grid-column: span 2;
  }

  .field label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .field small {
    font-size: 11px;
    color: #9ca3af;
  }

  .input {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    color: #1f2937;
    background: white;
    transition: border-color 0.2s;
    width: 100%;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .input-with-prefix,
  .input-with-suffix {
    display: flex;
    align-items: stretch;
  }

  .input-prefix,
  .input-suffix {
    display: flex;
    align-items: center;
    padding: 0 10px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
  }

  .input-prefix {
    border-right: none;
    border-radius: 6px 0 0 6px;
  }

  .input-suffix {
    border-left: none;
    border-radius: 0 6px 6px 0;
  }

  .input-prefixed {
    border-radius: 0 6px 6px 0;
  }

  .input-suffixed {
    border-radius: 6px 0 0 6px;
  }

  .card-footer {
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #f3f4f6;
    background: #fafbfc;
    border-radius: 0 0 12px 12px;
  }

  .card-footer-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .card-footer-right {
    display: flex;
    gap: 8px;
  }

  .updated-at {
    font-size: 12px;
    color: #9ca3af;
  }

  /* Buttons */
  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 13px;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-danger-outline {
    background: white;
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  .btn-danger-outline:hover:not(:disabled) {
    background: #fee2e2;
  }

  .btn.pulse {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    max-width: 700px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .modal-content.modal-sm {
    max-width: 420px;
  }

  .modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    color: #6b7280;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .modal-close:hover {
    background: #f3f4f6;
  }

  .modal-body {
    padding: 24px;
  }

  .modal-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .modal-preview {
    margin-top: 20px;
    padding: 12px 16px;
    background: #ecfdf5;
    border-radius: 8px;
    font-size: 14px;
    color: #065f46;
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .required {
    color: #dc2626;
  }

  .warning-text {
    color: #dc2626;
    font-weight: 500;
    margin-top: 8px;
    font-size: 14px;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .fields-grid {
      grid-template-columns: 1fr 1fr;
    }

    .modal-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
