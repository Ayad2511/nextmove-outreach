'use client';
import { useEffect, useState, useCallback } from 'react';
import styles from './inbox.module.css';

interface Message {
  id: number; channel: string; direction: string; content: string;
  sender_email: string; subject: string; received_at: string; read: boolean;
  first_name: string; last_name: string; company_name: string;
}

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}u`;
  return `${Math.floor(m / 1440)}d`;
}

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [channel, setChannel] = useState('');
  const [active, setActive] = useState<Message | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (filter === 'unread') params.set('unread', 'true');
    fetch(`/api/inbox?${params}`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages ?? []); setUnread(d.unreadCount ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter, channel]);

  useEffect(() => { load(); }, [load]);

  const syncInbox = async () => {
    setSyncing(true);
    await fetch('/api/inbox', { method: 'POST' }).catch(() => {});
    setSyncing(false); load();
  };

  const markRead = async (ids: number[]) => {
    await fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {});
    setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, read: true } : m));
    setUnread(prev => Math.max(0, prev - ids.filter(id => messages.find(m => m.id === id && !m.read)).length));
  };

  const markAllRead = async () => {
    await fetch('/api/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readAll: true }) }).catch(() => {});
    setMessages(prev => prev.map(m => ({ ...m, read: true }))); setUnread(0);
  };

  const open = (m: Message) => { setActive(m); if (!m.read) markRead([m.id]); };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Inbox {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}</h1>
          <p className={styles.subtitle}>Alle replies van je outreach kanalen</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={markAllRead} disabled={unread === 0}>Alles gelezen</button>
          <button className={styles.btnPrimary} onClick={syncInbox} disabled={syncing}>{syncing ? 'Sync…' : '↻ Sync'}</button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(['all', 'unread'] as const).map(f => (
            <button key={f} className={`${styles.tab}${filter === f ? ' ' + styles.tabActive : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Alles' : 'Ongelezen'}
            </button>
          ))}
        </div>
        <select className={styles.select} value={channel} onChange={e => setChannel(e.target.value)}>
          <option value="">Alle kanalen</option>
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
        </select>
      </div>

      <div className={styles.layout}>
        <div className={styles.list}>
          {loading ? (
            <div className={styles.empty}>Laden…</div>
          ) : messages.length === 0 ? (
            <div className={styles.empty}>Geen berichten</div>
          ) : messages.map(m => (
            <div key={m.id} className={`${styles.item}${!m.read ? ' ' + styles.itemUnread : ''}${active?.id === m.id ? ' ' + styles.itemActive : ''}`} onClick={() => open(m)}>
              <div className={styles.itemTop}>
                <span className={`${styles.chBadge} ${styles['ch_' + m.channel]}`}>{m.channel}</span>
                <span className={styles.time}>{timeAgo(m.received_at)}</span>
              </div>
              <div className={styles.itemFrom}>
                {[m.first_name, m.last_name].filter(Boolean).join(' ') || m.sender_email || 'Onbekend'}
              </div>
              <div className={styles.itemPreview}>{m.content?.slice(0, 80) ?? '—'}</div>
            </div>
          ))}
        </div>

        <div className={styles.detail}>
          {active ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <div className={styles.detailFrom}>
                    {[active.first_name, active.last_name].filter(Boolean).join(' ') || active.sender_email}
                    {active.company_name && <span className={styles.detailCompany}> · {active.company_name}</span>}
                  </div>
                  <div className={styles.detailMeta}>
                    <span className={`${styles.chBadge} ${styles['ch_' + active.channel]}`}>{active.channel}</span>
                    {' '}· {new Date(active.received_at).toLocaleString('nl-NL')}
                  </div>
                </div>
              </div>
              <div className={styles.detailBody}>{active.content || '(leeg bericht)'}</div>
            </>
          ) : (
            <div className={styles.detailEmpty}>Selecteer een bericht</div>
          )}
        </div>
      </div>
    </div>
  );
}
