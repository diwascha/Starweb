'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Party, PartyType, Product, ProductSpecification, EstimateInvoice, EstimateInvoiceItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronsUpDown, Check, PlusCircle, Trash2, Printer, Save, FileText, Loader2, Plus, Edit } from 'lucide-react';
import { cn, toWords, toNepaliDate } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onProductsUpdate } from '@/services/product-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addEstimatedInvoice } from '@/services/estimate-invoice-service';
import { useRouter } from 'next/navigation';

export function InvoiceCalculator() {
    const [date, setDate] = useState<Date>(new Date());
    const [party, setParty] = useState<Party | null>(null);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [items, setItems] = useState<EstimateInvoiceItem[]>([]);
    
    const [parties, setParties] = useState<Party[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();
    const router = useRouter();

    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Customer', address: '', panNumber: '' });
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubProducts = onProductsUpdate(setProducts);
        return () => {
            unsubParties();
            unsubProducts();
        }
    }, []);
    
    const customers = useMemo(() => parties.filter(p => p.type === 'Customer' || p.type === 'Both'), [parties]);
    
    const handlePartySelect = (selectedPartyId: string) => {
        const selected = customers.find(c => c.id === selectedPartyId);
        setParty(selected || null);
        setPartySearch('');
    };

    const handleOpenPartyDialog = (partyToEdit: Party | null = null, searchName: string = '') => {
        if (partyToEdit) {
            setEditingParty(partyToEdit);
            setPartyForm({ name: partyToEdit.name, type: partyToEdit.type, address: partyToEdit.address, panNumber: partyToEdit.panNumber });
        } else {
            setEditingParty(null);
            setPartyForm({ name: searchName, type: 'Customer', address: '', panNumber: '' });
        }
        setIsPartyDialogOpen(true);
    };

    const handleSubmitParty = async () => {
        if (!user) return;
        if (!partyForm.name) {
            toast({ title: 'Error', description: 'Party name is required.', variant: 'destructive' });
            return;
        }
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                toast({ title: 'Success', description: 'Party updated.' });
            } else {
                const newPartyId = await addParty({ ...partyForm, createdBy: user.username });
                handlePartySelect(newPartyId);
                toast({ title: 'Success', description: 'New party added.' });
            }
            setIsPartyDialogOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Failed to save party.', variant: 'destructive' });
        }
    };
    
    // ... rest of the component
    return (
        <div className="space-y-6">
            {/* Party Selection and Date */}
        </div>
    );
}
