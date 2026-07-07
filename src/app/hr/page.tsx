
'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { 
    Users, 
    Calendar, 
    FileText, 
    Award, 
    Wallet, 
    BarChart2, 
    Clock, 
    Timer, 
    ShieldCheck, 
    Plus, 
    Trash2, 
    Edit, 
    CalendarCheck,
    Briefcase,
    Loader2,
    Settings2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import HrDashboardClient from './_components/hr-dashboard-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { toNepaliDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

const hrModules = [
    { name: 'Employees', description: 'Manage employee records and wage information.', href: '/hr/employees', icon: Users },
    { name: 'Attendance', description: 'Record and track daily employee attendance.', href: '/hr/attendance', icon: Calendar },
    { name: 'Analytics', description: 'Generate attendance analytics for any period.', href: '/hr/analytics', icon: BarChart2 },
    { name: 'Payroll', description: 'View and process payroll reports.', href: '/hr/payroll', icon: FileText },
    { name: 'Bonus', description: 'Calculate and track employee bonuses.', href: '/hr/bonus', icon: Award },
    { name: 'Payslip', description: 'View and print employee payslips.', href: '/hr/payslip', icon: Wallet },
];

function DashboardSkeleton() {
    return (
        <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
                 <Card><CardHeader><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-1/2" /></CardContent></Card>
            </div>
             <Card><CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
    );
}

export default function HRPage() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('overview');
    
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
    const [holidayForm, setHolidayForm] = useState({ name: '', date: new Date().toISOString().split('T')[0], isRecurring: true });

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
                <div>
                    <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">HR Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium">Workforce management and organizational structure.</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 mb-8">
                    <TabsTrigger value="overview" className="gap-2 px-8 py-2 font-bold text-[11px] uppercase tracking-widest transition-all">
                        <LayoutDashboard className="h-4 w-4"/>
                        Dashboard
                    </TabsTrigger>
                    <TabsTrigger value="admin" className="gap-2 px-8 py-2 font-bold text-[11px] uppercase tracking-widest transition-all">
                        <Settings2 className="h-4 w-4"/>
                        Administration
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                    <Suspense fallback={<DashboardSkeleton />}>
                        <HrDashboardClient initialEmployees={[]} initialAttendance={[]} />
                    </Suspense>

                    <Separator className="border-dashed" />

                    <div>
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-4 px-1">Operational Modules</h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {hrModules.map((module) => (
                                <Link href={module.href} key={module.name}>
                                    <Card className="h-full transition-all hover:shadow-lg border-none ring-1 ring-black/5 bg-white group">
                                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                            <CardTitle className="text-sm font-black uppercase tracking-wider text-gray-900 group-hover:text-primary transition-colors">{module.name}</CardTitle>
                                            <module.icon className="h-5 w-5 text-muted-foreground group-hover:scale-110 transition-transform" />
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">{module.description}</p>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="admin" className="space-y-8 animate-in fade-in slide-in-from-top-2">
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
                                <Button size="sm" onClick={() => { setEditingShift(null); setIsShiftDialogOpen(true); }} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Define Shift
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table className="text-xs">
                                    <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6 font-bold">Shift Name</TableHead><TableHead className="font-bold">Hours</TableHead><TableHead className="font-bold">Grace</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
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
                                <Button size="sm" onClick={() => setIsHolidayDialogOpen(true)} className="h-8 text-[10px] uppercase font-black tracking-widest">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Holiday
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table className="text-xs">
                                    <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6 font-bold">Holiday Event</TableHead><TableHead className="font-bold">BS Date</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
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
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Leave Management Queue */}
                    <Card className="shadow-sm border-gray-100 bg-white">
                        <CardHeader className="py-4 px-6 border-b bg-muted/5">
                            <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-primary"/>
                                Leave Request Oversight
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table className="text-xs">
                                <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6 font-bold">Employee</TableHead><TableHead className="font-bold">Leave Period</TableHead><TableHead className="font-bold">Type</TableHead><TableHead className="font-bold">Reason</TableHead><TableHead className="text-center font-bold">Status</TableHead><TableHead className="text-right pr-6 font-bold">Actions</TableHead></TableRow></TableHeader>
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
                </TabsContent>
            </Tabs>

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
                        <div className="flex items-center space-x-2 pt-2"><Checkbox id="shift-default" checked={shiftForm.isDefault} onCheckedChange={(v) => setShiftForm({...shiftForm, isDefault: !!v})} /><Label htmlFor="shift-default" className="text-xs font-bold uppercase cursor-pointer">Set as default shift for all employees</Label></div>
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
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Holiday Date</Label><Input type="date" value={holidayForm.date} onChange={e => setHolidayForm({...holidayForm, date: e.target.value})} className="h-10" /></div>
                        <div className="flex items-center space-x-2 pt-2"><Checkbox id="holiday-recur" checked={holidayForm.isRecurring} onCheckedChange={(v) => setHolidayForm({...holidayForm, isRecurring: !!v})} /><Label htmlFor="holiday-recur" className="text-xs font-bold uppercase cursor-pointer">Recurring Holiday (Annual)</Label></div>
                    </div>
                    <DialogFooter><Button onClick={handleSaveHoliday} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Publish to Calendar</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
