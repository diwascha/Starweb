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
import { Loader2, ShieldCheck, Lock, User as UserIcon, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AuthErrorCodes } from 'firebase/auth';
import { useAuthService } from '@/firebase';
import { getUserById, loginWithUsername } from '@/services/user-service';
import { onSettingUpdate } from '@/services/settings-service';
import { logAudit } from '@/services/log-service';
import { runDailyAutoBackup } from '@/lib/auto-backup';
import { queueFailedLogin, flushFailedLogins } from '@/lib/login-audit';
import type { AppBranding } from '@/lib/types';
import logo from '@/app/signup/StarSutra.png';

const FAILED_ATTEMPTS_KEY = 'starsutra:failedLoginAttempts';

/**
 * What sign-in is actually waiting on, in order.
 *
 * Every one of these is a network round trip, and on a slow connection the
 * whole sequence used to be a single spinner on a dead-looking page - which
 * reads as a freeze rather than as progress. Each stage is set at the real
 * await boundary, so the bar reflects work that has genuinely happened; none
 * of it is on a timer.
 */
const LOGIN_STAGES = [
  { key: 'credentials', label: 'Checking your credentials', pct: 30 },
  { key: 'profile',     label: 'Loading your profile',      pct: 60 },
  { key: 'access',      label: 'Confirming your access',    pct: 80 },
  { key: 'workspace',   label: 'Opening your workspace',    pct: 100 },
] as const;

type LoginStage = typeof LOGIN_STAGES[number]['key'];

/** After this long on one stage, say so rather than letting it look hung. */
const SLOW_NETWORK_MS = 8000;

const loginSchema = z.object({
  loginString: z.string().min(1, { message: 'Username or Email is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
  hp_field: z.string().max(0).optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<LoginStage | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  // Shown inline under the form. A toast is easy to miss, and on a failed
  // sign-in the reason is the whole message.
  const [formError, setFormError] = useState<string | null>(null);
  const { user, login, loading: authLoading } = useAuth();
  const auth = useAuthService();
  const [appBranding, setAppBranding] = useState<AppBranding>({ appName: 'StarSutra', appMotto: '' });

  // Persisted, so refreshing the page no longer clears the captcha gate.
  // This is friction, not a security boundary - anyone can edit localStorage.
  // The real brute-force protection is Firebase's own server-side throttle,
  // which surfaces below as TOO_MANY_ATTEMPTS_TRY_LATER.
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(FAILED_ATTEMPTS_KEY));
      if (Number.isFinite(stored) && stored > 0) setFailedAttempts(stored);
    } catch { /* private window - gate falls back to in-memory */ }
  }, []);

  const recordFailedAttempt = () => {
    setFailedAttempts(prev => {
      const next = prev + 1;
      try { localStorage.setItem(FAILED_ATTEMPTS_KEY, String(next)); } catch {}
      return next;
    });
  };

  const clearFailedAttempts = () => {
    setFailedAttempts(0);
    try { localStorage.removeItem(FAILED_ATTEMPTS_KEY); } catch {}
  };
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

  useEffect(() => {
    // `=== 3` meant the challenge was issued once and then reused unchanged
    // for the fourth attempt onward, which defeats the point of having one.
    if (failedAttempts >= 3) {
      generateCaptcha();
    }
  }, [failedAttempts]);

  // If a stage sits for longer than a person will happily wait, say so. The
  // timer is only ever used to add reassurance - never to advance the bar.
  useEffect(() => {
    if (!stage) { setIsSlow(false); return; }
    setIsSlow(false);
    const timer = setTimeout(() => setIsSlow(true), SLOW_NETWORK_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  const currentStage = stage ? LOGIN_STAGES.find(s => s.key === stage) : null;
  const progressPct = currentStage?.pct ?? 0;

  const onSubmit = async (data: LoginFormValues) => {
    if (data.hp_field) return;

    setFormError(null);
    setIsSubmitting(true);

    if (failedAttempts >= 3) {
      const expected = captchaChallenge.a + captchaChallenge.b;
      // Strict parse: parseInt('5x') is 5, which let a wrong answer through.
      const given = /^\s*-?\d+\s*$/.test(captchaAnswer) ? Number(captchaAnswer) : NaN;
      if (given !== expected) {
        setFormError('That answer was not correct. Here is a new question.');
        generateCaptcha();
        setIsSubmitting(false);
        return;
      }
    }

    try {
      setStage('credentials');
      const userCredential = await loginWithUsername(auth, data.loginString, data.password);
      const firebaseUser = userCredential.user;

      setStage('profile');
      const cloudUser = await getUserById(firebaseUser.uid);

      setStage('access');

      if (!cloudUser) {
        await auth.signOut();
        // This is the exact state a half-finished admin provisioning leaves
        // behind: the sign-in account exists, the profile never saved.
        setFormError(
          'Your sign-in works, but your account has not been set up yet. Ask an administrator to finish creating it.'
        );
        setStage(null);
        return;
      }

      if (cloudUser.isApproved !== true) {
        await auth.signOut();
        logAudit(`Blocked Login: ${cloudUser.username}`, 'Security');
        setFormError('Your account is waiting for an administrator to approve it.');
        setStage(null);
        return;
      }

      setStage('workspace');
      await login(cloudUser, false);

      // Now that there is a session to write under, record the failed attempts
      // this browser collected while signed out. The rules require an
      // authenticated writer, so this is the only moment they can be saved.
      const recovered = flushFailedLogins();
      if (recovered > 0) {
        logAudit(
          `${recovered} failed sign-in attempt${recovered === 1 ? '' : 's'} before this login`,
          'Security',
          { username: cloudUser.username }
        );
      }

      // Automatic backup, once per day per user rather than on every login.
      // This used to run unconditionally AND be awaited, so each sign-in read
      // every document in ~30 collections, waited for the whole database to
      // serialise, and dropped another near-identical file in Downloads.
      // Not awaited: the user is already signed in and should not wait on it.
      void runDailyAutoBackup(cloudUser.username, cloudUser.id).catch(err => {
        console.error('Auto-backup download failed:', err);
      });

      logAudit(`Successful Login: ${cloudUser.username}`, 'Security');
      toast({ title: 'Welcome', description: `Signed in as ${cloudUser.username}` });
      clearFailedAttempts();

      // Deliberately NOT clearing isSubmitting or the stage here. The redirect
      // to /dashboard is driven by an effect a tick later; dropping back to an
      // idle form in between put a live, empty login box on screen for a beat
      // and made a successful sign-in look like a failed one.
      return;

    } catch (error: any) {
      recordFailedAttempt();

      // Queued rather than written: a failed sign-in is unauthenticated, and
      // the logs collection no longer accepts writes from strangers. This is
      // flushed on the next successful login from this browser.
      queueFailedLogin(data.loginString, error?.code);

      let errorMessage = 'That username or password was not recognised.';
      if (error.code === AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER) {
        errorMessage = 'Too many attempts. Sign-in is locked for a few minutes - this is a security limit and will clear on its own.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Could not reach the server. Check your connection and try again.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Contact an administrator.';
      }

      setFormError(errorMessage);
      setStage(null);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
         <div className="flex flex-col justify-center items-center gap-4 mb-8 text-center">
            <div className="w-24 h-24 rounded-3xl bg-white shadow-2xl flex items-center justify-center overflow-hidden border-2 border-primary/20 p-2">
                <img src={logo.src} width="80" height="80" alt="App Logo" className="object-contain" />
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
              <div className="hidden" aria-hidden="true">
                <input {...register('hp_field')} tabIndex={-1} autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginString" className="text-xs font-bold uppercase text-muted-foreground">Username or Email</Label>
                <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input id="loginString" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} {...register('loginString')} disabled={isSubmitting} className="flex h-11 w-full rounded-lg border-2 border-muted bg-background pl-10 pr-3 py-2 text-sm font-semibold transition-all focus:border-primary focus:ring-0 outline-none" />
                </div>
                {errors.loginString && <p className="text-[10px] text-destructive font-black uppercase">{errors.loginString.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-bold uppercase text-muted-foreground">Secure Password</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} disabled={isSubmitting} className="flex h-11 w-full rounded-lg border-2 border-muted bg-background pl-10 pr-3 py-2 text-sm font-semibold transition-all focus:border-primary focus:ring-0 outline-none" />
                </div>
                {errors.password && <p className="text-[10px] text-destructive font-black uppercase">{errors.password.message}</p>}
              </div>

              {failedAttempts >= 3 && (
                <div className="space-y-3 p-4 bg-amber-50 rounded-xl border-2 border-amber-200 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase text-amber-800 tracking-widest">Challenge</Label>
                        <Button type="button" variant="ghost" size="icon" className="h-3 w-3 text-amber-700" onClick={generateCaptcha}><RefreshCw className="h-3 w-3" /></Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-white border-2 border-amber-200 rounded-lg h-10 flex items-center justify-center font-black text-amber-900 text-lg tabular-nums">
                            {captchaChallenge.a} + {captchaChallenge.b} = ?
                        </div>
                        <Input id="captchaAnswer" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} disabled={isSubmitting} inputMode="numeric" className="w-24 h-10 border-amber-200 bg-white font-black text-center" autoComplete="off" />
                    </div>
                </div>
              )}

              {formError && !isSubmitting && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border-2 border-destructive/20 bg-destructive/5 p-3 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <p className="text-xs font-semibold leading-relaxed text-destructive">{formError}</p>
                </div>
              )}

              {/*
                What the app is doing, while it is doing it. Each step lights up
                as its network call actually completes, so a slow connection
                shows steady movement instead of a frozen page.
              */}
              {isSubmitting && currentStage && (
                <div
                  className="space-y-3 rounded-xl border-2 border-primary/15 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-1 duration-200"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-wider text-primary">
                      Signing you in
                    </p>
                    <span className="text-[10px] font-black tabular-nums text-primary/70">
                      Step {LOGIN_STAGES.findIndex(s => s.key === currentStage.key) + 1} of {LOGIN_STAGES.length}
                    </span>
                  </div>

                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                    {/* A slow shimmer over the filled part, so even a long
                        single step never looks stalled. */}
                    <div className="absolute inset-y-0 left-0 animate-pulse rounded-full bg-white/25"
                         style={{ width: `${progressPct}%` }} />
                  </div>

                  <ol className="space-y-1">
                    {LOGIN_STAGES.map(s => {
                      const done = s.pct < progressPct;
                      const active = s.key === currentStage.key;
                      return (
                        <li
                          key={s.key}
                          className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            done ? 'text-primary/60' : active ? 'text-primary' : 'text-muted-foreground/40'
                          }`}
                        >
                          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                            {done
                              ? <Check className="h-3 w-3" />
                              : active
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <span className="h-1 w-1 rounded-full bg-current" />}
                          </span>
                          {s.label}
                        </li>
                      );
                    })}
                  </ol>

                  {isSlow && (
                    <p className="text-[10px] font-semibold leading-relaxed text-muted-foreground animate-in fade-in">
                      This is taking longer than usual - the connection may be slow. Still working.
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20" disabled={isSubmitting}>
                {isSubmitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in</>
                  : 'Authorize Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-8 text-center text-[10px] text-muted-foreground font-medium uppercase tracking-widest">StarSutra Integrated Enterprise Suite</p>
      </div>
    </div>
  );
}
