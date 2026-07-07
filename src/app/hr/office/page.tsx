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
    CheckCircle2
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
import type { HrShift, PublicHoliday, LeaveRequest, Employee } from '@/lib/types';
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

export default function HrOfficePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    // Administration States
    const [shifts, setShifts] = useState<HrShift[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoadingAdmin, setIsLoadingAdmin] = useState(true);

    // Dialog & Form States
    const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<HrShift | null>(null);
    const [shiftForm, setShiftForm] = useState({ name: '', onDuty: '09:00', offDuty: '17:00', graceMinutes: 15, isDefault: false });

    const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
    const [holidayForm, setHolidayForm] = useState({ name: '', date: new Date().toISOString(), isRecurring: true });

    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ 
        employeeId: '', 
        leaveType: 'Casual' as any, 
        startDate: new Date().toISOString(), 
        endDate: new Date().toISOString(), 
        reason: '' 
    });

    useEffect(() => {
        const unsubs = [
            onShiftsUpdate(setShifts),
            onHolidaysUpdate(setHolidays),
            onLeaveRequestsUpdate(setLeaveRequests),
            onEmployeesUpdate(setEmployees)
        ];
        setIsLoadingAdmin(false);
        return () => unsubs.forEach(u => u());
    }, []);

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
            <header>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><Settings2 className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Office</h1>
                        <p className="text-muted-foreground text-sm font-medium">Core organizational settings and administrative oversight.</p>
                    </div>
                </div>
            </header>

            <div className="space-y-8 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Shift Manager */}
                    <Card className="shadow-sm border-gray-100 bg-white">
                        <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                            <div>
                                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                                    <Timer className="h-4 w-4 text-primary"/>
                                    Shift Configurations
                                </CardTitle>
                            </div>
                            <Button size="sm" onClick={() => { setEditingShift(null); setShiftForm({ name: '', onDuty: '09:00', offDuty: '17:00', graceMinutes: 15, isDefault: false }); setIsShiftDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Define Shift
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader><TableRow className="bg-muted/50"><TableHead className="pl-6 font-bold">Shift Name</TableHead><TableHead className="font-bold">Hours</TableHead><TableHead className="font-bold">Grace</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {shifts.map(s => (
                                        <TableRow key={s.id} className="h-12">
                                            <TableCell className="pl-6 font-black text-gray-900">{s.name} {s.isDefault && <Badge variant="secondary" className="ml-2 text-[8px] uppercase">Default</Badge>}</TableCell>
                                            <TableCell className="font-medium text-gray-600">{s.onDuty} — {s.offDuty}</TableCell>
                                            <TableCell className="text-blue-600 font-bold">{s.graceMinutes} min</TableCell>
                                            <TableCell className="text-right pr-6 space-x-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingShift(s); setShiftForm(s); setIsShiftDialogOpen(true); }}><Edit className="h-3.5 w-3.5"/></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteShift(s.id)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {shifts.length === 0 && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">No shifts defined.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Holiday Registry */}
                    <Card className="shadow-sm border-gray-100 bg-white">
                        <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                            <div>
                                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                                    <CalendarCheck className="h-4 w-4 text-primary"/>
                                    Public Holidays
                                </CardTitle>
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
                </div>

                {/* Leave Management Queue */}
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b bg-muted/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl"><Briefcase className="h-5 w-5 text-blue-600"/></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase text-gray-900 tracking-wider">Leave Request Oversight</CardTitle>
                            </div>
                        </div>
                        <Button size="sm" onClick={() => { setLeaveForm({ employeeId: '', leaveType: 'Casual', startDate: new Date().toISOString(), endDate: new Date().toISOString(), reason: '' }); setIsLeaveDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Apply for Leave
                        </Button>
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
                                        <TableCell><Badge variant="outline" className="text-[9px] uppercase font-bold">{r.leaveType}</Badge></TableCell>
                                        <TableCell className="text-muted-foreground max-w-xs truncate">{r.reason}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge className={cn(
                                                "text-[9px] uppercase font-black",
                                                r.status === 'Approved' ? "bg-green-600" : r.status === 'Rejected' ? "bg-red-600" : "bg-amber-500"
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
            </div>

            {/* Shift Dialog */}
            <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Shift Configuration</DialogTitle>
                        <DialogDescription>Define standard working hours for employee attendance calculation.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Shift Name</Label><Input value={shiftForm.name} onChange={e => setShiftForm({...shiftForm, name: e.target.value})} placeholder="e.g. Morning Shift" className="h-10" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">On Duty (HH:mm)</Label><Input type="time" value={shiftForm.onDuty} onChange={e => setShiftForm({...shiftForm, onDuty: e.target.value})} className="h-10" /></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Off Duty (HH:mm)</Label><Input type="time" value={shiftForm.offDuty} onChange={e => setShiftForm({...shiftForm, offDuty: e.target.value})} className="h-10" /></div>
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
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Apply for Leave</DialogTitle>
                        <DialogDescription>Submit a formal leave request for an employee.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
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
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Leave Type</Label>
                                <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm({...leaveForm, leaveType: v})}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Casual">Casual Leave</SelectItem>
                                        <SelectItem value="Sick">Sick Leave</SelectItem>
                                        <SelectItem value="Sick (Paid)">Sick (Paid)</SelectItem>
                                        <SelectItem value="Paid">Earned (Paid)</SelectItem>
                                        <SelectItem value="Unpaid">Loss of Pay</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status Preview</Label>
                                <Badge className="h-10 w-full justify-center bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest">Pending</Badge>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
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
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Reason / Remarks</Label>
                            <Textarea value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} placeholder="Purpose of leave..." className="min-h-[80px] text-sm" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveLeaveRequest} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            <CheckCircle2 className="mr-2 h-4 w-4"/> Log Leave Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
