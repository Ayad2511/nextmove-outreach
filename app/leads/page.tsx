'use client';
import { useEffect, useState, useCallback } from 'react';
import styles from './leads.module.css';

interface Lead {
  id: number; first_name: string; last_name: string; email: string;
  company_name: string; instagram_handle: string; linkedin_url: string;
  niche: string; status: string; heygen_video_url: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  te_contacteren: 'Te contacteren', email_1: 'Email 1', followup_1: 'Follow-up 1',
  followup_2: 'Follow-up 2', followup_3: 'Follow-up 3', geantwoord: 'Geantwoord',
  niet_geinteresseerd: 'Niet geïnteresseerd',
};
const STATUS_COLOR: Record<string, string> = {
  te_contacteren: '#52525b', email_1: '#6366f1', followup_1: '#8b5cf6',
  geantwoord: '#22c55e', niet_geinteresseerd: '#ef4444',
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filter) params.set('status', filter);
    fetch(`/api/leads?${params}`)
      .then(r => r.json())
      .then(d => { setLeads(d.leads ?? []); setTotal(d.total ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter, offset]);

  useEffect(() => { setOffset(0); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? leads.filter(l =>
        [l.first_name, l.last_name, l.email, l.company_name].join(' ')
          .toLowerCase().includes(search.toLowerCase()))
    : leads;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Leads</h1>
          <p className={styles.subtitle}>{total} leads in totaal</p>
        </div>
        <div className={styles.actions}>
          <input
            className={styles.search} placeholder="Zoeken…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className={styles.select} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Alle statussen</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Naam</th><th>Bedrijf</th><th>Email</th><th>Status</th>
              <th>Kanalen</th><th>Video</th><th>Aangemaakt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={styles.empty}>Laden…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>Geen leads gevonden</td></tr>
            ) : filtered.map(lead => (
              <tr key={lead.id} className={styles.row}>
                <td className={styles.name}>
                  {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                </td>
                <td className={styles.company}>{lead.company_name || '—'}</td>
                <td className={styles.email}>{lead.email || '—'}</td>
                <td>
                  <span className={styles.badge} style={{ background: (STATUS_COLOR[lead.status] ?? '#52525b') + '22', color: STATUS_COLOR[lead.status] ?? '#a1a1aa' }}>
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </td>
                <td className={styles.channels}>
                  {lead.email && <span className={`${styles.ch} ${styles.chEmail}`}>E</span>}
                  {lead.linkedin_url && <span className={`${styles.ch} ${styles.chLinkedIn}`}>Li</span>}
                  {lead.instagram_handle && <span className={`${styles.ch} ${styles.chIg}`}>Ig</span>}
                </td>
                <td>
                  {lead.heygen_video_url
                    ? <a className={styles.videoLink} href={lead.heygen_video_url} target="_blank" rel="noopener">▶ Video</a>
                    : <span className={styles.noCh}>—</span>}
                </td>
                <td className={styles.date}>{fmtDate(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Vorige</button>
          <span className={styles.pageInfo}>{offset + 1}–{Math.min(offset + limit, total)} van {total}</span>
          <button className={styles.pageBtn} disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Volgende →</button>
        </div>
      )}
    </div>
  );
}
