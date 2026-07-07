'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, User, CalendarIcon, Image as ImageIcon, X, Phone, Heart, GraduationCap, ShieldCheck, FileText, Upload, Download, Loader2, Building2, DollarSign } from 'lucide-react';
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn, toNepaliDate, generateId } from '@/lib/utils';
import { uploadFile, deleteFile } from '@/services/storage-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

type EmployeeSortKey = 'name' | 'wageBasis' | 'wageAmount' | 'allowance' | 'authorship' | 'mobileNumber' | 'gender' | 'joiningDate' | 'status' | 'department' | 'position';
type SortDirection = 'asc' | 'desc';

const employeeStatuses: EmployeeStatus[] = ['Working', 'Long Leave', 'Resigned', 'Dismissed'];
const departments: Department[] = ['Production', 'Admin'];
const positions: Position[] = ['Manager', 'Supervisor', 'Machine Operator', 'Helpers', 'Staff'];
const bloodGroups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];


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
    bloodGroup: '' as BloodGroup | '',
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
  
  // Dialog State
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState(initialFormState);
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

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
  
  const resetForm = () => {
    setFormState(initialFormState);
    setEditingEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (docInputRef.current) docInputRef.current.value = '';
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
        bloodGroup: employee.bloodGroup || '',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactNumber: employee.emergencyContactNumber || '',
        qualification: employee.qualification || '',
        referredBy: employee.referredBy || '',
        photoURL: employee.photoURL || '',
        documents: employee.documents || [],
    });
    if (employee.photoURL) {
      setPhotoPreview(employee.photoURL);
    }
    setIsEmployeeDialogOpen(true);
  };

   const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 100 * 1024) { // 100 KB limit for profile photo
                toast({ title: 'Image Too Large', description: 'Max size for profile photo is 100KB.', variant: 'destructive' });
                return;
            }
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const removePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setFormState(prev => ({...prev, photoURL: ''}));
        if (photoInputRef.current) photoInputRef.current.value = '';
    };

    const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        
        setIsUploadingDoc(true);
        try {
            const filePath = `employee-docs/${user.username}-${Date.now()}-${file.name}`;
            const url = await uploadFile(file, filePath);
            
            const newDoc: EmployeeDocument = {
                id: generateId(),
                name: file.name,
                url,
                type: file.type,
                category: 'Other',
                uploadedAt: new Date().toISOString()
            };
            
            setFormState(prev => ({ ...prev, documents: [...prev.documents, newDoc] }));
            toast({ title: 'Document Uploaded', description: file.name });
        } catch (err: any) {
            toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsUploadingDoc(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const removeDocument = async (docId: string, url: string) => {
        try {
            await deleteFile(url);
            setFormState(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }));
            toast({ title: 'Document Removed' });
        } catch {
            toast({ title: 'Error removing document' });
        }
    };
  
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
      setFormState(prev => ({ ...prev, [name]: value }));
  };
  
  const handleDateChange = (fieldName: 'dateOfBirth' | 'joiningDate', date: Date | undefined) => {
    if (date) {
        setFormState(prev => ({...prev, [fieldName]: date.toISOString()}));
    }
  };


  const handleEmployeeSubmit = async () => {
    if (!user) return;

    if (!formState.name.trim() || !formState.wageAmount || !formState.mobileNumber) {
        toast({ title: 'Missing Info', description: 'Name, Wage, and Mobile are mandatory.', variant: 'destructive' });
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
          photoURL: photoURL,
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, { ...employeeData, lastModifiedBy: user.username });
        toast({ title: 'Success', description: 'Employee updated.' });
      } else {
        await addEmployee({ ...employeeData, createdBy: user.username, createdAt: new Date().toISOString() });
        toast({ title: 'Success', description: 'New employee added.' });
      }
      resetForm();
      setIsEmployeeDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save employee.', variant: 'destructive' });
    }
  };
  
  const handleDeleteEmployee = async (id: string, photoURL?: string) => {
    try {
      await deleteEmployee(id, photoURL);
      toast({ title: 'Employee Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete employee.', variant: 'destructive' });
    }
  };

  const requestSort = (key: EmployeeSortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  
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

  const renderStatusBadge = (status?: EmployeeStatus) => {
    const s = status || 'Working';
    switch (s) {
      case 'Working': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Working</Badge>;
      case 'Long Leave': return <Badge variant="default" className="bg-amber-500 text-black hover:bg-amber-600">Long Leave</Badge>;
      case 'Resigned': return <Badge variant="outline">Resigned</Badge>;
      case 'Dismissed': return <Badge variant="destructive">Dismissed</Badge>;
      default: return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Digital Workforce</h1>
          <p className="text-muted-foreground text-sm">Full lifecycle management for Shivam Packaging employees.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search by name or mobile..." className="pl-8 bg-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          {hasPermission('hr', 'create') && (
            <Button onClick={openAddEmployeeDialog} className="shadow-lg shadow-primary/20 font-bold">
                <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => <Card key={i} className="h-40 animate-pulse bg-muted/50" />)}
          </div>
      ) : (
          <Card className="shadow-sm border-gray-100 bg-white">
              <Table>
                <TableHeader className="bg-muted/30">
                    <TableRow>
                        <TableHead className="w-[300px]"><Button variant="ghost" onClick={() => requestSort('name')} className="font-bold">Employee <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                        <TableHead className="text-center font-bold">Status</TableHead>
                        <TableHead className="font-bold">Department / Position</TableHead>
                        <TableHead className="font-bold">Joining Date</TableHead>
                        <TableHead className="text-right font-bold">Wage Basis</TableHead>
                        <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredAndSortedEmployees.map(employee => (
                    <TableRow key={employee.id} className="group h-16 hover:bg-muted/30">
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border shadow-sm">
                                    <AvatarImage src={employee.photoURL} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{employee.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                    <span className="font-black text-gray-900 group-hover:text-primary transition-colors">{employee.name}</span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-bold"><Phone className="h-2.5 w-2.5"/> {employee.mobileNumber}</span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-center">{renderStatusBadge(employee.status)}</TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-gray-700">{employee.department}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">{employee.position}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{employee.joiningDate ? toNepaliDate(employee.joiningDate) : '—'}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-xs">
                            <div className="flex flex-col">
                                <span>Rs. {employee.wageAmount.toLocaleString()}</span>
                                <span className="text-[9px] text-muted-foreground uppercase tracking-widest">{employee.wageBasis}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onSelect={() => openEditEmployeeDialog(employee)}><Edit className="mr-2 h-4 w-4" /> Edit Profile</DropdownMenuItem>
                                    <DropdownMenuItem asChild><Link href={`/hr/payslip?employeeId=${employee.id}`} className="flex items-center"><FileText className="mr-2 h-4 w-4" /> View Payslips</Link></DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Purge Employee</DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the employee and their metadata.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteEmployee(employee.id, employee.photoURL)} className="bg-destructive">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
              </Table>
          </Card>
      )}

      {/* Modern Multi-Step Employee Dialog */}
      <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
            <DialogHeader className="p-6 pb-2 border-b bg-muted/5 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><User className="h-6 w-6 text-primary"/></div>
                    <div>
                        <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{editingEmployee ? 'Account Configuration' : 'Cloud Onboarding'}</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground mt-1">HR Digital Records Management</DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <ScrollArea className="flex-1 p-0 bg-gray-50/30">
                <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Left: Identity & Media */}
                    <div className="lg:col-span-4 space-y-8">
                        <section className="flex flex-col items-center gap-4 text-center">
                            <div className="relative group">
                                <Avatar className="h-40 w-40 border-4 border-white shadow-2xl ring-1 ring-black/5 rounded-[2rem]">
                                    <AvatarImage src={photoPreview || ''} className="object-cover" />
                                    <AvatarFallback className="bg-primary/5 text-4xl font-black text-primary/40"><ImageIcon className="h-12 w-12"/></AvatarFallback>
                                </Avatar>
                                {photoPreview && (
                                    <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-lg" onClick={removePhoto}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                                <div className="absolute inset-0 bg-black/40 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                                    <Upload className="h-8 w-8 text-white" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-black text-sm uppercase tracking-widest text-gray-900">Profile Photo</h3>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold">Standard passport format (max 100KB)</p>
                            </div>
                            <Input type="file" accept="image/*" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" />
                        </section>

                        <Separator className="border-dashed" />

                        <section className="space-y-6">
                            <div className="flex items-center gap-2 text-primary">
                                <Phone className="h-3.5 w-3.5" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Contact & Basic</h4>
                            </div>
                            <div className="grid gap-5">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest px-1">Mobile Number</Label>
                                    <Input name="mobileNumber" value={formState.mobileNumber} onChange={handleFormChange} className="h-10 bg-white font-bold" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest px-1">Email (Optional)</Label>
                                    <Input name="email" value={formState.email} onChange={handleFormChange} className="h-10 bg-white" placeholder="john@shivampack.com" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest px-1">Gender</Label>
                                        <Select value={formState.gender} onValueChange={v => handleSelectChange('gender', v)}>
                                            <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] uppercase font-black text-muted-foreground tracking-widest px-1">Blood Group</Label>
                                        <Select value={formState.bloodGroup} onValueChange={v => handleSelectChange('bloodGroup', v)}>
                                            <SelectTrigger className="h-10 bg-white"><SelectValue placeholder="—"/></SelectTrigger>
                                            <SelectContent>{bloodGroups.map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right: Work, Docs & Financial */}
                    <div className="lg:col-span-8 space-y-10">
                        <section className="space-y-6">
                            <div className="flex items-center gap-2 border-b-2 border-primary/10 pb-2">
                                <Building2 className="h-5 w-5 text-primary" />
                                <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Employment Details</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Full Legal Name <span className="text-destructive">*</span></Label>
                                    <Input name="name" value={formState.name} onChange={handleFormChange} className="h-11 text-lg font-black bg-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Department</Label>
                                    <Select value={formState.department} onValueChange={v => handleSelectChange('department', v)}>
                                        <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Position</Label>
                                    <Select value={formState.position} onValueChange={v => handleSelectChange('position', v)}>
                                        <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>{positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Joining Date (AD)</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start h-10 bg-white font-bold text-xs"><CalendarIcon className="mr-2 h-4 w-4"/> {formState.joiningDate ? toNepaliDate(formState.joiningDate) : 'Select'}</Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><DualCalendar selected={new NepaliDate(formState.joiningDate).toJsDate()} onSelect={d => handleDateChange('joiningDate', d)} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Current Status</Label>
                                    <Select value={formState.status} onValueChange={v => handleSelectChange('status', v)}>
                                        <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>{employeeStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-6">
                            <div className="flex items-center gap-2 border-b-2 border-primary/10 pb-2">
                                <DollarSign className="h-5 w-5 text-primary" />
                                <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Wage Structure</h3>
                            </div>
                            <div className="p-6 rounded-2xl bg-blue-50/50 border-2 border-blue-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Wage Basis</Label>
                                    <Select value={formState.wageBasis} onValueChange={v => handleSelectChange('wageBasis', v)}>
                                        <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Monthly">Monthly Salary</SelectItem><SelectItem value="Hourly">Hourly Wage</SelectItem></SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Amount (रु)</Label>
                                    <Input type="number" name="wageAmount" value={formState.wageAmount} onChange={handleFormChange} className="h-10 text-lg font-black bg-white text-blue-900" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Allowance (Optional)</Label>
                                    <Input type="number" name="allowance" value={formState.allowance} onChange={handleFormChange} className="h-10 bg-white" placeholder="0" />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-6 pb-12">
                            <div className="flex items-center justify-between border-b-2 border-primary/10 pb-2">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5 text-primary" />
                                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Verification Vault</h3>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => docInputRef.current?.click()} disabled={isUploadingDoc} className="h-8 text-[10px] uppercase font-black tracking-widest border-gray-300">
                                    {isUploadingDoc ? <Loader2 className="animate-spin h-3 w-3 mr-2" /> : <Upload className="h-3 w-3 mr-2" />}
                                    Upload Document
                                </Button>
                                <input type="file" ref={docInputRef} onChange={handleDocumentUpload} className="hidden" />
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {formState.documents.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border bg-white group hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-primary/5"><FileText className="h-4 w-4 text-primary/60"/></div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-xs font-black truncate text-gray-900">{doc.name}</span>
                                                <span className="text-[9px] uppercase font-bold text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" asChild><a href={doc.url} target="_blank"><Download className="h-3.5 w-3.5"/></a></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeDocument(doc.id, doc.url)}><Trash2 className="h-3.5 w-3.5"/></Button>
                                        </div>
                                    </div>
                                ))}
                                {formState.documents.length === 0 && (
                                    <div className="col-span-2 py-8 text-center border border-dashed rounded-2xl bg-gray-50/50">
                                        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Digital Vault Empty</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 border-t bg-white shrink-0">
                <Button variant="outline" onClick={() => setIsEmployeeDialogOpen(false)} className="h-11 px-8 font-bold text-xs uppercase tracking-widest border-gray-300">Cancel</Button>
                <Button onClick={handleEmployeeSubmit} className="h-11 px-12 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                    {editingEmployee ? 'Commit Updates' : 'Authorize Onboarding'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
