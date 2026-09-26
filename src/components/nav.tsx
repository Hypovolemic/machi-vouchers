'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/r', label: 'Resident' },
  { href: '/s', label: 'Shop counter' },
  { href: '/admin', label: 'City dashboard' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="top">
      <Link href="/" className="brand">
        <span className="seal" aria-hidden="true">
          街
        </span>
        Machi Vouchers
      </Link>
      <nav className="tabs" aria-label="Screens">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
