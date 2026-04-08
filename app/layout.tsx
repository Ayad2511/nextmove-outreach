import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Next Move — Outreach',
  description: 'Geautomatiseerd outreach dashboard voor Next Move Marketing',
};

const sidebarStyle: React.CSSProperties = {
  marginLeft: 'var(--sidebar-width)',
  minHeight: '100vh',
  background: 'var(--bg-base)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <Sidebar />
        <main style={sidebarStyle}>{children}</main>
      </body>
    </html>
  );
}
