'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Plus, 
    Edit, 
    Trash2, 
    MoreHorizontal, 
    ArrowUpDown, 
    Search, 
    User, 
    CalendarIcon, 
    Image as ImageIcon, 
    X, 
    Phone, 
    ShieldCheck, 
    FileText, 
    Upload, 
    Download, 
    Loader2, 
    Building2, 
    DollarSign,
    CheckSquare,
    Square,
    AlertTriangle,
    RefreshCw,
    UserCheck,
    UserX
} from 'lucide-react';
import type { Employee, WageBasis, Gender, IdentityType, EmployeeStatus, Department, Position, BloodGroup, EmployeeDocument } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { onEmployeesUpdate, addEmployee, updateEmployee, deleteEmployee } from '@/services/employee-service';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { uploadFile, deleteFile } from '@/services/storage-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';

type EmployeeSortKey = 'name' | 'wageBasis' | 'wageAmount' | 'allowance' | 'authorship' | 'mobileNumber' | 'status' | 'department';
type SortDirection = 'asc' | 'desc';

const employeeStatuses: EmployeeStatus[] = ['Working', 'Long Leave', 'Resigned', 'Dismissed'];
const departments: Department[] = ['Production', 'Admin'];
const positions: Position[] = ['Manager', 'Supervisor', 'Machine Operator', 'Helpers', 'Staff'];

const initialFormState = {
    name: '',
    status: 'Working' as EmployeeStatus,
    department: 'Production' as Department,
    position: 'Helpers' as Position,
    wageBasis: 'Monthly' as WageBasis,
    wageAmount: '',
    allowance: '',
    address: '',
    gender: 'Male' as Gender,
    mobileNumber: '',
    email: '',
    dateOfBirth: new Date().toISOString(),
    joiningDate: new Date().toISOString(),
    identityType: 'Citizenship' as IdentityType,
    documentNumber: '',
    bloodGroup: undefined as BloodGroup | undefined,
    emergencyContactName: '',
    emergencyContactNumber: '',
    qualification: '',
    referredBy: '',
    photoURL: '',
    documents: [] as EmployeeDocument[],
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState(initialFormState);
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: EmployeeSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
  
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onEmployeesUpdate((employeesData) => {
        setEmployees(employeesData);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  const filteredAndSortedEmployees = useMemo(() => {
    let filtered = employees;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => e.name.toLowerCase().includes(q) || (e.mobileNumber || '').includes(q));
    }
    filtered.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Employee] ?? '';
        const bVal = b[sortConfig.key as keyof Employee] ?? '';
        return sortConfig.direction === 'asc' ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
    });
    return filtered;
  }, [employees, sortConfig, searchQuery]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredAndSortedEmployees.length && filteredAndSortedEmployees.length > 0) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(filteredAndSortedEmployees.map(e => e.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsLoading(true);
    try {
        await Promise.all(Array.from(selectedIds).map(async id => {
            const emp = employees.find(e => e.id === id);
            return deleteEmployee(id, emp?.photoURL);
        }));
        toast({ title: 'Success', description: `Successfully removed ${selectedIds.size} records.` });
        setSelectedIds(new Set());
    } catch {
        toast({ title: 'Error', description: 'Failed to delete some records.', variant: 'destructive' });
    } finally {
        setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const openAddEmployeeDialog = () => {
    resetForm();
    setIsEmployeeDialogOpen(true);
  };

  const openEditEmployeeDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormState({
        name: employee.name,
        status: employee.status || 'Working',
        department: employee.department || 'Production',
        position: employee.position || 'Helpers',
        wageBasis: employee.wageBasis,
        wageAmount: String(employee.wageAmount),
        allowance: String(employee.allowance || ''),
        address: employee.address || '',
        gender: employee.gender || 'Male',
        mobileNumber: employee.mobileNumber || '',
        email: employee.email || '',
        dateOfBirth: employee.dateOfBirth || new Date().toISOString(),
        joiningDate: employee.joiningDate || new Date().toISOString(),
        identityType: employee.identityType || 'Citizenship',
        documentNumber: employee.documentNumber || '',
        bloodGroup: employee.bloodGroup,
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactNumber: employee.emergencyContactNumber || '',
        qualification: employee.qualification || '',
        referredBy: employee.referredBy || '',
        photoURL: employee.photoURL || '',
        documents: employee.documents || [],
    });
    if (employee.photoURL) setPhotoPreview(employee.photoURL);
    setIsEmployeeDialogOpen(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 100 * 1024) {
            toast({ title: 'Image Too Large', description: 'Max size 100KB.', variant: 'destructive' });
            return;
        }
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleEmployeeSubmit = async () => {
    if (!user) return;
    if (!formState.name.trim() || !formState.wageAmount) {
        toast({ title: 'Validation Error', description: 'Name and Wage are required.', variant: 'destructive' });
        return;
    }

    try {
      let photoURL = editingEmployee?.photoURL || '';
      if (photoFile) {
        const filePath = `employee-photos/${user.username}-${Date.now()}-${photoFile.name}`;
        photoURL = await uploadFile(photoFile, filePath);
      } else if (formState.photoURL === '') {
        photoURL = '';
      }

      const employeeData = {
          ...formState,
          name: formState.name.trim(),
          wageAmount: parseFloat(formState.wageAmount) || 0,
          allowance: parseFloat(formState.allowance) || 0,
          bloodGroup: formState.bloodGroup || undefined,
          photoURL: photoURL,
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, { ...employeeData, lastModifiedBy: user.username } as any);
        toast({ title: 'Employee Updated' });
      } else {
        await addEmployee({ ...employeeData, createdBy: user.username, createdAt: new Date().toISOString() } as any);
        toast({ title: 'New Employee Added' });
      }
      setIsEmployeeDialogOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Action failed.', variant: 'destructive' });
    }
  };

  const renderStatusBadge = (status?: EmployeeStatus) => {
    const s = status || 'Working';
    switch (s) {
      case 'Working': return <Badge variant="default" className="bg-green-600">Working</Badge>;
      case 'Long Leave': return <Badge variant="default" className="bg-amber-500 text-black">Long Leave</Badge>;
      case 'Resigned': return <Badge variant="outline">Resigned</Badge>;
      case 'Dismissed': return <Badge variant="destructive">Dismissed</Badge>;
      default: return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">Digital Workforce</h1>
          <p className="text-muted-foreground text-sm font-medium italic">Employee lifecycle and master records.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                <span className="text-[10px] font-black uppercase text-primary tracking-widest">{selectedIds.size} Selected</span>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 text-destructive border-destructive/20 hover:bg-red-50">
                            <Trash2 className="h-4 w-4 mr-2"/> Purge Selected
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Bulk Delete Confirmation</AlertDialogTitle>
                            <AlertDialogDescription>Permanently remove {selectedIds.size} employee records? This action is irreversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-white">Confirm Purge</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <Separator orientation="vertical" className="h-6 mx-2" />
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search..." className="pl-8 w-64 bg-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          {hasPermission('hr', 'create') && (
            <Button onClick={openAddEmployeeDialog} className="shadow-lg shadow-primary/20 font-black text-xs uppercase tracking-widest px-6">
                <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          )}
        </div>
      </header>

      <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-6">
                        <Checkbox 
                            checked={filteredAndSortedEmployees.length > 0 && selectedIds.size === filteredAndSortedEmployees.length} 
                            onCheckedChange={toggleAll}
                        />
                    </TableHead>
                    <TableHead className="w-[300px]"><Button variant="ghost" onClick={() => setSortConfig({ key: 'name', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="font-black uppercase text-[10px] tracking-widest">Employee <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                    <TableHead className="text-center font-black uppercase text-[10px] tracking-widest">Status</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Department / Position</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest">Joining Date</TableHead>
                    <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Wage Basis</TableHead>
                    <TableHead className="text-right pr-6 font-black uppercase text-[10px] tracking-widest">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20" /></TableCell></TableRow>
                ) : filteredAndSortedEmployees.map(employee => (
                <TableRow key={employee.id} className={cn("group h-16 transition-colors", selectedIds.has(employee.id) ? "bg-primary/5" : "hover:bg-muted/30")}>
                    <TableCell className="pl-6">
                        <Checkbox checked={selectedIds.has(employee.id)} onCheckedChange={() => toggleSelect(employee.id)} />
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border shadow-sm rounded-xl">
                                <AvatarImage src={employee.photoURL} />
                                <AvatarFallback className="bg-primary/10 text-primary font-black">{employee.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="font-black text-gray-900 leading-tight uppercase tracking-tight">{employee.name}</span>
                                <span className="text-[10px] text-muted-foreground font-bold">{employee.mobileNumber}</span>
                            </div>
                        </div>
                    </TableCell>
                    <TableCell className="text-center">{renderStatusBadge(employee.status)}</TableCell>
                    <TableCell>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-700">{employee.department}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-medium">{employee.position}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium font-mono text-blue-900">{employee.joiningDate ? toNepaliDate(employee.joiningDate) : '—'}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex flex-col">
                            <span className="font-black text-xs text-gray-900">Rs. {(employee.wageAmount || 0).toLocaleString()}</span>
                            <span className="text-[9px] text-muted-foreground uppercase tracking-tighter font-black">{employee.wageBasis}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onSelect={() => openEditEmployeeDialog(employee)}><Edit className="mr-2 h-4 w-4" /> Edit Profile</DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href={`/hr/payslip?employeeId=${employee.id}`} className="flex items-center"><FileText className="mr-2 h-4 w-4" /> View Payslips</Link></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Purge Employee</DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the employee and their metadata.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteEmployee(employee.id, employee.photoURL)} className="bg-destructive text-white">Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                ))}
                {!isLoading && filteredAndSortedEmployees.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground italic">No employee records found matching your criteria.</TableCell></TableRow>
                )}
            </TableBody>
          </Table>
      </Card>

      <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
        <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                <DialogTitle className="text-2xl font-black text-gray-900 uppercase tracking-tight">{editingEmployee ? 'Update Profile' : 'Onboard Employee'}</DialogTitle>
                <DialogDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Master Data Entry</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Full Legal Name</Label>
                            <Input name="name" value={formState.name} onChange={handleFormChange} className="h-11 text-lg font-black bg-gray-50 border-gray-300" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Department</Label>
                                <Select value={formState.department} onValueChange={v => setFormState(p => ({...p, department: v as any}))}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Position</Label>
                                <Select value={formState.position} onValueChange={v => setFormState(p => ({...p, position: v as any}))}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>{positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Joining Date (AD)</Label>
                            <Input type="date" name="joiningDate" value={formState.joiningDate.split('T')[0]} onChange={handleFormChange} className="h-10 font-mono" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl bg-blue-50 border-2 border-blue-100 space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-blue-900 border-b border-blue-200 pb-2">Wage Structure</h3>
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-blue-800 uppercase">Wage Basis</Label>
                                    <Select value={formState.wageBasis} onValueChange={v => setFormState(p => ({...p, wageBasis: v as any}))}>
                                        <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Monthly">Monthly Salary</SelectItem><SelectItem value="Hourly">Hourly Rate</SelectItem></SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-blue-800 uppercase">Amount (NPR)</Label>
                                    <Input type="number" name="wageAmount" value={formState.wageAmount} onChange={handleFormChange} className="h-10 bg-white font-black text-lg text-blue-900" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Contact Number</Label>
                            <Input name="mobileNumber" value={formState.mobileNumber} onChange={handleFormChange} className="h-10" />
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 border-t bg-white shrink-0">
                <Button variant="outline" onClick={() => setIsEmployeeDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest h-11 px-8">Cancel</Button>
                <Button onClick={handleEmployeeSubmit} className="font-black uppercase text-[10px] tracking-widest h-11 px-12 shadow-xl shadow-primary/20">Commit Entry</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
