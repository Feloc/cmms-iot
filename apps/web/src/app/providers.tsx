'use client';
import { useEffect } from 'react';
import { SessionProvider, signOut } from "next-auth/react";

function UnauthorizedListener() {
  useEffect(() => {
    const logout = () => void signOut({ callbackUrl: '/login' });
    window.addEventListener('cmms:unauthorized', logout);
    return () => window.removeEventListener('cmms:unauthorized', logout);
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus><UnauthorizedListener />{children}</SessionProvider>;
}
