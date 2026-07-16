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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const USERS_COLLECTION = 'system_users';
const USERNAMES_COLLECTION = 'usernames';

// --- Schema Validation ---

const UserSchema = z.object({
    username: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    isApproved: z.boolean().optional().default(true),
    isAdmin: z.boolean().optional().default(false),
    permissions: z.record(z.string(), z.array(z.string())).optional().default({}),
    passwordLastUpdated: z.string().optional(),
});

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): User => {
    const data = snapshot.data();
    const validated = UserSchema.parse(data);
    return {
        id: snapshot.id,
        username: validated.username,
        email: validated.email,
        isApproved: validated.isApproved,
        isAdmin: validated.isAdmin,
        permissions: validated.permissions as Permissions,
        passwordLastUpdated: validated.passwordLastUpdated,
    };
};

// --- Cloud User Service ---

export const onUsersUpdate = (callback: (users: User[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, USERS_COLLECTION));
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(fromFirestore);
        callback(users);
    }, async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: USERS_COLLECTION,
            operation: 'list',
        }));
    });
};

export const saveUser = async (user: User) => {
    const { db } = getFirebase();
    if (!user?.id) throw new Error("Invalid user ID for save.");

    const userRef = doc(db, USERS_COLLECTION, user.id);
    const payload = {
        ...user,
        updatedAt: serverTimestamp()
    };
    
    setDoc(userRef, payload, { merge: true }).then(() => {
        logAudit(`Permissions/Status Updated for User: ${user.username}`, 'Security', {
            isApproved: user.isApproved,
            isAdmin: user.isAdmin,
            permissionMatrix: user.permissions
        });
    }).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: userRef.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });

    if (user.username && user.email) {
        const usernameRef = doc(db, USERNAMES_COLLECTION, user.username.toLowerCase().trim());
        setDoc(usernameRef, { 
            email: user.email.toLowerCase().trim(), 
            username: user.username.toLowerCase().trim() 
        }, { merge: true }).catch(async (err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: usernameRef.path,
                operation: 'write',
            }));
        });
    }
};

export const adminCreateUserWithUsername = async (auth: Auth, username: string, email: string, password: string) => {
    const { db } = getFirebase();
    const login = (username || '').toLowerCase().trim();
    if (!login) throw new Error("Username is required.");

    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    
    // 1. Check uniqueness
    const snap = await getDoc(usernameRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: usernameRef.path, operation: 'get' }));
        throw err;
    });

    if (snap.exists()) {
        throw new Error("Username already taken. Please choose another.");
    }

    // 2. Save mapping in Firestore
    await setDoc(usernameRef, { 
        email: email.toLowerCase().trim(), 
        username: login 
    }).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: usernameRef.path, operation: 'write' }));
        throw err;
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

export const loginWithUsername = async (auth: Auth, username: string, password: string) => {
    const { db } = getFirebase();
    const login = (username || '').toLowerCase().trim();
    if (!login) throw new Error("Username is required.");

    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    
    const snap = await getDoc(usernameRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: usernameRef.path, operation: 'get' }));
        throw err;
    });

    if (!snap.exists()) {
        throw new Error("Username does not exist in our system.");
    }

    const email = snap.data()?.email;
    if (!email) throw new Error("Account data corrupted. Please contact administrator.");
    
    return signInWithEmailAndPassword(auth, email, password);
};

export const deleteUser = async (userId: string, username?: string) => {
    const { db } = getFirebase();
    const userRef = doc(db, USERS_COLLECTION, userId);
    
    deleteDoc(userRef).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: userRef.path, operation: 'delete' }));
    });

    if (username) {
        const usernameRef = doc(db, USERNAMES_COLLECTION, username.toLowerCase().trim());
        deleteDoc(usernameRef).catch(err => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: usernameRef.path, operation: 'delete' }));
        });
        logAudit(`User Permanently Deleted: ${username}`, 'Security', { userId });
    }
};

export const getUserByLogin = async (loginString: string): Promise<User | null> => {
    const { db } = getFirebase();
    const login = (loginString || '').toLowerCase().trim();
    if (!login) return null;

    const usernameRef = doc(db, USERNAMES_COLLECTION, login);
    const usernameSnap = await getDoc(usernameRef).catch(() => null);
    
    let email = login;
    if (usernameSnap?.exists()) {
        email = usernameSnap.data()?.email || login;
    }

    const qEmail = query(collection(db, USERS_COLLECTION), where("email", "==", email), limit(1));
    const snapEmail = await getDocs(qEmail).catch(() => null);
    if (snapEmail && !snapEmail.empty) return fromFirestore(snapEmail.docs[0]);

    const qUsername = query(collection(db, USERS_COLLECTION), where("username", "==", login), limit(1));
    const snapUsername = await getDocs(qUsername).catch(() => null);
    if (snapUsername && !snapUsername.empty) return fromFirestore(snapUsername.docs[0]);

    return null;
};

export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) return { isValid: true };
    if (isRequired && !password) return { isValid: false, error: 'Password is required.' };
    if ((password?.length || 0) < 12) return { isValid: false, error: 'Password must be at least 12 characters long.' };
    
    const blacklist = ['password123', 'admin@123', 'starsutra123'];
    if (blacklist.includes(password.toLowerCase())) return { isValid: false, error: 'This password is too common and easily guessed.' };

    if (!/[a-z]/.test(password)) return { isValid: false, error: 'Password must contain a lowercase letter.' };
    if (!/[A-Z]/.test(password)) return { isValid: false, error: 'Password must contain an uppercase letter.' };
    if (!/[0-9]/.test(password)) return { isValid: false, error: 'Password must contain a number.' };
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { isValid: false, error: 'Password must contain a special character.' };
    return { isValid: true };
};

export const getUsers = async (): Promise<User[]> => {
    const { db } = getFirebase();
    try {
        const snap = await getDocs(collection(db, USERS_COLLECTION));
        return snap.docs.map(fromFirestore);
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: USERS_COLLECTION,
            operation: 'list',
        }));
        throw error;
    }
};