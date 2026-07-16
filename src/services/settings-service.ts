'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, updateDoc, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AppSetting, CostSetting, CostSettingHistoryEntry } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const getSettingsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'settings');
};

export const getSetting = async (id: string): Promise<AppSetting | null> => {
    if (!id || typeof id !== 'string') return null;
    const docRef = doc(getSettingsCollection(), id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return { id: docSnap.id, value: data.value };
        }
    } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'get',
        }));
    }
    return null;
};

export const onSettingUpdate = (id: string, callback: (setting: AppSetting | null) => void): () => void => {
    if (!id || typeof id !== 'string') {
        callback(null);
        return () => {}; 
    }
    const docRef = doc(getSettingsCollection(), id);
    return onSnapshot(docRef, 
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                callback({ id: docSnap.id, value: data.value });
            } else {
                callback(null);
            }
        },
        async (error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            }));
            callback(null);
        }
    );
};

export const setSetting = async (id: string, value: any): Promise<void> => {
    if (!id) return;
    const docRef = doc(getSettingsCollection(), id);
    setDoc(docRef, { value }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'write',
            requestResourceData: { value },
        }));
    });
};

export const updateCostSettings = async (newCosts: Partial<CostSetting>, updatedBy: string): Promise<void> => {
    const docRef = doc(getSettingsCollection(), 'costing');
    const now = new Date().toISOString();
    const payload = { value: { ...newCosts, lastModifiedBy: updatedBy, lastModifiedAt: now } };

    setDoc(docRef, payload, { merge: true }).catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: payload,
        }));
    });
};