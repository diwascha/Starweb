'use client';

import { useState, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import NepaliDate from 'nepali-date-converter';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { differenceInYears } from 'date-fns';

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];

interface BonusCalculationResult {
    employeeId: string;
    employeeName: string;
    joiningDate?: string;
    presentDays: number;
    isEligible: boolean;
    bonusAmount: number;
}

interface BonusViewProps {
    selectedBsYear: string;
    selectedBsMonth: string;
    employees: Employee[];
    attendance: AttendanceRecord[];
}

export default function BonusView({ selectedBsYear, selectedBsMonth, employees, attendance }: BonusViewProps) {
    const [minPresentDays, setMinPresentDays] = useState<number>(26);

    const bonusData = useMemo((): BonusCalculationResult[] => {
        if (!selectedBsYear || selectedBsMonth === '') return [];

        const year = parseInt(selectedBsYear, 10);
        const month = parseInt(selectedBsMonth, 10);
        const endOfBonusMonthNepali = new NepaliDate(month === 11 ? year + 1 : year, (month + 1) % 12, 1);
        endOfBonusMonthNepali.setDate(endOfBonusMonthNepali.getDate() - 1);
        const endOfBonusMonthAD = endOfBonusMonthNepali.toJsDate();

        const workingEmployees = employees.filter(e => e.status === 'Working');

        const calculatedData = workingEmployees.map(employee => {
            const employeeAttendance = attendance.filter(r => {
                if (r.employeeName !== employee.name) return false;
                return r.bsYear === year && r.bsMonth === month;
            });

            const qualifyingStatuses = ['Present', 'Public Holiday', 'Saturday', 'EXTRAOK'];
            const presentDays = employeeAttendance.filter(r => qualifyingStatuses.includes(r.status)).length;
            
            let tenureYears = 0;
            if (employee.joiningDate) {
                tenureYears = differenceInYears(endOfBonusMonthAD, new Date(employee.joiningDate));
            }

            const isEligible = tenureYears >= 1 && presentDays >= minPresentDays;
            
            return {
                employeeId: employee.id,
                employeeName: employee.name,
                joiningDate: employee.joiningDate,
                presentDays: presentDays,
                isEligible: isEligible,
                bonusAmount: isEligible ? employee.wageAmount : 0,
            };
        });
        
        calculatedData.sort((a, b) => {
            const indexA = customEmployeeOrder.indexOf(a.employeeName);
            const indexB = customEmployeeOrder.indexOf(b.employeeName);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.employeeName.localeCompare(b.employeeName);
        });

        return calculatedData;
    }, [employees, attendance, selectedBsYear, selectedBsMonth, minPresentDays]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 shadow-sm h-fit">
                <CardHeader className="py-4 border-b bg-muted/5">
                    <CardTitle className="text-xs uppercase font-black tracking-widest">Eligibility Rules</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1">Qualifier (Min. Days)</Label>
                        <Input type="number" value={minPresentDays} onChange={(e) => setMinPresentDays(Number(e.target.value) || 0)} className="h-9 font-black" />
                    </div>
                    <div className="p-4 bg-blue-50 border-2 border-blue-100 rounded-xl space-y-2">
                        <p className="text-[10px] font-black uppercase text-blue-900">Standard Qualifier</p>
                        <p className="text-[11px] text-blue-800 leading-relaxed font-medium italic">
                           Rules: 1+ Year Tenure | Full Monthly Base Payout | Threshold: {minPresentDays} Active Days.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardHeader className="py-4 border-b bg-muted/5">
                    <CardTitle className="text-xs uppercase font-black tracking-widest">Calculated Eligibility Queue</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table className="text-xs">
                        <TableHeader className="bg-muted/30">
                            <TableRow className="h-10 hover:bg-transparent">
                                <TableHead className="pl-6 font-bold uppercase">Employee Name</TableHead>
                                <TableHead className="text-center font-bold uppercase">Present Days</TableHead>
                                <TableHead className="text-center font-bold uppercase">Eligible</TableHead>
                                <TableHead className="text-right pr-6 font-bold uppercase">Bonus Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bonusData.length > 0 ? bonusData.map(item => (
                                <TableRow key={item.employeeId} className="h-12 border-b hover:bg-muted/10 transition-colors">
                                    <TableCell className="pl-6 font-black text-gray-900 uppercase tracking-tight">{item.employeeName}</TableCell>
                                    <TableCell className="text-center font-bold tabular-nums text-blue-900">{item.presentDays}</TableCell>
                                    <TableCell className="text-center">
                                        {item.isEligible ? 
                                            <Badge variant="outline" className="text-green-600 border-green-600 font-black uppercase text-[8px] h-4">YES</Badge> : 
                                            <Badge variant="outline" className="text-red-400 border-red-100 font-black uppercase text-[8px] h-4">NO</Badge>
                                        }
                                    </TableCell>
                                    <TableCell className="text-right pr-6 font-black text-gray-900">
                                        {item.isEligible ? `Rs. ${item.bonusAmount.toLocaleString()}` : '—'}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">No data found for this period.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
