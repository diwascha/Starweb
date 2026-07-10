'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Timer, 
    Plus, 
    Trash2, 
    Edit, 
    Settings2,
    Clock,
    CalendarIcon,
    X,
    CheckCircle2,
    Info,
    Calculator,
    Award,
    Save,
    Loader2,
    Terminal,
    PlayCircle,
    ArrowRight,
    ShieldAlert,
    RefreshCcw,
    CalendarCheck,
    Briefcase,
    Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
    onShiftsUpdate, saveShift, deleteShift, discoverShiftsFromRawLogs,
    onHolidaysUpdate, saveHoliday, deleteHoliday,
    onLeaveRequestsUpdate, saveLeaveRequest, deleteLeaveRequest
} from '@/services/hr-admin-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { runHourlyCalculation } from '@/services/attendance-service';
import type { HrShift, HrConfig, PublicHoliday, LeaveRequest, Employee } from '@/lib/types';
import { toNepaliDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format, differenceInDays } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

const INITIAL_HR_CONFIG: HrConfig = {
    hours: {
        baseDayHours: 8,
        roundStep: 0.5,
        graceMin: 5,
        blockMin: 30,
        freeLate: 1,
        freeLatePeriod: 'WEEKLY',
        freeEarly: 1,
        freeEarlyPeriod: 'WEEKLY',
        reviewThresh: 8.5,
        breakStart: '12:00',
        breakEnd: '13:00'
    },
    payroll: {
        defaultHourly: 83.5,
        fallbackHourly: 83.5,
        tdsRate: 0.01,
        monthDays: 30,
        stdWorkdays: 26,
        attendReqPct: 90,
        punctHighPct: 95,
        punctMidPct: 85,
        lateDaysHigh: 6,
        lateDaysMid: 3,
        otHighHours: 15,
        otMidHours: 5,
        dowLateHighPct: 15,
        dowLateMidPct: 5
    },
    bonus: {
        bonusEligReq: 75,
        bonusAbsFactor: 1
    }
};

export default function HrOfficePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    
    // Core Operational Data
    const [shifts, setShifts] = useState<HrShift[]>([]);
    const [hrConfig, setHrConfig] = useState<HrConfig>(INITIAL_HR_CONFIG);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isRefreshingShifts, setIsRefreshingShifts] = useState(false);

    // Holidays & Leaves Data
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // Calculation Selection
    const [isCalculating, setIsCalculating] = useState(false);
    const [selectedYear, setSelectedYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new NepaliDate().getMonth()));

    // Form & Dialog States
    const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<HrShift | null>(null);
    const [shiftForm, setShiftForm] = useState({ name: '', onDuty: '09:00', offDuty: '17:00', breakStart: '12:00', breakEnd: '13:00', isDefault: false });

    const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
    const [holidayForm, setHolidayForm] = useState({ name: '', date: new Date().toISOString(), isRecurring: true });

    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ 
        employeeId: '', 
        leaveType: 'Paid' as any, 
        startDate: new Date().toISOString(), 
        endDate: new Date().toISOString(), 
        reason: '' 
    });

    useEffect(() => {
        const unsubs = [
            onShiftsUpdate(setShifts),
            onHolidaysUpdate(setHolidays),
            onLeaveRequestsUpdate(setLeaveRequests),
            onEmployeesUpdate(setEmployees),
            onSettingUpdate('hr_config', (s) => {
                if (s?.value) setHrConfig(s.value);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const handleSaveHrConfig = async () => {
        if (!user) return;
        setIsSavingConfig(true);
        try {
            await setSetting('hr_config', {
                ...hrConfig,
                lastModifiedBy: user.username,
                lastModifiedAt: new Date().toISOString()
            });
            toast({ title: 'Operational Rules Updated' });
        } catch (error) {
            toast({ title: 'Update Failed', variant: 'destructive' });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleRunCalculation = async () => {
        if (!user) return;
        setIsCalculating(true);
        try {
            const { processed } = await runHourlyCalculation(
                parseInt(selectedYear),
                parseInt(selectedMonth),
                user.username
            );
            toast({ 
                title: 'Calculation Successful', 
                description: `Successfully processed ${processed} attendance records with configured hourly rules.` 
            });
            router.push('/hr/attendance');
        } catch (error: any) {
            toast({ title: 'Calculation Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsCalculating(false);
        }
    };

    const handleRefreshShifts = async () => {
        if (!user) return;
        setIsRefreshingShifts(true);
        try {
            const count = await discoverShiftsFromRawLogs(user.username);
            if (count > 0) {
                toast({ 
                    title: 'Discovery Success', 
                    description: `Automatically registered ${count} new shift patterns from machine logs.` 
                });
            } else {
                toast({ title: 'Registry Up to Date', description: 'No new unique shift patterns were found in the logs.' });
            }
        } catch (error: any) {
            toast({ title: 'Discovery Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsRefreshingShifts(false);
        }
    };

    const updateNestedConfig = (section: keyof HrConfig, key: string, value: any) => {
        setHrConfig(prev => ({
            ...prev,
            [section]: {
                ...(prev[section] as any),
                [key]: value
            }
        }));
    };

    const handleSaveShift = async () => {
        if (!user) return;
        try {
            await saveShift({ ...shiftForm, createdBy: user.username }, editingShift?.id);
            toast({ title: 'Shift Configuration Saved' });
            setIsShiftDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleSaveHoliday = async () => {
        if (!user) return;
        try {
            await saveHoliday({ ...holidayForm, date: new Date(holidayForm.date).toISOString(), createdBy: user.username });
            toast({ title: 'Public Holiday Recorded' });
            setIsHolidayDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleSaveLeaveRequest = async () => {
        if (!user || !leaveForm.employeeId) return;
        const employee = employees.find(e => e.id === leaveForm.employeeId);
        if (!employee) return;

        const totalDays = differenceInDays(new Date(leaveForm.endDate), new Date(leaveForm.startDate)) + 1;

        try {
            await saveLeaveRequest({ 
                ...leaveForm, 
                employeeName: employee.name,
                totalDays,
                status: 'Pending',
                createdBy: user.username 
            } as any);
            toast({ title: 'Leave Request Logged' });
            setIsLeaveDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleUpdateLeaveStatus = async (request: LeaveRequest, status: 'Approved' | 'Rejected') => {
        if (!user) return;
        try {
            await saveLeaveRequest({ ...request, status }, request.id);
            toast({ title: `Leave ${status}` });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><Settings2 className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Operations & Logic</h1>
                        <p className="text-muted-foreground text-sm font-medium">Core rules, shifts, holidays, and labor metric processing.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleSaveHrConfig} disabled={isSavingConfig} className="h-10 px-6 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                        {isSavingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Commit Master Rules
                    </Button>
                </div>
            </header>

            <div className="max-w-5xl mx-auto w-full space-y-8">
                {/* Attendance Calculation Engine */}
                <Card className="shadow-lg border-primary/20 overflow-hidden ring-4 ring-primary/5">
                    <CardHeader className="bg-primary/5 border-b py-6 px-8">
                        <CardTitle className="text-lg font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-primary"/>
                            Attendance Logic Engine
                        </CardTitle>
                        <CardDescription className="text-xs uppercase font-bold text-muted-foreground">Transform machine data into work hours based on the operational rules defined below.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Target BS Year</Label>
                                <Select value={selectedYear} onValueChange={setSelectedYear}>
                                    <SelectTrigger className="h-11 bg-white border-2 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[2080, 2081, 2082, 2083].map(y => <SelectItem key={`year-run-${y}`} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Target BS Month</Label>
                                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                    <SelectTrigger className="h-11 bg-white border-2 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {NEPALI_MONTHS.map(m => <SelectItem key={`month-run-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-100 flex gap-4">
                            <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-blue-900">Critical Processing Directive</p>
                                <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                                    Execution will **overwrite** all existing attendance records for the selected period.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 border-t py-6 px-8 flex justify-end">
                        <Button onClick={handleRunCalculation} disabled={isCalculating} size="lg" className="h-12 px-10 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20">
                            {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-2 h-4 w-4"/>}
                            {isCalculating ? 'Processing...' : 'Run Logic Engine'}
                        </Button>
                    </CardFooter>
                </Card>

                <Accordion type="multiple" defaultValue={["hourly-rules", "shift-registry", "holidays-section", "leave-section"]} className="space-y-4">
                    {/* Hourly Calculation Rules */}
                    <AccordionItem value="hourly-rules" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                        <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-lg"><Clock className="h-4 w-4 text-blue-600" /></div>
                                <div className="text-left">
                                    <p className="text-sm font-black uppercase tracking-widest text-gray-900">Hourly Calculation Rules</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Standard day, grace periods, and rounding logic</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-6 pt-2 space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Base Day (Hrs)</Label>
                                    <Input type="number" value={hrConfig.hours.baseDayHours} onChange={e => updateNestedConfig('hours', 'baseDayHours', Number(e.target.value))} className="h-9 font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Rounding Step</Label>
                                    <Input type="number" step="0.25" value={hrConfig.hours.roundStep} onChange={e => updateNestedConfig('hours', 'roundStep', Number(e.target.value))} className="h-9 font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Grace (Min)</Label>
                                    <Input type="number" value={hrConfig.hours.graceMin} onChange={e => updateNestedConfig('hours', 'graceMin', Number(e.target.value))} className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Block (Min)</Label>
                                    <Input type="number" value={hrConfig.hours.blockMin} onChange={e => updateNestedConfig('hours', 'blockMin', Number(e.target.value))} className="h-9" />
                                </div>
                            </div>
                            <Separator className="border-dashed" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b pb-1">Tardiness Tolerance</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Free Lates</Label>
                                            <Input type="number" value={hrConfig.hours.freeLate} onChange={e => updateNestedConfig('hours', 'freeLate', Number(e.target.value))} className="h-8" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Reset Cycle</Label>
                                            <Select value={hrConfig.hours.freeLatePeriod} onValueChange={v => updateNestedConfig('hours', 'freeLatePeriod', v)}>
                                                <SelectTrigger className="h-8 text-[10px]"><SelectValue/></SelectTrigger>
                                                <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b pb-1">Break & Oversight</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Fixed Break Start</Label>
                                            <Input type="time" value={hrConfig.hours.breakStart || '12:00'} onChange={e => updateNestedConfig('hours', 'breakStart', e.target.value)} className="h-8 font-mono text-xs" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Fixed Break End</Label>
                                            <Input type="time" value={hrConfig.hours.breakEnd || '13:00'} onChange={e => updateNestedConfig('hours', 'breakEnd', e.target.value)} className="h-8 font-mono text-xs" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Shift Registry */}
                    <AccordionItem value="shift-registry" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                        <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-50 rounded-lg"><Timer className="h-4 w-4 text-purple-600" /></div>
                                <div className="text-left">
                                    <p className="text-sm font-black uppercase tracking-widest text-gray-900">Shift Configurations</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Manage multiple shifts and default schedules</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-0">
                            <div className="p-6 pt-2 border-b flex justify-between items-center bg-muted/5">
                                <p className="text-[10px] text-muted-foreground uppercase font-black">Registered Shifts</p>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handleRefreshShifts} disabled={isRefreshingShifts} className="h-8 text-[10px] uppercase font-black tracking-widest border-primary/20 text-primary hover:bg-primary/5">
                                        {isRefreshingShifts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
                                        Discover Patterns
                                    </Button>
                                    <Button size="sm" onClick={() => { setEditingShift(null); setShiftForm({ name: '', onDuty: '09:00', offDuty: '17:00', breakStart: '12:00', breakEnd: '13:00', isDefault: false }); setIsShiftDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Define Shift
                                    </Button>
                                </div>
                            </div>
                            <Table className="text-xs">
                                <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead className="pl-6 font-bold">Shift Name</TableHead><TableHead className="font-bold">Hours</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {shifts.map(s => (
                                        <TableRow key={s.id} className="h-12 hover:bg-muted/10">
                                            <TableCell className="pl-6 font-black text-gray-900">{s.name} {s.isDefault && <Badge variant="secondary" className="ml-2 text-[8px] uppercase">Default</Badge>}</TableCell>
                                            <TableCell className="font-medium text-gray-600">{s.onDuty} — {s.offDuty}</TableCell>
                                            <TableCell className="text-right pr-6 space-x-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingShift(s); setShiftForm({ name: s.name, onDuty: s.onDuty, offDuty: s.offDuty, breakStart: s.breakStart || '12:00', breakEnd: s.breakEnd || '13:00', isDefault: s.isDefault }); setIsShiftDialogOpen(true); }}><Edit className="h-3.5 w-3.5"/></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteShift(s.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Holiday Registry */}
                    <AccordionItem value="holidays-section" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                        <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-50 rounded-lg"><CalendarCheck className="h-4 w-4 text-amber-600" /></div>
                                <div className="text-left">
                                    <p className="text-sm font-black uppercase tracking-widest text-gray-900">Public Holiday Registry</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Configure organizational non-working days</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-0">
                             <div className="p-6 pt-2 border-b flex justify-between items-center bg-muted/5">
                                <p className="text-[10px] text-muted-foreground uppercase font-black">Calendar Events</p>
                                <Button size="sm" onClick={() => { setHolidayForm({ name: '', date: new Date().toISOString(), isRecurring: true }); setIsHolidayDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-amber-600 hover:bg-amber-700 text-white border-none">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Holiday
                                </Button>
                            </div>
                            <Table className="text-xs">
                                <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6 font-bold">Holiday Event</TableHead><TableHead className="font-bold">BS Date</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {holidays.map(h => (
                                        <TableRow key={h.id} className="h-12 hover:bg-muted/10">
                                            <TableCell className="pl-6 font-bold text-gray-900">{h.name}</TableCell>
                                            <TableCell className="font-mono text-gray-600">{toNepaliDate(h.date)}</TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteHoliday(h.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {holidays.length === 0 && <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground italic">No holidays defined.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>

                    {/* Leave Request Oversight */}
                    <AccordionItem value="leave-section" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                        <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-lg"><Briefcase className="h-4 w-4 text-blue-600" /></div>
                                <div className="text-left">
                                    <p className="text-sm font-black uppercase tracking-widest text-gray-900">Leave Administration</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Queue management and request oversight</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-0">
                             <div className="p-6 pt-2 border-b flex justify-between items-center bg-muted/5">
                                <p className="text-[10px] text-muted-foreground uppercase font-black">Active Requests</p>
                                <Button size="sm" onClick={() => { setLeaveForm({ employeeId: '', leaveType: 'Paid', startDate: new Date().toISOString(), endDate: new Date().toISOString(), reason: '' }); setIsLeaveDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-blue-600 hover:bg-blue-700 text-white border-none">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Apply for Leave
                                </Button>
                            </div>
                            <Table className="text-xs">
                                <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6 font-bold">Employee</TableHead><TableHead className="font-bold">Period</TableHead><TableHead className="font-bold">Type</TableHead><TableHead className="text-center font-bold">Status</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {leaveRequests.map(r => (
                                        <TableRow key={r.id} className="h-14 hover:bg-muted/10">
                                            <TableCell className="pl-6 font-black text-gray-900">{r.employeeName}</TableCell>
                                            <TableCell className="text-[10px] text-gray-600">
                                                <div className="flex flex-col">
                                                    <span>{toNepaliDate(r.startDate)} — {toNepaliDate(r.endDate)}</span>
                                                    <span className="font-bold text-muted-foreground">{r.totalDays} Days</span>
                                                </div>
                                            </TableCell>
                                            <TableCell><Badge variant="outline" className={cn("text-[8px] font-black uppercase h-4 px-1.5", r.leaveType === 'Paid' ? "text-emerald-600 border-emerald-100" : "text-red-500 border-red-100")}>{r.leaveType}</Badge></TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={cn(
                                                    "text-[8px] font-black uppercase h-4 px-2",
                                                    r.status === 'Approved' ? "bg-green-600" : r.status === 'Rejected' ? "bg-red-600" : "bg-amber-400"
                                                )}>{r.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 space-x-1">
                                                {r.status === 'Pending' && (
                                                    <>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={() => handleUpdateLeaveStatus(r, 'Approved')} title="Approve"><Check className="h-4 w-4"/></Button>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => handleUpdateLeaveStatus(r, 'Rejected')} title="Reject"><X className="h-4 w-4"/></Button>
                                                    </>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLeaveRequest(r.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {leaveRequests.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">No leave requests in queue.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>

            {/* Shift Dialog */}
            <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Shift Configuration</DialogTitle>
                        <DialogDescription>Define standard working hours and break schedules.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Shift Name</Label><Input value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} placeholder="e.g. Day Shift" className="h-10" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">On Duty (In)</Label><Input type="time" value={shiftForm.onDuty} onChange={e => setShiftForm({...shiftForm, onDuty: e.target.value})} className="h-10" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Off Duty (Out)</Label><Input type="time" value={shiftForm.offDuty} onChange={e => setShiftForm({...shiftForm, offDuty: e.target.value})} className="h-10" /></div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2"><Checkbox id="shift-default" checked={shiftForm.isDefault} onCheckedChange={(v) => setShiftForm({...shiftForm, isDefault: !!v})} /><Label htmlFor="shift-default" className="text-xs font-bold uppercase cursor-pointer">Set as default shift</Label></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveShift} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Configuration</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Holiday Dialog */}
            <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Log Public Holiday</DialogTitle>
                        <DialogDescription>Mark organizational holidays.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Holiday Name</Label><Input value={holidayForm.name} onChange={e => setHolidayForm({...holidayForm, name: e.target.value})} placeholder="e.g. Dashain" className="h-10" /></div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Holiday Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal h-10 bg-white">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {holidayForm.date ? `${toNepaliDate(holidayForm.date)} BS` : "Select Date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={new Date(holidayForm.date)} onSelect={(d) => setHolidayForm({...holidayForm, date: d?.toISOString() || new Date().toISOString()})} />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveHoliday} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Publish Holiday</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Leave Request Dialog */}
            <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Apply for Leave</DialogTitle>
                        <DialogDescription>Submit a formal leave request.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Employee</Label>
                            <Select value={leaveForm.employeeId} onValueChange={v => setLeaveForm({...leaveForm, employeeId: v})}>
                                <SelectTrigger className="h-10"><SelectValue placeholder="Search employee..."/></SelectTrigger>
                                <SelectContent>
                                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Leave Category</Label>
                            <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm({...leaveForm, leaveType: v})}>
                                <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Unpaid">Unpaid</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Reason</Label>
                            <Input value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} className="h-10" placeholder="Purpose..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Start Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start h-10 bg-white font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4"/> {leaveForm.startDate ? toNepaliDate(leaveForm.startDate) : 'Select'}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={new Date(leaveForm.startDate)} onSelect={d => setLeaveForm({...leaveForm, startDate: d?.toISOString() || ''})} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">End Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start h-10 bg-white font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4"/> {leaveForm.endDate ? toNepaliDate(leaveForm.endDate) : 'Select'}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={new Date(leaveForm.endDate)} onSelect={d => setLeaveForm({...leaveForm, endDate: d?.toISOString() || ''})} />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveLeaveRequest} className="w-full h-11 font-black text-xs uppercase shadow-lg">Submit Request</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
