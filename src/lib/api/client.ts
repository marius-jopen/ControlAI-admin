import { env } from '$lib/config/env';
import { get } from 'svelte/store';
import { authStore } from '$lib/auth/store';

const API_URL = env.backend.url;

/**
 * Get auth token from store
 */
function getAuthToken(): string | null {
  const auth = get(authStore);
  return auth.token;
}

/**
 * Fetch wrapper with auth
 */
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  apps: Array<{
    app_id: string;
    status: string;
    credits: number;
    created_at: string;
    updated_at: string;
  }>;
  latest_activity?: string | null;
}

export interface UserDetails {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    created_at: string;
    user_metadata: any;
  };
  app_settings: Array<{
    app_id: string;
    status: string;
    credits: number;
    created_at: string;
    updated_at: string;
  }>;
  latest_activity: string | null;
}

export interface ImageResource {
  id: string;
  image_url: string;
  tool: string;
  batch_name: string;
  created_at: string;
  app: string;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(): Promise<User[]> {
  const data = await fetchWithAuth('/api/v1/auth/admin/users');
  return data.users;
}

/**
 * Get user details
 */
export async function getUserDetails(userId: string): Promise<UserDetails> {
  return await fetchWithAuth(`/api/v1/auth/admin/users/${userId}`);
}

/**
 * Get user's generated images
 */
export async function getUserImages(userId: string, filters: {
  app?: string;
  tool?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ images: ImageResource[]; has_more: boolean }> {
  const params = new URLSearchParams();
  if (filters.app) params.append('app', filters.app);
  if (filters.tool) params.append('tool', filters.tool);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const queryString = params.toString();
  const url = `/api/v1/auth/admin/users/${userId}/images${queryString ? `?${queryString}` : ''}`;
  
  return await fetchWithAuth(url);
}

/**
 * Get available apps from config
 */
export const AVAILABLE_APPS = [
  { id: 'celine', name: 'CELINE' },
  { id: 'ifm', name: 'IFM' },
  { id: 'thelios', name: 'THELIOS' },
  { id: 'limn', name: 'Limn' }
];
