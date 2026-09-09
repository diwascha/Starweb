'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
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
    Save,
    Loader2,
    ArrowRight,
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
import type { HrShift, HrConfig, LeaveRequest, Employee, PublicHoliday } from '@/lib/types';
import { toNepaliDate, cn } from '@/lib/utils';
import { DEFAULT_HR_CONFIG } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format, differenceInDays } from 'date-fns';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const INITIAL_HR_CONFIG: HrConfig = DEFAULT_HR_CONFIG;

interface SettingRowSpec {
    label: string;
    description?: string;
    control: ReactNode;
}

/**
 * Compact "Setting | Value" table used across HR Setting's operational
 * config sections, in place of a grid of individually-labeled inputs - the
 * same key/value/description shape as the source workbook's Rates sheet,
 * just without the big card padding around every single field.
 */
function SettingsTable({ rows }: { rows: SettingRowSpec[] }) {
    return (
        <Table className="text-xs">
            <TableBody>
                {rows.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="pl-4 py-2.5 align-top w-1/2">
                            <div className="font-bold text-gray-900">{row.label}</div>
                            {row.description && <div className="text-[9px] text-muted-foreground font-normal leading-snug mt-0.5">{row.description}</div>}
                        </TableCell>
                        <TableCell className="py-2 pr-4 align-middle">{row.control}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

export default function HrOfficePage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState("operations");
    const [shifts, setShifts] = useState<HrShift[]>([]);
    const [hrConfig, setHrConfig] = useState<HrConfig>(INITIAL_HR_CONFIG);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isRefreshingShifts, setIsRefreshingShifts] = useState(false);

    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

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
                    <TabsTrigger value="payroll-rules" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Analytics Rules</TabsTrigger>
                    <TabsTrigger value="holidays" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Holiday Registry</TabsTrigger>
                    <TabsTrigger value="leaves" className="gap-2 px-6 font-bold text-[10px] uppercase tracking-widest">Leave Admin</TabsTrigger>
                </TabsList>

                <TabsContent value="operations" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 border-b bg-muted/5"><CardTitle className="text-xs uppercase font-black text-muted-foreground">Precision Controls</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <SettingsTable rows={[
                                    { label: 'Base Day Hours', control: <Input type="number" value={hrConfig.hours.baseDayHours} onChange={e => updateNestedConfig('hours', 'baseDayHours', Number(e.target.value))} className="h-8 w-24 font-bold" /> },
                                    { label: 'Rounding Step', control: <Input type="number" step="0.25" value={hrConfig.hours.roundStep} onChange={e => updateNestedConfig('hours', 'roundStep', Number(e.target.value))} className="h-8 w-24 font-bold" /> },
                                    { label: 'Grace (Min)', control: <Input type="number" value={hrConfig.hours.graceMin} onChange={e => updateNestedConfig('hours', 'graceMin', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Block (Min)', control: <Input type="number" value={hrConfig.hours.blockMin} onChange={e => updateNestedConfig('hours', 'blockMin', Number(e.target.value))} className="h-8 w-24" /> },
                                ]} />
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 border-b bg-muted/5"><CardTitle className="text-xs uppercase font-black text-muted-foreground">Break & Oversight</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <SettingsTable rows={[
                                    { label: 'Fixed Break Start', control: <Input type="time" value={hrConfig.hours.breakStart || '12:00'} onChange={e => updateNestedConfig('hours', 'breakStart', e.target.value)} className="h-8 w-28 font-mono" /> },
                                    { label: 'Fixed Break End', control: <Input type="time" value={hrConfig.hours.breakEnd || '13:00'} onChange={e => updateNestedConfig('hours', 'breakEnd', e.target.value)} className="h-8 w-28 font-mono" /> },
                                    { label: 'Free Lates (Count)', control: <Input type="number" value={hrConfig.hours.freeLate} onChange={e => updateNestedConfig('hours', 'freeLate', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Free Late Reset Cycle', control: (
                                        <Select value={hrConfig.hours.freeLatePeriod} onValueChange={(v: 'WEEKLY' | 'MONTHLY') => updateNestedConfig('hours', 'freeLatePeriod', v)}>
                                            <SelectTrigger className="h-8 w-32"><SelectValue/></SelectTrigger>
                                            <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
                                        </Select>
                                    ) },
                                    { label: 'Free Earlies (Count)', control: <Input type="number" value={hrConfig.hours.freeEarly} onChange={e => updateNestedConfig('hours', 'freeEarly', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Free Early Reset Cycle', control: (
                                        <Select value={hrConfig.hours.freeEarlyPeriod} onValueChange={(v: 'WEEKLY' | 'MONTHLY') => updateNestedConfig('hours', 'freeEarlyPeriod', v)}>
                                            <SelectTrigger className="h-8 w-32"><SelectValue/></SelectTrigger>
                                            <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
                                        </Select>
                                    ) },
                                    { label: 'Review Hours Threshold', description: 'Rows above this get flagged "Review Hours".', control: <Input type="number" step="0.25" value={hrConfig.hours.reviewThresh} onChange={e => updateNestedConfig('hours', 'reviewThresh', Number(e.target.value))} className="h-8 w-24" /> },
                                ]} />
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 border-b bg-muted/5">
                                <CardTitle className="text-xs uppercase font-black text-muted-foreground">Payroll Calculation</CardTitle>
                                <CardDescription className="text-[9px] uppercase font-bold text-muted-foreground">Rates, tax, and workday assumptions used by Recalculate.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <SettingsTable rows={[
                                    { label: 'Default Hourly Rate', control: <Input type="number" value={hrConfig.payroll.defaultHourly} onChange={e => updateNestedConfig('payroll', 'defaultHourly', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Fallback Hourly Rate', control: <Input type="number" value={hrConfig.payroll.fallbackHourly} onChange={e => updateNestedConfig('payroll', 'fallbackHourly', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'TDS Rate (decimal)', control: <Input type="number" step="0.001" value={hrConfig.payroll.tdsRate} onChange={e => updateNestedConfig('payroll', 'tdsRate', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Days In A Month', control: <Input type="number" value={hrConfig.payroll.monthDays} onChange={e => updateNestedConfig('payroll', 'monthDays', Number(e.target.value))} className="h-8 w-24" /> },
                                    { label: 'Standard Workdays / Month', control: <Input type="number" value={hrConfig.payroll.stdWorkdays} onChange={e => updateNestedConfig('payroll', 'stdWorkdays', Number(e.target.value))} className="h-8 w-24" /> },
                                ]} />
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 border-b bg-muted/5">
                                <CardTitle className="text-xs uppercase font-black text-muted-foreground">Bonus Rules</CardTitle>
                                <CardDescription className="text-[9px] uppercase font-bold text-muted-foreground">Monthly bonus accrual eligibility.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <SettingsTable rows={[
                                    { label: 'Full-Bonus Attendance %', description: 'At or above this %, an employee earns the full monthly bonus (Base/12); below it, the bonus is pro-rated by attendance %.', control: <Input type="number" value={hrConfig.bonus.bonusEligReq} onChange={e => updateNestedConfig('bonus', 'bonusEligReq', Number(e.target.value))} className="h-8 w-24" /> },
                                ]} />
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm border-gray-100 bg-blue-50/20">
                        <CardContent className="p-4 text-[11px] text-blue-900 leading-relaxed">
                            Company letterhead details (name, address, PAN) used on payslips are managed under <span className="font-bold">Settings → General → Company Profile</span>, not here.
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payroll-rules" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <Card className="shadow-sm border-gray-100 overflow-hidden max-w-2xl">
                        <CardHeader className="py-4 border-b bg-muted/5">
                            <CardTitle className="text-sm font-black uppercase text-gray-900">Behavior Report Alert Bands</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Color-coding thresholds for the Analytics tab's behavioral scoreboard.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <SettingsTable rows={[
                                { label: 'Punctuality High % (green)', control: <Input type="number" value={hrConfig.payroll.punctHighPct} onChange={e => updateNestedConfig('payroll', 'punctHighPct', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'Punctuality Mid % (yellow)', control: <Input type="number" value={hrConfig.payroll.punctMidPct} onChange={e => updateNestedConfig('payroll', 'punctMidPct', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'Late Days High (red)', control: <Input type="number" value={hrConfig.payroll.lateDaysHigh} onChange={e => updateNestedConfig('payroll', 'lateDaysHigh', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'Late Days Mid (yellow)', control: <Input type="number" value={hrConfig.payroll.lateDaysMid} onChange={e => updateNestedConfig('payroll', 'lateDaysMid', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'OT High Hrs (fatigue)', control: <Input type="number" value={hrConfig.payroll.otHighHours} onChange={e => updateNestedConfig('payroll', 'otHighHours', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'OT Mid Hrs (monitor)', control: <Input type="number" value={hrConfig.payroll.otMidHours} onChange={e => updateNestedConfig('payroll', 'otMidHours', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'DOW Late High % (red)', control: <Input type="number" value={hrConfig.payroll.dowLateHighPct} onChange={e => updateNestedConfig('payroll', 'dowLateHighPct', Number(e.target.value))} className="h-8 w-24" /> },
                                { label: 'DOW Late Mid % (yellow)', control: <Input type="number" value={hrConfig.payroll.dowLateMidPct} onChange={e => updateNestedConfig('payroll', 'dowLateMidPct', Number(e.target.value))} className="h-8 w-24" /> },
                            ]} />
                        </CardContent>
                    </Card>
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