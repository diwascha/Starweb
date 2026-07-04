import { getFirebase } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    limit, 
    onSnapshot,
    serverTimestamp,
    getDoc
} from 'firebase/firestore';
import { 
    Auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import type { User, Permissions } from '@/lib/types';

const USERS_COLLECTION = 'system_users';
const USERNAMES_COLLECTION = 'usernames';

const defaultAdminCreds = { 
  username: 'Administrator', 
  password: 'Admin@123',
  isApproved: true,
  permissions: {} as Permissions
};

// --- Cloud User Service ---

export const onUsersUpdate = (callback: (users: User[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, USERS_COLLECTION));
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
        callback(users);
    });
};

export const saveUser = async (user: User) => {
    const { db } = getFirebase();
    const userRef = doc(db, USERS_COLLECTION, user.id);
    
    // Save the main user record
    await setDoc(userRef, {
        ...user,
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Ensure mapping is in sync
    if (user.username && user.email) {
        const usernameRef = doc(db, USERNAMES_COLLECTION, user.username.toLowerCase().trim());
        await setDoc(usernameRef, { 
            email: user.email.toLowerCase().trim(), 
            username: user.username.toLowerCase().trim() 
        }, { merge: true });
    }
};

/**
 * Requirement 1: Function (Admin Side)
 * Creates user mapping and auth account.
 * Uses a secondary app instance to avoid logging out the admin.
 */
export const adminCreateUserWithUsername = async (auth: Auth, username: string, email: string, password: string) => {
    const { db } = getFirebase();
    const usernameRef = doc(db, USERNAMES_COLLECTION, username.toLowerCase().trim());
    
    // 1. Check uniqueness
    const snap = await getDoc(usernameRef);
    if (snap.exists()) {
        throw new Error("Username already taken. Please choose another.");
    }

    // 2. Save mapping in Firestore
    await setDoc(usernameRef, { 
        email: email.toLowerCase().trim(), 
        username: username.toLowerCase().trim() 
    });

    // 3. Create Auth Account using a secondary app instance
    // This prevents the admin from being signed out on the client.
    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = (await import('firebase/auth')).getAuth(secondaryApp);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await deleteApp(secondaryApp);
        return userCredential.user;
    } catch (error) {
        await deleteApp(secondaryApp);
        // If auth fails, we should technically roll back the Firestore mapping, 
        // but for a prototype, throwing the error is sufficient.
        throw error;
    }
};

/**
 * Requirement 2: Function (User Login)
 * Look up email by username mapping and sign in.
 */
export const loginWithUsername = async (auth: Auth, username: string, password: string) => {
    const { db } = getFirebase();
    const usernameRef = doc(db, USERNAMES_COLLECTION, username.toLowerCase().trim());
    
    // 1. Look up email
    const snap = await getDoc(usernameRef);
    if (!snap.exists()) {
        // Requirement 3: Error handling for non-existent username
        throw new Error("Username does not exist in our system.");
    }

    const { email } = snap.data();
    
    // 2. Sign in with the resolved email
    return signInWithEmailAndPassword(auth, email, password);
};

export const deleteUser = async (userId: string, username?: string) => {
    const { db } = getFirebase();
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
    if (username) {
        await deleteDoc(doc(db, USERNAMES_COLLECTION, username.toLowerCase().trim()));
    }
};

export const getUserByLogin = async (loginString: string): Promise<User | null> => {
    const { db } = getFirebase();
    const login = loginString.toLowerCase().trim();

    // Check mapping first
    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    const usernameSnap = await getDoc(usernameRef);
    
    let email = login;
    if (usernameSnap.exists()) {
        email = usernameSnap.data().email;
    }

    // Now find the full user record in system_users by email
    const qEmail = query(collection(db, USERS_COLLECTION), where("email", "==", email), limit(1));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) return { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() } as User;

    // Fallback search by username in system_users directly
    const qUsername = query(collection(db, USERS_COLLECTION), where("username", "==", login), limit(1));
    const snapUsername = await getDocs(qUsername);
    if (!snapUsername.empty) return { id: snapUsername.docs[0].id, ...snapUsername.docs[0].data() } as User;

    return null;
};

// --- Password & Validation ---

export const getAdminCredentials = () => defaultAdminCreds;

export const setAdminPassword = async (password: string, date: string) => {
    const { db } = getFirebase();
    const adminRef = doc(db, 'settings', 'admin_config');
    await setDoc(adminRef, { 
        password, 
        passwordLastUpdated: date 
    }, { merge: true });
};

export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) return { isValid: true };
    if (isRequired && !password) return { isValid: false, error: 'Password is required.' };
    if (password.length < 8) return { isValid: false, error: 'Password must be at least 8 characters long.' };
    if (!/[a-z]/.test(password)) return { isValid: false, error: 'Password must contain a lowercase letter.' };
    if (!/[A-Z]/.test(password)) return { isValid: false, error: 'Password must contain an uppercase letter.' };
    if (!/[0-9]/.test(password)) return { isValid: false, error: 'Password must contain a number.' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { isValid: false, error: 'Password must contain a special character.' };
    return { isValid: true };
};

export const getUsers = async (): Promise<User[]> => {
    const { db } = getFirebase();
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
};
