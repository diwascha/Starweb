'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import { modules } from '@/lib/types';
import { getAdminCredentials, getUserByLogin } from '@/services/user-service';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { toast } from '@/hooks/use-toast';

interface UserSession {
  id: string; // Firebase UID or local ID
  username: string;
  email?: string;
  isApproved: boolean;
  is_admin: boolean;
  permissions: Permissions;
  passwordLastUpdated?: string;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (user: User, isLocalAdmin?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (module: Module | string, action: Action | 'create') => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  hasPermission: () => false,
});

const USER_SESSION_KEY = 'user_session';

const moduleToPath = (module: Module): string => {
    if (module === 'dashboard') return '/dashboard';
    if (module === 'purchaseOrders') return '/purchase-orders';
    return `/${module}`;
};

/**
 * Identifies the core module from the URL path.
 */
const routeToCoreModule = (segment: string): Module | null => {
    const map: Record<string, Module> = {
        'dashboard': 'dashboard',
        'finance': 'finance',
        'report': 'reports',
        'reports': 'reports',
        'products': 'reports', 
        'purchase-orders': 'purchaseOrders',
        'raw-materials': 'purchaseOrders',
        'crm': 'crm',
        'hr': 'hr',
        'fleet': 'fleet',
        'rental': 'rental',
        'notes': 'notes',
        'settings': 'settings'
    };
    return map[segment] || null;
};

export const AuthRedirect = ({ children }: { children: ReactNode }) => {
    const { user, loading, hasPermission, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const getNormalizedPath = (path: string) => path.replace(/\/$/, '') || '/';

    useEffect(() => {
        if (loading) return;

        const normalizedPath = getNormalizedPath(pathname);
        const isAuthPage = normalizedPath === '/login';

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
            const firstSegment = pathSegments[0] || 'dashboard';
            const currentModule = routeToCoreModule(firstSegment);
            
            if (currentModule) {
                // If user doesn't have view permission for the current module, find the first one they do have.
                if (!hasPermission(currentModule, 'view')) {
                    const pageOrder: Module[] = ['dashboard', 'finance', 'reports', 'purchaseOrders', 'crm', 'hr', 'fleet', 'rental', 'notes', 'settings'];
                    const firstAllowed = pageOrder.find(m => hasPermission(m, 'view'));
                    
                    if (firstAllowed) {
                        const redirectPath = moduleToPath(firstAllowed);
                        if (normalizedPath !== getNormalizedPath(redirectPath)) {
                            router.push(redirectPath);
                        }
                    } else if (normalizedPath !== '/login') {
                         toast({ title: 'Access Denied', description: 'Your account has no authorized modules.', variant: 'destructive' });
                         logout();
                    }
                }
            }
        }
    }, [user, loading, pathname, router, hasPermission, logout]);

    const normalizedPath = getNormalizedPath(pathname);
    if (loading || (!user && normalizedPath !== '/login')) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Authorizing Session...</p>
                </div>
            </div>
        );
    }
    
    return <>{children}</>;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = useAuthService();

  const logout = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
  }, [auth]);

  useEffect(() => {
    const sessionJson = localStorage.getItem(USER_SESSION_KEY);
    if (sessionJson) {
      try {
        const session = JSON.parse(sessionJson);
        setUser(session);
      } catch {
        localStorage.removeItem(USER_SESSION_KEY);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const cloudUser = await getUserByLogin(firebaseUser.email || '');
        if (cloudUser && cloudUser.isApproved !== false) {
          const session: UserSession = {
            id: firebaseUser.uid,
            username: cloudUser.username,
            email: cloudUser.email,
            isApproved: true,
            is_admin: false,
            permissions: cloudUser.permissions || {},
            passwordLastUpdated: cloudUser.passwordLastUpdated
          };
          localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          setUser(session);
        } else {
          signOut(auth);
          localStorage.removeItem(USER_SESSION_KEY);
          setUser(null);
        }
      } else {
        const currentSessionJson = localStorage.getItem(USER_SESSION_KEY);
        if (currentSessionJson) {
            const currentSession = JSON.parse(currentSessionJson);
            if (!currentSession.is_admin) {
                localStorage.removeItem(USER_SESSION_KEY);
                setUser(null);
            }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);
  
  const login = useCallback(async (userToLogin: User, isLocalAdmin: boolean = false) => {
    if (isLocalAdmin) {
        const adminCreds = getAdminCredentials();
        const session: UserSession = {
            id: 'admin_user',
            username: userToLogin.username,
            isApproved: true,
            is_admin: true,
            permissions: {},
            passwordLastUpdated: adminCreds.passwordLastUpdated
        };
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
        setUser(session);
    } else {
         const session: UserSession = {
            id: userToLogin.id,
            username: userToLogin.username,
            email: userToLogin.email,
            isApproved: true,
            is_admin: false,
            permissions: userToLogin.permissions || {},
            passwordLastUpdated: userToLogin.passwordLastUpdated
        };
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
        setUser(session);
    }
  }, []);

  /**
   * Evaluates if a user has permission for a specific module and action.
   * Includes strictly isolated inheritance for child features.
   */
  const hasPermission = useCallback((module: string, action: Action | 'create'): boolean => {
    if (!user) return false;
    if (user.is_admin) return true;
    if (user.isApproved === false) return false;
    
    // Normalize 'create' legacy call to 'add'
    const act = action === 'create' ? 'add' : action;
    
    // Map sub-features to their primary module keys for inheritance
    let primaryKey: Module;
    const m = String(module);

    if (['invoice', 'tds', 'cheque', 'estimatedInvoices', 'tdsCalculations', 'cheques'].includes(m)) {
        primaryKey = 'finance';
    } else if (['payroll', 'attendance', 'analytics', 'bonus', 'payslip'].includes(m)) {
        primaryKey = 'hr';
    } else if (m === 'products') {
        primaryKey = 'reports';
    } else if (m === 'rawMaterials') {
        primaryKey = 'purchaseOrders';
    } else {
        primaryKey = module as Module;
    }
    
    const perms = user.permissions[primaryKey];
    if (!perms || !Array.isArray(perms)) return false;

    // Check for 'all' master override OR specific action match
    return perms.includes('all') || perms.includes(act as any);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
