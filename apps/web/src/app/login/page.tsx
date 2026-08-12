"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const requestedCallback = params.get("callbackUrl");
  const callbackUrl = requestedCallback?.startsWith('/') && !requestedCallback.startsWith('//')
    ? requestedCallback
    : "/dashboard";

  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (status === 'authenticated') router.replace(callbackUrl);
  }, [status, router, callbackUrl]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        tenant: tenant.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password,
        callbackUrl,
      });
      if (!res?.ok || res.error) {
        setFormError("Tenant, correo o contraseña incorrectos.");
        return;
      }
      const validatedUrl = new URL(res.url || callbackUrl, window.location.origin);
      router.replace(validatedUrl.origin === window.location.origin ? `${validatedUrl.pathname}${validatedUrl.search}` : '/dashboard');
      router.refresh();
    } catch {
      setFormError("No fue posible conectar con el servicio de autenticación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-semibold">Ingresar</h1>

        {formError && (
          <p className="text-sm text-red-600" role="alert" aria-live="polite">
            {formError}
          </p>
        )}

        <div>
          <label className="block text-sm">Tenant</label>
          <input
            className="border w-full p-2 rounded"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            required
            autoComplete="organization"
            disabled={loading}
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
            disabled={loading}
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
            disabled={loading}
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
