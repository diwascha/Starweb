
'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import { modules } from '@/lib/types';
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

// Define the order of pages for redirection logic
const pageOrder: Module[] = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings'];


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
  
  const hasPermission = useCallback((module: Module, action: Action): boolean => {
    if (!user) return false;
    
    // Administrator has all permissions
    if (user.roleId === 'admin') return true;

    // For other users, check their specific permissions
    if (user.permissions) {
      const modulePermissions = user.permissions[module];
      return !!modulePermissions?.includes(action);
    }
    
    return false;
  }, [user]);

  const logout = useCallback(async () => {
    sessionStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
    router.push('/login');
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
        router.push('/login');
        return;
    }

    if (user && isAuthPage) {
        router.push('/dashboard');
        return;
    }

    if (user && !isAuthPage) {
        let currentModule = pathname.split('/')[1] as Module;

        // Handle special routing cases
        if (currentModule === 'report') {
            currentModule = 'reports';
        }
        
        // Root path should resolve to dashboard check
        if (currentModule === '') {
            currentModule = 'dashboard';
        }

        const canViewCurrentModule = modules.includes(currentModule) && hasPermission(currentModule, 'view');
        
        if (!canViewCurrentModule) {
            // Find the first page the user has access to and redirect
            const firstAllowedPage = pageOrder.find(module => hasPermission(module, 'view'));
            
            if (firstAllowedPage) {
                let redirectPath = `/${firstAllowedPage}`;
                router.push(redirectPath);
            } else {
                // If user has no view permissions at all, log them out or show an "access denied" page.
                // For simplicity, we can log them out.
                logout();
            }
        }
    }
}, [user, loading, pathname, router, hasPermission, logout]);


  const login = useCallback(async (userToLogin: UserSession) => {
    let sessionToStore: UserSession;
    if (userToLogin.username === 'Administrator') {
      sessionToStore = {
        username: userToLogin.username,
        roleId: 'admin',
      };
    } else {
       const foundUser = users.find(u => u.username === userToLogin.username);
       sessionToStore = {
          username: userToLogin.username,
          roleId: 'user',
          permissions: foundUser?.permissions,
       };
    }
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionToStore));
    setUser(sessionToStore);
  }, [users]);
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
