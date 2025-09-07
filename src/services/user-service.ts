import type { User, Permissions, Module, Action } from '@/lib/types';

const USERS_KEY = 'users';
const ADMIN_CREDS_KEY = 'admin_credentials';

const defaultAdminCreds = { 
  username: 'Administrator', 
  password: 'Admin@123',
  passwordLastUpdated: new Date().toISOString(),
};

// --- Regular Users ---

export const getUsers = (): User[] => {
  if (typeof window === 'undefined') return [];
  const usersJson = localStorage.getItem(USERS_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
};

export const setUsers = (users: User[]): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    // Dispatch a storage event to notify other tabs/windows
    window.dispatchEvent(new Event('storage'));
  }
};

export const updateUserPassword = (userId: string, newPassword: string): void => {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex > -1) {
        users[userIndex].password = newPassword;
        users[userIndex].passwordLastUpdated = new Date().toISOString();
        setUsers(users);
    } else {
        throw new Error("User not found.");
    }
};

// --- Admin Credentials ---

export const getAdminCredentials = (): { username: string, password?: string, passwordLastUpdated?: string } => {
  if (typeof window === 'undefined') {
    return defaultAdminCreds;
  }
  const storedCreds = localStorage.getItem(ADMIN_CREDS_KEY);
  if (storedCreds) {
    try {
      const parsed = JSON.parse(storedCreds);
      if (!parsed.password) {
        parsed.password = defaultAdminCreds.password;
        localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(defaultAdminCreds));
      return defaultAdminCreds;
    }
  }
  localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(defaultAdminCreds));
  return defaultAdminCreds;
};

export const setAdminPassword = (newPassword: string, passwordLastUpdated: string): void => {
  if (typeof window !== 'undefined') {
    const creds = getAdminCredentials();
    creds.password = newPassword;
    creds.passwordLastUpdated = passwordLastUpdated;
    localStorage.setItem(ADMIN_CREDS_KEY, JSON.stringify(creds));
  }
};


export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) {
        return { isValid: true };
    }

    if (isRequired && !password) {
        return { isValid: false, error: 'Password is required.' };
    }

    if (password.length < 8) {
        return { isValid: false, error: 'Password must be at least 8 characters long.' };
    }
    if (!/[a-z]/.test(password)) {
        return { isValid: false, error: 'Password must contain a lowercase letter.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, error: 'Password must contain an uppercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { isValid: false, error: 'Password must contain a number.' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { isValid: false, error: 'Password must contain a special character.' };
    }
    return { isValid: true };
}

// This function is intended to be used on the server, but we'll mock it for client-side use
// In a real server environment, you would get the user from the session/request
export const hasPermission = (module: Module, action: Action): boolean => {
    if (typeof window === 'undefined') {
        // On the server, we don't have user context without a proper session setup
        // We might default to false or try to get session info if available
        return true; // For this mock, assume true on server
    }
    const storedUserJson = localStorage.getItem('user_session');
    if (!storedUserJson) return false;

    const user = JSON.parse(storedUserJson);
    if (!user) return false;
    if (user.is_admin) return true;
    if (module === 'dashboard' && action === 'view') return true;
    if (user.permissions) {
      const modulePermissions = user.permissions[module];
      return !!modulePermissions?.includes(action);
    }
    return false;
}
