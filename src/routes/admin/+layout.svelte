<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore, signOut } from '$lib/auth/store';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  // Redirect if not admin
  $: if (!$authStore.loading && (!$authStore.isAuthenticated || !$authStore.isAdmin)) {
    goto('/');
  }

  $: currentPath = $page.url.pathname;

  async function handleSignOut() {
    try {
      await signOut();
      goto('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }
</script>

{#if $authStore.loading}
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if $authStore.isAdmin}
  <div class="admin-layout">
    <header class="admin-header">
      <div class="header-content">
        <div class="header-left">
        <h1>🔐 ControlAI Admin</h1>
          <nav class="nav-tabs">
            <a 
              href="/admin" 
              class="nav-tab"
              class:active={currentPath === '/admin'}
            >
              👥 Users
            </a>
            <a 
              href="/admin/apps" 
              class="nav-tab"
              class:active={currentPath === '/admin/apps'}
            >
              📱 Apps
            </a>
            <a 
              href="/admin/loras" 
              class="nav-tab"
              class:active={currentPath === '/admin/loras'}
            >
              🎨 LoRAs
            </a>
            <a 
              href="/admin/statistics" 
              class="nav-tab"
              class:active={currentPath === '/admin/statistics'}
            >
              📊 Statistics
            </a>
            <a 
              href="/admin/scheduler" 
              class="nav-tab"
              class:active={currentPath === '/admin/scheduler'}
            >
              ⏰ Scheduler
            </a>
          </nav>
        </div>
        <div class="header-actions">
          <span class="user-email">{$authStore.user?.email}</span>
          <button class="btn btn-secondary" on:click={handleSignOut}>
            Sign Out
          </button>
        </div>
      </div>
    </header>

    <main class="admin-main">
      <slot />
    </main>
  </div>
{/if}

<style>
  .loading-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .admin-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .admin-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 16px 24px;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .admin-header h1 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
  }

  .nav-tabs {
    display: flex;
    gap: 8px;
  }

  .nav-tab {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    text-decoration: none;
    transition: all 0.2s;
  }

  .nav-tab:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  .nav-tab.active {
    background: #2563eb;
    color: white;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .user-email {
    font-size: 14px;
    color: #6b7280;
  }

  .admin-main {
    flex: 1;
    background: #f9fafb;
  }
</style>

