
'use client';

import { useAuth, AuthRedirect } from "@/hooks/use-auth";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export default function AuthAwareLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AuthRedirect>
                {(user) => (
                    <SidebarProvider>
                        <AppSidebar />
                        <SidebarInset>{children}</SidebarInset>
                    </SidebarProvider>
                )}
            </AuthRedirect>
        </>
    );
}
