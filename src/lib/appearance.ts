/**
 * @fileOverview Per-device appearance preferences: accent colour, font, and
 * text size. (Light/dark theme lives in theme-provider.tsx.)
 *
 * Stored in localStorage rather than Firestore on purpose: it is a personal,
 * per-screen choice, and keeping it out of the database costs zero reads on a
 * free-tier quota the app has already exceeded once.
 */

export const APPEARANCE_STORAGE_KEY = 'starsutra:appearance';

export interface AccentPreset {
    id: string;
    label: string;
    /** HSL triplet, in the same "H S% L%" form the CSS variables use. */
    hsl: string;
}

// All presets are light tones, like the original blue, so the existing dark
// `--primary-foreground` stays readable on every one of them in both themes.
export const ACCENT_PRESETS: AccentPreset[] = [
    { id: 'blue', label: 'Blue', hsl: '217 91% 76%' },
    { id: 'violet', label: 'Violet', hsl: '262 83% 80%' },
    { id: 'emerald', label: 'Emerald', hsl: '152 55% 62%' },
    { id: 'teal', label: 'Teal', hsl: '178 55% 58%' },
    { id: 'amber', label: 'Amber', hsl: '38 92% 64%' },
    { id: 'rose', label: 'Rose', hsl: '350 85% 78%' },
    { id: 'slate', label: 'Slate', hsl: '215 20% 72%' },
];

export interface FontOption {
    id: string;
    label: string;
    description: string;
    stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
    { id: 'inter', label: 'Inter', description: 'Default. Clean and compact.', stack: 'var(--font-inter), sans-serif' },
    { id: 'noto', label: 'Noto Sans', description: 'Wider, and renders Nepali (Devanagari) text well.', stack: 'var(--font-noto), sans-serif' },
    { id: 'system', label: 'System', description: "Your computer's own interface font.", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];

export interface TextSizeOption {
    id: string;
    label: string;
    /** Root font size in px. Everything in the app is sized in rem, so this scales it all. */
    rootPx: number;
}

export const TEXT_SIZE_OPTIONS: TextSizeOption[] = [
    { id: 'small', label: 'Small', rootPx: 14 },
    { id: 'default', label: 'Default', rootPx: 16 },
    { id: 'large', label: 'Large', rootPx: 17.5 },
    { id: 'xl', label: 'Extra large', rootPx: 19 },
];

export interface AppearancePrefs {
    accent: string;
    font: string;
    textSize: string;
}

export const DEFAULT_APPEARANCE: AppearancePrefs = { accent: 'blue', font: 'inter', textSize: 'default' };

export const normalizeAppearance = (raw: unknown): AppearancePrefs => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppearancePrefs>;
    return {
        accent: ACCENT_PRESETS.some(p => p.id === r.accent) ? r.accent! : DEFAULT_APPEARANCE.accent,
        font: FONT_OPTIONS.some(f => f.id === r.font) ? r.font! : DEFAULT_APPEARANCE.font,
        textSize: TEXT_SIZE_OPTIONS.some(t => t.id === r.textSize) ? r.textSize! : DEFAULT_APPEARANCE.textSize,
    };
};

const ACCENT_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-1'];

export const applyAppearance = (prefs: AppearancePrefs) => {
    const root = document.documentElement;
    const accent = ACCENT_PRESETS.find(p => p.id === prefs.accent) ?? ACCENT_PRESETS[0];
    ACCENT_VARS.forEach(v => root.style.setProperty(v, accent.hsl));
    const font = FONT_OPTIONS.find(f => f.id === prefs.font) ?? FONT_OPTIONS[0];
    root.style.setProperty('--app-font', font.stack);
    const size = TEXT_SIZE_OPTIONS.find(t => t.id === prefs.textSize) ?? TEXT_SIZE_OPTIONS[1];
    root.style.fontSize = `${size.rootPx}px`;
};

/**
 * Runs in <head> before first paint, like the theme script, so a saved accent
 * or text size never flashes the defaults first. Must never throw.
 */
export const appearanceInitScript = `
(function(){
  try {
    var raw = localStorage.getItem('${APPEARANCE_STORAGE_KEY}');
    if (!raw) return;
    var p = JSON.parse(raw) || {};
    var accents = ${JSON.stringify(Object.fromEntries(ACCENT_PRESETS.map(a => [a.id, a.hsl])))};
    var fonts = ${JSON.stringify(Object.fromEntries(FONT_OPTIONS.map(f => [f.id, f.stack])))};
    var sizes = ${JSON.stringify(Object.fromEntries(TEXT_SIZE_OPTIONS.map(t => [t.id, t.rootPx])))};
    var s = document.documentElement.style;
    if (accents[p.accent]) {
      ${JSON.stringify(ACCENT_VARS)}.forEach(function(v){ s.setProperty(v, accents[p.accent]); });
    }
    if (fonts[p.font]) s.setProperty('--app-font', fonts[p.font]);
    if (sizes[p.textSize]) s.fontSize = sizes[p.textSize] + 'px';
  } catch (e) {}
})();
`;
