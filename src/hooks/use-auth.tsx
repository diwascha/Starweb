
'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import { modules } from '@/lib/types';
import { getAdminCredentials } from '@/lib/utils';


interface UserSession {
  username: string;
  is_admin: boolean;
  permissions: Permissions;
  passwordLastUpdated?: string;
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

const pageOrder: Module[] = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings', 'hr', 'fleet'];

// Function to convert kebab-case to camelCase
const kebabToCamel = (s: string): Module | string => {
    const specialCases: Record<string, Module> = {
      'report': 'reports',
      'reports/list': 'reports',
      'products': 'products',
      'purchase-orders': 'purchaseOrders',
      'purchase-orders/list': 'purchaseOrders',
      'raw-materials': 'rawMaterials',
      'settings': 'settings',
      'hr': 'hr',
      'hr/employees': 'hr',
      'hr/attendance': 'hr',
      'fleet': 'fleet',
      'fleet/vehicles': 'fleet',
      'fleet/drivers': 'fleet',
      'dashboard': 'dashboard',
    };
    if (specialCases[s]) {
        return specialCases[s];
    }
    const cameled = s.replace(/-./g, x => x[1].toUpperCase());
    return cameled;
};

const moduleToPath = (module: Module): string => {
    if (module === 'dashboard') return '/dashboard';
    
    const kebab = module.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    return `/${kebab}`;
}


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
    if (user.is_admin) return true;
    if (module === 'dashboard' && action === 'view') return true;
    if (user.permissions) {
      const modulePermissions = user.permissions[module];
      return !!modulePermissions?.includes(action);
    }
    return false;
  }, [user]);

  const login = useCallback(async (userToLogin: User) => {
    let sessionToStore: UserSession;
    const isAdmin = userToLogin.id === 'admin';

    if (isAdmin) {
        const adminCreds = getAdminCredentials();
        sessionToStore = {
            username: userToLogin.username,
            is_admin: true,
            permissions: {},
            passwordLastUpdated: adminCreds.passwordLastUpdated,
        };
    } else {
        sessionToStore = {
            username: userToLogin.username,
            is_admin: false,
            permissions: userToLogin.permissions,
            passwordLastUpdated: userToLogin.passwordLastUpdated,
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
        if (pathSegments.length === 0) return; // Root page is handled by page.tsx

        const mainSegment = pathSegments.join('/');
        const currentModuleAttempt = kebabToCamel(mainSegment);
        
        const isAlreadyOnPermittedModuleDashboard = modules.includes(currentModuleAttempt as Module) && hasPermission(currentModuleAttempt as Module, 'view');
        if (isAlreadyOnPermittedModuleDashboard) {
            return; // No redirect needed
        }

        if (modules.includes(currentModuleAttempt as Module)) {
            const currentModule = currentModuleAttempt as Module;
            const canViewCurrentModule = hasPermission(currentModule, 'view');
            
            if (!canViewCurrentModule) {
                const firstAllowedPage = pageOrder.find(module => hasPermission(module, 'view'));
                
                if (firstAllowedPage) {
                     const redirectPath = moduleToPath(firstAllowedPage);
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
    }
}, [user, loading, pathname, router, hasPermission]);
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
