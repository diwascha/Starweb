
'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Mock user object
interface User {
  username: string;
  // We can add roles here later
  role?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

const USER_SESSION_KEY = 'user_session';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const storedUser = sessionStorage.getItem(USER_SESSION_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from session storage", error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login';
      if (user && isAuthPage) {
        router.push('/dashboard');
      }
      if (!user && !isAuthPage) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);


  const login = useCallback(async (username: string) => {
    // In a real app, you might fetch user details here
    const userToStore: User = { username, role: 'Administrator' };
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(userToStore));
    setUser(userToStore);
  }, []);

  const logout = useCallback(async () => {
    sessionStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
    router.push('/login');
  }, [router]);
  

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
