
"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import NepaliDate from "nepali-date-converter"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight } from "lucide-react"

const nepaliMonths = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];
const nepaliWeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DualCalendarProps {
  selected?: Date;
  onSelect: (date?: Date) => void;
}

export function DualCalendar({ selected, onSelect }: DualCalendarProps) {
  const [calendarType, setCalendarType] = useState<"AD" | "BS">("BS");
  
  const initialDate = selected || new Date();
  const [displayDateAD, setDisplayDateAD] = useState(initialDate);

  const nepaliDate = useMemo(() => new NepaliDate(displayDateAD), [displayDateAD]);
  const [displayYearBS, setDisplayYearBS] = useState(nepaliDate.getYear());
  const [displayMonthBS, setDisplayMonthBS] = useState(nepaliDate.getMonth());

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
    // Also update the AD display date to be in the middle of the new BS month
    setDisplayDateAD(new NepaliDate(newYear, newMonth, 15).toJsDate());
  };

  const calendarGrid = useMemo(() => {
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
  }, [displayYearBS, displayMonthBS]);

  const selectedBSDate = selected ? new NepaliDate(selected) : null;

  return (
    <div className="p-3">
      <div className="flex items-center justify-center mb-4 space-x-2">
        <Label htmlFor="calendar-type">AD</Label>
        <Switch
          id="calendar-type"
          checked={calendarType === "BS"}
          onCheckedChange={(checked) => setCalendarType(checked ? "BS" : "AD")}
        />
        <Label htmlFor="calendar-type">BS</Label>
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
            <div className="flex justify-between items-center">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeMonthBS(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium">
                    {nepaliMonths[displayMonthBS]} {displayYearBS}
                </div>
                 <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeMonthBS(1)}>
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
                            {week.map((day, j) => (
                                <td key={j} className="h-9 w-9 text-center text-sm p-0 relative">
                                    {day && (
                                        <Button
                                            variant={
                                                selectedBSDate &&
                                                selectedBSDate.getYear() === displayYearBS &&
                                                selectedBSDate.getMonth() === displayMonthBS &&
                                                selectedBSDate.getDate() === day
                                                    ? 'default'
                                                    : 'ghost'
                                            }
                                            className="h-9 w-9 p-0 font-normal"
                                            onClick={() => handleBSSelect(day)}
                                        >
                                            {day}
                                        </Button>
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}
    </div>
  )
}
