'use client';

import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
    value: string;
    label: string;
}

interface MultiSelectFilterProps {
    label: string;
    options: MultiSelectOption[];
    selected: string[];
    onChange: (selected: string[]) => void;
    className?: string;
}

/**
 * A small "filter this column" affordance: a funnel icon that turns primary
 * when active, opening a checkbox multi-select list. Shared by any table
 * that needs Excel-style click-a-column-header-to-filter behavior, so the
 * interaction (and its "N selected" / clear affordance) stays identical
 * across Payroll, Analytics, and Performance Benchmark.
 */
export function MultiSelectFilter({ label, options, selected, onChange, className }: MultiSelectFilterProps) {
    const toggle = (value: string) => {
        onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted/50 transition-colors shrink-0",
                        selected.length > 0 && "text-primary",
                        className
                    )}
                    title={`Filter by ${label}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Filter className={cn("h-3 w-3", selected.length > 0 && "fill-current")} />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="text-[10px] font-black uppercase text-muted-foreground">{label}</span>
                    {selected.length > 0 && (
                        <button onClick={() => onChange([])} className="text-[9px] font-bold uppercase text-primary hover:underline">Clear</button>
                    )}
                </div>
                <ScrollArea className="max-h-[240px] p-2">
                    {options.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic px-2 py-2">No options.</p>
                    ) : options.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs">
                            <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
                            {opt.label}
                        </label>
                    ))}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
