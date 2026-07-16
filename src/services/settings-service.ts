'use client';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, updateDoc, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AppSetting, CostSetting, CostSettingHistoryEntry } from '@/lib/types';
import { logServiceError } from '@/lib/service-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const getSettingsCollection = () => {
    const { db } = getFirebase();
    return collection(db, 'settings');
};

export const getSetting = async (id: string): Promise<AppSetting | null> => {
    if (!id || typeof id !== 'string') {
        return null;
    }
    const docRef = doc(getSettingsCollection(), id);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return { 
                id: docSnap.id, 
                value: data.value 
            };
        }
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'get',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        } else {
            logServiceError("getSetting", error);
        }
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
            if (error.code === 'permission-denied') {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'get',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            } else {
                logServiceError("onSettingUpdate", error);
            }
            callback(null);
        }
    );
};

export const setSetting = async (id: string, value: any): Promise<void> => {
    if (!id) return;
    const docRef = doc(getSettingsCollection(), id);
    setDoc(docRef, { value }).catch(async (error) => {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'write',
                requestResourceData: { value },
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        } else {
            logServiceError("setSetting", error);
        }
    });
};

export const updateCostSettings = async (newCosts: Partial<CostSetting>, updatedBy: string): Promise<void> => {
    const docRef = doc(getSettingsCollection(), 'costing');
    const docSnap = await getDoc(docRef).catch(() => null);
    const now = new Date().toISOString();

    if (docSnap && docSnap.exists()) {
        const currentData = docSnap.data().value as CostSetting;
        const newHistory: CostSettingHistoryEntry[] = currentData.history || [];
        
        let changed = false;

        if (newCosts.kraftPaperCosts) {
            for (const bf in newCosts.kraftPaperCosts) {
                if (newCosts.kraftPaperCosts[bf] !== (currentData.kraftPaperCosts?.[bf] || 0)) {
                    newHistory.push({ costType: `kraftPaperCost-${bf}`, oldValue: currentData.kraftPaperCosts?.[bf] || 0, newValue: newCosts.kraftPaperCosts[bf], date: now, setBy: updatedBy });
                    changed = true;
                }
            }
        }

        if (newCosts.virginPaperCost !== undefined && newCosts.virginPaperCost !== currentData.virginPaperCost) {
            newHistory.push({ costType: 'virginPaperCost', oldValue: currentData.virginPaperCost, newValue: newCosts.virginPaperCost, date: now, setBy: updatedBy });
            changed = true;
        }
        if (newCosts.conversionCost !== undefined && newCosts.conversionCost !== currentData.conversionCost) {
            newHistory.push({ costType: 'conversionCost', oldValue: currentData.conversionCost, newValue: newCosts.conversionCost, date: now, setBy: updatedBy });
            changed = true;
        }
        if (newCosts.accessoryConversionCost !== undefined && newCosts.accessoryConversionCost !== currentData.accessoryConversionCost) {
            newHistory.push({ costType: 'accessoryConversionCost', oldValue: currentData.accessoryConversionCost || 0, newValue: newCosts.accessoryConversionCost, date: now, setBy: updatedBy });
            changed = true;
        }
        
        if (newCosts.termsAndConditions) {
            changed = true;
        }

        if (changed) {
            const payload = {
                value: {
                    ...currentData,
                    ...newCosts,
                    history: newHistory,
                    lastModifiedBy: updatedBy,
                    lastModifiedAt: now
                }
            };
            updateDoc(docRef, payload).catch(async (error) => {
                if (error.code === 'permission-denied') {
                    const permissionError = new FirestorePermissionError({
                        path: docRef.path,
                        operation: 'update',
                        requestResourceData: payload,
                    } satisfies SecurityRuleContext);
                    errorEmitter.emit('permission-error', permissionError);
                } else {
                    logServiceError("updateCostSettings", error);
                }
            });
        }

    } else {
         const newHistory: CostSettingHistoryEntry[] = [];
         if (newCosts.kraftPaperCosts) {
            for (const bf in newCosts.kraftPaperCosts) {
                newHistory.push({ costType: `kraftPaperCost-${bf}`, oldValue: 0, newValue: newCosts.kraftPaperCosts[bf], date: now, setBy: updatedBy });
            }
         }
         if (newCosts.virginPaperCost) newHistory.push({ costType: 'virginPaperCost', oldValue: 0, newValue: newCosts.virginPaperCost, date: now, setBy: updatedBy });
         if (newCosts.conversionCost) newHistory.push({ costType: 'conversionCost', oldValue: 0, newValue: newCosts.conversionCost, date: now, setBy: updatedBy });
         if (newCosts.accessoryConversionCost) newHistory.push({ costType: 'accessoryConversionCost', oldValue: 0, newValue: newCosts.accessoryConversionCost, date: now, setBy: updatedBy });

        const payload = {
            value: {
                kraftPaperCosts: newCosts.kraftPaperCosts || {},
                virginPaperCost: newCosts.virginPaperCost || 0,
                conversionCost: newCosts.conversionCost || 0,
                accessoryConversionCost: newCosts.accessoryConversionCost || 0,
                termsAndConditions: newCosts.termsAndConditions || [],
                history: newHistory,
                createdBy: updatedBy,
                createdAt: now,
            }
        };
        setDoc(docRef, payload).catch(async (error) => {
            if (error.code === 'permission-denied') {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'create',
                    requestResourceData: payload,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            } else {
                logServiceError("createCostSettings", error);
            }
        });
    }
};