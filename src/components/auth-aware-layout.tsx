
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { usePathname } from "next/navigation";

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    const isAuthPage = pathname === '/login';

    return (
        <>
            <AuthRedirect />
            {loading ? (
                <div className="flex h-screen items-center justify-center">
                    <p>Loading application...</p>
                </div>
            ) : (
                isAuthPage || !user ? (
                    <>{children}</>
                ) : (
                    <SidebarProvider>
                        <AppSidebar />
                        <SidebarInset>{children}</SidebarInset>
                    </SidebarProvider>
                )
            )}
        </>
    );
}
