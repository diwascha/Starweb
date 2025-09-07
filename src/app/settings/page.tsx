
'use client';

import { useState, useEffect } from 'react';
import type { Party, Account, PartyType, AccountType, UnitOfMeasurement, AppSetting } from '@/lib/types';
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, MoreHorizontal, Search, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onPartiesUpdate, addParty, updateParty, deleteParty } from '@/services/party-service';
import { onAccountsUpdate, addAccount, updateAccount, deleteAccount } from '@/services/account-service';
import { onUomsUpdate, addUom, updateUom, deleteUom } from '@/services/uom-service';
import { onSettingUpdate, setSetting } from '@/services/settings-service';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';


export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Report Prefix State
  const [reportPrefix, setReportPrefix] = useState('');
  const [isSavingPrefix, setIsSavingPrefix] = useState(false);

  // Party Dialog State
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, address?: string, panNumber?: string}>({name: '', type: 'Vendor', address: '', panNumber: ''});

  // Account Dialog State
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'Cash' as AccountType, accountNumber: '', bankName: '', branch: '' });
  
  // UoM Dialog State
  const [isUomDialogOpen, setIsUomDialogOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasurement | null>(null);
  const [uomForm, setUomForm] = useState({ name: '', abbreviation: '' });


  useEffect(() => {
    setIsLoading(true);
    const unsubParties = onPartiesUpdate(setParties);
    const unsubAccounts = onAccountsUpdate(setAccounts);
    const unsubUoms = onUomsUpdate(setUoms);
    const unsubPrefix = onSettingUpdate('reportNumberPrefix', (setting) => {
        setReportPrefix(setting?.value || '2082/083-');
    });

    setIsLoading(false);
    return () => {
        unsubParties();
        unsubAccounts();
        unsubUoms();
        unsubPrefix();
    }
  }, []);
  
  const handleSavePrefix = async () => {
    setIsSavingPrefix(true);
    try {
        await setSetting('reportNumberPrefix', reportPrefix);
        toast({ title: 'Success', description: 'Report number prefix updated.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to save prefix.', variant: 'destructive' });
    } finally {
        setIsSavingPrefix(false);
    }
  };


  // --- Party Management ---
  const openPartyDialog = (party: Party | null = null) => {
    if (party) {
        setEditingParty(party);
        setPartyForm({ name: party.name, type: party.type, address: party.address || '', panNumber: party.panNumber || '' });
    } else {
        setEditingParty(null);
        setPartyForm({ name: '', type: 'Vendor', address: '', panNumber: '' });
    }
    setIsPartyDialogOpen(true);
  };
  
  const handlePartySubmit = async () => {
    if(!user) return;
    if(!partyForm.name || !partyForm.type) {
        toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
        return;
    }
    try {
        if (editingParty) {
            await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
            toast({title: 'Success', description: 'Party updated.'});
        } else {
            await addParty({...partyForm, createdBy: user.username});
            toast({title: 'Success', description: 'New party added.'});
        }
        setIsPartyDialogOpen(false);
    } catch {
         toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
    }
  };

  const handleDeleteParty = async (id: string) => {
      try {
          await deleteParty(id);
          toast({ title: 'Success', description: 'Party deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete party.', variant: 'destructive' });
      }
  };
  
  const filteredParties = parties.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- Account Management ---
  const openAccountDialog = (account: Account | null = null) => {
    if (account) {
        setEditingAccount(account);
        setAccountForm({ name: account.name, type: account.type, accountNumber: account.accountNumber || '', bankName: account.bankName || '', branch: account.branch || '' });
    } else {
        setEditingAccount(null);
        setAccountForm({ name: '', type: 'Cash', accountNumber: '', bankName: '', branch: '' });
    }
    setIsAccountDialogOpen(true);
  };
  
  const handleAccountSubmit = async () => {
      if(!user) return;
      if(!accountForm.name || !accountForm.type) {
          toast({title: 'Error', description: 'Account name and type are required.', variant: 'destructive'});
          return;
      }
       if (accountForm.type === 'Bank' && (!accountForm.bankName || !accountForm.accountNumber)) {
          toast({ title: 'Error', description: 'Bank Name and Account Number are required for bank accounts.', variant: 'destructive' });
          return;
      }
      try {
          if (editingAccount) {
              await updateAccount(editingAccount.id, { ...accountForm, lastModifiedBy: user.username });
              toast({ title: 'Success', description: 'Account updated.' });
          } else {
              await addAccount({ ...accountForm, createdBy: user.username });
              toast({title: 'Success', description: 'New account added.'});
          }
          
          setIsAccountDialogOpen(false);
      } catch {
           toast({title: 'Error', description: 'Failed to add account.', variant: 'destructive'});
      }
  };
  
  const handleDeleteAccount = async (id: string) => {
      try {
          await deleteAccount(id);
          toast({ title: 'Success', description: 'Account deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete account.', variant: 'destructive' });
      }
  };
  
  const filteredAccounts = accounts.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()) || (a.bankName || '').toLowerCase().includes(searchQuery.toLowerCase()));
  
  // --- UoM Management ---
  const openUomDialog = (uom: UnitOfMeasurement | null = null) => {
    if (uom) {
        setEditingUom(uom);
        setUomForm({ name: uom.name, abbreviation: uom.abbreviation });
    } else {
        setEditingUom(null);
        setUomForm({ name: '', abbreviation: '' });
    }
    setIsUomDialogOpen(true);
  };
  
  const handleUomSubmit = async () => {
    if (!user) return;
    if (!uomForm.name || !uomForm.abbreviation) {
        toast({ title: 'Error', description: 'Name and abbreviation are required.', variant: 'destructive' });
        return;
    }
    try {
        if (editingUom) {
            await updateUom(editingUom.id, { ...uomForm, lastModifiedBy: user.username });
            toast({ title: 'Success', description: 'Unit updated.' });
        } else {
            await addUom({ ...uomForm, createdBy: user.username, createdAt: new Date().toISOString() });
            toast({ title: 'Success', description: 'New unit added.' });
        }
        setIsUomDialogOpen(false);
    } catch {
        toast({ title: 'Error', description: 'Failed to save unit.', variant: 'destructive' });
    }
  };
  
  const handleDeleteUom = async (id: string) => {
      try {
          await deleteUom(id);
          toast({ title: 'Success', description: 'Unit deleted.' });
      } catch {
          toast({ title: 'Error', description: 'Failed to delete unit.', variant: 'destructive' });
      }
  };
  
  const filteredUoms = uoms.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.abbreviation.toLowerCase().includes(searchQuery.toLowerCase()));


  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center"><h3 className="text-2xl font-bold tracking-tight">Loading Settings...</h3></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">General Settings</h1>
                <p className="text-muted-foreground">Manage your application's master data.</p>
            </div>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search all settings..." className="pl-8 sm:w-[300px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
        </header>
        
        <Tabs defaultValue="parties">
            <TabsList>
                <TabsTrigger value="parties">Vendors & Suppliers</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="uom">Units of Measurement</TabsTrigger>
                <TabsTrigger value="application">Application</TabsTrigger>
            </TabsList>
            <TabsContent value="parties">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Vendors & Suppliers</CardTitle>
                            <CardDescription>A list of all vendors and suppliers.</CardDescription>
                        </div>
                        <Button onClick={() => openPartyDialog()}><Plus className="mr-2 h-4 w-4" /> Add Party</Button>
                    </CardHeader>
                    <CardContent>
                        <Table><TableHeader><TableRow>
                            <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Address</TableHead><TableHead>PAN</TableHead><TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader><TableBody>
                        {filteredParties.map(party => (
                            <TableRow key={party.id}>
                                <TableCell>{party.name}</TableCell><TableCell>{party.type}</TableCell><TableCell>{party.address}</TableCell><TableCell>{party.panNumber}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => openPartyDialog(party)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the party record.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteParty(party.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                    </DropdownMenuContent></DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="accounts">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Accounts</CardTitle>
                            <CardDescription>A list of all cash and bank accounts.</CardDescription>
                        </div>
                        <Button onClick={() => openAccountDialog()}><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
                    </CardHeader>
                    <CardContent>
                         <Table><TableHeader><TableRow>
                            <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Bank</TableHead><TableHead>Account Number</TableHead><TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader><TableBody>
                        {filteredAccounts.map(acc => (
                            <TableRow key={acc.id}>
                                <TableCell>{acc.name}</TableCell><TableCell>{acc.type}</TableCell><TableCell>{acc.bankName || 'N/A'}</TableCell><TableCell>{acc.accountNumber || 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                     <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => openAccountDialog(acc)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the account record.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAccount(acc.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                    </DropdownMenuContent></DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="uom">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Units of Measurement</CardTitle>
                            <CardDescription>Manage UoMs used across the application.</CardDescription>
                        </div>
                        <Button onClick={() => openUomDialog()}><Plus className="mr-2 h-4 w-4" /> Add Unit</Button>
                    </CardHeader>
                    <CardContent>
                         <Table><TableHeader><TableRow>
                            <TableHead>Name</TableHead><TableHead>Abbreviation</TableHead><TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader><TableBody>
                        {filteredUoms.map(uom => (
                            <TableRow key={uom.id}>
                                <TableCell>{uom.name}</TableCell><TableCell>{uom.abbreviation}</TableCell>
                                <TableCell className="text-right">
                                     <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => openUomDialog(uom)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the unit.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUom(uom.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                                    </DropdownMenuContent></DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="application">
                 <Card>
                    <CardHeader>
                        <CardTitle>Application Settings</CardTitle>
                        <CardDescription>Configure global application settings.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       <div className="space-y-2">
                           <Label htmlFor="report-prefix">Report Number Prefix</Label>
                           <div className="flex items-center gap-2">
                            <Input id="report-prefix" value={reportPrefix} onChange={(e) => setReportPrefix(e.target.value)} className="max-w-xs" />
                            <Button onClick={handleSavePrefix} disabled={isSavingPrefix}>
                                <Save className="mr-2 h-4 w-4" /> Save Prefix
                            </Button>
                           </div>
                           <p className="text-sm text-muted-foreground">This prefix is used for generating new test report serial numbers.</p>
                       </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        
        {/* Party Dialog */}
        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="party-name">Party Name</Label>
                        <Input id="party-name" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="party-type">Party Type</Label>
                        <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                            <SelectTrigger id="party-type"><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Client">Client</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="party-address">Address</Label>
                        <Textarea id="party-address" value={partyForm.address} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="party-pan">PAN Number</Label>
                        <Input id="party-pan" value={partyForm.panNumber} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handlePartySubmit}>{editingParty ? 'Save Changes' : 'Add Party'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        {/* Account Dialog */}
        <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingAccount ? 'Edit Account' : 'Add New Account'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="account-type">Account Type</Label>
                        <Select value={accountForm.type} onValueChange={(v: AccountType) => setAccountForm(p => ({...p, type: v}))}>
                            <SelectTrigger id="account-type"><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="account-name">{accountForm.type === 'Bank' ? 'Account Holder Name' : 'Account Name'}</Label>
                        <Input id="account-name" value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} />
                    </div>
                    {accountForm.type === 'Bank' && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="bank-name">Bank Name</Label>
                                <Input id="bank-name" value={accountForm.bankName} onChange={e => setAccountForm(p => ({...p, bankName: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account-number">Account Number</Label>
                                <Input id="account-number" value={accountForm.accountNumber} onChange={e => setAccountForm(p => ({...p, accountNumber: e.target.value}))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="branch">Branch</Label>
                                <Input id="branch" value={accountForm.branch} onChange={e => setAccountForm(p => ({...p, branch: e.target.value}))} />
                            </div>
                        </>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAccountDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAccountSubmit}>{editingAccount ? 'Save Changes' : 'Add Account'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        {/* UoM Dialog */}
        <Dialog open={isUomDialogOpen} onOpenChange={setIsUomDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingUom ? 'Edit Unit' : 'Add New Unit'}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="uom-name">Unit Name</Label>
                        <Input id="uom-name" value={uomForm.name} onChange={e => setUomForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Kilogram" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="uom-abbr">Abbreviation</Label>
                        <Input id="uom-abbr" value={uomForm.abbreviation} onChange={e => setUomForm(p => ({...p, abbreviation: e.target.value}))} placeholder="e.g. Kg" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsUomDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleUomSubmit}>{editingUom ? 'Save Changes' : 'Add Unit'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
