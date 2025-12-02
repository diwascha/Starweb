

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Printer, Save, Loader2, Trash2, Plus, Image as ImageIcon } from 'lucide-react';
import { cn, toWords, generateNextVoucherNumber, toNepaliDate } from '@/lib/utils';
import { format, addDays, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import type { Party, PartyType, Cheque, ChequeSplit, ChequeStatus, Account, BankAccountType } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addCheque, onChequesUpdate, updateCheque } from '@/services/cheque-service';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChequeView } from './cheque-view';
import { onAccountsUpdate, addAccount as addAccountService } from '@/services/account-service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface ChequeGeneratorFormProps {
    chequeToEdit?: Cheque | null;
    onSaveSuccess: () => void;
}


export function ChequeGeneratorForm({ chequeToEdit, onSaveSuccess }: ChequeGeneratorFormProps) {
    const [paymentDate, setPaymentDate] = useState<Date>(new Date());
    const [invoiceDate, setInvoiceDate] = useState<Date | undefined>();
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [partyName, setPartyName] = useState('');
    
    const [invoiceAmount, setInvoiceAmount] = useState<number | ''>('');
    const [numberOfSplits, setNumberOfSplits] = useState<number>(1);
    
    const [chequeSplits, setChequeSplits] = useState<ChequeSplit[]>([{
        id: Date.now().toString(),
        chequeDate: new Date(),
        chequeNumber: '',
        amount: '',
        remarks: '',
        interval: 0,
        status: 'Due',
        partialPayments: [],
    }]);

    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    
    // Dialog States
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', address: '', panNumber: '' });
    const [accountForm, setAccountForm] = useState({ name: '', type: 'Bank' as 'Cash' | 'Bank', accountNumber: '', bankName: '', branch: '', bankAccountType: 'Saving' as BankAccountType });
    const [partySearch, setPartySearch] = useState('');
    const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);

    const { toast } = useToast();
    const { user } = useAuth();
    
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [voucherNo, setVoucherNo] = useState('');

    const printRef = useRef<HTMLDivElement>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubCheques = onChequesUpdate(setCheques);
        const unsubAccounts = onAccountsUpdate(setAccounts);
        return () => {
          unsubParties();
          unsubCheques();
          unsubAccounts();
        };
    }, []);
    
     useEffect(() => {
        if (chequeToEdit) {
            setVoucherNo(chequeToEdit.voucherNo);
            setPaymentDate(new Date(chequeToEdit.paymentDate));
            setInvoiceDate(chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : undefined);
            setInvoiceNumber(chequeToEdit.invoiceNumber || '');
            setPartyName(chequeToEdit.partyName);
            setInvoiceAmount(chequeToEdit.amount);
            setNumberOfSplits(chequeToEdit.splits.length);
            setSelectedAccountId(chequeToEdit.accountId);
            setChequeSplits(chequeToEdit.splits.map(s => {
                const splitDate = new Date(s.chequeDate);
                const baseDate = chequeToEdit.invoiceDate ? new Date(chequeToEdit.invoiceDate) : new Date(chequeToEdit.paymentDate);
                const interval = Math.round((splitDate.getTime() - baseDate.getTime()) / (1000 * 3600 * 24));
                return {
                    id: s.id || String(Math.random()),
                    chequeDate: splitDate,
                    chequeNumber: s.chequeNumber,
                    amount: s.amount,
                    remarks: s.remarks,
                    interval: interval >= 0 ? interval : 0,
                    status: s.status || 'Due',
                    partialPayments: s.partialPayments || [],
                    cancellationReason: s.cancellationReason || '',
                }
            }));
        } else {
            const setNextVoucher = async () => {
                 generateNextVoucherNumber(cheques, 'PDC-').then(setVoucherNo);
            };
            setNextVoucher();
        }
    }, [chequeToEdit, cheques]);

    useEffect(() => {
        const totalAmount = Number(invoiceAmount) || 0;
        const numSplits = Math.max(1, numberOfSplits || 1);
        const baseDate = invoiceDate || paymentDate;

        const newSplits = Array.from({ length: numSplits }, (_, i) => {
            const existingSplit = chequeSplits[i] || {};
            
            const splitAmount = totalAmount > 0 ? Math.floor(totalAmount / numSplits) : '';
            const remainder = totalAmount > 0 ? totalAmount % numSplits : 0;
            const currentAmount = totalAmount > 0 ? splitAmount + (i < remainder ? 1 : 0) : '';
            
            const intervalDays = existingSplit.interval || 0;
            const chequeDate = addDays(baseDate, intervalDays);

            return {
                id: existingSplit.id || `${Date.now()}-${i}`,
                chequeDate: chequeDate,
                chequeNumber: existingSplit.chequeNumber || '',
                amount: currentAmount,
                remarks: existingSplit.remarks || '',
                interval: intervalDays,
                status: 'Due' as ChequeStatus,
                partialPayments: [],
            };
        });
        setChequeSplits(newSplits);
    }, [numberOfSplits, invoiceAmount, paymentDate, invoiceDate]);


    const allParties = useMemo(() => parties.sort((a, b) => a.name.localeCompare(b.name)), [parties]);
    const bankAccounts = useMemo(() => accounts.filter(a => a.type === 'Bank'), [accounts]);
    
    const totalSplitAmount = useMemo(() => {
        return chequeSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    }, [chequeSplits]);

    const remainingAmount = useMemo(() => {
        return (Number(invoiceAmount) || 0) - totalSplitAmount;
    }, [invoiceAmount, totalSplitAmount]);

    const amountInWords = useMemo(() => {
        const total = Number(invoiceAmount) || 0;
        if (total <= 0) return 'Zero Only.';
        return toWords(total);
    }, [invoiceAmount]);

    const handlePartySelect = (selectedPartyName: string) => {
        const party = allParties.find(c => c.name === selectedPartyName);
        setPartyName(party?.name || selectedPartyName);
        setIsPartyPopoverOpen(false);
    };
    
    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type) {
            toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
            return;
        }
        try {
            await addParty({...partyForm, createdBy: user.username});
            handlePartySelect(partyForm.name);
            toast({title: 'Success', description: 'New party added.'});
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor', address: '', panNumber: ''});
        } catch {
            toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
        }
    };
    
    const handleAccountSubmit = async () => {
        if (!user) return;
        if (!accountForm.name || !accountForm.bankName || !accountForm.accountNumber) {
            toast({ title: 'Error', description: 'All bank account fields are required.', variant: 'destructive' });
            return;
        }
        try {
            const newAccountId = await addAccountService({
                name: accountForm.name,
                type: 'Bank',
                bankName: accountForm.bankName,
                accountNumber: accountForm.accountNumber,
                branch: accountForm.branch,
                bankAccountType: accountForm.bankAccountType,
                createdBy: user.username,
            });
            setSelectedAccountId(newAccountId);
            toast({ title: 'Success', description: 'New bank account added.' });
            setIsAccountDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to add bank account.', variant: 'destructive' });
        }
    };


    const resetForm = () => {
        setPaymentDate(new Date());
        setInvoiceDate(undefined);
        setInvoiceNumber('');
        setPartyName('');
        setInvoiceAmount('');
        setNumberOfSplits(1);
        setSelectedAccountId(undefined);
        setChequeSplits([{ id: Date.now().toString(), chequeDate: new Date(), chequeNumber: '', amount: '', remarks: '', interval: 0, status: 'Due', partialPayments: [] }]);
        onSaveSuccess();
    };

    const handleSave = async () => {
        if (!user || !partyName || !invoiceAmount || Number(invoiceAmount) <= 0) {
            toast({ title: 'Error', description: 'Party Name and a valid invoice amount are required.', variant: 'destructive'});
            return;
        }
        if (remainingAmount !== 0) {
            toast({ title: 'Error', description: 'Total of splits must equal the Invoice Amount.', variant: 'destructive'});
            return;
        }
        setIsSaving(true);
        try {
             const chequeData: Omit<Cheque, 'id' | 'createdAt'> = {
                paymentDate: paymentDate.toISOString(),
                voucherNo: voucherNo,
                invoiceDate: invoiceDate?.toISOString(),
                invoiceNumber,
                partyName,
                payeeName: partyName,
                amount: Number(invoiceAmount),
                amountInWords,
                accountId: selectedAccountId,
                splits: chequeSplits.map(s => ({
                    id: s.id,
                    chequeDate: s.chequeDate.toISOString(),
                    chequeNumber: s.chequeNumber,
                    amount: Number(s.amount) || 0,
                    remarks: s.remarks,
                    status: s.status,
                    partialPayments: s.partialPayments || [],
                    cancellationReason: s.cancellationReason || '',
                })),
                createdBy: chequeToEdit?.createdBy || user.username,
            };

            if (chequeToEdit) {
                await updateCheque(chequeToEdit.id, {...chequeData, lastModifiedBy: user.username});
                toast({ title: 'Success', description: 'Cheque record updated.' });
            } else {
                await addCheque(chequeData);
                toast({ title: 'Success', description: 'Cheque record saved.' });
            }
            resetForm();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save cheque record.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handlePrint = () => {
        if (!partyName || totalSplitAmount <= 0) {
            toast({ title: 'Error', description: 'Please fill in party and cheque details.', variant: 'destructive'});
            return;
        }
        setIsPreviewOpen(true);
    };

    const doActualPrint = () => {
        const printableArea = printRef.current;
        if (!printableArea) return;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        doc.open();
        doc.write('<html><head><title>Print Cheques</title>');
        // Link to the main app's stylesheet to preserve styles
        const styles = Array.from(document.styleSheets).map(s => s.href ? `<link rel="stylesheet" href="${s.href}">` : '').join('');
        doc.write(styles);
        doc.write('</head><body style="margin: 0;">');
        doc.write(printableArea.innerHTML);
        doc.write('</body></html>');
        doc.close();

        iframe.contentWindow?.focus();
        setTimeout(() => {
            iframe.contentWindow?.print();
            document.body.removeChild(iframe);
        }, 500); // Give styles time to load
    };
    
    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const account = accounts.find(a => a.id === selectedAccountId);

            // Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('PAYMENT VOUCHER', doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
            
            // Info
            doc.setFontSize(10);
            doc.text(`Voucher No: ${voucherNo}`, 14, 40);
            doc.text(`Payee: ${partyName}`, 14, 45);
            doc.text(`Date: ${toNepaliDate(paymentDate.toISOString())} BS (${format(paymentDate, 'yyyy-MM-dd')})`, doc.internal.pageSize.getWidth() - 14, 40, { align: 'right' });
            
            const totalAmount = chequeSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);

            const body = chequeSplits.map((split, index) => {
                const bankDetails = account && account.type === 'Bank' ? `${account.bankName}\nA/C: ${account.accountNumber}` : "Cash Payment";
                const nepaliChequeDate = toNepaliDate(split.chequeDate.toISOString());
                const adChequeDate = format(split.chequeDate, 'yyyy-MM-dd');
                return [
                    bankDetails,
                    split.chequeNumber || 'N/A',
                    `${nepaliChequeDate} (${adChequeDate})`,
                    (Number(split.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
                ];
            });

            autoTable(doc, {
                startY: 55,
                head: [['Bank Details', 'Cheque No.', 'Cheque Date', 'Amount']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                foot: [['Total', '', '', { content: totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), styles: { halign: 'right' } }]],
                footStyles: { fontStyle: 'bold', fontSize: 11 },
                didDrawPage: (data) => {
                    let finalY = data.cursor.y;
                    doc.setFontSize(10);
                    doc.text(`In Words: ${toWords(totalAmount)}`, 14, finalY + 10);
                    
                    const signatureY = Math.max(finalY + 40, doc.internal.pageSize.getHeight() - 40);
                    doc.line(20, signatureY, 70, signatureY);
                    doc.text("Receiver's Signature", 45, signatureY + 5, { align: 'center' });
                    doc.line(doc.internal.pageSize.getWidth() - 70, signatureY, doc.internal.pageSize.getWidth() - 20, signatureY);
                    doc.text("Authorized Signature", doc.internal.pageSize.getWidth() - 45, signatureY + 5, { align: 'center' });
                }
            });

            doc.save(`Voucher-${voucherNo}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };


    const handleExportJpg = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `Voucher-${voucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            console.error(`Failed to export as JPG`, error);
            toast({ title: 'Export Failed', description: `Could not export as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };


    const handleSplitChange = (index: number, field: keyof ChequeSplit, value: any) => {
        const newSplits = [...chequeSplits];
        (newSplits[index] as any)[field] = value;
        
        if(field === 'interval') {
            const intervalDays = Number(value) || 0;
            const baseDate = invoiceDate || paymentDate;
            newSplits[index].chequeDate = addDays(baseDate, intervalDays);
        }

        setChequeSplits(newSplits);
    };

    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                 <div className="space-y-2">
                    <Label htmlFor="voucherNo">Auto Cheque Numbering</Label>
                    <Input id="voucherNo" value={voucherNo} readOnly className="bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="paymentDate">Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="paymentDate" variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {paymentDate ? `${toNepaliDate(paymentDate.toISOString())} (${format(paymentDate, "PPP")})` : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={paymentDate} onSelect={(d) => d && setPaymentDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceDate">Invoice Date:</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="invoiceDate" variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {invoiceDate ? `${toNepaliDate(invoiceDate.toISOString())} (${format(invoiceDate, "PPP")})` : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <DualCalendar selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} />
                        </PopoverContent>
                    </Popover>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice Number:</Label>
                    <Input id="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-name">Party Name:</Label>
                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                        <PopoverTrigger asChild>
                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                {partyName || "Select a party..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                            <Command>
                                <CommandInput
                                  placeholder="Search party..."
                                  value={partySearch}
                                  onValueChange={setPartySearch}
                                />
                                <CommandList>
                                <CommandEmpty>
                                     <Button
                                        variant="ghost"
                                        className="w-full justify-start"
                                        onClick={() => {
                                            setPartyForm(prev => ({ ...prev, name: partySearch, type: 'Vendor' }));
                                            setIsPartyPopoverOpen(false);
                                            setIsPartyDialogOpen(true);
                                        }}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                    </Button>
                                </CommandEmpty>
                                <CommandGroup>
                                    {allParties.map((c) => (
                                    <CommandItem key={c.id} value={c.name} onSelect={() => handlePartySelect(c.name)}>
                                        <Check className={cn("mr-2 h-4 w-4", partyName === c.name ? "opacity-100" : "opacity-0")}/>
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
                    <Label htmlFor="invoiceAmount">Invoice Amount (NPR)</Label>
                    <Input id="invoiceAmount" type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="numberOfSplits">Number of Cheque Splits</Label>
                    <Input id="numberOfSplits" type="number" min="1" value={numberOfSplits} onChange={(e) => setNumberOfSplits(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="bankAccount">Bank Account</Label>
                    <div className="flex gap-2">
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                            <SelectTrigger id="bankAccount">
                                <SelectValue placeholder="Select a bank account" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">Cash Payment</SelectItem>
                                {bankAccounts.map(account => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.bankName} - {account.accountNumber}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon" onClick={() => setIsAccountDialogOpen(true)}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                 </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-lg font-medium">Cheque Details</Label>
                </div>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">Interval (Days)</TableHead>
                            <TableHead className="w-[200px]">Cheque Date</TableHead>
                            <TableHead>Cheque Number</TableHead>
                            <TableHead>Amount (NPR)</TableHead>
                            <TableHead>Remarks</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {chequeSplits.map((split, index) => (
                            <TableRow key={split.id}>
                                <TableCell>
                                    <Input type="number" value={split.interval} onChange={(e) => handleSplitChange(index, 'interval', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {split.chequeDate ? `${toNepaliDate(split.chequeDate.toISOString())} (${format(split.chequeDate, "PPP")})` : <span>Pick a date</span>}
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
                                    <Input type="number" value={split.amount} onChange={(e) => handleSplitChange(index, 'amount', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Input value={split.remarks} onChange={(e) => handleSplitChange(index, 'remarks', e.target.value)} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            
            <div className="border rounded-lg p-4 space-y-4">
                 <div className="flex justify-between items-center text-sm">
                    <Label>Total Invoice Amount (NPR)</Label>
                    <span className="font-bold text-lg">{Number(invoiceAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <Label>Total Split Amount (NPR)</Label>
                    <span className="font-bold text-lg">{totalSplitAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className={cn("flex justify-between items-center text-sm font-bold", remainingAmount === 0 ? 'text-green-600' : 'text-red-600')}>
                    <Label>Remaining Amount</Label>
                    <span className="text-lg">{remainingAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="space-y-2">
                    <Label>Amount in Words (for Total Invoice Amount)</Label>
                    <div className="p-3 border rounded-md bg-muted min-h-[40px]">
                        <p className="font-semibold">{amountInWords}</p>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end gap-2">
                 <Button onClick={handleSave} variant="outline" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {chequeToEdit ? 'Save Changes' : 'Save Cheque'}
                </Button>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print Cheque
                </Button>
                 {chequeToEdit && (
                    <Button variant="ghost" onClick={resetForm}>Cancel Edit</Button>
                )}
            </div>
            
             <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New Party</DialogTitle>
                         <DialogDescription>
                            Create a new vendor/supplier record.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="party-name-dialog">Party Name</Label>
                            <Input id="party-name-dialog" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="party-type-dialog">Party Type</Label>
                            <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="party-type-dialog"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vendor">Vendor</SelectItem>
                                    <SelectItem value="Customer">Customer</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-pan-dialog">PAN Number</Label>
                            <Input id="party-pan-dialog" value={partyForm.panNumber || ''} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-address-dialog">Address</Label>
                            <Textarea id="party-address-dialog" value={partyForm.address || ''} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
                <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Add New Bank Account</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="account-holder-name">Account Holder Name</Label>
                        <Input id="account-holder-name" value={accountForm.name} onChange={e => setAccountForm(p => ({...p, name: e.target.value}))} />
                    </div>
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
                    <div className="space-y-2">
                        <Label htmlFor="bankAccountType">Account Type</Label>
                        <Select value={accountForm.bankAccountType} onValueChange={(v: BankAccountType) => setAccountForm(p => ({ ...p, bankAccountType: v }))}>
                            <SelectTrigger id="bankAccountType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Saving">Saving</SelectItem>
                                <SelectItem value="Current">Current</SelectItem>
                                <SelectItem value="Over Draft">Over Draft</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAccountDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAccountSubmit}>Add Account</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>


            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Cheque Preview</DialogTitle>
                        <DialogDescription>Review the cheques before printing.</DialogDescription>
                    </DialogHeader>
                     <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef}>
                            <ChequeView
                                voucherNo={voucherNo}
                                voucherDate={paymentDate}
                                payeeName={partyName}
                                account={accounts.find(a => a.id === selectedAccountId)}
                                splits={chequeSplits}
                            />
                         </div>
                    </div>
                    <DialogFooter className="sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cancel</Button>
                        <Button variant="outline" onClick={handleExportJpg} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                             Export as JPG
                        </Button>
                        <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Export as PDF
                        </Button>
                        <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

    

    

    
