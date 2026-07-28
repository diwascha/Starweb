'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon,
  ChevronsUpDown,
  Check,
  PlusCircle,
  Save,
  Loader2,
  Trash2,
  Plus,
  X,
  Scale,
} from 'lucide-react';
import { cn, toWords, generateNextVoucherNumber, toNepaliDate, generateId } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import type { Party, PartyType, Cheque, ChequeSplit, ChequeStatus, Account, BankAccountType, AccountOwnership } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addCheque, onChequesUpdate, updateCheque } from '@/services/cheque-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { onAccountsUpdate, addAccount as addAccountService } from '@/services/account-service';

interface ChequeGeneratorFormProps {
  chequeToEdit?: Cheque | null;
  onSaveSuccess: () => void;
}

/** Half a paisa — tolerance for float money comparisons. */
const EPS = 0.005;

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Split a total across n cheques in paisa so the parts always add back up to
 * the total exactly. Plain `total / n` leaves float dust and `total % n` only
 * works when the total is a whole number.
 */
function distributeEvenly(total: number, n: number): number[] {
  if (!total || total <= 0 || n <= 0) return Array.from({ length: Math.max(0, n) }, () => 0);
  const totalPaisa = Math.round(total * 100);
  const base = Math.floor(totalPaisa / n);
  const remainder = totalPaisa - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

export function ChequeGeneratorForm({ chequeToEdit, onSaveSuccess }: ChequeGeneratorFormProps) {
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyOwnership, setPartyOwnership] = useState<string>('Both');

  const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
  const [numberOfSplits, setNumberOfSplits] = useState<number>(1);
  const [chequeSplits, setChequeSplits] = useState<ChequeSplit[]>([]);

  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [voucherNo, setVoucherNo] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{
    name: string;
    type: PartyType;
    ownership: AccountOwnership | '';
    address?: string;
    panNumber?: string;
  }>({ name: '', type: 'Vendor', ownership: '', address: '', panNumber: '' });
  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'Bank' as 'Cash' | 'Bank',
    ownership: '' as AccountOwnership | '',
    accountNumber: '',
    bankName: '',
    branch: '',
    bankAccountType: 'Saving' as BankAccountType,
  });
  const [partySearch, setPartySearch] = useState('');
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);

  const { toast } = useToast();
  const { user, getAllowedOwnerships } = useAuth();
  const allowedOwnerships = useMemo(() => getAllowedOwnerships('finance'), [getAllowedOwnerships]);

  /**
   * Set while loading an existing voucher. The recompute effects below check
   * this and bail out — without it they immediately re-split the total evenly
   * and destroy saved uneven amounts (40k/30k/30k → 33,334/33,333/33,333).
   */
  const isHydrating = useRef(false);
  const voucherRequested = useRef(false);

  // ---------------------------------------------------------------- data
  useEffect(() => {
    const unsubs = [onPartiesUpdate(setParties), onChequesUpdate(setCheques as any), onAccountsUpdate(setAccounts)];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ------------------------------------------------- hydrate / new voucher
  // Depends on chequeToEdit ONLY. It used to also depend on `cheques`, which
  // re-fires on every Firestore snapshot and silently reverted in-progress edits.
  useEffect(() => {
    if (!chequeToEdit) {
      isHydrating.current = true;
      setChequeSplits([
        {
          id: generateId(),
          chequeDate: new Date(),
          chequeNumber: '',
          amount: '',
          remarks: '',
          interval: 0,
          status: 'Due',
          partialPayments: [],
        } as unknown as ChequeSplit,
      ]);
      return;
    }

    isHydrating.current = true;

    setVoucherNo(chequeToEdit.voucherNo);
    setPaymentDate(new Date(chequeToEdit.paymentDate));
    setInvoiceDate(chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : undefined);
    setInvoiceNumber(chequeToEdit.invoiceNumber || '');
    setPartyName(chequeToEdit.partyName || chequeToEdit.payeeName || '');
    setPartyOwnership(chequeToEdit.ownership || 'Both');
    setInvoiceAmount(chequeToEdit.amount);
    setNumberOfSplits(chequeToEdit.splits.length || 1);
    setSelectedAccountId(chequeToEdit.accountId);

    const baseDate = chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : new Date(chequeToEdit.paymentDate);

    setChequeSplits(
      chequeToEdit.splits.map((s) => {
        const splitDate = new Date(s.chequeDate);
        const interval = Math.round((splitDate.getTime() - baseDate.getTime()) / (1000 * 3600 * 24));
        return {
          id: s.id || generateId(),
          chequeDate: splitDate,
          chequeNumber: s.chequeNumber || '',
          amount: s.amount === 0 ? '' : s.amount,
          remarks: s.remarks || '',
          interval: interval >= 0 ? interval : 0,
          status: s.status || 'Due',
          partialPayments: s.partialPayments || [],
          cancellationReason: s.cancellationReason || '',
        } as unknown as ChequeSplit;
      })
    );
  }, [chequeToEdit]);

  // Generate the next voucher number once, after the cheque list first loads.
  useEffect(() => {
    if (chequeToEdit || voucherRequested.current || cheques.length === 0) return;
    voucherRequested.current = true;
    generateNextVoucherNumber(cheques, 'PDC-').then(setVoucherNo);
  }, [cheques, chequeToEdit]);

  // ------------------------------------------- resize + redistribute amounts
  // Fires only when the split count or the invoice total changes.
  useEffect(() => {
    if (isHydrating.current) return;

    const total = Number(invoiceAmount) || 0;
    const n = Math.max(1, numberOfSplits || 1);
    const amounts = distributeEvenly(total, n);
    const baseDate = invoiceDate || paymentDate;

    setChequeSplits((prev) =>
      Array.from({ length: n }, (_, i) => {
        const existing = (prev[i] || {}) as any;
        const intervalDays = Number(existing.interval) || 0;
        return {
          id: existing.id || generateId(),
          chequeDate: existing.chequeDate || addDays(baseDate, intervalDays),
          chequeNumber: existing.chequeNumber || '',
          amount: total > 0 ? amounts[i] : '',
          remarks: existing.remarks || '',
          interval: intervalDays,
          status: (existing.status || 'Due') as ChequeStatus,
          partialPayments: existing.partialPayments || [],
          cancellationReason: existing.cancellationReason || '',
        } as unknown as ChequeSplit;
      })
    );
    // paymentDate / invoiceDate deliberately excluded — handled below, so that
    // changing a date doesn't wipe manually entered per-cheque amounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberOfSplits, invoiceAmount]);

  // ---------------------------------------- recompute dates from the interval
  useEffect(() => {
    if (isHydrating.current) return;

    const baseDate = invoiceDate || paymentDate;
    setChequeSplits((prev) =>
      prev.map((s) => ({ ...s, chequeDate: addDays(baseDate, Number((s as any).interval) || 0) }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentDate, invoiceDate]);

  // Runs last (declaration order), releasing the guard for the user's own edits.
  useEffect(() => {
    isHydrating.current = false;
  }, [chequeToEdit]);

  // ---------------------------------------------------------------- derived
  const filteredParties = useMemo(
    () =>
      parties
        .filter((p) => p.ownership === 'Both' || allowedOwnerships.includes(p.ownership))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties, allowedOwnerships]
  );

  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'Bank' && (a.ownership === 'Both' || allowedOwnerships.includes(a.ownership))),
    [accounts, allowedOwnerships]
  );

  const totalSplitAmount = useMemo(
    () => chequeSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    [chequeSplits]
  );

  const remainingAmount = useMemo(
    () => (Number(invoiceAmount) || 0) - totalSplitAmount,
    [invoiceAmount, totalSplitAmount]
  );

  const isBalanced = Math.abs(remainingAmount) < EPS;

  const amountInWords = useMemo(() => {
    const total = Number(invoiceAmount) || 0;
    if (total <= 0) return 'Zero Only.';
    return toWords(total);
  }, [invoiceAmount]);

  // ---------------------------------------------------------------- actions
  const handlePartySelect = (selectedPartyName: string) => {
    const party = filteredParties.find((c) => c.name === selectedPartyName);
    setPartyName(party?.name || selectedPartyName);
    setPartyOwnership(party?.ownership || 'Both');
    setIsPartyPopoverOpen(false);
  };

  const handleOpenPartyDialog = (party: Party | null = null, searchName = '') => {
    if (party) {
      setEditingParty(party);
      setPartyForm({
        name: party.name,
        type: party.type,
        ownership: party.ownership || '',
        address: party.address || '',
        panNumber: party.panNumber || '',
      });
    } else {
      setEditingParty(null);
      setPartyForm({
        name: searchName,
        type: 'Vendor',
        ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'),
        address: '',
        panNumber: '',
      });
    }
    setIsPartyPopoverOpen(false);
    setIsPartyDialogOpen(true);
  };

  const handleSubmitParty = async () => {
    if (!user) return;
    if (!partyForm.name.trim() || !partyForm.type || !partyForm.ownership) {
      toast({ title: 'Missing details', description: 'Name, type and ownership are required.', variant: 'destructive' });
      return;
    }
    try {
      if (editingParty) {
        await updateParty(editingParty.id, { ...(partyForm as any), lastModifiedBy: user.username });
        toast({ title: 'Party updated' });
      } else {
        await addParty({ ...(partyForm as any), createdBy: user.username });
        toast({ title: 'Party added' });
      }
      handlePartySelect(partyForm.name.trim());
      setIsPartyDialogOpen(false);
      setPartyForm({ name: '', type: 'Vendor', ownership: '', address: '', panNumber: '' });
      setEditingParty(null);
    } catch {
      toast({ title: 'Save failed', description: 'The party was not saved.', variant: 'destructive' });
    }
  };

  const handleAccountSubmit = async () => {
    if (!user) return;
    if (!accountForm.bankName.trim() || !accountForm.accountNumber.trim() || !accountForm.ownership) {
      toast({ title: 'Missing details', description: 'Bank name, account number and ownership are required.', variant: 'destructive' });
      return;
    }
    try {
      const newAccountId = await addAccountService({
        ...(accountForm as any),
        name: accountForm.name || `${accountForm.bankName} - ${accountForm.accountNumber}`,
        type: 'Bank',
        createdBy: user.username,
        createdAt: new Date().toISOString(),
      });
      setSelectedAccountId(newAccountId);
      toast({ title: 'Bank account added' });
      setIsAccountDialogOpen(false);
    } catch {
      toast({ title: 'Save failed', description: 'The bank account was not added.', variant: 'destructive' });
    }
  };

  const handleSplitChange = (index: number, field: keyof ChequeSplit | 'interval', value: any) => {
    setChequeSplits((prev) => {
      const next = [...prev];
      const row = { ...(next[index] as any) };

      if (field === 'amount') {
        row.amount = value === '' ? '' : parseFloat(value);
      } else if (field === 'interval') {
        const days = Number(value) || 0;
        row.interval = value === '' ? '' : days;
        row.chequeDate = addDays(invoiceDate || paymentDate, days);
      } else if (field === 'chequeDate') {
        row.chequeDate = value;
        const base = invoiceDate || paymentDate;
        row.interval = Math.round((value.getTime() - base.getTime()) / (1000 * 3600 * 24));
      } else {
        row[field] = value;
      }

      next[index] = row;
      return next;
    });
  };

  const handleRedistribute = () => {
    const amounts = distributeEvenly(Number(invoiceAmount) || 0, chequeSplits.length);
    setChequeSplits((prev) => prev.map((s, i) => ({ ...s, amount: amounts[i] } as ChequeSplit)));
  };

  const handleAddSplit = () => setNumberOfSplits((n) => n + 1);

  const handleRemoveSplit = (index: number) => {
    setChequeSplits((prev) => prev.filter((_, i) => i !== index));
    setNumberOfSplits((n) => Math.max(1, n - 1));
  };

  const handleSave = async () => {
    if (!user) return;

    if (!partyName || !invoiceAmount || Number(invoiceAmount) <= 0) {
      toast({ title: 'Missing details', description: 'Choose a party and enter an invoice amount.', variant: 'destructive' });
      return;
    }
    if (!isBalanced) {
      toast({
        title: 'Splits do not balance',
        description: `The cheques add up to Rs. ${money(totalSplitAmount)}. Adjust by Rs. ${money(Math.abs(remainingAmount))}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const chequeData: Omit<Cheque, 'id' | 'createdAt'> = {
        paymentDate: paymentDate.toISOString(),
        voucherNo,
        invoiceDate: invoiceDate?.toISOString(),
        invoiceNumber,
        partyName,
        payeeName: partyName,
        amount: Number(invoiceAmount),
        amountInWords,
        accountId: selectedAccountId,
        ownership: partyOwnership,
        splits: chequeSplits.map((s: any) => ({
          id: s.id,
          chequeDate: (s.chequeDate as Date).toISOString(),
          chequeNumber: s.chequeNumber || '',
          amount: Number(s.amount) || 0,
          remarks: s.remarks || '',
          // Preserve settlement state on edit — never reset it here.
          status: (s.status || 'Due') as ChequeStatus,
          partialPayments: s.partialPayments || [],
          cancellationReason: s.cancellationReason || '',
        })),
        createdBy: chequeToEdit?.createdBy || user.username,
      } as Omit<Cheque, 'id' | 'createdAt'>;

      if (chequeToEdit) {
        await updateCheque(chequeToEdit.id, { ...(chequeData as any), lastModifiedBy: user.username });
        toast({ title: 'Voucher updated' });
      } else {
        await addCheque(chequeData);
        toast({ title: 'Voucher saved' });
      }
      onSaveSuccess();
    } catch {
      toast({ title: 'Save failed', description: 'The voucher was not saved.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <Label htmlFor="voucherNo">Voucher number</Label>
          <Input id="voucherNo" value={voucherNo} readOnly className="bg-muted/50" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentDate">Voucher date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button id="paymentDate" variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {paymentDate ? `${toNepaliDate(paymentDate.toISOString())} (${format(paymentDate, 'PPP')})` : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <DualCalendar selected={paymentDate} onSelect={(d) => d && setPaymentDate(d)} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoiceDate">Invoice date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button id="invoiceDate" variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {invoiceDate ? `${toNepaliDate(invoiceDate.toISOString())} (${format(invoiceDate, 'PPP')})` : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <DualCalendar selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">Invoice number</Label>
          <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="party-name">Party</Label>
          <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
            <PopoverTrigger asChild>
              <Button id="party-name" variant="outline" role="combobox" className="w-full justify-between">
                {partyName || 'Select a party'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
              <Command>
                <CommandInput placeholder="Search party..." value={partySearch} onValueChange={setPartySearch} />
                <CommandList>
                  <CommandEmpty>
                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, partySearch)}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add &ldquo;{partySearch}&rdquo;
                    </Button>
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredParties.map((c) => (
                      <CommandItem key={c.id} value={c.name} onSelect={() => handlePartySelect(c.name)}>
                        <Check className={cn('mr-2 h-4 w-4', partyName === c.name ? 'opacity-100' : 'opacity-0')} />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoiceAmount">Invoice amount (NPR)</Label>
          <Input
            id="invoiceAmount"
            type="number"
            step="0.01"
            min="0"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="numberOfSplits">Number of cheques</Label>
          <Input
            id="numberOfSplits"
            type="number"
            min="1"
            value={numberOfSplits}
            onChange={(e) => setNumberOfSplits(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bankAccount">Bank account</Label>
          <div className="flex gap-2">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger id="bankAccount">
                <SelectValue placeholder="Select a bank account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash payment</SelectItem>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bankName} - {account.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add bank account"
              onClick={() => {
                setAccountForm({
                  name: '',
                  type: 'Bank',
                  ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'),
                  accountNumber: '',
                  bankName: '',
                  branch: '',
                  bankAccountType: 'Saving',
                });
                setIsAccountDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------------ split table ------------------------------ */}
      <div className="border rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <div>
            <h3 className="text-sm font-bold">Cheque schedule</h3>
            <p className="text-[11px] text-muted-foreground">
              Interval is counted from the invoice date, or the voucher date if no invoice date is set.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRedistribute} className="h-8 text-xs">
              <Scale className="mr-1.5 h-3.5 w-3.5" /> Split evenly
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddSplit} className="h-8 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add cheque
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Interval (days)</TableHead>
              <TableHead className="w-[210px]">Cheque date</TableHead>
              <TableHead>Cheque number</TableHead>
              <TableHead className="w-[150px]">Amount (NPR)</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {chequeSplits.map((split: any, index) => (
              <TableRow key={split.id}>
                <TableCell>
                  <Input type="number" value={split.interval} onChange={(e) => handleSplitChange(index, 'interval', e.target.value)} />
                </TableCell>
                <TableCell>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {split.chequeDate
                          ? `${toNepaliDate(split.chequeDate.toISOString())} (${format(split.chequeDate, 'PP')})`
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <DualCalendar selected={split.chequeDate} onSelect={(d) => d && handleSplitChange(index, 'chequeDate', d)} />
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell>
                  <Input value={split.chequeNumber} onChange={(e) => handleSplitChange(index, 'chequeNumber', e.target.value)} />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    value={split.amount}
                    onChange={(e) => handleSplitChange(index, 'amount', e.target.value)}
                    className="font-bold"
                  />
                </TableCell>
                <TableCell>
                  <Input value={split.remarks} onChange={(e) => handleSplitChange(index, 'remarks', e.target.value)} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    disabled={chequeSplits.length <= 1}
                    onClick={() => handleRemoveSplit(index)}
                    aria-label="Remove cheque"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-end gap-6 px-4 py-3 border-t bg-muted/20 text-xs">
          <span className="text-muted-foreground">
            Cheque total: <b className="text-foreground">Rs. {money(totalSplitAmount)}</b>
          </span>
          <span className={cn('font-bold', isBalanced ? 'text-emerald-700' : 'text-destructive')}>
            {isBalanced ? 'Balanced' : `Off by Rs. ${money(Math.abs(remainingAmount))}`}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {chequeToEdit && (
          <Button variant="ghost" onClick={onSaveSuccess} className="font-bold text-muted-foreground uppercase text-[10px]">
            <X className="mr-2 h-3.5 w-3.5" /> Discard changes
          </Button>
        )}
        <Button onClick={handleSave} disabled={isSaving || !isBalanced} className="font-black uppercase text-[10px] tracking-widest">
          {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          {chequeToEdit ? 'Save changes' : 'Create voucher'}
        </Button>
      </div>

      {/* ------------------------------ party dialog ------------------------------ */}
      <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingParty ? 'Edit party' : 'Add party'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Party name</Label>
              <Input value={partyForm.name} onChange={(e) => setPartyForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vendor">Vendor</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ownership</Label>
                <Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm((p) => ({ ...p, ownership: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedOwnerships.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmitParty} className="w-full">
              Save party
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------ account dialog ------------------------------ */}
      <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add bank account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ownership</Label>
                <Select value={accountForm.ownership} onValueChange={(v: any) => setAccountForm((p) => ({ ...p, ownership: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedOwnerships.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account type</Label>
                <Select
                  value={accountForm.bankAccountType}
                  onValueChange={(v: BankAccountType) => setAccountForm((p) => ({ ...p, bankAccountType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Saving">Saving</SelectItem>
                    <SelectItem value="Current">Current</SelectItem>
                    <SelectItem value="Over Draft">Over draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bank name</Label>
              <Input value={accountForm.bankName} onChange={(e) => setAccountForm((p) => ({ ...p, bankName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Account number</Label>
              <Input value={accountForm.accountNumber} onChange={(e) => setAccountForm((p) => ({ ...p, accountNumber: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAccountSubmit} className="w-full">
              Save account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
