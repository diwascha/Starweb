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

/** True if the given BS year/month falls within the given fiscal year. */
export const isInFiscalYear = (bsYear: number, bsMonth: number, fyStartYear: number): boolean =>
    getFiscalYearStart(bsYear, bsMonth) === fyStartYear;

/**
 * Derives the sorted (descending) list of fiscal years present in a set of
 * BS year/month pairs - e.g. from attendance or payroll records. Records
 * with a missing/zero bsYear (e.g. a bad import row) are excluded so they
 * never surface as a bogus "-1/00"-style bucket in a fiscal-year picker.
 */
export const getAvailableFiscalYears = (periods: FiscalYearMonth[]): number[] => {
    const years = new Set(
        periods
            .filter(p => p.bsYear > 0)
            .map(p => getFiscalYearStart(p.bsYear, p.bsMonth))
    );
    return Array.from(years).sort((a, b) => b - a);
};

/** BS month name for a fiscal-year month index (0 = Shrawan .. 11 = Ashadh). */
export const fiscalMonthName = (fyMonthIndex: number): string => {
    const bsMonth = (FISCAL_YEAR_START_MONTH + fyMonthIndex) % 12;
    return NEPALI_MONTHS.find(m => m.value === bsMonth)?.name || '';
};
