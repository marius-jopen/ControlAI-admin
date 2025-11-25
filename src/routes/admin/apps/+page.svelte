<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllApps, updateApp, createApp, deleteApp, type AppConfig, getAllLoras, type Lora, uploadLoraImage } from '$lib/api/client';

  let apps: AppConfig[] = [];
  let selectedApp: AppConfig | null = null;
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
  let showCreateModal = false;
  let showDeleteConfirm = false;
  let hasUnsavedChanges = false;
  
  // LoRAs
  let allLoras: Lora[] = [];
  let lorasLoading = false;

  // Tool image upload state
  let uploadingToolImages: Record<string, boolean> = {}; // Track which tool is uploading
  let dragOverToolStates: Record<string, boolean> = {}; // Track drag-over states

  // Form state for selected app
  let formData: any = null;

  // New app form state
  let newAppData = {
    id: '',
    name: '',
    domains: [''],
    welcome: {
      title: '',
      description: '',
      callToAction: ''
    },
    features: {
      dashboard: {
        enabled: true,
        showWelcomeMessage: true,
        showToolsGrid: true,
        showGallery: true
      },
      studio: {
        tools: {}
      }
    },
    env: {
      appName: 'VITE_APP_NAME'
    }
  };

  onMount(async () => {
    await Promise.all([loadApps(), loadLoras()]);
  });
  
  async function loadLoras() {
    try {
      lorasLoading = true;
      allLoras = await getAllLoras();
    } catch (err: any) {
      console.error('Error loading LoRAs:', err);
      // Don't block the UI if LoRAs fail to load
    } finally {
      lorasLoading = false;
    }
  }

  async function loadApps() {
    loading = true;
    error = '';
    try {
      apps = await getAllApps();
      apps.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err: any) {
      console.error('Error loading apps:', err);
      error = err.message || 'Failed to load apps';
    } finally {
      loading = false;
    }
  }

  function selectApp(app: AppConfig) {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    
    selectedApp = app;
    error = '';
    success = '';
    hasUnsavedChanges = false;
    
    // Deep clone the config for editing
    formData = {
      name: app.name,
      config: JSON.parse(JSON.stringify(app.config))
    };
  }

  async function saveChanges() {
    if (!selectedApp || !formData) return;
    
    saving = true;
    error = '';
    success = '';
    
    try {
      const updated = await updateApp(selectedApp.id, {
        name: formData.name,
        config: formData.config
      });
      
      // Update the local apps list
      apps = apps.map(a => a.id === updated.id ? updated : a);
      selectedApp = updated;
      
      // Update form data to reflect saved state
      formData = {
        name: updated.name,
        config: JSON.parse(JSON.stringify(updated.config))
      };
      
      hasUnsavedChanges = false;
      success = 'Changes saved successfully!';
      
      setTimeout(() => success = '', 3000);
    } catch (err: any) {
      console.error('Error saving app:', err);
      error = err.message || 'Failed to save changes';
    } finally {
      saving = false;
    }
  }

  async function handleCreateApp() {
    if (!newAppData.id || !newAppData.name) {
      error = 'App ID and Name are required';
      return;
    }

    saving = true;
    error = '';
    
    try {
      const created = await createApp({
        id: newAppData.id,
        name: newAppData.name,
        config: {
          domains: newAppData.domains.filter(d => d.trim() !== ''),
          welcome: newAppData.welcome,
          features: newAppData.features,
          env: newAppData.env
        }
      } as any);
      
      apps = [...apps, created].sort((a, b) => a.name.localeCompare(b.name));
      showCreateModal = false;
      resetNewAppForm();
      success = 'App created successfully!';
      setTimeout(() => success = '', 3000);
      
      // Select the newly created app
      selectApp(created);
    } catch (err: any) {
      console.error('Error creating app:', err);
      error = err.message || 'Failed to create app';
    } finally {
      saving = false;
    }
  }

  async function handleDeleteApp() {
    if (!selectedApp) return;
    
    saving = true;
    error = '';
    
    try {
      await deleteApp(selectedApp.id);
      apps = apps.filter(a => a.id !== selectedApp.id);
      showDeleteConfirm = false;
      selectedApp = null;
      formData = null;
      hasUnsavedChanges = false;
      success = 'App deleted successfully!';
      setTimeout(() => success = '', 3000);
    } catch (err: any) {
      console.error('Error deleting app:', err);
      error = err.message || 'Failed to delete app';
      showDeleteConfirm = false;
    } finally {
      saving = false;
    }
  }

  function resetNewAppForm() {
    newAppData = {
      id: '',
      name: '',
      domains: [''],
      welcome: {
        title: '',
        description: '',
        callToAction: ''
      },
      features: {
        dashboard: {
          enabled: true,
          showWelcomeMessage: true,
          showToolsGrid: true,
          showGallery: true
        },
        studio: {
          tools: {}
        }
      },
      env: {
        appName: 'VITE_APP_NAME'
      }
    };
  }

  function toggleTool(toolId: string) {
    if (!formData) return;
    hasUnsavedChanges = true;
    
    if (!formData.config.features.studio.tools[toolId]) {
      formData.config.features.studio.tools[toolId] = {
        enabled: true,
        title: toolId,
        thumbnail: ''
      };
    } else {
      formData.config.features.studio.tools[toolId].enabled = 
        !formData.config.features.studio.tools[toolId].enabled;
    }
  }

  function addDomain() {
    if (!formData) return;
    hasUnsavedChanges = true;
    formData.config.domains = [...formData.config.domains, ''];
  }

  function removeDomain(index: number) {
    if (!formData) return;
    hasUnsavedChanges = true;
    formData.config.domains = formData.config.domains.filter((_: any, i: number) => i !== index);
  }

  // Tool image upload handlers
  function handleToolDragOver(e: DragEvent, toolId: string) {
    e.preventDefault();
    dragOverToolStates = { ...dragOverToolStates, [toolId]: true };
  }

  function handleToolDragLeave(e: DragEvent, toolId: string) {
    e.preventDefault();
    dragOverToolStates = { ...dragOverToolStates, [toolId]: false };
  }

  async function handleToolDrop(e: DragEvent, toolId: string) {
    e.preventDefault();
    dragOverToolStates = { ...dragOverToolStates, [toolId]: false };

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error = 'Please upload an image file';
      return;
    }

    await uploadToolImage(toolId, file);
  }

  async function handleToolFileSelect(e: Event, toolId: string) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    await uploadToolImage(toolId, file);

    // Reset input
    target.value = '';
  }

  async function uploadToolImage(toolId: string, file: File) {
    if (!formData) return;

    try {
      uploadingToolImages = { ...uploadingToolImages, [toolId]: true };
      error = '';

      // Upload to S3
      const result = await uploadLoraImage(file);

      // Add cache-busting timestamp
      const imageUrlWithTimestamp = `${result.url}?t=${Date.now()}`;

      // Update the tool's thumbnail URL
      if (!formData.config.features.studio.tools[toolId]) {
        formData.config.features.studio.tools[toolId] = {
          enabled: true,
          title: toolId,
          thumbnail: imageUrlWithTimestamp
        };
      } else {
        formData.config.features.studio.tools[toolId].thumbnail = imageUrlWithTimestamp;
      }

      // Trigger reactivity
      formData = { ...formData };
      hasUnsavedChanges = true;

      console.log('✅ Tool image uploaded successfully');

    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to upload image';
      console.error('Error uploading tool image:', e);
    } finally {
      uploadingToolImages = { ...uploadingToolImages, [toolId]: false };
    }
  }

  function addNewAppDomain() {
    newAppData.domains = [...newAppData.domains, ''];
  }

  function removeNewAppDomain(index: number) {
    newAppData.domains = newAppData.domains.filter((_, i) => i !== index);
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

  function markChanged() {
    hasUnsavedChanges = true;
  }

  // Available tools list
  const AVAILABLE_TOOLS: Array<{id: string, name: string, loraType: 'flux' | 'sdxl' | null}> = [
    { id: 'flux-basic', name: 'Flux Basic', loraType: 'flux' },
    { id: 'sdxl-basic', name: 'SDXL Basic', loraType: 'sdxl' },
    { id: 'open-image', name: 'OpenAI Image', loraType: null },
    { id: 'g-image', name: 'Google Image', loraType: null },
    { id: 'g-image-3', name: 'Google Image 3 Pro 🍌', loraType: null },
    { id: 'sdxl-i2i', name: 'SDXL Image-to-Image', loraType: 'sdxl' },
    { id: 'open-inpaint', name: 'OpenAI Inpaint', loraType: null },
    { id: 'deforum-basic', name: 'Deforum Basic', loraType: 'sdxl' },
    { id: 'latent-shift', name: 'Latent Shift', loraType: 'sdxl' },
    { id: 'latent-scroll', name: 'Latent Scroll', loraType: 'sdxl' }
  ];
  
  // Get available LoRAs for a specific tool
  function getLorasForTool(toolId: string): Lora[] {
    const toolDef = AVAILABLE_TOOLS.find(t => t.id === toolId);
    if (!toolDef || !toolDef.loraType) return [];
    return allLoras.filter(lora => lora.type === toolDef.loraType);
  }
  
  // Toggle LoRA for a tool
  function toggleLoraForTool(toolId: string, loraId: string) {
    const tool = formData.config.features.studio.tools[toolId];
    if (!tool) return;
    
    // Initialize loras array if it doesn't exist
    if (!tool.loras) {
      tool.loras = [];
    }
    
    // Toggle the LoRA
    const index = tool.loras.indexOf(loraId);
    if (index > -1) {
      tool.loras.splice(index, 1);
    } else {
      tool.loras.push(loraId);
    }
    
    formData = formData; // Trigger reactivity
    markChanged();
  }
  
  // Check if a LoRA is enabled for a tool
  function isLoraEnabledForTool(toolId: string, loraId: string): boolean {
    const tool = formData.config.features.studio.tools[toolId];
    return tool?.loras?.includes(loraId) || false;
  }
</script>

<div class="apps-management">
  <!-- Left Sidebar - Apps List -->
  <div class="apps-sidebar">
    <div class="sidebar-header">
      <h2>Applications ({apps.length})</h2>
      <button class="btn btn-primary btn-sm" on:click={() => showCreateModal = true}>
        + New App
      </button>
    </div>

    <div class="apps-list">
      {#if loading}
        <div class="loading-state">
          <div class="loading-spinner-small"></div>
          <p>Loading apps...</p>
        </div>
      {:else if apps.length === 0}
        <div class="empty-state">
          <p>No apps found</p>
        </div>
      {:else}
        {#each apps as app}
          <button
            class="app-item"
            class:active={selectedApp?.id === app.id}
            on:click={() => selectApp(app)}
          >
            <div class="app-icon">
              {app.name[0]}
            </div>
            <div class="app-info">
              <div class="app-name">{app.name}</div>
              <div class="app-meta">
                <span class="app-id">{app.id}</span>
              </div>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Right Panel - App Details -->
  <div class="app-details-panel">
    {#if error}
      <div class="alert alert-error">
        <span class="alert-icon">⚠️</span>
        <span>{error}</span>
        <button class="alert-close" on:click={() => error = ''}>×</button>
      </div>
    {/if}

    {#if success}
      <div class="alert alert-success">
        <span class="alert-icon">✓</span>
        <span>{success}</span>
        <button class="alert-close" on:click={() => success = ''}>×</button>
      </div>
    {/if}

    {#if !selectedApp}
      <div class="empty-state-large">
        <div class="empty-icon">📱</div>
        <h3>Select an app</h3>
        <p>Choose an app from the list to view and edit its configuration</p>
      </div>
    {:else}
      <div class="details-content">
        <div class="details-header">
          <div>
            <h2>{formData.name}</h2>
            <p class="app-id-label">ID: {selectedApp.id}</p>
            <p class="app-dates">
              Created: {formatDate(selectedApp.created_at)} • 
              Updated: {formatDate(selectedApp.updated_at)}
            </p>
          </div>
          <div class="header-actions">
            <button 
              class="btn btn-danger" 
              on:click={() => showDeleteConfirm = true}
              disabled={saving}
            >
              Delete App
            </button>
            <button 
              class="btn btn-primary" 
              on:click={saveChanges} 
              disabled={saving || !hasUnsavedChanges}
              class:pulse={hasUnsavedChanges}
            >
              {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes *' : 'Saved'}
            </button>
          </div>
        </div>

        <!-- Basic Info -->
        <section class="details-section">
          <h3>📝 Basic Information</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>App Name</label>
              <input 
                type="text" 
                class="input" 
                bind:value={formData.name}
                on:input={markChanged}
                placeholder="App Name"
              />
            </div>
          </div>
        </section>

        <!-- Domains -->
        <section class="details-section">
          <h3>🌐 Domains</h3>
          <div class="domains-section">
            {#each formData.config.domains as domain, i}
              <div class="domain-input-row">
                <input 
                  type="text" 
                  class="input" 
                  bind:value={formData.config.domains[i]}
                  on:input={markChanged}
                  placeholder="example.com"
                />
                <button 
                  class="btn btn-icon btn-danger-sm" 
                  on:click={() => removeDomain(i)}
                  title="Remove domain"
                >
                  🗑️
                </button>
              </div>
            {/each}
            <button class="btn btn-secondary btn-sm" on:click={addDomain}>
              + Add Domain
            </button>
          </div>
        </section>

        <!-- Welcome Message -->
        <section class="details-section">
          <h3>👋 Welcome Message</h3>
          <div class="form-grid">
            <div class="form-group full-width">
              <label>Title</label>
              <input 
                type="text" 
                class="input" 
                bind:value={formData.config.welcome.title}
                on:input={markChanged}
                placeholder="Welcome Title"
              />
            </div>
            <div class="form-group full-width">
              <label>Description</label>
              <textarea 
                class="textarea" 
                bind:value={formData.config.welcome.description}
                on:input={markChanged}
                placeholder="Welcome description"
                rows="3"
              ></textarea>
            </div>
            <div class="form-group full-width">
              <label>Call to Action</label>
              <input 
                type="text" 
                class="input" 
                bind:value={formData.config.welcome.callToAction}
                on:input={markChanged}
                placeholder="Call to action text"
              />
            </div>
          </div>
        </section>

        <!-- Studio Tools -->
        <section class="details-section">
          <h3>🛠️ Studio Tools</h3>
          <p class="section-description">Configure which tools are available in this app</p>
          
          <div class="tools-list">
            {#each AVAILABLE_TOOLS as toolDef}
              {@const tool = formData.config.features.studio.tools[toolDef.id]}
              {@const isEnabled = tool?.enabled || false}
              
              <div class="tool-row" class:enabled={isEnabled}>
                <div class="tool-header">
                  <div class="tool-toggle-section">
                    <input 
                      type="checkbox" 
                      checked={isEnabled}
                      on:change={() => toggleTool(toolDef.id)}
                      class="tool-checkbox"
                    />
                    {#if tool?.thumbnail}
                      <div 
                        class="tool-thumbnail editable"
                        class:drag-over={dragOverToolStates[toolDef.id]}
                        class:uploading={uploadingToolImages[toolDef.id]}
                        on:dragover={(e) => handleToolDragOver(e, toolDef.id)}
                        on:dragleave={(e) => handleToolDragLeave(e, toolDef.id)}
                        on:drop={(e) => handleToolDrop(e, toolDef.id)}
                      >
                        {#if uploadingToolImages[toolDef.id]}
                          <div class="tool-upload-overlay">⏳ Uploading...</div>
                        {:else}
                          <div class="tool-image-edit-overlay">
                            <label class="btn-replace-tool-image">
                              📸 Replace
                              <input 
                                type="file" 
                                accept="image/*" 
                                style="display: none;"
                                on:change={(e) => handleToolFileSelect(e, toolDef.id)}
                              />
                            </label>
                          </div>
                        {/if}
                        <img src={tool.thumbnail} alt={toolDef.name} />
                      </div>
                    {:else}
                      <div 
                        class="tool-thumbnail tool-thumbnail-placeholder editable"
                        class:drag-over={dragOverToolStates[toolDef.id]}
                        class:uploading={uploadingToolImages[toolDef.id]}
                        on:dragover={(e) => handleToolDragOver(e, toolDef.id)}
                        on:dragleave={(e) => handleToolDragLeave(e, toolDef.id)}
                        on:drop={(e) => handleToolDrop(e, toolDef.id)}
                      >
                        {#if uploadingToolImages[toolDef.id]}
                          <div class="tool-upload-overlay">⏳ Uploading...</div>
                        {:else}
                          <div class="tool-image-edit-overlay">
                            <label class="btn-replace-tool-image">
                              📸 Add Image
                              <input 
                                type="file" 
                                accept="image/*" 
                                style="display: none;"
                                on:change={(e) => handleToolFileSelect(e, toolDef.id)}
                              />
                            </label>
                          </div>
                          <span>🔧</span>
                        {/if}
                      </div>
                    {/if}
                    <div class="tool-info">
                      <span class="tool-name">{toolDef.name}</span>
                      <span class="tool-id">{toolDef.id}</span>
                    </div>
                  </div>
                </div>
                
                {#if isEnabled && tool}
                  <div class="tool-settings">
                    <div class="tool-settings-grid">
                      <div class="tool-setting">
                        <label>Display Title</label>
                        <input 
                          type="text" 
                          class="input input-sm" 
                          bind:value={tool.title}
                          on:input={markChanged}
                          placeholder="Tool display name"
                        />
                      </div>
                      <div class="tool-setting">
                        <label>Thumbnail URL</label>
                        <input 
                          type="text" 
                          class="input input-sm" 
                          bind:value={tool.thumbnail}
                          on:input={markChanged}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    
                    <div class="tool-settings-options">
                      <label class="checkbox-label">
                        <input 
                          type="checkbox" 
                          bind:checked={tool.initImage}
                          on:change={markChanged}
                        />
                        <span>Requires Initial Image (tool accepts an input image)</span>
                      </label>
                    </div>
                  </div>
                  
                  <!-- LoRA Selection -->
                  {#if toolDef.loraType}
                    {@const availableLoras = getLorasForTool(toolDef.id)}
                    {#if availableLoras.length > 0}
                      <div class="tool-setting-loras">
                        <label>LoRA Models ({(toolDef.loraType || '').toUpperCase()})</label>
                        <div class="loras-grid">
                          {#each availableLoras as lora}
                            {@const isSelected = isLoraEnabledForTool(toolDef.id, lora.id)}
                            <label class="lora-checkbox" class:selected={isSelected}>
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                on:change={() => toggleLoraForTool(toolDef.id, lora.id)}
                              />
                              <div class="lora-info">
                                {#if lora.image}
                                  <img src={lora.image} alt={lora.name} class="lora-thumb" />
                                {/if}
                                <div class="lora-text">
                                  <span class="lora-name">{lora.name}</span>
                                  {#if lora.trigger}
                                    <span class="lora-trigger">{lora.trigger}</span>
                                  {/if}
                                </div>
                              </div>
                            </label>
                          {/each}
                        </div>
                      </div>
                    {:else}
                      <div class="tool-setting-loras">
                        <label>LoRA Models ({(toolDef.loraType || '').toUpperCase()})</label>
                        <p class="loras-empty">
                          No {(toolDef.loraType || '').toUpperCase()} LoRAs available. 
                          <a href="/admin/loras" target="_blank">Add LoRAs</a>
                        </p>
                      </div>
                    {/if}
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>

<!-- Create App Modal -->
{#if showCreateModal}
  <div class="modal-backdrop" on:click={() => showCreateModal = false}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Create New App</h3>
        <button class="modal-close" on:click={() => showCreateModal = false}>×</button>
      </div>
      
      <div class="modal-body">
        <div class="form-group">
          <label>App ID <span class="required">*</span></label>
          <input 
            type="text" 
            class="input" 
            bind:value={newAppData.id}
            placeholder="app-id (lowercase, no spaces)"
            pattern="[a-z0-9-]+"
          />
          <small>Used as unique identifier (e.g., "limn", "celine")</small>
        </div>
        
        <div class="form-group">
          <label>App Name <span class="required">*</span></label>
          <input 
            type="text" 
            class="input" 
            bind:value={newAppData.name}
            placeholder="Display name"
          />
        </div>
        
        <div class="form-group">
          <label>Domains</label>
          {#each newAppData.domains as domain, i}
            <div class="domain-input-row">
              <input 
                type="text" 
                class="input" 
                bind:value={newAppData.domains[i]}
                placeholder="example.com"
              />
              <button 
                class="btn btn-icon btn-danger-sm" 
                on:click={() => removeNewAppDomain(i)}
              >
                🗑️
              </button>
            </div>
          {/each}
          <button class="btn btn-secondary btn-sm" on:click={addNewAppDomain}>
            + Add Domain
          </button>
        </div>
      </div>
      
      <div class="modal-footer">
        <button 
          class="btn btn-secondary" 
          on:click={() => showCreateModal = false}
          disabled={saving}
        >
          Cancel
        </button>
        <button 
          class="btn btn-primary" 
          on:click={handleCreateApp}
          disabled={saving || !newAppData.id || !newAppData.name}
        >
          {saving ? 'Creating...' : 'Create App'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="modal-backdrop" on:click={() => showDeleteConfirm = false}>
    <div class="modal-content modal-sm" on:click|stopPropagation>
      <div class="modal-header">
        <h3>⚠️ Delete App</h3>
        <button class="modal-close" on:click={() => showDeleteConfirm = false}>×</button>
      </div>
      
      <div class="modal-body">
        <p>Are you sure you want to delete <strong>{selectedApp?.name}</strong>?</p>
        <p class="warning-text">This action cannot be undone!</p>
      </div>
      
      <div class="modal-footer">
        <button 
          class="btn btn-secondary" 
          on:click={() => showDeleteConfirm = false}
          disabled={saving}
        >
          Cancel
        </button>
        <button 
          class="btn btn-danger" 
          on:click={handleDeleteApp}
          disabled={saving}
        >
          {saving ? 'Deleting...' : 'Delete App'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .apps-management {
    display: flex;
    height: calc(100vh - 73px);
    overflow: hidden;
  }

  /* Apps Sidebar */
  .apps-sidebar {
    width: 300px;
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sidebar-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .apps-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .app-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: none;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: background 0.2s;
    text-align: left;
  }

  .app-item:hover {
    background: #f9fafb;
  }

  .app-item.active {
    background: #eff6ff;
    border: 1px solid #3b82f6;
  }

  .app-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 18px;
    flex-shrink: 0;
  }

  .app-info {
    flex: 1;
    min-width: 0;
  }

  .app-name {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-meta {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .app-id {
    font-family: monospace;
  }

  /* App Details Panel */
  .app-details-panel {
    flex: 1;
    overflow-y: auto;
    background: #f9fafb;
    position: relative;
  }

  .alert {
    position: sticky;
    top: 0;
    z-index: 50;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
    border-bottom: 2px solid #f87171;
  }

  .alert-success {
    background: #d1fae5;
    color: #065f46;
    border-bottom: 2px solid #34d399;
  }

  .alert-icon {
    font-size: 18px;
  }

  .alert-close {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .alert-close:hover {
    opacity: 1;
  }

  .details-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e5e7eb;
  }

  .details-header h2 {
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .app-id-label {
    font-size: 13px;
    color: #6b7280;
    font-family: monospace;
    margin-bottom: 4px;
  }

  .app-dates {
    font-size: 12px;
    color: #9ca3af;
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .btn.pulse {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
  }

  .details-section {
    background: white;
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .details-section h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
    color: #1f2937;
  }

  .section-description {
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 24px;
  }

  /* Form styles */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .form-group small {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .required {
    color: #dc2626;
  }

  /* Domains section */
  .domains-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .domain-input-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .domain-input-row .input {
    flex: 1;
  }

  .btn-icon {
    padding: 8px 12px;
    min-width: auto;
  }

  /* Tools section */
  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tool-row {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #f9fafb;
    transition: all 0.2s;
  }

  .tool-row.enabled {
    background: white;
    border-color: #3b82f6;
    box-shadow: 0 1px 3px rgba(59, 130, 246, 0.1);
  }

  .tool-header {
    padding: 16px 20px;
  }

  .tool-toggle-section {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .tool-checkbox {
    width: 20px;
    height: 20px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tool-thumbnail {
    width: 120px;
    height: 120px;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
  }

  .tool-thumbnail.editable {
    cursor: pointer;
  }

  .tool-thumbnail.editable:hover .tool-image-edit-overlay {
    opacity: 1;
  }

  .tool-thumbnail.drag-over {
    border: 2px solid #3b82f6;
    background: #eff6ff;
  }

  .tool-thumbnail.uploading {
    opacity: 0.6;
  }

  .tool-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tool-thumbnail-placeholder {
    font-size: 48px;
  }

  .tool-image-edit-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: 8px;
    z-index: 2;
  }

  .btn-replace-tool-image {
    background: #3b82f6;
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: inline-block;
    text-align: center;
  }

  .btn-replace-tool-image:hover {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .tool-upload-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    z-index: 3;
    font-weight: 600;
    font-size: 12px;
    border-radius: 8px;
  }

  .tool-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .tool-name {
    font-size: 15px;
    font-weight: 500;
    color: #1f2937;
    flex: 1;
  }

  .tool-id {
    font-size: 12px;
    font-family: monospace;
    color: #6b7280;
    padding: 2px 8px;
    background: #f3f4f6;
    border-radius: 4px;
  }

  .tool-settings {
    border-top: 1px solid #e5e7eb;
    background: #fafbfc;
  }

  .tool-settings-grid {
    padding: 20px 20px 0 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: end;
  }

  .tool-settings-options {
    padding: 16px 20px;
    display: flex;
    gap: 20px;
  }

  .tool-setting {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tool-setting label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #374151;
    padding: 0;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .checkbox-label span {
    user-select: none;
  }

  /* LoRA Selection Styles */
  .tool-setting-loras {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .tool-setting-loras > label {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .loras-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .lora-checkbox {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }

  .lora-checkbox:hover {
    border-color: #d1d5db;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .lora-checkbox.selected {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .lora-checkbox input[type="checkbox"] {
    margin-top: 2px;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .lora-info {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    flex: 1;
    min-width: 0;
  }

  .lora-thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
    background: #f3f4f6;
  }

  .lora-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .lora-name {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.2;
  }

  .lora-trigger {
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
    line-height: 1.2;
  }

  .loras-empty {
    font-size: 13px;
    color: #6b7280;
    padding: 12px;
    background: white;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    text-align: center;
  }

  .loras-empty a {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 500;
  }

  .loras-empty a:hover {
    text-decoration: underline;
  }

  /* Modal styles */
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
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .modal-content.modal-sm {
    max-width: 400px;
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
    font-size: 28px;
    color: #6b7280;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .modal-close:hover {
    background: #f3f4f6;
  }

  .modal-body {
    padding: 24px;
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .warning-text {
    color: #dc2626;
    font-weight: 500;
    margin-top: 8px;
  }

  /* Loading & Empty States */
  .loading-state,
  .empty-state {
    padding: 40px;
    text-align: center;
    color: #6b7280;
  }

  .loading-spinner-small {
    width: 24px;
    height: 24px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
  }

  .empty-state-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 60px 20px;
    color: #6b7280;
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state-large h3 {
    font-size: 20px;
    color: #1f2937;
    margin-bottom: 8px;
  }

  .empty-state-large p {
    font-size: 14px;
    max-width: 400px;
    text-align: center;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
