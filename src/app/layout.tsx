
import type {Metadata} from 'next';
import './globals.css';
import {SidebarProvider, SidebarInset} from '@/components/ui/sidebar';
import {AppSidebar} from '@/components/app-sidebar';
import {Toaster} from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import AuthAwareLayout from '@/components/auth-aware-layout';

export const metadata: Metadata = {
  title: 'STARWEB',
  description: 'Generate test reports for multiple products.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background">
        <AuthProvider>
            <AuthAwareLayout>
                {children}
            </AuthAwareLayout>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
