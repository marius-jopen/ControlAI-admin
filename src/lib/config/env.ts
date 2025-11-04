import { browser } from '$app/environment';

export const env = {
  backend: {
    url: browser ? import.meta.env.VITE_API_URL || 'http://localhost:3001' : 'http://localhost:3001'
  }
};

