
'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import useLocalStorage from './use-local-storage';

interface UserSession {
  username: string;
  roleId: string; // 'admin' or 'user'
  permissions?: Permissions;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (user: UserSession) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (module: Module, action: Action) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  hasPermission: () => false,
});

const USER_SESSION_KEY = 'user_session';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [users] = useLocalStorage<User[]>('users', []);
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

  const login = useCallback(async (userToLogin: UserSession) => {
    const foundUser = users.find(u => u.username === userToLogin.username);
    const sessionToStore: UserSession = {
      username: userToLogin.username,
      roleId: userToLogin.username === 'Administrator' ? 'admin' : 'user',
      permissions: foundUser?.permissions,
    };
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionToStore));
    setUser(sessionToStore);
  }, [users]);

  const logout = useCallback(async () => {
    sessionStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
    router.push('/login');
  }, [router]);

  const hasPermission = useCallback((module: Module, action: Action): boolean => {
    if (!user) return false;
    
    // Administrator has all permissions
    if (user.roleId === 'admin') return true;

    // For other users, check their specific permissions
    if (user.permissions) {
      const modulePermissions = user.permissions[module];
      if (!modulePermissions) return false;
      return modulePermissions.includes(action);
    }
    
    return false;
  }, [user]);
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

    