
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

const kebabToCamel = (s: string): Module | string => {
    const segments = s.split('/');
    const mainSegment = segments[0];

    const specialCases: Record<string, Module> = {
      'report': 'reports',
      'reports': 'reports',
      'products': 'products',
      'purchase-orders': 'purchaseOrders',
      'raw-materials': 'rawMaterials',
      'settings': 'settings',
      'hr': 'hr',
      'fleet': 'fleet',
      'dashboard': 'dashboard',
    };
    if (specialCases[mainSegment]) {
        return specialCases[mainSegment];
    }
    const cameled = mainSegment.replace(/-./g, x => x[1].toUpperCase());
    return cameled;
};

const moduleToPath = (module: Module): string => {
    if (module === 'dashboard') return '/dashboard';
    const kebab = module.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    return `/${kebab}`;
}

const AuthRedirect = ({ children }: { children: (user: UserSession) => ReactNode }) => {
    const { user, loading, hasPermission } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

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

        if (user && !isAuthPage && !user.is_admin) {
            const pathSegments = pathname.split('/').filter(Boolean);
            if (pathSegments.length === 0 && pathname !== '/dashboard') return;

            const currentModuleAttempt = kebabToCamel(pathSegments[0] || 'dashboard');
            
            if (modules.includes(currentModuleAttempt as Module)) {
                const currentModule = currentModuleAttempt as Module;
                if (!hasPermission(currentModule, 'view')) {
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

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }
    
    if (pathname === '/login') {
        return <>{children(user!)}</>; // This is fine because the layout won't render for /login
    }

    if (!user) {
       return (
            <div className="flex h-screen items-center justify-center">
                <p>Redirecting to login...</p>
            </div>
        );
    }
    
    return <>{children(user)}</>;
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { AuthRedirect };
