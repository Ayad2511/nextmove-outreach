'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';

const nav = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: '/leads',
    label: 'Leads',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="5" r="2.5" /><path d="M1 13c0-2.5 2.2-4 5-4s5 1.5 5 4" />
        <path d="M11.5 7a2 2 0 0 0 0 4M13 8c.8.4 1.5 1.2 1.5 2.5" />
      </svg>
    ),
  },
  {
    href: '/campagnes',
    label: 'Campagnes',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M2 8h8M2 12h5" strokeLinecap="round" />
        <circle cx="13" cy="11" r="2" /><path d="M13 9V7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="3" width="14" height="10" rx="1.5" />
        <path d="M1 5l7 4.5L15 5" strokeLinecap="round" />
      </svg>
    ),
    badgeKey: 'inbox',
  },
  {
    href: '/instellingen',
    label: 'Instellingen',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch('/api/inbox')
      .then(r => r.json())
      .then(d => setUnread(d.unreadCount ?? 0))
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoText}>Next Move</div>
        <div className={styles.logoSub}>Outreach Systeem</div>
      </div>

      <nav className={styles.nav}>
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem}${isActive(item.href) ? ' ' + styles.active : ''}`}
          >
            {item.icon}
            {item.label}
            {item.badgeKey === 'inbox' && unread > 0 && (
              <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className={styles.footer}>
        <span className={styles.statusDot} />
        <span className={styles.footerText}>nextmove-outreach.onrender.com</span>
      </div>
    </aside>
  );
}
