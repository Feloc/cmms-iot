import NextAuth, { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const apiBase =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE ?? // fallback
  "http://api:3001"; // último fallback dentro de docker

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        tenant: { label: "Tenant", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds) return null;

        try {
          const res = await fetch(`${apiBase}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // algunos backends leen el tenant por header también:
              "x-tenant": String(creds.tenant || ""),
            },
            body: JSON.stringify({
              tenant: creds.tenant,
              email: creds.email,
              password: creds.password,
            }),
            cache: "no-store",
          });

          if (!res.ok) {
            // imprime error del backend para depurar
            const txt = await res.text().catch(() => "");
            console.error(
              `[nextauth] /auth/login ${res.status} ${res.statusText} :: ${txt}`
            );
            return null;
          }

          const data = await res.json(); // { token, tenant, user }
          if (!data?.token || !data?.user || !data?.tenant) return null;

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            tenantId: data.tenant.id,
            tenantSlug: data.tenant.slug,
            accessToken: data.token,
            role: data.user.role,
          } as any;
        } catch (e) {
          console.error("[nextauth] fetch failed:", e);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.tenantId = (user as any).tenantId;
        token.tenantSlug = (user as any).tenantSlug;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).tenantId = token.tenantId;
      (session as any).tenantSlug = token.tenantSlug;
      (session as any).role = token.role;
      return session;
    },
  },
  pages: { signIn: "/login" },
  debug: true,
  // Si estás en Docker, asegúrate de tener NEXTAUTH_URL en .env.local
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
