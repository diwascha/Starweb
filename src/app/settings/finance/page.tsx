
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Party, Account, PartyType, AccountType, BankAccountType, AccountOwnership } from '@/lib/types';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useOwnershipScope } from '@/hooks/use-ownership-scope';
import { onPeriodLocksUpdate } from '@/services/payroll/period-lock';
import { setCombinedPeriodLock } from '@/services/period-lock';
import { getAttendanceYears } from '@/services/attendance/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPartiesUpdate, addParty, updateParty, deleteParty, mergeParties } from '@/services/party-service';
import { onAccountsUpdate, addAccount, updateAccount, deleteAccount } from '@/services/account-service';
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
  const { user, hasPermission } = useAuth();
  // Mirrors the Settings permission the admin granted: add / edit / delete
  // each unlock only their own buttons, view alone is read-only.
  const canAdd = hasPermission('settings', 'add');
  const canEdit = hasPermission('settings', 'edit');
  const canDelete = hasPermission('settings', 'delete');
  const { toast } = useToast();
  
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payrollLocks, setPayrollLocks] = useState<Record<string, boolean>>({});
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedLockYear, setSelectedLockYear] = useState<string>('');
  const [selectedLockMonth, setSelectedLockMonth] = useState<string>('');
  
  const { allowedOwnerships, inScope } = useOwnershipScope('finance');

  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address: string, panNumber: string}>({name: '', type: 'Vendor', ownership: '', address: '', panNumber: ''});
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'Cash' as AccountType, ownership: '' as AccountOwnership, accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType | undefined });

  useEffect(() => {
    const unsubs = [
        onPartiesUpdate(setParties),
        onAccountsUpdate(setAccounts),
        // The same lock HR uses (payroll_periods / attendance_periods), which
        // recalculation and purges actually check. This tab used to save a
        // separate `payrollLocks` setting that nothing ever read.
        onPeriodLocksUpdate(locks => setPayrollLocks(Object.fromEntries(locks.map(l => [l.id, l.locked])))),
    ];

    // Bounded probe (one limit(1) read per candidate year) instead of reading
    // the whole payroll collection just to list years.
    getAttendanceYears().then(years => {
        const currentYear = new NepaliDate().getYear();
        const allYears = Array.from(new Set([...(years || []), currentYear])).sort((a,b) => b-a);
        setBsYears(allYears);
        setSelectedLockYear(String(allYears[0] || currentYear));
        setSelectedLockMonth(String(new NepaliDate().getMonth()));
    });

    return () => unsubs.forEach(u => u());
  }, []);

  // Centralized filtering for tables
  const filteredParties = useMemo(() => {
    return parties
        .filter(p => inScope(p.ownership))
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, allowedOwnerships]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => inScope(a.ownership));
  }, [accounts, allowedOwnerships]);

  const handleTogglePayrollLock = async () => {
    if (!selectedLockYear || !selectedLockMonth) return;
    if (!user) return;
    const nextLocked = !payrollLocks[`${selectedLockYear}-${selectedLockMonth}`];
    try {
        await setCombinedPeriodLock(Number(selectedLockYear), Number(selectedLockMonth), nextLocked, user.username);
        toast({ title: `Payroll ${nextLocked ? 'Locked' : 'Unlocked'}` });
    } catch {
        toast({ title: 'Lock Error', variant: 'destructive' });
    }
  };

  const handleAccountSubmit = async () => {
      if(!user) return;
      try {
          const payload = {
              name: accountForm.name,
              type: accountForm.type,
              ownership: accountForm.ownership,
              accountNumber: accountForm.accountNumber,
              bankName: accountForm.bankName,
              branch: accountForm.branch,
              bankAccountType: accountForm.bankAccountType
          };

          if (editingAccount) await updateAccount(editingAccount.id, { ...payload, lastModifiedBy: user.username });
          else await addAccount({ ...payload, createdAt: new Date().toISOString(), createdBy: user.username });
          setIsAccountDialogOpen(false);
          toast({ title: 'Account Saved' });
      } catch {
           toast({ title: 'Error', variant: 'destructive' });
      }
  };

  const handlePartySubmit = async () => {
    if(!user || !partyForm.name) return;
    try {
        const payload = {
            name: partyForm.name,
            type: partyForm.type,
            ownership: partyForm.ownership,
            address: partyForm.address,
            panNumber: partyForm.panNumber
        };

        if (editingParty) await updateParty(editingParty.id, { ...payload, lastModifiedBy: user.username });
        else await addParty({...payload, createdBy: user.username });
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Finance & Ledgers</h1>
            <p className="text-muted-foreground text-sm">Vendors, accounts, and payroll control.</p>
        </header>

        <Tabs defaultValue="parties" className="w-full">
            <TabsList className="bg-muted/50 p-1 mb-6">
                <TabsTrigger value="parties" className="px-6 text-[10px] uppercase font-bold tracking-widest">Vendors & Suppliers</TabsTrigger>
                <TabsTrigger value="accounts" className="px-6 text-[10px] uppercase font-bold tracking-widest">Bank Accounts</TabsTrigger>
                <TabsTrigger value="payroll" className="px-6 text-[10px] uppercase font-bold tracking-widest">Payroll Locks</TabsTrigger>
            </TabsList>

            <TabsContent value="parties" className="animate-in fade-in slide-in-from-left-2">
                <Card className="shadow-sm border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <CardTitle className="text-base font-black uppercase">Partner Registry</CardTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsMergeDialogOpen(true)} disabled={!canEdit} className="h-8 uppercase font-black text-[10px] tracking-widest"><GitMerge className="mr-2 h-3.5 w-3.5"/> Merge Duplicates</Button>
                            <Button size="sm" disabled={!canAdd} onClick={() => { setEditingParty(null); setPartyForm({name:'', type:'Vendor', ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), address: '', panNumber: ''}); setIsPartyDialogOpen(true); }} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Partner</Button>
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
                            {filteredParties.map(party => (
                                <TableRow key={party.id} className="h-12 border-b">
                                    <TableCell className="font-bold pl-6">{party.name}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-[9px] uppercase">{party.type}</Badge></TableCell>
                                    <TableCell><Badge variant="outline" className="text-[9px] uppercase">{party.ownership}</Badge></TableCell>
                                    <TableCell className="text-right pr-6 space-x-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canEdit} onClick={() => { 
                                            setEditingParty(party); 
                                            setPartyForm({
                                                name: party.name || '',
                                                type: party.type || 'Vendor',
                                                ownership: party.ownership || '',
                                                address: party.address || '',
                                                panNumber: party.panNumber || ''
                                            }); 
                                            setIsPartyDialogOpen(true); 
                                        }}><Edit className="h-3.5 w-3.5"/></Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!canDelete}><Trash2 className="h-3.5 w-3.5"/></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Partner Record?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently remove "{party.name}" from the system.
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
                <Card className="shadow-sm border-border bg-card overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                        <CardTitle className="text-base font-black uppercase">Financial Accounts</CardTitle>
                        <Button size="sm" disabled={!canAdd} onClick={() => { setEditingAccount(null); setAccountForm({name:'', type:'Bank', ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), accountNumber:'', bankName:'', branch:'', bankAccountType:'Saving'}); setIsAccountDialogOpen(true); }} className="h-8 uppercase font-black text-[10px] tracking-widest"><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs"><TableHeader className="bg-muted/50"><TableRow><TableHead className="pl-6">Account Name</TableHead><TableHead>Type</TableHead><TableHead>Bank</TableHead><TableHead>Ownership</TableHead><TableHead className="text-right pr-6">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id} className="h-12 border-b">
                                <TableCell className="font-bold pl-6">{acc.name}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[9px] uppercase">{acc.type}</Badge></TableCell>
                                <TableCell className="text-muted-foreground">{acc.bankName || '-'}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[9px] uppercase">{acc.ownership}</Badge></TableCell>
                                <TableCell className="text-right pr-6 space-x-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canEdit} onClick={() => { 
                                        setEditingAccount(acc); 
                                        setAccountForm({
                                            name: acc.name || '',
                                            type: acc.type || 'Cash',
                                            ownership: acc.ownership || '',
                                            accountNumber: acc.accountNumber || '',
                                            bankName: acc.bankName || '',
                                            branch: acc.branch || '',
                                            bankAccountType: acc.bankAccountType || 'Saving'
                                        }); 
                                        setIsAccountDialogOpen(true); 
                                    }}><Edit className="h-3.5 w-3.5" /></Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!canDelete}><Trash2 className="h-3.5 w-3.5"/></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Remove Financial Account?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will delete the account record for "{acc.name}".
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
                <Card className="shadow-sm border-border border-l-4 border-l-amber-500 overflow-hidden">
                    <CardHeader className="bg-amber-50/50 py-4 px-6 border-b">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-amber-600"/>
                            <CardTitle className="text-sm font-black uppercase">Payroll Guardrails</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border-2 border-dashed border-amber-200">
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label><Select value={selectedLockYear} onValueChange={setSelectedLockYear}><SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger><SelectContent>{bsYears.map(y => <SelectItem key={`lock-y-${y}`} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label><Select value={selectedLockMonth} onValueChange={setSelectedLockMonth}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={`lock-m-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                            <Button onClick={handleTogglePayrollLock} disabled={!canAdd || !canEdit} title={!canAdd || !canEdit ? 'Locking needs Settings add and edit permission' : undefined} variant={isCurrentPeriodLocked ? 'destructive' : 'default'} className="h-9 px-8 font-black text-xs uppercase">
                                {isCurrentPeriodLocked ? 'Unlock Period' : 'Lock Cycle'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <MergePartiesDialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen} parties={filteredParties} onMerge={(s, d) => mergeParties(s, d)} />

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
                            {allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
                                    {allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
