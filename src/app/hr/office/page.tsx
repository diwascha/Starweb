'use client';

import { useState, useEffect, useMemo } from 'react';
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
    Calculator,
    Save,
    Loader2,
    PlayCircle,
    ArrowRight,
    ShieldAlert,
    RefreshCcw,
    CalendarCheck,
    Briefcase,
    Check,
    ChevronDown,
    Search,
    Layers,
    ListTree
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
import type { HrShift, HrConfig, LeaveRequest, Employee, PublicHoliday } from '@/lib/types';
import { toNepaliDate, cn, createTimestamp } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format, differenceInDays } from 'date-fns';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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
    
    const [activeTab, setActiveTab] = useState("operations");
    const [shifts, setShifts] = useState<HrShift[]>([]);
    const [hrConfig, setHrConfig] = useState<HrConfig>(INITIAL_HR_CONFIG);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isRefreshingShifts, setIsRefreshingShifts] = useState(false);

    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    const [isCalculating, setIsCalculating] = useState(false);
    const [selectedYear, setSelectedYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new NepaliDate().getMonth()));

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
                description: `Successfully processed ${processed} attendance records.` 
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
            toast({ title: count > 0 ? 'Discovery Success' : 'Registry Up to Date', description: count > 0 ? `Registered ${count} new shifts.` : 'No new unique shifts found.' });
        } catch (error: any) {
            toast({ title: 'Discovery Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsRefreshingShifts(false);
        }
    };

    const updateNestedConfig = (section: keyof HrConfig, key: string, value: any) => {
        setHrConfig(prev => ({ ...prev, [section]: { ...(prev[section] as any), [key]: value } }));
    };

    const handleSaveShift = async () => {
        if (!user) return;
        try {
            await saveShift({ ...shiftForm, createdBy: user.username, createdAt: createTimestamp() }, editingShift?.id);
            toast({ title: 'Shift Saved' });
            setIsShiftDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        }
    };

    const handleSaveHoliday = async () => {
        if (!user) return;
        try {
            await saveHoliday({ ...holidayForm, date: new Date(holidayForm.date).toISOString(), createdBy: user.username, createdAt: createTimestamp() });
            toast({ title: 'Holiday Recorded' });
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
            await saveLeaveRequest({ ...leaveForm, employeeName: employee.name, totalDays, status: 'Pending', createdBy: user.username, createdAt: createTimestamp() } as any);
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
                        <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Office Hub</h1>
                        <p className="text-muted-foreground text-sm font-medium">Administrative control center for workforce operations.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleSaveHrConfig} disabled={isSavingConfig} className="h-10 px-6 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                        {isSavingConfig ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                        Commit Operations Rules
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 h-11 mb-6">
                    <TabsTrigger value="operations" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Operations & Registry</TabsTrigger>
                    <TabsTrigger value="holidays" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Holiday Registry</TabsTrigger>
                    <TabsTrigger value="leaves" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Leave Admin</TabsTrigger>
                </TabsList>

                <TabsContent value="operations" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="shadow-lg border-primary/20 overflow-hidden ring-4 ring-primary/5">
                                <CardHeader className="bg-primary/5 border-b py-5 px-6">
                                    <CardTitle className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                                        <Calculator className="h-4 w-4 text-primary"/>
                                        Calculation Execution
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Year (BS)</Label>
                                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                                <SelectContent>{[2080, 2081, 2082, 2083].map(y => <SelectItem key={`yr-${y}`} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Month (BS)</Label>
                                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                                <SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={`mo-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-lg bg-blue-50 border-2 border-blue-100 flex gap-4">
                                        <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0" />
                                        <p className="text-[10px] text-blue-800 leading-relaxed font-medium italic">Running this will overwrite all existing attendance records for the selected period.</p>
                                    </div>
                                    <Button onClick={handleRunCalculation} disabled={isCalculating} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlayCircle className="mr-2 h-4 w-4"/>}
                                        {isCalculating ? 'Processing...' : 'Run Attendance Processor'}
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                                <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-sm font-black uppercase text-gray-900">Shift Pattern Registry</CardTitle>
                                        <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Pre-defined schedules for the attendance processor.</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={handleRefreshShifts} disabled={isRefreshingShifts} className="h-8 text-[10px] uppercase font-black tracking-widest border-primary/20 text-primary hover:bg-primary/5">
                                            {isRefreshingShifts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
                                            Auto-Discovery
                                        </Button>
                                        <Button size="sm" onClick={() => { setEditingShift(null); setShiftForm({ name: '', onDuty: '09:00', offDuty: '17:00', breakStart: '12:00', breakEnd: '13:00', isDefault: false }); setIsShiftDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest shadow-sm">
                                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Define Shift
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-xs">
                                        <TableHeader className="bg-muted/30"><TableRow className="hover:bg-transparent"><TableHead className="pl-6 font-bold">Pattern Name</TableHead><TableHead className="font-bold text-center">Schedule (Duty Hours)</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {shifts.map(s => (
                                                <TableRow key={s.id} className="h-12 hover:bg-muted/10">
                                                    <TableCell className="pl-6 font-black text-gray-900 uppercase tracking-tighter">{s.name} {s.isDefault && <Badge variant="secondary" className="ml-2 text-[8px] uppercase">Master Default</Badge>}</TableCell>
                                                    <TableCell className="font-mono text-gray-600 text-center">{s.onDuty} — {s.offDuty}</TableCell>
                                                    <TableCell className="text-right pr-6 space-x-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => { setEditingShift(s); setShiftForm({ name: s.name, onDuty: s.onDuty, offDuty: s.offDuty, breakStart: s.breakStart || '12:00', breakEnd: s.breakEnd || '13:00', isDefault: s.isDefault }); setIsShiftDialogOpen(true); }}><Edit className="h-3.5 w-3.5"/></Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteShift(s.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {shifts.length === 0 && <TableRow><TableCell colSpan={3} className="h-32 text-center text-muted-foreground italic">No shift patterns registered.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                        
                        <div className="lg:col-span-1 space-y-6">
                            <Card className="shadow-sm border-gray-100">
                                <CardHeader className="py-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase font-black text-muted-foreground">Precision Controls</CardTitle></CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Base Day (Hrs)</Label><Input type="number" value={hrConfig.hours.baseDayHours} onChange={e => updateNestedConfig('hours', 'baseDayHours', Number(e.target.value))} className="h-9 font-bold" /></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Rounding Step</Label><Input type="number" step="0.25" value={hrConfig.hours.roundStep} onChange={e => updateNestedConfig('hours', 'roundStep', Number(e.target.value))} className="h-9 font-bold" /></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Grace (Min)</Label><Input type="number" value={hrConfig.hours.graceMin} onChange={e => updateNestedConfig('hours', 'graceMin', Number(e.target.value))} className="h-9" /></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Block (Min)</Label><Input type="number" value={hrConfig.hours.blockMin} onChange={e => updateNestedConfig('hours', 'blockMin', Number(e.target.value))} className="h-9" /></div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-gray-100 h-fit">
                                <CardHeader className="py-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase font-black text-muted-foreground">Break & Oversight</CardTitle></CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Fixed Break Start</Label><Input type="time" value={hrConfig.hours.breakStart || '12:00'} onChange={e => updateNestedConfig('hours', 'breakStart', e.target.value)} className="h-9 font-mono" /></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Fixed Break End</Label><Input type="time" value={hrConfig.hours.breakEnd || '13:00'} onChange={e => updateNestedConfig('hours', 'breakEnd', e.target.value)} className="h-9 font-mono" /></div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-4">
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Free Lates (Count)</Label><Input type="number" value={hrConfig.hours.freeLate} onChange={e => updateNestedConfig('hours', 'freeLate', Number(e.target.value))} className="h-9" /></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Tolerance Cycle</Label>
                                            <Select value={hrConfig.hours.freeLatePeriod} onValueChange={(v: 'WEEKLY' | 'MONTHLY') => updateNestedConfig('hours', 'freeLatePeriod', v)}>
                                                <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                                                <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="holidays" className="animate-in fade-in slide-in-from-bottom-2">
                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="bg-amber-50/20 border-b py-4 px-6 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black uppercase text-gray-900">Corporate Holidays</CardTitle>
                                <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Managed list of non-working days for payroll exemption.</CardDescription>
                            </div>
                            <Button size="sm" onClick={() => { setHolidayForm({ name: '', date: new Date().toISOString(), isRecurring: true }); setIsHolidayDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-amber-600 hover:bg-amber-700 text-white border-none shadow-sm">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Holiday
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/30"><TableRow><TableHead className="pl-6 font-bold">Event Name</TableHead><TableHead className="font-bold text-center">BS Calendar Date</TableHead><TableHead className="font-bold text-center">Cycle</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {holidays.map(h => (
                                        <TableRow key={h.id} className="h-12 hover:bg-muted/10">
                                            <TableCell className="pl-6 font-bold text-gray-900">{h.name}</TableCell>
                                            <TableCell className="font-mono text-center text-amber-800 font-bold">{toNepaliDate(h.date)}</TableCell>
                                            <TableCell className="text-center">{h.isRecurring ? <Badge variant="outline" className="text-[8px] uppercase bg-amber-50 border-amber-200">Annual</Badge> : <Badge variant="outline" className="text-[8px] uppercase">One-time</Badge>}</TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteHoliday(h.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {holidays.length === 0 && <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No holidays registered in system.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="leaves" className="animate-in fade-in slide-in-from-bottom-2">
                    <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="bg-blue-50/20 border-b py-4 px-6 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black uppercase text-gray-900">Leave Administration</CardTitle>
                                <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Review, approve, or reject employee leave requests.</CardDescription>
                            </div>
                            <Button size="sm" onClick={() => { setLeaveForm({ employeeId: '', leaveType: 'Paid', startDate: new Date().toISOString(), endDate: new Date().toISOString(), reason: '' }); setIsLeaveDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-blue-600 hover:bg-blue-700 text-white border-none shadow-sm">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Submit Request
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-6 font-bold">Employee</TableHead>
                                        <TableHead className="font-bold">Period (BS)</TableHead>
                                        <TableHead className="font-bold text-center">Type</TableHead>
                                        <TableHead className="text-center font-bold">Status</TableHead>
                                        <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaveRequests.map(r => (
                                        <TableRow key={r.id} className="h-14 hover:bg-muted/10 border-b">
                                            <TableCell className="pl-6 font-black text-gray-900">{r.employeeName}</TableCell>
                                            <TableCell className="text-[10px]">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-blue-900">{toNepaliDate(r.startDate)} — {toNepaliDate(r.endDate)}</span>
                                                    <span className="text-muted-foreground uppercase font-black">{r.totalDays} Workdays</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center"><Badge variant="outline" className={cn("text-[8px] font-black uppercase h-4 px-1.5 shadow-none", r.leaveType === 'Paid' ? "text-emerald-600 border-emerald-200" : "text-red-500 border-red-100")}>{r.leaveType}</Badge></TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={cn(
                                                    "text-[8px] font-black uppercase h-4 px-2 shadow-sm",
                                                    r.status === 'Approved' ? "bg-green-600 hover:bg-green-600" : r.status === 'Rejected' ? "bg-red-600 hover:bg-red-600" : "bg-amber-400 text-black hover:bg-amber-400"
                                                )}>{r.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 space-x-1">
                                                {r.status === 'Pending' && (
                                                    <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button size="icon" variant="outline" className="h-7 w-7 text-green-600 border-green-100 hover:bg-green-50" onClick={() => handleUpdateLeaveStatus(r, 'Approved')}><Check className="h-4 w-4"/></Button>
                                                        <Button size="icon" variant="outline" className="h-7 w-7 text-red-600 border-red-100 hover:bg-red-50" onClick={() => handleUpdateLeaveStatus(r, 'Rejected')}><X className="h-4 w-4"/></Button>
                                                    </div>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLeaveRequest(r.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {leaveRequests.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No leave data found.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Shift Definition Dialog */}
            <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle className="text-xl font-black text-gray-900 uppercase">Define Shift Pattern</DialogTitle></DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Pattern Label</Label><Input value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} placeholder="e.g. Production Day" className="h-10" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">On Duty (In)</Label><Input type="time" value={shiftForm.onDuty} onChange={e => setShiftForm({...shiftForm, onDuty: e.target.value})} className="h-10" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Off Duty (Out)</Label><Input type="time" value={shiftForm.offDuty} onChange={e => setShiftForm({...shiftForm, offDuty: e.target.value})} className="h-10" /></div>
                        </div>
                        <div className="flex items-center space-x-2 pt-2"><Checkbox id="sh-def" checked={shiftForm.isDefault} onCheckedChange={(v) => setShiftForm({...shiftForm, isDefault: !!v})} /><Label htmlFor="sh-def" className="text-xs font-bold uppercase cursor-pointer">Make system default</Label></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveShift} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Entry</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Holiday Registry Dialog */}
            <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle className="text-xl font-black text-gray-900 uppercase">Log Calendar Holiday</DialogTitle></DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Public Event Name</Label><Input value={holidayForm.name} onChange={e => setHolidayForm({...holidayForm, name: e.target.value})} placeholder="e.g. Republic Day" className="h-10" /></div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Target Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-10 bg-white font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4" /> {holidayForm.date ? toNepaliDate(holidayForm.date) : "Select"}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><DualCalendar selected={new Date(holidayForm.date)} onSelect={(d) => setHolidayForm({...holidayForm, date: d?.toISOString() || new Date().toISOString()})} /></PopoverContent></Popover>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveHoliday} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Publish to Calendar</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Leave Request Dialog */}
            <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader><DialogTitle className="text-xl font-black text-gray-900 uppercase">Record Authorized Leave</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Target Employee</Label>
                            <Select value={leaveForm.employeeId} onValueChange={v => setLeaveForm({...leaveForm, employeeId: v})}>
                                <SelectTrigger className="h-10"><SelectValue placeholder="Search registry..."/></SelectTrigger>
                                <SelectContent>{employees.sort((a,b) => a.name.localeCompare(b.name)).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Benefit Category</Label>
                            <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm({...leaveForm, leaveType: v})}>
                                <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                <SelectContent><SelectItem value="Paid">Paid (Annual/Sick)</SelectItem><SelectItem value="Unpaid">Unpaid (Loss of Pay)</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Internal Note</Label>
                            <Input value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} className="h-10" placeholder="e.g. Family Function" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Start Period</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-10 font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4"/> {toNepaliDate(leaveForm.startDate)}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><DualCalendar selected={new Date(leaveForm.startDate)} onSelect={d => setLeaveForm({...leaveForm, startDate: d?.toISOString() || ''})} /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">End Period</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-10 font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4"/> {toNepaliDate(leaveForm.endDate)}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><DualCalendar selected={new Date(leaveForm.endDate)} onSelect={d => setLeaveForm({...leaveForm, endDate: d?.toISOString() || ''})} /></PopoverContent></Popover>
                        </div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveLeaveRequest} className="w-full h-11 font-black text-xs uppercase shadow-lg shadow-blue-500/20">Commit Request</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
