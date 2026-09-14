'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, getNormalizedPath } from '@/lib/utils';
import { BarChart2, Users } from 'lucide-react';

const TABS = [
    { href: '/fleet/reports/truck-pnl', label: 'Truck P&L', icon: BarChart2 },
    { href: '/fleet/reports/party-dues', label: 'Party Dues', icon: Users },
] as const;

export default function FleetReportsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const normalized = getNormalizedPath(pathname);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1 border-b">
                {TABS.map(tab => {
                    const isActive = normalized === getNormalizedPath(tab.href);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors',
                                isActive
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <tab.icon className="h-4 w-4" /> {tab.label}
                        </Link>
                    );
                })}
            </div>
            {children}
        </div>
    );
}
