import * as xlsx from 'xlsx';
import { firestore } from 'firebase-admin';

/**
 * Represents the period for which the report is being imported.
 */
interface ImportPeriod {
  bsYear: number;
  bsMonth: number;
}

/**
 * Represents the result of the import process, detailing which blocks were found and processed.
 */
interface ImportResult {
  foundBlocks: string[];
  importedBlocks: string[];
  errors: string[];
}

/**
 * Configuration for a per-employee data block.
 */
interface EmployeeBlockConfig {
  title: string;
  collection: string;
  anchorCol: number;
  colMap: { [key: string]: string };
}

const db = firestore();

/**
 * Finds the starting row and column index of a block by its title.
 * @param grid The entire sheet as an array of arrays.
 * @param title The title text to search for.
 * @returns The row and column index, or null if not found.
 */
function findBlockStart(grid: any[][], title: string): { row: number; col: number } | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (typeof grid[r][c] === 'string' && grid[r][c].trim().startsWith(title)) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

/**
 * Gets or creates an employee document.
 * @param name The employee's name.
 */
async function getOrCreateEmployee(name: string): Promise<void> {
  const empLower = name.trim().toLowerCase();
  if (!empLower) return;

  const employeeRef = db.collection('employees').doc(empLower);
  const employeeSnap = await employeeRef.get();

  if (!employeeSnap.exists) {
    await employeeRef.set({
      name: name.trim(),
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Parses the Payroll block from the Excel sheet.
 */
async function parsePayrollBlock(grid: any[][], period: ImportPeriod, result: ImportResult): Promise<void> {
  const start = findBlockStart(grid, 'Payroll');
  if (!start) {
    result.errors.push('Payroll block title not found.');
    return;
  }
  result.foundBlocks.push('Payroll');

  const headerRowIndex = start.row + 1;
  const headerRow = grid[headerRowIndex].map(h => (typeof h === 'string' ? h.trim() : ''));
  const isBonusMode = headerRow.includes('Bonus') || headerRow.includes('Final Net');

  const colMap: { [key: string]: number } = {};
  const expectedCols = [
    'Employee', 'Regular Hrs', 'OT Hrs', 'Absent Days', 'Base', 'Basic Pay', 'OT Pay',
    'Allowance', 'Gross', 'TDS', 'Gross Salary', 'Advance', 'Net', 'Rounded Net', 'Remarks'
  ];
  if (isBonusMode) {
    expectedCols.splice(expectedCols.indexOf('Remarks'), 0, 'Bonus', 'Final Net');
  }

  headerRow.forEach((header, index) => {
    if (header) colMap[header] = index;
  });

  const batch = db.batch();
  let dataRowIndex = headerRowIndex + 1;

  while (dataRowIndex < grid.length && grid[dataRowIndex] && grid[dataRowIndex].some(cell => cell !== null && cell !== '')) {
    const row = grid[dataRowIndex];
    const employeeName = row[colMap['Employee']];
    if (typeof employeeName !== 'string' || !employeeName.trim()) {
      dataRowIndex++;
      continue;
    }

    await getOrCreateEmployee(employeeName);
    const empLower = employeeName.trim().toLowerCase();
    const docId = `${empLower}_${period.bsYear}_${period.bsMonth}`;
    const docRef = db.collection('payroll').doc(docId);

    const data: any = {
      ...period,
      employeeName: employeeName.trim(),
      regularHours: Number(row[colMap['Regular Hrs']]) || 0,
      otHours: Number(row[colMap['OT Hrs']]) || 0,
      absentDays: Number(row[colMap['Absent Days']]) || 0,
      base: Number(row[colMap['Base']]) || 0,
      basicPay: Number(row[colMap['Basic Pay']]) || 0,
      otPay: Number(row[colMap['OT Pay']]) || 0,
      allowance: Number(row[colMap['Allowance']]) || 0,
      gross: Number(row[colMap['Gross']]) || 0,
      tds: Number(row[colMap['TDS']]) || 0,
      grossSalary: Number(row[colMap['Gross Salary']]) || 0,
      advance: Number(row[colMap['Advance']]) || 0,
      net: Number(row[colMap['Net']]) || 0,
      roundedNet: Number(row[colMap['Rounded Net']]) || 0,
      remarks: row[colMap['Remarks']] || '',
    };

    if (isBonusMode) {
      data.bonus = Number(row[colMap['Bonus']]) || 0;
      data.finalNet = Number(row[colMap['Final Net']]) || 0;
    }

    batch.set(docRef, data);
    dataRowIndex++;
  }

  await batch.commit();
  result.importedBlocks.push('Payroll');
}

/**
 * Parses a generic per-employee block.
 */
async function parsePerEmployeeBlock(
  grid: any[][],
  period: ImportPeriod,
  result: ImportResult,
  config: EmployeeBlockConfig
): Promise<void> {
  const start = findBlockStart(grid, config.title);
  if (!start) {
    result.errors.push(`${config.title} block not found.`);
    return;
  }
  result.foundBlocks.push(config.title);

  const headerRowIndex = start.row + 1;
  const headerRow = grid[headerRowIndex].map(h => (typeof h === 'string' ? h.trim() : ''));

  const excelHeaderToFieldIndex: { [key: string]: number } = {};
  headerRow.forEach((header, index) => {
    if (header) excelHeaderToFieldIndex[header] = index;
  });

  const batch = db.batch();
  let dataRowIndex = headerRowIndex + 1;

  while (dataRowIndex < grid.length && grid[dataRowIndex] && grid[dataRowIndex][config.anchorCol]) {
    const row = grid[dataRowIndex];
    const employeeName = row[excelHeaderToFieldIndex['Employee']];
    if (typeof employeeName !== 'string' || !employeeName.trim()) {
      dataRowIndex++;
      continue;
    }

    await getOrCreateEmployee(employeeName);
    const empLower = employeeName.trim().toLowerCase();
    const docId = `${empLower}_${period.bsYear}_${period.bsMonth}`;
    const docRef = db.collection(config.collection).doc(docId);

    const data: any = { ...period, employeeName: employeeName.trim() };
    for (const excelCol in config.colMap) {
      const firestoreField = config.colMap[excelCol];
      const colIndex = excelHeaderToFieldIndex[excelCol];
      if (colIndex !== undefined) {
        const value = row[colIndex];
        // Coerce to number if it looks like one, otherwise keep as string
        data[firestoreField] = (typeof value === 'number') ? value : (String(value || '').trim());
        if (typeof data[firestoreField] === 'string' && !isNaN(parseFloat(data[firestoreField])) && isFinite(data[firestoreField] as any)) {
            data[firestoreField] = Number(data[firestoreField]);
        }
      }
    }

    batch.set(docRef, data);
    dataRowIndex++;
  }

  await batch.commit();
  result.importedBlocks.push(config.title);
}

/**
 * Parses the Pattern Insights block.
 */
async function parsePatternInsightsBlock(grid: any[][], period: ImportPeriod, result: ImportResult): Promise<void> {
  const start = findBlockStart(grid, 'Pattern Insights');
  if (!start) {
    result.errors.push('Pattern Insights block not found.');
    return;
  }
  result.foundBlocks.push('Pattern Insights');

  const data: any = { ...period, rawInsights: [] };
  let rowIndex = start.row + 1;

  while (rowIndex < grid.length && grid[rowIndex] && grid[rowIndex][start.col]) {
    const line = String(grid[rowIndex][start.col]).trim();
    data.rawInsights.push(line);

    let match;
    if ((match = line.match(/Highest late arrivals: (\w+) \((\d+) days\)/))) {
      data.highestLateWeekday = match[1];
      data.highestLateCount = parseInt(match[2], 10);
    } else if ((match = line.match(/Highest absenteeism: (\w+) \((\d+) days\)/))) {
      data.highestAbsentWeekday = match[1];
      data.highestAbsentCount = parseInt(match[2], 10);
    } else if ((match = line.match(/Most punctual weekday: (\w+) \((\d+\.?\d*)% late rate\)/))) {
      data.mostPunctualWeekday = match[1];
      data.mostPunctualLateRate = parseFloat(match[2]);
    } else if ((match = line.match(/End-of-month trend: (\d+\.?\d*)% change/))) {
        data.endOfMonthTrend = parseFloat(match[1]);
    } else if ((match = line.match(/last 5 days (\d+\.?\d*)% late/))) {
        data.endOfMonthTrend = parseFloat(match[1]);
    } else if ((match = line.match(/Saturday utilization: (\d+\.?\d*)% Saturdays had work/))) {
      data.saturdayUtilPct = parseFloat(match[1]);
    } else if ((match = line.match(/Worst shift-start for lateness: (.+) \((\d+\.?\d*)% late\)/))) {
      data.worstShiftStartLateness = match[1];
      data.worstShiftStartLatePct = parseFloat(match[2]);
    } else if ((match = line.match(/Public Holiday OT total: (\d+\.?\d*) hours/))) {
      data.phOtTotalHours = parseFloat(match[1]);
    } else if (line.startsWith('Late hotspots:')) {
      data.lateHotspots = line.replace('Late hotspots:', '').trim().split(',').map(d => d.trim());
    }

    rowIndex++;
  }

  const docId = `${period.bsYear}_${period.bsMonth}`;
  await db.collection('pattern_insights').doc(docId).set(data);
  result.importedBlocks.push('Pattern Insights');
}

/**
 * Parses the Day of Week Patterns block.
 */
async function parseDowPatternsBlock(grid: any[][], period: ImportPeriod, result: ImportResult): Promise<void> {
  const start = findBlockStart(grid, 'Day of Week Patterns:');
  if (!start) {
    result.errors.push('Day of Week Patterns block not found.');
    return;
  }
  result.foundBlocks.push('Day of Week Patterns');

  const headerRowIndex = start.row + 1;
  const headerRow = grid[headerRowIndex].map(h => (typeof h === 'string' ? h.trim() : ''));
  const dayCol = headerRow.indexOf('Day');
  const punctualityCol = headerRow.indexOf('Punctuality %');
  const lateCol = headerRow.indexOf('Late Arrivals %');
  const absentCol = headerRow.indexOf('Absenteeism %');

  const patterns: any[] = [];
  for (let i = 1; i <= 7; i++) {
    const row = grid[headerRowIndex + i];
    if (!row || !row[dayCol]) break;
    patterns.push({
      day: row[dayCol],
      punctualityPct: Number(row[punctualityCol]) || 0,
      lateArrivalsPct: Number(row[lateCol]) || 0,
      absenteeismPct: Number(row[absentCol]) || 0,
    });
  }

  const docId = `${period.bsYear}_${period.bsMonth}`;
  await db.collection('dow_patterns').doc(docId).set({ ...period, patterns });
  result.importedBlocks.push('Day of Week Patterns');
}

/**
 * Parses the Month-to-Month Behavioral Comparison block.
 */
async function parseBehaviorComparisonBlock(grid: any[][], period: ImportPeriod, result: ImportResult): Promise<void> {
  const start = findBlockStart(grid, 'Month-to-Month Behavioral Comparison');
  if (!start) {
    result.errors.push('Month-to-Month Behavioral Comparison block not found.');
    return;
  }
  result.foundBlocks.push('Month-to-Month Behavioral Comparison');

  const subtitleRow = grid[start.row + 1];
  const subtitle = subtitleRow.find(c => typeof c === 'string' && c.includes('Current:'));
  const periodMatch = subtitle?.match(/Current: (.*)vs\s*Previous: (.*)/);
  const currentPeriodLabel = periodMatch ? periodMatch[1].trim() : '';
  const prevPeriodLabel = periodMatch ? periodMatch[2].trim() : '';

  const dataHeaderRowIndex = start.row + 3;
  const employeeCol = start.col;

  const metrics = [
    'lateArrivals', 'earlyDepartures', 'absentDays', 'missingPunches',
    'onTimePct', 'extraOkHours', 'otHours'
  ];

  const batch = db.batch();
  let dataRowIndex = dataHeaderRowIndex + 1;

  while (dataRowIndex < grid.length && grid[dataRowIndex] && grid[dataRowIndex][employeeCol]) {
    const row = grid[dataRowIndex];
    const employeeName = row[employeeCol];
    if (typeof employeeName !== 'string' || !employeeName.trim()) {
      dataRowIndex++;
      continue;
    }

    await getOrCreateEmployee(employeeName);
    const empLower = employeeName.trim().toLowerCase();
    const docId = `${empLower}_${period.bsYear}_${period.bsMonth}`;
    const docRef = db.collection('behavior_comparison').doc(docId);

    const data: any = { ...period, employeeName: employeeName.trim(), currentPeriodLabel, prevPeriodLabel };

    metrics.forEach((metric, i) => {
      const baseCol = employeeCol + 1 + (i * 3);
      data[metric] = {
        thisMonth: Number(row[baseCol]) || 0,
        prevMonth: Number(row[baseCol + 1]) || 0,
        delta: Number(row[baseCol + 2]) || 0,
      };
    });

    data.remarksFlag = row[employeeCol + 1 + (metrics.length * 3)] || '';

    batch.set(docRef, data);
    dataRowIndex++;
  }

  await batch.commit();
  result.importedBlocks.push('Month-to-Month Behavioral Comparison');
}

/**
 * Main service function to import VBA reports from an Excel file.
 * @param fileBuffer The buffer of the .xlsx file.
 * @param period The BS Year and Month for the import.
 * @returns A result object summarizing the import.
 */
export async function importVbaReports(fileBuffer: Buffer, period: ImportPeriod): Promise<ImportResult> {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];

  const result: ImportResult = {
    foundBlocks: [],
    importedBlocks: [],
    errors: [],
  };

  // Per-employee blocks
  const perEmployeeConfigs: EmployeeBlockConfig[] = [
    {
      title: 'Behavioral Patterns (from attendance data)',
      collection: 'behavior_patterns',
      anchorCol: 16, // Q
      colMap: {
        'Employee': 'employeeName', 'Workdays': 'workdays', 'OnTime Days': 'onTimeDays', 'OnTime %': 'onTimePct',
        'Late Days': 'lateDays', 'Early Days': 'earlyDays', 'Missing Punch Days': 'missingPunchDays',
        'Absent Days': 'absentDays', 'Sat Worked': 'saturdaysWorked', 'PH Worked': 'phWorked',
        'ExtraOK Hours': 'extraOkHours', 'Insight': 'insight',
      },
    },
    {
      title: 'Enhanced Employee Insights',
      collection: 'enhanced_insights',
      anchorCol: 16, // Q
      colMap: {
        'Employee': 'employeeName', 'Punctuality Trend': 'punctualityTrend', 'Absence Pattern': 'absencePattern',
        'OT Impact': 'otImpact', 'Shift-End Behavior': 'shiftEndBehavior', 'Performance Insight': 'performanceInsight',
      },
    },
  ];

  const parsers = [
    parsePayrollBlock(grid, period, result),
    ...perEmployeeConfigs.map(config => parsePerEmployeeBlock(grid, period, result, config)),
    parsePatternInsightsBlock(grid, period, result),
    parseDowPatternsBlock(grid, period, result),
    parseBehaviorComparisonBlock(grid, period, result),
  ];

  await Promise.allSettled(parsers.map(p => p.catch(e => {
      console.error('Error during block parsing:', e);
      result.errors.push(e.message || 'An unknown error occurred during parsing.');
  })));

  return result;
}
