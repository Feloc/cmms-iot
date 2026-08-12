import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const baseFromEnv = (value?: string) => String(value || "").replace(/\/$/, "").trim() || "";

const API_BASE = baseFromEnv(process.env.API_INTERNAL_URL) || "http://api:3001";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const handler = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        tenant: { label: "Tenant", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const tenant = String(credentials?.tenant || '').trim().toLowerCase();
          const email = String(credentials?.email || '').trim().toLowerCase();
          const password = String(credentials?.password || '');
          if (!tenant || !email || !password) return null;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenant, email, password }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timeout));
          if (!res.ok) return null;

          const data = await res.json().catch(() => null);
          if (!data?.token || !data?.tenant?.id || !data?.tenant?.slug || !data?.user?.id || !data?.user?.email) {
            console.error('[authorize] invalid API login response');
            return null;
          }

          return {
            id: String(data.user.id),
            email: data.user.email,
            name: data.user.name || data.user.email,
            role: data.user.role,
            token: data.token,
            tenant: { id: data.tenant.id, slug: data.tenant.slug },
          } as any;
        } catch (err) {
          console.error("[authorize] API login unavailable");
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).token;
        token.tenant = (user as any).tenant; // { id, slug }
        token.role = (user as any).role;
        token.email = (user as any).email;
        token.name = (user as any).name;
      }
      return token;
    },
    async session({ session, token }) {
      // El JWT de la API permanece dentro de la cookie cifrada de NextAuth. Los
      // clientes existentes sólo necesitan un valor truthy: /backend reemplaza
      // cualquier Authorization recibido por el JWT obtenido del lado servidor.
      (session as any).token = 'session';
      (session as any).accessToken = 'session';
      (session as any).tenant = token.tenant;            // { id, slug }

      // proyección cómoda en session.user
      session.user = session.user || {};
      // Importante: incluir el id real del usuario para permisos/UI (ej. WorkLogs)
      // NextAuth expone el id del usuario como token.sub (derivado de "user.id" en authorize).
      (session.user as any).id = (token as any)?.sub;
      (session.user as any).email = (token as any)?.email;
      (session.user as any).name = (token as any)?.name;
      (session.user as any).tenantSlug = (token as any)?.tenant?.slug;
      (session.user as any).role = token.role;

      // compatibilidad (algunos componentes miran en raíz)
      (session as any).tenantId = (token as any)?.tenant?.id;
      (session as any).tenantSlug = (token as any)?.tenant?.slug;

      return session;
    },
  },
  events: {
    async signOut({ token }) {
      const accessToken = typeof token?.accessToken === 'string' ? token.accessToken : '';
      if (!accessToken) return;
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        console.error('[signOut] API token revocation failed');
      }
    },
  },
  pages: { signIn: "/login" },
  debug: process.env.NODE_ENV !== "production",
});

export { handler as GET, handler as POST };
