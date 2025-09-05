
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search } from 'lucide-react';
import type { Employee, WageBasis } from '@/lib/types';
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

type EmployeeSortKey = 'name' | 'wageBasis' | 'wageAmount';
type SortDirection = 'asc' | 'desc';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog State
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [wageBasis, setWageBasis] = useState<WageBasis>('Monthly');
  const [wageAmount, setWageAmount] = useState('');

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
    setEmployeeName('');
    setWageBasis('Monthly');
    setWageAmount('');
    setEditingEmployee(null);
  };

  const openAddEmployeeDialog = () => {
    resetForm();
    setIsEmployeeDialogOpen(true);
  };

  const openEditEmployeeDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeName(employee.name);
    setWageBasis(employee.wageBasis);
    setWageAmount(String(employee.wageAmount));
    setIsEmployeeDialogOpen(true);
  };

  const handleEmployeeSubmit = async () => {
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to perform this action.', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(wageAmount);
    if (employeeName.trim() === '' || isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Please fill all fields with valid values.', variant: 'destructive' });
      return;
    }

    try {
      if (editingEmployee) {
        const updatedEmployeeData: Partial<Omit<Employee, 'id'>> = {
          name: employeeName.trim(),
          wageBasis,
          wageAmount: amount,
          lastModifiedBy: user.username,
        };
        await updateEmployee(editingEmployee.id, updatedEmployeeData);
        toast({ title: 'Success', description: 'Employee updated.' });
      } else {
        const newEmployeeData: Omit<Employee, 'id'> = {
          name: employeeName.trim(),
          wageBasis,
          wageAmount: amount,
          createdBy: user.username,
        };
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
        employee.name.toLowerCase().includes(lowercasedQuery)
      );
    }

    filtered.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
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
              <TableHead><Button variant="ghost" onClick={() => requestSort('wageBasis')}>Wage Basis <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('wageAmount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedEmployees.map(employee => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell>{employee.wageBasis}</TableCell>
                <TableCell>{employee.wageAmount.toLocaleString()}</TableCell>
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
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                  <DialogDescription>{editingEmployee ? 'Update the details for this employee.' : 'Enter the details for the new employee.'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="employee-name">Employee Name</Label>
                    <Input id="employee-name" value={employeeName} onChange={e => setEmployeeName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wage-basis">Wage Basis</Label>
                    <Select value={wageBasis} onValueChange={(value: WageBasis) => setWageBasis(value)}>
                      <SelectTrigger id="wage-basis"><SelectValue placeholder="Select a basis" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Hourly">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wage-amount">Amount</Label>
                    <Input id="wage-amount" type="number" value={wageAmount} onChange={e => setWageAmount(e.target.value)} />
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
