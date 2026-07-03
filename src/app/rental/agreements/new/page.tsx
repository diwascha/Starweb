'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, ChevronRight, ChevronLeft, Loader2, Home, User, ShieldCheck, FileText } from 'lucide-react';
import type { RentalProperty, RentalUnit, Party } from '@/lib/types';
import { onPropertiesUpdate } from '@/services/property-service';
import { getUnitsByProperty } from '@/services/unit-service';
import { onPartiesUpdate } from '@/services/party-service';
import { activateAgreement } from '@/services/agreement-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { toNepaliDate, cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

function AgreementWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitIdFromUrl = searchParams.get('unitId');
  
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [availableUnits, setAvailableUnits] = useState<RentalUnit[]>([]);
  const [tenants, setTenants] = useState<Party[]>([]);
  
  const [form, setForm] = useState({
    propertyId: '',
    unitId: unitIdFromUrl || '',
    tenantId: '',
    monthlyRent: 0,
    securityDeposit: 0,
    billingDate: 1,
    lateFee: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
  });

  useEffect(() => {
    onPropertiesUpdate(setProperties);
    onPartiesUpdate((data) => setTenants(data.filter(p => p.type === 'Tenant' || p.type === 'Both')));
  }, []);

  useEffect(() => {
    if (form.propertyId) {
        getUnitsByProperty(form.propertyId).then(data => setAvailableUnits(data.filter(u => u.status === 'Vacant' || u.id === unitIdFromUrl)));
    }
  }, [form.propertyId, unitIdFromUrl]);

  const selectedProperty = properties.find(p => p.id === form.propertyId);
  const selectedUnit = availableUnits.find(u => u.id === form.unitId);
  const selectedTenant = tenants.find(t => t.id === form.tenantId);

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const handleActivate = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
        await activateAgreement({
            ...form,
            propertyName: selectedProperty?.name,
            unitNumber: selectedUnit?.unitNumber,
            tenantName: selectedTenant?.name,
            status: 'Active',
            createdBy: user.username
        } as any);
        toast({ title: 'Agreement Activated' });
        router.push('/rental/agreements');
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex justify-between items-center mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-2">
             <div className={cn(
               "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
               step >= i ? "bg-primary border-primary text-primary-foreground" : "border-muted text-muted-foreground"
             )}>
                {step > i ? <Check className="h-4 w-4"/> : i}
             </div>
             {i < 4 && <div className={cn("w-12 h-0.5", step > i ? "bg-primary" : "bg-muted")}/>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Home className="h-5 w-5"/> Step 1: Select Space</CardTitle>
            <CardDescription>Choose the property and specific unit for this lease.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-2">
                <Label>Property</Label>
                <Select value={form.propertyId} onValueChange={v => setForm({...form, propertyId: v, unitId: ''})}>
                    <SelectTrigger><SelectValue placeholder="Select Property"/></SelectTrigger>
                    <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
             </div>
             <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={form.unitId} onValueChange={v => {
                    const u = availableUnits.find(x => x.id === v);
                    setForm({...form, unitId: v, monthlyRent: u?.monthlyRent || 0});
                }} disabled={!form.propertyId}>
                    <SelectTrigger><SelectValue placeholder="Select Unit"/></SelectTrigger>
                    <SelectContent>{availableUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitNumber} - {u.type} (Rs. {u.monthlyRent})</SelectItem>)}</SelectContent>
                </Select>
             </div>
          </CardContent>
          <CardFooter className="justify-end"><Button onClick={handleNext} disabled={!form.unitId}>Next <ChevronRight className="ml-2 h-4 w-4"/></Button></CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5"/> Step 2: Assign Tenant</CardTitle>
            <CardDescription>Select an existing tenant or add a new one in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-2">
                <Label>Tenant Name</Label>
                <Select value={form.tenantId} onValueChange={v => setForm({...form, tenantId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select Tenant"/></SelectTrigger>
                    <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
             </div>
             {selectedTenant?.address && <p className="text-xs text-muted-foreground italic">Address: {selectedTenant.address}</p>}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4"/> Back</Button>
            <Button onClick={handleNext} disabled={!form.tenantId}>Next <ChevronRight className="ml-2 h-4 w-4"/></Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/> Step 3: Terms & Finance</CardTitle>
            <CardDescription>Define the lease duration and recurring charges.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
             <div className="space-y-2"><Label>Monthly Rent</Label><Input type="number" value={form.monthlyRent} onChange={e => setForm({...form, monthlyRent: Number(e.target.value)})} /></div>
             <div className="space-y-2"><Label>Security Deposit</Label><Input type="number" value={form.securityDeposit} onChange={e => setForm({...form, securityDeposit: Number(e.target.value)})} /></div>
             <div className="space-y-2"><Label>Billing Day (1-28)</Label><Input type="number" min="1" max="28" value={form.billingDate} onChange={e => setForm({...form, billingDate: Number(e.target.value)})} /></div>
             <div className="space-y-2"><Label>Late Fee / Day</Label><Input type="number" value={form.lateFee} onChange={e => setForm({...form, lateFee: Number(e.target.value)})} /></div>
             <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} /></div>
             <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} /></div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4"/> Back</Button>
            <Button onClick={handleNext}>Next <ChevronRight className="ml-2 h-4 w-4"/></Button>
          </CardFooter>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5"/> Step 4: Final Review</CardTitle>
            <CardDescription>Confirm all details before activating the agreement.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div><Label className="text-muted-foreground uppercase text-[10px]">Property</Label><p className="font-bold">{selectedProperty?.name}</p></div>
                <div><Label className="text-muted-foreground uppercase text-[10px]">Unit Number</Label><p className="font-bold">{selectedUnit?.unitNumber}</p></div>
                <div className="col-span-2 border-t pt-2"><Label className="text-muted-foreground uppercase text-[10px]">Tenant</Label><p className="font-bold text-lg">{selectedTenant?.name}</p></div>
                <Separator className="col-span-2" />
                <div><Label className="text-muted-foreground uppercase text-[10px]">Rent / Mo</Label><p className="font-bold">Rs. {form.monthlyRent.toLocaleString()}</p></div>
                <div><Label className="text-muted-foreground uppercase text-[10px]">Security Deposit</Label><p className="font-bold">Rs. {form.securityDeposit.toLocaleString()}</p></div>
                <div><Label className="text-muted-foreground uppercase text-[10px]">Duration</Label><p className="font-bold">{toNepaliDate(form.startDate)} - {toNepaliDate(form.endDate)}</p></div>
                <div><Label className="text-muted-foreground uppercase text-[10px]">Status Upon Save</Label><Badge className="bg-green-600">Active</Badge></div>
             </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" onClick={handleBack}><ChevronLeft className="mr-2 h-4 w-4"/> Back</Button>
            <Button onClick={handleActivate} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Check className="mr-2 h-4 w-4"/>}
                Activate Agreement
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
    return <Suspense><AgreementWizard/></Suspense>;
}
