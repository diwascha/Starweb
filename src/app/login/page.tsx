
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { exportData } from '@/services/backup-service';
import { format } from 'date-fns';
import { signInWithEmailAndPassword, AuthErrorCodes } from 'firebase/auth';
import { useAuthService } from '@/firebase';


const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const auth = useAuthService();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });
  
  // Effect for redirecting after successful login
  useEffect(() => {
    if (user && !authLoading) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

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
            link.download = `starweb-autobackup-${today}.json`;
            link.click();
            localStorage.setItem('lastAutoBackupDate', today);
            toast({
                title: "Automatic Backup",
                description: `Backup file "starweb-autobackup-${today}.json" saved to your Downloads.`,
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
    const email = `${data.username.toLowerCase()}@starweb.com`;

    try {
      await signInWithEmailAndPassword(auth, email, data.password);
      
      toast({ title: 'Success', description: 'Logged in successfully. Redirecting...' });
      await handleDailyBackup();
      // The useEffect will handle the redirect
      
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
         <div className="flex justify-center items-center gap-2 mb-6">
            <h1 className="text-3xl font-semibold">STARWEB</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <CardDescription>Enter your credentials to access your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Username"
                  {...register('username')}
                  disabled={isSubmitting}
                />
                {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')} disabled={isSubmitting}/>
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
