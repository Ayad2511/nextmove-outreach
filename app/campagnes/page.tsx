'use client';
import { useEffect, useState } from 'react';
import styles from './campagnes.module.css';

interface ChanStats { sent: number; limit: number; remaining: number }
interface ChanData { today: ChanStats; campaign?: unknown }

function CampaignCard({
  title, icon, color, stats, onStart, loading, lastMsg,
}: {
  title: string; icon: string; color: string;
  stats: ChanStats | null; onStart: () => void; loading: boolean; lastMsg: string;
}) {
  const pct = stats ? Math.min(100, (stats.sent / stats.limit) * 100) : 0;
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardIcon} style={{ background: color + '22', color }}>{icon}</span>
        <div>
          <div className={styles.cardTitle}>{title}</div>
          {stats && (
            <div className={styles.cardSub}>{stats.sent}/{stats.limit} vandaag · {stats.remaining} resterend</div>
          )}
        </div>
        <button className={styles.startBtn} style={{ background: color }} onClick={onStart} disabled={loading || (stats?.remaining === 0)}>
          {loading ? 'Bezig…' : stats?.remaining === 0 ? 'Limiet bereikt' : '▶ Starten'}
        </button>
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${pct}%`, background: color }} />
      </div>
      {lastMsg && <div className={styles.msg}>{lastMsg}</div>}
    </div>
  );
}

function VideoCard({ onGenerate, loading, msg }: { onGenerate: () => void; loading: boolean; msg: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardIcon} style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>🎬</span>
        <div>
          <div className={styles.cardTitle}>HeyGen Gepersonaliseerde Video's</div>
          <div className={styles.cardSub}>Genereert video's voor leads zonder video (max 20 per batch)</div>
        </div>
        <button className={styles.startBtn} style={{ background: '#fb923c' }} onClick={onGenerate} disabled={loading}>
          {loading ? 'Bezig…' : '▶ Genereren'}
        </button>
      </div>
      {msg && <div className={styles.msg}>{msg}</div>}
    </div>
  );
}

export default function CampagnesPage() {
  const [emailStats, setEmailStats] = useState<ChanStats | null>(null);
  const [liStats, setLiStats] = useState<ChanStats | null>(null);
  const [igStats, setIgStats] = useState<ChanStats | null>(null);
  const [loading, setLoading] = useState({ email: false, linkedin: false, instagram: false, video: false });
  const [msgs, setMsgs] = useState({ email: '', linkedin: '', instagram: '', video: '' });

  const setMsg = (k: keyof typeof msgs, v: string) => setMsgs(p => ({ ...p, [k]: v }));
  const setLoad = (k: keyof typeof loading, v: boolean) => setLoading(p => ({ ...p, [k]: v }));

  useEffect(() => {
    Promise.all([
      fetch('/api/campaigns/email').then(r => r.json()),
      fetch('/api/campaigns/linkedin').then(r => r.json()),
      fetch('/api/campaigns/instagram').then(r => r.json()),
    ]).then(([e, li, ig]: [ChanData, ChanData, ChanData]) => {
      setEmailStats(e.today);
      setLiStats(li.today);
      setIgStats(ig.today);
    }).catch(() => {});
  }, []);

  const run = async (channel: 'email' | 'linkedin' | 'instagram') => {
    setLoad(channel, true); setMsg(channel, '');
    try {
      const r = await fetch(`/api/campaigns/${channel}`, { method: 'POST' });
      const d = await r.json();
      setMsg(channel, d.message ?? 'Klaar');
      // Refresh stats
      const s: ChanData = await fetch(`/api/campaigns/${channel}`).then(r2 => r2.json());
      if (channel === 'email') setEmailStats(s.today);
      if (channel === 'linkedin') setLiStats(s.today);
      if (channel === 'instagram') setIgStats(s.today);
    } catch { setMsg(channel, 'Fout opgetreden'); }
    setLoad(channel, false);
  };

  const runVideo = async () => {
    setLoad('video', true); setMsg('video', '');
    try {
      const r = await fetch('/api/video/generate', { method: 'POST' });
      const d = await r.json();
      setMsg('video', d.message ?? 'Klaar');
    } catch { setMsg('video', 'Fout opgetreden'); }
    setLoad('video', false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Campagnes</h1>
          <p className={styles.subtitle}>Beheer je outreach kanalen handmatig of laat ze automatisch lopen</p>
        </div>
      </div>

      <div className={styles.info}>
        <span className={styles.infoIcon}>ℹ</span>
        Dagelijkse limieten worden automatisch gereset om 00:00. De cron jobs draaien elke werkdag van 08–11u.
      </div>

      <div className={styles.cards}>
        <CampaignCard title="Email Outreach" icon="✉" color="#6366f1"
          stats={emailStats} onStart={() => run('email')}
          loading={loading.email} lastMsg={msgs.email} />
        <CampaignCard title="LinkedIn Connects" icon="in" color="#0a66c2"
          stats={liStats} onStart={() => run('linkedin')}
          loading={loading.linkedin} lastMsg={msgs.linkedin} />
        <CampaignCard title="Instagram DM's" icon="ig" color="#e1306c"
          stats={igStats} onStart={() => run('instagram')}
          loading={loading.instagram} lastMsg={msgs.instagram} />
        <VideoCard onGenerate={runVideo} loading={loading.video} msg={msgs.video} />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Limieten</h2>
        <div className={styles.limitsGrid}>
          {[
            { label: 'Email (Lemlist)', limit: 40, note: 'Per dag, automatisch via Lemlist campagne', color: '#6366f1' },
            { label: 'LinkedIn (Phantombuster)', limit: 15, note: 'Per dag, alleen werkdagen', color: '#0a66c2' },
            { label: 'Instagram (Phantombuster)', limit: 7, note: 'Per dag, inclusief like + story view', color: '#e1306c' },
            { label: 'HeyGen Video\'s', limit: 20, note: 'Per batch aanvraag', color: '#fb923c' },
          ].map(item => (
            <div key={item.label} className={styles.limitCard}>
              <div className={styles.limitDot} style={{ background: item.color }} />
              <div>
                <div className={styles.limitLabel}>{item.label}</div>
                <div className={styles.limitNote}>{item.note}</div>
              </div>
              <div className={styles.limitNum} style={{ color: item.color }}>{item.limit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
