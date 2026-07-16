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
    updatePassword
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import type { User, Permissions } from '@/lib/types';
import { z } from 'zod';
import { logAudit } from './log-service';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { COLLECTIONS } from '@/lib/constants';

const UserSchema = z.object({
    username: z.string().min(1).catch('unknown'),
    email: z.string().email().optional().or(z.literal('')).catch(''),
    isApproved: z.boolean().optional().default(true).catch(true),
    isAdmin: z.boolean().optional().default(false).catch(false),
    permissions: z.record(z.string(), z.array(z.string())).optional().default({}).catch({}),
    passwordLastUpdated: z.string().optional(),
});

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | any): User => {
    const data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
    const validated = UserSchema.parse(data);
    return {
        id: snapshot.id || '',
        username: validated.username,
        email: validated.email,
        isApproved: validated.isApproved,
        isAdmin: validated.isAdmin,
        permissions: validated.permissions as Permissions,
        passwordLastUpdated: validated.passwordLastUpdated,
    };
};

export const onUsersUpdate = (callback: (users: User[]) => void) => {
    const { db } = getFirebase();
    const q = query(collection(db, COLLECTIONS.SYSTEM_USERS));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.SYSTEM_USERS, operation: 'list' }));
        }
    });
};

export const saveUser = async (user: User) => {
    const { db } = getFirebase();
    if (!user?.id) throw new Error("Invalid user ID.");

    const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, user.id);
    const payload = { ...user, updatedAt: serverTimestamp() };
    
    setDoc(userRef, payload, { merge: true }).catch(async (err: any) => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: userRef.path,
                operation: 'update',
                requestResourceData: payload,
            }));
        }
    });

    if (user.username && user.email) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, user.username.toLowerCase().trim());
        setDoc(usernameRef, { 
            email: user.email.toLowerCase().trim(), 
            username: user.username.toLowerCase().trim() 
        }, { merge: true }).catch(async (err: any) => {
             if (err.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: usernameRef.path, operation: 'write' }));
             }
        });
    }
};

/**
 * Updates the currently logged-in user's password and metadata.
 */
export const setAdminPassword = async (password: string, updatedAt: string) => {
    const { auth, db } = getFirebase();
    if (!auth.currentUser) throw new Error("No authenticated session found.");
    
    try {
        await updatePassword(auth.currentUser, password);
        
        // Synchronize metadata to ensure sessions on other devices are invalidated
        const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, auth.currentUser.uid);
        await updateDoc(userRef, { 
            passwordLastUpdated: updatedAt 
        });
        
        logAudit('Administrative Key Updated', 'Security');
    } catch (error: any) {
        if (error.code === 'auth/requires-recent-login') {
            throw new Error("This operation requires a fresh login session. Please sign out and sign back in before changing your password.");
        }
        throw error;
    }
};

export const adminCreateUserWithUsername = async (auth: Auth, username: string, email: string, password: string) => {
    const { db } = getFirebase();
    const login = (username || '').toLowerCase().trim();
    if (!login) throw new Error("Username required.");

    const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
    const snap = await getDoc(usernameRef);

    if (snap.exists()) {
        throw new Error("Username taken.");
    }

    await setDoc(usernameRef, { email: email.toLowerCase().trim(), username: login });

    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = (await import('firebase/auth')).getAuth(secondaryApp);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await deleteApp(secondaryApp);
        logAudit(`New User Created: ${login}`, 'Security');
        return userCredential.user;
    } catch (error) {
        await deleteApp(secondaryApp);
        throw error;
    }
};

/**
 * Robust login supporting direct email or registered username.
 */
export const loginWithUsername = async (auth: Auth, loginString: string, password: string) => {
    const { db } = getFirebase();
    const login = (loginString || '').toLowerCase().trim();
    
    let email = login;

    // If the input doesn't look like an email, assume it's a username and try to resolve it.
    if (!login.includes('@')) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
        const snap = await getDoc(usernameRef);
        
        if (snap.exists()) {
            email = snap.data()?.email || login;
        } else {
            // Fallback: search system_users for this username directly if registry is missing
            const q = query(collection(db, COLLECTIONS.SYSTEM_USERS), where("username", "==", login), limit(1));
            const userSnap = await getDocs(q);
            if (!userSnap.empty) {
                email = userSnap.docs[0].data().email;
            }
        }
    }

    return signInWithEmailAndPassword(auth, email, password);
};

export const getUserById = async (uid: string): Promise<User | null> => {
    const { db } = getFirebase();
    const userDocRef = doc(db, COLLECTIONS.SYSTEM_USERS, uid);
    const snap = await getDoc(userDocRef);
    return snap.exists() ? fromFirestore(snap) : null;
};

export const deleteUser = async (userId: string, username?: string) => {
    const { db } = getFirebase();
    const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, userId);
    
    deleteDoc(userRef).catch(err => {
        if (err.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: userRef.path, operation: 'delete' }));
        }
    });

    if (username) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, username.toLowerCase().trim());
        deleteDoc(usernameRef);
    }
};

export const getUserByLogin = async (loginString: string): Promise<User | null> => {
    const { db } = getFirebase();
    const login = (loginString || '').toLowerCase().trim();
    const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
    const usernameSnap = await getDoc(usernameRef);
    
    let email = login;
    if (usernameSnap?.exists()) {
        email = usernameSnap.data()?.email || login;
    }

    const qEmail = query(collection(db, COLLECTIONS.SYSTEM_USERS), where("email", "==", email), limit(1));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) return fromFirestore(snapEmail.docs[0]);

    return null;
};

export const validatePassword = (password: string, isRequired: boolean = true): { isValid: boolean, error?: string } => {
    if (!isRequired && !password) return { isValid: true };
    if (isRequired && !password) return { isValid: false, error: 'Password required.' };
    if ((password?.length || 0) < 8) return { isValid: false, error: 'Min 8 chars.' };
    return { isValid: true };
};

export const getUsers = async (): Promise<User[]> => {
    const { db } = getFirebase();
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.SYSTEM_USERS));
        return snap.docs.map(fromFirestore);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLLECTIONS.SYSTEM_USERS, operation: 'list' }));
        }
        throw error;
    }
};