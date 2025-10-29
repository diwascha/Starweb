
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import type { AppSetting } from '@/lib/types';

const settingsCollection = collection(db, 'settings');

export const getSetting = async (id: string): Promise<AppSetting | null> => {
    const docRef = doc(db, 'settings', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as AppSetting;
    }
    return null;
};

export const onSettingUpdate = (id: string, callback: (setting: AppSetting | null) => void): () => void => {
    const docRef = doc(db, 'settings', id);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as AppSetting);
        } else {
            callback(null);
        }
    });
};


export const setSetting = async (id: string, value: any): Promise<void> => {
    const docRef = doc(db, 'settings', id);
    await setDoc(docRef, { value });
};
