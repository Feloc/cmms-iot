import type { Session } from "next-auth";

/**
 * Extrae token y tenantSlug exclusivamente desde la sesión de NextAuth.
 * Si opts.require === true y falta alguno, lanza Error.
 */
export function getAuthFromSession(
  session: Session | null | undefined,
  opts?: { require?: boolean }
) {
  const s: any = session ?? {};

  const token =
    s.accessToken ??
    s.token ??
    s.user?.token ??
    s.user?.accessToken;

  const tenantSlug =
    s.tenantSlug ??
    s.user?.tenantSlug ??
    s.user?.tenant?.slug ??
    s.tenant?.slug;

  if (opts?.require && (!token || !tenantSlug)) {
    throw new Error("No hay credenciales disponibles. Inicia sesión.");
  }

  return {
    token: token ?? undefined,
    tenantSlug: tenantSlug ?? undefined,
  };
}
