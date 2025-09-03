
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Loader2, TestTubeDiagonal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const signupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [firebaseErrorCode, setFirebaseErrorCode] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });
  
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
        await signInWithPopup(auth, googleProvider);
        toast({
            title: 'Success',
            description: 'Signed up successfully with Google.',
        });
        router.push('/dashboard');
    } catch (error: any) {
        toast({
            title: 'Google Sign-up Failed',
            description: error.message,
            variant: 'destructive',
        });
    } finally {
        setIsGoogleLoading(false);
    }
  };

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    setFirebaseError(null);
    setFirebaseErrorCode(null);
    try {
      await createUserWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: 'Account Created',
        description: "You've been successfully signed up.",
      });
      router.push('/dashboard');
    } catch (error: any) {
        let errorMessage = error.message;
        const errorCode = error.code;
        
        if (errorCode === 'auth/operation-not-allowed') {
            errorMessage = 'Email/Password sign-up is not enabled. Please enable it in the Firebase Console.';
        } else if (errorCode === 'auth/configuration-not-found') {
            errorMessage = 'Firebase configuration is not found. This can happen if your app\'s domain is not authorized. Please add it in the Firebase Console.';
        }
        
      toast({
        title: 'Signup Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setFirebaseError(errorMessage);
      setFirebaseErrorCode(errorCode);
    } finally {
      setIsLoading(false);
    }
  };

  const getFirebaseConsoleLink = () => {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (firebaseErrorCode === 'auth/configuration-not-found') {
        return `https://console.firebase.google.com/project/${projectId}/authentication/settings`;
    }
    return `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
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
            <CardTitle className="text-2xl">Sign Up</CardTitle>
            <CardDescription>Create a new account to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            {firebaseError && (
                 <Alert variant="destructive" className="mb-4">
                    <AlertTitle>Signup Error</AlertTitle>
                    <AlertDescription>
                        {firebaseError}
                        <br />
                        Please check the settings in the{' '}
                        <a
                        href={getFirebaseConsoleLink()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        >
                        Firebase Console
                        </a>
                        .
                    </AlertDescription>
                </Alert>
            )}
             <div className="space-y-4">
                 <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading || isLoading}>
                    {isGoogleLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 173.4 57.2l-64.3 64.3C325.5 94.6 289.6 80 248 80c-81.6 0-149.3 65.2-149.3 145.5S166.4 391 248 391c49.3 0 92.2-23.2 120.2-61.1l65.8 64.3C403.5 464.2 331.8 504 248 504z"></path></svg>
                    )}
                    {isGoogleLoading ? 'Signing up...' : 'Sign up with Google'}
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
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')}  disabled={isLoading || isGoogleLoading} />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Creating account...' : 'Sign Up'}
              </Button>
            </form>
             <div className="mt-4 text-center text-sm">
                Already have an account?{' '}
                <Link href="/login" passHref>
                    <span className="text-primary hover:underline cursor-pointer">
                        Login
                    </span>
                </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
