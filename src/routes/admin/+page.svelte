<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getAllUsers, getUserDetails, getUserImages, getUserTransactions, AVAILABLE_APPS, type User, type UserDetails, type ImageResource, type CreditTransaction } from '$lib/api/client';

  let users: User[] = [];
  let selectedUser: User | null = null;
  let userDetails: UserDetails | null = null;
  let userImages: ImageResource[] = [];
  let userTransactions: CreditTransaction[] = [];
  let loadingTransactions = false;
  let selectedApp: string = 'all';
  let selectedTool: string = 'all';
  let availableTools: string[] = [];
  let loading = true;
  let loadingDetails = false;
  let loadingImages = false;
  let loadingMore = false;
  let hasMoreImages = false;
  let imageOffset = 0;
  let searchQuery = '';
  let imageModal: ImageResource | null = null;
  let allUserImages: ImageResource[] = []; // Store all images for app analysis

  $: filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    // Search by ID, email, full name
    const matchesId = user.id.toLowerCase().includes(query);
    const matchesEmail = user.email?.toLowerCase().includes(query);
    const matchesName = user.full_name?.toLowerCase().includes(query);
    
    // Also search by email domain (e.g., "@company.com")
    const emailDomain = user.email?.split('@')[1]?.toLowerCase();
    const matchesDomain = emailDomain?.includes(query);
    
    return matchesId || matchesEmail || matchesName || matchesDomain;
  });

  onMount(async () => {
    await loadUsers();
    
    // Check for URL parameters
    const userId = $page.url.searchParams.get('userId');
    const tool = $page.url.searchParams.get('tool');
    
    if (userId) {
      const user = users.find(u => u.id === userId);
      if (user) {
        await selectUser(user);
        // If tool is specified, filter by it
        if (tool) {
          selectedTool = tool;
          await loadImages(user.id, selectedApp, tool, false);
        }
      }
    }
  });

  async function loadUsers() {
    loading = true;
    try {
      const data = await getAllUsers();
      users = data;
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      loading = false;
    }
  }

  async function selectUser(user: User) {
    selectedUser = user;
    loadingDetails = true;
    loadingImages = true;
    loadingTransactions = true;
    selectedApp = 'all';
    selectedTool = 'all';
    imageOffset = 0;
    userTransactions = [];

    try {
      // Load user details
      const details = await getUserDetails(user.id);
      userDetails = details;
      
      // Load ALL images first to get all available tools and analyze app usage
      const allImagesResult = await getUserImages(user.id, { limit: 1000 });
      allUserImages = allImagesResult.images;
      availableTools = [...new Set(allUserImages.map(img => img.tool))].sort();
      
      // Then load images with current filters
      await loadImages(user.id, 'all', 'all', false);

      // Load credit transactions
      try {
        const txResult = await getUserTransactions(user.id, { limit: 50 });
        userTransactions = txResult.transactions;
      } catch (txErr) {
        console.error('Error loading transactions:', txErr);
        userTransactions = [];
      }
    } catch (error) {
      console.error('Error loading user details:', error);
    } finally {
      loadingDetails = false;
      loadingTransactions = false;
    }
  }

  async function loadImages(userId: string, app: string, tool: string, append: boolean = false) {
    if (!userId) return;
    
    if (append) {
      loadingMore = true;
    } else {
      loadingImages = true;
      imageOffset = 0;
      userImages = [];
    }
    
    try {
      const result = await getUserImages(userId, {
        app: app === 'all' ? undefined : app,
        tool: tool === 'all' ? undefined : tool,
        limit: 50,
        offset: imageOffset
      });
      
      if (append) {
        userImages = [...userImages, ...result.images];
      } else {
        userImages = result.images;
      }
      
      hasMoreImages = result.has_more;
      imageOffset += result.images.length;
      
      // Don't recalculate availableTools - keep all tools visible
    } catch (error) {
      console.error('Error loading images:', error);
      if (!append) {
        userImages = [];
      }
    } finally {
      loadingImages = false;
      loadingMore = false;
    }
  }

  function handleAppFilter(app: string) {
    selectedApp = app;
    if (selectedUser) {
      loadImages(selectedUser.id, app, selectedTool, false);
    }
  }

  function handleToolFilter(tool: string) {
    selectedTool = tool;
    if (selectedUser) {
      loadImages(selectedUser.id, selectedApp, tool, false);
    }
  }

  function handleLoadMore() {
    if (selectedUser && !loadingMore) {
      loadImages(selectedUser.id, selectedApp, selectedTool, true);
    }
  }

  function getAppName(appId: string): string {
    return AVAILABLE_APPS.find(a => a.id === appId)?.name || appId;
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

  function openImageModal(image: ImageResource) {
    imageModal = image;
  }

  function closeImageModal() {
    imageModal = null;
  }

  // Get apps from user's images (what they actually use)
  $: appsFromImages = allUserImages.length > 0 ? (() => {
    const appCounts: Record<string, number> = {};
    allUserImages.forEach(img => {
      appCounts[img.app] = (appCounts[img.app] || 0) + 1;
    });
    return Object.entries(appCounts)
      .map(([appId, count]) => ({ appId, count }))
      .sort((a, b) => b.count - a.count);
  })() : [];
  
  $: appCount = appsFromImages.length > 0 ? appsFromImages.length : (selectedUser?.apps.length || 0);

</script>

<div class="admin-dashboard">
  <!-- Left Sidebar - Users List -->
  <div class="users-sidebar">
      <div class="sidebar-header">
      <h2>Users ({filteredUsers.length} of {users.length})</h2>
      <input
        type="text"
        class="input search-input"
        placeholder="Search by name, email, or domain..."
        bind:value={searchQuery}
      />
    </div>

    <div class="users-list">
      {#if loading}
        <div class="loading-state">
          <div class="loading-spinner-small"></div>
          <p>Loading users...</p>
        </div>
      {:else if filteredUsers.length === 0}
        <div class="empty-state">
          <p>No users found</p>
        </div>
      {:else}
        {#each filteredUsers as user}
          <button
            class="user-item"
            class:active={selectedUser?.id === user.id}
            on:click={() => selectUser(user)}
          >
            <div class="user-avatar">
              {(user.full_name || user.email || '?')[0].toUpperCase()}
            </div>
            <div class="user-info">
              <div class="user-name">{user.full_name || user.email || 'Unknown User'}</div>
              <div class="user-meta">
                <span class="user-apps">{user.apps.length} apps</span>
              </div>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Right Panel - User Details -->
  <div class="user-details-panel">
    {#if !selectedUser}
      <div class="empty-state-large">
        <div class="empty-icon">👥</div>
        <h3>Select a user</h3>
        <p>Choose a user from the list to view their details and generated images</p>
      </div>
    {:else}
      <div class="details-content">
        <!-- User Info Section -->
        <section class="details-section">
          <h3>User Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>User ID</label>
              <div class="info-value code">{selectedUser.id}</div>
            </div>
            <div class="info-item">
              <label>Email</label>
              <div class="info-value">{selectedUser.email || 'N/A'}</div>
            </div>
            <div class="info-item">
              <label>Full Name</label>
              <div class="info-value">{selectedUser.full_name || 'N/A'}</div>
            </div>
            <div class="info-item">
              <label>Registered</label>
              <div class="info-value">{formatDate(selectedUser.created_at)}</div>
            </div>
            {#if userDetails?.latest_activity}
              <div class="info-item">
                <label>Last Activity</label>
                <div class="info-value">{formatDate(userDetails.latest_activity)}</div>
              </div>
            {/if}
          </div>
        </section>

        <!-- Apps Section -->
        <section class="details-section">
          <h3>Applications ({appCount})</h3>
          {#if appsFromImages.length === 0 && allUserImages.length === 0}
            <p class="no-images-note">No images found - cannot determine which app user uses</p>
          {/if}
          <div class="apps-grid">
            {#if appsFromImages.length > 0}
              {#each appsFromImages as appUsage}
                {@const dbApp = selectedUser.apps.find(a => a.app_id === appUsage.appId)}
                <div class="app-card actual-app">
                  <div class="app-header">
                    <div class="app-title-group">
                      <h4>{getAppName(appUsage.appId)}</h4>
                    </div>
                    <span class="status-badge" class:admin={dbApp?.status === 'admin'} class:blocked={dbApp?.status === 'blocked'}>
                      {dbApp?.status || 'active'}
                    </span>
                  </div>
                  <div class="app-info">
                    <div class="app-stat">
                      <span class="stat-label">Images Created</span>
                      <span class="stat-value">{appUsage.count}</span>
                    </div>
                    {#if dbApp}
                      <div class="app-stat">
                        <span class="stat-label">Credits</span>
                        <span class="stat-value">{dbApp.credits}</span>
                      </div>
                      <div class="app-stat">
                        <span class="stat-label">Bonus Credits</span>
                        <span class="stat-value">{dbApp.bonus_credits ?? 0}</span>
                      </div>
                      <div class="app-stat">
                        <span class="stat-label">Total Balance</span>
                        <span class="stat-value balance-total">{(dbApp.credits || 0) + (dbApp.bonus_credits ?? 0)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            {:else if selectedUser.apps.length > 0}
              {#each selectedUser.apps as app}
                <div class="app-card">
                  <div class="app-header">
                    <h4>{getAppName(app.app_id)}</h4>
                    <span class="status-badge" class:admin={app.status === 'admin'} class:blocked={app.status === 'blocked'}>
                      {app.status || 'active'}
                    </span>
                  </div>
                  <div class="app-info">
                    <div class="app-stat">
                      <span class="stat-label">Credits</span>
                      <span class="stat-value">{app.credits}</span>
                    </div>
                    <div class="app-stat">
                      <span class="stat-label">Bonus Credits</span>
                      <span class="stat-value">{app.bonus_credits ?? 0}</span>
                    </div>
                    <div class="app-stat">
                      <span class="stat-label">Total Balance</span>
                      <span class="stat-value balance-total">{(app.credits || 0) + (app.bonus_credits ?? 0)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <!-- Credit Transactions Section -->
        <section class="details-section">
          <h3>Credit Transactions ({userTransactions.length})</h3>
          {#if loadingTransactions}
            <p class="loading-text">Loading transactions...</p>
          {:else if userTransactions.length === 0}
            <p class="no-images-note">No credit transactions yet</p>
          {:else}
            <div class="transactions-table-wrapper">
              <table class="transactions-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>App</th>
                  </tr>
                </thead>
                <tbody>
                  {#each userTransactions as tx}
                    <tr class:charge={tx.amount < 0} class:topup={tx.amount > 0}>
                      <td class="tx-date">{new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                      <td>
                        <span class="tx-type-badge" class:generation={tx.transaction_type === 'generation_charge'} class:topup-badge={tx.transaction_type === 'topup'} class:adjustment={tx.transaction_type === 'admin_adjustment'}>
                          {tx.transaction_type === 'generation_charge' ? 'Generation' : tx.transaction_type === 'topup' ? 'Top-up' : tx.transaction_type === 'admin_adjustment' ? 'Adjustment' : tx.transaction_type}
                        </span>
                      </td>
                      <td>{tx.provider || '—'}</td>
                      <td>{tx.model || '—'}{tx.resolution ? ` (${tx.resolution})` : ''}</td>
                      <td class="tx-amount" class:negative={tx.amount < 0} class:positive={tx.amount > 0}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </td>
                      <td class="tx-balance">{tx.balance_after}</td>
                      <td>{tx.app_id}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

        <!-- Images Section -->
        <section class="details-section">
          <div class="section-header">
            <h3>Generated Images ({userImages.length})</h3>
            <div class="filters-container">
              <div class="filter-group">
                <label>App:</label>
                <div class="app-filter">
                  <button
                    class="filter-btn"
                    class:active={selectedApp === 'all'}
                    on:click={() => handleAppFilter('all')}
                  >
                    All Apps
                  </button>
                  {#each AVAILABLE_APPS as app}
                    <button
                      class="filter-btn"
                      class:active={selectedApp === app.id}
                      on:click={() => handleAppFilter(app.id)}
                    >
                      {app.name}
                    </button>
                  {/each}
                </div>
              </div>
              
              {#if availableTools.length > 0}
                <div class="filter-group">
                  <label>Tool:</label>
                  <div class="tool-filter">
                    <button
                      class="filter-btn"
                      class:active={selectedTool === 'all'}
                      on:click={() => handleToolFilter('all')}
                    >
                      All Tools
                    </button>
                    {#each availableTools as tool}
                      <button
                        class="filter-btn"
                        class:active={selectedTool === tool}
                        on:click={() => handleToolFilter(tool)}
                      >
                        {tool}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>

          {#if loadingImages}
            <div class="loading-state">
              <div class="loading-spinner-small"></div>
              <p>Loading images...</p>
            </div>
          {:else if userImages.length === 0}
            <div class="empty-state">
              <p>No images found</p>
            </div>
          {:else}
            <div class="images-grid">
              {#each userImages as image}
                <button class="image-card" on:click={() => openImageModal(image)}>
                  <img src={image.image_url} alt="Generated" loading="lazy" />
                  <div class="image-overlay">
                    <div class="image-info">
                      <div class="image-tool">{image.tool}</div>
                      <div class="image-date">{new Date(image.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
            
            {#if hasMoreImages}
              <div class="load-more-container">
                <button 
                  class="btn btn-secondary load-more-btn" 
                  on:click={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load More Images'}
                </button>
              </div>
            {/if}
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<!-- Image Modal -->
{#if imageModal}
  <div class="modal-backdrop" on:click={closeImageModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeImageModal}>×</button>
      <img src={imageModal.image_url} alt="Full size" />
      <div class="modal-info">
        <div><strong>Tool:</strong> {imageModal.tool}</div>
        <div><strong>App:</strong> {getAppName(imageModal.app)}</div>
        <div><strong>Batch:</strong> {imageModal.batch_name}</div>
        <div><strong>Created:</strong> {formatDate(imageModal.created_at)}</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-dashboard {
    display: flex;
    height: calc(100vh - 73px);
    overflow: hidden;
  }

  /* Users Sidebar */
  .users-sidebar {
    width: 350px;
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .sidebar-header h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #1f2937;
  }

  .search-input {
    font-size: 14px;
  }

  .users-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .user-item {
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

  .user-item:hover {
    background: #f9fafb;
  }

  .user-item.active {
    background: #eff6ff;
    border: 1px solid #3b82f6;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
    flex-shrink: 0;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-meta {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .user-apps {
    font-weight: 500;
  }

  /* User Details Panel */
  .user-details-panel {
    flex: 1;
    overflow-y: auto;
    background: #f9fafb;
  }

  .details-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }

  .details-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .details-section h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
    color: #1f2937;
  }

  .no-images-note {
    color: #6b7280;
    font-size: 13px;
    font-style: italic;
    margin-bottom: 16px;
  }

  .section-header {
    margin-bottom: 20px;
  }

  .section-header h3 {
    margin-bottom: 16px;
  }

  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-group label {
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    min-width: 50px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .app-filter,
  .tool-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
  }

  .info-item label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-value {
    font-size: 14px;
    color: #1f2937;
  }

  .info-value.code {
    font-family: monospace;
    font-size: 12px;
    background: #f3f4f6;
    padding: 8px;
    border-radius: 4px;
  }

  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
  }

  .app-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    background: #f9fafb;
  }

  .app-card.actual-app {
    border-color: #10b981;
    background: #f0fdf4;
    border-width: 2px;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .app-title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .app-header h4 {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }


  .status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    background: #d1fae5;
    color: #065f46;
  }

  .status-badge.admin {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-badge.blocked {
    background: #fee2e2;
    color: #991b1b;
  }

  .app-info {
    display: flex;
    gap: 16px;
  }

  .app-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: #6b7280;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .stat-value-small {
    font-size: 12px;
    font-weight: 500;
    color: #1f2937;
  }

  .filter-btn {
    padding: 6px 12px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    background: #f9fafb;
  }

  .filter-btn.active {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }

  .load-more-container {
    margin-top: 24px;
    text-align: center;
  }

  .load-more-btn {
    padding: 12px 32px;
    font-size: 14px;
  }

  .image-card {
    aspect-ratio: 1;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    border: none;
    padding: 0;
    background: #f3f4f6;
  }

  .image-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s;
  }

  .image-card:hover img {
    transform: scale(1.05);
  }

  .image-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    padding: 12px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .image-card:hover .image-overlay {
    opacity: 1;
  }

  .image-info {
    color: white;
    font-size: 12px;
  }

  .image-tool {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .image-date {
    opacity: 0.9;
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
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }

  .modal-content img {
    max-width: 100%;
    height: auto;
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
  }

  .modal-close:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .modal-info {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    font-size: 14px;
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

  /* Balance total highlight */
  .balance-total {
    font-weight: 700;
    color: #2563eb;
  }

  /* Credit Transactions Table */
  .transactions-table-wrapper {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .transactions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .transactions-table th {
    background: #f8fafc;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
    white-space: nowrap;
  }

  .transactions-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }

  .transactions-table tbody tr:hover {
    background: #f8fafc;
  }

  .tx-date {
    white-space: nowrap;
    color: #64748b;
    font-size: 0.8rem;
  }

  .tx-type-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .tx-type-badge.generation {
    background: #fef3c7;
    color: #92400e;
  }

  .tx-type-badge.topup-badge {
    background: #d1fae5;
    color: #065f46;
  }

  .tx-type-badge.adjustment {
    background: #e0e7ff;
    color: #3730a3;
  }

  .tx-amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .tx-amount.negative {
    color: #dc2626;
  }

  .tx-amount.positive {
    color: #16a34a;
  }

  .tx-balance {
    font-variant-numeric: tabular-nums;
    color: #64748b;
  }

  .loading-text {
    color: #64748b;
    font-style: italic;
    padding: 12px 0;
  }
</style>

