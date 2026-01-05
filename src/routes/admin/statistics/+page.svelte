<script lang="ts">
  import { onMount } from 'svelte';
  import { getStatistics, type Statistics, type ImageStat } from '$lib/api/client';

  let statistics: Statistics | null = null;
  let loading = true;
  let error: string | null = null;
  let activeTab: 'user' | 'tool' = 'user';
  let expandedTools: Set<string> = new Set();
  let expandedUserToolRows: Set<string> = new Set();
  let imageModal: ImageStat | null = null;
  let imageModalTool: string | null = null;
  const IMAGES_PER_PAGE = 50;
  let visibleCounts: Record<string, number> = {};
  let userToolImageCounts: Record<string, number> = {};
  let toolImageCounts: Record<string, number> = {};

  onMount(async () => {
    await loadStatistics();
  });

  async function loadStatistics() {
    loading = true;
    error = null;
    try {
      statistics = await getStatistics();
      // Start with all tools closed
      if (statistics) {
        expandedTools = new Set();
        // Initialize visible counts to IMAGES_PER_PAGE
        visibleCounts = {};
        toolImageCounts = {};
        Object.keys(statistics.images_by_tool).forEach(tool => {
          visibleCounts[tool] = IMAGES_PER_PAGE;
          toolImageCounts[tool] = IMAGES_PER_PAGE;
        });
      }
    } catch (err) {
      console.error('Error loading statistics:', err);
      error = err instanceof Error ? err.message : 'Failed to load statistics';
    } finally {
      loading = false;
    }
  }

  function toggleTool(tool: string) {
    expandedTools = new Set(expandedTools); // Create new Set for reactivity
    if (expandedTools.has(tool)) {
      expandedTools.delete(tool);
    } else {
      expandedTools.add(tool);
    }
    expandedTools = new Set(expandedTools); // Trigger reactivity with new Set
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function loadMore(tool: string) {
    if (!statistics) return;
    const currentCount = visibleCounts[tool] || IMAGES_PER_PAGE;
    visibleCounts[tool] = currentCount + IMAGES_PER_PAGE;
    visibleCounts = visibleCounts; // Trigger reactivity
  }

  function getVisibleImages(tool: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    const count = visibleCounts[tool] || IMAGES_PER_PAGE;
    return images.slice(0, count);
  }

  function hasMoreImages(tool: string): boolean {
    if (!statistics) return false;
    const images = statistics.images_by_tool[tool] || [];
    const count = visibleCounts[tool] || IMAGES_PER_PAGE;
    return images.length > count;
  }

  function getUserDisplayName(image: ImageStat): string {
    return image.user_name || image.user_email;
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
  }

  function getUserToolStats(): Array<{ tool: string; user_id: string; user_email: string; user_name: string | null; count: number }> {
    if (!statistics) return [];
    
    const userToolMap: Record<string, { tool: string; user_id: string; user_email: string; user_name: string | null; count: number }> = {};
    
    Object.entries(statistics.images_by_tool).forEach(([tool, images]) => {
      images.forEach(image => {
        const key = `${tool}::${image.user_id}`;
        if (!userToolMap[key]) {
          userToolMap[key] = {
            tool,
            user_id: image.user_id,
            user_email: image.user_email,
            user_name: image.user_name,
            count: 0
          };
        }
        userToolMap[key].count++;
      });
    });
    
    return Object.values(userToolMap).sort((a, b) => b.count - a.count);
  }

  function toggleUserToolRow(tool: string, userId: string) {
    const key = `${tool}::${userId}`;
    expandedUserToolRows = new Set(expandedUserToolRows); // Create new Set for reactivity
    if (expandedUserToolRows.has(key)) {
      expandedUserToolRows.delete(key);
    } else {
      expandedUserToolRows.add(key);
      // Initialize visible count for this user-tool combination
      if (!userToolImageCounts[key]) {
        userToolImageCounts[key] = IMAGES_PER_PAGE;
      }
    }
    expandedUserToolRows = new Set(expandedUserToolRows); // Trigger reactivity with new Set
  }

  function isUserToolRowExpanded(tool: string, userId: string): boolean {
    return expandedUserToolRows.has(`${tool}::${userId}`);
  }

  function getUserToolImages(tool: string, userId: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    return images.filter(img => img.user_id === userId);
  }

  function getVisibleUserToolImages(tool: string, userId: string): ImageStat[] {
    const key = `${tool}::${userId}`;
    const allImages = getUserToolImages(tool, userId);
    const count = userToolImageCounts[key] || IMAGES_PER_PAGE;
    return allImages.slice(0, count);
  }

  function hasMoreUserToolImages(tool: string, userId: string): boolean {
    const key = `${tool}::${userId}`;
    const allImages = getUserToolImages(tool, userId);
    const count = userToolImageCounts[key] || IMAGES_PER_PAGE;
    return allImages.length > count;
  }

  function loadMoreUserToolImages(tool: string, userId: string) {
    const key = `${tool}::${userId}`;
    const currentCount = userToolImageCounts[key] || IMAGES_PER_PAGE;
    userToolImageCounts[key] = currentCount + IMAGES_PER_PAGE;
    userToolImageCounts = userToolImageCounts; // Trigger reactivity
  }

  function getVisibleToolImages(tool: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    const count = toolImageCounts[tool] || IMAGES_PER_PAGE;
    return images.slice(0, count);
  }

  function hasMoreToolImages(tool: string): boolean {
    if (!statistics) return false;
    const images = statistics.images_by_tool[tool] || [];
    const count = toolImageCounts[tool] || IMAGES_PER_PAGE;
    return images.length > count;
  }

  function loadMoreToolImages(tool: string) {
    const currentCount = toolImageCounts[tool] || IMAGES_PER_PAGE;
    toolImageCounts = { ...toolImageCounts, [tool]: currentCount + IMAGES_PER_PAGE }; // Create new object for reactivity
  }

  function openImageModal(image: ImageStat, tool: string) {
    imageModal = image;
    imageModalTool = tool;
  }

  function closeImageModal() {
    imageModal = null;
    imageModalTool = null;
  }

  function navigateToUser(userId: string, tool: string) {
    // Navigate to user page with tool filter
    window.location.href = `/admin?userId=${encodeURIComponent(userId)}&tool=${encodeURIComponent(tool)}`;
  }
</script>

<div class="statistics-page">
  <div class="page-header">
    <h1>📊 Statistics</h1>
    <button class="btn btn-secondary" on:click={loadStatistics} disabled={loading}>
      {loading ? 'Loading...' : '🔄 Refresh'}
    </button>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading statistics...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>❌ {error}</p>
      <button class="btn btn-primary" on:click={loadStatistics}>Retry</button>
    </div>
  {:else if statistics}
    <!-- Summary -->
    <div class="summary-bar">
      <div class="summary-item">
        <span class="summary-label">Total Images:</span>
        <span class="summary-value">{statistics.total_images.toLocaleString()}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Total Tools:</span>
        <span class="summary-value">{statistics.total_tools}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-container">
      <button 
        class="tab-btn" 
        class:active={activeTab === 'user'}
        on:click={() => activeTab = 'user'}
      >
        👥 User Stats
      </button>
      <button 
        class="tab-btn" 
        class:active={activeTab === 'tool'}
        on:click={() => activeTab = 'tool'}
      >
        🛠️ Tool Stats
      </button>
    </div>

    <!-- User-Tool Analysis -->
    {#if activeTab === 'user'}
    <div class="analysis-section">
      <h2>User-Tool Analysis</h2>
      <p class="analysis-description">Overview of which users create images with which tools</p>
      <div class="analysis-table-container">
        <table class="analysis-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>User</th>
              <th>Images Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each getUserToolStats() as stat}
              {@const isExpanded = isUserToolRowExpanded(stat.tool, stat.user_id)}
              <tr class="analysis-row" class:expanded={isExpanded} on:click={() => navigateToUser(stat.user_id, stat.tool)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && navigateToUser(stat.user_id, stat.tool)}>
                <td class="tool-cell">
                  <span class="tool-badge">{stat.tool}</span>
                </td>
                <td class="user-cell">
                  <div class="user-info">
                    <div class="user-name">{stat.user_name || stat.user_email}</div>
                    <div class="user-email">{stat.user_email}</div>
                  </div>
                </td>
                <td class="count-cell">
                  <span class="count-value">{stat.count.toLocaleString()}</span>
                </td>
                <td class="expand-cell">
                  <span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                </td>
              </tr>
              {#if isExpanded}
                {@const visibleImages = getVisibleUserToolImages(stat.tool, stat.user_id)}
                {@const allImages = getUserToolImages(stat.tool, stat.user_id)}
                <tr class="expanded-row">
                  <td colspan="4" class="expanded-content" on:click|stopPropagation>
                    <div class="expanded-images">
                      {#if visibleImages.length === 0}
                        <div class="empty-state">No images found</div>
                      {:else}
                        <div class="images-list-compact">
                          {#each visibleImages as image}
                            <div class="image-item">
                              <button 
                                type="button"
                                class="image-url-compact" 
                                on:click={() => copyUrl(image.image_url)} 
                                title="Click to copy URL"
                              >
                                <span class="url-text-compact">{image.image_url}</span>
                                <span class="copy-hint-compact">📋</span>
                              </button>
                              <div class="image-meta">
                                <div class="image-date-compact">{formatDate(image.created_at)}</div>
                                <div class="image-batch">{image.batch_name || 'N/A'}</div>
                                <div class="image-app">{image.app}</div>
                              </div>
                            </div>
                          {/each}
                        </div>
                        {#if hasMoreUserToolImages(stat.tool, stat.user_id)}
                          <div class="load-more-container">
                            <button class="btn btn-secondary load-more-btn" on:click|stopPropagation={() => loadMoreUserToolImages(stat.tool, stat.user_id)}>
                              Load More ({allImages.length - visibleImages.length} remaining)
                            </button>
                          </div>
                        {/if}
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {/if}

    <!-- Tool Stats Gallery -->
    {#if activeTab === 'tool'}
    <div class="tool-stats-section">
      <h2>Tool Statistics</h2>
      <p class="analysis-description">Images generated by each tool</p>
      
      <div class="tools-gallery-container">
        {#each statistics.tool_stats as { tool, count }}
          {@const isExpanded = expandedTools.has(tool)}
          <div class="tool-gallery-section">
            <button class="tool-gallery-header" on:click={() => toggleTool(tool)}>
              <div class="tool-gallery-header-left">
                <span class="tool-icon">{isExpanded ? '▼' : '▶'}</span>
                <h2 class="tool-name">{tool}</h2>
                <span class="tool-count">({count} images)</span>
              </div>
            </button>

            {#if isExpanded}
              {@const images = getVisibleToolImages(tool)}
              {@const allImages = statistics.images_by_tool[tool] || []}
              <div class="tool-gallery-content">
                {#if images.length === 0}
                  <div class="empty-state">No images found</div>
                {:else}
                  <div class="gallery-grid">
                    {#each images as image}
                      <div class="gallery-item" on:click={() => openImageModal(image, tool)} title="Click to view full size">
                        <img src={image.image_url} alt="Generated" loading="lazy" />
                        <div class="gallery-overlay">
                          <div class="gallery-info">
                            <div class="gallery-date">{formatDate(image.created_at)}</div>
                            <div class="gallery-user">{getUserDisplayName(image)}</div>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                  {#if hasMoreToolImages(tool)}
                    <div class="load-more-container">
                      <button class="btn btn-secondary load-more-btn" on:click={() => loadMoreToolImages(tool)}>
                        Load More ({allImages.length - images.length} remaining)
                      </button>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    {/if}
  {/if}
</div>

<!-- Image Modal -->
{#if imageModal}
  <div class="modal-backdrop" on:click={closeImageModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeImageModal}>×</button>
      <div class="modal-body">
        <div class="modal-image-container">
          <img src={imageModal.image_url} alt="Full size" />
        </div>
        <div class="modal-info">
        <div class="modal-info-row">
          <strong>Tool:</strong>
          <span>{imageModalTool || 'N/A'}</span>
        </div>
        <div class="modal-info-row">
          <strong>User:</strong>
          <span>{getUserDisplayName(imageModal)}</span>
        </div>
        <div class="modal-info-row">
          <strong>Email:</strong>
          <span>{imageModal.user_email}</span>
        </div>
        <div class="modal-info-row">
          <strong>Date:</strong>
          <span>{formatDate(imageModal.created_at)}</span>
        </div>
        {#if imageModal.batch_name}
          <div class="modal-info-row">
            <strong>Batch:</strong>
            <span>{imageModal.batch_name}</span>
          </div>
        {/if}
        <div class="modal-info-row">
          <strong>App:</strong>
          <span>{imageModal.app}</span>
        </div>
        <div class="modal-info-row">
          <strong>URL:</strong>
          <button 
            type="button"
            class="url-button-modal" 
            on:click={() => copyUrl(imageModal.image_url)} 
            title="Click to copy URL"
          >
            <span class="url-text-modal">{imageModal.image_url}</span>
            <span class="copy-hint">📋</span>
          </button>
        </div>
        </div>
      </div>
    </div>
  </div>
{/if}


<style>
  .statistics-page {
    padding: 24px;
    max-width: 1600px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .summary-bar {
    display: flex;
    gap: 24px;
    margin-bottom: 24px;
    padding: 16px 20px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .summary-label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .tabs-container {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    background: white;
    padding: 4px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    width: fit-content;
  }

  .tab-btn {
    padding: 10px 20px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  .tab-btn.active {
    background: #2563eb;
    color: white;
  }

  .tool-stats-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .tool-stats-section h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 8px 0;
  }

  .tools-gallery-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 20px;
  }

  .tool-gallery-section {
    background: #f9fafb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .tool-gallery-header {
    width: 100%;
    padding: 16px 20px;
    border: none;
    background: #f9fafb;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
  }

  .tool-gallery-header:hover {
    background: #f3f4f6;
  }

  .tool-gallery-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tool-gallery-content {
    padding: 20px;
    background: white;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }

  .gallery-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: #f3f4f6;
    border: 2px solid transparent;
    transition: all 0.2s;
  }

  .gallery-item:hover {
    border-color: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .gallery-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gallery-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    padding: 12px;
    color: white;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .gallery-item:hover .gallery-overlay {
    opacity: 1;
  }

  .gallery-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gallery-date {
    font-weight: 500;
  }

  .gallery-user {
    opacity: 0.9;
    font-size: 10px;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    position: relative;
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 95vw;
    max-height: 95vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .modal-body {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex: 1;
    min-height: 0;
  }

  .modal-image-container {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    max-height: 85vh;
    overflow: hidden;
  }

  .modal-image-container img {
    max-width: 100%;
    max-height: 85vh;
    height: auto;
    width: auto;
    object-fit: contain;
    border-radius: 8px;
  }

  .modal-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 30px;
    line-height: 1;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .modal-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 300px;
    max-width: 400px;
    flex-shrink: 0;
    padding: 0;
  }

  .modal-info-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .modal-info-row strong {
    min-width: 80px;
    color: #6b7280;
    font-weight: 600;
  }

  .modal-info-row span {
    color: #1f2937;
  }

  .url-button-modal {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: all;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    font-family: monospace;
    font-size: 12px;
    flex: 1;
    min-width: 0;
  }

  .url-text-modal {
    color: #2563eb;
    text-decoration: underline;
    word-break: break-all;
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 768px) {
    .modal-body {
      flex-direction: column;
    }

    .modal-image-container {
      max-height: 50vh;
    }

    .modal-image-container img {
      max-height: 50vh;
    }

    .modal-info {
      max-width: 100%;
      min-width: 0;
    }
  }

  .tools-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .tool-section {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .tool-header {
    width: 100%;
    padding: 16px 20px;
    border: none;
    background: #f9fafb;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
  }

  .tool-header:hover {
    background: #f3f4f6;
  }

  .tool-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tool-icon {
    font-size: 12px;
    color: #6b7280;
    width: 16px;
    text-align: center;
  }

  .tool-name {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .tool-count {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }

  .analysis-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .analysis-section h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 8px 0;
  }

  .analysis-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 20px 0;
  }

  .analysis-table-container,
  .images-table-container {
    overflow-x: auto;
  }

  .analysis-table,
  .images-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .analysis-table thead,
  .images-table thead {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
  }

  .analysis-table th,
  .images-table th {
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .analysis-table td,
  .images-table td {
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .analysis-row {
    cursor: pointer;
    transition: background 0.2s;
  }

  .analysis-row:hover {
    background: #f9fafb;
  }

  .analysis-row.expanded {
    background: #f3f4f6;
  }

  .expand-cell {
    width: 40px;
    text-align: center;
  }

  .expand-icon {
    font-size: 12px;
    color: #6b7280;
  }

  .expanded-row {
    background: #fafbfc;
  }

  .expanded-content {
    padding: 0 !important;
    border-top: 2px solid #e5e7eb;
  }

  .expanded-images {
    padding: 20px;
  }

  .images-list-compact {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .image-item {
    display: flex;
    gap: 16px;
    padding: 12px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    align-items: flex-start;
  }

  .image-url-compact {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: all;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    font-family: monospace;
    font-size: 12px;
    min-width: 0;
  }

  .url-text-compact {
    color: #2563eb;
    text-decoration: underline;
    word-break: break-all;
    flex: 1;
    min-width: 0;
  }

  .copy-hint-compact {
    opacity: 0;
    font-size: 12px;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .image-url-compact:hover .copy-hint-compact {
    opacity: 1;
  }

  .image-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 200px;
    flex-shrink: 0;
  }

  .image-date-compact {
    color: #1f2937;
    font-size: 13px;
    font-weight: 500;
  }

  .image-batch {
    color: #6b7280;
    font-size: 11px;
    font-family: monospace;
  }

  .image-app {
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .analysis-table tbody tr:hover,
  .images-table tbody tr:hover {
    background: #f9fafb;
  }

  .tool-images {
    padding: 12px 20px 20px;
  }

  .url-cell {
    max-width: 600px;
  }

  .url-button {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: all;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    font-family: monospace;
    font-size: 12px;
    width: 100%;
  }

  .url-text {
    color: #2563eb;
    text-decoration: underline;
    word-break: break-all;
    flex: 1;
    min-width: 0;
  }

  .copy-hint {
    opacity: 0;
    font-size: 12px;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .url-button:hover .copy-hint {
    opacity: 1;
  }

  .date-cell {
    color: #6b7280;
    font-size: 12px;
    white-space: nowrap;
  }

  .user-cell {
    min-width: 200px;
  }

  .user-info,
  .user-info-compact {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .user-name {
    font-weight: 500;
    color: #1f2937;
    font-size: 13px;
  }

  .user-email {
    font-size: 11px;
    color: #6b7280;
  }

  .user-email-small {
    font-size: 11px;
    color: #6b7280;
  }

  .tool-badge {
    display: inline-block;
    padding: 4px 12px;
    background: #eff6ff;
    color: #1e40af;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .count-cell {
    text-align: right;
  }

  .count-value {
    color: #1f2937;
    font-size: 14px;
    font-weight: 600;
  }

  .load-more-container {
    margin-top: 12px;
    text-align: center;
  }

  .load-more-btn {
    padding: 8px 16px;
    font-size: 13px;
  }

  .empty-state {
    padding: 40px;
    text-align: center;
    color: #6b7280;
  }

  .loading-state,
  .error-state {
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #1f2937;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }
</style>
