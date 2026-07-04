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
import type { User, Permissions } from '@/lib/types';

const USERS_COLLECTION = 'system_users';

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
    await setDoc(userRef, {
        ...user,
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const deleteUser = async (userId: string) => {
    const { db } = getFirebase();
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
};

export const getUserByLogin = async (loginString: string): Promise<User | null> => {
    const { db } = getFirebase();
    const login = loginString.toLowerCase().trim();

    // Check Username first
    const qUsername = query(collection(db, USERS_COLLECTION), where("username", "==", login), limit(1));
    const snapUsername = await getDocs(qUsername);
    if (!snapUsername.empty) return { id: snapUsername.docs[0].id, ...snapUsername.docs[0].data() } as User;

    // Check Email
    const qEmail = query(collection(db, USERS_COLLECTION), where("email", "==", login), limit(1));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) return { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() } as User;

    return null;
};

// --- Password & Validation ---

export const getAdminCredentials = () => defaultAdminCreds;

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
