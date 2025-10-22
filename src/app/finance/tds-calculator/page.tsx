
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const tdsRates = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts/sub-contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services to natural persons (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire to VAT registered person (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

export default function TdsCalculatorPage() {
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedRate, setSelectedRate] = useState<string>('1.5');

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value));
  };
  
  const selectedRateInfo = tdsRates.find(r => r.value === selectedRate);

  const calculateTDS = () => {
    if (amount === '' || amount <= 0) {
      return { tds: 0, netAmount: 0, vat: 0, totalWithVat: 0 };
    }
    const rate = parseFloat(selectedRate) / 100;
    const vatRate = 0.13;
    
    const taxableAmount = amount;
    const vat = taxableAmount * vatRate;
    const totalWithVat = taxableAmount + vat;
    const tds = taxableAmount * rate;
    const netAmount = totalWithVat - tds;

    return { tds, netAmount, vat, totalWithVat };
  };

  const { tds, netAmount, vat, totalWithVat } = calculateTDS();

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
                 <Select value={selectedRate} onValueChange={setSelectedRate}>
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
                  <span className="text-muted-foreground">TDS ({selectedRate}%)</span>
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
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Rate Information</CardTitle>
                </CardHeader>
                <CardContent>
                    {selectedRateInfo && (
                        <div className="space-y-2">
                            <h3 className="font-semibold">{selectedRateInfo.label}</h3>
                            <p className="text-sm text-muted-foreground">{selectedRateInfo.description}</p>
                            <Badge variant="outline" className="text-lg">{selectedRateInfo.value}%</Badge>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
