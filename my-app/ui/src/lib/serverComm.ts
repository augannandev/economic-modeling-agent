import { getAuth } from 'firebase/auth';
import { app } from './firebase';

// API URL configuration
// In production: uses VITE_API_URL from environment
// In development (localhost): falls back to localhost:5500
const getApiBaseUrl = (): string => {
  // Check if we're in browser and on localhost (development)
  const isLocalDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // Get the environment variable
  const envUrl = import.meta.env.VITE_API_URL;
  
  console.log('[API Config]', {
    envUrl,
    isLocalDev,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'SSR',
    allEnv: import.meta.env
  });
  
  // If VITE_API_URL is set and NOT localhost, use it
  if (envUrl && !envUrl.includes('localhost')) {
    console.log('[API] Using VITE_API_URL:', envUrl);
    return envUrl;
  }
  
  // For local development, use localhost
  if (isLocalDev) {
    console.log('[API] Local dev mode - using localhost:5500');
    return 'http://localhost:5500';
  }
  
  // Production without valid VITE_API_URL - this is an error
  console.error('[API] ERROR: VITE_API_URL not properly set for production!');
  console.error('[API] Current value:', envUrl);
  return envUrl || '';
};

const API_BASE_URL = getApiBaseUrl();

// Check if we're in demo mode (anonymous users allowed or no real Firebase config)
const isDemoMode = () => {
  const allowAnonymous = import.meta.env.VITE_ALLOW_ANONYMOUS_USERS?.toLowerCase() === 'true';
  if (allowAnonymous) return true;
  
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return !projectId || projectId === 'demo-project';
};

// Functional error type instead of class
interface APIError extends Error {
  status: number;
  code?: string;
  user_id?: string;
}

function createAPIError(status: number, message: string, code?: string, user_id?: string): APIError {
  const error = new Error(message) as APIError;
  error.name = 'APIError';
  error.status = status;
  error.code = code;
  error.user_id = user_id;
  return error;
}

async function getAuthToken(): Promise<string | null> {
  // In demo mode, return a demo token
  if (isDemoMode()) {
    return 'demo-token-for-testing';
  }
  
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

/**
 * Get auth headers for fetch requests (synchronous version for simple use cases)
 * For authenticated requests, prefer using fetchWithAuth instead
 */
export function getAuthHeaders(): Record<string, string> {
  // In demo mode, return demo headers
  if (isDemoMode()) {
    return {
      'Authorization': 'Bearer demo-token-for-testing'
    };
  }
  
  // For synchronous use, we check if there's a cached token
  // For proper auth, use fetchWithAuth which is async
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) {
    return {};
  }
  
  // Note: This won't have the fresh token since getIdToken is async
  // The token is cached after first auth, so this may work for short-lived sessions
  // For production, consider using fetchWithAuth instead
  return {};
}

export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    
    throw createAPIError(
      response.status,
      errorData.error || errorData.message || `API request failed: ${response.statusText}`,
      errorData.code,
      errorData.user_id
    );
  }

  return response;
}

// API endpoints
export async function getCurrentUser(): Promise<{
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    photo_url: string | null;
    created_at: string;
    updated_at: string;
  };
  message: string;
}> {
  const response = await fetchWithAuth('/api/v1/protected/me');
  return response.json();
}

// Example of how to add more API endpoints:
// export async function createChat(data: CreateChatData) {
//   const response = await fetchWithAuth('/api/v1/protected/chats', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify(data),
//   });
//   return response.json();
// }

export const api = {
  getCurrentUser,
  // Add other API endpoints here
}; 