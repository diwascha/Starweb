
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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


interface TdsRate {
  value: string;
  label: string;
  description: string;
}

const initialTdsRates: TdsRate[] = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts/sub-contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services to natural persons (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire to VAT registered person (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

export default function TdsCalculatorPage() {
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedRateValue, setSelectedRateValue] = useState<string>('1.5');
  const [date, setDate] = useState<Date>(new Date());
  
  const [tdsRates, setTdsRates] = useState<TdsRate[]>(initialTdsRates);
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TdsRate | null>(null);
  const [rateForm, setRateForm] = useState({ value: '', label: '', description: '' });

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value));
  };
  
  const selectedRateInfo = tdsRates.find(r => r.value === selectedRateValue);

  const calculateTDS = () => {
    if (amount === '' || amount <= 0) {
      return { tds: 0, netAmount: 0, vat: 0, totalWithVat: 0 };
    }
    const rate = parseFloat(selectedRateValue) / 100;
    const vatRate = 0.13;
    
    const taxableAmount = amount;
    const vat = taxableAmount * vatRate;
    const totalWithVat = taxableAmount + vat;
    const tds = taxableAmount * rate;
    const netAmount = totalWithVat - tds;

    return { tds, netAmount, vat, totalWithVat };
  };

  const { tds, netAmount, vat, totalWithVat } = calculateTDS();
  
  const handleOpenRateDialog = (rate: TdsRate | null = null) => {
    if (rate) {
        setEditingRate(rate);
        setRateForm(rate);
    } else {
        setEditingRate(null);
        setRateForm({ value: '', label: '', description: '' });
    }
    setIsRateDialogOpen(true);
  };
  
  const handleSaveRate = () => {
      if (!rateForm.value || !rateForm.label) {
          // Basic validation
          return;
      }
      if (editingRate) {
          setTdsRates(rates => rates.map(r => r.value === editingRate.value ? rateForm : r));
      } else {
          setTdsRates(rates => [...rates, rateForm]);
      }
      setIsRateDialogOpen(false);
  };
  
  const handleDeleteRate = (value: string) => {
      setTdsRates(rates => rates.filter(r => r.value !== value));
      if (selectedRateValue === value) {
          setSelectedRateValue(tdsRates[0]?.value || '');
      }
  };


  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Advanced TDS Calculator</h1>
        <p className="text-muted-foreground">
          Quickly calculate Tax Deducted at Source (TDS) for various payment types.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Calculate TDS</CardTitle>
            <CardDescription>
              Enter the payment amount and select the nature of payment to see the detailed calculation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="voucher-no">Voucher No.</Label>
                        <Input id="voucher-no" placeholder="Auto-generated" readOnly className="bg-muted/50" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? `${toNepaliDate(date.toISOString())} BS (${format(date, "PPP")})` : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <DualCalendar selected={date} onSelect={(d) => d && setDate(d)} />
                            </PopoverContent>
                        </Popover>
                     </div>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-name">Party Name (Optional)</Label>
                    <Input id="party-name" placeholder="Enter party name" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Taxable Amount (NPR)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="e.g., 50000"
                  value={amount}
                  onChange={handleAmountChange}
                  className="text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-nature">Nature of Payment</Label>
                 <Select value={selectedRateValue} onValueChange={setSelectedRateValue}>
                    <SelectTrigger id="payment-nature">
                      <SelectValue placeholder="Select payment type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tdsRates.map(rate => (
                        <SelectItem key={rate.value} value={rate.value}>{rate.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
            </div>
            
            <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
               <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Taxable Amount</span>
                  <span className="font-medium">
                    {Number(amount || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                 <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">VAT (13%)</span>
                  <span className="font-medium">
                    + {vat.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center font-semibold">
                  <span className="text-muted-foreground">Total with VAT</span>
                  <span>
                    {totalWithVat.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                 <div className="flex justify-between items-center text-destructive">
                  <span className="text-muted-foreground">TDS ({selectedRateValue}%)</span>
                  <span className="font-medium">
                    - {tds.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Net Payable Amount</span>
                  <span>
                    {netAmount.toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'NPR',
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
            </div>
          </CardContent>
        </Card>
        <div className="lg:col-span-1 space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Manage TDS Rates</CardTitle>
                    <Button size="icon" variant="outline" onClick={() => handleOpenRateDialog()}>
                        <PlusCircle className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                    {tdsRates.map(rate => (
                        <div key={rate.value} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                            <div>
                                <p className="font-semibold">{rate.label} <Badge variant="outline">{rate.value}%</Badge></p>
                                <p className="text-xs text-muted-foreground">{rate.description}</p>
                            </div>
                            <div className="flex">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenRateDialog(rate)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>This will permanently delete the "{rate.label}" rate.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteRate(rate.value)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
      </div>
      
       <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRate ? 'Edit TDS Rate' : 'Add New TDS Rate'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rate-label">Label</Label>
              <Input id="rate-label" value={rateForm.label} onChange={(e) => setRateForm({...rateForm, label: e.target.value})} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="rate-value">Rate (%)</Label>
              <Input id="rate-value" type="number" value={rateForm.value} onChange={(e) => setRateForm({...rateForm, value: e.target.value})} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="rate-desc">Description</Label>
              <Input id="rate-desc" value={rateForm.description} onChange={(e) => setRateForm({...rateForm, description: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRate}>Save Rate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
