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
    getDoc,
    DocumentData,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import { 
    Auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import type { User, Permissions } from '@/lib/types';
import { z } from 'zod';
import { logAudit } from './log-service';

const USERS_COLLECTION = 'system_users';
const USERNAMES_COLLECTION = 'usernames';

const defaultAdminCreds = { 
  username: 'Administrator', 
  password: 'Admin@123',
  isApproved: true,
  permissions: {} as Permissions
};

// --- Schema Validation ---

/**
 * Zod schema for validating User data from Firestore.
 * Ensures data integrity and provides safe defaults.
 */
const UserSchema = zod.object({
    username: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    isApproved: z.boolean().optional().default(true),
    permissions: z.record(z.string(), z.array(z.string())).optional().default({}),
    passwordLastUpdated: z.string().optional(),
});

/**
 * Maps a Firestore document to a User object with strict validation.
 */
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): User => {
    const data = snapshot.data();
    const validated = UserSchema.parse(data);
    return {
        id: snapshot.id,
        username: validated.username,
        email: validated.email,
        isApproved: validated.isApproved,
        permissions: validated.permissions as Permissions,
        passwordLastUpdated: validated.passwordLastUpdated,
    };
};

// --- Cloud User Service ---

/**
 * Sets up a real-time listener for the cloud user registry.
 * 
 * @param callback - Function called with the array of active system users.
 * @returns An unsubscribe function to stop the listener.
 */
export const onUsersUpdate = (callback: (users: User[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, USERS_COLLECTION));
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(fromFirestore);
        callback(users);
    });
};

/**
 * Persists a user profile and synchronizes the username-to-email mapping.
 * 
 * @param user - The complete user object to save.
 * @throws Will throw an error if the Firestore write is denied.
 */
export const saveUser = async (user: User) => {
    const { db } = getFirebase();
    if (!user?.id) throw new Error("Invalid user ID for save.");

    const userRef = doc(db, USERS_COLLECTION, user.id);
    
    // Save the main user record
    await setDoc(userRef, {
        ...user,
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Log the action for security auditing
    logAudit(`Permissions/Status Updated for User: ${user.username}`, 'Security', {
        isApproved: user.isApproved,
        permissionMatrix: user.permissions
    });

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
 * Securely creates a new user account without disrupting the administrator's active session.
 * This is achieved by initializing a temporary secondary Firebase App instance.
 * 
 * @param auth - The primary Auth instance.
 * @param username - Unique system username.
 * @param email - Primary account email.
 * @param password - Initial secure password.
 * @returns The created Firebase Auth User object.
 * @throws Error if username is taken or password doesn't meet requirements.
 */
export const adminCreateUserWithUsername = async (auth: Auth, username: string, email: string, password: string) => {
    const { db } = getFirebase();
    const login = (username || '').toLowerCase().trim();
    if (!login) throw new Error("Username is required.");

    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    
    // 1. Check uniqueness
    const snap = await getDoc(usernameRef);
    if (snap.exists()) {
        throw new Error("Username already taken. Please choose another.");
    }

    // 2. Save mapping in Firestore
    await setDoc(usernameRef, { 
        email: email.toLowerCase().trim(), 
        username: login 
    });

    // 3. Create Auth Account using a secondary app instance
    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = (await import('firebase/auth')).getAuth(secondaryApp);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await deleteApp(secondaryApp);
        
        logAudit(`New User Created: ${login}`, 'Security', { email });
        
        return userCredential.user;
    } catch (error) {
        await deleteApp(secondaryApp);
        throw error;
    }
};

/**
 * Resolves a username to an email address and authenticates the user.
 * 
 * @param auth - The Auth instance.
 * @param username - The login username provided by the user.
 * @param password - The login password.
 * @returns A promise resolving to the Firebase UserCredential.
 * @throws Error if the username does not exist.
 */
export const loginWithUsername = async (auth: Auth, username: string, password: string) => {
    const { db } = getFirebase();
    const login = (username || '').toLowerCase().trim();
    if (!login) throw new Error("Username is required.");

    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    
    // 1. Look up email
    const snap = await getDoc(usernameRef);
    if (!snap.exists()) {
        throw new Error("Username does not exist in our system.");
    }

    const email = snap.data()?.email;
    if (!email) throw new Error("Account data corrupted. Please contact administrator.");
    
    // 2. Sign in with the resolved email
    return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Removes a user profile and their associated username mapping.
 * 
 * @param userId - The unique identifier of the user record.
 * @param username - The username to remove from the mapping collection.
 */
export const deleteUser = async (userId: string, username?: string) => {
    const { db } = getFirebase();
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
    if (username) {
        await deleteDoc(doc(db, USERNAMES_COLLECTION, username.toLowerCase().trim()));
        logAudit(`User Permanently Deleted: ${username}`, 'Security', { userId });
    }
};

/**
 * Look up a user record by either their username or email address.
 * 
 * @param loginString - The username or email address.
 * @returns The User object or null if no match found.
 */
export const getUserByLogin = async (loginString: string): Promise<User | null> => {
    const { db } = getFirebase();
    const login = (loginString || '').toLowerCase().trim();
    if (!login) return null;

    // Check mapping first
    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    const usernameSnap = await getDoc(usernameRef);
    
    let email = login;
    if (usernameSnap.exists()) {
        email = usernameSnap.data()?.email || login;
    }

    // Now find the full user record in system_users by email
    const qEmail = query(collection(db, USERS_COLLECTION), where("email", "==", email), limit(1));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) return fromFirestore(snapEmail.docs[0]);

    // Fallback search by username in system_users directly
    const qUsername = query(collection(db, USERS_COLLECTION), where("username", "==", login), limit(1));
    const snapUsername = await getDocs(qUsername);
    if (!snapUsername.empty) return fromFirestore(snapUsername.docs[0]);

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
    
    logAudit('Master Administrator Password Updated', 'Security');
};

/**
 * Validates a password against system complexity requirements.
 * Requirements: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.
 * 
 * @param password - The raw password string.
 * @param isRequired - Whether an empty string is allowed (useful for optional updates).
 * @returns Object indicating validity and specific error message.
 */
export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) return { isValid: true };
    if (isRequired && !password) return { isValid: false, error: 'Password is required.' };
    if ((password?.length || 0) < 8) return { isValid: false, error: 'Password must be at least 8 characters long.' };
    if (!/[a-z]/.test(password)) return { isValid: false, error: 'Password must contain a lowercase letter.' };
    if (!/[A-Z]/.test(password)) return { isValid: false, error: 'Password must contain an uppercase letter.' };
    if (!/[0-9]/.test(password)) return { isValid: false, error: 'Password must contain a number.' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { isValid: false, error: 'Password must contain a special character.' };
    return { isValid: true };
};

export const getUsers = async (): Promise<User[]> => {
    const { db } = getFirebase();
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    return snap.docs.map(fromFirestore);
};
