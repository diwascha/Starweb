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

const AuthRedirect = ({ children }: { children: ReactNode }) => {
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

const useInactivityLogout = (logout: () => void, timeout = 1800000) => {
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(logout, timeout);
    }, [logout, timeout]);

    useEffect(() => {
        const events = ['mousemove', 'keydown', 'click', 'scroll'];
        const handleActivity = () => resetTimer();
        events.forEach(event => window.addEventListener(event, handleActivity));
        resetTimer();
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, handleActivity));
        };
    }, [resetTimer]);
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

  useInactivityLogout(logout, 30 * 60 * 1000);

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

  const hasPermission = useCallback((module: Module | string, action: Action | 'create'): boolean => {
    if (!user) return false;
    if (user.is_admin) return true;
    if (user.isApproved === false) return false;
    
    // 1. Map legacy 'create' to new 'add' modality
    const act = action === 'create' ? 'add' : action;
    const mod = module as Module;
    
    // 2. Map inherited sub-modules to primary keys
    let primaryKey: Module = mod;
    if (mod === 'products') primaryKey = 'reports';
    if (mod === 'rawMaterials') primaryKey = 'purchaseOrders';
    
    // 3. Strict Primary Key Check
    const perms = user.permissions[primaryKey];
    if (!perms || !Array.isArray(perms)) return false;

    // 4. Admin 'all' override for this specific module
    if (perms.includes('all')) return true;

    // 5. Explicit action check
    return perms.includes(act as any);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { AuthRedirect };
