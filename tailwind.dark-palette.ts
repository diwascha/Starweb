/**
 * Makes Tailwind's hard-coded light colours dark-mode aware, in one place.
 *
 * Across the app, status panels were written as e.g. `bg-amber-50 border-amber-200
 * text-amber-900` - hundreds of them, many with opacity variants. In dark mode
 * those stayed as bright pale boxes with near-black text. Rather than touch
 * every one, this:
 *   - turns the pale 50/100/200 shades into CSS variables that switch to dark
 *     tints under `.dark` (covers bg/border/from/to and every opacity variant);
 *   - lightens the dark 600-950 text shades under `.dark`.
 *
 * Printed-page previews stay light: anything inside `.paper` or `.bg-white`
 * keeps the original palette, and so does actual printing.
 */
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

const FAMILIES = [
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
    'blue', 'indigo', 'violet', 'purple', 'pink', 'rose', 'slate', 'gray', 'zinc', 'neutral', 'stone',
] as const;
type Family = typeof FAMILIES[number];
type Shade = keyof typeof colors.red;

const LIGHT_SHADES = ['50', '100', '200'] as const;

// Each pale shade becomes a dark shade blended toward the page background, so
// panels read as a subtle tint rather than a saturated block.
const DARK_OF: Record<typeof LIGHT_SHADES[number], { shade: Shade; mix: number }> = {
    '50': { shade: '950', mix: 0.55 },
    '100': { shade: '900', mix: 0.45 },
    '200': { shade: '800', mix: 0.35 },
};
const PAGE_BG_DARK = [10, 14, 26]; // --background in .dark (222 47% 7%)

const TEXT_LIGHTEN: Partial<Record<Shade, Shade>> = {
    '600': '400', '700': '300', '800': '300', '900': '200', '950': '200',
};

const hexToRgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const triplet = (rgb: number[]) => rgb.map(Math.round).join(' ');
const shadeOf = (family: Family, shade: Shade) => (colors[family] as Record<Shade, string>)[shade];

const lightVars: Record<string, string> = {};
const darkVars: Record<string, string> = {};
for (const family of FAMILIES) {
    for (const shade of LIGHT_SHADES) {
        lightVars[`--tw-${family}-${shade}`] = triplet(hexToRgb(shadeOf(family, shade)));
        const { shade: dark, mix } = DARK_OF[shade];
        const d = hexToRgb(shadeOf(family, dark));
        darkVars[`--tw-${family}-${shade}`] = triplet(d.map((v, i) => v * (1 - mix) + PAGE_BG_DARK[i] * mix));
    }
}

export const themedPaletteColors = Object.fromEntries(
    FAMILIES.map(family => [
        family,
        Object.fromEntries(LIGHT_SHADES.map(s => [s, `rgb(var(--tw-${family}-${s}) / <alpha-value>)`])),
    ]),
);

const textRules: Record<string, Record<string, string>> = {};
for (const family of FAMILIES) {
    for (const [from, to] of Object.entries(TEXT_LIGHTEN) as [Shade, Shade][]) {
        textRules[`.dark .text-${family}-${from}:not(.bg-white):not(:is(.paper, .bg-white) *)`] = {
            color: shadeOf(family, to),
        };
    }
}

export const darkPalettePlugin = plugin(({ addBase }) => {
    addBase({
        ':root': lightVars,
        '@media screen': {
            '.dark': darkVars,
            '.dark .paper, .dark .bg-white': lightVars,
            ...textRules,
        },
    });
});
