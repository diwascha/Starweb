
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
  login: (user: User) => Promise<void>;
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

const pageOrder: Module[] = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings'];

// Function to convert kebab-case to camelCase
const kebabToCamel = (s: string): Module => {
    // Special case for root path
    if (s === 'report' || s === 'product' || s === 'purchase-order') {
        return (s + 's') as Module;
    }
    const cameled = s.replace(/-./g, x => x[1].toUpperCase());
    return cameled as Module;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
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
  
  const hasPermission = useCallback((module: Module, action: Action): boolean => {
    if (!user) return false;
    // Admins and all users can view the dashboard
    if (module === 'dashboard' && action === 'view') return true;
    if (user.roleId === 'admin') return true;
    if (user.permissions) {
      const modulePermissions = user.permissions[module];
      return !!modulePermissions?.includes(action);
    }
    return false;
  }, [user]);

  const login = useCallback(async (userToLogin: User) => {
    let sessionToStore: UserSession;
    if (userToLogin.username === 'Administrator' && userToLogin.roleId === 'admin') {
      sessionToStore = {
        username: userToLogin.username,
        roleId: 'admin',
      };
    } else {
       sessionToStore = {
          username: userToLogin.username,
          roleId: 'user',
          permissions: userToLogin.permissions,
       };
    }
    sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionToStore));
    setUser(sessionToStore);
  }, []);

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
        const pathSegments = pathname.split('/').filter(Boolean);
        const pathModuleKebab = pathSegments[0] || 'dashboard';
        const currentModule = kebabToCamel(pathModuleKebab);

        const canViewCurrentModule = modules.includes(currentModule) && hasPermission(currentModule, 'view');
        
        if (!canViewCurrentModule) {
            const firstAllowedPage = pageOrder.find(module => hasPermission(module, 'view'));
            
            if (firstAllowedPage) {
                const redirectPath = `/${firstAllowedPage.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
                 if (pathname !== redirectPath) {
                    router.push(redirectPath);
                }
            } else {
                 if (pathname !== '/dashboard') {
                   router.push('/dashboard');
                }
            }
        }
    }
}, [user, loading, pathname, router, hasPermission]);
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
