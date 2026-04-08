'use client';
import { useEffect, useState } from 'react';
import styles from './dashboard.module.css';

interface Stats {
  leads: { byStatus: Record<string, number>; total: number };
  today: {
    email: { sent: number; limit: number };
    linkedin: { sent: number; limit: number };
    instagram: { sent: number; limit: number };
  };
  last7Days: { channel: string; success: boolean; count: string }[];
  inbox: { unread: number };
}

const STATUS_LABELS: Record<string, string> = {
  te_contacteren: 'Te contacteren', email_1: 'Email 1', followup_1: 'Follow-up 1',
  followup_2: 'Follow-up 2', followup_3: 'Follow-up 3', geantwoord: 'Geantwoord',
  niet_geinteresseerd: 'Niet geïnteresseerd',
};
const STATUS_COLOR: Record<string, string> = {
  te_contacteren: '#52525b', email_1: '#6366f1', followup_1: '#8b5cf6',
  followup_2: '#a78bfa', followup_3: '#c4b5fd', geantwoord: '#22c55e',
  niet_geinteresseerd: '#ef4444',
};

function ProgressBar({ value, max, color = 'var(--accent)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: 'var(--border)', borderRadius: 4, height: 5, marginTop: 10, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runOutreach = async () => {
    setSyncing(true); setMsg('');
    try {
      const r = await fetch('/api/cron?job=daily_outreach', { method: 'POST' });
      const d = await r.json();
      setMsg(`Klaar — ${d.results?.sync?.imported ?? 0} leads gesync'd, ${d.results?.email?.sent ?? 0} emails, ${d.results?.linkedin?.leadsCount ?? 0} LinkedIn, ${d.results?.instagram?.leadsCount ?? 0} Instagram`);
      load();
    } catch { setMsg('Fout bij uitvoeren.'); }
    setSyncing(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Overzicht van je outreach activiteit</p>
        </div>
        <button className={styles.btnPrimary} onClick={runOutreach} disabled={syncing}>
          {syncing ? 'Bezig…' : '▶ Dagelijkse outreach starten'}
        </button>
      </div>

      {msg && <div className={styles.notice}>{msg}</div>}

      {loading ? (
        <div className={styles.loading}>Laden…</div>
      ) : stats ? (
        <>
          <div className={styles.kpiRow}>
            {[
              { label: 'Totaal leads', value: stats.leads.total },
              { label: 'Email vandaag', value: stats.today.email.sent, max: stats.today.email.limit, color: 'var(--accent)' },
              { label: 'LinkedIn vandaag', value: stats.today.linkedin.sent, max: stats.today.linkedin.limit, color: '#0a66c2' },
              { label: 'Instagram vandaag', value: stats.today.instagram.sent, max: stats.today.instagram.limit, color: '#e1306c' },
              { label: 'Ongelezen inbox', value: stats.inbox.unread, warn: stats.inbox.unread > 0 },
            ].map(k => (
              <div key={k.label} className={styles.kpiCard}>
                <div className={styles.kpiLabel}>{k.label}</div>
                <div className={styles.kpiValue} style={{ color: k.warn ? 'var(--warning)' : undefined }}>
                  {k.value}{k.max !== undefined && <span className={styles.kpiMax}>/{k.max}</span>}
                </div>
                {k.max !== undefined && <ProgressBar value={k.value} max={k.max} color={k.color} />}
              </div>
            ))}
          </div>

          <div className={styles.grid2}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Lead pipeline</h2>
              <div className={styles.statusList}>
                {Object.entries(stats.leads.byStatus).map(([status, count]) => (
                  <div key={status} className={styles.statusRow}>
                    <span className={styles.statusDot} style={{ background: STATUS_COLOR[status] ?? '#52525b' }} />
                    <span className={styles.statusName}>{STATUS_LABELS[status] ?? status}</span>
                    <span className={styles.statusCount}>{count}</span>
                    <div className={styles.statusBar}>
                      <div style={{ width: `${stats.leads.total > 0 ? (count / stats.leads.total) * 100 : 0}%`, height: '100%', background: STATUS_COLOR[status] ?? '#52525b', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Afgelopen 7 dagen</h2>
              <div className={styles.weekTable}>
                <div className={styles.weekHead}><span>Kanaal</span><span>Verstuurd</span><span>Fout</span></div>
                {['email', 'linkedin', 'instagram'].map(ch => {
                  const sent = parseInt(stats.last7Days.find(r => r.channel === ch && r.success)?.count ?? '0');
                  const fail = parseInt(stats.last7Days.find(r => r.channel === ch && !r.success)?.count ?? '0');
                  return (
                    <div key={ch} className={styles.weekRow}>
                      <span className={`${styles.chBadge} ${styles['ch_' + ch]}`}>{ch}</span>
                      <span style={{ color: 'var(--success)' }}>{sent}</span>
                      <span style={{ color: fail > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fail}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.empty}>Geen data beschikbaar. Controleer de database verbinding via <a href="/instellingen">Instellingen</a>.</div>
      )}
    </div>
  );
}
