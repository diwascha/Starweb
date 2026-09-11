/**
 * @fileOverview Printing a piece of the page in its own window.
 *
 * There were four implementations of this across Finance alone, at three
 * different levels of correctness:
 *
 *   GSM, Payment Tracker  copied the document's real <style> and
 *                         <link rel="stylesheet"> tags across - correct
 *   Estimate Invoice      hand-wrote about eight CSS rules, one of them
 *                         invalid (`font-bold: bold`, which is not a
 *                         property - so bold text printed non-bold)
 *   TDS (two places)      wrote no styles whatsoever, so the voucher
 *                         printed as unstyled text
 *
 * A printed voucher that loses its layout is not a cosmetic problem - it is
 * the copy that goes in the file or to the party. This copies the live
 * stylesheets every time, so a print always looks like the screen.
 */

export interface PrintOptions {
    /** Window title, which most browsers use as the default filename when
     *  the user prints to PDF. */
    title?: string;
    /** Extra CSS appended after the copied stylesheets - page setup, or
     *  anything that should only apply in print. */
    extraCss?: string;
    /** How long to wait for the copied stylesheets to apply before printing.
     *  Too short and the page prints half-styled. */
    delayMs?: number;
}

const DEFAULT_PAGE_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
body { background: #fff; }
`;

/**
 * Open `element` in a print window carrying the current page's styles.
 *
 * @returns false when the window could not be opened (popup blocker), so the
 *          caller can tell the user rather than silently doing nothing.
 */
export const printElement = (
    element: HTMLElement | null | undefined,
    options: PrintOptions = {}
): boolean => {
    if (!element) return false;

    const { title = 'Print', extraCss = '', delayMs = 350 } = options;

    const win = window.open('', '', 'height=900,width=900');
    if (!win) return false;

    // Every stylesheet the app has loaded, in document order. Tailwind's
    // utility classes live here, which is why the hand-rolled versions of
    // this lost almost all of the layout.
    const styles = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
    ).map(node => node.outerHTML).join('');

    win.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
        `${styles}<style>${DEFAULT_PAGE_CSS}${extraCss}</style>` +
        `</head><body>${element.outerHTML}</body></html>`
    );
    win.document.close();
    win.focus();

    // Give the copied <link> stylesheets a moment to fetch and apply. The old
    // implementations used 100-250ms; a stylesheet that has not applied yet
    // prints the page unstyled, which is the failure this helper exists to
    // prevent.
    setTimeout(() => {
        win.print();
        win.close();
    }, delayMs);

    return true;
};
