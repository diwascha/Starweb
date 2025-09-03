
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, Calendar, FileText } from "lucide-react";
import Link from "next/link";
import { useAuth } from '@/hooks/use-auth';

export default function HRPage() {
  const { hasPermission } = useAuth();
  
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HR Management</h1>
        <p className="text-muted-foreground">Manage employees, attendance, and payroll.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {hasPermission('hr', 'view') && (
            <Link href="/hr/employees">
                <Card className="hover:bg-accent hover:text-accent-foreground transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-6 w-6"/>
                            <span>Employees</span>
                        </CardTitle>
                        <CardDescription>Manage employee records and wage information.</CardDescription>
                    </CardHeader>
                </Card>
            </Link>
        )}
         {hasPermission('hr', 'view') && (
            <Link href="/hr/attendance">
                <Card className="hover:bg-accent hover:text-accent-foreground transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-6 w-6"/>
                            <span>Attendance</span>
                        </CardTitle>
                        <CardDescription>Record and track daily employee attendance.</CardDescription>
                    </CardHeader>
                </Card>
            </Link>
        )}
         {hasPermission('hr', 'view') && (
            <Link href="#">
                <Card className="hover:bg-accent hover:text-accent-foreground transition-colors opacity-50 cursor-not-allowed">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-6 w-6"/>
                            <span>Payroll</span>
                        </CardTitle>
                        <CardDescription>Generate and manage payroll reports. (Coming Soon)</CardDescription>
                    </CardHeader>
                </Card>
            </Link>
        )}
      </div>
    </div>
  );
}
