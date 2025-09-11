

'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import NepaliDate from 'nepali-date-converter';
import { Badge } from '@/components/ui/badge';
import { Award, CheckCircle, XCircle } from 'lucide-react';
import { differenceInYears, endOfMonth } from 'date-fns';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const customEmployeeOrder = [
    "Tika Gurung",
    "Anju Bista",
    "Madhu Bhandari",
    "Amrita Lama",
    "sunil chaudhary",
    "KUMAR SHRESTHA",
    "Niroj Koirala",
    "Binod Magar",
    "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL",
    "Sunita Gurung"
];


interface BonusCalculationResult {
    employeeId: string;
    employeeName: string;
    joiningDate?: string; // ISO string
    presentDays: number;
    isEligible: boolean;
    bonusAmount: number;
}

export default function BonusPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    
    const [minPresentDays, setMinPresentDays] = useState<number>(26);
    
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubAttendance = onAttendanceUpdate(setAttendance);

        getAttendanceYears().then(years => {
            setBsYears(years);
            if (years.length > 0) {
                 if (!selectedBsYear || !years.includes(parseInt(selectedBsYear, 10))) {
                    const currentYear = new NepaliDate().getYear();
                    const defaultYear = years.includes(currentYear) ? currentYear : years[0];
                    setSelectedBsYear(String(defaultYear));
                    
                    const currentMonth = new NepaliDate().getMonth();
                    setSelectedBsMonth(String(currentMonth));
                }
            }
            setIsLoading(false);
        });

        return () => {
            unsubEmployees();
            unsubAttendance();
        }
    }, []);

    const bonusData = useMemo((): BonusCalculationResult[] => {
        if (!selectedBsYear || selectedBsMonth === '') {
            return [];
        }

        const year = parseInt(selectedBsYear, 10);
        const month = parseInt(selectedBsMonth, 10);
        
        const endOfBonusMonthNepali = new NepaliDate(month === 11 ? year + 1 : year, (month + 1) % 12, 1);
        endOfBonusMonthNepali.setDate(endOfBonusMonthNepali.getDate() - 1);
        const endOfBonusMonthAD = endOfBonusMonthNepali.toJsDate();


        const workingEmployees = employees.filter(e => e.status === 'Working');

        const calculatedData = workingEmployees.map(employee => {
            const employeeAttendance = attendance.filter(r => {
                if (r.employeeName !== employee.name) return false;
                try {
                    const nepaliDate = new NepaliDate(new Date(r.date));
                    return nepaliDate.getYear() === year && nepaliDate.getMonth() === month;
                } catch {
                    return false;
                }
            });

            const qualifyingStasuses: string[] = ['Present', 'Public Holiday', 'Saturday', 'EXTRAOK'];
            const presentDays = employeeAttendance.filter(r => qualifyingStasuses.includes(r.status)).length;
            
            let tenureYears = 0;
            if (employee.joiningDate) {
                tenureYears = differenceInYears(endOfBonusMonthAD, new Date(employee.joiningDate));
            }

            const isEligibleByTenure = tenureYears >= 1;
            const isEligibleByAttendance = presentDays >= minPresentDays;
            const isEligible = isEligibleByTenure && isEligibleByAttendance;
            
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

            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;

            const dateA = a.joiningDate ? new Date(a.joiningDate).getTime() : 0;
            const dateB = b.joiningDate ? new Date(b.joiningDate).getTime() : 0;

            if (dateA !== dateB) {
                return dateA - dateB;
            }

            return a.employeeName.localeCompare(b.employeeName);
        });

        return calculatedData;

    }, [employees, attendance, selectedBsYear, selectedBsMonth, minPresentDays]);

    const handleApplyBonuses = () => {
        toast({
            title: "Functionality Coming Soon",
            description: "Applying bonuses directly to payroll is under development."
        });
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Bonus Calculation</h1>
                <p className="text-muted-foreground">Calculate attendance-based bonuses for employees.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                     <CardHeader>
                        <CardTitle>Bonus Configuration</CardTitle>
                        <CardDescription>Set the rules for the bonus calculation for the selected period.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading || bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading || bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="min-present-days">Minimum Present Days to Qualify</Label>
                             <Input 
                                id="min-present-days" 
                                type="number" 
                                value={minPresentDays}
                                onChange={(e) => setMinPresentDays(Number(e.target.value) || 0)}
                            />
                        </div>
                        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                           <p className="font-semibold">Bonus Rules:</p>
                           <ul className="list-disc pl-5 mt-1 space-y-1">
                               <li>Employee tenure must be at least 1 year.</li>
                               <li>Bonus amount equals one month's salary.</li>
                               <li>Must meet minimum present days for the month.</li>
                           </ul>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <CardTitle>Bonus Eligibility Report</CardTitle>
                                <CardDescription>
                                    For {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                                </CardDescription>
                            </div>
                             <Button onClick={handleApplyBonuses}>
                                <Award className="mr-2 h-4 w-4"/> Apply Bonuses to Payroll
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee Name</TableHead>
                                    <TableHead>Present Days</TableHead>
                                    <TableHead>Eligible</TableHead>
                                    <TableHead>Bonus Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bonusData.length > 0 ? bonusData.map(item => (
                                    <TableRow key={item.employeeId}>
                                        <TableCell className="font-medium">{item.employeeName}</TableCell>
                                        <TableCell>{item.presentDays}</TableCell>
                                        <TableCell>
                                            {item.isEligible ? 
                                                <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="mr-1 h-3 w-3"/> Yes</Badge> : 
                                                <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3"/> No</Badge>
                                            }
                                        </TableCell>
                                        <TableCell>{item.bonusAmount.toLocaleString()}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center">Select a period to see bonus data.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
