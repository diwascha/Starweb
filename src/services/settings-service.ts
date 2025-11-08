
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { AppSetting, CostSetting, CostSettingHistoryEntry } from '@/lib/types';

const settingsCollection = collection(db, 'settings');

export const getSetting = async (id: string): Promise<AppSetting | null> => {
    if (!id) return null;
    const docRef = doc(db, 'settings', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as AppSetting;
    }
    return null;
};

export const onSettingUpdate = (id: string, callback: (setting: AppSetting | null) => void): () => void => {
    if (!id) {
        console.error("onSettingUpdate called with an invalid ID.");
        callback(null);
        return () => {}; // Return a no-op unsubscribe function
    }
    const docRef = doc(db, 'settings', id);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() } as AppSetting);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error(`Error listening to setting ${id}:`, error);
        callback(null);
    });
};


export const setSetting = async (id: string, value: any): Promise<void> => {
    if (!id) return;
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

        // Check Kraft Paper Costs
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
         if (newCosts.kraftPaperCosts) {
            for (const bf in newCosts.kraftPaperCosts) {
                newHistory.push({ costType: `kraftPaperCost-${bf}`, oldValue: 0, newValue: newCosts.kraftPaperCosts[bf], date: now, setBy: updatedBy });
            }
         }
         if (newCosts.virginPaperCost) newHistory.push({ costType: 'virginPaperCost', oldValue: 0, newValue: newCosts.virginPaperCost, date: now, setBy: updatedBy });
         if (newCosts.conversionCost) newHistory.push({ costType: 'conversionCost', oldValue: 0, newValue: newCosts.conversionCost, date: now, setBy: updatedBy });

        await setDoc(docRef, {
            value: {
                kraftPaperCosts: newCosts.kraftPaperCosts || {},
                virginPaperCost: newCosts.virginPaperCost || 0,
                conversionCost: newCosts.conversionCost || 0,
                history: newHistory,
                createdBy: updatedBy,
                createdAt: now,
            }
        });
    }
};
