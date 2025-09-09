

import {
  differenceInMinutes,
  isAfter,
  startOfDay,
  parse,
  setHours,
  setMinutes,
  setSeconds,
  format,
  isValid,
  isBefore,
  max as dateMax,
  min as dateMin,
} from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { AttendanceRecord, AttendanceStatus, RawAttendanceRow } from './types';

/* =========================
   Types
   ========================= */

export type CalcAttendanceRow = RawAttendanceRow & {
  dateADISO: string;
  dateBS: string;
  weekdayAD: number;              // 0=Sun..6=Sat
  normalizedStatus: string;
  grossHours: number;
  regularHours: number;
  overtimeHours: number;
  calcRemarks: string;
};

/* =========================
   Constants from VBA
   ========================= */
const kBaseDayHours = 8.0;
const kGraceMin = 5; // 5 minutes grace period
const kBlockMin = 30; // 30-minute penalty blocks

/* =========================
   Helpers
   ========================= */
function toBSString(dateAD: Date): string {
  try {
    const nd = new NepaliDate(dateAD);
    return nd.format('YYYY-MM-DD');
  } catch {
    return '';
  }
}

function parseADDateLoose(input: string | Date): Date | null {
  if (input instanceof Date && isValid(input)) {
    return startOfDay(input);
  }
  if (typeof input !== 'string') return null;
  // Prioritize yyyy-mm-dd format
  const candidates = ['yyyy-MM-dd', "yyyy-MM-dd'T'HH:mm:ssXXX", 'M/d/yyyy', 'd/M/yyyy', "M/d/yy"];
  for (const f of candidates) {
    try {
      const d = parse(input.trim(), f, new Date());
      if (isValid(d)) return startOfDay(d);
    } catch {}
  }
  return null;
}


function parseTimeToString(timeInput: any): string | null {
    if (!timeInput) return null;
    const t = String(timeInput).trim();
    if (t === '-' || t === '') return null;
    
    // Check if it's already HH:mm or HH:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
        const parts = t.split(':');
        const h = parts[0].padStart(2, '0');
        const m = parts[1];
        const s = parts.length > 2 ? parts[2] : '00';
        return `${h}:${m}:${s}`;
    }

    try {
        const d = new Date(timeInput);
        if (isValid(d)) {
            return format(d, 'HH:mm:ss');
        }
    } catch {}

    const formats = ['h:mm:ss a', 'h:mm a', 'HH:mm:ss', 'HH:mm', 'h:mm'];
    for (const f of formats) {
        try {
            const parsedTime = parse(t, f, new Date());
            if (isValid(parsedTime)) {
                return format(parsedTime, 'HH:mm:ss');
            }
        } catch {}
    }
    return null;
}


function combineDateAndTime(baseDate: Date, timeStr: string): Date {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return setSeconds(setMinutes(setHours(baseDate, hours), minutes), seconds || 0);
}

function ceilDiv(a: number, b: number): number {
    if (a <= 0) return 0;
    return Math.ceil(a / b);
}

function applyFixedBreak(gIn: Date, gOut: Date): number {
    const totalH = differenceInMinutes(gOut, gIn) / 60.0;
    if (totalH <= 0) return 0;

    const breakStart = setMinutes(setHours(gIn, 12), 0);
    const breakEnd = setMinutes(setHours(gIn, 13), 0);
    
    const overlapStart = dateMax([gIn, breakStart]);
    const overlapEnd = dateMin([gOut, breakEnd]);
    
    let overlapMinutes = 0;
    if (isAfter(overlapEnd, overlapStart)) {
        overlapMinutes = differenceInMinutes(overlapEnd, overlapStart);
    }
    
    const overlapH = overlapMinutes / 60.0;

    if (overlapH > 0 && totalH > 4) {
        return totalH - overlapH;
    }
    return totalH;
}



/* =========================
   Core calculator
   ========================= */
export function calculateAttendance(rows: RawAttendanceRow[]): CalcAttendanceRow[] {

  return rows.map((row): CalcAttendanceRow => {
    let ad = parseADDateLoose(row.dateAD);
    if (!ad && row.mitiBS) {
        try {
            ad = new NepaliDate(row.mitiBS).toJsDate();
        } catch (e) {
            console.error("Could not parse Nepali date:", row.mitiBS);
        }
    }
    
    // --- Date Checks ---
    let isNewLogicPeriod = false;
    let nepaliDate: NepaliDate | null = null;
    if (ad && isValid(ad)) {
        try {
            nepaliDate = new NepaliDate(ad);
            // Shrawan is month 3 (0-indexed) in nepali-date-converter
            if (nepaliDate.getYear() > 2082 || (nepaliDate.getYear() === 2082 && nepaliDate.getMonth() >= 3)) {
                isNewLogicPeriod = true;
            }
        } catch (e) {
            console.error("Could not convert to Nepali date:", ad);
        }
    }
    
    const dateBS = nepaliDate ? nepaliDate.format('YYYY-MM-DD') : (row.mitiBS || '');
    const weekday = ad ? ad.getDay() : -1;
    const isSaturdayAD = weekday === 6;

    const status = (row.status || '').trim().toUpperCase();
    const isAbsent = status === 'ABSENT' || status === 'TRUE';
    const isPublic = status.startsWith('PUBLIC');

    let gross = 0, regular = 0, ot = 0;
    let remarks = '';
    
    const onDutyTimeStr = parseTimeToString(row.onDuty);
    const offDutyTimeStr = parseTimeToString(row.offDuty);
    const clockInTimeStr = parseTimeToString(row.clockIn);
    const clockOutTimeStr = parseTimeToString(row.clockOut);
    
    const finalize = (): CalcAttendanceRow => {
      const isAdValid = ad && isValid(ad);
      
      let finalStatus: AttendanceStatus = 'Present';
      if (isAbsent) finalStatus = 'Absent';
      else if (isPublic) finalStatus = 'Public Holiday';
      else if (isSaturdayAD) finalStatus = 'Saturday';
      else if (!clockInTimeStr && clockOutTimeStr) finalStatus = 'C/I Miss';
      else if (clockInTimeStr && !clockOutTimeStr) finalStatus = 'C/O Miss';
      else if (!clockInTimeStr && !clockOutTimeStr && !isSaturdayAD && !isPublic) finalStatus = 'Absent';
      
      return {
        ...row,
        onDuty: onDutyTimeStr, offDuty: offDutyTimeStr,
        clockIn: clockInTimeStr, clockOut: clockOutTimeStr,
        dateADISO: isAdValid ? format(ad, 'yyyy-MM-dd') : '',
        dateBS,
        weekdayAD: isAdValid ? weekday : -1,
        normalizedStatus: finalStatus,
        grossHours: +gross.toFixed(2),
        regularHours: +regular.toFixed(2),
        overtimeHours: +ot.toFixed(2),
        calcRemarks: remarks,
      };
    };

    if (!ad || !isValid(ad)) {
      remarks = 'Missing or invalid date';
      return finalize();
    }
    
    // Handle pre-calculated hours from import
    if (row.normalHours !== undefined && row.normalHours !== null && row.otHours !== undefined && row.otHours !== null) {
        regular = Number(row.normalHours) || 0;
        ot = Number(row.otHours) || 0;
        gross = regular + ot;
        remarks = 'Used imported hours';
        return finalize();
    }
    
    if (isAbsent || isPublic || isSaturdayAD) {
        return finalize();
    }
    
    if (!clockInTimeStr || !clockOutTimeStr) {
      remarks = !clockInTimeStr && !clockOutTimeStr ? 'Missing punches' : (!clockInTimeStr ? 'C/I Miss' : 'C/O Miss');
      return finalize();
    }
    
    let actIn = combineDateAndTime(ad, clockInTimeStr);
    let actOut = combineDateAndTime(ad, clockOutTimeStr);

    if (isAfter(actIn, actOut)) {
      actOut = new Date(actOut.getTime() + 24 * 60 * 60 * 1000);
    }

    const grossMinutes = differenceInMinutes(actOut, actIn);
    gross = Math.max(0, grossMinutes / 60);
    
    if (isNewLogicPeriod) {
        // --- New Logic from VBA ---
        if (!onDutyTimeStr || !offDutyTimeStr) {
            remarks = 'Missing schedule';
            return finalize();
        }
        
        const schedIn = combineDateAndTime(ad, onDutyTimeStr);
        const schedOut = combineDateAndTime(ad, offDutyTimeStr);

        let lateMin = Math.max(0, differenceInMinutes(actIn, schedIn));
        let earlyMin = Math.max(0, differenceInMinutes(schedOut, actOut));

        let latePenaltyMin = 0;
        let earlyPenaltyMin = 0;
        
        if (lateMin > kGraceMin) {
            latePenaltyMin = ceilDiv(lateMin - kGraceMin, kBlockMin) * kBlockMin;
        }

        if (earlyMin > kGraceMin) {
            earlyPenaltyMin = ceilDiv(earlyMin - kGraceMin, kBlockMin) * kBlockMin;
        }
        
        const effectiveIn = new Date(schedIn.getTime() + latePenaltyMin * 60000);
        const effectiveOut = new Date(schedOut.getTime() - earlyPenaltyMin * 60000);

        let paidHours = 0;
        if (isAfter(effectiveOut, effectiveIn)) {
            paidHours = applyFixedBreak(effectiveIn, effectiveOut);
        }
        
        gross = Math.max(0, differenceInMinutes(actOut, actIn) / 60);
        regular = Math.max(0, paidHours);
        ot = 0;
        
        let remarkParts = [];
        if (lateMin > 0) remarkParts.push(`Late by ${lateMin}m`);
        if (earlyMin > 0) remarkParts.push(`Left early by ${earlyMin}m`);
        remarks = remarkParts.join('; ');
        
    } else {
        regular = gross;
        ot = 0;
    }

    return finalize();
  });
}

export function reprocessSingleRecord(raw: RawAttendanceRow): Partial<AttendanceRecord> {
  const result = calculateAttendance([raw])[0];
  return {
    date: result.dateADISO, bsDate: result.dateBS,
    status: result.normalizedStatus as AttendanceStatus,
    grossHours: result.grossHours, regularHours: result.regularHours,
    overtimeHours: result.overtimeHours, remarks: result.calcRemarks,
    onDuty: result.onDuty, offDuty: result.offDuty,
    clockIn: result.clockIn, clockOut: result.clockOut,
    sourceSheet: raw.sourceSheet || null,
  };
}
