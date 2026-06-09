'use client';

import { useState, useEffect } from 'react';
import type { CostReportTerm } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

interface ManageTermsDialogProps {
    isOpen: boolean;
    onOpenChange: (v: boolean) => void;
    masterTerms: CostReportTerm[];
    onSave: (v: CostReportTerm[]) => void;
}

export function ManageTermsDialog({ isOpen, onOpenChange, masterTerms, onSave }: ManageTermsDialogProps) {
    const [terms, setTerms] = useState<string[]>([]);
    const [newTerm, setNewTerm] = useState('');

    useEffect(() => {
        if (isOpen) setTerms(masterTerms.map(t => t.text));
    }, [isOpen, masterTerms]);

    const handleSave = () => {
        onSave(terms.map(text => ({ text, isSelected: true })));
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Manage Master Terms & Conditions</DialogTitle>
                    <DialogDescription>Maintain a global list of terms. You can select specific ones for each report.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                        <Input placeholder="Enter a standard term..." value={newTerm} onChange={e => setNewTerm(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { if(newTerm) setTerms([...terms, newTerm]); setNewTerm(''); } }} />
                        <Button onClick={() => { if(newTerm) { setTerms([...terms, newTerm]); setNewTerm(''); } }}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <ScrollArea className="h-64 border rounded p-3">
                        <div className="space-y-3">
                            {terms.map((text, idx) => (
                                <div key={idx} className="flex gap-2 items-start group">
                                    <Textarea value={text} onChange={e => { const n = [...terms]; n[idx] = e.target.value; setTerms(n); }} className="min-h-[60px] text-xs resize-none" />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setTerms(terms.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <ScrollBar orientation="vertical" />
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Update Master List</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
