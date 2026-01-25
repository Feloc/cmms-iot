"use client";

import { useState, FormEvent, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginClient() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  const [tenant, setTenant] = useState("acme");
  const [email, setEmail] = useState("admin@acme.local");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false,
      tenant,
      email,
      password,
      callbackUrl,
    });
    setLoading(false);
    if (res && !res.error) {
      router.push(callbackUrl);
    }
    // Si hay error, NextAuth deja ?error=CredentialsSignin en la URL
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">Ingresar</h1>

        {error && (
          <p className="text-sm text-red-600">
            {error === "CredentialsSignin" ? "Credenciales inválidas." : error}
          </p>
        )}

        <div>
          <label className="block text-sm">Tenant</label>
          <input
            className="border w-full p-2 rounded"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm">Email</label>
          <input
            className="border w-full p-2 rounded"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="block text-sm">Password</label>
          <input
            className="border w-full p-2 rounded"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          className="w-full p-2 rounded bg-black text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-gray-500">Cargando...</div>}
    >
      <LoginClient />
    </Suspense>
  );
}
