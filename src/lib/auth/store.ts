import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$lib/config/env';

const API_URL = env.backend.url;

export interface User {
  id: string;
  email: string;
  full_name?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: true
};

export const authStore = writable<AuthState>(initialState);

/**
 * Initialize auth from localStorage
 */
export async function initAuth() {
  if (!browser) return;

  try {
    const token = localStorage.getItem('admin_token');
    const userJson = localStorage.getItem('admin_user');

    if (token && userJson) {
      const user = JSON.parse(userJson);
      
      // Verify the token is still valid by checking admin status
      const isAdmin = await checkAdminStatus(token);
      
      if (isAdmin) {
        authStore.set({
          user,
          token,
          isAuthenticated: true,
          isAdmin: true,
          loading: false
        });
      } else {
        // Token invalid or user no longer admin
        clearAuth();
      }
    } else {
      authStore.set({
        ...initialState,
        loading: false
      });
    }
  } catch (error) {
    console.error('Error initializing auth:', error);
    clearAuth();
  }
}

/**
 * Check if user has admin status
 */
async function checkAdminStatus(token: string): Promise<boolean> {
  try {
    // Try to fetch admin users endpoint - if it works, user is admin
    const response = await fetch(`${API_URL}/api/v1/auth/admin/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string, appId: string = 'limn') {
  try {
    const loginData = { 
      email, 
      password,
      appId // Use the app the user selected
    };
    
    console.log('Attempting login to:', `${API_URL}/api/v1/auth/login`);
    console.log('With appId:', appId);
    
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loginData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      console.error('Login failed:', error);
      console.error('Status:', response.status);
      throw new Error(error.error || error.message || 'Login failed');
    }

    const data = await response.json();
    console.log('Login successful:', data);
    
    // Check if user is admin
    const isAdmin = await checkAdminStatus(data.session.access_token);
    
    if (!isAdmin) {
      throw new Error('You do not have admin access');
    }

    const user: User = {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name
    };

    // Store in localStorage
    localStorage.setItem('admin_token', data.session.access_token);
    localStorage.setItem('admin_user', JSON.stringify(user));

    authStore.set({
      user,
      token: data.session.access_token,
      isAuthenticated: true,
      isAdmin: true,
      loading: false
    });

    return data;
  } catch (error) {
    clearAuth();
    throw error;
  }
}

/**
 * Sign out
 */
export async function signOut() {
  const currentState = get(authStore);
  
  if (currentState.token) {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentState.token}`
        }
      });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  clearAuth();
}

/**
 * Clear auth state
 */
function clearAuth() {
  if (browser) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  }

  authStore.set({
    user: null,
    token: null,
    isAuthenticated: false,
    isAdmin: false,
    loading: false
  });
}
