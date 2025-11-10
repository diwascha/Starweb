'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import { modules } from '@/lib/types';
import { getAdminCredentials, getUsers } from '@/services/user-service';
import { onAuthStateChanged, signOut, Auth } from 'firebase/auth';
import { useAuthService } from '@/firebase';

interface UserSession {
  id: string; // Firebase UID or a local ID for admin
  username: string;
  is_admin: boolean;
  permissions: Permissions;
  passwordLastUpdated?: string;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (user: User, isLocalAdmin?: boolean) => Promise<void>;
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

const pageOrder: Module[] = ['dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings', 'hr', 'fleet', 'crm', 'finance'];

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
      'crm': 'crm',
      'finance': 'finance',
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

const AuthRedirect = ({ children }: { children: ReactNode }) => {
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
            
            const firstSegment = pathSegments[0] || 'dashboard';
            const currentModuleAttempt = kebabToCamel(firstSegment);
            
            if (modules.includes(currentModuleAttempt as Module)) {
                const currentModule = currentModuleAttempt as Module;
                if (!hasPermission(currentModule, 'view')) {
                    const firstAllowedPage = pageOrder.find(module => hasPermission(module, 'view'));
                    
                    const redirectPath = firstAllowedPage ? moduleToPath(firstAllowedPage) : '/dashboard';

                    if (pathname !== redirectPath) {
                        router.push(redirectPath);
                    }
                }
            }
        }
    }, [user, loading, pathname, router, hasPermission]);


    if (loading || (!user && pathname !== '/login')) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading session...</p>
            </div>
        );
    }
    
    // This check ensures children of AuthRedirect are only rendered when appropriate
    if (user && !loading && pathname !== '/login') {
         return <>{children}</>;
    }

    if (!user && !loading && pathname === '/login') {
        return <>{children}</>;
    }
    
    return (
        <div className="flex h-screen items-center justify-center">
            <p>Loading application...</p>
        </div>
    );
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = useAuthService();

  useEffect(() => {
    const sessionJson = localStorage.getItem(USER_SESSION_KEY);
    if (sessionJson) {
      try {
        const session = JSON.parse(sessionJson);
        setUser(session);
      } catch {
        // Invalid session, clear it
        localStorage.removeItem(USER_SESSION_KEY);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const username = firebaseUser.email?.split('@')[0] || '';
        const localUsers = getUsers();
        const localUser = localUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (localUser) {
          const session: UserSession = {
            id: firebaseUser.uid,
            username: localUser.username,
            is_admin: false,
            permissions: localUser.permissions,
            passwordLastUpdated: localUser.passwordLastUpdated
          };
          localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          setUser(session);
        } else {
          // This case can happen if a user was deleted from local storage but not firebase
          signOut(auth);
          localStorage.removeItem(USER_SESSION_KEY);
          setUser(null);
        }
      } else {
        // Only clear non-admin users on auth state change
        if (user && !user.is_admin) {
            localStorage.removeItem(USER_SESSION_KEY);
            setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, user]); // Added user to dependencies
  
  const login = useCallback(async (userToLogin: User, isLocalAdmin: boolean = false) => {
    if (isLocalAdmin) {
        const adminCreds = getAdminCredentials();
        const session: UserSession = {
            id: 'admin_user',
            username: userToLogin.username,
            is_admin: true,
            permissions: {},
            passwordLastUpdated: adminCreds.passwordLastUpdated
        };
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
        setUser(session);
    }
    // Firebase users are handled by onAuthStateChanged
  }, []);

  const hasPermission = useCallback((module: Module, action: Action): boolean => {
    if (!user) return false;
    if (user.is_admin) return true;
    
    // Grant CRM view if Finance view is present
    if (module === 'crm' && action === 'view') {
        const financePerms = user.permissions['finance'];
        if (financePerms && financePerms.includes('view')) {
            return true;
        }
    }
    
    const modulePermissions = user.permissions[module];
    return !!modulePermissions?.includes(action);
  }, [user]);
  
  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
  }, [auth]);
  
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { AuthRedirect };
