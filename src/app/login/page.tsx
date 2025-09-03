
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { TestTubeDiagonal } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
        await signInWithPopup(auth, googleProvider);
        toast({
            title: 'Success',
            description: 'Logged in successfully with Google.',
        });
        router.push('/dashboard');
    } catch (error: any) {
        toast({
            title: 'Google Login Failed',
            description: error.message,
            variant: 'destructive',
        });
    } finally {
        setIsGoogleLoading(false);
    }
  };


  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: 'Success',
        description: 'Logged in successfully.',
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
         <div className="flex justify-center items-center gap-2 mb-6">
            <TestTubeDiagonal className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-semibold">Shivam QTR</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <CardDescription>Enter your credentials to access your account.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                 <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading || isLoading}>
                    {isGoogleLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 173.4 57.2l-64.3 64.3C325.5 94.6 289.6 80 248 80c-81.6 0-149.3 65.2-149.3 145.5S166.4 391 248 391c49.3 0 92.2-23.2 120.2-61.1l65.8 64.3C403.5 464.2 331.8 504 248 504z"></path></svg>
                    )}
                    {isGoogleLoading ? 'Signing in...' : 'Sign in with Google'}
                </Button>
                 <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                    </div>
                </div>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  {...register('email')}
                  disabled={isLoading || isGoogleLoading}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                     <Link href="/forgot-password" passHref>
                        <span className="text-sm text-primary hover:underline cursor-pointer">
                            Forgot password?
                        </span>
                    </Link>
                </div>
                <Input id="password" type="password" {...register('password')} disabled={isLoading || isGoogleLoading}/>
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
                Don't have an account?{' '}
                <Link href="/signup" passHref>
                    <span className="text-primary hover:underline cursor-pointer">
                        Sign up
                    </span>
                </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
