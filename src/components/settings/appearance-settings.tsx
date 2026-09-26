'use client';

import { Check, Monitor, Moon, Palette, RotateCcw, Sun, Type, ALargeSmall } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/theme-provider';
import { useAppearance } from '@/hooks/use-appearance';
import { ACCENT_PRESETS, FONT_OPTIONS, HEADING_FONT_OPTIONS, TEXT_SIZE_OPTIONS } from '@/lib/appearance';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
] as const;

function OptionButton({ active, onClick, children, className }: {
    active: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={onClick}
            className={cn(
                'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50',
                className,
            )}
        >
            {active && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
            {children}
        </button>
    );
}

/**
 * Theme, accent colour, fonts and text size. Personal and per-device, so it
 * is open to every user: shown as a tab in Settings > General, and as its own
 * page for users without Settings access.
 */
export function AppearanceSettings({ embedded = false }: { embedded?: boolean }) {
    const { theme, setTheme } = useTheme();
    const { prefs, update, reset, mounted } = useAppearance();

    return (
        <div className={cn("flex flex-col max-w-4xl", embedded ? "gap-6" : "gap-8")}>
            <header className="flex items-start justify-between gap-4">
                <div>
                    {embedded
                        ? <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
                        : <h1 className="text-3xl font-bold tracking-tight text-foreground">Appearance</h1>}
                    <p className="text-muted-foreground text-sm">
                        Theme, colour, fonts and text size for the whole app, including the sidebar. Saved on this device only &mdash; each person can choose their own.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { reset(); setTheme('system'); }}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset to default
                </Button>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Sun className="h-4 w-4" /> Theme</CardTitle>
                    <CardDescription>System follows your computer&apos;s light/dark setting automatically.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
                        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <OptionButton key={value} active={mounted && theme === value} onClick={() => setTheme(value)} className="items-center">
                                <Icon className="h-5 w-5" />
                                <span className="text-sm font-medium">{label}</span>
                            </OptionButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Accent colour</CardTitle>
                    <CardDescription>Used across the app: buttons, links, highlight panels, the sidebar menu and selected dates. Printed documents keep their normal colours.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        {ACCENT_PRESETS.map(preset => (
                            <OptionButton key={preset.id} active={mounted && prefs.accent === preset.id} onClick={() => update({ accent: preset.id })} className="items-center">
                                <span className="h-8 w-8 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${preset.hsl})` }} />
                                <span className="text-sm font-medium">{preset.label}</span>
                            </OptionButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Body font</CardTitle>
                    <CardDescription>Used for all normal text: menus, the sidebar, tables and forms.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div role="radiogroup" aria-label="Body font" className="grid gap-3 sm:grid-cols-3">
                        {FONT_OPTIONS.map(font => (
                            <OptionButton key={font.id} active={mounted && prefs.font === font.id} onClick={() => update({ font: font.id })}>
                                <span className="text-lg font-semibold" style={{ fontFamily: font.stack }}>{font.label}</span>
                                <span className="text-sm" style={{ fontFamily: font.stack }}>Aa 123 &middot; रु. १२३</span>
                                <span className="text-xs text-muted-foreground">{font.description}</span>
                            </OptionButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Heading font</CardTitle>
                    <CardDescription>Used for page titles, card titles and dialog titles.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div role="radiogroup" aria-label="Heading font" className="grid gap-3 sm:grid-cols-3">
                        {HEADING_FONT_OPTIONS.map(font => (
                            <OptionButton key={font.id} active={mounted && prefs.headingFont === font.id} onClick={() => update({ headingFont: font.id })}>
                                <span className="text-lg font-semibold" style={font.stack ? { fontFamily: font.stack } : undefined}>{font.label}</span>
                                <span className="text-sm" style={font.stack ? { fontFamily: font.stack } : undefined}>Purchase Order</span>
                                <span className="text-xs text-muted-foreground">{font.description}</span>
                            </OptionButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><ALargeSmall className="h-4 w-4" /> Text size</CardTitle>
                    <CardDescription>Scales text and spacing across the whole app. Printed documents are not affected.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div role="radiogroup" aria-label="Text size" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {TEXT_SIZE_OPTIONS.map(size => (
                            <OptionButton key={size.id} active={mounted && prefs.textSize === size.id} onClick={() => update({ textSize: size.id })} className="items-center">
                                <span className="font-semibold" style={{ fontSize: `${size.rootPx}px` }}>Aa</span>
                                <span className="text-sm font-medium">{size.label}</span>
                            </OptionButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Preview</CardTitle>
                    <CardDescription>How common elements look with your current choices.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button>Primary button</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="destructive">Delete</Button>
                        <Badge>Badge</Badge>
                        <Badge variant="outline">Outline badge</Badge>
                        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">Highlight panel</span>
                        <span className="text-sm font-semibold text-blue-600">Link-style text</span>
                    </div>
                    <h3 className="text-xl font-bold">Heading: Estimate Invoice SVM/EI/2083/084-025</h3>
                    <p className="text-sm">
                        Body text: Purchase order SPI-042 was finalised on 2082/06/03 for रु. 1,25,000.
                    </p>
                    <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground">
                        Small label text, like the table headers across the app
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
