/**
 * Proof that the spreadsheet import guard actually contains a prototype
 * pollution attempt, rather than merely looking like it does.
 *
 * SheetJS 0.18.5 carries CVE-2023-30533 and cannot be upgraded from the npm
 * registry, so this containment is what stands between a hostile workbook and
 * a polluted Object.prototype. It is worth testing directly.
 */
import { withPrototypeGuard, WorkbookImportError } from '../src/lib/workbook-import';

let pass = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
    if (cond) pass++; else failures.push(`${name} ${detail}`);
};

// --- a parse that pollutes Object.prototype must be caught and scrubbed ---
{
    let threw: unknown = null;
    try {
        withPrototypeGuard(() => {
            // What a crafted workbook achieves inside the parser.
            (Object.prototype as any).polluted = 'attacker-controlled';
            return 'parsed';
        });
    } catch (e) {
        threw = e;
    }
    check('pollution rejected', threw instanceof WorkbookImportError,
        `got ${threw === null ? 'no error' : String(threw)}`);
    check('pollution scrubbed', ({} as any).polluted === undefined,
        `Object.prototype.polluted is still ${JSON.stringify(({} as any).polluted)}`);
    check('error names the key', String(threw).includes('polluted'), String(threw));
}

// --- multiple keys are all removed ---
{
    try {
        withPrototypeGuard(() => {
            (Object.prototype as any).isAdmin = true;
            (Object.prototype as any).isApproved = true;
            return null;
        });
    } catch { /* expected */ }
    check('isAdmin scrubbed', ({} as any).isAdmin === undefined);
    check('isApproved scrubbed', ({} as any).isApproved === undefined);
}

// --- a clean parse passes straight through, value intact ---
{
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    const result = withPrototypeGuard(() => ({ SheetNames: ['Sheet1'] }));
    check('clean parse returns value', JSON.stringify(result) === '{"SheetNames":["Sheet1"]}');
    check('clean parse leaves prototype alone',
        Object.getOwnPropertyNames(Object.prototype).length === before);
}

// --- a parser error propagates unchanged, and is not masked as pollution ---
{
    let threw: any = null;
    try {
        withPrototypeGuard(() => { throw new Error('corrupt zip'); });
    } catch (e) { threw = e; }
    check('parse error propagates', threw?.message === 'corrupt zip', String(threw));
    check('parse error not relabelled', !(threw instanceof WorkbookImportError));
}

// --- pollution during a FAILING parse is still scrubbed ---
{
    try {
        withPrototypeGuard(() => {
            (Object.prototype as any).sneaky = 1;
            throw new Error('parse blew up after polluting');
        });
    } catch { /* either error is acceptable; the scrub is what matters */ }
    check('scrubbed even when parse throws', ({} as any).sneaky === undefined);
}

console.log('='.repeat(60));
if (failures.length) {
    failures.forEach(f => console.log('  FAIL ' + f));
    console.log('='.repeat(60));
    console.log(`${pass} passed, ${failures.length} FAILED`);
    process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
console.log('='.repeat(60));
