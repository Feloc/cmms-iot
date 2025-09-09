"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState("acme");
  const [email, setEmail] = useState("admin@acme.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false,
      tenant,
      email,
      password,
    });
    setLoading(false);
    if (res?.ok) router.replace("/dashboard");
    else setError(res?.error || "Credenciales inválidas");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto" }}>
      <h1>Ingresar</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="Tenant" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
        <button type="submit" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </main>
  );
}
