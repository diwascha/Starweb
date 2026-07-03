'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Users, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Phone, 
  MapPin, 
  Eye, 
  DollarSign, 
  Clock, 
  FileText, 
  ShieldCheck, 
  Edit, 
  Printer, 
  ChevronRight, 
  Loader2, 
  Trash2, 
  PlusCircle, 
  CalendarIcon,
  Check,
  User,
  ClipboardList,
  Save,
  Download,
  Building2,
  Home,
  AlertCircle,
  Zap,
  Droplets,
  Wifi,
  Trash,
  Car,
  Wrench,
  HelpCircle,
  ChevronDown,
  FilterX,
  Scale,
  Receipt
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty, updateParty, deleteParty } from '@/services/party-service';
import { onAgreementsUpdate, activateAgreement } from '@/services/agreement-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import { onPropertiesUpdate } from '@/services/property-service';
import { getUnitsByProperty } from '@/services/unit-service';
import type { Party, RentalAgreement, Transaction, RentalBill, PartyType, AccountOwnership, RentalProperty, RentalUnit } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format, isPast } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

export default function TenantsPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('records');
  const [tenants, setTenants] = useState<Party[]>([]);
  const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<RentalBill[]>([]);
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [availableUnits, setAvailableUnits] = useState<RentalUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Party | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState({
    name: '',
    address: '',
    panNumber: '',
    identityType: 'Citizenship',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    // Rental Info
    propertyId: '',
    unitId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    billingCycle: 'Monthly',
    rentAmount: 0,
    securityDeposit: 0,
    advanceRent: 0,
    dueDay: '1',
    // Obligations
    taxLiability: 'Paid by Tenant',
    taxRate: 0,
    utilities: {
      electricity: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
      water: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
      waste: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
      internet: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
      parking: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
      maintenance: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
      security: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
      other: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
    },
    specialTerms: '',
  });

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onPartiesUpdate((data) => {
            setTenants(data.filter(p => 
                (p.type === 'Tenant' || p.type === 'Both') && 
                (p.ownership === 'Rental' || p.ownership === 'Both')
            ));
        }),
        onAgreementsUpdate(setAgreements),
        onTransactionsUpdate(setTransactions),
        onRentalBillsUpdate(setBills),
        onPropertiesUpdate(setProperties)
    ];
    setIsLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    if (tenantForm.propertyId) {
      getUnitsByProperty(tenantForm.propertyId).then(data => {
        setAvailableUnits(data.filter(u => u.status === 'Vacant' || u.id === tenantForm.unitId));
      });
    } else {
      setAvailableUnits([]);
    }
  }, [tenantForm.propertyId, tenantForm.unitId]);

  const tenantSummaries = useMemo(() => {
    return tenants.map(t => {
        const activeLease = agreements.find(a => a.tenantId === t.id && a.status === 'Active');
        const tenantBills = bills.filter(b => b.tenantId === t.id);
        const unpaidBills = tenantBills.filter(b => b.status !== 'Paid');
        const totalOutstanding = unpaidBills.reduce((sum, b) => sum + b.amount, 0);
        
        return {
            ...t,
            activeLease,
            outstandingBalance: totalOutstanding,
            securityDeposit: activeLease?.securityDeposit || 0
        };
    });
  }, [tenants, agreements, bills]);

  const filteredTenants = useMemo(() => {
    return tenantSummaries.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.address || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [tenantSummaries, searchQuery]);

  const resetForm = () => {
    setEditingTenantId(null);
    setTenantForm({
        name: '',
        address: '',
        panNumber: '',
        identityType: 'Citizenship',
        documentNumber: '',
        issueDate: '',
        expiryDate: '',
        propertyId: '',
        unitId: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        billingCycle: 'Monthly',
        rentAmount: 0,
        securityDeposit: 0,
        advanceRent: 0,
        dueDay: '1',
        taxLiability: 'Paid by Tenant',
        taxRate: 0,
        utilities: {
          electricity: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
          water: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
          waste: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          internet: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          parking: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          maintenance: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          security: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          other: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
        },
        specialTerms: '',
    });
  };

  const handleOpenDetail = (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (tenant) {
        setSelectedTenant(tenant);
        setIsDetailOpen(true);
    }
  };

  const openAddForm = () => {
    resetForm();
    setActiveTab('form');
  };

  const openEditForm = (e: React.MouseEvent, tenant: Party) => {
    e.stopPropagation();
    setEditingTenantId(tenant.id);
    const meta = (tenant as any).rentalMeta || {};
    
    setTenantForm({
        name: tenant.name,
        address: tenant.address || '',
        panNumber: tenant.panNumber || '',
        identityType: tenant.identityType || 'Citizenship',
        documentNumber: tenant.documentNumber || '',
        issueDate: tenant.issueDate || '',
        expiryDate: tenant.expiryDate || '',
        propertyId: meta.propertyId || '',
        unitId: meta.unitId || '',
        startDate: meta.startDate || new Date().toISOString().split('T')[0],
        endDate: meta.endDate || '',
        billingCycle: meta.billingCycle || 'Monthly',
        rentAmount: meta.rentAmount || 0,
        securityDeposit: meta.securityDeposit || 0,
        advanceRent: meta.advanceRent || 0,
        dueDay: meta.dueDay || '1',
        taxLiability: meta.taxLiability || 'Paid by Tenant',
        taxRate: meta.taxRate || 0,
        utilities: meta.utilities || {
          electricity: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
          water: { enabled: false, isMetered: true, fixedCharge: 0, responsibleParty: 'Tenant' },
          waste: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          internet: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          parking: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          maintenance: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          security: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
          other: { enabled: false, isMetered: false, fixedCharge: 0, responsibleParty: 'Tenant' },
        },
        specialTerms: meta.specialTerms || '',
    });
    setActiveTab('form');
  };

  const handleTenantSubmit = async () => {
    if (!user || !tenantForm.name) return;
    setIsSubmitting(true);
    try {
        const selectedProperty = properties.find(p => p.id === tenantForm.propertyId);
        const selectedUnit = availableUnits.find(u => u.id === tenantForm.unitId);

        const rentalMeta = {
          propertyId: tenantForm.propertyId,
          unitId: tenantForm.unitId,
          startDate: tenantForm.startDate,
          endDate: tenantForm.endDate,
          billingCycle: tenantForm.billingCycle,
          rentAmount: tenantForm.rentAmount,
          securityDeposit: tenantForm.securityDeposit,
          advanceRent: tenantForm.advanceRent,
          dueDay: tenantForm.dueDay,
          taxLiability: tenantForm.taxLiability,
          taxRate: tenantForm.taxRate,
          utilities: tenantForm.utilities,
          specialTerms: tenantForm.specialTerms
        };

        const partyPayload = {
            name: tenantForm.name,
            address: tenantForm.address,
            panNumber: tenantForm.panNumber,
            identityType: tenantForm.identityType,
            documentNumber: tenantForm.documentNumber,
            issueDate: tenantForm.issueDate || undefined,
            expiryDate: tenantForm.expiryDate || undefined,
            rentalMeta: rentalMeta,
            type: 'Tenant' as PartyType,
            ownership: 'Rental' as AccountOwnership,
        };

        let finalTenantId = editingTenantId;

        if (editingTenantId) {
            await updateParty(editingTenantId, {
                ...partyPayload,
                lastModifiedBy: user.username
            });
        } else {
            finalTenantId = await addParty({
                ...partyPayload,
                createdBy: user.username
            });
        }

        if (tenantForm.propertyId && tenantForm.unitId && finalTenantId) {
          const agreementPayload = {
            propertyId: tenantForm.propertyId,
            unitId: tenantForm.unitId,
            tenantId: finalTenantId,
            propertyName: selectedProperty?.name,
            unitNumber: selectedUnit?.unitNumber,
            tenantName: tenantForm.name,
            monthlyRent: tenantForm.rentAmount,
            securityDeposit: tenantForm.securityDeposit,
            billingDate: parseInt(tenantForm.dueDay, 10),
            lateFee: 0,
            startDate: tenantForm.startDate,
            endDate: tenantForm.endDate || new Date(new Date(tenantForm.startDate).setFullYear(new Date(tenantForm.startDate).getFullYear() + 1)).toISOString().split('T')[0],
            status: 'Active',
            createdBy: user.username
          };
          
          await activateAgreement(agreementPayload as any);
        }

        toast({ title: editingTenantId ? 'Tenant Updated' : 'Tenant Onboarded Successfully' });
        setActiveTab('records');
        resetForm();
    } catch (error: any) {
        console.error(error);
        toast({ title: 'Error saving tenant', description: error.message, variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const updateUtility = (key: keyof typeof tenantForm.utilities, field: string, value: any) => {
    setTenantForm(prev => ({
      ...prev,
      utilities: {
        ...prev.utilities,
        [key]: { ...prev.utilities[key], [field]: value }
      }
    }));
  };

  const handleDeleteTenant = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
          await deleteParty(id);
          toast({ title: 'Tenant Removed' });
      } catch {
          toast({ title: 'Error deleting tenant', variant: 'destructive' });
      }
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
          <h1 className="text-3xl font-bold tracking-tight">Tenant Directory</h1>
          <p className="text-muted-foreground">Detailed overview of occupants and financial standings.</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between border-b pb-4">
            <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="records" className="gap-2">
                    <ClipboardList className="h-4 w-4"/>
                    Records
                </TabsTrigger>
                <TabsTrigger value="form" className="gap-2">
                    {editingTenantId ? <Edit className="h-4 w-4"/> : <PlusCircle className="h-4 w-4"/>}
                    {editingTenantId ? 'Edit Tenant' : 'New Tenant'}
                </TabsTrigger>
            </TabsList>

            {activeTab === 'records' && (
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search name or location..." 
                            className="pl-8 w-full md:w-[300px] h-9 bg-white" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {hasPermission('rental', 'create') && (
                        <Button size="sm" onClick={openAddForm}>
                            <Plus className="mr-2 h-4 w-4"/> Add Tenant
                        </Button>
                    )}
                </div>
            )}
        </div>

        <TabsContent value="records" className="mt-6">
            <Card className="shadow-sm border-gray-100 bg-white">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[300px] font-bold">Tenant Name</TableHead>
                                <TableHead className="font-bold">Unit / Property</TableHead>
                                <TableHead className="font-bold">Contact / Phone</TableHead>
                                <TableHead className="font-bold">Lease Status</TableHead>
                                <TableHead className="text-right font-bold">Outstanding</TableHead>
                                <TableHead className="text-right font-bold">Deposit</TableHead>
                                <TableHead className="w-[100px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTenants.map((tenant) => (
                                <TableRow 
                                    key={tenant.id} 
                                    className="group hover:bg-muted/30 cursor-pointer"
                                    onClick={() => handleOpenDetail(tenant.id)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9 border shadow-sm">
                                                <AvatarImage src={tenant.photoURL} />
                                                <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                                                    {tenant.name.charAt(0)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{tenant.name}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                                                    <MapPin className="h-2 w-2"/> {tenant.address || 'No location'}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {tenant.activeLease ? (
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-xs">Unit {tenant.activeLease.unitNumber}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{tenant.activeLease.propertyName}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">No active lease</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-gray-600">
                                        {tenant.panNumber || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {tenant.activeLease ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-black uppercase">
                                                Active
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-[10px] uppercase">
                                                Inactive
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className={cn(
                                        "text-right font-mono font-bold text-xs tabular-nums",
                                        tenant.outstandingBalance > 0 ? "text-red-600" : "text-emerald-600"
                                    )}>
                                        Rs. {tenant.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs text-gray-600 tabular-nums">
                                        Rs. {tenant.securityDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onSelect={() => handleOpenDetail(tenant.id)}>
                                                        <Eye className="mr-2 h-4 w-4"/> View Profile
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/rental/payments?tenantId=${tenant.id}`}>
                                                            <DollarSign className="mr-2 h-4 w-4"/> Collect Rent
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={(e) => openEditForm(e, tenant)}>
                                                        <Edit className="mr-2 h-4 w-4"/> Edit Details
                                                    </DropdownMenuItem>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4"/> Delete Tenant
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently delete the tenant record. Accounting history for this tenant will be preserved but disconnected.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={(e) => handleDeleteTenant(e, tenant.id)} className="bg-destructive text-destructive-foreground">
                                                                    Yes, Delete
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isLoading && filteredTenants.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-40 text-center text-muted-foreground italic">
                                        <Users className="h-8 w-8 mx-auto opacity-20 mb-2"/>
                                        No tenants matching your search.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="form" className="mt-6 space-y-8">
            <Card className="max-w-5xl mx-auto shadow-lg border-primary/10 overflow-hidden">
                <CardHeader className="bg-primary/5 border-b py-6 px-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-primary/10">
                            <User className="h-6 w-6 text-primary"/>
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black text-gray-900 tracking-tight">
                                {editingTenantId ? 'Update Tenant Profile' : 'Register New Tenant'}
                            </CardTitle>
                            <CardDescription>
                                Complete the digital onboarding for the upcoming occupant.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-8 space-y-12">
                    {/* Identification Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2">
                                <ClipboardList className="h-4 w-4"/>
                                Primary Identity
                            </h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Full Name <span className="text-destructive">*</span></Label>
                                    <Input value={tenantForm.name} onChange={e => setTenantForm({...tenantForm, name: e.target.value})} placeholder="e.g. John Doe" className="h-11 shadow-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Contact Number</Label>
                                        <Input value={tenantForm.panNumber} onChange={e => setTenantForm({...tenantForm, panNumber: e.target.value})} placeholder="98XXXXXXXX" className="h-11" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Permanent Address</Label>
                                        <Input value={tenantForm.address} onChange={e => setTenantForm({...tenantForm, address: e.target.value})} placeholder="Current location" className="h-11" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-xs font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4"/>
                                Verification
                            </h3>
                            <div className="grid grid-cols-2 gap-4 p-5 rounded-2xl border bg-gray-50/50 shadow-inner">
                                <div className="space-y-2 col-span-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">ID Type</Label>
                                    <Select value={tenantForm.identityType} onValueChange={v => setTenantForm({...tenantForm, identityType: v})}>
                                        <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Citizenship">Citizenship</SelectItem>
                                            <SelectItem value="NID">National ID (NID)</SelectItem>
                                            <SelectItem value="Driving License">Driving License</SelectItem>
                                            <SelectItem value="Passport">Passport</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Document #</Label>
                                    <Input value={tenantForm.documentNumber} onChange={e => setTenantForm({...tenantForm, documentNumber: e.target.value})} placeholder="ID serial number" className="bg-white" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Issue Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start h-10 bg-white text-xs px-3">
                                                <CalendarIcon className="mr-2 h-3 w-3" />
                                                {tenantForm.issueDate ? toNepaliDate(tenantForm.issueDate) : "Select"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <DualCalendar selected={tenantForm.issueDate ? new Date(tenantForm.issueDate) : undefined} onSelect={d => setTenantForm({...tenantForm, issueDate: d?.toISOString() || ''})} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Expiry</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start h-10 bg-white text-xs px-3">
                                                <CalendarIcon className="mr-2 h-3 w-3" />
                                                {tenantForm.expiryDate ? toNepaliDate(tenantForm.expiryDate) : "Select"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <DualCalendar selected={tenantForm.expiryDate ? new Date(tenantForm.expiryDate) : undefined} onSelect={d => setTenantForm({...tenantForm, expiryDate: d?.toISOString() || ''})} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* Rental Info Section */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl"><Home className="h-5 w-5 text-blue-600"/></div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">Lease & Occupancy</h3>
                                <p className="text-xs text-muted-foreground">Select the unit and define financial terms.</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Property <span className="text-destructive">*</span></Label>
                                    <Select value={tenantForm.propertyId} onValueChange={v => setTenantForm({...tenantForm, propertyId: v, unitId: ''})}>
                                        <SelectTrigger className="h-11 shadow-sm"><SelectValue placeholder="Select asset..."/></SelectTrigger>
                                        <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Available Unit <span className="text-destructive">*</span></Label>
                                    <Select value={tenantForm.unitId} onValueChange={v => {
                                        const u = availableUnits.find(x => x.id === v);
                                        setTenantForm({...tenantForm, unitId: v, rentAmount: u?.monthlyRent || 0});
                                    }} disabled={!tenantForm.propertyId}>
                                        <SelectTrigger className="h-11 shadow-sm"><SelectValue placeholder="Assign unit..."/></SelectTrigger>
                                        <SelectContent>
                                            {availableUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitNumber} - {u.type} (Rs.{u.monthlyRent})</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Start Date</Label>
                                        <Input type="date" value={tenantForm.startDate} onChange={e => setTenantForm({...tenantForm, startDate: e.target.value})} className="h-10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">End Date</Label>
                                        <Input type="date" value={tenantForm.endDate} onChange={e => setTenantForm({...tenantForm, endDate: e.target.value})} className="h-10" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 rounded-2xl bg-blue-50/30 border border-blue-100/50 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-blue-900 tracking-widest">Monthly Rent</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-blue-400 text-sm">रु</span>
                                            <Input type="number" value={tenantForm.rentAmount} onChange={e => setTenantForm({...tenantForm, rentAmount: Number(e.target.value)})} className="pl-8 h-11 bg-white border-blue-200 text-lg font-black text-blue-900" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-blue-900 tracking-widest">Security Deposit</Label>
                                        <Input type="number" value={tenantForm.securityDeposit} onChange={e => setTenantForm({...tenantForm, securityDeposit: Number(e.target.value)})} className="h-11 bg-white border-blue-200" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6 pt-2">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-blue-900 tracking-widest">Billing Day</Label>
                                        <Select value={tenantForm.dueDay} onValueChange={v => setTenantForm({...tenantForm, dueDay: v})}>
                                            <SelectTrigger className="bg-white border-blue-200 h-10"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Array.from({length: 28}, (_, i) => String(i+1)).map(d => <SelectItem key={d} value={d}>{d}th of month</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-blue-900 tracking-widest">Billing Cycle</Label>
                                        <Select value={tenantForm.billingCycle} onValueChange={v => setTenantForm({...tenantForm, billingCycle: v})}>
                                            <SelectTrigger className="bg-white border-blue-200 h-10"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Monthly">Monthly</SelectItem>
                                                <SelectItem value="Quarterly">Quarterly</SelectItem>
                                                <SelectItem value="Yearly">Yearly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Rental Obligations Section */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-xl"><Scale className="h-5 w-5 text-emerald-600"/></div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">Financial Obligations</h3>
                                <p className="text-xs text-muted-foreground">Assign responsibility for taxes and utility service charges.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Rental Tax Liability Card */}
                            <Card className="shadow-none border border-gray-100 bg-white">
                                <CardContent className="p-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-muted rounded-lg"><Receipt className="h-5 w-5 text-muted-foreground"/></div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Rental Tax Liability</h4>
                                                <p className="text-[11px] text-muted-foreground">Who is responsible for paying the rental tax?</p>
                                            </div>
                                        </div>
                                        <div className="flex items-end gap-4 w-full md:w-auto">
                                            <div className="space-y-1.5 flex-1 md:w-[200px]">
                                                <Label className="text-[9px] uppercase font-bold text-muted-foreground">Tax Responsibility</Label>
                                                <Select value={tenantForm.taxLiability} onValueChange={v => setTenantForm({...tenantForm, taxLiability: v})}>
                                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Paid by Tenant">Paid by Tenant</SelectItem>
                                                        <SelectItem value="Paid by Owner">Paid by Owner</SelectItem>
                                                        <SelectItem value="Included in Rent">Included in Rent</SelectItem>
                                                        <SelectItem value="Not Applicable">Not Applicable</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {(tenantForm.taxLiability === 'Paid by Tenant' || tenantForm.taxLiability === 'Paid by Owner') && (
                                                <div className="space-y-1.5 w-[120px] animate-in fade-in slide-in-from-right-2">
                                                    <Label className="text-[9px] uppercase font-bold text-muted-foreground">Tax Rate (%)</Label>
                                                    <div className="relative">
                                                        <Input 
                                                          type="number" 
                                                          value={tenantForm.taxRate} 
                                                          onChange={e => setTenantForm({...tenantForm, taxRate: Number(e.target.value)})}
                                                          className="h-9 text-xs pr-7 font-bold" 
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">%</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Utility Charges Grid */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 px-2">
                                    <div className="p-1.5 bg-blue-50 rounded-lg"><Wallet className="h-4 w-4 text-blue-600"/></div>
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900">Monthly Utility & Service Charges</h4>
                                        <p className="text-[11px] text-muted-foreground">Enable utilities and define monthly charges and responsibility.</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {Object.entries(tenantForm.utilities).map(([key, config]) => {
                                        const Icon = {
                                            electricity: Zap,
                                            water: Droplets,
                                            waste: Trash,
                                            internet: Wifi,
                                            parking: Car,
                                            maintenance: Wrench,
                                            security: ShieldCheck,
                                            other: HelpCircle
                                        }[key] || HelpCircle;

                                        const colors = {
                                            electricity: "text-blue-600",
                                            water: "text-cyan-600",
                                            waste: "text-emerald-600",
                                            internet: "text-purple-600",
                                            parking: "text-indigo-600",
                                            maintenance: "text-orange-600",
                                            security: "text-blue-700",
                                            other: "text-gray-600"
                                        }[key] || "text-gray-600";

                                        return (
                                            <Card key={key} className={cn(
                                                "transition-all duration-200 border-2 overflow-hidden",
                                                config.enabled ? "border-primary/40 shadow-md ring-1 ring-primary/10" : "border-transparent bg-muted/40 opacity-70"
                                            )}>
                                                <CardContent className="p-4 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Icon className={cn("h-4 w-4", colors)} />
                                                            <span className="text-[11px] font-black uppercase tracking-tight capitalize">{key}</span>
                                                        </div>
                                                        <Switch 
                                                            checked={config.enabled} 
                                                            onCheckedChange={(v) => updateUtility(key as any, 'enabled', v)}
                                                            className="data-[state=checked]:bg-primary"
                                                        />
                                                    </div>

                                                    <div className={cn("space-y-4 transition-all", !config.enabled && "pointer-events-none")}>
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Responsibility</Label>
                                                            <Select 
                                                                value={config.responsibleParty} 
                                                                onValueChange={v => updateUtility(key as any, 'responsibleParty', v)}
                                                                disabled={!config.enabled}
                                                            >
                                                                <SelectTrigger className="h-8 text-[10px] bg-white"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Tenant">Paid by Tenant</SelectItem>
                                                                    <SelectItem value="Owner">Paid by Owner</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Fixed Monthly Charge (रु)</Label>
                                                            <div className="flex items-center gap-2">
                                                                <Input 
                                                                    type="number" 
                                                                    value={config.fixedCharge} 
                                                                    onChange={e => updateUtility(key as any, 'fixedCharge', Number(e.target.value))}
                                                                    disabled={!config.enabled}
                                                                    className="h-8 text-[11px] font-bold bg-white" 
                                                                />
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <Checkbox 
                                                                        id={`metered-${key}`} 
                                                                        checked={config.isMetered} 
                                                                        onCheckedChange={(v) => updateUtility(key as any, 'isMetered', !!v)}
                                                                        disabled={!config.enabled}
                                                                        className="scale-90"
                                                                    />
                                                                    <Label htmlFor={`metered-${key}`} className="text-[9px] uppercase font-medium cursor-pointer">Metered</Label>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>

                                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center gap-3 text-blue-900">
                                    <Info className="h-4 w-4 shrink-0 text-blue-600"/>
                                    <p className="text-[10px] font-medium italic">Note: Charges marked as <b>"Paid by Tenant"</b> will be automatically aggregated and billed to the tenant during the monthly cycle.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* Special Terms Section */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 rounded-xl"><FileText className="h-5 w-5 text-amber-600"/></div>
                            <h3 className="text-sm font-black uppercase text-gray-900 tracking-wider">Terms & Special Conditions</h3>
                        </div>
                        <Textarea 
                          value={tenantForm.specialTerms} 
                          onChange={e => setTenantForm({...tenantForm, specialTerms: e.target.value})}
                          placeholder="List any unique agreement terms here (e.g. Pets allowed, No smoking, Maintenance cap of Rs. 2000...)" 
                          className="min-h-[120px] text-sm resize-none bg-muted/5 shadow-inner" 
                        />
                    </div>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t p-8 flex justify-end gap-4">
                    <Button variant="outline" onClick={() => setActiveTab('records')} className="px-8 h-11 font-bold text-xs uppercase tracking-widest border-gray-300">Cancel</Button>
                    <Button onClick={handleTenantSubmit} disabled={isSubmitting || !tenantForm.name} className="px-12 h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
                        {editingTenantId ? 'Save & Update' : 'Finalize Onboarding'}
                    </Button>
                </CardFooter>
            </Card>
        </TabsContent>
      </Tabs>

      {/* Tenant Detail Dialog */}
      {selectedTenant && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
                <DialogHeader className="p-6 pb-2 border-b bg-muted/5 shrink-0">
                    <div className="flex items-center gap-4 text-left">
                         <Avatar className="h-14 w-14 border-2 border-primary/10 ring-2 ring-white">
                            <AvatarImage src={selectedTenant.photoURL} />
                            <AvatarFallback className="text-xl font-bold bg-primary/5 text-primary">{selectedTenant.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <DialogTitle className="text-2xl font-black text-gray-900 leading-tight">{selectedTenant.name}</DialogTitle>
                            <DialogDescription className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1 font-medium text-gray-600"><Phone className="h-3 w-3 text-primary"/> {selectedTenant.panNumber || 'No contact'}</span>
                                <span className="flex items-center gap-1 font-medium text-gray-600"><MapPin className="h-3 w-3 text-primary"/> {selectedTenant.address || 'Address unassigned'}</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b bg-muted/5 shrink-0">
                        <TabsList className="bg-transparent h-12 w-full justify-start gap-6">
                            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-bold rounded-none px-0 h-full text-xs uppercase tracking-widest transition-all">Overview</TabsTrigger>
                            <TabsTrigger value="agreement" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-bold rounded-none px-0 h-full text-xs uppercase tracking-widest transition-all">Lease Record</TabsTrigger>
                            <TabsTrigger value="ledger" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-bold rounded-none px-0 h-full text-xs uppercase tracking-widest transition-all">Billing Ledger</TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1 p-6 bg-gray-50/30">
                        <TabsContent value="overview" className="mt-0 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="bg-red-50 border-red-100 shadow-none ring-1 ring-red-200/50">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-red-600 tracking-widest">Outstanding Dues</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-red-700">Rs. {bills.filter(b => b.tenantId === selectedTenant.id && b.status !== 'Paid').reduce((sum, b) => sum + b.amount, 0).toLocaleString()}</p></CardContent>
                                </Card>
                                <Card className="bg-green-50 border-green-100 shadow-none ring-1 ring-green-200/50">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-green-600 tracking-widest">Held Security</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-green-700">Rs. {agreements.find(a => a.tenantId === selectedTenant.id)?.securityDeposit.toLocaleString() || '0'}</p></CardContent>
                                </Card>
                                <Card className="bg-blue-50 border-blue-100 shadow-none ring-1 ring-blue-200/50">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-blue-600 tracking-widest">Current Occupancy</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-blue-700">{agreements.filter(a => a.tenantId === selectedTenant.id && a.status === 'Active').length} Units</p></CardContent>
                                </Card>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                            <ShieldCheck className="h-3 w-3 text-primary"/> Verification & Identity
                                        </h4>
                                    </div>
                                    <div className="p-4 rounded-xl border bg-white shadow-sm space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">ID Document Type</span>
                                            <Badge variant="outline" className="font-bold">{selectedTenant.identityType || 'Not Provided'}</Badge>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">ID Number</span>
                                            <span className="font-mono font-bold tracking-tight">{selectedTenant.documentNumber || '—'}</span>
                                        </div>
                                        <Separator className="border-dashed" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Issue Date</p>
                                                <p className="text-xs font-medium">{selectedTenant.issueDate ? toNepaliDate(selectedTenant.issueDate) : '—'}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground">Expiry Date</p>
                                                <p className={cn(
                                                    "text-xs font-medium",
                                                    selectedTenant.expiryDate && isPast(new Date(selectedTenant.expiryDate)) ? "text-red-600 font-bold" : ""
                                                )}>
                                                    {selectedTenant.expiryDate ? toNepaliDate(selectedTenant.expiryDate) : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                            <Clock className="h-3 w-3 text-primary"/> Recent Invoices
                                        </h4>
                                        <Button variant="link" className="h-auto p-0 text-[10px] font-bold uppercase" asChild>
                                            <Link href="/rental/billing">View All History</Link>
                                        </Button>
                                    </div>
                                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                                        <Table className="text-[10px]">
                                            <TableHeader className="bg-muted/30">
                                                <TableRow className="h-8 hover:bg-transparent">
                                                    <TableHead>Bill Date</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                    <TableHead className="text-center">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {bills.filter(b => b.tenantId === selectedTenant.id).slice(0, 5).map(bill => (
                                                    <TableRow key={bill.id} className="h-10">
                                                        <TableCell className="text-gray-500">{new Date(bill.createdAt).toLocaleDateString()}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold">Rs. {bill.amount.toLocaleString()}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={bill.status === 'Paid' ? 'default' : 'destructive'} className={cn(
                                                                "text-[8px] font-black h-3 px-1.5 py-0 uppercase",
                                                                bill.status === 'Paid' ? "bg-green-600" : ""
                                                            )}>
                                                                {bill.status}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {bills.filter(b => b.tenantId === selectedTenant.id).length === 0 && (
                                                    <TableRow><TableCell colSpan={3} className="h-20 text-center italic text-muted-foreground">No invoices.</TableCell></TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </section>
                            </div>
                        </TabsContent>

                        <TabsContent value="agreement" className="mt-0 space-y-6">
                            {agreements.filter(a => a.tenantId === selectedTenant.id).map(agreement => (
                                <Card key={agreement.id} className="border-l-4 border-l-blue-600 shadow-sm overflow-hidden bg-white">
                                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                                        <div className="space-y-1">
                                            <CardTitle className="text-lg font-black tracking-tight">Unit {agreement.unitNumber} - {agreement.propertyName}</CardTitle>
                                            <CardDescription className="text-[10px] font-bold uppercase tracking-wider">Agreement Key: {agreement.id.substring(0,8).toUpperCase()}</CardDescription>
                                        </div>
                                        <Badge className={cn(
                                            "uppercase font-black text-[10px] px-3",
                                            agreement.status === 'Active' ? "bg-green-600" : "bg-muted text-gray-500"
                                        )}>{agreement.status}</Badge>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y bg-gray-50/50">
                                        <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Monthly Rent</p><p className="font-black text-lg text-gray-900">Rs. {agreement.monthlyRent.toLocaleString()}</p></div>
                                        <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Security Deposit</p><p className="font-black text-lg text-gray-900">Rs. {agreement.securityDeposit.toLocaleString()}</p></div>
                                        <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Billing Cycle</p><p className="font-bold text-gray-900">Every {agreement.billingDate}th</p></div>
                                        <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Valid Until (BS)</p><p className="font-bold text-gray-900">{toNepaliDate(agreement.endDate)}</p></div>
                                    </CardContent>
                                    <CardFooter className="bg-white p-3 border-t">
                                        <Button variant="ghost" size="sm" className="w-full text-[10px] font-bold uppercase tracking-widest hover:bg-blue-50 hover:text-blue-700">
                                            <Download className="mr-2 h-3.5 w-3.5"/> Download Contract PDF
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                            {agreements.filter(a => a.tenantId === selectedTenant.id).length === 0 && (
                                <div className="py-20 text-center border-2 border-dashed rounded-xl">
                                    <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2"/>
                                    <p className="text-muted-foreground">No historical lease data found.</p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="ledger" className="mt-0">
                             <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                                <Table className="text-[11px]">
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="h-10 hover:bg-transparent">
                                            <TableHead className="font-bold">Date (BS)</TableHead>
                                            <TableHead className="font-bold">Narration / Remarks</TableHead>
                                            <TableHead className="text-right font-bold w-[120px]">Debit (Bill)</TableHead>
                                            <TableHead className="text-right font-bold w-[120px]">Credit (Payment)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.filter(t => t.partyId === selectedTenant.id).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(t => (
                                            <TableRow key={t.id} className="h-12">
                                                <TableCell className="text-gray-500 whitespace-nowrap">{toNepaliDate(t.date)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-900">{t.category || t.type}</span>
                                                        <span className="text-[10px] text-muted-foreground italic line-clamp-1">{t.remarks}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-red-500 tabular-nums">
                                                    {t.type === 'Sales' ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-emerald-600 tabular-nums">
                                                    {t.type === 'Receipt' ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                <DialogFooter className="p-6 border-t bg-muted/10 shrink-0">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="h-10 px-6 font-bold text-xs uppercase tracking-widest border-gray-300">Close Profile</Button>
                    <div className="flex gap-2 ml-auto">
                        <Button variant="outline" size="icon" className="h-10 w-10 bg-white"><Printer className="h-4 w-4"/></Button>
                        <Button asChild className="h-10 px-6 font-bold text-xs uppercase tracking-widest shadow-blue-500/20 shadow-lg">
                            <Link href={`/rental/payments?tenantId=${selectedTenant.id}`}>
                                <DollarSign className="mr-2 h-4 w-4"/> New Collection
                            </Link>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

const Info = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
);
