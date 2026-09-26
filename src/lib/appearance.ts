/**
 * @fileOverview Per-device appearance preferences: accent colour, heading and
 * body fonts, and text size. (Light/dark theme lives in theme-provider.tsx.)
 *
 * Stored in localStorage rather than Firestore on purpose: it is a personal,
 * per-screen choice, and keeping it out of the database costs zero reads on a
 * free-tier quota the app has already exceeded once.
 *
 * How the accent reaches the whole app: besides the shadcn `--primary`
 * variables, the Tailwind `blue-*` palette (used ~190 times for highlights,
 * links and info panels) reads its shades from `--brand-*` variables - see
 * tailwind.dark-palette.ts. Picking an accent rewrites those variables with
 * the matching Tailwind colour family, so every `text-blue-600` or
 * `bg-blue-50` follows it. The sidebar and menu hover tints follow too.
 */
import colors from 'tailwindcss/colors';

export const APPEARANCE_STORAGE_KEY = 'starsutra:appearance';

type TailwindFamily = 'blue' | 'violet' | 'emerald' | 'teal' | 'amber' | 'rose' | 'slate';

export interface AccentPreset {
    id: string;
    label: string;
    /** HSL triplet, in the same "H S% L%" form the CSS variables use. */
    hsl: string;
    /** Tailwind colour family that replaces `blue-*` across the app. */
    family: TailwindFamily;
}

// All presets are light tones, like the original blue, so the existing dark
// `--primary-foreground` stays readable on every one of them in both themes.
export const ACCENT_PRESETS: AccentPreset[] = [
    { id: 'blue', label: 'Blue', hsl: '217 91% 76%', family: 'blue' },
    { id: 'violet', label: 'Violet', hsl: '262 83% 80%', family: 'violet' },
    { id: 'emerald', label: 'Emerald', hsl: '152 55% 62%', family: 'emerald' },
    { id: 'teal', label: 'Teal', hsl: '178 55% 58%', family: 'teal' },
    { id: 'amber', label: 'Amber', hsl: '38 92% 64%', family: 'amber' },
    { id: 'rose', label: 'Rose', hsl: '350 85% 78%', family: 'rose' },
    { id: 'slate', label: 'Slate', hsl: '215 20% 72%', family: 'slate' },
];

export interface FontOption {
    id: string;
    label: string;
    description: string;
    stack: string;
}

// Arial, Verdana, Tahoma, Georgia and Calibri are installed with Windows (and
// most with macOS); the stacks fall back to look-alikes elsewhere. None of
// them has Nepali letters, so Devanagari text falls back to the system font.
const ARIAL = 'Arial, "Liberation Sans", Helvetica, sans-serif';

export const FONT_OPTIONS: FontOption[] = [
    { id: 'inter', label: 'Inter', description: 'Default. Clean and compact.', stack: 'var(--font-inter), sans-serif' },
    { id: 'arial', label: 'Arial', description: 'Familiar office font.', stack: ARIAL },
    { id: 'noto', label: 'Noto Sans', description: 'Wider, and renders Nepali (Devanagari) text well.', stack: 'var(--font-noto), sans-serif' },
    { id: 'calibri', label: 'Calibri', description: 'Microsoft Office default.', stack: 'Calibri, Carlito, "Segoe UI", sans-serif' },
    { id: 'verdana', label: 'Verdana', description: 'Wide letters, very readable on screen.', stack: 'Verdana, Geneva, sans-serif' },
    { id: 'tahoma', label: 'Tahoma', description: 'Compact, fits more in tables.', stack: 'Tahoma, "Segoe UI", sans-serif' },
    { id: 'system', label: 'System', description: "Your computer's own interface font.", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
];

/** Heading choices. "Same as body" leaves headings in the body font. */
export const HEADING_FONT_OPTIONS: FontOption[] = [
    { id: 'same', label: 'Same as body', description: 'Headings use the body font.', stack: '' },
    { id: 'arial-black', label: 'Arial Black', description: 'Heavy and bold, for strong titles.', stack: '"Arial Black", "Arial Bold", Gadget, ' + ARIAL },
    { id: 'arial', label: 'Arial', description: 'Plain and familiar.', stack: ARIAL },
    { id: 'inter', label: 'Inter', description: 'Clean and compact.', stack: 'var(--font-inter), sans-serif' },
    { id: 'noto', label: 'Noto Sans', description: 'Renders Nepali titles well.', stack: 'var(--font-noto), sans-serif' },
    { id: 'georgia', label: 'Georgia', description: 'Classic serif, formal look.', stack: 'Georgia, "Times New Roman", serif' },
    { id: 'verdana', label: 'Verdana', description: 'Wide and very readable.', stack: 'Verdana, Geneva, sans-serif' },
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
    headingFont: string;
    textSize: string;
}

export const DEFAULT_APPEARANCE: AppearancePrefs = { accent: 'blue', font: 'inter', headingFont: 'same', textSize: 'default' };

export const normalizeAppearance = (raw: unknown): AppearancePrefs => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppearancePrefs>;
    return {
        accent: ACCENT_PRESETS.some(p => p.id === r.accent) ? r.accent! : DEFAULT_APPEARANCE.accent,
        font: FONT_OPTIONS.some(f => f.id === r.font) ? r.font! : DEFAULT_APPEARANCE.font,
        headingFont: HEADING_FONT_OPTIONS.some(f => f.id === r.headingFont) ? r.headingFont! : DEFAULT_APPEARANCE.headingFont,
        textSize: TEXT_SIZE_OPTIONS.some(t => t.id === r.textSize) ? r.textSize! : DEFAULT_APPEARANCE.textSize,
    };
};

// ---------------------------------------------------------------------------
// Colour variables derived from a Tailwind family
// ---------------------------------------------------------------------------

export const BRAND_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
const PAGE_BG_DARK = [10, 14, 26]; // --background in .dark (222 47% 7%)

const hexToRgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const triplet = (rgb: number[]) => rgb.map(Math.round).join(' ');
const mixToDarkBg = (rgb: number[], mix: number) => rgb.map((v, i) => v * (1 - mix) + PAGE_BG_DARK[i] * mix);
const rgbToHsl = ([r, g, b]: number[]) => {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
        h *= 60;
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

/**
 * Every CSS variable an accent sets, as name -> value. Computed once per
 * preset at build time and embedded in the init script, so first paint
 * already has the saved colours.
 */
const accentVars = (preset: AccentPreset): Record<string, string> => {
    const family = colors[preset.family] as Record<string, string>;
    const rgb = (shade: string) => hexToRgb(family[shade]);
    const vars: Record<string, string> = {};
    for (const v of ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-1']) vars[v] = preset.hsl;
    for (const shade of BRAND_SHADES) vars[`--brand-${shade}`] = triplet(rgb(shade));
    // Dark-theme versions of the pale shades, same blend as the palette plugin.
    vars['--brand-dark-50'] = triplet(mixToDarkBg(rgb('950'), 0.55));
    vars['--brand-dark-100'] = triplet(mixToDarkBg(rgb('900'), 0.45));
    vars['--brand-dark-200'] = triplet(mixToDarkBg(rgb('800'), 0.35));
    // Sidebar active/hover and menu hover tints (read by globals.css).
    vars['--tint-light'] = rgbToHsl(rgb('100'));
    vars['--tint-border-light'] = rgbToHsl(rgb('200'));
    vars['--tint-dark'] = rgbToHsl(mixToDarkBg(rgb('800'), 0.45));
    return vars;
};

const ACCENT_VAR_MAP: Record<string, Record<string, string>> =
    Object.fromEntries(ACCENT_PRESETS.map(p => [p.id, accentVars(p)]));

export const applyAppearance = (prefs: AppearancePrefs) => {
    const root = document.documentElement;
    const vars = ACCENT_VAR_MAP[prefs.accent] ?? ACCENT_VAR_MAP.blue;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    const font = FONT_OPTIONS.find(f => f.id === prefs.font) ?? FONT_OPTIONS[0];
    root.style.setProperty('--app-font', font.stack);
    const heading = HEADING_FONT_OPTIONS.find(f => f.id === prefs.headingFont);
    if (heading?.stack) root.style.setProperty('--app-heading-font', heading.stack);
    else root.style.removeProperty('--app-heading-font');
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
    var accents = ${JSON.stringify(ACCENT_VAR_MAP)};
    var fonts = ${JSON.stringify(Object.fromEntries(FONT_OPTIONS.map(f => [f.id, f.stack])))};
    var headings = ${JSON.stringify(Object.fromEntries(HEADING_FONT_OPTIONS.filter(f => f.stack).map(f => [f.id, f.stack])))};
    var sizes = ${JSON.stringify(Object.fromEntries(TEXT_SIZE_OPTIONS.map(t => [t.id, t.rootPx])))};
    var s = document.documentElement.style;
    var a = accents[p.accent];
    if (a) for (var k in a) s.setProperty(k, a[k]);
    if (fonts[p.font]) s.setProperty('--app-font', fonts[p.font]);
    if (headings[p.headingFont]) s.setProperty('--app-heading-font', headings[p.headingFont]);
    if (sizes[p.textSize]) s.fontSize = sizes[p.textSize] + 'px';
  } catch (e) {}
})();
`;
