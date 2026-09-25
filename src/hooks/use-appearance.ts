'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE, applyAppearance, normalizeAppearance, type AppearancePrefs,
} from '@/lib/appearance';

const readStored = (): AppearancePrefs => {
    try {
        const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
        return normalizeAppearance(raw ? JSON.parse(raw) : null);
    } catch {
        return DEFAULT_APPEARANCE;
    }
};

export const useAppearance = () => {
    const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setPrefs(readStored());
        setMounted(true);
        const onStorage = (e: StorageEvent) => {
            if (e.key !== APPEARANCE_STORAGE_KEY) return;
            const next = readStored();
            setPrefs(next);
            applyAppearance(next);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const update = useCallback((patch: Partial<AppearancePrefs>) => {
        setPrefs(prev => {
            const next = normalizeAppearance({ ...prev, ...patch });
            try {
                localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* private window: applies for this session only */
            }
            applyAppearance(next);
            return next;
        });
    }, []);

    const reset = useCallback(() => update(DEFAULT_APPEARANCE), [update]);

    return { prefs, update, reset, mounted };
};
