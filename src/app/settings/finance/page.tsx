'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { 
  Party, 
  Account, 
  PartyType, 
  AccountType, 
  BankAccountType, 
  AccountOwnership,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Edit, 
  Trash2, 
  GitMerge, 
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPartiesUpdate, addParty, updateParty, deleteParty, mergeParties } from '@/services/party-service';
import { onAccountsUpdate, addAccount, updateAccount, deleteAccount } from '@/services/account-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';

function MergePartiesDialog({ open, onOpenChange, parties, onMerge }: { open: boolean, onOpenChange: (open: boolean) => void, parties: Party[], onMerge: (sourceId: string, destinationId: string) => void }) {
    const [sourceId, setSourceId] = useState<string>('');
    const [destinationId, setDestinationId] = useState<string>('');
    const [isMerging, setIsMerging] = useState(false);
    
    const handleMergeClick = async () => {
        setIsMerging(true);
        try {
            await onMerge(sourceId, destinationId);
            onOpenChange(false);
            setSourceId('');
            setDestinationId('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsMerging(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Merge Duplicate Parties</DialogTitle>
                    <DialogDescription>
                        Records will be reassigned and the source party deleted.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Merge this party...</Label>
                        <Select value={sourceId} onValueChange={setSourceId}>
                            <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                            <SelectContent>
                                {parties.filter(p => p.id !== destinationId).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>...into this party</Label>
                         <Select value={destinationId} onValueChange={setDestinationId}>
                            <SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger>
                            <SelectContent>
                                {parties.filter(p => p.id !== sourceId).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={!sourceId || !destinationId || isMerging}>
                                {isMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Merge
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle></AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleMergeClick}>Yes, merge them</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function FinanceSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payrollLocks, setPayrollLocks] = useState<Record<string, boolean>>({});
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedLockYear, setSelectedLockYear] = useState<string>('');
  const [selectedLockMonth, setSelectedLockMonth] = useState<string>('');
  const [ownershipCategories, setOwnershipCategories] = useState<any[]>([]);

  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address?: string, panNumber?: string}>({name: '', type: 'Vendor', ownership: '', address: '', panNumber: ''});
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'Cash' as AccountType, ownership: '' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType | undefined });

  useEffect(() => {
    const unsubs = [
        onPartiesUpdate(setParties),
        onAccountsUpdate(setAccounts),
        onSettingUpdate('payrollLocks', (setting) => setPayrollLocks(setting?.value || {})),
        onSettingUpdate('ownership_categories', (s) => { if (s?.value) setOwnershipCategories(s.value); }),
    ];
    
    import('@/services/payroll-service').then(m => {
        if (typeof m?.getPayrollYears === 'function') {
            m.getPayrollYears().then(years => {
                const currentYear = new NepaliDate().getYear();
                const allYears = Array.from(new Set([...(years || []), currentYear])).sort((a,b) => b-a);
                setBsYears(allYears);
                setSelectedLockYear(String(allYears[0] || currentYear));
                setSelectedLockMonth(String(new NepaliDate().getMonth()));
            });
        }
    });

    return () => unsubs.forEach(u => u());
  }, []);

  const partyOwnershipOptions = useMemo(() => {
    const names = ownershipCategories.map(c => typeof c === 'string' ? c : c.name);
    const defaults = ['Sijan', 'Shivam', 'Both', 'Rental'];
    const combined = Array.from(new Set([...names, ...defaults]));
    if (partyForm.ownership && !combined.includes(partyForm.ownership)) {
        combined.push(partyForm.ownership);
    }
    return combined.sort();
  }, [ownershipCategories, partyForm.ownership]);

  const accountOwnershipOptions = useMemo(() => {
    const names = ownershipCategories.map(c => typeof c === 'string' ? c : c.name);
    const defaults = ['Sijan', 'Shivam', 'Both', 'Rental'];
    const combined = Array.from(new Set([...names, ...defaults]));
    if (accountForm.ownership && !combined.includes(accountForm.ownership)) {
        combined.push(accountForm.ownership);
    }
    return combined.sort();
  }, [ownershipCategories, accountForm.ownership]);

  const handleTogglePayrollLock = async () => {
    if (!selectedLockYear || !selectedLockMonth) return;
    const lockKey = `${selectedLockYear}-${selectedLockMonth}`;
    const newLocks = { ...payrollLocks, [lockKey]: !payrollLocks[lockKey] };
    try {
        await setSetting('payrollLocks', newLocks);
        toast({ title: `Payroll ${newLocks[lockKey] ? 'Locked' : 'Unlocked'}` });
    } catch {
        toast({ title: 'Lock Error', variant: 'destructive' });
    }
  };

  const handleAccountSubmit = async () => {
      if(!user) return;
      try {
          const { id, ...data } = accountForm as any;
          if (editingAccount) await updateAccount(editingAccount.id, { ...data, lastModifiedBy: user.username });
          else await addAccount({ ...data, createdAt: new Date().toISOString(), createdBy: user.username });
          setIsAccountDialogOpen(false);
          toast({ title: 'Account Saved' });
      } catch {
           toast({ title: 'Error', variant: 'destructive' });
      }
  };

  const handlePartySubmit = async () => {
    if(!user || !partyForm.name) return;
    try {
        const { id, ...data } = partyForm as any;
        if (editingParty) await updateParty(editingParty.id, { ...data, lastModifiedBy: user.username });
        else await addParty({...data, createdBy: user.username });
        setIsPartyDialogOpen(false);
        toast({ title: 'Partner Record Saved' });
    } catch {
         toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const isCurrentPeriodLocked = payrollLocks[`${selectedLockYear}-${selectedLockMonth}`] || false;

  return (
    <div className="flex flex-col gap-8">
        <header>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Finance & Ledgers</h1>
            <p className="text-muted-foreground text-sm">Vendors, accounts, and payroll control.</p>
        </header>

        <Tabs defaultValue="parties" className="w-full">
            <TabsList className="bg-muted/50 p-1 mb-6">
                <TabsTrigger value="parties" className="px-6 text-[10px] uppercase font-bold tracking-widest">Vendors & Suppliers</TabsTrigger>
                <TabsTrigger value="accounts" className="px-6 text-[10px] uppercase font-bold tracking-widest">Bank Accounts</TabsTrigger>
                <TabsTrigger value="payroll" className="px-6 text-[10px] uppercase font-bold tracking-widest">Payroll Locks</TabsTrigger>
            </TabsList>

            <TabsContent value="parties" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <CardTitle className="text-base font-black uppercase">Partner Registry</CardTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsMergeDialogOpen(true)} className="h-8 uppercase font-black text-[10px] tracking-widest"><GitMerge className="mr-2 h-3.5 w-3.5"/> Merge Duplicates</Button>
                            <Button size="sm" onClick={() => { setEditingParty(null); setPartyForm({name:'', type:'Vendor', ownership:''}); setIsPartyDialogOpen(true); }} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Partner</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6">Entity Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Ownership</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {parties.sort((a,b) => a.name.localeCompare(b.name)).map(party => (
                                <TableRow key={party.id} className="h-12 border-b">
                                    <TableCell className="font-bold pl-6">{party.name}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-[9px] uppercase">{party.type}</Badge></TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase">{party.ownership}</Badge></TableCell>
                                    <TableCell className="text-right pr-6 space-x-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingParty(party); setPartyForm(party as any); setIsPartyDialogOpen(true); }}><Edit className="h-3.5 w-3.5"/></Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Partner Record?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently remove "{party.name}" from the system. Associated transaction history will remain but the partner reference will be orphaned.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteParty(party.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))}</TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="accounts" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <CardTitle className="text-base font-black uppercase">Financial Accounts</CardTitle>
                        <Button size="sm" onClick={() => { setEditingAccount(null); setAccountForm({name:'', type:'Bank', ownership:'', accountNumber:'', bankName:'', branch:'', bankAccountType:'Saving'}); setIsAccountDialogOpen(true); }} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6">Account Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Bank</TableHead>
                                    <TableHead>Ownership</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {accounts.map(acc => (
                                <TableRow key={acc.id} className="h-12 border-b">
                                    <TableCell className="font-bold pl-6">{acc.name}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase">{acc.type}</Badge></TableCell>
                                    <TableCell className="text-muted-foreground">{acc.bankName || '-'}</TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase">{acc.ownership}</Badge></TableCell>
                                    <TableCell className="text-right pr-6 space-x-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingAccount(acc); setAccountForm(acc as any); setIsAccountDialogOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Financial Account?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will delete the account record for "{acc.name}". Ensure all balances are zeroed or reassigned.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteAccount(acc.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))}</TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="payroll" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-gray-100 border-l-4 border-l-amber-500 overflow-hidden">
                    <CardHeader className="bg-amber-50/50 py-4 px-6 border-b">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-amber-600"/>
                            <CardTitle className="text-sm font-black uppercase">Payroll Guardrails</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border-2 border-dashed border-amber-200">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label><Select value={selectedLockYear} onValueChange={setSelectedLockYear}><SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger><SelectContent>{bsYears.map(y => <SelectItem key={`lock-y-${y}`} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label><Select value={selectedLockMonth} onValueChange={setSelectedLockMonth}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={`lock-m-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                            <Button onClick={handleTogglePayrollLock} variant={isCurrentPeriodLocked ? 'destructive' : 'default'} className="h-9 px-8 font-black text-xs uppercase">
                                {isCurrentPeriodLocked ? 'Unlock Period' : 'Lock Cycle'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <MergePartiesDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} parties={parties} onMerge={(s, d) => mergeParties(s, d)} />

        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingParty ? 'Edit Partner' : 'New Partner'}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={partyForm.type} onValueChange={(v: any) => setPartyForm({...partyForm, type: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Vendor">Vendor</SelectItem>
                            <SelectItem value="Customer">Customer</SelectItem>
                            <SelectItem value="Both">Both</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Ownership</Label>
                    <Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm({...partyForm, ownership: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Ownership" /></SelectTrigger>
                        <SelectContent>
                            {partyOwnershipOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={handlePartySubmit} className="w-full">Save Partner</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2"><Label>Account Name</Label><Input value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={accountForm.type} onValueChange={(v: any) => setAccountForm({...accountForm, type: v})}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Cash">Cash</SelectItem>
                                    <SelectItem value="Bank">Bank</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Ownership</Label>
                            <Select value={accountForm.ownership} onValueChange={(v: any) => setAccountForm({...accountForm, ownership: v})}>
                                <SelectTrigger><SelectValue placeholder="Select Ownership" /></SelectTrigger>
                                <SelectContent>
                                    {accountOwnershipOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <DialogFooter><Button onClick={handleAccountSubmit} className="w-full">Save Account</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
