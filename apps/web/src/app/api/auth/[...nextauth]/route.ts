import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const INTERNAL_API = "http://api:3001"; // servicio docker accesible desde el contenedor "web"

const handler = NextAuth({
  debug: true, // logs extra en el contenedor web
  providers: [
    Credentials({
      name: "Credentials",
      credentials: { tenant: {}, email: {}, password: {} },
      async authorize(creds, req) {
        try {
          // Toma campos desde el form (creds) o, si vienen vacíos, desde el body crudo
          let body: any = {};
          if (creds && (creds as any).email) body = creds;
          else {
            try { body = await (req as any).json(); } catch { body = {}; }
          }

          const tenant   = (body.tenant   ?? (creds as any)?.tenant   ?? "").toString();
          const email    = (body.email    ?? (creds as any)?.email    ?? "").toString();
          const password = (body.password ?? (creds as any)?.password ?? "").toString();

          if (!tenant || !email || !password) {
            console.error("AUTH_MISSING_FIELDS", { tenant, email, hasPassword: !!password });
            return null;
          }

          const res = await fetch(`${INTERNAL_API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenant, email, password }),
            cache: "no-store"
          });

          const text = await res.text();
          if (!res.ok) {
            console.error("AUTH_LOGIN_FAIL", res.status, text);
            return null;
          }

          let data: any = {};
          try { data = JSON.parse(text); } catch {
            console.error("AUTH_PARSE_FAIL", text);
            return null;
          }

          return {
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
            tenant: data.tenant.slug,
            accessToken: data.token
          } as any;
        } catch (e) {
          console.error("AUTH_LOGIN_ERROR", e);
          return null;
        }
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).accessToken = (user as any).accessToken;
        (token as any).tenant = (user as any).tenant;
      }
      return token as any;
    },
    async session({ session, token }) {
      (session as any).accessToken = (token as any).accessToken;
      (session.user as any).tenant = (token as any).tenant;
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "dev_secret"
});

export { handler as GET, handler as POST };
