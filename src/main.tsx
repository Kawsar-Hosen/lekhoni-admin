import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BarChart3, Bell, BookOpen, ChevronDown, CloudUpload,
  Eye, EyeOff, FileEdit, Image, LayoutDashboard, Menu, MessageSquare,
  MoreHorizontal, Plus, Search, Settings, Users, X, Trash2,
  Check, Ban, Send, Loader2, AlertTriangle, Shield, Filter,
  Edit3, ExternalLink, TrendingUp, Globe, Calendar, Clock,
  Heart, Bookmark, Share2, RefreshCw, Download, ToggleLeft, ToggleRight,
  Hash, Type, Palette, AlignLeft, ListOrdered, Upload,
  Zap, Gift, Megaphone, Sparkles, Award, Coffee, Info, Star
} from 'lucide-react';
import './styles.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface Book {
  id: string;
  title: string;
  author: string;
  summary: string;
  cover_url: string;
  category_id: string;
  status: 'draft' | 'published' | 'archived';
  views: number;
  chapters_count: number;
  featured?: boolean;
  home_section?: string;
  views_visible?: boolean;
  created_at: string;
  updated_at: string;
}

interface Chapter {
  id: string;
  book_id: string;
  title: string;
  body: string;
  position: number;
  status: 'draft' | 'published';
  views: number;
  created_at: string;
  updated_at: string;
  book_title?: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  cover_url: string | null;
  position: number;
  is_active: boolean;
  books_count: number;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  book_id: string;
  chapter_id: string;
  user_name: string;
  user_email: string;
  body: string;
  status: 'pending' | 'approved' | 'hidden' | 'deleted';
  created_at: string;
  book_title?: string;
  chapter_title?: string;
}

interface Writer {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'published' | 'rejected' | 'draft';
  cover_url: string | null;
  category: string;
  writer_name: string;
  review_note: string;
  chapter_count: number;
  views: number;
  likes: number;
  created_at: string;
  updated_at: string;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  icon: string;
  url: string;
  target?: string;
  read: boolean;
  created_at: string;
}

interface Analytics {
  total_books: number;
  published_books: number;
  total_views: number;
  total_comments: number;
  pending_comments: number;
  total_writers: number;
  pending_writers: number;
  total_categories: number;
  active_readers: number;
  views_today: number;
  views_this_week: number;
  views_this_month: number;
  recent_books: Book[];
  popular_books: Book[];
  recent_comments: Comment[];
  daily_views: { date: string; views: number }[];
}

type Page = 'Dashboard' | 'Books' | 'Chapters' | 'Categories' | 'Comments' | 'Writers' | 'Home Control' | 'Notifications' | 'Analytics' | 'Settings';

const API_BASE = 'https://lekhoni-admin-api.smdkawsar2.workers.dev';

const nav: [Page, React.ElementType][] = [
  ['Dashboard', LayoutDashboard],
  ['Books', BookOpen],
  ['Chapters', FileEdit],
  ['Categories', Menu],
  ['Comments', MessageSquare],
  ['Writers', Users],
  ['Home Control', Sparkles],
  ['Notifications', Bell],
  ['Analytics', BarChart3],
  ['Settings', Settings],
];

// ─── API Helper ─────────────────────────────────────────────────────────

async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers as Record<string, string> } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return undefined as T;
}

// ─── Toast ──────────────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      background: '#1b3a30', border: '1px solid #365048', borderRadius: 10,
      padding: '12px 18px', color: '#56d5b1', fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 30px #0008',
    }}>
      <Check size={16} /> {msg}
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────────────────

function App() {
  const [page, setPage] = useState<Page>('Dashboard');
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [pendingComments, setPendingComments] = useState(0);
  const [pendingWriters, setPendingWriters] = useState(0);
  const [editItem, setEditItem] = useState<any>(null);

  useEffect(() => {
    api('/api/admin/analytics').then((d: any) => {
      setPendingComments(d.pending_comments || 0);
      setPendingWriters(d.pending_writers || 0);
    }).catch(() => {});
  }, []);

  const openCreate = (type: string) => { setEditItem(null); setModal(type); };
  const openEdit = (type: string, item: any) => { setEditItem(item); setModal(type); };
  const closeModal = () => { setModal(null); setEditItem(null); };
  const showToast = (msg: string) => setToast(msg);

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="mark">ল</div>
          <div><strong>Lekhoni</strong><small>CONTENT STUDIO</small></div>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button key={label} className={page === label ? 'active' : ''} onClick={() => setPage(label)}>
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Comments' && pendingComments > 0 && <b>{pendingComments}</b>}
              {label === 'Writers' && pendingWriters > 0 && <b>{pendingWriters}</b>}
            </button>
          ))}
        </nav>
        <div className="admin">
          <div className="avatar">K</div>
          <div><strong>Kawsar</strong><small>Administrator</small></div>
          <ChevronDown size={15} />
        </div>
      </aside>
      <main>
        <header>
          <button className="mobile"><Menu /></button>
          <div>
            <p className="kicker">LEKHONI KAHINI</p>
            <h1>{page}</h1>
          </div>
          <div className="head-actions">
            <label className="search">
              <Search size={17} />
              <input placeholder="Search anything..." />
            </label>
            <button className="icon"><Bell size={19} /><i /></button>
            {(page === 'Books') && <button className="primary" onClick={() => openCreate('book')}><Plus size={17} /> New book</button>}
            {page === 'Chapters' && <button className="primary" onClick={() => openCreate('chapter')}><Plus size={17} /> New chapter</button>}
            {page === 'Categories' && <button className="primary" onClick={() => openCreate('category')}><Plus size={17} /> New category</button>}
            {page === 'Notifications' && <button className="primary" onClick={() => openCreate('notification')}><Plus size={17} /> New notification</button>}
          </div>
        </header>
        {page === 'Dashboard' && <Dashboard onCreate={() => openCreate('book')} onToast={showToast} />}
        {page === 'Books' && <BooksPage onEdit={(b: Book) => openEdit('book', b)} onToast={showToast} onRefreshPending={setPendingComments} />}
        {page === 'Chapters' && <ChaptersPage onToast={showToast} />}
        {page === 'Categories' && <CategoriesPage onEdit={(c: Category) => openEdit('category', c)} onToast={showToast} />}
        {page === 'Comments' && <CommentsPage onToast={showToast} onRefreshPending={setPendingComments} />}
            {page === 'Writers' && <WritersPage onToast={showToast} onRefreshPending={setPendingWriters} />}
            {page === 'Home Control' && <HomeControlPage onToast={showToast} />}
            {page === 'Notifications' && <NotificationsPage onToast={showToast} />}
        {page === 'Analytics' && <AnalyticsPage />}
        {page === 'Settings' && <SettingsPage />}
      </main>
      {modal === 'book' && <BookModal editItem={editItem} close={closeModal} onToast={showToast} />}
      {modal === 'chapter' && <ChapterModal close={closeModal} onToast={showToast} />}
      {modal === 'category' && <CategoryModal editItem={editItem} close={closeModal} onToast={showToast} />}
      {modal === 'notification' && <NotificationModal close={closeModal} onToast={showToast} />}
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────

function Dashboard({ onCreate, onToast }: { onCreate: () => void; onToast: (m: string) => void }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/api/admin/analytics')
      .then(d => setData(d))
      .catch(() => onToast('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => {
    const id = setInterval(() => {
      api('/api/admin/analytics')
        .then(d => { if (d) setData(d); })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const d = data;

  const [viewsOn, setViewsOn] = useState<boolean>(true);
  useEffect(() => {
    api<{ views_visible: boolean }>('/api/admin/app-config')
      .then(r => setViewsOn(r.views_visible !== false))
      .catch(() => { });
  }, []);
  const toggleGlobalViews = async () => {
    const next = !viewsOn;
    setViewsOn(next);
    try {
      await api('/api/admin/app-config', { method: 'PUT', body: JSON.stringify({ views_visible: next }) });
      onToast(next ? 'Views ON — app now shows all views' : 'Views OFF — app now hides all views');
    } catch { onToast('Failed to update'); }
  };

  return (
    <div className="content">
      <div className="welcome">
        <div>
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <h2>Your stories are reaching more readers.</h2>
          <p>Live insights and publishing activity across Lekhoni Kahini.</p>
        </div>
        <button onClick={onCreate}><Plus size={18} /> Publish something</button>
      </div>
      <div className="metrics">
        <Metric icon={BookOpen} label="Published books" value={loading ? '...' : String(d?.published_books ?? 0)} delta={loading ? '' : `${d?.total_books ?? 0} total`} />
        <Metric icon={Eye} label="Total reads" value={loading ? '...' : formatNumber(d?.total_views ?? 0)} delta={loading ? '' : `${formatNumber(d?.views_today ?? 0)} today`} />
        <Metric icon={MessageSquare} label="Pending comments" value={loading ? '...' : String(d?.pending_comments ?? 0)} delta="Needs review" warn={!!d?.pending_comments} />
        <Metric icon={Users} label="Pending writer stories" value={loading ? '...' : String(d?.pending_writers ?? 0)} delta="Awaiting review" warn={!!d?.pending_writers} />
      </div>
      <div className="panel dashboard-toggle">
        <div>
          <Eye size={20} style={{ color: viewsOn ? '#2aa876' : '#e15e4e' }} />
          <div>
            <h4>App views display</h4>
            <p>When OFF, the mobile app hides the views count on every book (the realtime count still keeps rising). When ON, books show views as normal.</p>
          </div>
        </div>
        <button className={viewsOn ? 'tg on' : 'tg off'} onClick={toggleGlobalViews}>
          <span>{viewsOn ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="panel chart">
          <PanelHead title="Reading activity" sub="Views over the last 7 days" action="View analytics" />
          <ChartArea data={d?.daily_views || []} />
        </section>
        <section className="panel live">
          <PanelHead title="Live now" sub="Updates in real time" action={<span className="live-badge"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#4ccaa7', marginRight: 5, boxShadow: '0 0 0 3px #4ccaa722', animation: 'livepulse 1.5s infinite' }} />Auto-refresh</span>} />
          <div className="live-count">
            <Activity size={20} />
            <strong>{d?.active_readers ?? 0}</strong>
            <span>active readers</span>
          </div>
          {(d?.recent_books || []).slice(0, 5).map((b, i) => (
            <div className="live-row" key={b.id || i}>
              <div className="mini-cover" style={{ background: stringToColor(b.title) }}>ল</div>
              <div>
                <b>{b.title}</b>
                <small>{b.author}</small>
              </div>
              <span>{formatNumber(b.views)} views</span>
            </div>
          ))}
          {!loading && (!d?.recent_books || d.recent_books.length === 0) && (
            <div className="live-row">
              <div className="mini-cover" style={{ background: '#123E39' }}>ল</div>
              <div><b>No data yet</b><small>Start publishing to see activity</small></div>
              <span>--</span>
            </div>
          )}
        </section>
      </div>
      {d?.recent_comments && d.recent_comments.length > 0 && (
        <div className="dashboard-grid" style={{ marginTop: 14 }}>
          <section className="panel recent">
            <PanelHead title="Recent comments" sub="Latest reader feedback" />
            {d.recent_comments.slice(0, 4).map((c, i) => (
              <div className="live-row" key={c.id || i}>
                <div className="mini-cover" style={{ background: statusColor(c.status) }}>{c.user_name?.charAt(0)?.toUpperCase() || '?'}</div>
                <div>
                  <b>{c.user_name}</b>
                  <small>{c.body?.slice(0, 60)}{c.body && c.body.length > 60 ? '...' : ''}</small>
                </div>
                <span>{c.book_title || 'Unknown'}</span>
              </div>
            ))}
          </section>
          <section className="panel queue">
            <PanelHead title="Queue" sub="Items needing attention" />
            {d.pending_comments > 0 && (
              <div className="queue-row">
                <div><MessageSquare size={18} /><span>Pending comments</span></div>
                <b>{d.pending_comments}</b>
              </div>
            )}
            {d.pending_writers > 0 && (
              <div className="queue-row">
                <div><Users size={18} /><span>Pending writers</span></div>
                <b>{d.pending_writers}</b>
              </div>
            )}
            {d.total_books - d.published_books > 0 && (
              <div className="queue-row">
                <div><FileEdit size={18} /><span>Draft books</span></div>
                <b>{d.total_books - d.published_books}</b>
              </div>
            )}
            {d.pending_comments === 0 && d.pending_writers === 0 && (
              <div className="live-row">
                <div className="mini-cover" style={{ background: '#18342d' }}><Check size={14} /></div>
                <div><b>All clear</b><small>No items in queue</small></div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ─── Books Page ─────────────────────────────────────────────────────────

function BooksPage({ onEdit, onToast, onRefreshPending }: { onEdit: (b: Book) => void; onToast: (m: string) => void; onRefreshPending?: (n: number) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/books')
      .then((d: any) => setBooks(Array.isArray(d) ? d : d.books || d.data || []))
      .catch(() => onToast('Failed to load books'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (book: Book) => {
    const newStatus = book.status === 'published' ? 'draft' : 'published';
    try {
      await api(`/api/admin/books/${book.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      setBooks(prev => prev.map(b => b.id === book.id ? { ...b, status: newStatus as any } : b));
      onToast(`Book ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch {
      onToast('Failed to update book');
    }
  };

  const deleteBook = async (book: Book) => {
    if (!confirm(`Delete "${book.title}"?`)) return;
    try {
      await api(`/api/admin/books/${book.id}`, { method: 'DELETE' });
      setBooks(prev => prev.filter(b => b.id !== book.id));
      onToast('Book deleted');
    } catch {
      onToast('Failed to delete book');
    }
  };

  const setHomeSection = async (book: Book, hs: string) => {
    const val = hs === '' ? null : hs;
    try {
      await api(`/api/admin/books/${book.id}`, { method: 'PUT', body: JSON.stringify({ home_section: val }) });
      setBooks(prev => prev.map(b => b.id === book.id ? { ...b, home_section: val || undefined } : b));
      onToast(val ? `Home section: ${val}` : 'Auto section');
    } catch { onToast('Failed to update'); }
  };

  const toggleFeature = async (book: Book) => {
    const next = !book.featured;
    try {
      await api(`/api/admin/books/${book.id}`, { method: 'PUT', body: JSON.stringify({ featured: next }) });
      setBooks(prev => prev.map(b => b.id === book.id ? { ...b, featured: next } : b));
      onToast(next ? 'Added to Featured' : 'Removed from Featured');
    } catch { onToast('Failed to update'); }
  };

  const toggleViewsVisible = async (book: Book) => {
    const next = book.views_visible === false;
    try {
      await api(`/api/admin/books/${book.id}`, { method: 'PUT', body: JSON.stringify({ views_visible: next }) });
      setBooks(prev => prev.map(b => b.id === book.id ? { ...b, views_visible: next } : b));
      onToast(next ? 'Views ON (visible in app)' : 'Views OFF (hidden in app)');
    } catch { onToast('Failed to update'); }
  };

  const filtered = books.filter(b =>
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage books</h2>
          <p>Everything published here syncs safely with the mobile app.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search books..." value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <button><Filter size={16} /> All statuses</button>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading books...</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <CloudUpload size={35} />
            <h3>No books yet</h3>
            <p>Create your first book to get started.</p>
          </div>
        ) : (
          <div className="table">
            {filtered.map(b => (
              <div className="tr" key={b.id}>
                <span className="book-cell">
                  <i style={{ background: stringToColor(b.title) }}>ল</i>
                  <em>
                    <b>{b.title}</b>
                    <small>{b.author}</small>
                  </em>
                </span>
                <span>
                  <u
                    className={b.status !== 'published' ? 'draft' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => togglePublish(b)}
                    title={`Click to ${b.status === 'published' ? 'unpublish' : 'publish'}`}
                  >
                    {b.status}
                  </u>
                </span>
                <span>{b.chapters_count ?? 0} ch.</span>
                <span>{formatNumber(b.views)} views</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    value={b.home_section || ''}
                    onChange={e => setHomeSection(b, e.target.value)}
                    style={{ background: 'transparent', color: '#8fa19c', border: '1px solid #ffffff22', borderRadius: 6, padding: '2px 4px', fontSize: 11 }}
                    title="Home section override"
                  >
                    <option value="">Auto</option>
                    <option value="ongoing">চলমান (new)</option>
                    <option value="weekly">সাপ্তাহিক</option>
                    <option value="monthly">মাসিক</option>
                    <option value="featured">বিশেষ (Featured)</option>
                  </select>
                  <button style={{ background: 'none', border: 'none', color: '#8fa19c', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => toggleViewsVisible(b)} title={b.views_visible === false ? 'Views OFF — click to show in app' : 'Views ON — click to hide in app'}>
                    {b.views_visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span style={{ fontSize: 10, fontWeight: 800, color: b.views_visible === false ? '#e15e4e' : '#2aa876' }}>{b.views_visible === false ? 'OFF' : 'ON'}</span>
                  </button>
                  <button style={{ background: 'none', border: 'none', color: b.featured ? '#f5c660' : '#8fa19c', cursor: 'pointer', padding: 2 }} onClick={() => toggleFeature(b)} title={b.featured ? 'Remove from Featured' : 'Add to Featured'}>
                    <Star size={15} fill={b.featured ? '#f5c660' : 'none'} />
                  </button>
                  <button style={{ background: 'none', border: 'none', color: '#8fa19c', cursor: 'pointer', padding: 2 }} onClick={() => onEdit(b)} title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }} onClick={() => deleteBook(b)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chapters Page ──────────────────────────────────────────────────────

function ChaptersPage({ onToast }: { onToast: (m: string) => void }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/chapters')
      .then((d: any) => setChapters(Array.isArray(d) ? d : d.chapters || d.data || []))
      .catch(() => onToast('Failed to load chapters'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const deleteChapter = async (ch: Chapter) => {
    if (!confirm(`Delete chapter "${ch.title}"?`)) return;
    try {
      await api(`/api/admin/chapters/${ch.id}`, { method: 'DELETE' });
      setChapters(prev => prev.filter(c => c.id !== ch.id));
      onToast('Chapter deleted');
    } catch {
      onToast('Failed to delete chapter');
    }
  };

  const togglePublish = async (ch: Chapter) => {
    const newStatus = ch.status === 'published' ? 'draft' : 'published';
    try {
      await api(`/api/admin/chapters/${ch.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, status: newStatus as any } : c));
      onToast(`Chapter ${newStatus}`);
    } catch {
      onToast('Failed to update chapter');
    }
  };

  const filtered = chapters.filter(c =>
    c.title?.toLowerCase().includes(search.toLowerCase()) ||
    (c.book_title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage chapters</h2>
          <p>All chapters across every published book.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search chapters..." value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <button><Filter size={16} /> All statuses</button>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading chapters...</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <CloudUpload size={35} />
            <h3>No chapters yet</h3>
            <p>Add chapters to your books.</p>
          </div>
        ) : (
          <div className="table">
            {filtered.map(ch => (
              <div className="tr" key={ch.id}>
                <span className="book-cell">
                  <i style={{ background: stringToColor(ch.title) }}>প</i>
                  <em>
                    <b>{ch.title}</b>
                    <small>{ch.book_title || 'Unknown book'}</small>
                  </em>
                </span>
                <span>
                  <u
                    className={ch.status !== 'published' ? 'draft' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => togglePublish(ch)}
                    title={`Click to toggle status`}
                  >
                    {ch.status}
                  </u>
                </span>
                <span>Pos. {ch.position}</span>
                <span>{formatNumber(ch.views)} views</span>
                <span>
                  <button style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }} onClick={() => deleteChapter(ch)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Categories Page ────────────────────────────────────────────────────

function CategoriesPage({ onEdit, onToast }: { onEdit: (c: Category) => void; onToast: (m: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/categories')
      .then((d: any) => setCategories(Array.isArray(d) ? d : d.categories || d.data || []))
      .catch(() => onToast('Failed to load categories'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const deleteCategory = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await api(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      onToast('Category deleted');
    } catch {
      onToast('Failed to delete category');
    }
  };

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage categories</h2>
          <p>Organize your books with categories.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search categories..." />
          </label>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading categories...</h3></div>
        ) : categories.length === 0 ? (
          <div className="empty">
            <CloudUpload size={35} />
            <h3>No categories yet</h3>
            <p>Create categories to organize books.</p>
          </div>
        ) : (
          <div className="table">
            {categories.map(cat => (
              <div className="tr" key={cat.id}>
                <span className="book-cell">
                  <i style={{ background: cat.color || '#18342d' }}>{cat.cover_url ? <img src={cat.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : ''}</i>
                  <em>
                    <b>{cat.name}</b>
                    <small>Position: {cat.position}</small>
                  </em>
                </span>
                <span>{cat.books_count ?? 0} books</span>
                <span><u>{cat.color || '#DDF5EC'}</u></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button style={{ background: 'none', border: 'none', color: '#8fa19c', cursor: 'pointer', padding: 2 }} onClick={() => onEdit(cat)} title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }} onClick={() => deleteCategory(cat)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comments Page ──────────────────────────────────────────────────────

function CommentsPage({ onToast, onRefreshPending }: { onToast: (m: string) => void; onRefreshPending?: (n: number) => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/comments')
      .then((d: any) => {
        const list = Array.isArray(d) ? d : d.comments || d.data || [];
        setComments(list);
        onRefreshPending?.(list.filter((c: Comment) => c.status === 'pending').length);
      })
      .catch(() => onToast('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [onToast, onRefreshPending]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (comment: Comment, status: 'approved' | 'hidden' | 'deleted' | 'pending') => {
    try {
      await api(`/api/admin/comments/${comment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (status === 'deleted') {
        setComments(prev => prev.filter(c => c.id !== comment.id));
      } else {
        setComments(prev => prev.map(c => c.id === comment.id ? { ...c, status } : c));
      }
      onToast(`Comment ${status}`);
      if (status === 'approved' || status === 'deleted') {
        api('/api/admin/analytics').then((d: any) => onRefreshPending?.(d.pending_comments || 0)).catch(() => {});
      }
    } catch {
      onToast('Failed to update comment');
    }
  };

  const filtered = comments.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.body?.toLowerCase().includes(search.toLowerCase()) && !c.user_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage comments</h2>
          <p>Review and moderate reader comments.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search comments..." value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'pending', 'approved', 'hidden', 'deleted'].map(f => (
              <button
                key={f}
                style={filter === f ? { background: '#1b2926', color: '#56d5b1', borderColor: '#56d5b1' } : {}}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading comments...</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <MessageSquare size={35} />
            <h3>No comments found</h3>
            <p>Comments from readers will appear here.</p>
          </div>
        ) : (
          <div className="table">
            {filtered.map(c => (
              <div className="tr" key={c.id} style={{ gridTemplateColumns: '1fr 100px 100px 120px 30px' }}>
                <span className="book-cell">
                  <div className="mini-cover" style={{ background: statusColor(c.status), fontSize: 11, width: 30, height: 30, borderRadius: '50%' }}>
                    {c.user_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <em>
                    <b>{c.user_name} <small style={{ color: '#6f827d' }}>on {c.book_title || 'Unknown'}</small></b>
                    <small>{c.body?.slice(0, 80)}{c.body && c.body.length > 80 ? '...' : ''}</small>
                  </em>
                </span>
                <span><small style={{ color: '#6f827d', fontSize: 9 }}>{c.user_email}</small></span>
                <span>
                  <u className={c.status === 'pending' ? 'draft' : ''}>{c.status}</u>
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {c.status !== 'approved' && (
                    <button
                      style={{ background: 'none', border: 'none', color: '#4dca9f', cursor: 'pointer', padding: 2 }}
                      onClick={() => updateStatus(c, 'approved')}
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  {c.status !== 'hidden' && (
                    <button
                      style={{ background: 'none', border: 'none', color: '#e3ae54', cursor: 'pointer', padding: 2 }}
                      onClick={() => updateStatus(c, 'hidden')}
                      title="Hide"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                  <button
                    style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }}
                    onClick={() => updateStatus(c, 'deleted')}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Writers Page ───────────────────────────────────────────────────────

function WritersPage({ onToast, onRefreshPending }: { onToast: (m: string) => void; onRefreshPending?: (n: number) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<any>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/writer-users')
      .then((d: any) => setUsers(Array.isArray(d) ? d : d.writers || d.data || []))
      .catch(() => onToast('Failed to load writers'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    try {
      const d = await api<any>(`/api/admin/writer-users/${id}`);
      if (d) setSel(d);
    } catch { onToast('Failed to load writer detail'); }
  };

  const setStoryStatus = async (story: any, status: 'published' | 'rejected') => {
    const n = note[story.id] || '';
    try {
      await api(`/api/admin/writers/${story.id}`, { method: 'PUT', body: JSON.stringify({ status, note: n }) });
      setSel((s: any) => ({ ...s, stories: (s.stories || []).map((x: any) => x.id === story.id ? { ...x, status, review_note: n } : x) }));
      onRefreshPending?.(-1);
      onToast(status === 'published' ? 'Story published to app' : 'Story rejected');
    } catch { onToast('Failed to update story'); }
  };

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>All writers</h2>
          <p>Check each writer — how many stories they've published and their details.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search writers..." onChange={e => { const q = (e.target.value || '').toLowerCase(); setUsers(prev => prev); }} />
          </label>
          <span style={{ color: '#6f827d', fontSize: 12 }}>{users.length} writers</span>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading writers...</h3></div>
        ) : users.length === 0 ? (
          <div className="empty"><Users size={35} /><h3>No writers yet</h3><p>Writer accounts will appear here.</p></div>
        ) : (
          <div className="table">
            {users.map((u: any) => (
              <div className="tr" key={u.id} style={{ gridTemplateColumns: '52px 1fr 90px 90px 80px 80px', cursor: 'pointer' }} onClick={() => openDetail(u.id)}>
                <span className="book-cell">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div className="mini-cover" style={{ width: 40, height: 40, borderRadius: '50%', background: '#124d43', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: '900' }}>{(u.writer_name || '?')[0]}</div>}
                </span>
                <span className="book-cell">
                  <em>
                    <b>{u.writer_name} {u.badge && u.badge !== 'none' && (u.badge === 'verified' ? <img src="https://pub-55f5f01908bd4e3094ea07f7deaa7978.r2.dev/books/9d90db02-884a-47d9-9a07-19d7dd9f3a0c.png" alt="verified" style={{ width: 18, height: 18, verticalAlign: 'middle', marginLeft: 4 }} /> : u.badge === 'popular' ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, background: '#800020', marginLeft: 4, verticalAlign: 'middle', color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: '18px' }}>✓</span> : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, background: '#1B5E20', marginLeft: 4, verticalAlign: 'middle', color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: '18px' }}>✓</span>)}</b>
                    <small>@{u.username || '—'} {u.email ? `• ${u.email}` : ''}</small>
                  </em>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b>{u.published_stories ?? 0} published</b>
                  <small style={{ color: '#6f827d', fontSize: 10 }}>{u.total_stories ?? 0} total stories</small>
                </span>
                <span><b>{formatNumber(u.total_views ?? 0)}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>views</small></span>
                <span><b>{u.followers ?? u.follower_count ?? 0}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>followers</small></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <div className="overlay" onClick={() => setSel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Writer details</h3>
              <button className="icon" onClick={() => setSel(null)}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '4px 0 14px' }}>
              {sel.profile?.avatar_url ? <img src={sel.profile.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} /> : <div className="mini-cover" style={{ width: 64, height: 64, borderRadius: '50%', background: '#124d43', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: '900' }}>{(sel.profile?.writer_name || '?')[0]}</div>}
              <div>
                <h3 style={{ margin: 0 }}>{sel.profile?.writer_name} {sel.profile?.badge && sel.profile.badge !== 'none' && (sel.profile.badge === 'verified' ? <img src="https://pub-55f5f01908bd4e3094ea07f7deaa7978.r2.dev/books/9d90db02-884a-47d9-9a07-19d7dd9f3a0c.png" alt="verified" style={{ width: 22, height: 22, verticalAlign: 'middle', marginLeft: 6 }} /> : sel.profile.badge === 'popular' ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: '#800020', marginLeft: 6, verticalAlign: 'middle', color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: '22px' }}>✓</span> : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: '#1B5E20', marginLeft: 6, verticalAlign: 'middle', color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: '22px' }}>✓</span>)}</h3>
                <small style={{ color: '#6f827d' }}>@{sel.profile?.username}{sel.profile?.email ? ` • ${sel.profile.email}` : ''}</small>
                {sel.profile?.bio && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9fb0ab' }}>{sel.profile.bio}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
              <div><b>{sel.profile?.followers ?? 0}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>Followers</small></div>
              <div><b>{sel.stories?.length ?? 0}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>Stories</small></div>
              <div><b>{sel.stories?.filter((s: any) => s.status === 'published').length ?? 0}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>Published</small></div>
              <div><b>{(sel.stories || []).reduce((a: number, s: any) => a + (+s.views || 0), 0)}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>Total views</small></div>
              {sel.profile?.created_at && <div><b>{new Date(sel.profile.created_at).toLocaleDateString()}</b><small style={{ display: 'block', color: '#6f827d', fontSize: 10 }}>Joined</small></div>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '10px 14px', background: '#0e1614', borderRadius: 10, border: '1px solid #2d3e39' }}>
              <span style={{ color: '#9fb0ab', fontSize: 12, fontWeight: 600 }}>Badge:</span>
              {['none', 'verified', 'popular', 'top'].map(b => (
                <button key={b} onClick={async () => {
                  try {
                    await api(`/api/admin/writer-users/${sel.profile.id}`, { method: 'PATCH', body: JSON.stringify({ badge: b }) });
                    setSel((s: any) => ({ ...s, profile: { ...s.profile, badge: b } }));
                    setUsers(prev => prev.map((u: any) => u.id === sel.profile.id ? { ...u, badge: b } : u));
                    onToast(`Badge set to ${b}`);
                  } catch { onToast('Failed to update badge'); }
                }} style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11,
                  background: (sel.profile?.badge || 'none') === b ? (b === 'verified' ? '#3B82F6' : b === 'popular' ? '#F59E0B' : b === 'top' ? '#8B5CF6' : '#4ccaa7') : '#1a2622',
                  color: (sel.profile?.badge || 'none') === b ? '#fff' : '#6f827d',
                  textTransform: 'capitalize'
                }}>{b === 'none' ? 'No badge' : b}</button>
              ))}
            </div>
            <div className="table">
              {(sel.stories || []).map((s: any) => (
                <div className="tr" key={s.id} style={{ gridTemplateColumns: '1fr 90px 90px 80px 120px' }}>
                  <span className="book-cell"><em><b>{s.title}</b><small>{s.category || '—'} • {s.chapter_count || s.chapters_count || 0} chapters</small></em></span>
                  <span><u className={s.status === 'pending' ? 'draft' : ''}>{s.status}</u></span>
                  <span>{formatNumber(s.views)} views</span>
                  <span><small style={{ color: '#5f716c', fontSize: 9 }}>{timeAgo(s.created_at)}</small></span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {s.status === 'pending' ? (
                      <>
                        <input placeholder="Note" value={note[s.id] || ''} onChange={e => setNote(p => ({ ...p, [s.id]: e.target.value }))} style={{ width: 70, padding: '4px', fontSize: 9, background: '#0e1614', border: '1px solid #2d3e39', borderRadius: 4, color: '#e9f1ee', outline: 'none' }} />
                        <button style={{ background: 'none', border: 'none', color: '#4dca9f', cursor: 'pointer' }} onClick={() => setStoryStatus(s, 'published')} title="Approve / Publish"><Check size={14} /></button>
                        <button style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer' }} onClick={() => setStoryStatus(s, 'rejected')} title="Reject"><Ban size={14} /></button>
                      </>
                    ) : <small style={{ color: '#6f827d', fontSize: 9 }}>{s.review_note || 'No note'}</small>}
                  </span>
                </div>
              ))}
              {(!sel.stories || sel.stories.length === 0) && <div className="empty"><h3>No stories</h3></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Home Control Page ──────────────────────────────────────────────────

const HOME_SECTIONS: { key: string; label: string; desc: string; icon: React.ElementType }[] = [
  { key: 'featured', label: 'Featured Carousel', desc: 'Auto-playing hero carousel (শীর্ষ স্লাইডার)', icon: Sparkles },
  { key: 'newEpisodes', label: 'নতুন পর্ব / New Episodes', desc: 'সাম্প্রতিক যোগ হওয়া বই', icon: Zap },
  { key: 'mostPopular', label: 'সর্বাধিক জনপ্রিয় / Most Popular', desc: 'মোট দর্শন অনুযায়ী সেরা', icon: TrendingUp },
  { key: 'weeklyPopular', label: 'সাপ্তাহিক জনপ্রিয় / Weekly Popular', desc: 'গত ৭ দিনের দর্শন', icon: Calendar },
  { key: 'monthlyPopular', label: 'মাসিক জনপ্রিয় / Monthly Popular', desc: 'গত ৩০ দিনের দর্শন', icon: Star },
  { key: 'popularAuthors', label: 'জনপ্রিয় লেখক / Popular Authors', desc: 'অনুসারী অনুযায়ী সেরা লেখক', icon: Users },
];

function HomeControlPage({ onToast }: { onToast: (m: string) => void }) {
  const [sections, setSections] = useState<{ key: string; enabled: boolean; title?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<{ key: string; enabled: boolean; title?: string }[]>('/api/admin/home-config')
      .then((d) => setSections(d && d.length ? d.map((x) => ({ key: x.key, enabled: x.enabled !== false, title: x.title || '' })) : HOME_SECTIONS.map((s) => ({ key: s.key, enabled: true, title: '' }))))
      .catch(() => setSections(HOME_SECTIONS.map((s) => ({ key: s.key, enabled: true, title: '' }))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggle = (key: string) =>
    setSections((s) => s.map((x) => (x.key === key ? { ...x, enabled: !x.enabled } : x)));

  const setTitle = (key: string, title: string) =>
    setSections((s) => s.map((x) => (x.key === key ? { ...x, title } : x)));

  const setAll = (enabled: boolean) => setSections((s) => s.map((x) => ({ ...x, enabled })));

  const move = (i: number, dir: -1 | 1) =>
    setSections((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    setSaving(true);
    api('/api/admin/home-config', { method: 'PUT', body: JSON.stringify({ sections }) })
      .then(() => onToast('Home control saved'))
      .catch(() => onToast('Failed to save'))
      .finally(() => setSaving(false));
  };

  const ordered = [...sections].sort((a, b) => HOME_SECTIONS.findIndex((x) => x.key === a.key) - HOME_SECTIONS.findIndex((x) => x.key === b.key));

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Home Page Control</h2>
          <p>Home page-এর প্রতিটি সেকশন এখান থেকে নিয়ন্ত্রণ করুন — কোনটা দেখাবে, কী ক্রমে দেখাবে।</p>
        </div>
        <button className="primary save" onClick={save} disabled={saving}>
          <Loader2 size={15} className={saving ? 'spin' : ''} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="hc-actions">
        <button className="hchost" onClick={() => setAll(true)}><Check size={15} /> <span>সব দেখান (Enable all)</span></button>
        <button className="hchost" onClick={() => setAll(false)}><Ban size={15} /> <span>সব বন্ধ (Disable all)</span></button>
      </div>

      {loading ? (
        <div className="hc-empty"><Loader2 className="spin" size={22} /></div>
      ) : (
        <div className="hc-list">
          {ordered.map((s, i) => {
            const meta = HOME_SECTIONS.find((x) => x.key === s.key);
            const Icon = meta?.icon || LayoutDashboard;
            return (
              <div key={s.key} className={`hc-row ${s.enabled ? '' : 'off'}`}>
                <div className="hc-pos"><b>{i + 1}</b></div>
                <div className="hc-icon"><Icon size={18} /></div>
                <div className="hc-info">
                  <strong>{meta?.label || s.key}</strong>
                  <input
                    className="hc-title-input"
                    placeholder="Custom title (খালি রাখলে অটো)"
                    value={s.title || ''}
                    onChange={(e) => setTitle(s.key, e.target.value)}
                  />
                  <span>{meta?.desc}</span>
                </div>
                <div className="hc-order">
                  <button className="icon sm" onClick={() => move(i, -1)} disabled={i === 0}><span>↑</span></button>
                  <button className="icon sm" onClick={() => move(i, 1)} disabled={i === ordered.length - 1}><span>↓</span></button>
                </div>
                <button className="hc-toggle" onClick={() => toggle(s.key)} title={s.enabled ? 'Visible' : 'Hidden'}>
                  <span className={`hc-toggle-text ${s.enabled ? 'on' : ''}`}>{s.enabled ? 'On' : 'Off'}</span>
                  {s.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Notifications Page ─────────────────────────────────────────────────

function NotificationsPage({ onToast }: { onToast: (m: string) => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const iconMap: Record<string, React.ElementType> = {
    'bell': Bell, 'book-open': BookOpen, 'heart': Heart, 'star': Star, 'zap': Zap,
    'gift': Gift, 'message-circle': MessageSquare, 'megaphone': Megaphone, 'sparkles': Sparkles,
    'alert-circle': AlertTriangle, 'check-circle': Check, 'info': Info, 'trending-up': TrendingUp,
    'award': Award, 'download': Download,
  };

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/notifications')
      .then((d: any) => setNotifications(Array.isArray(d) ? d : d.notifications || d.data || []))
      .catch(() => onToast('Failed to load notifications'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const deleteNotification = async (n: Notification) => {
    if (!confirm(`Delete notification "${n.title}"?`)) return;
    try {
      await api(`/api/admin/notifications/${n.id}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(x => x.id !== n.id));
      onToast('Notification deleted');
    } catch {
      onToast('Failed to delete notification');
    }
  };

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage notifications</h2>
          <p>Send and manage push notifications to your readers.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search notifications..." />
          </label>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading notifications...</h3></div>
        ) : notifications.length === 0 ? (
          <div className="empty">
            <Bell size={35} />
            <h3>No notifications yet</h3>
            <p>Create notifications to reach your readers.</p>
          </div>
        ) : (
          <div className="table">
            {notifications.map(n => {
              const IconComp = iconMap[n.icon] || Bell;
              return (
                <div className="tr" key={n.id} style={{ gridTemplateColumns: '1fr 80px 80px 70px 30px' }}>
                  <span className="book-cell">
                    <div className="mini-cover" style={{ background: '#18342d', color: '#4dca9f', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconComp size={16} />
                    </div>
                    <em>
                      <b>{n.title}</b>
                      <small>{n.body?.slice(0, 70)}{n.body && n.body.length > 70 ? '...' : ''}</small>
                      {n.url && <small style={{ color: '#4dca9f' }}>🔗 {n.url}</small>}
                    </em>
                  </span>
                  <span><small style={{ color: '#6f827d', fontSize: 9 }}>{n.icon}</small></span>
                  <span>{n.target && <small style={{ padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, background: n.target === 'writer' ? '#6366F1' : '#18342d', color: n.target === 'writer' ? '#c4b5fd' : '#4dca9f' }}>{n.target === 'writer' ? `Writer${(n as any).writer_count > 1 ? ` (${(n as any).writer_count})` : ''}` : 'Reader'}</small>}</span>
                  <span><small style={{ color: '#5f716c', fontSize: 9 }}>{timeAgo(n.created_at)}</small></span>
                  <span>
                  <button
                    style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }}
                    onClick={() => deleteNotification(n)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analytics Page ─────────────────────────────────────────────────────

function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/api/admin/analytics')
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="content">
        <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading analytics...</h3></div>
      </div>
    );
  }

  const d = data;

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Analytics</h2>
          <p>Deep dive into your content performance.</p>
        </div>
      </div>
      <div className="metrics">
        <Metric icon={Globe} label="Total views" value={formatNumber(d?.total_views ?? 0)} delta={`${formatNumber(d?.views_today ?? 0)} today`} />
        <Metric icon={TrendingUp} label="This week" value={formatNumber(d?.views_this_week ?? 0)} delta={`${formatNumber(d?.views_this_month ?? 0)} this month`} />
        <Metric icon={BookOpen} label="Published books" value={String(d?.published_books ?? 0)} delta={`${d?.total_books ?? 0} total`} />
        <Metric icon={MessageSquare} label="Total comments" value={String(d?.total_comments ?? 0)} delta={`${d?.pending_comments ?? 0} pending`} />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart">
          <PanelHead title="Views over time" sub="Daily view counts" />
          <ChartArea data={d?.daily_views || []} />
        </section>
        <section className="panel">
          <PanelHead title="Top books" sub="Most viewed content" />
          {(d?.popular_books || []).slice(0, 6).map((b, i) => (
            <div className="live-row" key={b.id || i}>
              <div className="mini-cover" style={{ background: stringToColor(b.title) }}>ল</div>
              <div>
                <b>{b.title}</b>
                <small>{b.author}</small>
              </div>
              <span>{formatNumber(b.views)} views</span>
            </div>
          ))}
          {(!d?.popular_books || d.popular_books.length === 0) && (
            <div className="live-row">
              <div className="mini-cover" style={{ background: '#123E39' }}>ল</div>
              <div><b>No data yet</b></div>
              <span>--</span>
            </div>
          )}
        </section>
      </div>
      {d?.recent_comments && d.recent_comments.length > 0 && (
        <div className="dashboard-grid" style={{ marginTop: 14 }}>
          <section className="panel">
            <PanelHead title="Recent comments" sub="Latest reader feedback" />
            {d.recent_comments.slice(0, 5).map((c, i) => (
              <div className="live-row" key={c.id || i}>
                <div className="mini-cover" style={{ background: statusColor(c.status), fontSize: 11, width: 32, height: 32, borderRadius: '50%' }}>
                  {c.user_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <b>{c.user_name} <small style={{ color: '#6f827d' }}>on {c.book_title}</small></b>
                  <small>{c.body?.slice(0, 50)}{c.body && c.body.length > 50 ? '...' : ''}</small>
                </div>
                <span><u className={c.status === 'pending' ? 'draft' : ''}>{c.status}</u></span>
              </div>
            ))}
          </section>
          <section className="panel">
            <PanelHead title="Quick stats" sub="Content breakdown" />
            <div className="queue-row">
              <div><BookOpen size={18} /><span>Total books</span></div>
              <b>{d?.total_books ?? 0}</b>
            </div>
            <div className="queue-row">
              <div><FileEdit size={18} /><span>Total chapters</span></div>
              <b>{(d?.popular_books || []).reduce((sum, b) => sum + (b.chapters_count || 0), 0)}</b>
            </div>
            <div className="queue-row">
              <div><Menu size={18} /><span>Categories</span></div>
              <b>{d?.total_categories ?? 0}</b>
            </div>
            <div className="queue-row">
              <div><Users size={18} /><span>Writers</span></div>
              <b>{d?.total_writers ?? 0}</b>
            </div>
            <div className="queue-row">
              <div><Activity size={18} /><span>Active readers</span></div>
              <b>{d?.active_readers ?? 0}</b>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────────────────────

function SettingsPage() {
  const [siteName, setSiteName] = useState('Lekhoni Kahini');
  const [siteDesc, setSiteDesc] = useState('A Bengali storytelling platform');
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Settings</h2>
          <p>Configure your admin panel and platform settings.</p>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 600 }}>
        <h3 style={{ marginBottom: 16 }}>General</h3>
        <label>
          Site name
          <input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="Your site name" />
        </label>
        <label>
          Description
          <textarea rows={3} value={siteDesc} onChange={e => setSiteDesc(e.target.value)} placeholder="Site description" />
        </label>
        <label>
          API Endpoint
          <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="Worker URL" />
        </label>
        <h3 style={{ margin: '24px 0 16px' }}>Features</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={e => setNotifEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Enable push notifications</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={e => setAutoApprove(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Auto-approve comments</span>
        </label>
        <div className="modal-actions">
          <button className="primary">Save settings</button>
        </div>
      </div>
    </div>
  );
}

// ─── Book Modal ─────────────────────────────────────────────────────────

function BookModal({ editItem, close, onToast }: { editItem: Book | null; close: () => void; onToast: (m: string) => void }) {
  const [title, setTitle] = useState(editItem?.title || '');
  const [author, setAuthor] = useState(editItem?.author || '');
  const [summary, setSummary] = useState(editItem?.summary || '');
  const [categoryId, setCategoryId] = useState(editItem?.category_id || '');
  const [status, setStatus] = useState<string>(editItem?.status || 'draft');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(editItem?.cover_url || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api('/api/admin/categories')
      .then((d: any) => setCategories(Array.isArray(d) ? d : d.categories || d.data || []))
      .catch(() => {});
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      onToast('Title and author are required');
      return;
    }
    setSubmitting(true);
    try {
      let coverUrl = editItem?.cover_url || '';

      if (coverFile) {
        const fd = new FormData();
        fd.append('file', coverFile);
        const uploadRes = await fetch(`${API_BASE}/api/media`, { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Cover upload failed');
        const uploadData = await uploadRes.json();
        coverUrl = uploadData.url || uploadData.path || uploadData.location || '';
      }

      const payload = {
        title: title.trim(),
        author: author.trim(),
        summary: summary.trim(),
        cover_url: coverUrl,
        category_id: categoryId || undefined,
        status,
      };

      if (editItem) {
        await api(`/api/admin/books/${editItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onToast('Book updated');
      } else {
        await api('/api/admin/books', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Book created');
      }
      close();
    } catch (err) {
      onToast('Failed to save book');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="kicker">{editItem ? 'EDIT BOOK' : 'NEW CONTENT'}</p>
            <h2>{editItem ? 'Edit book' : 'Create a book'}</h2>
          </div>
          <button type="button" onClick={close}><X /></button>
        </div>
        <label>
          Book title
          <input
            required
            placeholder="নতুন গল্পের নাম"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Author
            <input
              required
              placeholder="লেখকের নাম"
              value={author}
              onChange={e => setAuthor(e.target.value)}
            />
          </label>
          <label>
            Category
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <div />
        </div>
        <label>
          Summary
          <textarea
            rows={4}
            placeholder="Write a short description..."
            value={summary}
            onChange={e => setSummary(e.target.value)}
          />
        </label>
        <label className="upload" style={coverPreview ? { borderStyle: 'solid', borderColor: '#4dca9f' } : {}}>
          <CloudUpload />
          <span>{coverPreview ? 'Cover selected - click to change' : 'Upload cover image'}</span>
          <small>PNG, JPG or WEBP · stored in Cloudflare R2</small>
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            onChange={onFileChange}
          />
        </label>
        {coverPreview && (
          <div style={{ marginTop: 8 }}>
            <img
              src={coverPreview}
              alt="Cover preview"
              style={{ width: 80, height: 100, objectFit: 'cover', borderRadius: 6 }}
            />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={submitting}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={17} className="spin" /> : <>{editItem ? 'Update book' : 'Save book'}</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Chapter Modal ──────────────────────────────────────────────────────

function ChapterModal({ close, onToast }: { close: () => void; onToast: (m: string) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [position, setPosition] = useState(1);
  const [status, setStatus] = useState('draft');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/admin/books')
      .then((d: any) => setBooks(Array.isArray(d) ? d : d.books || d.data || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId || !title.trim()) {
      onToast('Select a book and enter chapter title');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/admin/chapters', {
        method: 'POST',
        body: JSON.stringify({
          book_id: bookId,
          title: title.trim(),
          body,
          position: Number(position),
          status,
        }),
      });
      onToast('Chapter created');
      close();
    } catch {
      onToast('Failed to create chapter');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="kicker">NEW CHAPTER</p>
            <h2>Add a chapter</h2>
          </div>
          <button type="button" onClick={close}><X /></button>
        </div>
        <label>
          Select book
          <select required value={bookId} onChange={e => setBookId(e.target.value)}>
            <option value="">Choose a book...</option>
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.title} — {b.author}</option>
            ))}
          </select>
        </label>
        <label>
          Chapter title
          <input
            required
            placeholder="প্রথম অধ্যায়"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Position
            <input
              type="number"
              min={1}
              value={position}
              onChange={e => setPosition(Number(e.target.value))}
            />
          </label>
          <label>
            Status
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>
        <label>
          Body
          <textarea
            rows={8}
            placeholder="Write the chapter content here... (supports Markdown)"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={submitting}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={17} className="spin" /> : <>Save chapter</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Category Modal ─────────────────────────────────────────────────────

function CategoryModal({ editItem, close, onToast }: { editItem: Category | null; close: () => void; onToast: (m: string) => void }) {
  const [name, setName] = useState(editItem?.name || '');
  const [color, setColor] = useState(editItem?.color || '#DDF5EC');
  const [position, setPosition] = useState(editItem?.position || 0);
  const [imageMethod, setImageMethod] = useState<'url' | 'upload'>(editItem?.cover_url ? 'url' : 'url');
  const [coverUrl, setCoverUrl] = useState(editItem?.cover_url || '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(editItem?.cover_url || '');
  const [resizeWidth, setResizeWidth] = useState(600);
  const [resizeHeight, setResizeHeight] = useState(340);
  const [lockRatio, setLockRatio] = useState(true);
  const [originalImg, setOriginalImg] = useState<HTMLImageElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCoverPreview(result);
      const img = new window.Image();
      img.onload = () => {
        setOriginalImg(img);
        setResizeWidth(img.naturalWidth);
        setResizeHeight(img.naturalHeight);
        setLockRatio(true);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (url: string) => {
    setCoverUrl(url);
    setCoverPreview(url);
    setCoverFile(null);
    setOriginalImg(null);
  };

  const handleWidthChange = (w: number) => {
    setResizeWidth(w);
    if (lockRatio && originalImg) {
      setResizeHeight(Math.round(w * originalImg.naturalHeight / originalImg.naturalWidth));
    }
  };

  const handleHeightChange = (h: number) => {
    setResizeHeight(h);
    if (lockRatio && originalImg) {
      setResizeWidth(Math.round(h * originalImg.naturalWidth / originalImg.naturalHeight));
    }
  };

  const resizeImage = (img: HTMLImageElement, w: number, h: number): Promise<Blob> => {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.85);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { onToast('Category name is required'); return; }
    setSubmitting(true);
    try {
      let finalCoverUrl = '';
      if (imageMethod === 'upload' && coverFile) {
        let fileToUpload: File | Blob = coverFile;
        if (originalImg && (resizeWidth !== originalImg.naturalWidth || resizeHeight !== originalImg.naturalHeight)) {
          const resized = await resizeImage(originalImg, resizeWidth, resizeHeight);
          fileToUpload = new File([resized], coverFile.name, { type: 'image/jpeg' });
        }
        const fd = new FormData();
        fd.append('file', fileToUpload);
        const uploadRes = await fetch(`${API_BASE}/api/media`, { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Cover upload failed');
        const uploadData = await uploadRes.json();
        finalCoverUrl = uploadData.url || uploadData.path || uploadData.location || '';
      } else if (imageMethod === 'url' && coverUrl.trim()) {
        finalCoverUrl = coverUrl.trim();
      }
      const payload: Record<string, unknown> = { name: name.trim(), color, cover_url: finalCoverUrl || null, position: Number(position) };
      if (editItem) {
        await api(`/api/admin/categories/${editItem.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        onToast('Category updated');
      } else {
        await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ ...payload, icon: '' }) });
        onToast('Category created');
      }
      close();
    } catch { onToast('Failed to save category'); } finally { setSubmitting(false); }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="kicker">{editItem ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</p>
            <h2>{editItem ? 'Edit category' : 'Create a category'}</h2>
          </div>
          <button type="button" onClick={close}><X /></button>
        </div>
        <label>
          Category name
          <input required placeholder="e.g. উপন্যাস, রোমান্টিক, থ্রিলার" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Color
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 40, height: 38, padding: 2, cursor: 'pointer' }} />
              <input placeholder="#DDF5EC" value={color} onChange={e => setColor(e.target.value)} style={{ flex: 1 }} />
            </div>
          </label>
          <label>
            Position
            <input type="number" min={0} value={position} onChange={e => setPosition(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>Cover Image</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setImageMethod('url')} style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: `2px solid ${imageMethod === 'url' ? '#4dca9f' : '#2a3a44'}`, background: imageMethod === 'url' ? 'rgba(77,202,159,0.12)' : 'transparent', color: '#b5c4cf', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Paste URL</button>
          <button type="button" onClick={() => setImageMethod('upload')} style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: `2px solid ${imageMethod === 'upload' ? '#4dca9f' : '#2a3a44'}`, background: imageMethod === 'upload' ? 'rgba(77,202,159,0.12)' : 'transparent', color: '#b5c4cf', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Upload Image</button>
        </div>
        {imageMethod === 'url' ? (
          <label>
            Image URL
            <input placeholder="https://example.com/image.jpg" value={coverUrl} onChange={e => handleUrlChange(e.target.value)} />
          </label>
        ) : (
          <label className="upload" style={coverPreview ? { borderStyle: 'solid', borderColor: '#4dca9f' } : {}}>
            <input type="file" accept="image/*" onChange={handleCoverChange} style={{ display: 'none' }} />
            <CloudUpload size={19} />
            <span>{coverPreview ? 'Image selected - click to change' : 'Choose image file'}</span>
          </label>
        )}
        {coverPreview && <img src={coverPreview} alt="Preview" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, maxHeight: 140, objectFit: 'cover' }} />}
        {originalImg && imageMethod === 'upload' && (
          <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: '#0d1b2a', border: '1px solid #2a3a44' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#8fa19c', marginBottom: 8 }}>RESIZE IMAGE</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: 80 }}>
                Width
                <input type="number" min={50} max={3000} value={resizeWidth} onChange={e => handleWidthChange(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
              <span style={{ color: '#556', fontSize: 18, marginTop: 14 }}>×</span>
              <label style={{ flex: 1, minWidth: 80 }}>
                Height
                <input type="number" min={50} max={3000} value={resizeHeight} onChange={e => handleHeightChange(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, cursor: 'pointer', color: '#b5c4cf', fontSize: 12 }}>
                <input type="checkbox" checked={lockRatio} onChange={e => setLockRatio(e.target.checked)} style={{ accentColor: '#4dca9f' }} />
                Lock ratio
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {[{w:600,h:340,l:'600×340'},{w:800,h:450,l:'800×450'},{w:1080,h:608,l:'1080×608'},{w:1200,h:675,l:'1200×675'}].map(({w,h,l})=>(
                <button key={l} type="button" onClick={()=>{setResizeWidth(w);setResizeHeight(h);setLockRatio(false)}} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #2a3a44', background: resizeWidth===w&&resizeHeight===h?'#4dca9f22':'transparent', color:'#8fa19c', cursor:'pointer', fontSize:11, fontWeight:600 }}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={submitting}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={17} className="spin" /> : <>{editItem ? 'Update category' : 'Create category'}</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Notification Modal ─────────────────────────────────────────────────

function NotificationModal({ close, onToast }: { close: () => void; onToast: (m: string) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [icon, setIcon] = useState('bell');
  const [url, setUrl] = useState('');
  const [target, setTarget] = useState<'all' | 'writers'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [writers, setWriters] = useState<any[]>([]);
  const [selectedWriter, setSelectedWriter] = useState('');

  useEffect(() => { if (target === 'writers') api('/api/admin/writers').then(d => setWriters(d as any[])).catch(() => {}); }, [target]);

  const notifIcons = [
    { name: 'bell', Icon: Bell, label: 'Bell' },
    { name: 'book-open', Icon: BookOpen, label: 'Book' },
    { name: 'heart', Icon: Heart, label: 'Heart' },
    { name: 'star', Icon: Star, label: 'Star' },
    { name: 'zap', Icon: Zap, label: 'Zap' },
    { name: 'gift', Icon: Gift, label: 'Gift' },
    { name: 'message-circle', Icon: MessageSquare, label: 'Chat' },
    { name: 'megaphone', Icon: Megaphone, label: 'Alert' },
    { name: 'sparkles', Icon: Sparkles, label: 'New' },
    { name: 'alert-circle', Icon: AlertTriangle, label: 'Warning' },
    { name: 'check-circle', Icon: Check, label: 'Done' },
    { name: 'info', Icon: Info, label: 'Info' },
    { name: 'trending-up', Icon: TrendingUp, label: 'Trending' },
    { name: 'award', Icon: Award, label: 'Award' },
    { name: 'download', Icon: Download, label: 'Download' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      onToast('Title and body are required');
      return;
    }
    setSubmitting(true);
    try {
      if (target === 'writers') {
        await api('/api/admin/writer-notifications/send', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), body: body.trim(), type: 'info', writer_id: selectedWriter || undefined, url: url.trim() }),
        });
      } else {
        await api('/api/admin/notifications', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), body: body.trim(), icon, url: url.trim() }),
        });
      }
      onToast('Notification sent');
      close();
    } catch {
      onToast('Failed to send notification');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <form className="modal" onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <p className="kicker">NEW NOTIFICATION</p>
            <h2>Send a notification</h2>
          </div>
          <button type="button" onClick={close}><X /></button>
        </div>
        <label>
          Title
          <input
            required
            placeholder="e.g. New chapter available!"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            rows={4}
            placeholder="Write your notification message..."
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </label>
        <label>
          Link (optional)
          <input
            placeholder="https://example.com or book ID"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <small style={{ color: '#6b7c85', fontSize: 11, marginTop: 4, display: 'block' }}>Add a URL — users will open it when they tap the notification</small>
        </label>
        <label>
          Send to
          <select value={target} onChange={e => { setTarget(e.target.value as any); setSelectedWriter(''); }}>
            <option value="all">All users</option>
            <option value="writers">Writers only</option>
          </select>
        </label>
        {target === 'writers' && (
          <label>
            Specific writer (optional)
            <select value={selectedWriter} onChange={e => setSelectedWriter(e.target.value)}>
              <option value="">All writers</option>
              {writers.map((w: any) => <option key={w.id} value={w.id}>{w.writer_name} (@{w.username})</option>)}
            </select>
          </label>
        )}
        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>Notification Icon</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
          {notifIcons.map(({ name, Icon, label }) => (
            <button key={name} type="button" onClick={() => setIcon(name)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 10, border: `2px solid ${icon === name ? '#4dca9f' : '#2a3a44'}`, background: icon === name ? 'rgba(77,202,159,0.15)' : 'transparent', color: icon === name ? '#4dca9f' : '#8fa19c', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={submitting}>Cancel</button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={17} className="spin" /> : <>Send notification</>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────

function Metric({ icon: Icon, label, value, delta, warn }: { icon: React.ElementType; label: string; value: string; delta: string; warn?: boolean }) {
  return (
    <div className="metric">
      <div className="metric-icon"><Icon size={20} /></div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small className={warn ? 'warn' : ''}>{delta}</small>
    </div>
  );
}

function PanelHead({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <div><h3>{title}</h3><p>{sub}</p></div>
      {action && <button>{action} →</button>}
    </div>
  );
}

function ChartArea({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(...data.map(d => d.views), 1);
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * 700,
    y: 210 - (d.views / max) * 190,
    label: new Date(d.date).toLocaleDateString('en', { weekday: 'short' }),
    views: d.views,
  }));

  if (data.length === 0) {
    const fallback = [0, 0, 0, 0, 0, 0, 0];
    return (
      <div className="chart-area">
        <div className="chart-y">
          <span>{max.toLocaleString()}</span>
          <span>{Math.round(max * 0.66).toLocaleString()}</span>
          <span>{Math.round(max * 0.33).toLocaleString()}</span>
          <span>0</span>
        </div>
        <svg viewBox="0 0 700 230" preserveAspectRatio="none">
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#48D7B0" stopOpacity=".28" />
              <stop offset="1" stopColor="#48D7B0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="fill" d="M0 210 H700 V230 H0Z" />
          <path className="line" d="M0 210 H700" />
        </svg>
        <div className="days">
          {['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'].map(d => <span key={d}>{d}</span>)}
        </div>
      </div>
    );
  }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const fillD = pathD + ` L${points[points.length - 1].x} 210 L${points[0].x} 210 Z`;

  return (
    <div className="chart-area">
      <div className="chart-y">
        <span>{max.toLocaleString()}</span>
        <span>{Math.round(max * 0.66).toLocaleString()}</span>
        <span>{Math.round(max * 0.33).toLocaleString()}</span>
        <span>0</span>
      </div>
      <svg viewBox="0 0 700 230" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#48D7B0" stopOpacity=".28" />
            <stop offset="1" stopColor="#48D7B0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="fill" d={fillD} />
        <path className="line" d={pathD} />
      </svg>
      <div className="days">
        {points.map((p, i) => <span key={i}>{p.label}</span>)}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function stringToColor(str: string): string {
  if (!str) return '#18342d';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#123E39', '#6D3B46', '#292E3D', '#383655', '#2E4A3A', '#4A2E3D', '#3D2E4A', '#2E3D4A'];
  return colors[Math.abs(hash) % colors.length];
}

function statusColor(status: string): string {
  switch (status) {
    case 'approved': return '#18342d';
    case 'pending': return '#382d1c';
    case 'hidden': return '#2d291c';
    case 'deleted': return '#3d1c1c';
    case 'rejected': return '#3d1c1c';
    case 'published': return '#18342d';
    case 'draft': return '#382d1c';
    default: return '#18342d';
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// ─── Render ─────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(<App />);
