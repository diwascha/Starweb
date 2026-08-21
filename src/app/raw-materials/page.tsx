'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Loader2,
  Check,
  ChevronDown,
  MoreHorizontal,
  PlusCircle,
  FilterX,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { RawMaterial, UnitOfMeasurement } from '@/lib/types';
import { 
  onRawMaterialsUpdate, 
  addRawMaterial, 
  updateRawMaterial, 
  deleteRawMaterial 
} from '@/services/raw-material-service';
import { onUomsUpdate } from '@/services/uom-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from '@/components/ui/dialog';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger, 
    DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn, normalizeBF } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const paperTypes = ['Kraft Paper', 'Virgin Paper'];
const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];

export default function RawMaterialsPage() {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState({
    type: '',
    name: '',
    size: '',
    gsm: '',
    bf: '',
    units: [] as string[]
  });

  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    setIsLoading(true);
    const unsubMaterials = onRawMaterialsUpdate((data) => {
        setMaterials(data);
        setIsLoading(false);
    });
    const unsubUoms = onUomsUpdate(setUoms);
    return () => {
        unsubMaterials();
        unsubUoms();
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, itemsPerPage]);

  const categories = useMemo(() => {
    const set = new Set(materials.map(m => m.type));
    return Array.from(set).sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            m.type.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || m.type === categoryFilter;
        return matchesSearch && matchesCategory;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, searchQuery, categoryFilter]);

  const paginatedMaterials = useMemo(() => {
    if (itemsPerPage === -1) return filteredMaterials;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMaterials.slice(start, start + itemsPerPage);
  }, [filteredMaterials, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredMaterials.length / itemsPerPage);
  }, [filteredMaterials, itemsPerPage]);

  const handleSave = async () => {
    if (!user || !form.name || !form.type) return;
    try {
        const isPaper = paperTypes.includes(form.type);
        const payload = {
            ...form,
            bf: isPaper ? normalizeBF(form.bf) : '',
            lastModifiedBy: user.username,
            ownership: 'Both'
        };

        if (editingMaterial) {
            await updateRawMaterial(editingMaterial.id, payload);
            toast({ title: 'Material Updated' });
        } else {
            await addRawMaterial({ ...payload, createdBy: user.username } as any);
            toast({ title: 'Material Added' });
        }
        setIsDialogOpen(false);
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
      try {
          await deleteRawMaterial(id);
          toast({ title: 'Material Deleted' });
      } catch {
          toast({ title: 'Error', variant: 'destructive' });
      }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Raw Materials</h1>
          <p className="text-muted-foreground text-sm font-medium italic">Inventory catalog for manufacturing components.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search catalog..." 
                className="pl-8 w-64 bg-white h-10 border-gray-300 shadow-sm text-sm" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('purchaseOrders', 'create') && (
            <Button onClick={() => { setEditingMaterial(null); setForm({type:'', name:'', size:'', gsm:'', bf:'', units:[]}); setIsDialogOpen(true); }} className="h-10 font-black text-xs uppercase tracking-widest px-6 shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> Add Material
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
          <div className="space-y-1.5 w-[200px]">
              <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Filter Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 bg-white text-xs font-bold uppercase"><SelectValue /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="All">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
              </Select>
          </div>
          {categoryFilter !== 'All' && (
              <Button variant="ghost" size="sm" onClick={() => setCategoryFilter('All')} className="h-9 text-muted-foreground uppercase font-black text-[9px] tracking-widest">
                  <FilterX className="mr-1.5 h-3.5 w-3.5" /> Clear filters
              </Button>
          )}
      </div>

      <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
          <CardContent className="p-0">
              <Table>
                  <TableHeader className="bg-muted/50 border-b">
                      <TableRow className="hover:bg-transparent h-11">
                          <TableHead className="pl-6 font-black uppercase text-[10px] tracking-widest">Material Name / Description</TableHead>
                          <TableHead className="font-black uppercase text-[10px] tracking-widest">Category</TableHead>
                          <TableHead className="font-black uppercase text-[10px] tracking-widest text-center">Specs (Size/GSM/BF)</TableHead>
                          <TableHead className="font-black uppercase text-[10px] tracking-widest text-center">Units</TableHead>
                          <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {isLoading ? (
                          <TableRow><TableCell colSpan={5} className="py-24 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                      ) : paginatedMaterials.map((m) => (
                          <TableRow key={m.id} className="hover:bg-muted/10 h-16 transition-colors border-b group">
                              <TableCell className="pl-6">
                                  <div className="flex flex-col">
                                      <span className="font-black text-gray-900 leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">{m.name}</span>
                                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">ID: {m.id.substring(0,8).toUpperCase()}</span>
                                  </div>
                              </TableCell>
                              <TableCell>
                                  <Badge variant="outline" className="text-[9px] font-black uppercase h-5 bg-blue-50 text-blue-700 border-blue-100 px-2 shadow-none">{m.type}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                  {paperTypes.includes(m.type) ? (
                                      <div className="flex items-center justify-center gap-2 font-mono text-[11px] text-gray-600 font-bold">
                                          <span>{m.size || '—'}"</span>
                                          <span className="text-muted-foreground opacity-30 font-normal">/</span>
                                          <span>{m.gsm || '—'}g</span>
                                          <span className="text-muted-foreground opacity-30 font-normal">/</span>
                                          <span className="text-blue-700">{m.bf || '—'}</span>
                                      </div>
                                  ) : (
                                      <span className="text-[10px] text-muted-foreground italic uppercase font-black opacity-30">—</span>
                                  )}
                              </TableCell>
                              <TableCell className="text-center">
                                  <div className="flex justify-center gap-1">
                                      {m.units?.map(u => (
                                          <Badge key={u} variant="secondary" className="text-[8px] font-black uppercase h-4 px-1 shadow-none">{u}</Badge>
                                      ))}
                                  </div>
                              </TableCell>
                              <TableCell className="text-right pr-6">
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-48">
                                          <DropdownMenuItem onSelect={() => { setEditingMaterial(m); setForm({type:m.type, name:m.name, size:m.size||'', gsm:m.gsm||'', bf:m.bf||'', units:m.units||[]}); setIsDialogOpen(true); }}>
                                              <Edit className="mr-2 h-4 w-4" /> Edit Details
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <AlertDialog>
                                              <AlertDialogTrigger asChild>
                                                  <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete Material</DropdownMenuItem>
                                              </AlertDialogTrigger>
                                              <AlertDialogContent>
                                                  <AlertDialogHeader><AlertDialogTitle className="uppercase tracking-tight font-black">Remove from Catalog?</AlertDialogTitle><AlertDialogDescription>This will delete the material record permanently. Linked purchase orders will maintain a snapshot but won't be linked to this catalog item.</AlertDialogDescription></AlertDialogHeader>
                                                  <AlertDialogFooter>
                                                      <AlertDialogCancel className="font-bold text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
                                                      <AlertDialogAction onClick={() => handleDelete(m.id)} className="bg-destructive text-white hover:bg-destructive/90 font-black text-xs uppercase tracking-widest">Delete Permanent</AlertDialogAction>
                                                  </AlertDialogFooter>
                                              </AlertDialogContent>
                                          </AlertDialog>
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                              </TableCell>
                          </TableRow>
                      ))}
                      {!isLoading && filteredMaterials.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="h-60 text-center text-muted-foreground italic uppercase font-black text-[10px] tracking-widest opacity-20">No matching materials in catalog.</TableCell></TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
          {(totalPages > 1 || itemsPerPage !== -1) && (
            <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-tight">
                    {itemsPerPage === -1 ? (
                        <>Showing all <span className="font-black text-foreground">{filteredMaterials.length}</span> materials</>
                    ) : (
                        <>
                            Showing <span className="font-black text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-black text-foreground">{Math.min(currentPage * itemsPerPage, filteredMaterials.length)}</span> of <span className="font-black text-foreground">{filteredMaterials.length}</span> materials
                        </>
                    )}
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Rows:</span>
                        <Select value={String(itemsPerPage)} onValueChange={(v) => {
                            setItemsPerPage(parseInt(v));
                            setCurrentPage(1);
                        }}>
                            <SelectTrigger className="h-8 w-[72px] bg-white border-gray-200 text-xs font-bold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="-1">All</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {itemsPerPage !== -1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-xs font-black px-2 whitespace-nowrap tabular-nums">Page {currentPage} of {totalPages}</div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </CardFooter>
          )}
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader>
                  <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">{editingMaterial ? 'Modify Material' : 'New Material Registry'}</DialogTitle>
                  <DialogDescription className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Define a manufacturing component and its specifications.</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                  <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Material Type / Category</Label>
                      <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                          <SelectTrigger className="h-10 border-2"><SelectValue placeholder="Select type..."/></SelectTrigger>
                          <SelectContent>
                              {['Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'].map(t => (
                                  <SelectItem key={t} value={t} className="text-xs font-bold uppercase">{t}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Full Description / Name</Label>
                      <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. 180 GSM Kraft" className="h-10 font-bold border-2" />
                  </div>

                  {paperTypes.includes(form.type) && (
                      <div className="grid grid-cols-3 gap-4 p-4 bg-primary/5 rounded-xl border-2 border-primary/20 animate-in zoom-in-95">
                          <div className="space-y-1.5">
                              <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Size (In)</Label>
                              <Input value={form.size} onChange={e => setForm({...form, size: e.target.value})} className="h-9 font-black text-center bg-white" placeholder="0.00" />
                          </div>
                          <div className="space-y-1.5">
                              <Label className="text-[10px] font-black uppercase text-primary tracking-widest">GSM</Label>
                              <Input value={form.gsm} onChange={e => setForm({...form, gsm: e.target.value})} className="h-9 font-black text-center bg-white" placeholder="0" />
                          </div>
                          <div className="space-y-1.5">
                              <Label className="text-[10px] font-black uppercase text-primary tracking-widest">BF</Label>
                              <Select value={form.bf} onValueChange={v => setForm({...form, bf: v})}>
                                  <SelectTrigger className="h-9 bg-white font-black text-xs"><SelectValue/></SelectTrigger>
                                  <SelectContent>{bfOptions.map(b => <SelectItem key={b} value={b} className="text-xs font-bold">{b}</SelectItem>)}</SelectContent>
                              </Select>
                          </div>
                      </div>
                  )}

                  <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Authorized Units</Label>
                      <div className="flex flex-wrap gap-2 p-3 border-2 rounded-xl bg-gray-50/50">
                          {['Kg', 'Ton', 'Piece', 'Roll', 'Packet', 'Set', 'Ltr'].map(u => (
                              <button
                                  key={u}
                                  type="button"
                                  onClick={() => setForm(p => ({...p, units: p.units.includes(u) ? p.units.filter(x => x !== u) : [...p.units, u]}))}
                                  className={cn(
                                      "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all border-2",
                                      form.units.includes(u) ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-white text-muted-foreground border-gray-100 hover:border-primary/30"
                                  )}
                              >
                                  {u}
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
              <DialogFooter className="border-t pt-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-11 font-bold text-xs uppercase tracking-widest">Cancel</Button>
                  <Button onClick={handleSave} disabled={!form.name || !form.type || form.units.length === 0} className="h-11 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Commit Material</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
