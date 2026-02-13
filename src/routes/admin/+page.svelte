<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getAllUsers, getUserDetails, getUserImages, getUserTransactions, adjustUserCredits, AVAILABLE_APPS, type User, type UserDetails, type ImageResource, type CreditTransaction, type AppCreditInfo } from '$lib/api/client';

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
  let allUserImages: ImageResource[] = [];

  // Tabs
  let activeTab: 'info' | 'credits' | 'images' | 'transactions' = 'info';

  // App credit info
  let appCreditInfo: Record<string, AppCreditInfo> = {};

  // Credit adjustment state
  let creditAdjustAmounts: Record<string, number> = {};
  let creditAdjustTargets: Record<string, 'main' | 'bonus'> = {};
  let creditAdjusting: Record<string, boolean> = {};
  let creditAdjustSuccess: string = '';
  let creditAdjustError: string = '';

  $: filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const matchesId = user.id.toLowerCase().includes(query);
    const matchesEmail = user.email?.toLowerCase().includes(query);
    const matchesName = user.full_name?.toLowerCase().includes(query);
    const emailDomain = user.email?.split('@')[1]?.toLowerCase();
    const matchesDomain = emailDomain?.includes(query);
    return matchesId || matchesEmail || matchesName || matchesDomain;
  });

  onMount(async () => {
    await loadUsers();
    const userId = $page.url.searchParams.get('userId');
    const tool = $page.url.searchParams.get('tool');
    if (userId) {
      const user = users.find(u => u.id === userId);
      if (user) {
        await selectUser(user);
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
    activeTab = 'info';
    loadingDetails = true;
    loadingImages = true;
    loadingTransactions = true;
    selectedApp = 'all';
    selectedTool = 'all';
    imageOffset = 0;
    userTransactions = [];

    try {
      const details = await getUserDetails(user.id);
      userDetails = details;
      appCreditInfo = details.app_credit_info || {};
      
      const allImagesResult = await getUserImages(user.id, { limit: 1000 });
      allUserImages = allImagesResult.images;
      availableTools = [...new Set(allUserImages.map(img => img.tool))].sort();
      
      await loadImages(user.id, 'all', 'all', false);

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
    } catch (error) {
      console.error('Error loading images:', error);
      if (!append) userImages = [];
    } finally {
      loadingImages = false;
      loadingMore = false;
    }
  }

  function handleAppFilter(app: string) {
    selectedApp = app;
    if (selectedUser) loadImages(selectedUser.id, app, selectedTool, false);
  }

  function handleToolFilter(tool: string) {
    selectedTool = tool;
    if (selectedUser) loadImages(selectedUser.id, selectedApp, tool, false);
  }

  function handleLoadMore() {
    if (selectedUser && !loadingMore) loadImages(selectedUser.id, selectedApp, selectedTool, true);
  }

  function getAppName(appId: string): string {
    return AVAILABLE_APPS.find(a => a.id === appId)?.name || appId;
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function openImageModal(image: ImageResource) { imageModal = image; }
  function closeImageModal() { imageModal = null; }

  async function handleAdjustCredits(appId: string) {
    if (!selectedUser) return;
    const amount = creditAdjustAmounts[appId];
    if (!amount || amount === 0) return;
    const target = creditAdjustTargets[appId] || 'main';
    creditAdjusting = { ...creditAdjusting, [appId]: true };
    creditAdjustError = '';
    creditAdjustSuccess = '';
    try {
      const result = await adjustUserCredits(selectedUser.id, {
        app_id: appId, amount, target, notes: `Admin adjustment via admin panel`
      });
      if (result.success) {
        creditAdjustSuccess = `${amount > 0 ? '+' : ''}${amount} credits (${target}) applied to ${appId}`;
        creditAdjustAmounts = { ...creditAdjustAmounts, [appId]: 0 };
        const details = await getUserDetails(selectedUser.id);
        userDetails = details;
        appCreditInfo = details.app_credit_info || {};
        const updatedUser = users.find(u => u.id === selectedUser!.id);
        if (updatedUser && details.app_settings) {
          updatedUser.apps = details.app_settings.map(s => ({
            app_id: s.app_id, status: s.status, credits: s.credits,
            bonus_credits: s.bonus_credits, created_at: s.created_at, updated_at: s.updated_at
          }));
          users = [...users];
          selectedUser = updatedUser;
        }
        try {
          const txResult = await getUserTransactions(selectedUser.id, { limit: 50 });
          userTransactions = txResult.transactions;
        } catch (e) { /* ignore */ }
        setTimeout(() => creditAdjustSuccess = '', 4000);
      }
    } catch (err: any) {
      creditAdjustError = err.message || 'Failed to adjust credits';
      setTimeout(() => creditAdjustError = '', 5000);
    } finally {
      creditAdjusting = { ...creditAdjusting, [appId]: false };
    }
  }

  async function handleAdjustPoolCap(appId: string) {
    if (!selectedUser) return;
    const amount = creditAdjustAmounts[appId];
    if (!amount || amount === 0) return;
    creditAdjusting = { ...creditAdjusting, [appId]: true };
    creditAdjustError = '';
    creditAdjustSuccess = '';
    try {
      const result = await adjustUserCredits(selectedUser.id, {
        app_id: appId, amount, target: 'pool_cap', notes: `Pool cap adjustment via admin panel`
      });
      if (result.success) {
        creditAdjustSuccess = `Usage adjustment ${amount > 0 ? '+' : ''}${amount} applied to ${appId}`;
        creditAdjustAmounts = { ...creditAdjustAmounts, [appId]: 0 };
        const details = await getUserDetails(selectedUser.id);
        userDetails = details;
        appCreditInfo = details.app_credit_info || {};
        try {
          const txResult = await getUserTransactions(selectedUser.id, { limit: 50 });
          userTransactions = txResult.transactions;
        } catch (e) { /* ignore */ }
        setTimeout(() => creditAdjustSuccess = '', 4000);
      }
    } catch (err: any) {
      creditAdjustError = err.message || 'Failed to adjust pool cap';
      setTimeout(() => creditAdjustError = '', 5000);
    } finally {
      creditAdjusting = { ...creditAdjusting, [appId]: false };
    }
  }

  // Image counts per app (supplementary stats only)
  $: appsFromImages = allUserImages.length > 0 ? (() => {
    const appCounts: Record<string, number> = {};
    allUserImages.forEach(img => { appCounts[img.app] = (appCounts[img.app] || 0) + 1; });
    return Object.entries(appCounts).map(([appId, count]) => ({ appId, count })).sort((a, b) => b.count - a.count);
  })() : [];
  
  $: appCount = selectedUser?.apps.length || 0;
</script>

<div class="admin-dashboard">
  <!-- Left Sidebar - Compact Users List -->
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
            <span class="user-name">{user.full_name || user.email || 'Unknown'}</span>
            <span class="user-apps-count">{user.apps.length}</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Right Panel - User Details with Tabs -->
  <div class="user-details-panel">
    {#if !selectedUser}
      <div class="empty-state-large">
        <div class="empty-icon">👥</div>
        <h3>Select a user</h3>
        <p>Choose a user from the list to view their details</p>
      </div>
    {:else}
      <!-- User header -->
      <div class="user-panel-header">
        <div class="user-panel-title">
          <h2>{selectedUser.full_name || selectedUser.email || 'Unknown User'}</h2>
          <span class="user-panel-email">{selectedUser.email}</span>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="tab-nav">
        <button class="tab-btn" class:active={activeTab === 'info'} on:click={() => activeTab = 'info'}>
          Info
        </button>
        <button class="tab-btn" class:active={activeTab === 'credits'} on:click={() => activeTab = 'credits'}>
          Credits ({appCount})
        </button>
        <button class="tab-btn" class:active={activeTab === 'images'} on:click={() => activeTab = 'images'}>
          Images ({allUserImages.length})
        </button>
        <button class="tab-btn" class:active={activeTab === 'transactions'} on:click={() => activeTab = 'transactions'}>
          Transactions ({userTransactions.length})
        </button>
      </div>

      <div class="tab-content">
        <!-- INFO TAB -->
        {#if activeTab === 'info'}
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
              <div class="info-item">
                <label>Apps</label>
                <div class="info-value">{selectedUser.apps.map(a => getAppName(a.app_id)).join(', ') || 'None'}</div>
              </div>
              <div class="info-item">
                <label>Total Images</label>
                <div class="info-value">{allUserImages.length}</div>
              </div>
            </div>
          </section>

        <!-- CREDITS TAB -->
        {:else if activeTab === 'credits'}
          <section class="details-section">
            <h3>Applications & Credits ({appCount})</h3>
            
            {#if creditAdjustSuccess}
              <div class="credit-alert credit-alert-success">{creditAdjustSuccess}</div>
            {/if}
            {#if creditAdjustError}
              <div class="credit-alert credit-alert-error">{creditAdjustError}</div>
            {/if}

            {#if selectedUser.apps.length === 0}
              <p class="no-data-note">No apps found for this user</p>
            {/if}
            <div class="apps-grid-wide">
              {#each selectedUser.apps as app}
                {@const imageCount = appsFromImages.find(a => a.appId === app.app_id)?.count || 0}
                {@const creditInfo = appCreditInfo[app.app_id]}
                {@const mode = creditInfo?.credit_mode || 'individual'}
                
                <div class="app-card-wide">
                  <div class="app-card-top">
                    <div class="app-header">
                      <div class="app-title-group">
                        <h4>{getAppName(app.app_id)}</h4>
                        <span class="credit-mode-badge mode-{mode}">
                          {mode === 'individual' ? 'Individual' : mode === 'pool' ? 'Shared Pool' : 'Pool + Cap'}
                        </span>
                      </div>
                      <span class="status-badge" class:admin={app.status === 'admin'} class:blocked={app.status === 'blocked'}>
                        {app.status || 'active'}
                      </span>
                    </div>

                    {#if mode === 'pool' || mode === 'pool_capped'}
                      <div class="app-info">
                        {#if imageCount > 0}
                          <div class="app-stat">
                            <span class="stat-label">Images</span>
                            <span class="stat-value">{imageCount}</span>
                          </div>
                        {/if}
                        <div class="app-stat">
                          <span class="stat-label">Pool Balance</span>
                          <span class="stat-value" class:negative-val={creditInfo?.credit_pool < 0}>{(creditInfo?.credit_pool || 0).toLocaleString()}</span>
                        </div>
                        <div class="app-stat">
                          <span class="stat-label">Used This Period</span>
                          <span class="stat-value">{(creditInfo?.user_period_usage || 0).toLocaleString()}</span>
                        </div>
                        {#if mode === 'pool_capped' && creditInfo?.pool_user_cap}
                          {@const remaining = Math.max(0, creditInfo.pool_user_cap - (creditInfo.user_period_usage || 0))}
                          <div class="app-stat">
                            <span class="stat-label">Cap ({creditInfo.pool_user_cap_period})</span>
                            <span class="stat-value">{creditInfo.pool_user_cap.toLocaleString()}</span>
                          </div>
                          <div class="app-stat">
                            <span class="stat-label">Remaining</span>
                            <span class="stat-value" class:negative-val={remaining <= 0}>{remaining.toLocaleString()}</span>
                          </div>
                        {/if}
                      </div>

                      {#if mode === 'pool_capped' && creditInfo?.pool_user_cap}
                        {@const usage = creditInfo.user_period_usage || 0}
                        {@const cap = creditInfo.pool_user_cap}
                        {@const pct = Math.min(Math.round((usage / cap) * 100), 100)}
                        <div class="cap-progress-section">
                          <div class="cap-progress-bar">
                            <div 
                              class="cap-progress-fill" 
                              class:cap-warning={pct >= 75}
                              class:cap-danger={pct >= 95}
                              style="width: {pct}%"
                            ></div>
                          </div>
                          <span class="cap-progress-label">{usage.toLocaleString()} / {cap.toLocaleString()} ({pct}%)</span>
                        </div>
                      {/if}

                    {:else}
                      <div class="app-info">
                        {#if imageCount > 0}
                          <div class="app-stat">
                            <span class="stat-label">Images</span>
                            <span class="stat-value">{imageCount}</span>
                          </div>
                        {/if}
                        <div class="app-stat">
                          <span class="stat-label">Credits</span>
                          <span class="stat-value">{app.credits}</span>
                        </div>
                        <div class="app-stat">
                          <span class="stat-label">Bonus</span>
                          <span class="stat-value">{app.bonus_credits ?? 0}</span>
                        </div>
                        <div class="app-stat">
                          <span class="stat-label">Total</span>
                          <span class="stat-value balance-total">{(app.credits || 0) + (app.bonus_credits ?? 0)}</span>
                        </div>
                      </div>
                    {/if}
                  </div>
                  
                  {#if mode === 'individual'}
                    <div class="credit-adjust-section">
                      <div class="credit-adjust-row">
                        <select 
                          class="credit-adjust-select"
                          bind:value={creditAdjustTargets[app.app_id]}
                          on:change={() => { if (!creditAdjustTargets[app.app_id]) creditAdjustTargets[app.app_id] = 'main'; }}
                        >
                          <option value="main">Credits</option>
                          <option value="bonus">Bonus Credits</option>
                        </select>
                        <input type="number" class="credit-adjust-input" placeholder="+/- amount"
                          bind:value={creditAdjustAmounts[app.app_id]} />
                        <button class="btn btn-primary btn-sm credit-adjust-btn"
                          on:click={() => handleAdjustCredits(app.app_id)}
                          disabled={creditAdjusting[app.app_id] || !creditAdjustAmounts[app.app_id]}>
                          {creditAdjusting[app.app_id] ? '...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  {:else if mode === 'pool_capped'}
                    <div class="credit-adjust-section">
                      <div class="credit-adjust-row">
                        <span class="credit-adjust-label">Adjust Usage</span>
                        <input type="number" class="credit-adjust-input" placeholder="+/- credits"
                          bind:value={creditAdjustAmounts[app.app_id]} />
                        <button class="btn btn-primary btn-sm credit-adjust-btn"
                          on:click={() => handleAdjustPoolCap(app.app_id)}
                          disabled={creditAdjusting[app.app_id] || !creditAdjustAmounts[app.app_id]}>
                          {creditAdjusting[app.app_id] ? '...' : 'Apply'}
                        </button>
                      </div>
                      <div class="cap-adjust-help">
                        <strong>-</strong> simulates usage (removes credits) &nbsp;·&nbsp; <strong>+</strong> gives credits back
                      </div>
                    </div>
                  {:else}
                    <div class="credit-adjust-section pool-mode-note">
                      Credits managed via pool — <a href="/admin/apps">manage in Apps</a>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

        <!-- IMAGES TAB -->
        {:else if activeTab === 'images'}
          <section class="details-section">
            <div class="section-header">
              <h3>Generated Images ({userImages.length})</h3>
              <div class="filters-container">
                <div class="filter-group">
                  <label>App:</label>
                  <div class="app-filter">
                    <button class="filter-btn" class:active={selectedApp === 'all'} on:click={() => handleAppFilter('all')}>All Apps</button>
                    {#each AVAILABLE_APPS as app}
                      <button class="filter-btn" class:active={selectedApp === app.id} on:click={() => handleAppFilter(app.id)}>{app.name}</button>
                    {/each}
                  </div>
                </div>
                {#if availableTools.length > 0}
                  <div class="filter-group">
                    <label>Tool:</label>
                    <div class="tool-filter">
                      <button class="filter-btn" class:active={selectedTool === 'all'} on:click={() => handleToolFilter('all')}>All Tools</button>
                      {#each availableTools as tool}
                        <button class="filter-btn" class:active={selectedTool === tool} on:click={() => handleToolFilter(tool)}>{tool}</button>
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
              <div class="empty-state"><p>No images found</p></div>
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
                  <button class="btn btn-secondary load-more-btn" on:click={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : 'Load More Images'}
                  </button>
                </div>
              {/if}
            {/if}
          </section>

        <!-- TRANSACTIONS TAB -->
        {:else if activeTab === 'transactions'}
          <section class="details-section">
            <h3>Credit Transactions ({userTransactions.length})</h3>
            {#if loadingTransactions}
              <p class="loading-text">Loading transactions...</p>
            {:else if userTransactions.length === 0}
              <p class="no-data-note">No credit transactions yet</p>
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
        {/if}
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

  /* ===== Compact Users Sidebar ===== */
  .users-sidebar {
    width: 240px;
    min-width: 240px;
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .sidebar-header h2 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
    color: #1f2937;
  }

  .search-input {
    font-size: 13px;
    padding: 6px 10px;
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    outline: none;
  }

  .search-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .users-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .user-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 10px;
    border: 1px solid transparent;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 1px;
    transition: background 0.15s;
    text-align: left;
    font-size: 13px;
  }

  .user-item:hover {
    background: #f3f4f6;
  }

  .user-item.active {
    background: #eff6ff;
    border-color: #3b82f6;
  }

  .user-item .user-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #1f2937;
    font-weight: 500;
  }

  .user-apps-count {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    background: #f3f4f6;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .user-item.active .user-apps-count {
    background: #dbeafe;
    color: #2563eb;
  }

  /* ===== User Details Panel ===== */
  .user-details-panel {
    flex: 1;
    overflow-y: auto;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
  }

  .user-panel-header {
    background: white;
    padding: 20px 24px 0;
    border-bottom: none;
  }

  .user-panel-title h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .user-panel-email {
    font-size: 13px;
    color: #6b7280;
    margin-top: 2px;
    display: block;
  }

  /* ===== Tabs ===== */
  .tab-nav {
    display: flex;
    gap: 0;
    background: white;
    padding: 0 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .tab-btn {
    padding: 12px 20px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: #1f2937;
  }

  .tab-btn.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    max-width: 1200px;
  }

  /* ===== Details Section ===== */
  .details-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .details-section h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 20px;
    color: #1f2937;
  }

  .no-data-note {
    color: #6b7280;
    font-size: 13px;
    font-style: italic;
  }

  .section-header { margin-bottom: 20px; }
  .section-header h3 { margin-bottom: 16px; }

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
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    min-width: 40px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .app-filter, .tool-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
  }

  .info-item label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-value {
    font-size: 14px;
    color: #1f2937;
  }

  .info-value.code {
    font-family: monospace;
    font-size: 11px;
    background: #f3f4f6;
    padding: 6px 8px;
    border-radius: 4px;
    word-break: break-all;
  }

  /* ===== App Cards ===== */
  .apps-grid-wide {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .app-card-wide {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #f9fafb;
    overflow: hidden;
  }

  .app-card-top { padding: 16px 20px; }

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
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .status-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    background: #d1fae5;
    color: #065f46;
  }

  .status-badge.admin { background: #dbeafe; color: #1e40af; }
  .status-badge.blocked { background: #fee2e2; color: #991b1b; }

  .app-info { display: flex; gap: 16px; }

  .app-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .stat-label { font-size: 11px; color: #6b7280; }
  .stat-value { font-size: 17px; font-weight: 600; color: #1f2937; }

  .credit-mode-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .credit-mode-badge.mode-individual { background: #e0e7ff; color: #3730a3; }
  .credit-mode-badge.mode-pool { background: #fef3c7; color: #92400e; }
  .credit-mode-badge.mode-pool_capped { background: #dbeafe; color: #1e40af; }

  .negative-val { color: #dc2626 !important; }
  .balance-total { font-weight: 700; color: #2563eb; }

  /* ===== Credit Adjustment ===== */
  .credit-adjust-section {
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.03);
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }

  .credit-adjust-row { display: flex; gap: 8px; align-items: center; }

  .credit-adjust-select {
    padding: 5px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    background: white;
  }

  .credit-adjust-input {
    width: 110px;
    padding: 5px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    background: white;
  }

  .credit-adjust-input::placeholder { color: #9ca3af; }

  .credit-adjust-btn {
    padding: 5px 14px !important;
    font-size: 12px !important;
    white-space: nowrap;
  }

  .credit-adjust-label {
    font-size: 12px;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
  }

  .credit-alert {
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 16px;
  }

  .credit-alert-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  .credit-alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

  /* ===== Cap Progress ===== */
  .cap-progress-section {
    padding: 8px 20px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .cap-progress-bar {
    flex: 1;
    height: 7px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .cap-progress-fill {
    height: 100%;
    background: #3b82f6;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .cap-progress-fill.cap-warning { background: #f59e0b; }
  .cap-progress-fill.cap-danger { background: #ef4444; }

  .cap-progress-label {
    font-size: 11px;
    color: #6b7280;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .pool-mode-note { font-size: 13px; color: #6b7280; }
  .pool-mode-note a { color: #3b82f6; text-decoration: underline; font-weight: 500; }

  .cap-adjust-help { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .cap-adjust-help strong { color: #374151; }

  /* ===== Filter Buttons ===== */
  .filter-btn {
    padding: 5px 10px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-btn:hover { background: #f9fafb; }
  .filter-btn.active { background: #2563eb; color: white; border-color: #2563eb; }

  /* ===== Images Grid ===== */
  .images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
  }

  .load-more-container { margin-top: 20px; text-align: center; }
  .load-more-btn { padding: 10px 28px; font-size: 13px; }

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

  .image-card:hover img { transform: scale(1.05); }

  .image-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    padding: 10px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .image-card:hover .image-overlay { opacity: 1; }

  .image-info { color: white; font-size: 11px; }
  .image-tool { font-weight: 600; margin-bottom: 2px; }
  .image-date { opacity: 0.9; }

  /* ===== Transactions Table ===== */
  .transactions-table-wrapper {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .transactions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .transactions-table th {
    background: #f8fafc;
    padding: 7px 10px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
    white-space: nowrap;
  }

  .transactions-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }

  .transactions-table tbody tr:hover { background: #f8fafc; }

  .tx-date { white-space: nowrap; color: #64748b; font-size: 0.78rem; }

  .tx-type-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .tx-type-badge.generation { background: #fef3c7; color: #92400e; }
  .tx-type-badge.topup-badge { background: #d1fae5; color: #065f46; }
  .tx-type-badge.adjustment { background: #e0e7ff; color: #3730a3; }

  .tx-amount { font-weight: 700; font-variant-numeric: tabular-nums; }
  .tx-amount.negative { color: #dc2626; }
  .tx-amount.positive { color: #16a34a; }
  .tx-balance { font-variant-numeric: tabular-nums; color: #64748b; }

  .loading-text { color: #64748b; font-style: italic; padding: 12px 0; }

  /* ===== Modal ===== */
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
    width: 36px;
    height: 36px;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 24px;
    line-height: 1;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.2s;
  }

  .modal-close:hover { background: rgba(0, 0, 0, 0.7); }

  .modal-info {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    font-size: 13px;
  }

  /* ===== Loading & Empty States ===== */
  .loading-state, .empty-state {
    padding: 40px;
    text-align: center;
    color: #6b7280;
  }

  .loading-spinner-small {
    width: 22px;
    height: 22px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 10px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 60px 20px;
    color: #6b7280;
  }

  .empty-icon { font-size: 56px; margin-bottom: 16px; }
  .empty-state-large h3 { font-size: 18px; color: #1f2937; margin-bottom: 8px; }
  .empty-state-large p { font-size: 14px; max-width: 360px; text-align: center; }
</style>
