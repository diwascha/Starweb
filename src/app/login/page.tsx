
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
import { Loader2, ShieldCheck, Lock, User as UserIcon, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AuthErrorCodes } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { getAdminCredentials, getUserByLogin, loginWithUsername } from '@/services/user-service';
import { onSettingUpdate } from '@/services/settings-service';
import type { AppBranding } from '@/lib/types';
import logo from '@/app/signup/StarSutra.png';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  loginString: z.string().min(1, { message: 'Username or Email is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
  // Honeypot field to catch automated bots
  hp_field: z.string().max(0).optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, login, loading: authLoading } = useAuth();
  const auth = useAuthService();
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });

  // Brute force protection state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaChallenge, setCaptchaChallenge] = useState({ a: 0, b: 0 });

  const generateCaptcha = () => {
    setCaptchaChallenge({
      a: Math.floor(Math.random() * 10) + 1,
      b: Math.floor(Math.random() * 10) + 1
    });
    setCaptchaAnswer('');
  };

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

  // Initialize CAPTCHA when threshold is reached
  useEffect(() => {
    if (failedAttempts === 3) {
      generateCaptcha();
    }
  }, [failedAttempts]);

  const onSubmit = async (data: LoginFormValues) => {
    // 0. Honeypot check (bots often fill all fields)
    if (data.hp_field) return;

    setIsSubmitting(true);
    
    // 1. Interactive Challenge Verification (Triggers after 3 failed attempts)
    if (failedAttempts >= 3) {
      const expected = captchaChallenge.a + captchaChallenge.b;
      if (parseInt(captchaAnswer) !== expected) {
        toast({ 
            title: 'Verification Failed', 
            description: 'Incorrect answer to the security challenge. Please try again.', 
            variant: 'destructive' 
        });
        generateCaptcha();
        setIsSubmitting(false);
        return;
      }
    }
    
    // 2. Administrator Bypass
    if (data.loginString.toLowerCase() === 'administrator') {
        const adminCreds = getAdminCredentials();
        if (data.password === adminCreds.password) {
            await login({ username: 'Administrator', id: 'admin', permissions: {}, isApproved: true } as any, true);
            toast({ title: 'Success', description: 'Admin session started.' });
        } else {
            setFailedAttempts(prev => prev + 1);
            toast({ title: 'Access Denied', description: 'Invalid administrator password.', variant: 'destructive'});
        }
        setIsSubmitting(false);
        return;
    }

    try {
      // 3. Resolve username and authenticate
      await loginWithUsername(auth, data.loginString, data.password);
      
      // 4. Fetch User Record from Firestore
      const cloudUser = await getUserByLogin(data.loginString);
      
      if (!cloudUser) {
        await auth.signOut();
        toast({ title: 'Profile Error', description: 'Account authenticated but profile missing.', variant: 'destructive' });
        return;
      }

      // 5. Verify Approval Status
      if (cloudUser.isApproved === false) {
        await auth.signOut();
        toast({ 
            title: 'Account Pending', 
            description: 'Your account is pending administrator approval.', 
            variant: 'destructive' 
        });
        return;
      }

      // 6. Establish local session tracking
      await login(cloudUser, false);
      toast({ title: 'Welcome', description: `Signed in as ${cloudUser.username}` });
      setFailedAttempts(0); // Reset on success
      
    } catch (error: any) {
      setFailedAttempts(prev => prev + 1);
      let errorMessage = 'Login failed. Please check your credentials.';
      
      if (error.message === "Username does not exist in our system.") {
          errorMessage = error.message;
      } else if (error.code === AuthErrorCodes.INVALID_PASSWORD || error.code === 'auth/invalid-credential') {
          errorMessage = 'Incorrect password.';
      } else if (error.code === AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER) {
          errorMessage = 'Too many attempts. Locked for security.';
      }
      
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
              {/* Honeypot field (hidden from users) */}
              <div className="hidden" aria-hidden="true">
                <input {...register('hp_field')} tabIndex={-1} autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginString" className="text-xs font-bold uppercase text-muted-foreground">Username or Email</Label>
                <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

              {/* Anti-Brute Force Challenge */}
              {failedAttempts >= 3 && (
                <div className="space-y-3 p-4 bg-amber-50 rounded-xl border-2 border-amber-200 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase text-amber-800 tracking-widest">Security Challenge</Label>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-amber-700" onClick={generateCaptcha}>
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-white border-2 border-amber-200 rounded-lg h-10 flex items-center justify-center font-black text-amber-900 text-lg tabular-nums">
                            {captchaChallenge.a} + {captchaChallenge.b} = ?
                        </div>
                        <Input 
                            value={captchaAnswer} 
                            onChange={e => setCaptchaAnswer(e.target.value)}
                            placeholder="Answer"
                            className="w-24 h-10 border-amber-200 bg-white font-black text-center"
                            autoComplete="off"
                        />
                    </div>
                    <p className="text-[9px] text-amber-700 font-bold uppercase leading-tight">
                        Multiple failed attempts detected. Please solve the math to prove you are human.
                    </p>
                </div>
              )}

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
