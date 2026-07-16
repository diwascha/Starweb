
"use client"

import * as React from "react"
import { useState, useMemo, useEffect } from "react"
import NepaliDate from "nepali-date-converter"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"

const nepaliMonths = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];
const nepaliWeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Range for BS Year selection
const BS_YEARS = Array.from({ length: 151 }, (_, i) => 1970 + i);

interface DualCalendarProps {
  selected?: Date;
  onSelect: (date?: Date) => void;
}

export function DualCalendar({ selected, onSelect }: DualCalendarProps) {
  const [calendarType, setCalendarType] = useState<"AD" | "BS">("BS");
  const [manualInput, setManualInput] = useState("");
  
  const initialDate = selected || new Date();
  const [displayDateAD, setDisplayDateAD] = useState(initialDate);

  const nepaliDate = useMemo(() => new NepaliDate(displayDateAD), [displayDateAD]);
  const [displayYearBS, setDisplayYearBS] = useState(nepaliDate.getYear());
  const [displayMonthBS, setDisplayMonthBS] = useState(nepaliDate.getMonth());

  const todayBS = useMemo(() => new NepaliDate(), []);

  // Sync manual input text with selected date on change
  useEffect(() => {
    if (selected) {
        const nd = new NepaliDate(selected);
        setManualInput(calendarType === 'BS' ? nd.format('YYYY/MM/DD') : selected.toISOString().split('T')[0]);
    }
  }, [selected, calendarType]);

  const handleADSelect = (date?: Date) => {
    if (date) {
      onSelect(date);
      setDisplayDateAD(date);
      const newNepaliDate = new NepaliDate(date);
      setDisplayYearBS(newNepaliDate.getYear());
      setDisplayMonthBS(newNepaliDate.getMonth());
    }
  };
  
  const handleBSSelect = (day: number) => {
    try {
        const date = new NepaliDate(displayYearBS, displayMonthBS, day);
        const adDate = date.toJsDate();
        onSelect(adDate);
        setDisplayDateAD(adDate);
    } catch (e) {
        console.error("Invalid Nepali date selected", e);
    }
  };

  const changeMonthBS = (increment: number) => {
    let newMonth = displayMonthBS + increment;
    let newYear = displayYearBS;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    setDisplayMonthBS(newMonth);
    setDisplayYearBS(newYear);
    // Also update the AD display date to be in the middle of the new BS month for standard navigation
    try {
        setDisplayDateAD(new NepaliDate(newYear, newMonth, 15).toJsDate());
    } catch {
        // Fallback for edge cases
    }
  };

  const handleManualJump = (val: string) => {
    setManualInput(val);
    if (!val) return;

    if (calendarType === 'BS') {
        // Expected: YYYY/MM/DD
        const parts = val.split(/[/-]/);
        if (parts.length === 3) {
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1; // Converter is 0-indexed
            const d = parseInt(parts[2]);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y > 1900 && m >= 0 && m <= 11 && d >= 1 && d <= 32) {
                try {
                    const nd = new NepaliDate(y, m, d);
                    const ad = nd.toJsDate();
                    onSelect(ad);
                    setDisplayDateAD(ad);
                    setDisplayYearBS(y);
                    setDisplayMonthBS(m);
                } catch {}
            }
        }
    } else {
        // Expected: YYYY-MM-DD
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            handleADSelect(d);
        }
    }
  };

  const calendarGrid = useMemo(() => {
    try {
        const firstDayOfMonth = new NepaliDate(displayYearBS, displayMonthBS, 1);
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday
        
        // Correct way to get days in month for this library
        const nextMonthFirstDay = new NepaliDate(displayMonthBS === 11 ? displayYearBS + 1 : displayYearBS, (displayMonthBS + 1) % 12, 1);
        nextMonthFirstDay.setDate(nextMonthFirstDay.getDate() - 1);
        const daysInMonth = nextMonthFirstDay.getDate();

        const grid = [];
        let day = 1;

        for (let i = 0; i < 6; i++) { // Max 6 weeks
            const week = [];
            for (let j = 0; j < 7; j++) {
                if (i === 0 && j < startingDayOfWeek) {
                    week.push(null);
                } else if (day > daysInMonth) {
                    week.push(null);
                } else {
                    week.push(day++);
                }
            }
            grid.push(week);
            if (day > daysInMonth) break;
        }
        return grid;
    } catch (e) {
        return [];
    }
  }, [displayYearBS, displayMonthBS]);

  const selectedBSDate = selected ? new NepaliDate(selected) : null;

  return (
    <div className="p-3 w-full space-y-4">
      {/* Top Controller: Mode Toggle & Manual Entry */}
      <div className="flex flex-col gap-3 pb-2 border-b">
          <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Label className="text-[10px] uppercase font-bold" htmlFor="calendar-type">AD</Label>
                <Switch
                  id="calendar-type"
                  checked={calendarType === "BS"}
                  onCheckedChange={(checked) => setCalendarType(checked ? "BS" : "AD")}
                />
                <Label className="text-[10px] uppercase font-bold" htmlFor="calendar-type">BS</Label>
              </div>
              <ConnectionIndicator />
          </div>
          
          <div className="relative group">
              <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                value={manualInput} 
                onChange={e => handleManualJump(e.target.value)} 
                placeholder={calendarType === 'BS' ? "YYYY/MM/DD" : "YYYY-MM-DD"}
                className="pl-8 h-8 text-[11px] font-mono shadow-inner bg-muted/20 border-none focus-visible:ring-1"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground uppercase pointer-events-none opacity-50">
                  Jump To
              </div>
          </div>
      </div>

      {calendarType === "AD" ? (
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleADSelect}
          month={displayDateAD}
          onMonthChange={setDisplayDateAD}
        />
      ) : (
        <div className="space-y-4">
            {/* Header: Selectors & Navigation */}
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonthBS(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex-1 flex gap-1">
                    <Select value={String(displayMonthBS)} onValueChange={v => setDisplayMonthBS(parseInt(v))}>
                        <SelectTrigger className="h-8 text-xs px-2 shadow-none border-none hover:bg-muted font-bold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {nepaliMonths.map((m, i) => <SelectItem key={m} value={String(i)} className="text-xs">{m}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    <Select value={String(displayYearBS)} onValueChange={v => setDisplayYearBS(parseInt(v))}>
                        <SelectTrigger className="h-8 text-xs px-2 shadow-none border-none hover:bg-muted font-bold w-[75px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                            {BS_YEARS.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonthBS(1)}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <table className="w-full border-collapse space-y-1">
                <thead>
                    <tr className="flex">
                        {nepaliWeekDays.map(day => (
                            <th key={day} className="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]">{day}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {calendarGrid.map((week, i) => (
                        <tr key={i} className="flex w-full mt-2">
                            {week.map((day, j) => {
                                const isSelected = selectedBSDate &&
                                    selectedBSDate.getYear() === displayYearBS &&
                                    selectedBSDate.getMonth() === displayMonthBS &&
                                    selectedBSDate.getDate() === day;
                                
                                const isToday = todayBS.getYear() === displayYearBS &&
                                    todayBS.getMonth() === displayMonthBS &&
                                    todayBS.getDate() === day;

                                return (
                                <td key={j} className="h-9 w-9 text-center text-sm p-0 relative">
                                    {day && (
                                        <Button
                                            variant={isSelected ? 'default' : 'ghost'}
                                            className={cn(
                                                "h-9 w-9 p-0 font-normal",
                                                isToday && !isSelected && "bg-accent text-accent-foreground border-2 border-primary/20",
                                                isSelected && "bg-primary text-primary-foreground font-bold shadow-md"
                                            )}
                                            onClick={() => handleBSSelect(day)}
                                        >
                                            {day}
                                        </Button>
                                    )}
                                </td>
                            )})}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}
    </div>
  )
}

function ConnectionIndicator() {
    return (
        <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            Sync
        </div>
    );
}
