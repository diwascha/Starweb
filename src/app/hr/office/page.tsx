'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Timer, 
    ShieldCheck, 
    Plus, 
    Trash2, 
    Edit, 
    CalendarCheck,
    Briefcase,
    Settings2,
    Clock,
    CalendarIcon,
    X,
    User,
    CheckCircle2,
    Info,
    Calculator,
    Award,
    Save,
    Loader2,
    Terminal,
    History as HistoryIcon,
    ChevronRight,
    Search
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
    onShiftsUpdate, saveShift, deleteShift,
    onHolidaysUpdate, saveHoliday, deleteHoliday,
    onLeaveRequestsUpdate, saveLeaveRequest, deleteLeaveRequest
} from '@/services/hr-admin-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import type { HrShift, PublicHoliday, LeaveRequest, Employee, HrConfig } from '@/lib/types';
import { onEmployeesUpdate } from '@/services/employee-service';
import { toNepaliDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format, differenceInDays } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';

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
        reviewThresh: 8.5
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
    
    // Administration States
    const [shifts, setShifts] = useState<HrShift[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [hrConfig, setHrConfig] = useState<HrConfig>(INITIAL_HR_CONFIG);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // Dialog & Form States
    const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<HrShift | null>(null);
    const [shiftForm, setShiftForm] = useState({ name: '', onDuty: '09:00', offDuty: '17:00', breakStart: '12:00', breakEnd: '13:00', graceMinutes: 15, isDefault: false });

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
                        <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Office</h1>
                        <p className="text-muted-foreground text-sm font-medium">Core organizational settings and administrative oversight.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleSaveHrConfig} disabled={isSavingConfig} className="h-10 px-6 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                        {isSavingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Commit Changes
                    </Button>
                </div>
            </header>

            <Tabs defaultValue="operations" className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-8">
                    <TabsTrigger value="operations" className="gap-2 px-8 py-2 font-bold text-xs uppercase tracking-widest">
                        <Terminal className="h-4 w-4"/> Operational Rules
                    </TabsTrigger>
                    <TabsTrigger value="registry" className="gap-2 px-8 py-2 font-bold text-xs uppercase tracking-widest">
                        <HistoryIcon className="h-4 w-4"/> Global Registry
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="operations" className="animate-in fade-in slide-in-from-top-2">
                    <div className="max-w-4xl mx-auto">
                        <Accordion type="multiple" defaultValue={["hourly-rules"]} className="space-y-4">
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
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[9px] font-bold uppercase text-muted-foreground">Free Early Departure</Label>
                                                    <Input type="number" value={hrConfig.hours.freeEarly} onChange={e => updateNestedConfig('hours', 'freeEarly', Number(e.target.value))} className="h-8" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[9px] font-bold uppercase text-muted-foreground">Reset Cycle</Label>
                                                    <Select value={hrConfig.hours.freeEarlyPeriod} onValueChange={v => updateNestedConfig('hours', 'freeEarlyPeriod', v)}>
                                                        <SelectTrigger className="h-8 text-[10px]"><SelectValue/></SelectTrigger>
                                                        <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b pb-1">Oversight Thresholds</h4>
                                            <div className="space-y-1.5">
                                                <Label className="text-[9px] font-bold uppercase text-muted-foreground">Review Flag (Working Hrs/Day)</Label>
                                                <Input type="number" step="0.1" value={hrConfig.hours.reviewThresh} onChange={e => updateNestedConfig('hours', 'reviewThresh', Number(e.target.value))} className="h-9 font-black text-amber-600" />
                                                <p className="text-[9px] text-muted-foreground italic">Alert admin when an employee exceeds these daily hours.</p>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            {/* Payroll & Punctuality Engine */}
                            <AccordionItem value="payroll-engine" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-50 rounded-lg"><Calculator className="h-4 w-4 text-emerald-600" /></div>
                                        <div className="text-left">
                                            <p className="text-sm font-black uppercase tracking-widest text-gray-900">Payroll & Punctuality Engine</p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Financial baselines, behavioral bands, and fatigue monitoring</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-6 pt-2 space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                                        {/* Financial Baselines */}
                                        <div className="space-y-5">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 border-b pb-1">Financial Baselines</h4>
                                            <div className="grid gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Default Hourly Rate (रु)</Label>
                                                    <Input type="number" value={hrConfig.payroll.defaultHourly} onChange={e => updateNestedConfig('payroll', 'defaultHourly', Number(e.target.value))} className="h-9 font-bold" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Fallback Hourly Rate</Label>
                                                    <Input type="number" value={hrConfig.payroll.fallbackHourly} onChange={e => updateNestedConfig('payroll', 'fallbackHourly', Number(e.target.value))} className="h-9 border-dashed" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Month Days</Label>
                                                        <Input type="number" value={hrConfig.payroll.monthDays} onChange={e => updateNestedConfig('payroll', 'monthDays', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Std Workdays</Label>
                                                        <Input type="number" value={hrConfig.payroll.stdWorkdays} onChange={e => updateNestedConfig('payroll', 'stdWorkdays', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">TDS Deduction Rate (Dec)</Label>
                                                    <Input type="number" step="0.001" value={hrConfig.payroll.tdsRate} onChange={e => updateNestedConfig('payroll', 'tdsRate', Number(e.target.value))} className="h-9 font-black text-blue-600 bg-blue-50/50" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Punctuality Bands */}
                                        <div className="space-y-5">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 border-b pb-1">Behavioral Bands</h4>
                                            <div className="grid gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Bonus Qualifier Attendance %</Label>
                                                    <Input type="number" value={hrConfig.payroll.attendReqPct} onChange={e => updateNestedConfig('payroll', 'attendReqPct', Number(e.target.value))} className="h-9 font-black" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-green-600">Punct High %</Label>
                                                        <Input type="number" value={hrConfig.payroll.punctHighPct} onChange={e => updateNestedConfig('payroll', 'punctHighPct', Number(e.target.value))} className="h-9 border-green-200" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-amber-600">Punct Mid %</Label>
                                                        <Input type="number" value={hrConfig.payroll.punctMidPct} onChange={e => updateNestedConfig('payroll', 'punctMidPct', Number(e.target.value))} className="h-9 border-amber-200" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Late Limit (High)</Label>
                                                        <Input type="number" value={hrConfig.payroll.lateDaysHigh} onChange={e => updateNestedConfig('payroll', 'lateDaysHigh', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Late Limit (Mid)</Label>
                                                        <Input type="number" value={hrConfig.payroll.lateDaysMid} onChange={e => updateNestedConfig('payroll', 'lateDaysMid', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Overtime & Heatmap */}
                                        <div className="space-y-5">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 border-b pb-1">Workload Oversight</h4>
                                            <div className="grid gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">OT High Threshold (Monthly Hrs)</Label>
                                                    <Input type="number" value={hrConfig.payroll.otHighHours} onChange={e => updateNestedConfig('payroll', 'otHighHours', Number(e.target.value))} className="h-9 font-black text-red-600" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">OT Mid Threshold</Label>
                                                    <Input type="number" value={hrConfig.payroll.otMidHours} onChange={e => updateNestedConfig('payroll', 'otMidHours', Number(e.target.value))} className="h-9" />
                                                </div>
                                                <Separator className="border-dashed" />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">DOW Late (High %)</Label>
                                                        <Input type="number" value={hrConfig.payroll.dowLateHighPct} onChange={e => updateNestedConfig('payroll', 'dowLateHighPct', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">DOW Late (Mid %)</Label>
                                                        <Input type="number" value={hrConfig.payroll.dowLateMidPct} onChange={e => updateNestedConfig('payroll', 'dowLateMidPct', Number(e.target.value))} className="h-9" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            {/* Bonus Logic Engine */}
                            <AccordionItem value="bonus-logic" className="border rounded-xl bg-white shadow-sm overflow-hidden">
                                <AccordionTrigger className="px-6 py-4 hover:bg-muted/30 hover:no-underline">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-50 rounded-lg"><Award className="h-4 w-4 text-amber-600" /></div>
                                        <div className="text-left">
                                            <p className="text-sm font-black uppercase tracking-widest text-gray-900">Bonus Logic Engine</p>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold">Eligibility requirements and deduction factors</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-6 pt-2 space-y-6">
                                    <div className="flex flex-col md:flex-row gap-10">
                                        <div className="flex-1 space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground px-1">Bonus Eligibility Required Attend %</Label>
                                                    <Input type="number" value={hrConfig.bonus.bonusEligReq} onChange={e => updateNestedConfig('bonus', 'bonusEligReq', Number(e.target.value))} className="h-10 text-xl font-black text-amber-700 bg-amber-50/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground px-1">Absent Deduction Factor</Label>
                                                    <Input type="number" step="0.1" value={hrConfig.bonus.bonusAbsFactor} onChange={e => updateNestedConfig('bonus', 'bonusAbsFactor', Number(e.target.value))} className="h-10 text-xl font-bold" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-full md:w-96 p-5 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-3">
                                            <div className="flex items-center gap-2 text-amber-700">
                                                <Info className="h-4 w-4" />
                                                <h4 className="text-[10px] font-black uppercase tracking-widest">Logic Breakdown</h4>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                                                Formula: <code className="bg-white px-1 py-0.5 rounded border">Max(0, 1 - AbsentWD * Factor / StdWorkdays)</code>. 
                                                The **Absent Deduction Factor** ensures that absences exponentially impact bonus accrual beyond standard pro-rating.
                                            </p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </TabsContent>

                <TabsContent value="registry" className="animate-in fade-in slide-in-from-bottom-2">
                    <Tabs defaultValue="shifts" className="w-full">
                        <TabsList className="h-10 bg-muted/30 p-1 mb-6 border w-full sm:w-auto">
                            <TabsTrigger value="shifts" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">
                                <Timer className="h-3.5 w-3.5"/> Shifts
                            </TabsTrigger>
                            <TabsTrigger value="holidays" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">
                                <CalendarCheck className="h-3.5 w-3.5"/> Holidays
                            </TabsTrigger>
                            <TabsTrigger value="leaves" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">
                                <Briefcase className="h-3.5 w-3.5"/> Leave Requests
                            </TabsTrigger>
                        </TabsList>

                        {/* Shift Manager */}
                        <TabsContent value="shifts">
                            <Card className="shadow-sm border-gray-100 bg-white">
                                <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                                    <div>
                                        <CardTitle className="text-sm font-black uppercase">Shift Configurations</CardTitle>
                                    </div>
                                    <Button size="sm" onClick={() => { setEditingShift(null); setShiftForm({ name: '', onDuty: '09:00', offDuty: '17:00', breakStart: '12:00', breakEnd: '13:00', graceMinutes: 15, isDefault: false }); setIsShiftDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Define Shift
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader><TableRow className="bg-muted/50"><TableHead className="pl-6 font-bold">Shift Name</TableHead><TableHead className="font-bold">Hours</TableHead><TableHead className="font-bold text-center">Break Time</TableHead><TableHead className="font-bold">Grace</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {shifts.map(s => (
                                                <TableRow key={s.id} className="h-12">
                                                    <TableCell className="pl-6 font-black text-gray-900">{s.name} {s.isDefault && <Badge variant="secondary" className="ml-2 text-[8px] uppercase">Default</Badge>}</TableCell>
                                                    <TableCell className="font-medium text-gray-600">{s.onDuty} — {s.offDuty}</TableCell>
                                                    <TableCell className="text-center font-medium text-muted-foreground italic">
                                                        {s.breakStart && s.breakEnd ? `${s.breakStart} — ${s.breakEnd}` : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-blue-600 font-bold">{s.graceMinutes} min</TableCell>
                                                    <TableCell className="text-right pr-6 space-x-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingShift(s); setShiftForm({ ...s, breakStart: s.breakStart || '12:00', breakEnd: s.breakEnd || '13:00' }); setIsShiftDialogOpen(true); }}><Edit className="h-3.5 w-3.5"/></Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteShift(s.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {shifts.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">No shifts defined.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Holiday Registry */}
                        <TabsContent value="holidays">
                            <Card className="shadow-sm border-gray-100 bg-white">
                                <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                                    <div>
                                        <CardTitle className="text-sm font-black uppercase">Public Holidays</CardTitle>
                                    </div>
                                    <Button size="sm" onClick={() => { setHolidayForm({ name: '', date: new Date().toISOString(), isRecurring: true }); setIsHolidayDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Holiday
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader><TableRow className="bg-muted/50"><TableHead className="pl-6 font-bold">Holiday Event</TableHead><TableHead className="font-bold">BS Date</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {holidays.map(h => (
                                                <TableRow key={h.id} className="h-12">
                                                    <TableCell className="pl-6 font-bold text-gray-900">{h.name}</TableCell>
                                                    <TableCell className="font-mono text-gray-600">{toNepaliDate(h.date)}</TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteHoliday(h.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {holidays.length === 0 && <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground italic">No holidays logged.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Leave Management Queue */}
                        <TabsContent value="leaves">
                            <Card className="shadow-sm border-gray-100 bg-white">
                                <CardHeader className="py-4 px-6 border-b bg-muted/5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-black uppercase text-gray-900 tracking-wider">Leave Request Oversight</CardTitle>
                                        </div>
                                        <Button size="sm" onClick={() => { setLeaveForm({ employeeId: '', leaveType: 'Paid', startDate: new Date().toISOString(), endDate: new Date().toISOString(), reason: '' }); setIsLeaveDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-blue-600 hover:bg-blue-700 text-white">
                                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Apply for Leave
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader><TableRow className="bg-muted/50"><TableHead className="pl-6 font-bold">Employee</TableHead><TableHead className="font-bold">Leave Period</TableHead><TableHead className="font-bold">Type</TableHead><TableHead className="font-bold">Reason</TableHead><TableHead className="text-center font-bold">Status</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {leaveRequests.map(r => (
                                                <TableRow key={r.id} className="h-14">
                                                    <TableCell className="pl-6 font-black text-gray-900">{r.employeeName}</TableCell>
                                                    <TableCell className="text-gray-600">
                                                        <div className="flex flex-col">
                                                            <span>{toNepaliDate(r.startDate)} — {toNepaliDate(r.endDate)}</span>
                                                            <span className="text-[9px] uppercase font-bold text-muted-foreground">{r.totalDays} Work Days</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell><Badge variant="outline" className={cn("text-[9px] uppercase font-bold", r.leaveType === 'Paid' ? "text-emerald-600" : "text-red-600")}>{r.leaveType}</Badge></TableCell>
                                                    <TableCell className="text-muted-foreground max-w-xs truncate">{r.reason}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className={cn(
                                                            "text-[9px] uppercase font-black",
                                                            r.status === 'Approved' ? "bg-green-600" : r.status === 'Rejected' ? "bg-red-600" : "bg-amber-50"
                                                        )}>{r.status}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6 space-x-2">
                                                        {r.status === 'Pending' && (
                                                            <>
                                                                <Button size="sm" variant="outline" className="h-7 text-[9px] font-black uppercase border-green-200 text-green-700 hover:bg-green-50" onClick={() => handleUpdateLeaveStatus(r, 'Approved')}>Approve</Button>
                                                                <Button size="sm" variant="outline" className="h-7 text-[9px] font-black uppercase border-red-200 text-red-700 hover:bg-red-50" onClick={() => handleUpdateLeaveStatus(r, 'Rejected')}>Reject</Button>
                                                            </>
                                                        )}
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLeaveRequest(r.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {leaveRequests.length === 0 && <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">No leave requests in queue.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>

            {/* Shift Dialog */}
            <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Shift Configuration</DialogTitle>
                        <DialogDescription>Define standard working hours and break schedules for this shift.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Shift Name</Label><Input value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} placeholder="e.g. Day Shift, Night Shift" className="h-10" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">On Duty (In)</Label><Input type="time" value={shiftForm.onDuty} onChange={e => setShiftForm({...shiftForm, onDuty: e.target.value})} className="h-10" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Off Duty (Out)</Label><Input type="time" value={shiftForm.offDuty} onChange={e => setShiftForm({...shiftForm, offDuty: e.target.value})} className="h-10" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Break Start</Label><Input type="time" value={shiftForm.breakStart} onChange={e => setShiftForm({...shiftForm, breakStart: e.target.value})} className="h-10" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Break End</Label><Input type="time" value={shiftForm.breakEnd} onChange={e => setShiftForm({...shiftForm, breakEnd: e.target.value})} className="h-10" /></div>
                        </div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Grace Period (Minutes)</Label><Input type="number" value={shiftForm.graceMinutes} onChange={e => setShiftForm({...shiftForm, graceMinutes: Number(e.target.value)})} className="h-10 font-bold text-blue-600" /></div>
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
                        <DialogDescription>Mark specific calendar dates as organizational holidays.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Holiday Name / Occasion</Label><Input value={holidayForm.name} onChange={e => setHolidayForm({...holidayForm, name: e.target.value})} placeholder="e.g. Dashain Festival" className="h-10" /></div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Holiday Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10 bg-white shadow-none", !holidayForm.date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {holidayForm.date ? `${toNepaliDate(holidayForm.date)} BS (${format(new Date(holidayForm.date), "PP")})` : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={new Date(holidayForm.date)} onSelect={(d) => setHolidayForm({...holidayForm, date: d?.toISOString() || new Date().toISOString()})} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex items-center space-x-2 pt-2"><Checkbox id="holiday-recur" checked={holidayForm.isRecurring} onCheckedChange={(v) => setHolidayForm({...holidayForm, isRecurring: !!v})} /><Label htmlFor="holiday-recur" className="text-xs font-bold uppercase cursor-pointer">Recurring Holiday (Annual)</Label></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveHoliday} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Publish to Calendar</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Leave Request Dialog */}
            <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Apply for Leave</DialogTitle>
                        <DialogDescription>Submit a formal leave request for an employee.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Employee</Label>
                                <Select value={leaveForm.employeeId} onValueChange={v => setLeaveForm({...leaveForm, employeeId: v})}>
                                    <SelectTrigger className="h-10"><SelectValue placeholder="Search employee..."/></SelectTrigger>
                                    <SelectContent>
                                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Leave Category</Label>
                                    <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm({...leaveForm, leaveType: v})}>
                                        <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Paid">Paid Leave</SelectItem>
                                            <SelectItem value="Unpaid">Unpaid (Loss of Pay)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status Preview</Label>
                                    <Badge className="h-10 w-full justify-center bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest">Pending Approval</Badge>
                                </div>
                            </div>

                            {/* Leave Type Definitions */}
                            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-3">
                                <div className="flex items-center gap-2 text-blue-800">
                                    <Info className="h-3.5 w-3.5" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">Payroll Impact Guide</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black text-gray-900 uppercase">Paid Leave</p>
                                        <p className="text-[9px] text-muted-foreground leading-tight">Covers Casual, Sick, or Earned leave. Full pay is preserved.</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black text-gray-900 uppercase">Unpaid (Loss of Pay)</p>
                                        <p className="text-[9px] text-muted-foreground leading-tight">Used when quotas are exceeded. Results in salary deduction.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Start Date (BS)</Label>
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
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">End Date (BS)</Label>
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
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Reason / Remarks</Label>
                                <Textarea value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} placeholder="Purpose of leave..." className="min-h-[100px] text-sm" />
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
                        <Button onClick={handleSaveLeaveRequest} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            <CheckCircle2 className="mr-2 h-4 w-4"/> Log Leave Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
