/**
 * Verification for toWords(), the amount-in-words printed on cheque leaves,
 * cheque/TDS vouchers and estimate invoices.
 *
 * On a cheque the words govern over the figures, so a wrong word here is a
 * wrong payment. Two shipped defects motivated these cases: the thousands
 * branch dropped the hundreds digit (Rs 1,500 printed "One Thousand Only"),
 * and a non-finite amount recursed forever instead of rendering.
 */
import { toWords } from '../src/lib/utils';

let pass = 0;
const failures: string[] = [];

const eq = (input: number, expected: string) => {
    let actual: string;
    try {
        actual = toWords(input);
    } catch (e: any) {
        failures.push(`toWords(${input}) THREW ${e?.message}`);
        return;
    }
    if (actual === expected) pass++;
    else failures.push(`toWords(${input})\n     expected: ${expected}\n     actual:   ${actual}`);
};

// --- the regressions that were printing wrong amounts on cheques ---
eq(1500, 'One Thousand Five Hundred Only.');
eq(1234, 'One Thousand Two Hundred Thirty Four Only.');
eq(5250, 'Five Thousand Two Hundred Fifty Only.');
eq(2100, 'Two Thousand One Hundred Only.');
eq(10500, 'Ten Thousand Five Hundred Only.');
eq(99999, 'Ninety Nine Thousand Nine Hundred Ninety Nine Only.');
eq(275500.5, 'Two Lakh Seventy Five Thousand Five Hundred And Fifty Paisa Only.');

// --- units, teens and tens ---
eq(0, 'Zero Only.');
eq(1, 'One Only.');
eq(7, 'Seven Only.');
eq(13, 'Thirteen Only.');
eq(19, 'Nineteen Only.');
eq(20, 'Twenty Only.');
eq(21, 'Twenty One Only.');
eq(90, 'Ninety Only.');
eq(99, 'Ninety Nine Only.');

// --- hundreds ---
eq(100, 'One Hundred Only.');
eq(101, 'One Hundred One Only.');
eq(110, 'One Hundred Ten Only.');
eq(999, 'Nine Hundred Ninety Nine Only.');

// --- thousands, including the zero-hundreds cases that used to "work" ---
eq(1000, 'One Thousand Only.');
eq(1001, 'One Thousand One Only.');
eq(1010, 'One Thousand Ten Only.');
eq(1100, 'One Thousand One Hundred Only.');
eq(50000, 'Fifty Thousand Only.');
eq(45678, 'Forty Five Thousand Six Hundred Seventy Eight Only.');

// --- lakh and crore (Nepali/Indian grouping) ---
eq(100000, 'One Lakh Only.');
eq(450000, 'Four Lakh Fifty Thousand Only.');
eq(123456, 'One Lakh Twenty Three Thousand Four Hundred Fifty Six Only.');
eq(10000000, 'One Crore Only.');
eq(12345678, 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only.');
eq(1000000000, 'One Hundred Crore Only.');

// --- paisa, and the rounding carry ---
eq(0.5, 'Fifty Paisa Only.');
eq(0.01, 'One Paisa Only.');
eq(1.25, 'One And Twenty Five Paisa Only.');
eq(99.99, 'Ninety Nine And Ninety Nine Paisa Only.');
eq(99.999, 'One Hundred Only.');          // must carry, not print "100 paisa"
eq(0.004, 'Zero Only.');                   // rounds to nothing
eq(1500.75, 'One Thousand Five Hundred And Seventy Five Paisa Only.');

// --- signed amounts ---
eq(-1500, 'Minus One Thousand Five Hundred Only.');

// --- non-finite input must not recurse forever ---
for (const bad of [NaN, Infinity, -Infinity]) {
    const label = String(bad);
    let actual: string | null = null;
    const timer = setTimeout(() => {}, 0);
    try {
        actual = toWords(bad as number);
        pass++;
    } catch (e: any) {
        failures.push(`toWords(${label}) THREW ${e?.message} (must return, not recurse)`);
    }
    clearTimeout(timer);
    if (actual !== null && actual !== '') {
        failures.push(`toWords(${label}) returned ${JSON.stringify(actual)}, expected ''`);
    }
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
