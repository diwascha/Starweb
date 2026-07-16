'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User, Permissions, Module, Action } from '@/lib/types';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { toast } from '@/hooks/use-toast';
import { getFirebase } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { logAudit } from '@/services/log-service';

interface UserSession {
  id: string;
  username: string;
  email?: string;
  isApproved: boolean;
  isAdmin: boolean;
  permissions: Permissions;
  passwordLastUpdated?: string;
  sessionCreatedAt: number;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (user: User, isLocalAdmin?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (module: string, action: Action | 'create') => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  hasPermission: () => false,
});

const USER_SESSION_KEY = 'user_session';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 Hours

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

export const AuthRedirect = ({ children }: { children: ReactNode }) => {
    const { user, loading, hasPermission, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const getNormalizedPath = (path: string) => path?.replace(/\/$/, '') || '/';

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

        if (user && !isAuthPage && !user.isAdmin) {
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = useAuthService();

  const logout = useCallback(async () => {
    logAudit('User Logout Initiated', 'Security');
    try {
        await signOut(auth);
    } catch (e) {
        console.error("Firebase signOut failure", e);
    }
    localStorage.removeItem(USER_SESSION_KEY);
    setUser(null);
  }, [auth]);

  useEffect(() => {
    const sessionJson = localStorage.getItem(USER_SESSION_KEY);
    if (sessionJson) {
      try {
        const session = JSON.parse(sessionJson) as UserSession;
        if (session && session.sessionCreatedAt && (Date.now() - session.sessionCreatedAt > SESSION_MAX_AGE)) {
             localStorage.removeItem(USER_SESSION_KEY);
             setUser(null);
             toast({ title: 'Session Expired', description: 'Please login again for security.' });
        } else if (session) {
            setUser(session);
        }
      } catch {
        localStorage.removeItem(USER_SESSION_KEY);
      }
    }

    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
      }

      if (firebaseUser) {
        const { db } = getFirebase();
        const userDocRef = doc(db, 'system_users', firebaseUser.uid);
        
        unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
            if (!docSnap.exists()) {
                // If user is logged into Auth but no Firestore doc exists,
                // we'll try to sign them out or redirect to a profile setup.
                // For an admin manually created, this doc MUST exist.
                logout();
                return;
            }
            
            const data = docSnap.data();
            
            if (data.isApproved === false) {
                toast({ title: 'Access Revoked', description: 'Account pending approval.', variant: 'destructive' });
                logout();
                return;
            }

            const currentSessionJson = localStorage.getItem(USER_SESSION_KEY);
            if (currentSessionJson) {
                try {
                    const localSession = JSON.parse(currentSessionJson) as UserSession;
                    if (data.passwordLastUpdated && localSession.passwordLastUpdated && 
                        data.passwordLastUpdated !== localSession.passwordLastUpdated) {
                        toast({ title: 'Session Invalid', description: 'Password change detected. Please log in again.' });
                        logout();
                        return;
                    }
                } catch { }
            }

            const session: UserSession = {
                id: firebaseUser.uid,
                username: data.username || 'unknown',
                email: firebaseUser.email || data.email,
                isApproved: true,
                isAdmin: !!data.isAdmin,
                permissions: data.permissions || {},
                passwordLastUpdated: data.passwordLastUpdated,
                sessionCreatedAt: Date.now()
            };
            
            localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
            setUser(session);
        }, (err) => {
            console.error("User sync failure:", err);
            // Don't logout on intermittent connectivity issues
        });

      } else {
        const currentSessionJson = localStorage.getItem(USER_SESSION_KEY);
        if (currentSessionJson) {
            try {
                const currentSession = JSON.parse(currentSessionJson);
                if (currentSession && !currentSession.isAdmin) {
                    localStorage.removeItem(USER_SESSION_KEY);
                    setUser(null);
                }
            } catch {
                localStorage.removeItem(USER_SESSION_KEY);
                setUser(null);
            }
        }
      }
      setLoading(false);
    });

    return () => {
        unsubscribeAuth();
        if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [auth, logout]);
  
  const login = useCallback(async (userToLogin: User, isLocalAdmin: boolean = false) => {
    if (!userToLogin) return;
    
    const now = Date.now();
    const session: UserSession = {
        id: userToLogin.id,
        username: userToLogin.username,
        email: userToLogin.email,
        isApproved: true,
        isAdmin: !!userToLogin.isAdmin,
        permissions: userToLogin.permissions || {},
        passwordLastUpdated: userToLogin.passwordLastUpdated,
        sessionCreatedAt: now
    };
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    setUser(session);
  }, []);

  const hasPermission = useCallback((module: string, action: Action | 'create'): boolean => {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (user.isApproved === false) return false;
    
    const act = action === 'create' ? 'add' : action;
    const m = String(module || '');

    let primaryKey: Module | null = null;

    if (['finance', 'invoice', 'tds', 'cheque', 'estimatedInvoices', 'tdsCalculations', 'cheques'].includes(m)) {
        primaryKey = 'finance';
    } else if (['hr', 'payroll', 'attendance', 'analytics', 'bonus', 'payslip'].includes(m)) {
        primaryKey = 'hr';
    } else if (['reports', 'products'].includes(m)) {
        primaryKey = 'reports';
    } else if (['purchaseOrders', 'rawMaterials'].includes(m)) {
        primaryKey = 'purchaseOrders';
    } else if (m === 'dashboard') {
        primaryKey = 'dashboard';
    } else if (m === 'fleet') {
        primaryKey = 'fleet';
    } else if (m === 'rental') {
        primaryKey = 'rental';
    } else if (m === 'crm') {
        primaryKey = 'crm';
    } else if (m === 'notes') {
        primaryKey = 'notes';
    } else if (m === 'settings') {
        primaryKey = 'settings';
    }

    if (!primaryKey) return false;

    const perms = user.permissions[primaryKey];
    if (!perms || !Array.isArray(perms)) return false;

    return perms.includes('all') || perms.includes(act as any);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);