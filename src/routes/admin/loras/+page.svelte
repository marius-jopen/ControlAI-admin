<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    getAllLoras, 
    createLora, 
    updateLora, 
    deleteLora, 
    type Lora,
    uploadLoraImage,
    uploadLoraFile,
    getRemoteLoraFiles,
    uploadLoraToRunPod,
    deleteLoraFromRunPod,
    type LoraFile
  } from '$lib/api/client';

  let loras: Lora[] = [];
  let filteredLoras: Lora[] = [];
  let loading = true;
  let error = '';
  let filterType: 'all' | 'sdxl' | 'flux' = 'all';
  let searchQuery = '';
  let showNewLoraForm = false;
  
  // New LoRA form
  let newLora: Omit<Lora, 'id' | 'created_at' | 'updated_at'> = {
    name: '',
    value: '',
    trigger: '',
    description: '',
    image: '',
    type: 'sdxl'
  };
  
  // LoRA file upload state
  let loraFile: File | null = null;
  let uploadingLoraFile = false;

  // RunPod S3 state
  let showRunPodSection = false;
  let remoteFiles: LoraFile[] = [];
  let loadingRemote = false;
  let uploadingToRunPod = false;
  let uploadLogs: string[] = [];
  let runPodError = '';
  let runPodSuccess = '';
  let runPodDragOver = false;
  let deletingFiles: Set<string> = new Set();
  let runPodSearchQuery = '';

  // Track editing state per LoRA
  let editingLoras: Record<string, Partial<Lora>> = {};
  let savingLoras: Set<string> = new Set();
  
  // Image upload state
  let uploadingImages: Record<string, boolean> = {}; // Track which LoRA is uploading
  let dragOverStates: Record<string, boolean> = {}; // Track drag-over states

  onMount(async () => {
    await loadLoras();
    // Pre-load RunPod S3 files for Value dropdowns
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

  // Filter RunPod files by search query
  $: filteredRemoteFiles = runPodSearchQuery
    ? remoteFiles.filter(file => 
        file.name.toLowerCase().includes(runPodSearchQuery.toLowerCase())
      )
    : remoteFiles;

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

      // Upload LoRA file if provided
      if (loraFile) {
        uploadingLoraFile = true;
        try {
          const uploadResult = await uploadLoraFile(loraFile);
          console.log('✅ LoRA file uploaded to S3:', uploadResult.url);
        } catch (e) {
          error = e instanceof Error ? e.message : 'Failed to upload LoRA file';
          uploadingLoraFile = false;
          return;
        }
        uploadingLoraFile = false;
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
      loraFile = null;
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
    const editedValue = editingLoras[lora.id]?.[field];
    const originalValue = lora[field];
    const result = editedValue ?? originalValue;
    
    // Debug logging for image field
    if (field === 'image' && editedValue) {
      console.log(`🖼️ getDisplayValue for ${lora.name}: edited=${editedValue}, original=${originalValue}, returning=${result}`);
    }
    
    return result;
  }

  function isEditing(loraId: string): boolean {
    const result = !!editingLoras[loraId];
    // console.log('🟢 isEditing check for', loraId, ':', result);
    return result;
  }

  // Upload-related functions
  // LoRA file upload handler
  async function handleLoraFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (!file) return;
    
    if (!file.name.endsWith('.safetensors')) {
      error = 'Please upload a .safetensors file';
      return;
    }
    
    loraFile = file;
    // Auto-fill the value field with filename (without extension)
    if (!newLora.value) {
      newLora.value = file.name.replace('.safetensors', '');
    }
    // Auto-fill the name field with a cleaned-up version
    if (!newLora.name) {
      newLora.name = file.name.replace('.safetensors', '').replace(/[-_]/g, ' ');
    }
  }

  // Toggle create form and load RunPod files
  async function toggleNewLoraForm() {
    showNewLoraForm = !showNewLoraForm;
    // Load RunPod files when opening the form (if not already loaded)
    if (showNewLoraForm && remoteFiles.length === 0) {
      await loadRemoteFiles();
    }
  }

  // RunPod S3 functions
  async function toggleRunPodSection() {
    showRunPodSection = !showRunPodSection;
    if (showRunPodSection && remoteFiles.length === 0) {
      await loadRemoteFiles();
    }
  }

  async function loadRemoteFiles() {
    try {
      loadingRemote = true;
      runPodError = '';
      remoteFiles = await getRemoteLoraFiles();
    } catch (e) {
      runPodError = e instanceof Error ? e.message : 'Failed to load remote files';
      console.error('Error loading remote files:', e);
    } finally {
      loadingRemote = false;
    }
  }

  async function handleRunPodDragOver(e: DragEvent) {
    e.preventDefault();
    runPodDragOver = true;
  }

  async function handleRunPodDragLeave(e: DragEvent) {
    e.preventDefault();
    runPodDragOver = false;
  }

  async function handleRunPodDrop(e: DragEvent) {
    e.preventDefault();
    runPodDragOver = false;

    const files = Array.from(e.dataTransfer?.files || []);
    const safetensorsFiles = files.filter(f => f.name.endsWith('.safetensors'));

    if (safetensorsFiles.length === 0) {
      runPodError = 'Please drop .safetensors files only';
      return;
    }

    // Upload all files
    for (const file of safetensorsFiles) {
      await uploadFileToRunPod(file);
    }
  }

  async function handleRunPodFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);

    for (const file of files) {
      if (file.name.endsWith('.safetensors')) {
        await uploadFileToRunPod(file);
      }
    }

    // Reset input
    target.value = '';
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  async function uploadFileToRunPod(file: File) {
    try {
      uploadingToRunPod = true;
      uploadLogs = [`📤 Uploading ${file.name} (${formatFileSize(file.size)})`];
      runPodError = '';
      runPodSuccess = '';

      await uploadLoraToRunPod(file, (log: string) => {
        uploadLogs = [...uploadLogs, log];
      });

      runPodSuccess = `✅ "${file.name}" uploaded successfully!`;

      // Reload remote files
      await loadRemoteFiles();

      // Clear logs and success message after 5 seconds
      setTimeout(() => {
        runPodSuccess = '';
        uploadLogs = [];
      }, 5000);

    } catch (e) {
      runPodError = e instanceof Error ? e.message : 'Failed to upload to RunPod';
      uploadLogs = [...uploadLogs, `❌ ${e instanceof Error ? e.message : 'Upload failed'}`];
      console.error('Error uploading to RunPod:', e);
    } finally {
      uploadingToRunPod = false;
    }
  }

  async function handleDeleteFromRunPod(fileName: string) {
    if (!confirm(`Delete "${fileName}" from RunPod S3? This cannot be undone.`)) {
      return;
    }

    try {
      deletingFiles.add(fileName);
      deletingFiles = deletingFiles; // Trigger reactivity
      runPodError = '';

      await deleteLoraFromRunPod(fileName);

      // Reload remote files
      await loadRemoteFiles();

      runPodSuccess = `✅ "${fileName}" deleted successfully!`;

      // Clear success message after 3 seconds
      setTimeout(() => {
        runPodSuccess = '';
      }, 3000);

    } catch (e) {
      runPodError = e instanceof Error ? e.message : 'Failed to delete file';
      console.error('Error deleting file:', e);
    } finally {
      deletingFiles.delete(fileName);
      deletingFiles = deletingFiles;
    }
  }

  // Get S3 filenames without .safetensors extension for dropdown
  function getS3FileOptions() {
    return remoteFiles.map(file => ({
      value: file.name.replace('.safetensors', ''),
      label: file.name,
      size: file.sizeFormatted
    }));
  }
  
  // Image upload handlers
  async function handleImageUpload(loraId: string | null, file: File) {
    const uploadKey = loraId || 'new';
    
    try {
      uploadingImages = { ...uploadingImages, [uploadKey]: true };
      
      // Upload to S3
      const result = await uploadLoraImage(file);
      
      // Add cache-busting timestamp to force browser to reload image
      const imageUrlWithTimestamp = `${result.url}?t=${Date.now()}`;
      
      // Update the LoRA's image URL
      if (loraId) {
        // Editing existing LoRA
        if (editingLoras[loraId]) {
          console.log('📸 Updating image for LoRA:', loraId);
          console.log('📸 Old image:', editingLoras[loraId].image);
          console.log('📸 New image:', imageUrlWithTimestamp);
          
          // Create completely new object to ensure reactivity
          const updatedLora = { ...editingLoras[loraId], image: imageUrlWithTimestamp };
          editingLoras = { ...editingLoras, [loraId]: updatedLora };
          
          console.log('📸 editingLoras updated:', editingLoras[loraId]);
        }
      } else {
        // New LoRA
        newLora.image = imageUrlWithTimestamp;
      }
      
      console.log('✅ Image uploaded:', result.url);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to upload image';
      alert(`Upload failed: ${errorMsg}`);
      console.error('Error uploading image:', e);
    } finally {
      uploadingImages = { ...uploadingImages, [uploadKey]: false };
      dragOverStates = { ...dragOverStates, [uploadKey]: false };
    }
  }
  
  function handleDragOver(event: DragEvent, loraId: string | null) {
    event.preventDefault();
    const key = loraId || 'new';
    dragOverStates = { ...dragOverStates, [key]: true };
  }
  
  function handleDragLeave(event: DragEvent, loraId: string | null) {
    event.preventDefault();
    const key = loraId || 'new';
    dragOverStates = { ...dragOverStates, [key]: false };
  }
  
  async function handleDrop(event: DragEvent, loraId: string | null) {
    event.preventDefault();
    const key = loraId || 'new';
    dragOverStates = { ...dragOverStates, [key]: false };
    
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file');
      return;
    }
    
    // Validate size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB');
      return;
    }
    
    await handleImageUpload(loraId, file);
  }
  
  function handleFileSelect(event: Event, loraId: string | null) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    handleImageUpload(loraId, file);
    
    // Reset input
    input.value = '';
  }
</script>

<div class="loras-page">
  <div class="page-header">
    <div>
      <h1>🎨 LoRA Management</h1>
      <p class="subtitle">Manage LoRA models for SDXL and Flux tools</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" on:click={toggleRunPodSection}>
        {showRunPodSection ? '📥 Hide RunPod S3' : '☁️ RunPod S3'}
      </button>
      <button class="btn btn-primary" on:click={toggleNewLoraForm}>
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
    <div class="new-lora-form-card">
      <div class="form-card-header">
        <h3>➕ Create New LoRA</h3>
        <p class="form-subtitle">Add a new LoRA model to your library</p>
      </div>

      <div class="form-card-body">
        <!-- Basic Information Section -->
        <div class="form-section">
          <h4 class="section-title">📝 Basic Information</h4>
          <div class="form-row">
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
              <label for="new-type">Type *</label>
              <select id="new-type" bind:value={newLora.type}>
                <option value="sdxl">SDXL</option>
                <option value="flux">Flux</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="new-value">Value (Model ID) *</label>
            {#if remoteFiles.length > 0}
              <div class="value-input-group">
                <select id="new-value" bind:value={newLora.value} class="value-select">
                  <option value="">-- Select from RunPod S3 --</option>
                  {#each remoteFiles as file}
                    <option value={file.name.replace('.safetensors', '')}>
                      {file.name} ({file.size})
                    </option>
                  {/each}
                </select>
                <div class="input-divider">
                  <span>or</span>
                </div>
                <input
                  type="text"
                  bind:value={newLora.value}
                  placeholder="Type custom value..."
                  class="value-input"
                />
              </div>
            {:else}
              <input
                id="new-value"
                type="text"
                bind:value={newLora.value}
                placeholder="e.g., sdxl_celine-bag-v3"
              />
            {/if}
            <p class="field-hint">💡 Select from uploaded files or enter a custom model identifier</p>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="new-trigger">Trigger Word</label>
              <input
                id="new-trigger"
                type="text"
                bind:value={newLora.trigger}
                placeholder="e.g., Celine Bag"
              />
            </div>
            
            <div class="form-group">
              <label for="new-description">Description</label>
              <input
                id="new-description"
                type="text"
                bind:value={newLora.description}
                placeholder="What does this LoRA do?"
              />
            </div>
          </div>
        </div>

        <!-- Files Section -->
        <div class="form-section">
          <h4 class="section-title">📦 Files</h4>
          <div class="form-row files-row">
            <div class="form-group file-group">
              <label for="new-lora-file">LoRA File (.safetensors)</label>
              <div class="file-upload-box">
                {#if loraFile}
                  <div class="file-selected-card">
                    <span class="file-icon">📦</span>
                    <div class="file-details">
                      <span class="file-name">{loraFile.name}</span>
                      <span class="file-size">{(loraFile.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <button 
                      type="button"
                      class="btn-remove-file"
                      on:click={() => loraFile = null}
                      title="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                {:else}
                  <label class="file-upload-button">
                    <span class="upload-icon">📁</span>
                    <span class="upload-text">Choose File</span>
                    <input 
                      id="new-lora-file"
                      type="file" 
                      accept=".safetensors" 
                      style="display: none;"
                      on:change={handleLoraFileSelect}
                    />
                  </label>
                  <p class="upload-hint">Optional - upload if not in RunPod S3</p>
                {/if}
              </div>
            </div>
            
            <div class="form-group image-group">
              <label for="new-image">Thumbnail Image</label>
              <div 
                class="image-upload-box"
                class:drag-over={dragOverStates['new']}
                class:uploading={uploadingImages['new']}
                class:has-image={newLora.image}
                on:dragover={(e) => handleDragOver(e, null)}
                on:dragleave={(e) => handleDragLeave(e, null)}
                on:drop={(e) => handleDrop(e, null)}
              >
                {#if newLora.image}
                  <div class="image-preview-card">
                    <img src={newLora.image} alt="LoRA preview" />
                    <button 
                      type="button"
                      class="btn-remove-image" 
                      on:click={() => newLora.image = ''}
                      title="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                {:else}
                  <div class="image-upload-placeholder">
                    {#if uploadingImages['new']}
                      <span class="upload-spinner">⏳</span>
                      <span class="upload-text">Uploading...</span>
                    {:else}
                      <label class="image-upload-button">
                        <span class="upload-icon">📸</span>
                        <span class="upload-text">Add Image</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          style="display: none;"
                          on:change={(e) => handleFileSelect(e, null)}
                        />
                      </label>
                      <p class="upload-hint">Drag & drop or click to upload</p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="form-card-footer">
        <button class="btn btn-secondary" on:click={toggleNewLoraForm} disabled={uploadingLoraFile}>
          Cancel
        </button>
        <button class="btn btn-primary" on:click={handleCreateLora} disabled={uploadingLoraFile}>
          {uploadingLoraFile ? '⏳ Uploading File...' : '✓ Create LoRA'}
        </button>
      </div>
    </div>
  {/if}

  {#if showRunPodSection}
    <div class="runpod-section">
      <div class="runpod-header">
        <h3>☁️ RunPod S3 Storage</h3>
        <button 
          class="btn-icon" 
          on:click={loadRemoteFiles} 
          disabled={loadingRemote} 
          title="Refresh"
        >
          {loadingRemote ? '⏳' : '🔄'}
        </button>
      </div>

      {#if runPodError}
        <div class="alert alert-error">
          ⚠️ {runPodError}
        </div>
      {/if}

      {#if runPodSuccess}
        <div class="alert alert-success">
          {runPodSuccess}
        </div>
      {/if}

      <!-- Drag & Drop Upload Zone -->
      <div 
        class="runpod-dropzone"
        class:drag-over={runPodDragOver}
        class:uploading={uploadingToRunPod}
        on:dragover={handleRunPodDragOver}
        on:dragleave={handleRunPodDragLeave}
        on:drop={handleRunPodDrop}
      >
        {#if uploadingToRunPod}
          <div class="upload-logs-container">
            <div class="logs-title">📊 Upload Progress</div>
            <div class="logs-box">
              {#each uploadLogs as log, i}
                <div class="log-entry" style="animation-delay: {i * 0.1}s">
                  {log}
                </div>
              {/each}
              {#if uploadLogs.length === 0}
                <div class="log-entry">⏳ Waiting for server...</div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="dropzone-icon-large">☁️</div>
          <p class="dropzone-title">Drag & Drop .safetensors Files Here</p>
          <p class="dropzone-subtitle">or</p>
          <label class="btn btn-primary">
            📁 Choose Files to Upload
            <input 
              type="file" 
              accept=".safetensors" 
              multiple
              style="display: none;"
              on:change={handleRunPodFileSelect}
            />
          </label>
          <small class="help-text">Upload LoRA models directly to RunPod S3</small>
        {/if}
      </div>

      <!-- Files List -->
      <div class="runpod-files">
        <div class="runpod-files-header">
          <h4>📦 Files in RunPod S3 ({remoteFiles.length})</h4>
          
          {#if remoteFiles.length > 0}
            <div class="search-box">
              <input 
                type="text" 
                placeholder="🔍 Search files..." 
                bind:value={runPodSearchQuery}
                class="search-input"
              />
              {#if runPodSearchQuery}
                <button 
                  class="btn-clear-search" 
                  on:click={() => runPodSearchQuery = ''}
                  title="Clear search"
                >
                  ✕
                </button>
              {/if}
            </div>
          {/if}
        </div>

        {#if loadingRemote}
          <div class="loading-state">
            ⏳ Loading files...
          </div>
        {:else if remoteFiles.length === 0}
          <p class="empty-state">No files found in RunPod S3</p>
        {:else if filteredRemoteFiles.length === 0}
          <p class="empty-state">No files match your search "{runPodSearchQuery}"</p>
        {:else}
          <div class="file-list">
            {#each filteredRemoteFiles as file}
              <div class="file-item">
                <div class="file-info">
                  <span class="file-icon">📦</span>
                  <div class="file-details">
                    <div class="file-name">{file.name}</div>
                    <div class="file-size">{file.sizeFormatted}</div>
                  </div>
                </div>
                <button 
                  class="btn-delete"
                  on:click={() => handleDeleteFromRunPod(file.name)}
                  disabled={deletingFiles.has(file.name)}
                  title="Delete file"
                >
                  {deletingFiles.has(file.name) ? '⏳' : '🗑️'}
                </button>
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

          {#key editingLoras[lora.id]?.image || lora.image}
            {@const currentImage = getDisplayValue(lora, 'image')}
            {@const isCurrentlyEditing = !!editingLoras[lora.id]}
            {#if currentImage}
              <div 
                class="lora-image" 
                class:uploading={uploadingImages[lora.id]}
                class:editable={isCurrentlyEditing}
                on:dragover={(e) => isCurrentlyEditing && handleDragOver(e, lora.id)}
                on:dragleave={(e) => isCurrentlyEditing && handleDragLeave(e, lora.id)}
                on:drop={(e) => isCurrentlyEditing && handleDrop(e, lora.id)}
              >
                {#if uploadingImages[lora.id]}
                  <div class="upload-overlay">⏳ Uploading...</div>
                {:else if isCurrentlyEditing}
                  <div class="image-edit-overlay">
                    <label class="btn-replace-image">
                      📸 Replace Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        style="display: none;"
                        on:change={(e) => handleFileSelect(e, lora.id)}
                      />
                    </label>
                  </div>
                {/if}
                <img src={currentImage} alt={getDisplayValue(lora, 'name')} />
              </div>
            {/if}
          {/key}

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

  .alert-success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
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

  /* Enhanced Form Card Styles */
  .new-lora-form-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin-bottom: 32px;
    overflow: hidden;
  }

  .form-card-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 24px;
  }

  .form-card-header h3 {
    margin: 0 0 8px 0;
    font-size: 22px;
    font-weight: 600;
  }

  .form-subtitle {
    margin: 0;
    font-size: 14px;
    opacity: 0.9;
  }

  .form-card-body {
    padding: 32px;
  }

  .form-section {
    margin-bottom: 32px;
  }

  .form-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  }

  .field-hint {
    margin: 6px 0 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  /* Value Input Group */
  .value-input-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .value-select {
    padding: 10px 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    transition: border-color 0.2s;
  }

  .value-select:focus {
    border-color: #667eea;
    outline: none;
  }

  .input-divider {
    text-align: center;
    position: relative;
  }

  .input-divider::before,
  .input-divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #e5e7eb;
  }

  .input-divider::before {
    left: 0;
  }

  .input-divider::after {
    right: 0;
  }

  .input-divider span {
    background: white;
    padding: 0 12px;
    font-size: 12px;
    color: #9ca3af;
    font-weight: 500;
  }

  .value-input {
    padding: 10px 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .value-input:focus {
    border-color: #667eea;
    outline: none;
  }

  /* File Upload Styles */
  .files-row {
    gap: 24px;
  }

  .file-group,
  .image-group {
    flex: 1;
  }

  .file-upload-box {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-selected-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
  }

  .file-icon {
    font-size: 32px;
  }

  .file-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-name {
    font-weight: 500;
    color: #1f2937;
    font-size: 14px;
  }

  .file-size {
    font-size: 12px;
    color: #6b7280;
  }

  .btn-remove-file {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .btn-remove-file:hover {
    background: #dc2626;
  }

  .file-upload-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: #f9fafb;
  }

  .file-upload-button:hover {
    border-color: #667eea;
    background: #f3f4f6;
  }

  .upload-icon {
    font-size: 32px;
  }

  .upload-text {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .upload-hint {
    margin: 8px 0 0 0;
    font-size: 12px;
    color: #6b7280;
    text-align: center;
  }

  /* Image Upload Styles */
  .image-upload-box {
    min-height: 160px;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
    transition: all 0.2s;
    position: relative;
  }

  .image-upload-box.drag-over {
    border-color: #667eea;
    background: #eef2ff;
  }

  .image-upload-box.has-image {
    border-style: solid;
    border-color: #e5e7eb;
  }

  .image-preview-card {
    width: 100%;
    height: 160px;
    position: relative;
  }

  .image-preview-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 6px;
  }

  .btn-remove-image {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .btn-remove-image:hover {
    background: rgba(220, 38, 38, 1);
  }

  .image-upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
  }

  .image-upload-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 16px;
    border-radius: 8px;
    transition: background 0.2s;
  }

  .image-upload-button:hover {
    background: rgba(102, 126, 234, 0.05);
  }

  .form-card-footer {
    padding: 20px 32px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  /* Compact Form Styles */
  .form-grid-compact {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-row-full {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  /* RunPod S3 Section */
  .runpod-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 32px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .runpod-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .runpod-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .runpod-dropzone {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 40px;
    text-align: center;
    background: #f9fafb;
    transition: all 0.2s;
    margin-bottom: 24px;
  }

  .runpod-dropzone.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .runpod-dropzone.uploading {
    border-color: #10b981;
    background: #f0fdf4;
  }

  .dropzone-icon-large {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .dropzone-title {
    font-size: 16px;
    font-weight: 500;
    color: #374151;
    margin: 0 0 8px 0;
  }

  .dropzone-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 16px 0;
  }

  .upload-spinner-large {
    font-size: 24px;
    color: #10b981;
  }

  .upload-logs-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }

  .logs-title {
    font-size: 18px;
    font-weight: 600;
    color: #374151;
    text-align: center;
  }

  .logs-box {
    background: #1f2937;
    border-radius: 8px;
    padding: 16px;
    min-height: 150px;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: #f3f4f6;
  }

  .log-entry {
    padding: 4px 0;
    opacity: 0;
    animation: fadeIn 0.3s forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Scrollbar styling for logs box */
  .logs-box::-webkit-scrollbar {
    width: 8px;
  }

  .logs-box::-webkit-scrollbar-track {
    background: #111827;
    border-radius: 4px;
  }

  .logs-box::-webkit-scrollbar-thumb {
    background: #4b5563;
    border-radius: 4px;
  }

  .logs-box::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }

  .runpod-files {
    margin-top: 24px;
  }

  .runpod-files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .runpod-files h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #374151;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    max-width: 400px;
  }

  .search-input {
    width: 100%;
    padding: 8px 36px 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .btn-clear-search {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .btn-clear-search:hover {
    background: #f3f4f6;
    color: #6b7280;
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .file-item:hover {
    background: #f3f4f6;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .file-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-name {
    font-weight: 500;
    color: #1f2937;
    font-size: 14px;
  }

  .file-size {
    font-size: 12px;
    color: #6b7280;
  }

  .btn-delete {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 16px;
    transition: all 0.2s;
  }

  .btn-delete:hover {
    background: #fee2e2;
  }

  .btn-delete:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: 24px;
    color: #6b7280;
    font-size: 14px;
  }

  .file-upload-container {
    margin-top: 8px;
  }

  .file-selected {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
  }

  .file-icon {
    font-size: 20px;
  }

  .file-name {
    flex: 1;
    font-weight: 500;
    color: #1f2937;
  }

  .file-size {
    font-size: 13px;
    color: #6b7280;
  }

  .btn-remove-file {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 16px;
    line-height: 1;
    border-radius: 4px;
  }

  .btn-remove-file:hover {
    background: #fee2e2;
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
    aspect-ratio: 1/1;
    overflow: hidden;
    background: #f3f4f6;
    border-radius: 8px;
    position: relative;
  }

  .lora-image.uploading {
    opacity: 0.6;
  }

  .lora-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .lora-image {
    position: relative;
    transition: all 0.3s;
  }

  .lora-image.editable {
    cursor: pointer;
  }

  .lora-image.editable:hover .image-edit-overlay {
    opacity: 1;
  }

  .image-edit-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: 8px;
    z-index: 2;
  }

  .btn-replace-image {
    background: #3b82f6;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    display: inline-block;
  }

  .btn-replace-image:hover {
    background: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .upload-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    z-index: 3;
    font-weight: 600;
    font-size: 16px;
    z-index: 10;
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
    margin-top: 20px;
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

  /* Drag-and-drop image upload styles */
  .image-dropzone {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    transition: all 0.2s ease;
    background: #f9fafb;
    position: relative;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .image-dropzone.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .image-dropzone.uploading {
    opacity: 0.6;
    pointer-events: none;
  }

  .image-dropzone.compact {
    min-height: 120px;
    padding: 16px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .image-preview {
    position: relative;
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }

  .image-preview img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .image-preview-compact {
    position: relative;
    width: 80px;
    height: 80px;
    flex-shrink: 0;
  }

  .image-preview-compact img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .btn-remove-image {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #ef4444;
    color: white;
    border: 2px solid white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .btn-remove-image:hover {
    background: #dc2626;
  }

  .dropzone-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .dropzone-content-compact {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dropzone-icon {
    font-size: 48px;
    opacity: 0.5;
  }

  .dropzone-content p {
    margin: 0;
    color: #6b7280;
    font-size: 14px;
  }

  .dropzone-or {
    font-size: 12px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .upload-spinner {
    font-size: 24px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-xs {
    padding: 6px 12px;
    font-size: 12px;
  }
</style>

