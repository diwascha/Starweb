
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
    username: z.string().min(1).catch('staradmin'),
    email: z.string().email().optional().or(z.literal('')).catch(''),
    isApproved: z.boolean().optional().default(true).catch(true),
    isAdmin: z.boolean().optional().default(false).catch(false),
    permissions: z.record(z.string(), z.any()).optional().default({}).catch({}),
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
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: COLLECTIONS.SYSTEM_USERS, 
                operation: 'list' 
            }));
        }
    });
};

export const restoreAdminProfile = async (uid: string, email: string, username: string) => {
    const { db } = getFirebase();
    const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, uid);
    const login = (username || 'staradmin').toLowerCase().trim();
    const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
    const now = new Date().toISOString();

    const payload = {
        username: login,
        email: email.toLowerCase().trim(),
        isApproved: true,
        isAdmin: true,
        permissions: {},
        updatedAt: serverTimestamp(),
        createdAt: now
    };

    try {
        await setDoc(userRef, payload, { merge: true });
        await setDoc(usernameRef, { 
            email: email.toLowerCase().trim(), 
            username: login 
        }, { merge: true });
        logAudit(`Administrative Profile Restored: ${login}`, 'Security', { uid });
    } catch (e) {
        console.error("Critical: Failed to restore admin profile", e);
    }
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

export const setAdminPassword = async (password: string, updatedAt: string) => {
    const { auth, db } = getFirebase();
    if (!auth.currentUser) throw new Error("No authenticated session found.");
    
    try {
        await updatePassword(auth.currentUser, password);
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

export const loginWithUsername = async (auth: Auth, loginString: string, password: string) => {
    const { db } = getFirebase();
    const login = (loginString || '').toLowerCase().trim();
    
    let email = login;

    if (!login.includes('@')) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
        const snap = await getDoc(usernameRef);
        
        if (snap.exists()) {
            email = snap.data()?.email || login;
        } else {
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
    try {
        const snap = await getDoc(userDocRef);
        return snap.exists() ? fromFirestore(snap) : null;
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: userDocRef.path, operation: 'get' }));
        }
        return null;
    }
};

export const deleteUser = async (userId: string, username?: string) => {
    const { db } = getFirebase();
    const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().isAdmin === true) {
        throw new Error("Administrative accounts are protected and cannot be deleted through this interface.");
    }
    
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
