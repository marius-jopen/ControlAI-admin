<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    getAllLoras, 
    createLora, 
    updateLora, 
    deleteLora, 
    type Lora,
    getRemoteLoraFiles,
    uploadLoraFromUrl,
    type LoraFile
  } from '$lib/api/client';

  let loras: Lora[] = [];
  let filteredLoras: Lora[] = [];
  let loading = true;
  let error = '';
  let filterType: 'all' | 'sdxl' | 'flux' = 'all';
  let searchQuery = '';
  let showNewLoraForm = false;
  
  // Upload section state
  let showUploadSection = false;
  let remoteFiles: LoraFile[] = [];
  let loadingUpload = false;
  let uploadError = '';
  let uploadSuccess = '';
  let uploading = false;
  
  // Upload form
  let uploadFileUrl = '';
  let uploadFileName = '';
  
  // New LoRA form
  let newLora: Omit<Lora, 'id' | 'created_at' | 'updated_at'> = {
    name: '',
    value: '',
    trigger: '',
    description: '',
    image: '',
    type: 'sdxl'
  };

  // Track editing state per LoRA
  let editingLoras: Record<string, Partial<Lora>> = {};
  let savingLoras: Set<string> = new Set();

  onMount(async () => {
    await loadLoras();
    // Pre-load S3 files for the value dropdown
    await loadRemoteFiles();
  });

  async function loadLoras() {
    try {
      loading = true;
      error = '';
      loras = await getAllLoras();
      applyFilters();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load LoRAs';
      console.error('Error loading LoRAs:', e);
    } finally {
      loading = false;
    }
  }

  function applyFilters() {
    let filtered = [...loras];
    
    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(lora => lora.type === filterType);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(lora => 
        lora.name.toLowerCase().includes(query) ||
        lora.value.toLowerCase().includes(query) ||
        lora.trigger?.toLowerCase().includes(query) ||
        lora.description?.toLowerCase().includes(query)
      );
    }
    
    filteredLoras = filtered;
  }

  $: {
    filterType;
    searchQuery;
    applyFilters();
  }

  function startEditing(lora: Lora) {
    console.log('🔵 startEditing called for:', lora.name, lora.id);
    // Create a new object reference to trigger Svelte reactivity
    editingLoras = { ...editingLoras, [lora.id]: { ...lora } };
    console.log('🔵 editingLoras:', editingLoras);
  }

  function updateEditingField(loraId: string, field: keyof Lora, value: any) {
    // Create a new object reference to trigger Svelte reactivity
    const currentEdit = editingLoras[loraId] || {};
    editingLoras = { 
      ...editingLoras, 
      [loraId]: { ...currentEdit, [field]: value } 
    };
  }

  function cancelEditing(loraId: string) {
    // Create a new object without the loraId to trigger Svelte reactivity
    const { [loraId]: removed, ...rest } = editingLoras;
    editingLoras = rest;
  }

  async function saveChanges(loraId: string) {
    const changes = editingLoras[loraId];
    if (!changes) return;

    try {
      savingLoras.add(loraId);
      savingLoras = savingLoras; // Trigger reactivity

      await updateLora(loraId, changes);
      
      // Update local state
      const index = loras.findIndex(l => l.id === loraId);
      if (index !== -1) {
        loras[index] = { ...loras[index], ...changes };
        loras = loras; // Trigger reactivity
        applyFilters();
      }

      // Create a new object without the loraId to trigger Svelte reactivity
      const { [loraId]: removed, ...rest } = editingLoras;
      editingLoras = rest;
      
      console.log('✅ LoRA saved successfully');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save changes';
      console.error('Error saving LoRA:', e);
    } finally {
      savingLoras.delete(loraId);
      savingLoras = savingLoras; // Trigger reactivity
    }
  }

  async function handleCreateLora() {
    try {
      // Validation
      if (!newLora.name || !newLora.value || !newLora.type) {
        error = 'Name, Value, and Type are required';
        return;
      }

      const createdLora = await createLora(newLora);
      loras = [...loras, createdLora];
      applyFilters();
      
      // Reset form
      newLora = {
        name: '',
        value: '',
        trigger: '',
        description: '',
        image: '',
        type: 'sdxl'
      };
      showNewLoraForm = false;
      error = '';
      
      console.log('✅ LoRA created successfully');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create LoRA';
      console.error('Error creating LoRA:', e);
    }
  }

  async function handleDeleteLora(loraId: string, loraName: string) {
    if (!confirm(`Are you sure you want to delete "${loraName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteLora(loraId);
      loras = loras.filter(l => l.id !== loraId);
      applyFilters();
      
      console.log('✅ LoRA deleted successfully');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete LoRA';
      console.error('Error deleting LoRA:', e);
    }
  }

  function getDisplayValue(lora: Lora, field: keyof Lora): any {
    return editingLoras[lora.id]?.[field] ?? lora[field];
  }

  function isEditing(loraId: string): boolean {
    const result = !!editingLoras[loraId];
    // console.log('🟢 isEditing check for', loraId, ':', result);
    return result;
  }

  // Upload-related functions
  async function toggleUploadSection() {
    showUploadSection = !showUploadSection;
    if (showUploadSection && remoteFiles.length === 0) {
      await loadRemoteFiles();
    }
  }

  async function loadRemoteFiles() {
    try {
      loadingUpload = true;
      uploadError = '';
      remoteFiles = await getRemoteLoraFiles();
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Failed to load remote files';
      console.error('Error loading remote files:', e);
    } finally {
      loadingUpload = false;
    }
  }

  async function handleUploadFromUrl() {
    if (!uploadFileUrl || !uploadFileName) {
      uploadError = 'Please provide both file URL and file name';
      return;
    }
    
    if (uploading) return;
    
    try {
      uploading = true;
      uploadError = '';
      uploadSuccess = '';
      
      await uploadLoraFromUrl(uploadFileUrl, uploadFileName);
      
      uploadSuccess = `✅ LoRA "${uploadFileName}" uploaded successfully!`;
      uploadFileUrl = '';
      uploadFileName = '';
      
      // Reload remote files
      await loadRemoteFiles();
      
      console.log('✅ LoRA uploaded successfully');
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Failed to upload LoRA';
      console.error('Error uploading LoRA:', e);
    } finally {
      uploading = false;
    }
  }

  async function refreshRemoteFiles() {
    await loadRemoteFiles();
  }

  // Get S3 filenames without .safetensors extension for dropdown
  function getS3FileOptions() {
    return remoteFiles.map(file => ({
      value: file.name.replace('.safetensors', ''),
      label: file.name,
      size: file.sizeFormatted
    }));
  }
</script>

<div class="loras-page">
  <div class="page-header">
    <div>
      <h1>🎨 LoRA Management</h1>
      <p class="subtitle">Manage LoRA models for SDXL and Flux tools</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" on:click={toggleUploadSection}>
        {showUploadSection ? '📥 Hide Upload' : '📤 Upload LoRAs'}
      </button>
      <button class="btn btn-primary" on:click={() => showNewLoraForm = !showNewLoraForm}>
        {showNewLoraForm ? '❌ Cancel' : '➕ New LoRA'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error">
      ⚠️ {error}
    </div>
  {/if}

  {#if showNewLoraForm}
    <div class="new-lora-form">
      <h3>Create New LoRA</h3>
      <div class="form-grid">
        <div class="form-group">
          <label for="new-name">Name *</label>
          <input
            id="new-name"
            type="text"
            bind:value={newLora.name}
            placeholder="e.g., Celine Bags"
          />
        </div>
        
        <div class="form-group">
          <label for="new-value">Value (Model ID) *</label>
          {#if remoteFiles.length > 0}
            <select id="new-value" bind:value={newLora.value}>
              <option value="">-- Select from S3 or type custom --</option>
              {#each getS3FileOptions() as option}
                <option value={option.value}>{option.label} ({option.size})</option>
              {/each}
            </select>
            <input
              type="text"
              bind:value={newLora.value}
              placeholder="Or type custom value: sdxl_celine-bag-v3"
              class="value-override"
            />
          {:else}
            <input
              id="new-value"
              type="text"
              bind:value={newLora.value}
              placeholder="e.g., sdxl_celine-bag-v3"
            />
          {/if}
          <small class="help-text">Select from uploaded S3 files or type a custom value</small>
        </div>
        
        <div class="form-group">
          <label for="new-type">Type *</label>
          <select id="new-type" bind:value={newLora.type}>
            <option value="sdxl">SDXL</option>
            <option value="flux">Flux</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="new-trigger">Trigger Word</label>
          <input
            id="new-trigger"
            type="text"
            bind:value={newLora.trigger}
            placeholder="e.g., Celine Bag"
          />
        </div>
        
        <div class="form-group full-width">
          <label for="new-description">Description</label>
          <textarea
            id="new-description"
            bind:value={newLora.description}
            placeholder="Describe what this LoRA does..."
            rows="2"
          ></textarea>
        </div>
        
        <div class="form-group full-width">
          <label for="new-image">Image URL</label>
          <input
            id="new-image"
            type="text"
            bind:value={newLora.image}
            placeholder="https://..."
          />
        </div>
      </div>
      
      <div class="form-actions">
        <button class="btn btn-secondary" on:click={() => showNewLoraForm = false}>Cancel</button>
        <button class="btn btn-primary" on:click={handleCreateLora}>Create LoRA</button>
      </div>
    </div>
  {/if}

  {#if showUploadSection}
    <div class="upload-section">
      <div class="upload-header">
        <h3>📤 Upload LoRA Files to RunPod S3</h3>
        <button class="btn-icon" on:click={refreshRemoteFiles} disabled={loadingUpload} title="Refresh">
          🔄
        </button>
      </div>
      
      {#if uploadError}
        <div class="alert alert-error">
          ⚠️ {uploadError}
        </div>
      {/if}

      {#if uploadSuccess}
        <div class="alert alert-success">
          {uploadSuccess}
        </div>
      {/if}

      <!-- Upload Form -->
      <div class="upload-form">
        <h4>Upload from Google Drive / Dropbox</h4>
        <p class="upload-instructions-text">
          Share your LoRA file via Google Drive or Dropbox and paste the link below.
          The file will be downloaded and uploaded to RunPod S3.
        </p>
        
        <div class="form-grid-upload">
          <div class="form-group">
            <label for="upload-url">File URL (Google Drive / Dropbox) *</label>
            <input
              id="upload-url"
              type="text"
              bind:value={uploadFileUrl}
              placeholder="https://drive.google.com/file/d/..."
              disabled={uploading}
            />
            <small class="help-text">Make sure the link is publicly accessible</small>
          </div>
          
          <div class="form-group">
            <label for="upload-name">File Name *</label>
            <input
              id="upload-name"
              type="text"
              bind:value={uploadFileName}
              placeholder="my-lora-model.safetensors"
              disabled={uploading}
            />
            <small class="help-text">Must end with .safetensors</small>
          </div>
        </div>
        
        <button 
          class="btn btn-primary" 
          on:click={handleUploadFromUrl}
          disabled={uploading || !uploadFileUrl || !uploadFileName}
        >
          {uploading ? '⏳ Uploading...' : '📤 Upload to RunPod S3'}
        </button>
      </div>

      <!-- Remote Files List -->
      <div class="upload-panel">
        <h4>☁️ Files in RunPod S3 ({remoteFiles.length})</h4>
        {#if loadingUpload}
          <div class="loading-state">
            ⏳ Loading...
          </div>
        {:else if remoteFiles.length === 0}
          <p class="empty-state">No files in S3</p>
        {:else}
          <div class="file-list">
            {#each remoteFiles as file}
              <div class="file-item">
                <div class="file-info">
                  <div class="file-name">{file.name}</div>
                  <div class="file-size">{file.sizeFormatted}</div>
                </div>
                <span class="file-status">✅ Uploaded</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="filters-bar">
    <div class="filter-group">
      <label>Filter by Type:</label>
      <div class="filter-buttons">
        <button
          class="filter-btn"
          class:active={filterType === 'all'}
          on:click={() => filterType = 'all'}
        >
          All ({loras.length})
        </button>
        <button
          class="filter-btn"
          class:active={filterType === 'sdxl'}
          on:click={() => filterType = 'sdxl'}
        >
          SDXL ({loras.filter(l => l.type === 'sdxl').length})
        </button>
        <button
          class="filter-btn"
          class:active={filterType === 'flux'}
          on:click={() => filterType = 'flux'}
        >
          Flux ({loras.filter(l => l.type === 'flux').length})
        </button>
      </div>
    </div>
    
    <div class="search-group">
      <input
        type="text"
        placeholder="🔍 Search LoRAs..."
        bind:value={searchQuery}
      />
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading LoRAs...</p>
    </div>
  {:else if filteredLoras.length === 0}
    <div class="empty-state">
      <p>No LoRAs found</p>
      {#if searchQuery || filterType !== 'all'}
        <button class="btn btn-secondary" on:click={() => { searchQuery = ''; filterType = 'all'; }}>
          Clear Filters
        </button>
      {/if}
    </div>
  {:else}
    <div class="loras-grid">
      {#each filteredLoras as lora (lora.id)}
        {@const isCurrentlyEditing = !!editingLoras[lora.id]}
        <div class="lora-card">
          <div class="card-header">
            <div class="type-badge type-{lora.type}">
              {lora.type.toUpperCase()}
            </div>
            <div class="card-actions">
              {#if isCurrentlyEditing}
                <button
                  class="btn-save"
                  on:click={() => saveChanges(lora.id)}
                  disabled={savingLoras.has(lora.id)}
                  title="Save changes"
                >
                  {savingLoras.has(lora.id) ? '⏳ Saving...' : '💾 Save'}
                </button>
                <button
                  class="btn-icon"
                  on:click={() => cancelEditing(lora.id)}
                  disabled={savingLoras.has(lora.id)}
                  title="Cancel"
                >
                  ❌
                </button>
              {:else}
                <button
                  class="btn-icon"
                  on:click={() => {
                    console.log('✏️ Edit button clicked!', lora.name);
                    startEditing(lora);
                  }}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  class="btn-icon danger"
                  on:click={() => handleDeleteLora(lora.id, lora.name)}
                  title="Delete"
                >
                  🗑️
                </button>
              {/if}
            </div>
          </div>

          {#if getDisplayValue(lora, 'image')}
            <div class="lora-image">
              <img src={getDisplayValue(lora, 'image')} alt={getDisplayValue(lora, 'name')} />
            </div>
          {/if}

          <div class="lora-content">
            {#if isCurrentlyEditing}
              <div class="lora-field">
                <label>Name:</label>
                <input
                  type="text"
                  class="edit-input name-input"
                  value={getDisplayValue(lora, 'name')}
                  on:input={(e) => updateEditingField(lora.id, 'name', e.currentTarget.value)}
                  placeholder="Name"
                />
              </div>
            {:else}
              <h3>{lora.name}</h3>
            {/if}

            <div class="lora-field">
              <label>Value:</label>
              {#if isCurrentlyEditing}
                {#if remoteFiles.length > 0}
                  <select
                    class="edit-input"
                    value={getDisplayValue(lora, 'value')}
                    on:change={(e) => updateEditingField(lora.id, 'value', e.currentTarget.value)}
                  >
                    <option value={lora.value}>{lora.value} (current)</option>
                    <option disabled>─────────────</option>
                    {#each getS3FileOptions() as option}
                      <option value={option.value}>{option.label} ({option.size})</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    type="text"
                    class="edit-input"
                    value={getDisplayValue(lora, 'value')}
                    on:input={(e) => updateEditingField(lora.id, 'value', e.currentTarget.value)}
                    placeholder="Model ID"
                  />
                {/if}
              {:else}
                <code>{lora.value}</code>
              {/if}
            </div>

            <div class="lora-field">
              <label>Type:</label>
              {#if isCurrentlyEditing}
                <select
                  value={getDisplayValue(lora, 'type')}
                  on:change={(e) => updateEditingField(lora.id, 'type', e.currentTarget.value)}
                  class="edit-input"
                >
                  <option value="sdxl">SDXL</option>
                  <option value="flux">Flux</option>
                </select>
              {:else}
                <span class="type-badge-inline type-{lora.type}">{lora.type.toUpperCase()}</span>
              {/if}
            </div>

            <div class="lora-field">
              <label>Trigger:</label>
              {#if isCurrentlyEditing}
                <input
                  type="text"
                  class="edit-input"
                  value={getDisplayValue(lora, 'trigger') || ''}
                  on:input={(e) => updateEditingField(lora.id, 'trigger', e.currentTarget.value)}
                  placeholder="Trigger word"
                />
              {:else}
                <span>{lora.trigger || '—'}</span>
              {/if}
            </div>

            {#if isCurrentlyEditing || lora.description}
              <div class="lora-field full">
                <label>Description:</label>
                {#if isCurrentlyEditing}
                  <textarea
                    class="edit-input"
                    value={getDisplayValue(lora, 'description') || ''}
                    on:input={(e) => updateEditingField(lora.id, 'description', e.currentTarget.value)}
                    placeholder="Description"
                    rows="2"
                  ></textarea>
                {:else}
                  <p>{lora.description}</p>
                {/if}
              </div>
            {/if}

            {#if isCurrentlyEditing}
              <div class="lora-field full">
                <label>Image URL:</label>
                <input
                  type="text"
                  class="edit-input"
                  value={getDisplayValue(lora, 'image') || ''}
                  on:input={(e) => updateEditingField(lora.id, 'image', e.currentTarget.value)}
                  placeholder="https://..."
                />
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .loras-page {
    max-width: 1600px;
    margin: 0 auto;
    padding: 32px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 8px 0;
  }

  .subtitle {
    color: #6b7280;
    font-size: 14px;
    margin: 0;
  }

  .alert {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .new-lora-form {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 32px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .new-lora-form h3 {
    margin: 0 0 20px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
  }

  .form-group textarea {
    resize: vertical;
    font-family: inherit;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .filters-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    gap: 20px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-group label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .filter-buttons {
    display: flex;
    gap: 8px;
  }

  .filter-btn {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .filter-btn.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .search-group input {
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    min-width: 250px;
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loras-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
  }

  .lora-card {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s;
  }

  .lora-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .type-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .type-badge.type-sdxl {
    background: #dbeafe;
    color: #1e40af;
  }

  .type-badge.type-flux {
    background: #fce7f3;
    color: #9f1239;
  }

  .type-badge-inline {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    display: inline-block;
  }

  .type-badge-inline.type-sdxl {
    background: #dbeafe;
    color: #1e40af;
  }

  .type-badge-inline.type-flux {
    background: #fce7f3;
    color: #9f1239;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-save {
    padding: 6px 16px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn-save:hover {
    background: #059669;
  }

  .btn-save:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn-icon {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .btn-icon:hover {
    opacity: 1;
  }

  .btn-icon.danger:hover {
    opacity: 1;
    filter: brightness(1.2);
  }

  .btn-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lora-image {
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
    background: #f3f4f6;
  }

  .lora-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .lora-content {
    padding: 16px;
  }

  .lora-content h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .edit-input.name-input {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .lora-field {
    margin-bottom: 12px;
  }

  .lora-field.full {
    margin-bottom: 16px;
  }

  .lora-field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .lora-field code {
    background: #f3f4f6;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 13px;
    color: #1f2937;
    font-family: 'Monaco', 'Courier New', monospace;
  }

  .lora-field span,
  .lora-field p {
    font-size: 14px;
    color: #374151;
    margin: 0;
  }

  .edit-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
  }

  .edit-input.name-input {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .edit-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Upload Section Styles */
  .header-actions {
    display: flex;
    gap: 12px;
  }

  .upload-section {
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 32px;
  }

  .upload-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .upload-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #111827;
  }

  .btn-icon {
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .btn-icon:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upload-form {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .upload-form h4 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: #111827;
  }

  .upload-instructions-text {
    margin: 0 0 20px 0;
    font-size: 14px;
    color: #6b7280;
    line-height: 1.5;
  }

  .form-grid-upload {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }

  @media (min-width: 768px) {
    .form-grid-upload {
      grid-template-columns: 2fr 1fr;
    }
  }

  .help-text {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #6b7280;
  }

  .value-override {
    margin-top: 8px;
    font-size: 13px;
    font-family: 'Courier New', monospace;
    background: #f9fafb;
    border: 1px dashed #d1d5db;
  }

  .value-override:focus {
    background: white;
    border-style: solid;
    border-color: #2563eb;
  }

  .alert-success {
    background: #d1fae5;
    border: 1px solid #6ee7b7;
    color: #065f46;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .upload-panel {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 16px;
  }

  .upload-panel h4 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    gap: 12px;
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }

  .file-status {
    font-size: 13px;
    color: #059669;
    white-space: nowrap;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 13px;
    white-space: nowrap;
  }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: #6b7280;
    font-size: 14px;
  }

  .loading-state {
    text-align: center;
    padding: 32px;
    color: #6b7280;
    font-size: 14px;
  }
</style>

