
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export default function TdsCalculatorPage() {
  const [amount, setAmount] = useState<number | ''>('');

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value));
  };

  const calculateTDS = () => {
    if (amount === '' || amount <= 0) {
      return { tds: 0, netAmount: 0 };
    }
    const tdsRate = 0.015; // 1.5%
    const tds = amount * tdsRate;
    const netAmount = amount - tds;
    return { tds, netAmount };
  };

  const { tds, netAmount } = calculateTDS();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">TDS Calculator</h1>
        <p className="text-muted-foreground">
          Quickly calculate Tax Deducted at Source (TDS) at a 1.5% rate.
        </p>
      </header>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Calculate TDS</CardTitle>
          <CardDescription>
            Enter the total amount to see the TDS and net payable amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="amount">Total Amount</Label>
            <Input
              id="amount"
              type="number"
              placeholder="e.g., 50000"
              value={amount}
              onChange={handleAmountChange}
              className="text-base"
            />
          </div>
          <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-medium">
                {Number(amount || 0).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between items-center text-destructive">
              <span className="text-muted-foreground">TDS (1.5%)</span>
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
    </div>
  );
}

    