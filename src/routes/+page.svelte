<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore, signIn } from '$lib/auth/store';
  import { onMount } from 'svelte';

  let email = '';
  let password = '';
  let appId = 'limn';
  let error = '';
  let loading = false;

  const apps = [
    { id: 'limn', name: 'Limn' },
    { id: 'celine', name: 'CELINE' },
    { id: 'ifm', name: 'IFM' },
    { id: 'thelios', name: 'THELIOS' }
  ];

  // Redirect if already authenticated and admin
  $: if ($authStore.isAuthenticated && $authStore.isAdmin) {
    goto('/admin');
  }

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await signIn(email, password, appId);
      goto('/admin');
    } catch (err: any) {
      error = err.message || 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-container">
  <div class="login-card">
    <div class="logo">
      <h1>🔐 ControlAI Admin</h1>
      <p>Admin Panel</p>
    </div>

    <form on:submit={handleLogin}>
      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          class="input"
          bind:value={email}
          placeholder="admin@example.com"
          required
          disabled={loading}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          class="input"
          bind:value={password}
          placeholder="••••••••"
          required
          disabled={loading}
        />
      </div>


      {#if error}
        <div class="error-message">
          ⚠️ {error}
        </div>
      {/if}

      <button type="submit" class="btn btn-primary btn-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <div class="footer-note">
      <p>⚠️ Admin access only</p>
    </div>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
  }

  .login-card {
    background: white;
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .logo h1 {
    font-size: 28px;
    margin-bottom: 8px;
    color: #1f2937;
  }

  .logo p {
    font-size: 14px;
    color: #6b7280;
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: #374151;
  }

  .btn-full {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    margin-top: 8px;
  }

  .error-message {
    background: #fef2f2;
    color: #991b1b;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
    border: 1px solid #fee2e2;
  }

  .footer-note {
    margin-top: 24px;
    text-align: center;
  }

  .footer-note p {
    font-size: 13px;
    color: #9ca3af;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

