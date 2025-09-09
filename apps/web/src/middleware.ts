import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ token }) {
      // Sólo pasa si hay sesión de NextAuth.
      // (Así, aunque alguien ponga NEXT_PUBLIC_STATIC_TOKEN en dev, no entra a rutas protegidas)
      return !!token;
    },
  },
});

// Rutas a proteger
export const config = {
  matcher: ["/dashboard/:path*", "/assets/:path*", "/alerts/:path*", "/inventory/:path*", "/work-orders/:path*"],
};
