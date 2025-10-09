
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { exportData } from "@/services/backup-service";

const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';

const handleAutomaticBackup = async () => {
    if (!isDesktop) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastBackupDate = localStorage.getItem('lastAutomaticBackupDate');

    if (lastBackupDate === today) {
        console.log("Automatic backup for today already performed.");
        return;
    }

    console.log("Performing automatic daily backup...");
    try {
        const data = await exportData();
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `starweb-autobackup-${today}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        localStorage.setItem('lastAutomaticBackupDate', today);
        console.log("Automatic backup successful.");
    } catch (error) {
        console.error("Automatic backup failed:", error);
    }
};

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    useEffect(() => {
        if (user && !loading) {
            handleAutomaticBackup();
        }
    }, [user, loading]);

    if (loading) {
         return (
            <div className="flex h-screen items-center justify-center">
                <p>Loading application...</p>
            </div>
        );
    }
    
    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
       return <AuthRedirect>{() => children}</AuthRedirect>
    }
    
    if (isAuthPage) {
        return <>{children}</>;
    }

    return (
        <AuthRedirect>
            {(user) => (
                <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset>
                        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 md:hidden">
                            <SidebarTrigger />
                            <h1 className="text-xl font-semibold">STARWEB</h1>
                        </header>
                        <main className="p-4 sm:px-6 sm:py-0 md:p-8">
                            {children}
                        </main>
                    </SidebarInset>
                </SidebarProvider>
            )}
        </AuthRedirect>
    );
}
