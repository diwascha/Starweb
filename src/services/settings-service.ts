
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { AppSetting, CostSetting, CostSettingHistoryEntry } from '@/lib/types';

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

export const updateCostSettings = async (newCosts: Partial<CostSetting>, updatedBy: string): Promise<void> => {
    const docRef = doc(db, 'settings', 'costing');
    const docSnap = await getDoc(docRef);
    const now = new Date().toISOString();

    if (docSnap.exists()) {
        const currentData = docSnap.data().value as CostSetting;
        const newHistory: CostSettingHistoryEntry[] = currentData.history || [];
        
        let changed = false;
        if (newCosts.kraftPaperCost !== undefined && newCosts.kraftPaperCost !== currentData.kraftPaperCost) {
            newHistory.push({ costType: 'kraftPaperCost', oldValue: currentData.kraftPaperCost, newValue: newCosts.kraftPaperCost, date: now, setBy: updatedBy });
            changed = true;
        }
        if (newCosts.virginPaperCost !== undefined && newCosts.virginPaperCost !== currentData.virginPaperCost) {
            newHistory.push({ costType: 'virginPaperCost', oldValue: currentData.virginPaperCost, newValue: newCosts.virginPaperCost, date: now, setBy: updatedBy });
            changed = true;
        }
        if (newCosts.conversionCost !== undefined && newCosts.conversionCost !== currentData.conversionCost) {
            newHistory.push({ costType: 'conversionCost', oldValue: currentData.conversionCost, newValue: newCosts.conversionCost, date: now, setBy: updatedBy });
            changed = true;
        }
        
        if (changed) {
            await updateDoc(docRef, {
                value: {
                    ...currentData,
                    ...newCosts,
                    history: newHistory,
                    lastModifiedBy: updatedBy,
                    lastModifiedAt: now
                }
            });
        }

    } else {
        // Create it for the first time
         const newHistory: CostSettingHistoryEntry[] = [];
         if (newCosts.kraftPaperCost) newHistory.push({ costType: 'kraftPaperCost', oldValue: 0, newValue: newCosts.kraftPaperCost, date: now, setBy: updatedBy });
         if (newCosts.virginPaperCost) newHistory.push({ costType: 'virginPaperCost', oldValue: 0, newValue: newCosts.virginPaperCost, date: now, setBy: updatedBy });
         if (newCosts.conversionCost) newHistory.push({ costType: 'conversionCost', oldValue: 0, newValue: newCosts.conversionCost, date: now, setBy: updatedBy });

        await setDoc(docRef, {
            value: {
                kraftPaperCost: newCosts.kraftPaperCost || 0,
                virginPaperCost: newCosts.virginPaperCost || 0,
                conversionCost: newCosts.conversionCost || 0,
                history: newHistory,
                createdBy: updatedBy,
                createdAt: now,
            }
        });
    }
};

