/**
 * @fileOverview The one place an untrusted spreadsheet is parsed.
 *
 * Every other file in this app reads data the business itself wrote. These
 * four import screens - attendance raw logs, the consolidated ledger, CRM
 * companies and pack specs - are the only place where a FILE FROM OUTSIDE is
 * handed to a parser, which makes this the app's real attack surface.
 *
 * The parser is SheetJS 0.18.5, which carries two published advisories:
 * prototype pollution (CVE-2023-30533) and a ReDoS (CVE-2024-22363). Both are
 * fixed in 0.19.3+, but SheetJS stopped publishing to the npm registry at
 * 0.18.5 and self-hosts from 0.19 onward, so `npm audit fix` can never resolve
 * them and the upgrade has to come from cdn.sheetjs.com.
 *
 * Until that upgrade lands, this boundary does what can honestly be done from
 * inside the app:
 *
 *   - PROTOTYPE POLLUTION is contained. Object.prototype is snapshotted before
 *     the parse and compared after. JavaScript is single-threaded, so nothing
 *     else runs during a synchronous parse: any key the file managed to add is
 *     removed before another line of app code executes, and the file is
 *     rejected. This does not stop the write, it stops it PERSISTING - which is
 *     what makes prototype pollution dangerous.
 *
 *   - SIZE is capped, so an accidental or hostile multi-hundred-megabyte
 *     workbook cannot exhaust memory before parsing even begins.
 *
 * What this does NOT fix: the ReDoS. A crafted cell can still send the parser
 * into catastrophic backtracking and hang the tab, because the regex runs
 * inside the library and cannot be interrupted from here. Only the upgrade
 * fixes that. It costs the user that tab, not their data.
 */

/** Largest workbook accepted. Real imports here are a few MB at most. */
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

export class WorkbookImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkbookImportError';
    }
}

const protoKeys = () => new Set(Object.getOwnPropertyNames(Object.prototype));

/**
 * Run a parse with prototype pollution contained.
 *
 * Exported for the verification script, which proves the guard actually
 * catches and scrubs a pollution attempt rather than merely looking like it.
 */
export const withPrototypeGuard = <T>(parse: () => T): T => {
    const before = protoKeys();
    try {
        return parse();
    } finally {
        const added = Object.getOwnPropertyNames(Object.prototype).filter(k => !before.has(k));
        if (added.length > 0) {
            for (const key of added) {
                try {
                    delete (Object.prototype as any)[key];
                } catch {
                    /* non-configurable: nothing more we can do than report it */
                }
            }
            throw new WorkbookImportError(
                `This file tried to modify the application's internals (${added.join(', ')}) ` +
                `and was rejected. It is either corrupt or malicious - do not re-import it.`
            );
        }
    }
};

export interface ReadWorkbookOptions {
    /** Passed straight through to SheetJS, e.g. { cellDates: true }. */
    sheetjs?: Record<string, unknown>;
    maxBytes?: number;
}

/**
 * Parse an uploaded spreadsheet.
 *
 * Replaces a direct `XLSX.read(data, { type: 'array' })` at each import screen,
 * so the guard cannot be forgotten at a new call site.
 */
export const readUploadedWorkbook = async (
    data: ArrayBuffer | Uint8Array,
    options: ReadWorkbookOptions = {}
) => {
    const { sheetjs = {}, maxBytes = MAX_WORKBOOK_BYTES } = options;

    const byteLength = data instanceof Uint8Array ? data.byteLength : data.byteLength;
    if (byteLength === 0) {
        throw new WorkbookImportError('That file is empty. Check it opens in Excel, then try again.');
    }
    if (byteLength > maxBytes) {
        const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
        throw new WorkbookImportError(
            `That file is ${mb(byteLength)}, over the ${mb(maxBytes)} import limit. ` +
            `Split it by month and import each part.`
        );
    }

    const XLSX = await import('xlsx');
    return withPrototypeGuard(() =>
        XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), {
            type: 'array',
            ...sheetjs,
        })
    );
};
