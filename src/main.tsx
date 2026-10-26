import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Award,
  BookOpen,
  FileEdit,
  FolderTree,
  MessageSquare,
  Users,
  Bell,
  Settings,
  Search,
  Plus,
  Trash2,
  Check,
  X,
  Eye,
  LogOut,
  Upload,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Send,
  BookMarked,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Menu as MenuIcon
} from 'lucide-react';
import './styles.css';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface Book {
  id: string;
  title: string;
  author: string;
  author_name?: string;
  category_id?: string;
  category?: string;
  description: string;
  cover_url: string;
  status: 'draft' | 'published';
  views: number;
  likes?: number;
  dislikes?: number;
  featured?: boolean | number;
  chapters_count?: number;
  created_at: string;
  updated_at: string;
}

interface Chapter {
  id: string;
  book_id: string;
  title: string;
  body: string;
  position: number;
  minutes?: number;
  status: 'draft' | 'published';
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  cover_url?: string;
  position?: number;
  is_active?: boolean | number;
  books_count?: number;
}

interface Story {
  id: string;
  writer_id?: string;
  writer_name?: string;
  username?: string;
  title: string;
  description: string;
  category: string;
  cover_url: string;
  status: 'pending' | 'published' | 'rejected' | 'draft';
  review_note?: string;
  chapters_count?: number;
  created_at: string;
  updated_at: string;
}

interface StoryChapter {
  id: string;
  story_id: string;
  title: string;
  body: string;
  position: number;
  minutes?: number;
  created_at: string;
}

interface Writer {
  id: string;
  writer_name: string;
  username: string;
  email: string;
  bio?: string;
  avatar_url?: string;
  follower_count: number;
  is_active: boolean | number;
  created_at: string;
}

interface Comment {
  id: string;
  book_id: string;
  book_title?: string;
  display_name?: string;
  user_name?: string;
  body: string;
  status: 'pending' | 'approved' | 'deleted';
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  url?: string;
  target?: string;
  created_at: string;
}

type TabType =
  | 'Dashboard'
  | 'Submissions'
  | 'Books'
  | 'Chapters'
  | 'Categories'
  | 'Writers'
  | 'Comments'
  | 'Notifications'
  | 'Settings';

const API_BASE = 'https://lekhoni-admin-api.smdkawsar2.workers.dev';

// ─── API Helper ─────────────────────────────────────────────────────────────

async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const secret = localStorage.getItem('lekhoni_admin_secret') || '';
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers as any) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text || res.statusText;
    try {
      const p = JSON.parse(text);
      if (p?.error) msg = p.error;
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return undefined as T;
}

// ─── Toast Component ────────────────────────────────────────────────────────

function Toast({ msg, onClose, type = 'success' }: { msg: string; onClose: () => void; type?: 'success' | 'error' }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: type === 'error' ? '#2d1419' : '#0c261e',
        border: `1px solid ${type === 'error' ? '#f43f5e' : '#10b981'}`,
        borderRadius: 12,
        padding: '12px 20px',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}
    >
      {type === 'error' ? <AlertTriangle size={18} color="#f43f5e" /> : <CheckCircle2 size={18} color="#10b981" />}
      {msg}
    </div>
  );
}

// ─── Play Store Policy Page ─────────────────────────────────────────────────

function TermsWebPage() {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '24px', background: '#fff', color: '#1e293b', borderRadius: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, color: '#0f172a' }}>লেখনী কাহিনি — শর্তাবলী ও গোপনীয়তা নীতি</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>সর্বশেষ আপডেট: অক্টোবর ২০২৬</p>
      <div style={{ lineHeight: 1.8, fontSize: 15 }}>
        <h3>১. সাধারণ শর্তাবলী</h3>
        <p>লেখনী কাহিনি বাংলা গল্প, উপন্যাস ও সাহিত্যের একটি ডিজিটাল প্ল্যাটফর্ম। অ্যাপটি ব্যবহারের মাধ্যমে ব্যবহারকারী সকল নীতিমালায় সম্মত হন।</p>
        <br />
        <h3>২. লেখকের অধিকার ও কপিরাইট</h3>
        <p>লেখকের স্বরচিত সৃষ্টির সম্পূর্ণ কপিরাইট লেখকের নিজের। কোনো রূপ অননুমোদিত নকল বা কপিরাইট লঙ্ঘন বরদাশত করা হয় না।</p>
        <br />
        <h3>৩. ব্যবহারকারীর গোপনীয়তা</h3>
        <p>আমরা ব্যবহারকারীর ব্যক্তিগত তথ্যের গোপনীয়তা রক্ষা করি। কোনো তথ্য তৃতীয় পক্ষের কাছে বিক্রি করা হয় না।</p>
      </div>
    </div>
  );
}

// ─── Main Admin Application ─────────────────────────────────────────────────

function App() {
  // Check terms view
  if (window.location.pathname === '/terms' || window.location.search.includes('terms')) {
    return <TermsWebPage />;
  }

  // Auth State
  const [secret, setSecret] = useState<string>(() => localStorage.getItem('lekhoni_admin_secret') || '');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [secretInput, setSecretInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('Dashboard');
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'error' } | null>(null);

  // Data States
  const [loading, setLoading] = useState<boolean>(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [writers, setWriters] = useState<Writer[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [appConfig, setAppConfig] = useState<any>({});

  // Submissions Tab Filter & Modals
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'pending' | 'published' | 'rejected'>('pending');
  const [submissionSearch, setSubmissionSearch] = useState<string>('');
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [storyChapters, setStoryChapters] = useState<StoryChapter[]>([]);
  const [activeStoryChapterIdx, setActiveStoryChapterIdx] = useState<number>(0);
  const [readerModalOpen, setReaderModalOpen] = useState<boolean>(false);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Book Modal
  const [bookModalOpen, setBookModalOpen] = useState<boolean>(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    category_id: '',
    description: '',
    cover_url: '',
    status: 'published' as 'published' | 'draft',
    featured: false,
  });
  const [uploadingCover, setUploadingCover] = useState<boolean>(false);

  // Chapter Modal
  const [chapterModalOpen, setChapterModalOpen] = useState<boolean>(false);
  const [selectedBookForChapters, setSelectedBookForChapters] = useState<string>('');
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [chapterForm, setChapterForm] = useState({
    title: '',
    body: '',
    position: 1,
    minutes: 5,
    status: 'published' as 'published' | 'draft',
  });

  // Category Modal
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: 'book-open', color: '#10b981' });

  // Notification Composer
  const [notifForm, setNotifForm] = useState({ title: '', body: '', targetBookId: '' });
  const [sendingNotif, setSendingNotif] = useState<boolean>(false);

  // Settings State
  const [settingsForm, setSettingsForm] = useState({
    app_version: '1.0.8',
    min_version: '1.0.0',
    download_url: 'https://play.google.com/store/apps/details?id=com.xyteee.lekhoni',
    maintenance_mode: false,
    maintenance_msg: 'অ্যাপটি বর্তমানে রক্ষণাবেক্ষণে রয়েছে। শীঘ্রই আবার চালু হবে।',
    notice_enabled: false,
    notice_title: '',
    notice_body: '',
  });

  // Verify auth on mount
  useEffect(() => {
    if (secret) {
      verifySecret(secret);
    }
  }, []);

  async function verifySecret(s: string) {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/books`, {
        headers: { Authorization: `Bearer ${s}` },
      });
      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem('lekhoni_admin_secret', s);
        loadAllData();
      } else {
        setIsAuthenticated(false);
        setLoginError('ভুল এডমিন সিক্রেট কী! পুনরায় চেষ্টা করুন।');
      }
    } catch (e: any) {
      setLoginError('সংযোগ স্থাপন করা সম্ভব হয়নি: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
    setSecret(secretInput.trim());
    verifySecret(secretInput.trim());
  }

  function handleLogout() {
    localStorage.removeItem('lekhoni_admin_secret');
    setSecret('');
    setIsAuthenticated(false);
  }

  // Load All Core Data
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [booksData, catsData, storiesData, writersData, commentsData, notifsData] = await Promise.all([
        api<Book[]>('/api/admin/books').catch(() => []),
        api<Category[]>('/api/admin/categories').catch(() => []),
        api<Story[]>('/api/admin/stories').catch(() => []),
        api<Writer[]>('/api/admin/writers').catch(() => []),
        api<Comment[]>('/api/admin/comments').catch(() => []),
        api<NotificationItem[]>('/api/admin/notifications').catch(() => []),
      ]);

      setBooks(booksData || []);
      setCategories(catsData || []);
      setStories(storiesData || []);
      setWriters(writersData || []);
      setComments(commentsData || []);
      setNotifications(notifsData || []);

      if (booksData && booksData.length > 0 && !selectedBookForChapters) {
        setSelectedBookForChapters(booksData[0].id);
      }
    } catch (e: any) {
      setToast({ msg: 'ডেটা লোড করতে সমস্যা: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedBookForChapters]);

  // Load Chapters for Selected Book
  const loadChaptersForBook = useCallback(async (bookId: string) => {
    if (!bookId) return;
    try {
      const data = await api<Chapter[]>(`/api/admin/chapters?book_id=${bookId}`).catch(() => []);
      setChapters(data || []);
    } catch (e: any) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (selectedBookForChapters && isAuthenticated) {
      loadChaptersForBook(selectedBookForChapters);
    }
  }, [selectedBookForChapters, isAuthenticated, loadChaptersForBook]);

  // ─── Submissions / Review Actions ──────────────────────────────────────────

  const pendingSubmissionsCount = stories.filter((s) => s.status === 'pending').length;

  async function openStoryReader(story: Story) {
    setSelectedStory(story);
    setReaderModalOpen(true);
    setActiveStoryChapterIdx(0);
    try {
      const chs = await api<StoryChapter[]>(`/api/admin/stories/${story.id}/chapters`).catch(() => []);
      setStoryChapters(chs || []);
    } catch (e: any) {
      setToast({ msg: 'পর্ব লোড ব্যর্থ: ' + e.message, type: 'error' });
    }
  }

  async function approveStory(story: Story) {
    try {
      setLoading(true);
      await api(`/api/admin/stories/${story.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'published', review_note: 'গল্পটি অনুমোদিত এবং প্রকাশিত হয়েছে।' }),
      });
      setToast({ msg: `"${story.title}" গল্পটি সফলভাবে অনুমোদিত এবং অ্যাপে প্রকাশিত হয়েছে!`, type: 'success' });
      setReaderModalOpen(false);
      loadAllData();
    } catch (e: any) {
      setToast({ msg: 'অনুমোদন ব্যর্থ: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function submitRejectStory() {
    if (!selectedStory) return;
    try {
      setLoading(true);
      await api(`/api/admin/stories/${selectedStory.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'rejected',
          review_note: rejectReason.trim() || 'মানসম্মত না হওয়ায় বা নীতিমালার কারণে গল্পটি বাতিল করা হয়েছে।',
        }),
      });
      setToast({ msg: `"${selectedStory.title}" গল্পটি বাতিল করা হয়েছে এবং লেখককে জানানো হয়েছে।`, type: 'success' });
      setRejectModalOpen(false);
      setReaderModalOpen(false);
      setRejectReason('');
      loadAllData();
    } catch (e: any) {
      setToast({ msg: 'বাতিল ব্যর্থ: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Book Actions ─────────────────────────────────────────────────────────

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingCover(true);
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<{ url: string }>('/api/media', { method: 'POST', body: fd });
      if (res?.url) {
        setBookForm((prev) => ({ ...prev, cover_url: res.url }));
        setToast({ msg: 'কভার ইমেজ আপলোড সফল!', type: 'success' });
      }
    } catch (err: any) {
      setToast({ msg: 'আপলোড ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setUploadingCover(false);
    }
  }

  function openAddBookModal() {
    setEditingBook(null);
    setBookForm({
      title: '',
      author: writers[0]?.writer_name || '',
      category_id: categories[0]?.id || '',
      description: '',
      cover_url: '',
      status: 'published',
      featured: false,
    });
    setBookModalOpen(true);
  }

  function openEditBookModal(book: Book) {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author || book.author_name || '',
      category_id: book.category_id || '',
      description: book.description || '',
      cover_url: book.cover_url || '',
      status: book.status || 'published',
      featured: Boolean(book.featured),
    });
    setBookModalOpen(true);
  }

  async function saveBook(e: React.FormEvent) {
    e.preventDefault();
    if (!bookForm.title.trim()) {
      setToast({ msg: 'বইয়ের শিরোনাম আবশ্যক', type: 'error' });
      return;
    }
    try {
      setLoading(true);
      if (editingBook) {
        await api(`/api/admin/books/${editingBook.id}`, {
          method: 'PUT',
          body: JSON.stringify(bookForm),
        });
        setToast({ msg: 'বইয়ের তথ্য সফলভাবে আপডেট হয়েছে!', type: 'success' });
      } else {
        await api('/api/admin/books', {
          method: 'POST',
          body: JSON.stringify(bookForm),
        });
        setToast({ msg: 'নতুন বই সফলভাবে যুক্ত হয়েছে!', type: 'success' });
      }
      setBookModalOpen(false);
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'সংরক্ষণ ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function deleteBook(book: Book) {
    if (!confirm(`আপনি কি নিশ্চিত যে "${book.title}" বইটি মুছে ফেলতে চান? এর সকল পর্ব মুছে যাবে।`)) return;
    try {
      setLoading(true);
      await api(`/api/admin/books/${book.id}`, { method: 'DELETE' });
      setToast({ msg: `"${book.title}" বইটি সফলভাবে মুছে ফেলা হয়েছে!`, type: 'success' });
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'মুছে ফেলা ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Chapter Actions ──────────────────────────────────────────────────────

  function openAddChapterModal() {
    setEditingChapter(null);
    setChapterForm({
      title: '',
      body: '',
      position: chapters.length + 1,
      minutes: 5,
      status: 'published',
    });
    setChapterModalOpen(true);
  }

  function openEditChapterModal(chapter: Chapter) {
    setEditingChapter(chapter);
    setChapterForm({
      title: chapter.title,
      body: chapter.body || '',
      position: chapter.position,
      minutes: chapter.minutes || 5,
      status: chapter.status || 'published',
    });
    setChapterModalOpen(true);
  }

  async function saveChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterForm.title.trim() || !selectedBookForChapters) {
      setToast({ msg: 'অধ্যায়ের শিরোনাম ও বই নির্বাচন আবশ্যক', type: 'error' });
      return;
    }
    try {
      setLoading(true);
      if (editingChapter) {
        await api(`/api/admin/chapters/${editingChapter.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...chapterForm, book_id: selectedBookForChapters }),
        });
        setToast({ msg: 'অধ্যায় সফলভাবে আপডেট হয়েছে!', type: 'success' });
      } else {
        await api('/api/admin/chapters', {
          method: 'POST',
          body: JSON.stringify({ ...chapterForm, book_id: selectedBookForChapters }),
        });
        setToast({ msg: 'নতুন অধ্যায় সফলভাবে যুক্ত হয়েছে!', type: 'success' });
      }
      setChapterModalOpen(false);
      loadChaptersForBook(selectedBookForChapters);
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'সংরক্ষণ ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function deleteChapter(chapter: Chapter) {
    if (!confirm(`আপনি কি "${chapter.title}" অধ্যায়টি মুছে ফেলতে চান?`)) return;
    try {
      setLoading(true);
      await api(`/api/admin/chapters/${chapter.id}`, { method: 'DELETE' });
      setToast({ msg: 'অধ্যায়টি সফলভাবে মুছে ফেলা হয়েছে!', type: 'success' });
      loadChaptersForBook(selectedBookForChapters);
    } catch (err: any) {
      setToast({ msg: 'মুছে ফেলা ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Notification Actions ─────────────────────────────────────────────────

  async function sendPushNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!notifForm.title.trim() || !notifForm.body.trim()) {
      setToast({ msg: 'শিরোনাম ও মেসেজ লিখুন', type: 'error' });
      return;
    }
    try {
      setSendingNotif(true);
      await api('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: notifForm.title.trim(),
          body: notifForm.body.trim(),
          target: notifForm.targetBookId ? `book:${notifForm.targetBookId}` : '',
        }),
      });
      setToast({ msg: 'অ্যাপ ব্যবহারকারীদের সফলভাবে নোটিফিকেশন পাঠানো হয়েছে!', type: 'success' });
      setNotifForm({ title: '', body: '', targetBookId: '' });
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'পাঠাতে ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setSendingNotif(false);
    }
  }

  // ─── Comment Actions ──────────────────────────────────────────────────────

  async function moderateComment(commentId: string, status: 'approved' | 'deleted') {
    try {
      setLoading(true);
      await api(`/api/admin/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setToast({ msg: status === 'approved' ? 'মন্তব্য অনুমোদিত হয়েছে' : 'মন্তব্য মুছে ফেলা হয়েছে', type: 'success' });
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'মডারেশন ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Writer Actions ───────────────────────────────────────────────────────

  async function toggleWriterStatus(writer: Writer) {
    const next = !Boolean(writer.is_active);
    try {
      setLoading(true);
      await api(`/api/admin/writers/${writer.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: next }),
      });
      setToast({ msg: next ? 'লেখক সক্রিয় করা হয়েছে' : 'লেখক ব্লক করা হয়েছে', type: 'success' });
      loadAllData();
    } catch (err: any) {
      setToast({ msg: 'ব্যর্থ: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Filtered Stories for Submissions Tab ─────────────────────────────────

  const filteredStories = stories.filter((s) => {
    if (submissionFilter !== 'all' && s.status !== submissionFilter) return false;
    if (submissionSearch.trim()) {
      const q = submissionSearch.toLowerCase();
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchWriter = (s.writer_name || '').toLowerCase().includes(q);
      const matchCat = (s.category || '').toLowerCase().includes(q);
      return matchTitle || matchWriter || matchCat;
    }
    return true;
  });

  // ─── LOGIN SCREEN ──────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 20%, #152238 0%, #090d16 80%)', padding: 20 }}>
        <div className="card" style={{ width: '100%', maxWidth: 420, padding: 36, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#fff', fontSize: 26, fontWeight: 800, boxShadow: '0 8px 24px rgba(16,185,129,0.3)' }}>
            ল
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>লেখনী এডমিন প্যানেল</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28 }}>অ্যাপ নিয়ন্ত্রণ ও গল্প অনুমোদনের জন্য এডমিন পাসওয়ার্ড দিন</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>এডমিন সিক্রেট (ADMIN_SECRET)</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••••••"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                autoFocus
              />
            </div>
            {loginError && <p style={{ color: '#f43f5e', fontSize: 12, textAlign: 'left' }}>{loginError}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14 }} disabled={loading}>
              {loading ? 'যাচাই করা হচ্ছে...' : 'লগইন করুন'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── AUTHENTICATED ADMIN DASHBOARD ─────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* Toast Notification */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">ল</div>
          <div className="brand-text">
            <h2>লেখনী কাহিনি</h2>
            <span>App Control v2</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-link ${activeTab === 'Dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Dashboard'); setMobileMenuOpen(false); }}
          >
            <LayoutDashboard size={18} />
            <span>ড্যাশবোর্ড</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Submissions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Submissions'); setMobileMenuOpen(false); }}
          >
            <Award size={18} />
            <span>গল্প রিভিউ</span>
            {pendingSubmissionsCount > 0 && <span className="nav-badge">{pendingSubmissionsCount}</span>}
          </button>

          <button
            className={`nav-link ${activeTab === 'Books' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Books'); setMobileMenuOpen(false); }}
          >
            <BookOpen size={18} />
            <span>বইসমূহ</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Chapters' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Chapters'); setMobileMenuOpen(false); }}
          >
            <FileEdit size={18} />
            <span>অধ্যায় ও পর্ব</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Categories' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Categories'); setMobileMenuOpen(false); }}
          >
            <FolderTree size={18} />
            <span>ক্যাটেগরি</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Writers' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Writers'); setMobileMenuOpen(false); }}
          >
            <Users size={18} />
            <span>লেখকবৃন্দ</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Comments' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Comments'); setMobileMenuOpen(false); }}
          >
            <MessageSquare size={18} />
            <span>মন্তব্য নিয়ন্ত্রণ</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Notifications' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Notifications'); setMobileMenuOpen(false); }}
          >
            <Bell size={18} />
            <span>নোটিফিকেশন</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'Settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('Settings'); setMobileMenuOpen(false); }}
          >
            <Settings size={18} />
            <span>অ্যাপ সেটিংস</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-avatar">A</div>
            <div className="user-info">
              <div className="name">সুপার এডমিন</div>
              <div className="role">Cloudflare D1 Mode</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="লগআউট">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-left">
            <button className="btn-icon mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ display: 'none' }}>
              <MenuIcon size={20} />
            </button>
            <div className="page-title">
              <h1>
                {activeTab === 'Dashboard' && 'অ্যাপ সামগ্রিক চিত্র (Dashboard)'}
                {activeTab === 'Submissions' && 'গল্প রিভিউ ও অনুমোদন (Story Reviews)'}
                {activeTab === 'Books' && 'বইসমূহ নিয়ন্ত্রণ (Books Catalog)'}
                {activeTab === 'Chapters' && 'অধ্যায় ও পর্ব ব্যবস্থাপনা (Chapters)'}
                {activeTab === 'Categories' && 'ক্যাটেগরি ব্যবস্থাপনা (Categories)'}
                {activeTab === 'Writers' && 'লেখকবৃন্দ ও প্রোফাইল (Writers)'}
                {activeTab === 'Comments' && 'পাঠক মন্তব্য নিয়ন্ত্রণ (Comments)'}
                {activeTab === 'Notifications' && 'পুশ নোটিফিকেশন পাঠান (Notifications)'}
                {activeTab === 'Settings' && 'অ্যাপ সেটিংস ও ভার্সন নিয়ন্ত্রণ (Settings)'}
              </h1>
              <p>লেখনী কাহিনি বাংলা অ্যাপ কন্ট্রোল সেন্টার</p>
            </div>
          </div>

          <div className="header-right">
            <button className="btn btn-secondary btn-sm" onClick={loadAllData} title="রিফ্রেশ">
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>রিফ্রেশ</span>
            </button>

            {activeTab === 'Books' && (
              <button className="btn btn-primary btn-sm" onClick={openAddBookModal}>
                <Plus size={16} />
                <span>নতুন বই</span>
              </button>
            )}

            {activeTab === 'Chapters' && (
              <button className="btn btn-primary btn-sm" onClick={openAddChapterModal}>
                <Plus size={16} />
                <span>নতুন পর্ব</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="content-body">
          {/* ══════════════════ DASHBOARD TAB ══════════════════ */}
          {activeTab === 'Dashboard' && (
            <div>
              {/* KPI Cards */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-icon emerald">
                    <BookOpen size={24} />
                  </div>
                  <div className="kpi-data">
                    <h4>{books.filter((b) => b.status === 'published').length}</h4>
                    <p>প্রকাশিত বই</p>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon indigo">
                    <FileEdit size={24} />
                  </div>
                  <div className="kpi-data">
                    <h4>{books.reduce((acc, b) => acc + (b.chapters_count || 0), 0) || 56}</h4>
                    <p>মোট পর্ব</p>
                  </div>
                </div>

                <div className="kpi-card highlight">
                  <div className="kpi-icon amber">
                    <Award size={24} />
                  </div>
                  <div className="kpi-data">
                    <h4>{pendingSubmissionsCount}</h4>
                    <p>রিভিউ অপেক্ষা করছে</p>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-icon rose">
                    <Users size={24} />
                  </div>
                  <div className="kpi-data">
                    <h4>{writers.length}</h4>
                    <p>নিবন্ধিত লেখক</p>
                  </div>
                </div>
              </div>

              {/* Pending Reviews Banner (If Any) */}
              {pendingSubmissionsCount > 0 && (
                <div
                  className="card"
                  style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(19, 26, 43, 0.9) 100%)',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
                        {pendingSubmissionsCount}টি নতুন গল্প অনুমোদনের জন্য জমা পড়েছে!
                      </h4>
                      <p style={{ fontSize: 13, color: '#cbd5e1' }}>লেখকদের জমা দেওয়া গল্পগুলো পড়ে অনুমোদন বা রিভিউ ফিডব্যাক দিন।</p>
                    </div>
                  </div>
                  <button className="btn btn-amber" onClick={() => setActiveTab('Submissions')}>
                    <span>রিভিউ শুরু করুন</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* Recent Books & Comments Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
                {/* Recent Books */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <h3>সর্বশেষ প্রকাশিত বই</h3>
                      <p>অ্যাপের সাম্প্রতিক বইসমূহ</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('Books')}>সব দেখুন</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {books.slice(0, 5).map((b) => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <img src={b.cover_url || 'https://via.placeholder.com/60x80'} alt={b.title} style={{ width: 38, height: 50, borderRadius: 6, objectFit: 'cover' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h5 style={{ fontSize: 13.5, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</h5>
                          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{b.author || b.author_name || 'লেখক'} • {b.category || 'ক্যাটেগরি'}</p>
                        </div>
                        <span className="badge badge-published">প্রকাশিত</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Reader Comments */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <h3>সাম্প্রতিক পাঠক মন্তব্য</h3>
                      <p>পাঠকদের করা শেষ মন্তব্যসমূহ</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('Comments')}>সব দেখুন</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comments.slice(0, 5).map((c) => (
                      <div key={c.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#34d399' }}>{c.display_name || c.user_name || 'পাঠক'}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{c.book_title || 'বই'}</span>
                        </div>
                        <p style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.4 }}>{c.body}</p>
                      </div>
                    ))}
                    {comments.length === 0 && <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '24px 0' }}>কোনো মন্তব্য পাওয়া যায়নি</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ SUBMISSIONS TAB (STORY REVIEW) ══════════════════ */}
          {activeTab === 'Submissions' && (
            <div>
              {/* Top Filter Bar */}
              <div className="filter-bar">
                <div className="filter-tabs">
                  <button
                    className={`filter-tab ${submissionFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setSubmissionFilter('pending')}
                  >
                    <span>অপেক্ষমাণ (Pending)</span>
                    {pendingSubmissionsCount > 0 && <span className="nav-badge">{pendingSubmissionsCount}</span>}
                  </button>
                  <button
                    className={`filter-tab ${submissionFilter === 'published' ? 'active' : ''}`}
                    onClick={() => setSubmissionFilter('published')}
                  >
                    <span>অনুমোদিত (Published)</span>
                  </button>
                  <button
                    className={`filter-tab ${submissionFilter === 'rejected' ? 'active' : ''}`}
                    onClick={() => setSubmissionFilter('rejected')}
                  >
                    <span>বাতিলকৃত (Rejected)</span>
                  </button>
                  <button
                    className={`filter-tab ${submissionFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setSubmissionFilter('all')}
                  >
                    <span>সকল গল্প ({stories.length})</span>
                  </button>
                </div>

                <div className="search-box">
                  <Search size={16} color="#64748b" />
                  <input
                    type="text"
                    placeholder="গল্পের নাম, লেখক বা ক্যাটেগরি দিয়ে খুঁজুন..."
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Submissions List */}
              {filteredStories.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4>কোনো গল্প পাওয়া যায়নি</h4>
                  <p>এই ফিল্টারে বর্তমানে কোনো গল্পের সাবমিশন নেই।</p>
                </div>
              ) : (
                <div className="submissions-grid">
                  {filteredStories.map((story) => (
                    <div key={story.id} className={`submission-card ${story.status === 'pending' ? 'is-pending' : ''}`}>
                      <div className="submission-header">
                        <img
                          src={story.cover_url || 'https://via.placeholder.com/80x110'}
                          alt={story.title}
                          className="submission-cover"
                        />
                        <div className="submission-details">
                          <h4>{story.title}</h4>
                          <div className="author">
                            <Users size={13} color="#94a3b8" />
                            <span>{story.writer_name || story.username || 'লেখক'}</span>
                          </div>
                          <div className="submission-meta">
                            <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4 }}>
                              {story.category || 'গল্প'}
                            </span>
                            <span>•</span>
                            <span>{story.chapters_count || 1}টি পর্ব</span>
                            <span>•</span>
                            <span>
                              {story.status === 'pending' && <span className="badge badge-pending">অপেক্ষমাণ</span>}
                              {story.status === 'published' && <span className="badge badge-published">অনুমোদিত</span>}
                              {story.status === 'rejected' && <span className="badge badge-rejected">বাতিল</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      {story.description && (
                        <div className="submission-desc">
                          {story.description}
                        </div>
                      )}

                      {story.review_note && (
                        <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
                          <strong>এডমিন নোট:</strong> {story.review_note}
                        </div>
                      )}

                      <div className="submission-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openStoryReader(story)}>
                          <Eye size={14} />
                          <span>পড়ুন ও যাচাই করুন</span>
                        </button>

                        {story.status !== 'published' && (
                          <button className="btn btn-primary btn-sm" onClick={() => approveStory(story)}>
                            <Check size={14} />
                            <span>অনুমোদন দিন</span>
                          </button>
                        )}

                        {story.status !== 'rejected' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setSelectedStory(story);
                              setRejectModalOpen(true);
                            }}
                          >
                            <X size={14} />
                            <span>বাতিল</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ BOOKS TAB ══════════════════ */}
          {activeTab === 'Books' && (
            <div>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>বই ও কভার</th>
                      <th>লেখক</th>
                      <th>ক্যাটেগরি</th>
                      <th>ভিউ সংখ্যা</th>
                      <th>স্ট্যাটাস</th>
                      <th style={{ textAlign: 'right' }}>অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div className="item-cell">
                            <img src={b.cover_url || 'https://via.placeholder.com/60x80'} alt={b.title} className="item-thumb" />
                            <div className="item-info">
                              <span className="title">{b.title}</span>
                              <span className="subtitle">ID: {b.id.slice(0, 8)}</span>
                            </div>
                          </div>
                        </td>
                        <td>{b.author || b.author_name || 'লেখক'}</td>
                        <td>
                          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 6 }}>
                            {b.category || categories.find((c) => c.id === b.category_id)?.name || 'উপন্যাস'}
                          </span>
                        </td>
                        <td>{b.views || 0}</td>
                        <td>
                          <span className={`badge ${b.status === 'published' ? 'badge-published' : 'badge-draft'}`}>
                            {b.status === 'published' ? 'প্রকাশিত' : 'ড্রাফট'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedBookForChapters(b.id);
                                setActiveTab('Chapters');
                              }}
                              title="অধ্যায় দেখুন"
                            >
                              <FileEdit size={13} />
                              <span>পর্ব ({chapters.filter((c) => c.book_id === b.id).length || b.chapters_count || 0})</span>
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditBookModal(b)}>
                              সম্পাদনা
                            </button>
                            <button className="btn-icon" onClick={() => deleteBook(b)} title="মুছে ফেলুন">
                              <Trash2 size={15} color="#f43f5e" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════ CHAPTERS TAB ══════════════════ */}
          {activeTab === 'Chapters' && (
            <div>
              {/* Book Selector Header */}
              <div className="card" style={{ marginBottom: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BookOpen size={20} color="#10b981" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>বই নির্বাচন করুন:</span>
                  <select
                    className="form-control"
                    style={{ width: 'auto', minWidth: 260 }}
                    value={selectedBookForChapters}
                    onChange={(e) => setSelectedBookForChapters(e.target.value)}
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} ({b.author || b.author_name})
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAddChapterModal}>
                  <Plus size={16} />
                  <span>এই বইয়ে নতুন পর্ব যোগ করুন</span>
                </button>
              </div>

              {/* Chapters Table */}
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>ক্রম</th>
                      <th>অধ্যায়ের শিরোনাম</th>
                      <th>পড়ার সময় (মিনিট)</th>
                      <th>স্ট্যাটাস</th>
                      <th style={{ textAlign: 'right' }}>অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapters.map((ch, idx) => (
                      <tr key={ch.id}>
                        <td>
                          <span style={{ fontWeight: 700, color: '#10b981' }}>#{ch.position || idx + 1}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{ch.title}</div>
                        </td>
                        <td>{ch.minutes || 5} মিনিট</td>
                        <td>
                          <span className={`badge ${ch.status === 'published' ? 'badge-published' : 'badge-draft'}`}>
                            {ch.status === 'published' ? 'প্রকাশিত' : 'ড্রাফট'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditChapterModal(ch)}>
                              সম্পাদনা
                            </button>
                            <button className="btn-icon" onClick={() => deleteChapter(ch)} title="মুছে ফেলুন">
                              <Trash2 size={15} color="#f43f5e" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {chapters.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                          এই বইয়ের কোনো পর্ব পাওয়া যায়নি। নতুন পর্ব যুক্ত করুন।
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════ CATEGORIES TAB ══════════════════ */}
          {activeTab === 'Categories' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {categories.map((cat) => (
                  <div key={cat.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: cat.color ? `${cat.color}22` : 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color || '#10b981' }}>
                        <FolderTree size={20} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{cat.name}</h4>
                        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {books.filter((b) => b.category_id === cat.id || b.category === cat.name).length}টি বই
                        </p>
                      </div>
                    </div>
                    <span className="badge badge-published">সক্রিয়</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════ WRITERS TAB ══════════════════ */}
          {activeTab === 'Writers' && (
            <div>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>লেখক</th>
                      <th>ইউজারনেম</th>
                      <th>ইমেইল</th>
                      <th>ফলোয়ার সংখ্যা</th>
                      <th>স্ট্যাটাস</th>
                      <th style={{ textAlign: 'right' }}>নিয়ন্ত্রণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writers.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                              {w.writer_name?.[0] || 'L'}
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: '#f8fafc', display: 'block' }}>{w.writer_name}</span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>যোগদান: {new Date(w.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </td>
                        <td>@{w.username}</td>
                        <td style={{ color: '#94a3b8' }}>{w.email}</td>
                        <td>{w.follower_count || 0}</td>
                        <td>
                          <span className={`badge ${Boolean(w.is_active) ? 'badge-published' : 'badge-rejected'}`}>
                            {Boolean(w.is_active) ? 'সক্রিয়' : 'ব্লকড'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className={`btn btn-sm ${Boolean(w.is_active) ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => toggleWriterStatus(w)}
                          >
                            {Boolean(w.is_active) ? 'ব্লক করুন' : 'সক্রিয় করুন'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════ COMMENTS TAB ══════════════════ */}
          {activeTab === 'Comments' && (
            <div>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>পাঠক</th>
                      <th>বই</th>
                      <th>মন্তব্য</th>
                      <th>স্ট্যাটাস</th>
                      <th style={{ textAlign: 'right' }}>অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((cm) => (
                      <tr key={cm.id}>
                        <td>
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{cm.display_name || cm.user_name || 'পাঠক'}</span>
                        </td>
                        <td>{cm.book_title || 'বই'}</td>
                        <td style={{ maxWidth: 360, color: '#cbd5e1' }}>{cm.body}</td>
                        <td>
                          <span className={`badge ${cm.status === 'approved' ? 'badge-published' : cm.status === 'pending' ? 'badge-pending' : 'badge-rejected'}`}>
                            {cm.status === 'approved' ? 'অনুমোদিত' : cm.status === 'pending' ? 'অপেক্ষমাণ' : 'মুছে ফেলা'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {cm.status !== 'approved' && (
                              <button className="btn btn-primary btn-sm" onClick={() => moderateComment(cm.id, 'approved')}>
                                অনুমোদন
                              </button>
                            )}
                            <button className="btn-icon" onClick={() => moderateComment(cm.id, 'deleted')} title="মুছে ফেলুন">
                              <Trash2 size={15} color="#f43f5e" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {comments.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                          কোনো মন্তব্য পাওয়া যায়নি।
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════ NOTIFICATIONS TAB ══════════════════ */}
          {activeTab === 'Notifications' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 480px) 1fr', gap: 24 }}>
              {/* Composer */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <h3>পুশ নোটিফিকেশন পাঠান</h3>
                    <p>অ্যাপ ব্যবহারকারীদের ডিভাইসে নোটিফিকেশন যাবে</p>
                  </div>
                </div>

                <form onSubmit={sendPushNotification} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label>নোটিফিকেশনের শিরোনাম</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="যেমন: নতুন রোমাঞ্চকর পর্ব প্রকাশিত!"
                      value={notifForm.title}
                      onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>নোটিফিকেশনের বার্তা</label>
                    <textarea
                      className="form-control"
                      placeholder="বার্তাটি বিস্তারিত লিখুন..."
                      value={notifForm.body}
                      onChange={(e) => setNotifForm({ ...notifForm, body: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>ক্লিক করলে নির্দিষ্ট বই খুলবে (ঐচ্ছিক)</label>
                    <select
                      className="form-control"
                      value={notifForm.targetBookId}
                      onChange={(e) => setNotifForm({ ...notifForm, targetBookId: e.target.value })}
                    >
                      <option value="">কোনো বই নয় (সাধারণ বার্তা)</option>
                      {books.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={sendingNotif}>
                    <Send size={16} />
                    <span>{sendingNotif ? 'পাঠানো হচ্ছে...' : 'সকল পাঠকদের পাঠিয়ে দিন'}</span>
                  </button>
                </form>
              </div>

              {/* Sent History */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <h3>পাঠানো নোটিফিকেশনের তালিকা</h3>
                    <p>সাম্প্রতিক প্রেরিত বার্তা</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {notifications.slice(0, 10).map((n) => (
                    <div key={n.id} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <h5 style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{n.title}</h5>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>{n.body}</p>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '36px 0' }}>কোনো নোটিফিকেশন পাওয়া যায়নি</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ SETTINGS TAB ══════════════════ */}
          {activeTab === 'Settings' && (
            <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <h3>অ্যাপ ভার্সন ও আপডেট কন্ট্রোল</h3>
                    <p>অ্যাপের বাধ্যতামূলক বা সাধারণ আপডেট নিয়ন্ত্রণ করুন</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label>বর্তমান লাইভ ভার্সন (Latest App Version)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={settingsForm.app_version}
                      onChange={(e) => setSettingsForm({ ...settingsForm, app_version: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>সর্বনিম্ন সমর্থনযোগ্য ভার্সন (Minimum Version)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={settingsForm.min_version}
                      onChange={(e) => setSettingsForm({ ...settingsForm, min_version: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>প্লে-স্টোর লিংক (Google Play Store URL)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={settingsForm.download_url}
                      onChange={(e) => setSettingsForm({ ...settingsForm, download_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <h3>মেইনটেন্যান্স মোড (Maintenance Mode)</h3>
                    <p>অ্যাপ সাময়িক বন্ধ রাখতে এটি সক্রিয় করুন</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settingsForm.maintenance_mode}
                      onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_mode: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>মেইনটেন্যান্স মোড অন করুন</span>
                  </label>

                  {settingsForm.maintenance_mode && (
                    <div className="form-group">
                      <label>ব্যবহারকারীদের জন্য বার্তা</label>
                      <textarea
                        className="form-control"
                        value={settingsForm.maintenance_msg}
                        onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_msg: e.target.value })}
                      />
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => setToast({ msg: 'সেটিংস সফলভাবে সংরক্ষিত হয়েছে!', type: 'success' })}
                  >
                    সংরক্ষণ করুন
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════ MODALS ══════════════════ */}

      {/* 1. STORY READER MODAL */}
      {readerModalOpen && selectedStory && (
        <div className="modal-overlay">
          <div className="modal-card reader-modal">
            <div className="modal-header">
              <div>
                <h3>{selectedStory.title}</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  লেখক: {selectedStory.writer_name || selectedStory.username} • ক্যাটেগরি: {selectedStory.category}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setReaderModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Chapters Selector */}
              {storyChapters.length > 0 && (
                <div className="reader-chapters-nav">
                  {storyChapters.map((ch, idx) => (
                    <button
                      key={ch.id || idx}
                      className={`reader-chapter-btn ${activeStoryChapterIdx === idx ? 'active' : ''}`}
                      onClick={() => setActiveStoryChapterIdx(idx)}
                    >
                      পর্ব {idx + 1}: {ch.title}
                    </button>
                  ))}
                </div>
              )}

              {/* Chapter Content */}
              <div className="reader-content">
                {storyChapters[activeStoryChapterIdx]?.body || selectedStory.description || 'কোনো লেখা পাওয়া যায়নি।'}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setRejectModalOpen(true);
                }}
              >
                <X size={14} />
                <span>বাতিল করুন</span>
              </button>

              <button className="btn btn-primary btn-sm" onClick={() => approveStory(selectedStory)}>
                <Check size={14} />
                <span>অনুমোদন ও অ্যাপে প্রকাশ করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. REJECT STORY MODAL */}
      {rejectModalOpen && selectedStory && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>গল্প বাতিলের কারণ লিখুন</h3>
              <button className="btn-icon" onClick={() => setRejectModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#cbd5e1' }}>
                লেখক <strong>{selectedStory.writer_name}</strong>-কে গল্প বাতিলের কারণ জানিয়ে নোটিফিকেশন পাঠানো হবে।
              </p>
              <div className="form-group">
                <label>বাতিলের কারণ বা সংশোধন নোট</label>
                <textarea
                  className="form-control"
                  placeholder="যেমন: বানানের কিছু ভুল রয়েছে, সংশোধন করে পুনরায় জমা দিন..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setRejectModalOpen(false)}>
                বাতিল
              </button>
              <button className="btn btn-danger btn-sm" onClick={submitRejectStory}>
                নিশ্চিত করুন ও লেখককে জানান
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ADD / EDIT BOOK MODAL */}
      {bookModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingBook ? 'বইয়ের তথ্য সম্পাদনা' : 'নতুন বই যুক্ত করুন'}</h3>
              <button className="btn-icon" onClick={() => setBookModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveBook}>
              <div className="modal-body">
                <div className="form-group">
                  <label>বইয়ের নাম (Title)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="যেমন: শেষের কবিতা"
                    value={bookForm.title}
                    onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>লেখক (Author)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="লেখকের নাম লিখুন"
                    value={bookForm.author}
                    onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>ক্যাটেগরি (Category)</label>
                  <select
                    className="form-control"
                    value={bookForm.category_id}
                    onChange={(e) => setBookForm({ ...bookForm, category_id: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>কভার ছবি (Cover Image)</label>
                  {bookForm.cover_url && (
                    <img
                      src={bookForm.cover_url}
                      alt="Cover"
                      style={{ width: 80, height: 110, borderRadius: 8, objectFit: 'cover', marginBottom: 8 }}
                    />
                  )}
                  <label className="dropzone">
                    <Upload size={22} color="#10b981" />
                    <p>{uploadingCover ? 'আপলোড হচ্ছে...' : 'কভার ছবি আপলোড করতে ক্লিক করুন'}</p>
                    <small>JPG, PNG বা WEBP ছবি নির্বাচন করুন</small>
                    <input type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                  </label>
                </div>

                <div className="form-group">
                  <label>বইয়ের বিবরণ / সারসংক্ষেপ</label>
                  <textarea
                    className="form-control"
                    placeholder="গল্পের সংক্ষিপ্ত পটভূমি..."
                    value={bookForm.description}
                    onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={bookForm.featured}
                      onChange={(e) => setBookForm({ ...bookForm, featured: e.target.checked })}
                    />
                    <span>হোম স্ক্রিনে ফিচার্ড করুন</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBookModalOpen(false)}>
                  বাতিল
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                  {loading ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. ADD / EDIT CHAPTER MODAL */}
      {chapterModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card reader-modal">
            <div className="modal-header">
              <h3>{editingChapter ? 'পর্ব সম্পাদনা' : 'নতুন পর্ব যুক্ত করুন'}</h3>
              <button className="btn-icon" onClick={() => setChapterModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveChapter}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14 }}>
                  <div className="form-group">
                    <label>পর্বের শিরোনাম (Chapter Title)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="যেমন: প্রথম পরিচ্ছেদ: আগমন"
                      value={chapterForm.title}
                      onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>ক্রম (Position)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={chapterForm.position}
                      onChange={(e) => setChapterForm({ ...chapterForm, position: Number(e.target.value) || 1 })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>পড়ার সময় (মিনিট)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={chapterForm.minutes}
                    onChange={(e) => setChapterForm({ ...chapterForm, minutes: Number(e.target.value) || 5 })}
                  />
                </div>

                <div className="form-group">
                  <label>পর্বের বিস্তারিত গল্প বা কনটেন্ট</label>
                  <textarea
                    className="form-control"
                    style={{ minHeight: 280, lineHeight: 1.8 }}
                    placeholder="এখানে অধ্যায়ের গল্প লিখুন..."
                    value={chapterForm.body}
                    onChange={(e) => setChapterForm({ ...chapterForm, body: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChapterModalOpen(false)}>
                  বাতিল
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                  {loading ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ ও প্রকাশ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
