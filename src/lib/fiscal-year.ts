/**
 * @fileOverview Nepali fiscal-year helpers.
 *
 * The Nepali fiscal year runs Shrawan (BS month index 3) through Ashadh
 * (index 2) of the following BS year - e.g. FY "2083/84" covers Shrawan
 * 2083 through Ashadh 2084. HR data (attendance, payroll, bonus) is
 * naturally grouped this way rather than by BS calendar year, since that's
 * how the source workbooks and the business itself operate.
 */
import { NEPALI_MONTHS } from './constants';

const FISCAL_YEAR_START_MONTH = 3; // Shrawan

export interface FiscalYearMonth {
    bsYear: number;
    bsMonth: number; // 0-11
}

/**
 * The fiscal year a given BS year/month falls into, expressed as the
 * starting BS year (e.g. Shrawan 2083 through Ashadh 2084 both resolve to
 * fiscal year 2083).
 */
export const getFiscalYearStart = (bsYear: number, bsMonth: number): number =>
    bsMonth >= FISCAL_YEAR_START_MONTH ? bsYear : bsYear - 1;

/** Display label for a fiscal year, e.g. 2083 -> "2083/84". */
export const formatFiscalYear = (fyStartYear: number): string =>
    `${fyStartYear}/${String((fyStartYear + 1) % 100).padStart(2, '0')}`;

/** The 12 (bsYear, bsMonth) pairs that make up a fiscal year, Shrawan first. */
export const getFiscalYearMonths = (fyStartYear: number): FiscalYearMonth[] => {
    const months: FiscalYearMonth[] = [];
    for (let i = 0; i < 12; i++) {
        const bsMonth = (FISCAL_YEAR_START_MONTH + i) % 12;
        const bsYear = bsMonth >= FISCAL_YEAR_START_MONTH ? fyStartYear : fyStartYear + 1;
        months.push({ bsYear, bsMonth });
    }
    return months;
};


/** BS month name for a fiscal-year month index (0 = Shrawan .. 11 = Ashadh). */
export const fiscalMonthName = (fyMonthIndex: number): string => {
    const bsMonth = (FISCAL_YEAR_START_MONTH + fyMonthIndex) % 12;
    return NEPALI_MONTHS.find(m => m.value === bsMonth)?.name || '';
};

/**
 * The BS years a fiscal year touches, for scoping a Firestore listener.
 *
 * A fiscal year runs Shrawan of one BS year through Ashadh of the next, so it
 * always spans exactly two. Listeners query `bsYear` by equality - one cheap
 * index-free filter each - and narrow to the exact month client-side.
 */
export const getFiscalYearBsYears = (fyStartYear: number): number[] =>
    Number.isFinite(fyStartYear) && fyStartYear > 0 ? [fyStartYear, fyStartYear + 1] : [];

/**
 * The fiscal years that BS years with data could belong to.
 *
 * A BS year Y straddles two fiscal years: its Shrawan-onward months belong to
 * FY Y, its Baishakh-to-Ashadh months to FY Y-1. Without reading the months
 * themselves we cannot tell which, so both are offered.
 *
 * This deliberately errs towards offering a fiscal year that turns out empty
 * rather than hiding one that has data - an empty month in the picker is a
 * cosmetic surprise, whereas a missing year is data the user cannot reach.
 */
export const getFiscalYearsForBsYears = (bsYears: number[]): number[] => {
    const fys = new Set<number>();
    bsYears.filter(y => y > 0).forEach(y => { fys.add(y); fys.add(y - 1); });
    return Array.from(fys).sort((a, b) => b - a);
};
