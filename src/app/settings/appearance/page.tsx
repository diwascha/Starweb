'use client';

import { AppearanceSettings } from '@/components/settings/appearance-settings';

// Standalone page for users without Settings access. Everyone else finds the
// same controls under Settings > General > Appearance.
export default function AppearanceSettingsPage() {
    return <AppearanceSettings />;
}
