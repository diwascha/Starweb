'use client';

import { useState, useEffect, useMemo } from 'react';
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
  CheckCircle2, 
  AlertCircle, 
  History, 
  ArrowRight,
  ShieldCheck,
  Building2,
  Download,
  Edit
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
import { onPartiesUpdate } from '@/services/party-service';
import { onAgreementsUpdate } from '@/services/agreement-service';
import { onTransactionsUpdate } from '@/services/transaction-service';
import { onRentalBillsUpdate } from '@/services/rental-billing-service';
import type { Party, RentalAgreement, Transaction, RentalBill } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import Link from 'next/link';

export default function TenantsPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [tenants, setTenants] = useState<Party[]>([]);
  const [agreements, setAgreements] = useState<RentalAgreement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<RentalBill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Party | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const unsubs = [
        onPartiesUpdate((data) => setTenants(data.filter(p => p.type === 'Tenant' || p.type === 'Both'))),
        onAgreementsUpdate(setAgreements),
        onTransactionsUpdate(setTransactions),
        onRentalBillsUpdate(setBills)
    ];
    setIsLoading(false);
    return () => unsubs.forEach(u => u());
  }, []);

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

  const filteredTenants = tenantSummaries.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.address || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDetail = (tenant: Party) => {
    setSelectedTenant(tenant);
    setIsDetailOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tenant Directory</h1>
          <p className="text-muted-foreground">Manage your client relationships and occupancy details.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search name or location..." 
                    className="pl-8 w-full md:w-[300px]" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            {hasPermission('rental', 'create') && (
                <Button asChild>
                    <Link href="/settings?tab=parties">
                        <Plus className="mr-2 h-4 w-4"/> Add Tenant
                    </Link>
                </Button>
            )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTenants.map(tenant => (
            <Card key={tenant.id} className="group hover:shadow-lg transition-all cursor-pointer border-muted-foreground/10" onClick={() => handleOpenDetail(tenant)}>
                <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                            <AvatarImage src={tenant.photoURL} />
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {tenant.name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleOpenDetail(tenant)}><Eye className="mr-2 h-4 w-4"/> View Profile</DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href={`/rental/payments?tenantId=${tenant.id}`}><DollarSign className="mr-2 h-4 w-4"/> Collect Rent</Link></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild><Link href={`/settings?tab=parties`}><Edit className="mr-2 h-4 w-4"/> Edit Contact</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="space-y-1 mt-2">
                        <CardTitle className="text-lg truncate">{tenant.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 text-xs truncate">
                            <MapPin className="h-3 w-3"/> {tenant.address || 'No address provided'}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Current Unit</span>
                            <Badge variant={tenant.activeLease ? 'default' : 'outline'} className={cn(tenant.activeLease ? 'bg-blue-600' : '')}>
                                {tenant.activeLease ? `Unit ${tenant.activeLease.unitNumber}` : 'Unassigned'}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Outstanding</span>
                            <span className={cn("font-bold", tenant.outstandingBalance > 0 ? "text-red-600" : "text-green-600")}>
                                Rs. {tenant.outstandingBalance.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" className="w-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        Profile Details <ArrowRight className="ml-2 h-3 w-3"/>
                    </Button>
                </CardContent>
            </Card>
        ))}
        {filteredTenants.length === 0 && !isLoading && (
            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4"/>
                <p className="text-muted-foreground">No tenants found matching your search.</p>
            </div>
        )}
      </div>

      {selectedTenant && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2 border-b bg-muted/5">
                    <div className="flex items-center gap-4">
                         <Avatar className="h-14 w-14 border-2 border-primary/10">
                            <AvatarImage src={selectedTenant.photoURL} />
                            <AvatarFallback className="text-xl font-bold">{selectedTenant.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <DialogTitle className="text-2xl font-black">{selectedTenant.name}</DialogTitle>
                            <DialogDescription className="flex items-center gap-3">
                                <span className="flex items-center gap-1"><Phone className="h-3 w-3"/> {selectedTenant.panNumber || 'No contact'}</span>
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/> {selectedTenant.address}</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
                    <div className="px-6 border-b bg-muted/5">
                        <TabsList className="bg-transparent h-12 w-full justify-start gap-4">
                            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Overview</TabsTrigger>
                            <TabsTrigger value="agreement" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Agreement</TabsTrigger>
                            <TabsTrigger value="ledger" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Ledger</TabsTrigger>
                            <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Documents</TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1 p-6">
                        <TabsContent value="overview" className="mt-0 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="bg-red-50 border-red-100 shadow-none">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-red-600 tracking-widest">Total Outstanding</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-red-700">Rs. {bills.filter(b => b.tenantId === selectedTenant.id && b.status !== 'Paid').reduce((sum, b) => sum + b.amount, 0).toLocaleString()}</p></CardContent>
                                </Card>
                                <Card className="bg-green-50 border-green-100 shadow-none">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-green-600 tracking-widest">Security Deposit</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-green-700">Rs. {agreements.find(a => a.tenantId === selectedTenant.id)?.securityDeposit.toLocaleString() || '0'}</p></CardContent>
                                </Card>
                                <Card className="bg-blue-50 border-blue-100 shadow-none">
                                    <CardHeader className="py-3 px-4"><CardTitle className="text-[10px] uppercase font-bold text-blue-600 tracking-widest">Active Units</CardTitle></CardHeader>
                                    <CardContent className="px-4 pb-4"><p className="text-2xl font-black text-blue-700">{agreements.filter(a => a.tenantId === selectedTenant.id && a.status === 'Active').length}</p></CardContent>
                                </Card>
                            </div>

                            <section className="space-y-4">
                                <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-4 w-4"/> Recent Billing
                                </h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Bill Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Period</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {bills.filter(b => b.tenantId === selectedTenant.id).slice(0, 5).map(bill => (
                                            <TableRow key={bill.id}>
                                                <TableCell className="text-xs">{new Date(bill.createdAt).toLocaleDateString()}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-[10px]">{bill.type}</Badge></TableCell>
                                                <TableCell className="text-xs uppercase">{NEPALI_MONTHS[bill.billingMonth].name} {bill.billingYear}</TableCell>
                                                <TableCell className="text-right font-mono">Rs. {bill.amount.toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <Badge variant={bill.status === 'Paid' ? 'default' : 'destructive'} className={bill.status === 'Paid' ? 'bg-green-600' : ''}>
                                                        {bill.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </section>
                        </TabsContent>

                        <TabsContent value="agreement" className="mt-0 space-y-6">
                            {agreements.filter(a => a.tenantId === selectedTenant.id).map(agreement => (
                                <Card key={agreement.id} className="border-l-4 border-l-blue-600">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div className="space-y-1">
                                            <CardTitle className="text-lg">Unit {agreement.unitNumber} - {agreement.propertyName}</CardTitle>
                                            <CardDescription>Activated on {new Date(agreement.createdAt).toLocaleDateString()}</CardDescription>
                                        </div>
                                        <Badge className={cn(agreement.status === 'Active' ? "bg-green-600" : "bg-muted")}>{agreement.status}</Badge>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-t bg-muted/5">
                                        <div><Label className="text-[10px] uppercase font-bold text-muted-foreground">Monthly Rent</Label><p className="font-black text-lg">Rs. {agreement.monthlyRent.toLocaleString()}</p></div>
                                        <div><Label className="text-[10px] uppercase font-bold text-muted-foreground">Security Deposit</Label><p className="font-black text-lg">Rs. {agreement.securityDeposit.toLocaleString()}</p></div>
                                        <div><Label className="text-[10px] uppercase font-bold text-muted-foreground">Billing Date</Label><p className="font-bold">Every {agreement.billingDate}th</p></div>
                                        <div><Label className="text-[10px] uppercase font-bold text-muted-foreground">Lease End</Label><p className="font-bold">{toNepaliDate(agreement.endDate)}</p></div>
                                    </CardContent>
                                    <CardFooter className="bg-muted/5 pt-0">
                                        <Button variant="outline" size="sm" className="w-full">Download Contract PDF</Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </TabsContent>

                        <TabsContent value="ledger" className="mt-0">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date (BS)</TableHead>
                                        <TableHead>Narration</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.filter(t => t.partyId === selectedTenant.id).map(t => (
                                        <TableRow key={t.id}>
                                            <TableCell className="text-xs">{toNepaliDate(t.date)}</TableCell>
                                            <TableCell className="text-xs">
                                                <p className="font-bold">{t.category || t.type}</p>
                                                <p className="text-muted-foreground italic">{t.remarks}</p>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{t.type === 'Sales' ? t.amount.toLocaleString() : '-'}</TableCell>
                                            <TableCell className="text-right font-mono text-green-600">{t.type === 'Receipt' ? t.amount.toLocaleString() : '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>

                        <TabsContent value="documents" className="mt-0 flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <ShieldCheck className="h-12 w-12 mb-4 opacity-20"/>
                            <p>Document vault feature coming soon.</p>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                <DialogFooter className="p-6 border-t bg-muted/10">
                    <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close Window</Button>
                    <div className="flex gap-2 ml-auto">
                        <Button variant="outline" size="icon"><Download className="h-4 w-4"/></Button>
                        <Button variant="outline" size="icon"><Printer className="h-4 w-4"/></Button>
                        <Button asChild>
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

const NEPALI_MONTHS = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];
