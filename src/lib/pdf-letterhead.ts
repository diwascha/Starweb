/**
 * @fileOverview The company letterhead, drawn once for every vector PDF.
 *
 * Every export drew its own: some centred, some left, some uppercasing the
 * English name and some not, one of them reading the hardcoded default
 * profile instead of the saved one. None of them printed the Nepali name,
 * because jsPDF cannot render Devanagari (see lib/devanagari-pdf) - so the
 * screen and the printed document disagreed about who issued the paper.
 *
 * Drawing it here means the name, the script, the address and the PAN come
 * out the same on a purchase order, a quotation, a spec sheet and a payslip.
 *
 * The Nepali line is an image, and jsPDF writes decoded image samples rather
 * than the source PNG - uncompressed, that one strip is ~310 KB. It is
 * therefore placed with an explicit FAST (Flate) image compression, which
 * holds whether or not the calling document was built with `compress: true`:
 *
 *   compress=false, image default : 310.9 KB
 *   compress=false, image FAST    :  19.6 KB
 *   compress=true,  image FAST    :  19.5 KB
 *
 * so no caller can reintroduce the megabyte by forgetting a constructor flag.
 */

import { renderDevanagariLine } from './devanagari-pdf';
import type { CompanyProfile } from './types';

export interface LetterheadOptions {
    /** Left edge (for 'left') or the centre line (for 'center'). */
    x: number;
    /** Baseline of the English name. */
    y: number;
    align?: 'left' | 'center';
    /** Point size of the English company name. */
    nameSize?: number;
    /** Point size of the address / PAN lines. */
    detailSize?: number;
    /** Height of the Nepali line in mm. */
    nepaliHeightMm?: number;
    showAddress?: boolean;
    showPan?: boolean;
    /** Set false for the rare export with no room for the second script. */
    showNepali?: boolean;
}

/** Flate-compress the Nepali strip as it is placed. jsPDF does not expose
 *  the document's own compress flag, so this is the only way to guarantee
 *  the image is small no matter how the document was constructed. */
const IMAGE_COMPRESSION = 'FAST';

/** A stable alias pins the strip to ONE image object however many times it is
 *  drawn - payslips repeat the letterhead once per employee. Measured, jsPDF
 *  2.5 already dedupes identical image data on its own (50 payslips come to
 *  26.7 KB either way), so this makes that explicit rather than relying on
 *  undocumented internal behaviour; it is not what keeps the file small. */
const imageAlias = (text: string, heightMm: number) => `np-${heightMm}-${text}`;

/**
 * Draw the letterhead and return the y baseline just past it, so the caller
 * can keep laying out from there.
 */
export const drawPdfLetterhead = (
    doc: any,
    profile: Pick<CompanyProfile, 'nameEn' | 'nameNp' | 'address' | 'pan'>,
    options: LetterheadOptions
): number => {
    const {
        x, y,
        align = 'center',
        nameSize = 13,
        detailSize = 8,
        nepaliHeightMm = 4.4,
        showAddress = true,
        showPan = true,
        showNepali = true,
    } = options;

    let cursor = y;

    // The English name is always uppercased - it is the registered name and
    // every module now shows it the same way.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameSize);
    doc.setTextColor(20);
    doc.text((profile.nameEn || '').toUpperCase(), x, cursor, { align });

    if (showNepali && profile.nameNp) {
        const line = renderDevanagariLine(profile.nameNp, nepaliHeightMm, {
            weight: '600',
            color: '#404040',
        });
        if (line) {
            cursor += nepaliHeightMm + 1.4;
            // addImage places by top-left, so back off the line height to sit
            // the glyphs on the same baseline the text calls use.
            const imageX = align === 'center' ? x - line.widthMm / 2 : x;
            doc.addImage(
                line.dataUrl, 'PNG',
                imageX, cursor - line.heightMm + 0.6, line.widthMm, line.heightMm,
                imageAlias(profile.nameNp, nepaliHeightMm), IMAGE_COMPRESSION
            );
        }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(detailSize);
    doc.setTextColor(90);

    if (showAddress && profile.address) {
        cursor += 4.6;
        doc.text(profile.address, x, cursor, { align });
    }
    if (showPan && profile.pan) {
        cursor += 4;
        doc.text(`PAN: ${profile.pan}`, x, cursor, { align });
    }

    doc.setTextColor(20);
    return cursor;
};
