import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BarChart3, Bell, BookOpen, ChevronDown, CloudUpload,
  Eye, FileEdit, Image, LayoutDashboard, Menu, MessageSquare,
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

type Page = 'Dashboard' | 'Books' | 'Chapters' | 'Categories' | 'Comments' | 'Writers' | 'Notifications' | 'Analytics' | 'Settings';

const API_BASE = 'https://lekhoni-admin-api.smdkawsar2.workers.dev';

const nav: [Page, React.ElementType][] = [
  ['Dashboard', LayoutDashboard],
  ['Books', BookOpen],
  ['Chapters', FileEdit],
  ['Categories', Menu],
  ['Comments', MessageSquare],
  ['Writers', Users],
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

  const d = data;

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
      <div className="dashboard-grid">
        <section className="panel chart">
          <PanelHead title="Reading activity" sub="Views over the last 7 days" action="View analytics" />
          <ChartArea data={d?.daily_views || []} />
        </section>
        <section className="panel live">
          <PanelHead title="Live now" sub="Updates in real time" />
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
                <span style={{ display: 'flex', gap: 4 }}>
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
  const [writers, setWriters] = useState<Writer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [actionNote, setActionNote] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/writers')
      .then((d: any) => {
        const list = Array.isArray(d) ? d : d.writers || d.data || [];
        setWriters(list);
        onRefreshPending?.(list.filter((w: Writer) => w.status === 'pending').length);
      })
      .catch(() => onToast('Failed to load writers'))
      .finally(() => setLoading(false));
  }, [onToast, onRefreshPending]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (writer: any, status: 'published' | 'rejected') => {
    const note = actionNote[writer.id] || '';
    try {
      await api(`/api/admin/writers/${writer.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, note }),
      });
      setWriters(prev => prev.map(w => w.id === writer.id ? { ...w, status, note } : w));
      onToast(status === 'published' ? 'Story published to app' : 'Story rejected');
      api('/api/admin/analytics').then((d: any) => onRefreshPending?.(d.pending_writers || 0)).catch(() => {});
    } catch {
      onToast('Failed to update story');
    }
  };

  const filtered = writers.filter(w => {
    if (filter !== 'all' && w.status !== filter) return false;
    return true;
  });

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Manage writers</h2>
          <p>Review writer story submissions. Approved stories are published to the app.</p>
        </div>
      </div>
      <div className="panel resource">
        <div className="resource-toolbar">
          <label className="search">
            <Search size={17} />
            <input placeholder="Search writer stories..." />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'pending', 'published', 'rejected'].map(f => (
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
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading writer stories...</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Users size={35} />
            <h3>No writer stories found</h3>
            <p>Writer story submissions will appear here.</p>
          </div>
        ) : (
          <div className="table">
            {filtered.map(w => (
              <div className="tr" key={w.id} style={{ gridTemplateColumns: '44px 1fr 100px 140px 60px' }}>
                <span className="book-cell">
                  {w.cover_url ? <img src={w.cover_url} alt="" style={{ width: 36, height: 46, borderRadius: 4, objectFit: 'cover' }} />
                    : <div className="mini-cover" style={{ background: statusColor(w.status), width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}><BookOpen size={14} /></div>}
                </span>
                <span className="book-cell">
                  <em>
                    <b>{w.title}</b>
                    <small>{w.writer_name} • {w.category || 'No category'} • {w.chapter_count || 0} chapters</small>
                  </em>
                </span>
                <span><u className={w.status === 'pending' ? 'draft' : ''}>{w.status}</u></span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {w.status === 'pending' ? (
                    <>
                      <input
                        placeholder="Note..."
                        value={actionNote[w.id] || ''}
                        onChange={e => setActionNote(prev => ({ ...prev, [w.id]: e.target.value }))}
                        style={{
                          width: 80, padding: '4px 6px', fontSize: 9, background: '#0e1614',
                          border: '1px solid #2d3e39', borderRadius: 4, color: '#e9f1ee', outline: 'none',
                        }}
                      />
                      <button
                        style={{ background: 'none', border: 'none', color: '#4dca9f', cursor: 'pointer', padding: 2 }}
                        onClick={() => updateStatus(w, 'published')}
                        title="Approve / Publish"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }}
                        onClick={() => updateStatus(w, 'rejected')}
                        title="Reject"
                      >
                        <Ban size={14} />
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 9, color: '#6f827d' }}>{w.review_note || 'No note'}</span>
                  )}
                </span>
                <span><small style={{ color: '#5f716c', fontSize: 9 }}>{timeAgo(w.created_at)}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>
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

function PanelHead({ title, sub, action }: { title: string; sub: string; action?: string }) {
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
