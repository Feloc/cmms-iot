'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { signOut, useSession } from 'next-auth/react';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  adminOnly?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Puedes mapear roles si los guardas en session.user.role.
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const items: NavItem[] = useMemo(
    () => [
      { href: '/calendar', label: 'Calendario' },
      { href: '/service-orders', label: 'Órdenes de servicio' },
      { href: '/assets', label: 'Activos' },
      { href: '/pm-plans', label: 'PM Plans' },
      // Rutas administrativas
      { href: '/users', label: 'Usuarios', adminOnly: true },
      { href: '/tenants', label: 'Tenants', adminOnly: true },
    ],
    []
  );

  const filtered = items.filter((it) => (it.adminOnly ? isAdmin : true));

  return (
    <div className="min-h-screen bg-white">
      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
        <div className="h-14 px-3 flex items-center gap-2">
          <button
            className="lg:hidden px-2 py-1 border rounded"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>

          <button
            className="hidden lg:inline-flex px-2 py-1 border rounded"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="Colapsar menú"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? '»' : '«'}
          </button>

          <div className="font-semibold">CMMS</div>

          <div className="flex-1" />

          <div className="text-xs text-gray-600 hidden sm:block">
            {(session as any)?.user?.name || (session as any)?.user?.email || ''}
          </div>

          <button
            className="px-3 py-2 border rounded text-sm"
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar desktop */}
        <aside
          className={[
            'hidden lg:flex flex-col border-r bg-white',
            collapsed ? 'w-16' : 'w-64',
          ].join(' ')}
        >
          <div className="p-3 border-b">
            <div className="text-sm font-semibold">{collapsed ? '☰' : 'Menú'}</div>
            {!collapsed ? <div className="text-xs text-gray-500">Navegación</div> : null}
          </div>

          <nav className="p-2 space-y-1">
            {filtered.map((it) => {
              const active = isActive(pathname, it);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={[
                    'flex items-center gap-2 px-3 py-2 rounded text-sm border',
                    active ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50 text-gray-800 border-transparent',
                  ].join(' ')}
                  title={it.label}
                >
                  <span className="inline-block w-5 text-center">{iconFor(it.href)}</span>
                  {collapsed ? null : <span className="truncate">{it.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto p-3 border-t text-[11px] text-gray-500">
            {collapsed ? 'v0.1' : 'CMMS IoT · v0.1'}
          </div>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen ? (
          <div className="lg:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 bg-white border-r shadow-lg">
              <div className="h-14 px-3 flex items-center justify-between border-b">
                <div className="font-semibold">Menú</div>
                <button className="px-2 py-1 border rounded" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
                  ✕
                </button>
              </div>

              <nav className="p-2 space-y-1">
                {filtered.map((it) => {
                  const active = isActive(pathname, it);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setMobileOpen(false)}
                      className={[
                        'flex items-center gap-2 px-3 py-2 rounded text-sm border',
                        active ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50 text-gray-800 border-transparent',
                      ].join(' ')}
                    >
                      <span className="inline-block w-5 text-center">{iconFor(it.href)}</span>
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function iconFor(href: string) {
  switch (href) {
    case '/calendar':
      return '🗓️';
    case '/service-orders':
      return '🧾';
    case '/assets':
      return '🛠️';
    case '/pm-plans':
      return '🧰';
    case '/users':
      return '👥';
    case '/tenants':
      return '🏢';
    default:
      return '•';
  }
}
