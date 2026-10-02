'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Vehicle, VehicleService } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, CalendarIcon, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
import { format, differenceInCalendarDays, startOfToday } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import {
  onVehicleServicesUpdate, addVehicleService, updateVehicleService, deleteVehicleService,
} from '@/services/vehicle-service-record-service';

/** A next service this many days away or closer is flagged "Due soon". */
const DUE_SOON_DAYS = 15;

type DueStatus = 'Overdue' | 'Due soon' | 'Upcoming' | 'Done';
type StatusFilter = 'Latest' | 'All' | 'Overdue' | 'Due soon';

type FormState = {
  vehicleId: string;
  serviceDate: string;
  serviceKm: string;
  nextServiceKm: string;
  nextServiceDate: string;
  remarks: string;
};

const emptyForm = (): FormState => ({
  vehicleId: '',
  serviceDate: new Date().toISOString(),
  serviceKm: '',
  nextServiceKm: '',
  nextServiceDate: '',
  remarks: '',
});

const showDate = (iso: string) => `${toNepaliDate(iso)} BS (${format(new Date(iso), 'dd MMM yyyy')})`;
const km = (n: number) => `${n.toLocaleString('en-IN')} km`;

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-10', !value && 'text-muted-foreground')}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? showDate(value) : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DualCalendar selected={value ? new Date(value) : undefined} onSelect={(d) => d && onChange(d.toISOString())} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface ServicingClientPageProps {
  title?: string;
  subtitle?: string;
}

export default function ServicingClientPage({
  title = 'Vehicle Servicing',
  subtitle = 'Service history and upcoming servicing for each vehicle.',
}: ServicingClientPageProps) {
  const [records, setRecords] = useState<VehicleService[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filterVehicleId, setFilterVehicleId] = useState('All');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('Latest');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleService | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleting, setDeleting] = useState<VehicleService | null>(null);

  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  const { inScope } = useOwnershipScope('fleet');

  useEffect(() => {
    const unsubRecords = onVehicleServicesUpdate((data) => setRecords(data.filter(r => inScope(r.ownership))));
    const unsubVehicles = onVehiclesUpdate((data) => setVehicles(data.filter(v => inScope(v.ownership))));
    return () => { unsubRecords(); unsubVehicles(); };
  }, [inScope]);

  const vehicleName = useMemo(() => {
    const map = new Map(vehicles.map(v => [v.id, v.name]));
    return (id: string) => map.get(id) || 'Unknown vehicle';
  }, [vehicles]);

  // The newest service of each vehicle is the one whose "next service" is
  // still pending; older ones are history.
  const latestIdByVehicle = useMemo(() => {
    const latest = new Map<string, VehicleService>();
    for (const r of records) {
      const cur = latest.get(r.vehicleId);
      if (!cur || r.serviceDate > cur.serviceDate || (r.serviceDate === cur.serviceDate && r.serviceKm > cur.serviceKm)) {
        latest.set(r.vehicleId, r);
      }
    }
    return new Set(Array.from(latest.values()).map(r => r.id));
  }, [records]);

  const statusOf = (r: VehicleService): DueStatus => {
    if (!latestIdByVehicle.has(r.id)) return 'Done';
    const days = differenceInCalendarDays(new Date(r.nextServiceDate), startOfToday());
    if (days < 0) return 'Overdue';
    if (days <= DUE_SOON_DAYS) return 'Due soon';
    return 'Upcoming';
  };

  const rows = useMemo(() => {
    return records
      .filter(r => filterVehicleId === 'All' || r.vehicleId === filterVehicleId)
      .filter(r => {
        if (filterStatus === 'All') return true;
        if (filterStatus === 'Latest') return latestIdByVehicle.has(r.id);
        return statusOf(r) === filterStatus;
      })
      .sort((a, b) => filterStatus === 'All'
        ? b.serviceDate.localeCompare(a.serviceDate)
        : a.nextServiceDate.localeCompare(b.nextServiceDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, filterVehicleId, filterStatus, latestIdByVehicle]);

  const counts = useMemo(() => {
    let overdue = 0, dueSoon = 0;
    records.forEach(r => {
      const s = statusOf(r);
      if (s === 'Overdue') overdue++;
      if (s === 'Due soon') dueSoon++;
    });
    return { overdue, dueSoon };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, latestIdByVehicle]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm(), vehicleId: filterVehicleId !== 'All' ? filterVehicleId : '' });
    setIsDialogOpen(true);
  };

  const openEdit = (r: VehicleService) => {
    setEditing(r);
    setForm({
      vehicleId: r.vehicleId,
      serviceDate: r.serviceDate,
      serviceKm: String(r.serviceKm),
      nextServiceKm: String(r.nextServiceKm),
      nextServiceDate: r.nextServiceDate,
      remarks: r.remarks || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const serviceKm = Number(form.serviceKm);
    const nextServiceKm = Number(form.nextServiceKm);
    const problem =
      !form.vehicleId ? 'Choose a vehicle.' :
      !form.serviceKm || !(serviceKm >= 0) ? 'Enter the servicing KM.' :
      !form.nextServiceKm || !(nextServiceKm > serviceKm) ? 'Upcoming servicing KM must be more than the servicing KM.' :
      !form.nextServiceDate ? 'Pick the tentative date of the next servicing.' :
      form.nextServiceDate.slice(0, 10) <= form.serviceDate.slice(0, 10) ? 'The tentative date must be after the servicing date.' :
      null;
    if (problem) {
      toast({ title: 'Check the form', description: problem, variant: 'destructive' });
      return;
    }

    const vehicle = vehicles.find(v => v.id === form.vehicleId);
    const data = {
      vehicleId: form.vehicleId,
      serviceDate: form.serviceDate,
      serviceKm,
      nextServiceKm,
      nextServiceDate: form.nextServiceDate,
      remarks: form.remarks.trim(),
      ownership: vehicle?.ownership || 'Both',
    };
    if (editing) {
      await updateVehicleService(editing.id, { ...data, lastModifiedBy: user.username });
      toast({ title: 'Service record updated' });
    } else {
      await addVehicleService({ ...data, createdBy: user.username });
      toast({ title: 'Service record added' });
    }
    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteVehicleService(deleting.id);
    toast({ title: 'Service record deleted' });
    setDeleting(null);
  };

  const badgeFor = (s: DueStatus) => {
    if (s === 'Overdue') return <Badge variant="destructive">Overdue</Badge>;
    if (s === 'Due soon') return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Due soon</Badge>;
    if (s === 'Upcoming') return <Badge variant="secondary">Upcoming</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">Done</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" />{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
          {(counts.overdue > 0 || counts.dueSoon > 0) && (
            <p className="mt-2 text-sm">
              {counts.overdue > 0 && <span className="font-semibold text-destructive">{counts.overdue} overdue</span>}
              {counts.overdue > 0 && counts.dueSoon > 0 && ' · '}
              {counts.dueSoon > 0 && <span className="font-semibold text-amber-600">{counts.dueSoon} due within {DUE_SOON_DAYS} days</span>}
            </p>
          )}
        </div>
        {hasPermission('fleet', 'create') && (
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Servicing</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Vehicle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All vehicles</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Latest">Latest service per vehicle</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
              <SelectItem value="Due soon">Due soon</SelectItem>
              <SelectItem value="All">Full history</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Servicing Date</TableHead>
                <TableHead className="text-right">Servicing KM</TableHead>
                <TableHead className="text-right">Upcoming Servicing KM</TableHead>
                <TableHead>Tentative Date</TableHead>
                <TableHead>Remarks (major parts)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No service records.</TableCell>
                </TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{vehicleName(r.vehicleId)}</TableCell>
                  <TableCell className="whitespace-nowrap">{showDate(r.serviceDate)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{km(r.serviceKm)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {km(r.nextServiceKm)}
                    <div className="text-xs text-muted-foreground">+{km(r.nextServiceKm - r.serviceKm)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{showDate(r.nextServiceDate)}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-pre-wrap text-sm">{r.remarks || '—'}</TableCell>
                  <TableCell>{badgeFor(statusOf(r))}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {hasPermission('fleet', 'edit') && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit"><Edit className="h-4 w-4" /></Button>
                      )}
                      {hasPermission('fleet', 'delete') && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Servicing' : 'Add Servicing'}</DialogTitle>
            <DialogDescription>Record a service and when the next one is due.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm(f => ({ ...f, vehicleId: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField label="Servicing Date" value={form.serviceDate} onChange={(iso) => setForm(f => ({ ...f, serviceDate: iso }))} />
              <div className="space-y-2">
                <Label>Servicing KM</Label>
                <Input type="number" inputMode="numeric" min={0} value={form.serviceKm} onChange={(e) => setForm(f => ({ ...f, serviceKm: e.target.value }))} placeholder="Odometer reading" />
              </div>
              <DateField label="Tentative Next Date" value={form.nextServiceDate} onChange={(iso) => setForm(f => ({ ...f, nextServiceDate: iso }))} />
              <div className="space-y-2">
                <Label>Upcoming Servicing KM</Label>
                <Input type="number" inputMode="numeric" min={0} value={form.nextServiceKm} onChange={(e) => setForm(f => ({ ...f, nextServiceKm: e.target.value }))} placeholder="Next service at" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks (major parts changed)</Label>
              <Textarea value={form.remarks} onChange={(e) => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="e.g. Clutch plate replaced, new tyres (rear)" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editing ? 'Save Changes' : 'Add Servicing'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this service record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${vehicleName(deleting.vehicleId)}, serviced ${showDate(deleting.serviceDate)} at ${km(deleting.serviceKm)}. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
