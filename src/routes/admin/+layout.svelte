<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore, signOut } from '$lib/auth/store';
  import { onMount } from 'svelte';

  // Redirect if not admin
  $: if (!$authStore.loading && (!$authStore.isAuthenticated || !$authStore.isAdmin)) {
    goto('/');
  }

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
        <h1>🔐 ControlAI Admin</h1>
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

  .admin-header h1 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
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

