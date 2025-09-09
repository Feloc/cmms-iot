// Extractor tolerante a diferentes formas de session
export function getAuthFromSession(session: any) {
  const token =
    session?.accessToken ??
    session?.token ??
    session?.user?.token ??
    session?.user?.accessToken ??
    // fallback dev opcional
    process.env.NEXT_PUBLIC_STATIC_TOKEN ?? null;

  const tenant =
    session?.user?.tenant?.slug ??
    session?.tenant?.slug ??
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ??
    null;

  return { token, tenant };
}
