import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const baseFromEnv = (value?: string) => String(value || "").replace(/\/$/, "").trim() || "";

const API_CANDIDATES = Array.from(
  new Set(
    [
      baseFromEnv(process.env.API_INTERNAL_URL),
      baseFromEnv(process.env.NEXT_PUBLIC_API_URL),
      "http://api:3001",
    ].filter(Boolean),
  ),
);

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
        let lastFailure: string | null = null;
        try {
          if (!credentials) {
            console.error("[authorize] no credentials");
            return null;
          }

          for (const apiBase of API_CANDIDATES) {
            try {
              const res = await fetch(`${apiBase}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tenant: credentials.tenant,
                  email: credentials.email,
                  password: credentials.password,
                }),
              });

              if (!res.ok) {
                const txt = await res.text().catch(() => "");
                lastFailure = `[authorize] login failed via ${apiBase}: status=${res.status} body=${txt}`;
                console.error(lastFailure);
                continue;
              }

              const data = await res.json().catch((e) => {
                console.error(`[authorize] invalid JSON from API (${apiBase}):`, e);
                return null;
              });
              // API esperado: { token, tenant: {id,slug}, user: {id,email,name,role} }
              if (!data?.token || !data?.tenant?.id || !data?.tenant?.slug || !data?.user?.email) {
                lastFailure = `[authorize] missing fields in API response via ${apiBase}`;
                console.error(lastFailure, data);
                continue;
              }

              const id =
                (data.user.id && String(data.user.id)) ||
                (data.user.email && String(data.user.email));
              if (!id) {
                lastFailure = `[authorize] could not derive user id via ${apiBase}`;
                console.error(lastFailure, data);
                continue;
              }

              return {
                id,
                email: data.user.email,
                name: data.user.name || data.user.email,
                role: data.user.role,
                token: data.token,
                tenant: { id: data.tenant.id, slug: data.tenant.slug }, // <- objeto completo
              } as any;
            } catch (apiErr) {
              lastFailure = `[authorize] exception via ${apiBase}`;
              console.error(lastFailure, apiErr);
            }
          }

          if (lastFailure) console.error(lastFailure);
          return null;
        } catch (err) {
          console.error("[authorize] exception:", err);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
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
      // tokens -> session
      (session as any).token = token.accessToken;        // recomendado usar "session.token" en fetch
      (session as any).accessToken = token.accessToken;  // compat si ya usabas accessToken
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
  pages: { signIn: "/login" },
  debug: process.env.NODE_ENV !== "production",
});

export { handler as GET, handler as POST };
