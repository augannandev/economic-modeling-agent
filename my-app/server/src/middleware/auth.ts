import { MiddlewareHandler } from 'hono';
import { verifyFirebaseToken } from '../lib/firebase-auth';
import { getDatabase } from '../lib/db';
import { eq } from 'drizzle-orm';
import { User, users } from '../schema/users';
import { getFirebaseProjectId, getDatabaseUrl, getAllowAnonymousUsers } from '../lib/env';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

// Check if we're in demo mode (no real Firebase config or anonymous allowed)
const isDemoMode = () => {
  const projectId = getFirebaseProjectId();
  const allowAnonymous = getAllowAnonymousUsers();
  return !projectId || projectId === 'demo-project' || allowAnonymous;
};

// Demo user for testing without Firebase
const DEMO_USER: User = {
  id: 'demo-user-123',
  email: 'demo@example.com',
  display_name: 'Demo User',
  photo_url: null,
  created_at: new Date(),
  updated_at: new Date(),
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Skip auth for CORS preflight requests
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }
  
  try {
    const authHeader = c.req.header('Authorization');
    
    // Check if anonymous/demo mode is enabled
    const allowAnonymous = getAllowAnonymousUsers();
    
    // If no auth header and anonymous is allowed, use demo user
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (allowAnonymous) {
        console.log('🎭 Anonymous mode: using demo user (no auth header)');
        c.set('user', DEMO_USER);
        await next();
        return;
      }
      return c.json({ error: 'Authentication required' }, 401);
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Handle demo mode - accept demo token or any token when anonymous allowed
    if (isDemoMode() || token === 'demo-token-for-testing') {
      console.log('🎭 Demo mode: using demo user');
      c.set('user', DEMO_USER);
      await next();
      return;
    }
    
    const firebaseProjectId = getFirebaseProjectId();
    const firebaseUser = await verifyFirebaseToken(token, firebaseProjectId);
    
    // Check if anonymous users are allowed (already declared above)
    const isAnonymousUser = !firebaseUser.email;
    
    if (!allowAnonymous && isAnonymousUser) {
      return c.json({ error: 'Anonymous users are not allowed. Please sign in.' }, 403);
    }
    
    const firebaseUserId = firebaseUser.id;
    const email = firebaseUser.email || null;

    const databaseUrl = getDatabaseUrl();
    const db = await getDatabase(databaseUrl);

    // Upsert: insert if not exists, update email if exists and email changed
    await db.insert(users)
      .values({
        id: firebaseUserId,
        email: email,
        display_name: null,
        photo_url: null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: email,
          updated_at: new Date(),
        },
      });

    // Get the user from database
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, firebaseUserId))
      .limit(1);

    if (!user) {
      console.error('User not found after insert attempt for ID:', firebaseUserId);
      return c.json({ error: 'User creation failed' }, 500);
    }

    c.set('user', user);
    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
}; 