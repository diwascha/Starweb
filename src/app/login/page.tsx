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
import { Loader2, ShieldCheck, Lock, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { signInWithEmailAndPassword, AuthErrorCodes } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { getAdminCredentials, getUserByLogin } from '@/services/user-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { AppBranding } from '@/lib/types';
import logo from '@/app/signup/StarSutra.png';

const loginSchema = z.object({
  loginString: z.string().min(1, { message: 'Username or Email is required' }),
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

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    
    // 1. Hardcoded Administrator Bypass
    if (data.loginString.toLowerCase() === 'administrator') {
        const adminCreds = getAdminCredentials();
        if (data.password === adminCreds.password) {
            await login({ username: 'Administrator', id: 'admin', permissions: {}, isApproved: true } as any, true);
            toast({ title: 'Success', description: 'Admin session started.' });
        } else {
            toast({ title: 'Access Denied', description: 'Invalid administrator password.', variant: 'destructive'});
        }
        setIsSubmitting(false);
        return;
    }

    try {
      // 2. Fetch User Record from Firestore (by Username or Email)
      const cloudUser = await getUserByLogin(data.loginString);
      
      if (!cloudUser) {
        toast({ title: 'Account Not Found', description: 'No user matches those credentials.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      // 3. Verify Approval Status
      if (cloudUser.isApproved === false) {
        toast({ 
            title: 'Account Pending', 
            description: 'Your account is pending administrator approval.', 
            variant: 'destructive' 
        });
        setIsSubmitting(false);
        return;
      }

      // 4. Authenticate via Firebase Auth
      const authEmail = cloudUser.email || `${cloudUser.username}@starsutra.com`;
      await signInWithEmailAndPassword(auth, authEmail, data.password);
      
      // 5. Establish local session
      await login(cloudUser, false);
      toast({ title: 'Welcome', description: `Signed in as ${cloudUser.username}` });
      
    } catch (error: any) {
      let errorMessage = 'Login failed. Please check your password.';
      if (error.code === AuthErrorCodes.INVALID_PASSWORD) errorMessage = 'Incorrect password.';
      if (error.code === AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER) errorMessage = 'Too many attempts. Locked for security.';
      
      toast({
        title: 'Authentication Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
         <div className="flex flex-col justify-center items-center gap-4 mb-8 text-center">
            <div className="w-24 h-24 rounded-3xl bg-white shadow-2xl flex items-center justify-center overflow-hidden border-2 border-primary/20 p-2">
                <img 
                    src={logo.src} 
                    width="80" 
                    height="80" 
                    alt="App Logo"
                    className="object-contain"
                />
            </div>
            <div className="space-y-1">
                <h1 className="text-3xl font-black tracking-tight text-gray-900">{appBranding.appName}</h1>
                {appBranding.appMotto && (
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{appBranding.appMotto}</p>
                )}
            </div>
        </div>
        <Card className="shadow-2xl border-none ring-1 ring-black/5 bg-white">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary"/>
                Security Access
            </CardTitle>
            <CardDescription className="text-xs">Authorized business users only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
              <div className="space-y-2">
                <Label htmlFor="loginString" className="text-xs font-bold uppercase text-muted-foreground">Username or Email</Label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        id="loginString"
                        type="text"
                        placeholder="Username or email"
                        {...register('loginString')}
                        disabled={isSubmitting}
                        className="flex h-11 w-full rounded-lg border-2 border-muted bg-background pl-10 pr-3 py-2 text-sm font-semibold transition-all focus:border-primary focus:ring-0 outline-none"
                    />
                </div>
                {errors.loginString && <p className="text-[10px] text-destructive font-black uppercase">{errors.loginString.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" title="Enter your secure password" className="text-xs font-bold uppercase text-muted-foreground">Secure Password</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    {...register('password')} 
                    disabled={isSubmitting}
                    className="flex h-11 w-full rounded-lg border-2 border-muted bg-background pl-10 pr-3 py-2 text-sm font-semibold transition-all focus:border-primary focus:ring-0 outline-none"
                    />
                </div>
                {errors.password && <p className="text-[10px] text-destructive font-black uppercase">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full h-11 text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Verifying...' : 'Authorize Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="mt-8 text-center text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            StarSutra Integrated Enterprise Suite
        </p>
      </div>
    </div>
  );
}
