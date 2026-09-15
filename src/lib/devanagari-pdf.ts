/**
 * @fileOverview Drawing Devanagari into a jsPDF document.
 *
 * jsPDF's built-in fonts (Helvetica and the rest of the standard 14) are
 * WinAnsi-encoded: one byte per glyph, Latin only. Handed a Devanagari
 * string it writes the raw UTF-16 code units straight into the content
 * stream, so "शिवम्" goes in as the bytes 09 36 09 3F 09 35 ... and the
 * reader draws whatever Latin glyphs those happen to land on. That is why
 * the company's Nepali name came out as garbage in the vector PDF while the
 * image export - which is a screenshot of the browser's own rendering - had
 * it perfectly.
 *
 * Embedding a Devanagari TTF does NOT fix this on its own. Devanagari needs
 * complex-script shaping: matras reorder around the base consonant (कि is
 * stored क + ि but drawn ि + क), consonants fuse into conjuncts, and marks
 * stack. jsPDF has no shaping engine and draws code points in storage order,
 * so an embedded font would render the right glyphs in the wrong order -
 * worse, because it would look plausible.
 *
 * So this draws the Nepali line through the one shaping engine we already
 * have: the browser's. The line is rendered to a canvas and placed as a
 * small image; everything else on the page stays real text, which is the
 * point of the vector export.
 *
 * Sizing matters more than it looks. jsPDF does not embed the PNG - it
 * decodes it and writes the raw samples - so the canvas dimensions, not the
 * PNG's own compression, decide what lands in the file. A document that also
 * sets `compress: true` deflates those samples; without it this strip alone
 * ran to 1.3 MB. Both halves are needed.
 */

/**
 * Rendered at this multiple of the final size so it stays sharp in print.
 *
 * 4 puts the strip at ~384 DPI on the page, comfortably past the 300 DPI
 * print standard. It was 8 (~727 DPI), which bought nothing visible and cost
 * four times the pixels - and since jsPDF stores image samples rather than
 * the PNG, those pixels landed in the file at full size.
 */
const RASTER_SCALE = 4;

export interface DevanagariLine {
    dataUrl: string;
    /** Width in mm for the requested height, preserving the aspect ratio. */
    widthMm: number;
    heightMm: number;
}

/**
 * Render a Devanagari (or any complex-script) string to a PNG sized for
 * placement in a jsPDF document.
 *
 * @param text      the string to draw.
 * @param heightMm  the height the line should occupy on the page.
 * @returns null when there is nothing to draw, or when canvas is
 *          unavailable - the caller then simply omits the line rather than
 *          printing something wrong.
 */
export const renderDevanagariLine = (
    text: string,
    heightMm: number,
    options: { weight?: string; color?: string; background?: string } = {}
): DevanagariLine | null => {
    const value = (text || '').trim();
    if (!value) return null;
    if (typeof document === 'undefined') return null;

    // Painted onto an opaque background rather than left transparent: an RGBA
    // canvas makes jsPDF emit a separate soft-mask object for the alpha
    // channel, which is pure overhead for a line of text sitting on white
    // paper.
    const { weight = '600', color = '#333333', background = '#ffffff' } = options;

    // px per mm at the scaled-up resolution we rasterise at.
    const pxPerMm = (96 / 25.4) * RASTER_SCALE;
    const fontPx = heightMm * pxPerMm;

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) return null;

    // A stack that actually has Devanagari coverage; the generic fallbacks at
    // the end keep this working on a machine without the Noto family.
    const font = `${weight} ${fontPx}px "Noto Sans Devanagari", "Mangal", "Kokila", "Nirmala UI", system-ui, sans-serif`;
    measureCtx.font = font;
    const metrics = measureCtx.measureText(value);
    const widthPx = Math.ceil(metrics.width);
    if (widthPx <= 0) return null;

    // Devanagari puts marks well above and below the baseline, so the box has
    // to be taller than the nominal font size or the shirorekha and the
    // vowel signs get clipped.
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontPx * 0.9);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontPx * 0.35);
    const heightPx = ascent + descent;
    if (heightPx <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, widthPx, heightPx);
    }
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, 0, ascent);

    const renderedHeightMm = heightPx / pxPerMm;
    return {
        dataUrl: canvas.toDataURL('image/png'),
        widthMm: widthPx / pxPerMm,
        heightMm: renderedHeightMm,
    };
};
