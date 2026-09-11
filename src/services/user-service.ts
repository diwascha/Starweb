
import { getFirebase } from '@/lib/firebase';
import { reportWriteFailure } from '@/lib/write-reporting';
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

/**
 * Validates password strength and requirements.
 * Used during user creation and password updates.
 */
/** Minimum password length for a new account. */
export const MIN_PASSWORD_LENGTH = 10;

/** Choices that pass a naive length test but should not be accepted. */
const WEAK_PASSWORD_SUBSTRINGS = [
    'password', 'passw0rd', '12345', 'qwerty', 'abc123',
    'admin', 'shivam', 'sijan', 'starsutra', 'letmein',
];

/**
 * Password rules for account creation and password changes.
 *
 * The floor was six characters - Firebase's own default. For a system
 * holding payroll, PAN numbers, bank details and the cheque ledger that is
 * not a meaningful barrier, and because the app is a static export an
 * attacker who guesses a password gets everything that account can reach,
 * with the Firestore rules as the only remaining check.
 *
 * Deliberately a predictable floor rather than a strength meter: rules
 * people can read are easier to satisfy than a bar that moves.
 */
export const validatePassword = (
    password: string,
    isRequired: boolean = true,
    username: string = ''
): { isValid: boolean; error?: string } => {
    if (!isRequired && !password) return { isValid: true };
    if (isRequired && !password) return { isValid: false, error: "Password is required." };

    const problems: string[] = [];
    if (password.length < MIN_PASSWORD_LENGTH) problems.push(`at least ${MIN_PASSWORD_LENGTH} characters`);
    if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
    if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
    if (!/[0-9]/.test(password)) problems.push('a number');

    const lower = password.toLowerCase();
    if (WEAK_PASSWORD_SUBSTRINGS.some(bad => lower.includes(bad))) {
        problems.push('something less guessable - it contains a common word');
    }
    if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
        problems.push('no part of the username');
    }

    return problems.length
        ? { isValid: false, error: `Password needs ${problems.join(', ')}.` }
        : { isValid: true };
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

export const onUsernamesUpdate = (callback: (usernames: {username: string, email: string}[]) => void) => {
    const { db } = getFirebase();
    return onSnapshot(collection(db, COLLECTIONS.USERNAMES), (snapshot) => {
        callback(snapshot.docs.map(d => ({ username: d.id, email: d.data().email })));
    }, async (error) => {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ 
                path: COLLECTIONS.USERNAMES, 
                operation: 'list' 
            }));
        }
    });
};

export const deleteUsernameRecord = async (username: string) => {
    const { db } = getFirebase();
    const usernameRef = doc(db, COLLECTIONS.USERNAMES, username.toLowerCase().trim());
    return deleteDoc(usernameRef);
};


/**
 * Create or update a user's profile.
 *
 * This one AWAITS the server, unlike almost every other write in the app.
 * Those are deliberately fire-and-forget because an offline write pends
 * rather than failing, and a spinning save button on a dropped connection is
 * worse than a queued record. Account provisioning is the opposite case:
 *
 *   - It cannot work offline anyway - the Firebase Auth account it pairs with
 *     is created over the network moments earlier.
 *   - Reporting success wrongly is expensive. The admin closes the dialog
 *     believing the account exists, and the new user is left with an Auth
 *     login that resolves to no profile and can never sign in.
 *
 * So the caller gets a real result and can show a real error.
 */
export const saveUser = async (user: User) => {
    const { db } = getFirebase();
    if (!user?.id) throw new Error("Invalid user ID.");

    const userRef = doc(db, COLLECTIONS.SYSTEM_USERS, user.id);
    const payload = { ...user, updatedAt: serverTimestamp() };

    try {
        await setDoc(userRef, payload, { merge: true });
    } catch (err: any) {
        if (err?.code === 'permission-denied') {
            throw new Error(
                'You do not have permission to save this account. Only an administrator can create or change user accounts.'
            );
        }
        throw new Error(`Could not save the account: ${err?.message || err}`);
    }

    if (user.username && user.email) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, user.username.toLowerCase().trim());
        // `uid` is what ties this public lookup document to an account. The
        // rules require it to match the caller (or the caller to be an admin),
        // which is what stops a signed-in user squatting someone else's name.
        const usernamePayload = {
            uid: user.id,
            email: user.email.toLowerCase().trim(),
            username: user.username.toLowerCase().trim(),
        };
        reportWriteFailure(
            setDoc(usernameRef, usernamePayload, { merge: true }),
            { path: usernameRef.path, operation: 'write', requestResourceData: usernamePayload }
        );
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
    if (!email) throw new Error("Email address required for cloud registration.");

    const usernameRef = doc(db, COLLECTIONS.USERNAMES, login);
    const snap = await getDoc(usernameRef);

    if (snap.exists()) {
        throw new Error("Username taken.");
    }

    // Attempt to reserve the username
    await setDoc(usernameRef, { email: email.toLowerCase().trim(), username: login });

    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = (await import('firebase/auth')).getAuth(secondaryApp);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.toLowerCase().trim(), password);

        // The username had to be reserved before the account existed, so it
        // could not carry a uid. Attach it now: `uid` is what ties this
        // publicly-readable lookup document to an account, and the rules use
        // it to stop a signed-in user squatting someone else's name.
        await setDoc(usernameRef, { uid: userCredential.user.uid }, { merge: true });

        await deleteApp(secondaryApp);
        logAudit(`New User Created: ${login}`, 'Security');
        return userCredential.user;
    } catch (error) {
        // Rollback: Delete reserved username if Auth creation fails
        await deleteDoc(usernameRef);
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
            // Legacy fallback for accounts created before the `usernames`
            // collection existed. It cannot succeed for an anonymous caller -
            // this runs BEFORE sign-in, and listing system_users is admin-only -
            // so a denial here is expected, not exceptional. Swallow it and let
            // the sign-in below fail with the normal generic credential error;
            // throwing instead would both break login and, by failing
            // differently for a known username, leak which accounts exist.
            try {
                const q = query(collection(db, COLLECTIONS.SYSTEM_USERS), where("username", "==", login), limit(1));
                const userSnap = await getDocs(q);
                if (!userSnap.empty) {
                    email = userSnap.docs[0].data().email;
                }
            } catch {
                /* resolve as the raw login and let Firebase Auth reject it */
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

