import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import { usersApi, setAuthTokenGetter } from '../lib/api';
import { browserTimeZone } from '../lib/dates';
import type { User } from '../types';

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  user: User | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tokenGetterReady, setTokenGetterReady] = useState(false);

  // Set up the auth token getter for API calls
  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!isSignedIn) return null;
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    setTokenGetterReady(true);
  }, [isSignedIn, getToken]);

  /**
   * Keep the stored zone matching the device, so the API dates a workout by the
   * user's day rather than UTC's. Also picks up travel automatically.
   */
  const syncTimeZone = async (current: User): Promise<User> => {
    const detected = browserTimeZone();
    if (!detected || current.timezone === detected) return current;
    const updated = await usersApi.update({ timezone: detected });
    return updated.data ?? current;
  };

  const fetchOrCreateUser = async () => {
    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setIsLoaded(true);
      return;
    }

    try {
      const response = await usersApi.get();

      if (response.data) {
        setUser(await syncTimeZone(response.data));
      } else if (response.error) {
        const email = clerkUser.emailAddresses[0]?.emailAddress || '';
        const createResponse = await usersApi.create({
          email,
          first_name: clerkUser.firstName || undefined,
          last_name: clerkUser.lastName || undefined,
        });

        if (createResponse.data) {
          setUser(await syncTimeZone(createResponse.data));
        }
      }
    } catch (error) {
      console.error('Error fetching/creating user:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const refreshUser = async () => {
    const response = await usersApi.get();
    if (response.data) {
      setUser(response.data);
    }
  };

  // Only fetch user after token getter is ready
  useEffect(() => {
    if (clerkLoaded && tokenGetterReady && isSignedIn) {
      fetchOrCreateUser();
    } else if (clerkLoaded && !isSignedIn) {
      setIsLoaded(true);
    }
  }, [clerkLoaded, isSignedIn, clerkUser?.id, tokenGetterReady]);

  const value: AuthContextType = {
    isLoaded: clerkLoaded && isLoaded,
    isSignedIn: isSignedIn || false,
    userId: clerkUser?.id || null,
    userEmail: clerkUser?.emailAddresses[0]?.emailAddress || null,
    userName: clerkUser?.fullName || clerkUser?.firstName || null,
    user,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
