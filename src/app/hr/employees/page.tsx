
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, User, CalendarIcon } from 'lucide-react';
import type { Employee, WageBasis, Gender, IdentityType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { cn, toNepaliDate } from '@/lib/utils';


type EmployeeSortKey = 'name' | 'wageBasis' | 'wageAmount' | 'allowance' | 'authorship' | 'mobileNumber' | 'gender' | 'joiningDate';
type SortDirection = 'asc' | 'desc';

const initialFormState = {
    name: '',
    wageBasis: 'Monthly' as WageBasis,
    wageAmount: '',
    allowance: '',
    address: '',
    gender: 'Male' as Gender,
    mobileNumber: '',
    dateOfBirth: new Date().toISOString(),
    joiningDate: new Date().toISOString(),
    identityType: 'Citizenship' as IdentityType,
    documentNumber: ''
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog State
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState(initialFormState);


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
  };

  const openAddEmployeeDialog = () => {
    resetForm();
    setIsEmployeeDialogOpen(true);
  };

  const openEditEmployeeDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormState({
        name: employee.name,
        wageBasis: employee.wageBasis,
        wageAmount: String(employee.wageAmount),
        allowance: String(employee.allowance || ''),
        address: employee.address || '',
        gender: employee.gender || 'Male',
        mobileNumber: employee.mobileNumber || '',
        dateOfBirth: employee.dateOfBirth || new Date().toISOString(),
        joiningDate: employee.joiningDate || new Date().toISOString(),
        identityType: employee.identityType || 'Citizenship',
        documentNumber: employee.documentNumber || ''
    });
    setIsEmployeeDialogOpen(true);
  };
  
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: keyof typeof initialFormState, value: string) => {
      setFormState(prev => ({ ...prev, [name]: value }));
  };
  
  const handleDateChange = (fieldName: 'dateOfBirth' | 'joiningDate', date: Date | undefined) => {
    if (date) {
        setFormState(prev => ({...prev, [fieldName]: date.toISOString()}));
    }
  };


  const handleEmployeeSubmit = async () => {
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to perform this action.', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(formState.wageAmount);
    const allowanceAmount = parseFloat(formState.allowance) || 0;
    if (formState.name.trim() === '' || isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Please fill all fields with valid values.', variant: 'destructive' });
      return;
    }

    try {
      const employeeData = {
          name: formState.name.trim(),
          wageBasis: formState.wageBasis,
          wageAmount: amount,
          allowance: allowanceAmount,
          address: formState.address,
          gender: formState.gender,
          mobileNumber: formState.mobileNumber,
          dateOfBirth: formState.dateOfBirth,
          joiningDate: formState.joiningDate,
          identityType: formState.identityType,
          documentNumber: formState.documentNumber,
      };

      if (editingEmployee) {
        const updatedEmployeeData = { ...employeeData, lastModifiedBy: user.username };
        await updateEmployee(editingEmployee.id, updatedEmployeeData);
        toast({ title: 'Success', description: 'Employee updated.' });
      } else {
        const newEmployeeData = { ...employeeData, createdBy: user.username };
        await addEmployee(newEmployeeData);
        toast({ title: 'Success', description: 'New employee added.' });
      }
      resetForm();
      setIsEmployeeDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save employee.', variant: 'destructive' });
    }
  };
  
  const handleDeleteEmployee = async (id: string) => {
    try {
      await deleteEmployee(id);
      toast({ title: 'Employee Deleted', description: 'The employee record has been deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete employee.', variant: 'destructive' });
    }
  };

  const requestSort = (key: EmployeeSortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedEmployees = useMemo(() => {
    let filtered = [...employees];
    
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(employee =>
        employee.name.toLowerCase().includes(lowercasedQuery) ||
        (employee.mobileNumber || '').toLowerCase().includes(lowercasedQuery)
      );
    }

    filtered.sort((a, b) => {
        if (sortConfig.key === 'authorship') {
             const aDate = a.lastModifiedAt || a.createdAt;
             const bDate = b.lastModifiedAt || b.createdAt;
             if (!aDate || !bDate) return 0;
             if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
             if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

      const aVal = a[sortConfig.key as keyof Employee];
      const bVal = b[sortConfig.key as keyof Employee];

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (aVal < bVal) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return filtered;
  }, [employees, sortConfig, searchQuery]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
        </div>
      );
    }

    if (employees.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">No employees found</h3>
            <p className="text-sm text-muted-foreground">Get started by adding a new employee.</p>
            {hasPermission('hr', 'create') && (
              <Button className="mt-4" onClick={openAddEmployeeDialog}>
                <Plus className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Button variant="ghost" onClick={() => requestSort('name')}>Employee Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('joiningDate')}>Joining Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('mobileNumber')}>Mobile Number <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('wageAmount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('allowance')}>Allowance <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedEmployees.map(employee => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell>{employee.joiningDate ? toNepaliDate(employee.joiningDate) : 'N/A'}</TableCell>
                <TableCell>{employee.mobileNumber || 'N/A'}</TableCell>
                <TableCell>{employee.wageAmount.toLocaleString()}</TableCell>
                <TableCell>{(employee.allowance || 0).toLocaleString()}</TableCell>
                <TableCell>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                {employee.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                <span>{employee.lastModifiedBy || employee.createdBy}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>
                                    Created by: {employee.createdBy}
                                    {employee.createdAt ? ` on ${format(new Date(employee.createdAt), "PP")}` : ''}
                                </p>
                                {employee.lastModifiedBy && employee.lastModifiedAt && (
                                    <p>
                                    Modified by: {employee.lastModifiedBy}
                                    {employee.lastModifiedAt ? ` on ${format(new Date(employee.lastModifiedAt), "PP")}` : ''}
                                    </p>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {hasPermission('hr', 'edit') && <DropdownMenuItem onSelect={() => openEditEmployeeDialog(employee)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                      {hasPermission('hr', 'delete') && <DropdownMenuSeparator />}
                      {hasPermission('hr', 'delete') && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the employee record. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteEmployee(employee.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };
  
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">Manage employee records and wage information.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search employees..."
              className="pl-8 sm:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('hr', 'create') && (
            <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
              <DialogTrigger asChild><Button onClick={openAddEmployeeDialog}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button></DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                  <DialogDescription>{editingEmployee ? 'Update the details for this employee.' : 'Enter the details for the new employee.'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="employee-name">Employee Name</Label>
                    <Input id="employee-name" name="name" value={formState.name} onChange={handleFormChange} />
                  </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="mobileNumber">Mobile Number</Label>
                            <Input id="mobileNumber" name="mobileNumber" type="tel" value={formState.mobileNumber} onChange={handleFormChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gender">Gender</Label>
                            <Select value={formState.gender} onValueChange={(value: Gender) => handleSelectChange('gender', value)}>
                                <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Female">Female</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea id="address" name="address" value={formState.address} onChange={handleFormChange} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dateOfBirth">Date of Birth</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formState.dateOfBirth && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formState.dateOfBirth ? `${toNepaliDate(formState.dateOfBirth)} BS (${format(new Date(formState.dateOfBirth), "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <DualCalendar selected={new Date(formState.dateOfBirth)} onSelect={(date) => handleDateChange('dateOfBirth', date)} />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="joiningDate">Joining Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formState.joiningDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formState.joiningDate ? `${toNepaliDate(formState.joiningDate)} BS (${format(new Date(formState.joiningDate), "PPP")})` : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <DualCalendar selected={new Date(formState.joiningDate)} onSelect={(date) => handleDateChange('joiningDate', date)} />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="identityType">Type of Identity</Label>
                            <Select value={formState.identityType} onValueChange={(value: IdentityType) => handleSelectChange('identityType', value)}>
                                <SelectTrigger id="identityType"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Citizenship">Citizenship</SelectItem>
                                    <SelectItem value="Voters Card">Voters Card</SelectItem>
                                    <SelectItem value="License">License</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="documentNumber">Document Number</Label>
                            <Input id="documentNumber" name="documentNumber" value={formState.documentNumber} onChange={handleFormChange} />
                        </div>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                            <Label htmlFor="wage-basis">Wage Basis</Label>
                            <Select value={formState.wageBasis} onValueChange={(value: WageBasis) => handleSelectChange('wageBasis', value)}>
                            <SelectTrigger id="wage-basis"><SelectValue placeholder="Select a basis" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Monthly">Monthly</SelectItem>
                                <SelectItem value="Hourly">Hourly</SelectItem>
                            </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="wage-amount">Amount</Label>
                            <Input id="wage-amount" name="wageAmount" type="number" value={formState.wageAmount} onChange={handleFormChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="allowance">Allowance</Label>
                            <Input id="allowance" name="allowance" type="number" value={formState.allowance} onChange={handleFormChange} placeholder="e.g. 500" />
                        </div>
                     </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEmployeeDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleEmployeeSubmit}>{editingEmployee ? 'Save Changes' : 'Save Employee'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
