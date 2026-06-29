'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { exportData } from '@/services/backup-service';
import { format } from 'date-fns';
import { signInWithEmailAndPassword, AuthErrorCodes } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { getAdminCredentials, getUsers } from '@/services/user-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { AppBranding } from '@/lib/types';


const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, login, loading: authLoading } = useAuth();
  const auth = useAuthService();
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });
  
  useEffect(() => {
    if (user && !authLoading) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const unsubBranding = onSettingUpdate('appBranding', (s) => {
        if (s?.value) setAppBranding(s.value);
    });
    return () => unsubBranding();
  }, []);

  const handleDailyBackup = async () => {
    const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
    if (!isDesktop) return;

    const lastBackupDate = localStorage.getItem('lastAutoBackupDate');
    const today = format(new Date(), 'yyyy-MM-dd');

    if (lastBackupDate !== today) {
        console.log('Performing automatic daily backup...');
        try {
            const data = await exportData();
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
            const link = document.createElement("a");
            link.href = jsonString;
            link.download = `starsutra-autobackup-${today}.json`;
            link.click();
            localStorage.setItem('lastAutoBackupDate', today);
            toast({
                title: "Automatic Backup",
                description: `Backup file "starsutra-autobackup-${today}.json" saved to your Downloads.`,
                duration: 8000
            });
        } catch (error) {
            console.error("Automatic backup failed:", error);
            toast({
                title: "Auto-Backup Failed",
                description: "Could not create automatic backup.",
                variant: "destructive",
            });
        }
    }
  };


  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    
    if (data.username.toLowerCase() === 'administrator') {
        const adminCreds = getAdminCredentials();
        if (data.password === adminCreds.password) {
            await login({ username: 'Administrator', id: 'admin', permissions: {}}, true);
            toast({ title: 'Success', description: 'Admin logged in successfully. Redirecting...' });
            await handleDailyBackup();
        } else {
            toast({ title: 'Login Failed', description: 'Invalid username or password.', variant: 'destructive'});
        }
        setIsSubmitting(false);
        return;
    }

    const email = `${data.username.toLowerCase()}@starsutra.com`;

    try {
      await signInWithEmailAndPassword(auth, email, data.password);
      
      const localUsers = getUsers();
      const localUser = localUsers.find(u => u.username.toLowerCase() === data.username.toLowerCase());
      if (localUser) {
        await login(localUser, false);
      }

      toast({ title: 'Success', description: 'Logged in successfully. Redirecting...' });
      await handleDailyBackup();
      
    } catch (error: any) {
      let errorMessage = 'An unknown error occurred.';
      if (error.code) {
        switch (error.code) {
          case AuthErrorCodes.INVALID_PASSWORD:
          case AuthErrorCodes.INVALID_EMAIL:
          case 'auth/invalid-credential':
             errorMessage = 'Invalid username or password.';
             break;
          case AuthErrorCodes.USER_DELETED:
             errorMessage = 'This user account has been deleted.';
             break;
          default:
             errorMessage = 'Login failed. Please check your credentials and try again.';
             break;
        }
      }
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
         <div className="flex flex-col justify-center items-center gap-4 mb-8 text-center">
            <div className="w-28 h-28 rounded-2xl bg-white shadow-xl flex items-center justify-center overflow-hidden border">
                {appBranding.appLogoURL ? (
                    <Image 
                        src={appBranding.appLogoURL} 
                        width={112} 
                        height={112} 
                        alt="App Logo"
                        className="object-contain"
                    />
                ) : (
                    <ImageIcon className="h-12 w-12 text-muted-foreground opacity-10" />
                )}
            </div>
            <div className="space-y-1">
                <h1 className="text-4xl font-black tracking-tight">{appBranding.appName}</h1>
                {appBranding.appMotto && (
                    <p className="text-sm font-medium text-muted-foreground italic uppercase tracking-wider">{appBranding.appMotto}</p>
                )}
            </div>
        </div>
        <Card className="shadow-2xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Account Access</CardTitle>
            <CardDescription>Enter your credentials to manage your business operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="e.g. administrator"
                  {...register('username')}
                  disabled={isSubmitting}
                  className="h-12"
                />
                {errors.username && <p className="text-sm text-destructive font-medium">{errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  {...register('password')} 
                  disabled={isSubmitting}
                  className="h-12"
                />
                {errors.password && <p className="text-sm text-destructive font-medium">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isSubmitting ? 'Verifying...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
