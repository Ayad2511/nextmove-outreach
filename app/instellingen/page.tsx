'use client';
import { useEffect, useState } from 'react';
import styles from './instellingen.module.css';

interface Health {
  status: string; database: string;
  integrations: { clay: boolean; lemlist: boolean; phantombuster: boolean; heygen: boolean };
  timestamp: string;
}

const INTEGRATIONS = [
  { key: 'clay', label: 'Clay', desc: 'Lead enrichment & sync', env: ['CLAY_API_KEY', 'CLAY_TABLE_ID'], color: '#6366f1' },
  { key: 'lemlist', label: 'Lemlist', desc: 'Cold email outreach (40/dag)', env: ['LEMLIST_API_KEY', 'LEMLIST_CAMPAIGN_ID'], color: '#f59e0b' },
  { key: 'phantombuster', label: 'Phantombuster', desc: 'LinkedIn (15/dag) + Instagram (7/dag)', env: ['PHANTOMBUSTER_API_KEY', 'PHANTOMBUSTER_LINKEDIN_AGENT_ID', 'PHANTOMBUSTER_INSTAGRAM_AGENT_ID'], color: '#8b5cf6' },
  { key: 'heygen', label: 'HeyGen', desc: 'Gepersonaliseerde video\'s', env: ['HEYGEN_API_KEY', 'HEYGEN_TEMPLATE_ID', 'HEYGEN_WEBHOOK_SECRET'], color: '#fb923c' },
] as const;

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/health', desc: 'Systeem health check' },
  { method: 'GET', path: '/api/stats', desc: 'Dashboard statistieken' },
  { method: 'GET', path: '/api/leads', desc: 'Leads ophalen (?status=&limit=&offset=)' },
  { method: 'POST', path: '/api/leads/sync', desc: 'Leads synchroniseren van Clay' },
  { method: 'POST', path: '/api/campaigns/email', desc: 'Email campagne starten (Lemlist)' },
  { method: 'POST', path: '/api/campaigns/linkedin', desc: 'LinkedIn connects starten' },
  { method: 'POST', path: '/api/campaigns/instagram', desc: 'Instagram DM\'s starten' },
  { method: 'POST', path: '/api/video/generate', desc: 'HeyGen video\'s genereren' },
  { method: 'POST', path: '/api/video/webhook', desc: 'HeyGen webhook ontvangen' },
  { method: 'GET', path: '/api/inbox', desc: 'Inbox berichten ophalen' },
  { method: 'POST', path: '/api/inbox', desc: 'Inbox syncen van Lemlist' },
  { method: 'POST', path: '/api/cron', desc: 'Cron job triggeren (?job=daily_outreach)' },
];

const METHOD_COLOR: Record<string, string> = { GET: '#22c55e', POST: '#6366f1', PATCH: '#f59e0b', DELETE: '#ef4444' };

export default function InstellingenPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const check = async () => {
    setRefreshing(true);
    const d = await fetch('/api/health').then(r => r.json()).catch(() => null);
    setHealth(d); setLoading(false); setRefreshing(false);
  };

  useEffect(() => { check(); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Instellingen</h1>
          <p className={styles.subtitle}>Integratiestatus en API endpoints</p>
        </div>
        <button className={styles.btnSecondary} onClick={check} disabled={refreshing}>
          {refreshing ? 'Controleren…' : '↻ Vernieuwen'}
        </button>
      </div>

      {/* System health */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Systeemstatus</h2>
        {loading ? <div className={styles.muted}>Laden…</div> : health ? (
          <div className={styles.healthRow}>
            <div className={styles.healthCard}>
              <div className={styles.healthLabel}>Status</div>
              <div className={styles.healthVal} style={{ color: health.status === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                {health.status === 'ok' ? '✓ Operationeel' : '✗ Fout'}
              </div>
            </div>
            <div className={styles.healthCard}>
              <div className={styles.healthLabel}>Database</div>
              <div className={styles.healthVal} style={{ color: health.database === 'connected' ? 'var(--success)' : 'var(--danger)' }}>
                {health.database === 'connected' ? '✓ Verbonden' : '✗ Niet verbonden'}
              </div>
            </div>
            <div className={styles.healthCard}>
              <div className={styles.healthLabel}>Laatste check</div>
              <div className={styles.healthVal} style={{ color: 'var(--text-secondary)' }}>
                {new Date(health.timestamp).toLocaleTimeString('nl-NL')}
              </div>
            </div>
          </div>
        ) : <div className={styles.muted}>Health check niet beschikbaar</div>}
      </div>

      {/* Integrations */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Integraties</h2>
        <p className={styles.sectionDesc}>Vul API keys in via het Render dashboard onder <strong>Environment</strong>.</p>
        <div className={styles.integGrid}>
          {INTEGRATIONS.map(integ => {
            const connected = health?.integrations[integ.key] ?? false;
            return (
              <div key={integ.key} className={styles.integCard}>
                <div className={styles.integTop}>
                  <div className={styles.integDot} style={{ background: integ.color }} />
                  <div className={styles.integName}>{integ.label}</div>
                  <span className={`${styles.integStatus} ${connected ? styles.statusOk : styles.statusMissing}`}>
                    {connected ? '✓ Actief' : '✗ Niet ingesteld'}
                  </span>
                </div>
                <div className={styles.integDesc}>{integ.desc}</div>
                <div className={styles.integEnvs}>
                  {integ.env.map(e => <code key={e} className={styles.envKey}>{e}</code>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* API endpoints */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>API Endpoints</h2>
        <div className={styles.endpointList}>
          {API_ENDPOINTS.map(ep => (
            <div key={ep.path + ep.method} className={styles.endpoint}>
              <span className={styles.method} style={{ color: METHOD_COLOR[ep.method] ?? '#fff', background: (METHOD_COLOR[ep.method] ?? '#fff') + '18' }}>{ep.method}</span>
              <code className={styles.path}>{ep.path}</code>
              <span className={styles.endpointDesc}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
