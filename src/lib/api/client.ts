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

// ============================================================================
// Apps Management API (Admin only)
// ============================================================================

export interface AppConfig {
  id: string;
  name: string;
  config: {
    domains: string[];
    welcome: {
      title: string;
      description: string;
      callToAction: string;
    };
    features: {
      dashboard: {
        enabled: boolean;
        showWelcomeMessage: boolean;
        showToolsGrid: boolean;
        showGallery: boolean;
        galleryConfig?: any;
      };
      studio: {
        tools: Record<string, {
          enabled: boolean;
          title: string;
          thumbnail?: string;
          initImage?: boolean;
        }>;
      };
    };
    env?: {
      appName: string;
    };
  };
  created_at: string;
  updated_at: string;
}

/**
 * Get all apps
 */
export async function getAllApps(): Promise<AppConfig[]> {
  // Use direct fetch for public endpoint (no auth needed)
  const response = await fetch(`${API_URL}/api/v1/apps`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  const data = await response.json();
  return data.apps;
}

/**
 * Get specific app by ID
 */
export async function getAppById(appId: string): Promise<AppConfig> {
  const response = await fetch(`${API_URL}/api/v1/apps/${appId}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  const data = await response.json();
  return data.app;
}

/**
 * Create a new app (admin only)
 */
export async function createApp(appData: Omit<AppConfig, 'created_at' | 'updated_at'>): Promise<AppConfig> {
  const data = await fetchWithAuth('/api/v1/apps', {
    method: 'POST',
    body: JSON.stringify(appData)
  });
  
  return data.app;
}

/**
 * Update an existing app (admin only)
 */
export async function updateApp(appId: string, appData: Partial<Omit<AppConfig, 'id' | 'created_at' | 'updated_at'>>): Promise<AppConfig> {
  const data = await fetchWithAuth(`/api/v1/apps/${appId}`, {
    method: 'PUT',
    body: JSON.stringify(appData)
  });
  
  return data.app;
}

/**
 * Delete an app (admin only)
 */
export async function deleteApp(appId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/apps/${appId}`, {
    method: 'DELETE'
  });
}

// =============================================
// LoRA API Functions
// =============================================

export interface Lora {
  id: string;
  name: string;
  value: string; // Model identifier
  trigger: string | null;
  description: string | null;
  image: string | null;
  type: 'sdxl' | 'flux';
  created_at: string;
  updated_at: string;
}

/**
 * Get all LoRAs
 * @param type - Optional filter by type ('sdxl' or 'flux')
 */
export async function getAllLoras(type?: 'sdxl' | 'flux'): Promise<Lora[]> {
  const queryParams = type ? `?type=${type}` : '';
  const response = await fetch(`${API_URL}/api/v1/loras${queryParams}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch LoRAs');
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Get a single LoRA by ID
 */
export async function getLoraById(loraId: string): Promise<Lora> {
  const response = await fetch(`${API_URL}/api/v1/loras/${loraId}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch LoRA');
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Create a new LoRA (admin only)
 */
export async function createLora(loraData: Omit<Lora, 'id' | 'created_at' | 'updated_at'>): Promise<Lora> {
  const data = await fetchWithAuth('/api/v1/loras', {
    method: 'POST',
    body: JSON.stringify(loraData)
  });
  
  return data.data;
}

/**
 * Update an existing LoRA (admin only)
 */
export async function updateLora(loraId: string, loraData: Partial<Omit<Lora, 'id' | 'created_at' | 'updated_at'>>): Promise<Lora> {
  const data = await fetchWithAuth(`/api/v1/loras/${loraId}`, {
    method: 'PUT',
    body: JSON.stringify(loraData)
  });
  
  return data.data;
}

/**
 * Delete a LoRA (admin only)
 */
export async function deleteLora(loraId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/loras/${loraId}`, {
    method: 'DELETE'
  });
}

// ===== LoRA Upload APIs =====

export interface LoraFile {
  name: string;
  size: number;
  sizeFormatted: string;
  lastModified: string | Date;
  key?: string;
}

/**
 * Get remote LoRA files in RunPod S3 (admin only)
 */
export async function getRemoteLoraFiles(): Promise<LoraFile[]> {
  const data = await fetchWithAuth('/api/v1/lora-upload/remote');
  return data.data;
}

/**
 * Upload a LoRA file from URL (Google Drive, Dropbox, etc.) to RunPod S3 (admin only)
 */
export async function uploadLoraFromUrl(fileUrl: string, fileName: string): Promise<{
  success: boolean;
  location: string;
  key: string;
  fileName: string;
  size: number;
  sizeFormatted: string;
}> {
  const data = await fetchWithAuth('/api/v1/lora-upload', {
    method: 'POST',
    body: JSON.stringify({ fileUrl, fileName })
  });
  return data.data;
}

// ============================================================================
// LoRA Image Upload Functions
// ============================================================================

/**
 * Upload a LoRA thumbnail image
 */
export async function uploadLoraImage(file: File): Promise<{
  success: boolean;
  url: string;
  key: string;
}> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch(`${API_URL}/api/v1/lora-images/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // Don't set Content-Type, browser will set it with boundary for multipart/form-data
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Upload failed');
  }
  
  return response.json();
}

/**
 * Delete a LoRA image from S3
 */
export async function deleteLoraImage(imageUrl: string): Promise<{
  success: boolean;
  message: string;
}> {
  return fetchWithAuth('/api/v1/lora-images', {
    method: 'DELETE',
    body: JSON.stringify({ imageUrl })
  });
}

/**
 * Upload a LoRA .safetensors file to AWS S3 (limn-data/loras/)
 */
export async function uploadLoraFile(file: File): Promise<{
  success: boolean;
  url: string;
  key: string;
}> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const formData = new FormData();
  formData.append('loraFile', file);
  
  const response = await fetch(`${API_URL}/api/v1/lora-files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // Don't set Content-Type, browser will set it with boundary for multipart/form-data
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Upload failed');
  }
  
  return response.json();
}

/**
 * Upload a LoRA file to RunPod S3 via AWS S3 temp storage (two-step process)
 * Step 1: Browser → AWS S3 temp (fast, CORS works)
 * Step 2: Server → RunPod S3 (background transfer)
 */
export async function uploadLoraToRunPod(
  file: File,
  onLog?: (log: string) => void
): Promise<{
  success: boolean;
  message: string;
}> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  try {
    // Step 1: Get presigned URL for AWS S3 temp storage
    if (onLog) onLog(`📋 Requesting upload URL for ${file.name}...`);
    
    const urlResponse = await fetchWithAuth('/api/v1/lora-upload/get-upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name })
    });

    if (!urlResponse.success || !urlResponse.uploadUrl) {
      throw new Error('Failed to get upload URL');
    }

    if (onLog) onLog(`✅ Upload URL received, starting upload to temp storage...`);
    
    // Step 2: Upload to AWS S3 temp storage
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      let lastPercent = 0;
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onLog) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
          const totalMB = (e.total / 1024 / 1024).toFixed(1);
          
          // Only log every 10%
          if (percent >= lastPercent + 10 || percent === 100) {
            onLog(`📤 Uploading: ${percent}% (${loadedMB}/${totalMB} MB)`);
            lastPercent = percent;
          }
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onLog) onLog(`✅ Upload to temp storage complete!`);
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });
      
      // Upload to AWS S3 using PUT
      xhr.open('PUT', urlResponse.uploadUrl);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(file);
    });

    // Step 3: Trigger background transfer to RunPod S3
    if (onLog) onLog(`🔄 Starting transfer to RunPod S3...`);
    
    const transferResponse = await fetchWithAuth('/api/v1/lora-upload/transfer-to-runpod', {
      method: 'POST',
      body: JSON.stringify({
        tempPath: urlResponse.tempPath,
        fileName: file.name
      })
    });

    if (!transferResponse.success) {
      throw new Error('Failed to start transfer to RunPod S3');
    }

    if (onLog) onLog(`✅ Transfer started! File will appear in RunPod S3 shortly.`);
    if (onLog) onLog(`⏳ Please wait 30-60 seconds for large files...`);

    return {
      success: true,
      message: `LoRA "${file.name}" uploaded and transfer initiated successfully`
    };

  } catch (error) {
    if (onLog) onLog(`❌ Error: ${error instanceof Error ? error.message : 'Upload failed'}`);
    throw error;
  }
}

/**
 * Get all transfer jobs (for debugging)
 */
export async function getTransferJobs(): Promise<{
  success: boolean;
  jobs: Array<{
    id: string;
    fileName: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    failedAt?: string;
    error?: string;
    logs: Array<{ time: string; message: string }>;
  }>;
  count: number;
}> {
  const response = await fetchWithAuth('/api/v1/lora-upload/transfer-jobs');
  return response;
}

/**
 * Get status of a specific transfer job
 */
export async function getTransferJobStatus(jobId: string): Promise<{
  success: boolean;
  job: {
    fileName: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    failedAt?: string;
    error?: string;
    logs: Array<{ time: string; message: string }>;
  };
}> {
  const response = await fetchWithAuth(`/api/v1/lora-upload/transfer-status/${jobId}`);
  return response;
}

/**
 * Delete a LoRA file from RunPod S3
 */
export async function deleteLoraFromRunPod(fileName: string): Promise<{
  success: boolean;
  message: string;
}> {
  return fetchWithAuth('/api/v1/lora-upload/delete-file', {
    method: 'DELETE',
    body: JSON.stringify({ fileName })
  });
}
