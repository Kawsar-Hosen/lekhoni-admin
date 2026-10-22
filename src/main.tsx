import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BarChart3, Bell, BookOpen, ChevronDown, ChevronUp, CloudUpload,
  Eye, EyeOff, FileEdit, Image, LayoutDashboard, Menu, MessageSquare,
  MoreHorizontal, Plus, Search, Settings, Users, X, Trash2,
  Check, Ban, Send, Loader2, AlertTriangle, Shield, Filter,
  Edit3, ExternalLink, TrendingUp, Globe, Calendar, Clock,
  Heart, Bookmark, Share2, RefreshCw, Download, ToggleLeft, ToggleRight,
  Hash, Type, Palette, AlignLeft, ListOrdered, Upload,
  Zap, Gift, Megaphone, Sparkles, Award, Coffee, Info, Star, GripVertical,
  UserCheck, Flag
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
  pdf_url?: string;
  dedication?: string;
  author_name?: string;
  show_ads?: boolean;
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
  reward_ad?: boolean;
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
  total_chapters: number;
  active_readers: number;
  unique_readers: number;
  views_today: number;
  views_this_week: number;
  views_this_month: number;
  recent_books: Book[];
  popular_books: Book[];
  recent_comments: Comment[];
  daily_views: { date: string; views: number }[];
}

type Page = 'Dashboard' | 'Books' | 'Chapters' | 'Categories' | 'Comments' | 'Writers' | 'Users' | 'Home Control' | 'Notifications' | 'Moderators' | 'Analytics' | 'Settings' | 'Reports';

type ModeratorUser = { id?: string; username?: string; displayName?: string; display_name?: string; role?: string };

const API_BASE = 'https://lekhoni-admin-api.smdkawsar2.workers.dev';

const nav: [Page, React.ElementType][] = [
  ['Dashboard', LayoutDashboard],
  ['Books', BookOpen],
  ['Chapters', FileEdit],
  ['Categories', Menu],
  ['Comments', MessageSquare],
  ['Writers', Users],
  ['Users', UserCheck],
  ['Home Control', Sparkles],
  ['Notifications', Bell],
  ['Moderators', Shield],
  ['Reports', Flag],
  ['Analytics', BarChart3],
  ['Settings', Settings],
];

const MODERATOR_PAGES: Page[] = ['Books', 'Chapters', 'Categories', 'Writers', 'Notifications', 'Reports', 'Analytics'];

// ─── API Helper ─────────────────────────────────────────────────────────

async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const s = localStorage.getItem('lekhoni_moderator_token') || localStorage.getItem('lekhoni_admin_secret');
    if (s) headers['Authorization'] = 'Bearer ' + s;
  } catch {}
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers as Record<string, string> } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || res.statusText;
    try { const parsed = JSON.parse(text); if (parsed?.error) message = parsed.error; } catch {}
    throw new Error(message);
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

// ─── Terms Web Page (for Play Store) ───────────────────────────────────

function TermsWebPage() {
  const [lang, setLang] = useState<'bn' | 'en' | 'hi'>('bn');
  const t: Record<string, { title: string; intro: string; terms: string[]; privacy: string[]; content: string[]; contact: string }> = {
    bn: {
      title: 'Lekhoni Kahini', intro: 'বাংলা সাহিত্য ও উপন্যাসের এক অনন্য পাঠভুবন',
      terms: ['লেখনী কাহিনিতে স্বাগতম। এই অ্যাপ ব্যবহার করে আপনি নিম্নলিখিত শর্তাবলী মেনে নিচ্ছেন।', 'এই অ্যাপ ব্যবহার করতে আপনার বয়স কমপক্ষে ১৩ বছর হতে হবে।', 'আপনি যে গল্প লেখেন তার মালিকানা আপনারই থাকবে।', 'আপনি ক্ষতিকর, অপমানজনক বা বেআইনি কন্টেন্ট পোস্ট করবেন না।', 'শর্ত লঙ্ঘনে আমরা আপনার অ্যাকাউন্ট সাসপেন্ড বা টার্মিনেট করতে পারি।'],
      privacy: ['আপনার গোপনীয়তা আমাদের কাছে গুরুত্বপূর্ণ।', 'আমরা সংগ্রহ করি: আপনার নাম/ইমেইল, পাঠ ইতিহাস, ডিভাইস তথ্য।', 'আমরা আপনার ডেটা অ্যাপ প্রদান ও উন্নত করতে ব্যবহার করি।', 'আমরা আপনার ব্যক্তিগত ডেটা বিক্রি করি না।', 'আমরা আপনার ব্যক্তিগত তথ্য রক্ষা করতে নিরাপত্তা ব্যবস্থা প্রয়োগ করি।', 'আমরা এই নীতি আপডেট করতে পারি।'],
      content: ['লেখনী কাহিনি বাংলা সাহিত্যের একটি প্ল্যাটফর্ম।', 'লেখকরা তাদের মূল রচনার সম্পূর্ণ মালিকানা রাখেন।', 'সমস্ত প্রকাশিত কন্টেন্ট আমাদের দল দ্বারা পর্যালোচিত হয়।', 'ব্যবহারকারীরা অনুপযুক্ত কন্টেন্ট রিপোর্ট করতে পারেন।', 'যোগ্য লেখকরা পাঠক সংখ্যার ভিত্তিতে আয় করতে পারেন।'],
      contact: 'ইমেইল: lekhoni-kahini@xyteee.com | আমরা ৪৮ ঘণ্টার মধ্যে উত্তর দিই।'
    },
    en: {
      title: 'Lekhoni Kahini', intro: 'Your gateway to Bengali literature & novels',
      terms: ['Welcome to Lekhoni Kahini. By using this app, you agree to these terms.', 'You must be at least 13 years old to use this app.', 'You retain ownership of stories you write.', 'You agree not to post harmful, abusive, or illegal content.', 'We may suspend or terminate your account for violations.'],
      privacy: ['Your privacy is important to us.', 'We collect: your name/email, reading history, device info.', 'We use your data to provide and improve the app.', 'We do not sell your personal data.', 'We implement security measures to protect your information.', 'We may update this policy.'],
      content: ['Lekhoni Kahini is a platform for Bengali literature.', 'Authors retain full ownership of their original works.', 'All published content is reviewed by our team.', 'Users can report inappropriate content.', 'Eligible writers may earn revenue based on readership.'],
      contact: 'Email: lekhoni-kahini@xyteee.com | We respond within 48 hours.'
    },
    hi: {
      title: 'Lekhoni Kahini', intro: 'बंगाली साहित्य और उपन्यासों का अनोखा मंच',
      terms: ['लेखनी कहानी में आपका स्वागत है। इस ऐप का उपयोग करके आप इन शर्तों से सहमत होते हैं।', 'इस ऐप का उपयोग करने के लिए आपकी आयु कम से कम 13 वर्ष होनी चाहिए।', 'आप जो कहानियाँ लिखते हैं उनका स्वामित्व आपका ही रहता है।', 'आप हानिकारक या गैरकानूनी सामग्री पोस्ट नहीं करेंगे।', 'शर्तों का उल्लंघन करने पर हम आपका खाता निलंबित कर सकते हैं।'],
      privacy: ['आपकी गोपनीयता हमारे लिए महत्वपूर्ण है।', 'हम एकत्र करते हैं: आपका नाम/ईमेल, पढ़ने का इतिहास, डिवाइस जानकारी।', 'हम आपके डेटा का उपयोग ऐप प्रदान करने के लिए करते हैं।', 'हम आपका व्यक्तिगत डेटा नहीं बेचते।', 'हम आपकी जानकारी की रक्षा के लिए सुरक्षा उपाय लागू करते हैं।', 'हम इस नीति को अपडेट कर सकते हैं।'],
      content: ['लेखनी कहानी बंगाली साहित्य का मंच है।', 'लेखक अपने मूल कार्यों का पूर्ण स्वामित्व रखते हैं।', 'सभी प्रकाशित सामग्री की समीक्षा की जाती है।', 'उपयोगकर्ता अनुपयुक्त सामग्री की रिपोर्ट कर सकते हैं।', 'योग्य लेखक पाठकों के आधार पर कमा सकते हैं।'],
      contact: 'ईमेल: lekhoni-kahini@xyteee.com | हम 48 घंटे में जवाब देते हैं।'
    }
  };
  const d = t[lang];

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 700, margin: '0 auto', padding: '20px 16px', background: '#fafafa', minHeight: '100vh' }}>
      {/* Language selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
        {(['bn', 'en', 'hi'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: lang === l ? '#10B981' : '#fff', color: lang === l ? '#fff' : '#333' }}>{l === 'bn' ? 'বাংলা' : l === 'en' ? 'English' : 'हिन्दी'}</button>
        ))}
      </div>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, padding: '32px 16px', background: 'linear-gradient(135deg, #10B981, #059669)', borderRadius: 16, color: '#fff' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>📖</div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{d.title}</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.85, fontSize: 14 }}>{d.intro}</p>
      </div>
      {/* Terms of Service */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #eee' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#10B981' }}>📜 {lang === 'bn' ? 'সেবার শর্তাবলী' : lang === 'hi' ? 'सेवा की शर्तें' : 'Terms of Service'}</h2>
        {d.terms.map((s: string, i: number) => <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: '#444', margin: '0 0 10px' }}>{i + 1}. {s}</p>)}
      </div>
      {/* Privacy Policy */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #eee' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#3B82F6' }}>🔒 {lang === 'bn' ? 'গোপনীয়তা নীতি' : lang === 'hi' ? 'गोपनीयता नीति' : 'Privacy Policy'}</h2>
        {d.privacy.map((s: string, i: number) => <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: '#444', margin: '0 0 10px' }}>{i + 1}. {s}</p>)}
      </div>
      {/* Content Policy */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #eee' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#8B5CF6' }}>📝 {lang === 'bn' ? 'কন্টেন্ট নীতি' : lang === 'hi' ? 'सामग्री नीति' : 'Content Policy'}</h2>
        {d.content.map((s: string, i: number) => <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: '#444', margin: '0 0 10px' }}>{i + 1}. {s}</p>)}
      </div>
      {/* Contact */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #eee', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#F59E0B' }}>✉️ {lang === 'bn' ? 'যোগাযোগ' : lang === 'hi' ? 'संपर्क' : 'Contact'}</h2>
        <p style={{ fontSize: 14, color: '#444', margin: 0 }}>{d.contact}</p>
      </div>
      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 12 }}>
        <p style={{ margin: 0 }}>© 2026 {d.title}. All rights reserved.</p>
        <p style={{ margin: '4px 0 0' }}>Last updated: 2026-08-30</p>
      </div>
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────────────────

function App() {
  const [page, setPage] = useState<Page>(() => { try { return localStorage.getItem('lekhoni_moderator_token') ? 'Books' : 'Dashboard'; } catch { return 'Dashboard'; } });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [role, setRole] = useState<'admin' | 'moderator'>(() => { try { return localStorage.getItem('lekhoni_moderator_token') ? 'moderator' : 'admin'; } catch { return 'admin'; } });
  const [moderator, setModerator] = useState<ModeratorUser | null>(() => { try { const raw = localStorage.getItem('lekhoni_moderator_user'); return raw ? JSON.parse(raw) as ModeratorUser : null; } catch { return null; } });
  const [secret, setSecret] = useState<string>(() => { try { return localStorage.getItem('lekhoni_moderator_token') || localStorage.getItem('lekhoni_admin_secret') || ''; } catch { return ''; } });
  const [loginMode, setLoginMode] = useState<'admin' | 'moderator'>(() => {
    try {
      if (window.location.hostname === 'lekhoni-admin.pages.dev') return 'moderator';
      return new URLSearchParams(window.location.search).has('moderator') ? 'moderator' : 'admin';
    } catch { return 'admin'; }
  });
  const [modUsername, setModUsername] = useState('');
  const [modPassword, setModPassword] = useState('');
  const [modErr, setModErr] = useState('');
  const [modVerifying, setModVerifying] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [secretErr, setSecretErr] = useState('');
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [pendingComments, setPendingComments] = useState(0);
  const [pendingWriters, setPendingWriters] = useState(0);
  const [pendingNotifications, setPendingNotifications] = useState(0);
  const [editItem, setEditItem] = useState<any>(null);
  const lastNotifCount = useRef(0);
  const notifAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileNavOpen]);

  // Terms page route
  if (window.location.pathname === '/terms') return <TermsWebPage />;

  const [verifying, setVerifying] = useState(false);
  const revokeModeratorSession = () => {
    try {
      const token = localStorage.getItem('lekhoni_moderator_token');
      if (token) fetch(`${API_BASE}/api/moderator/logout`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
    } catch {}
  };
  const saveSecret = async () => {
    const v = secretInput.trim();
    if (!v) { setSecretErr('Enter the admin secret'); return; }
    setVerifying(true); setSecretErr('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics`, { headers: { 'Authorization': 'Bearer ' + v } });
      if (res.status === 401) { setSecretErr('ভুল secret — আবার যত্ন করে বসাও'); setVerifying(false); return; }
      if (!res.ok) { setSecretErr('Server error (' + res.status + ') — পরে চেষ্টা করো'); setVerifying(false); return; }
    } catch { setSecretErr('Network error — সংযোগ চেক করো'); setVerifying(false); return; }
    revokeModeratorSession();
    try { localStorage.setItem('lekhoni_admin_secret', v); localStorage.removeItem('lekhoni_moderator_token'); localStorage.removeItem('lekhoni_moderator_user'); } catch {}
    setRole('admin'); setModerator(null); setPage('Dashboard');
    setSecret(v); setSecretInput(''); setSecretErr(''); setVerifying(false);
  };
  const clearSecret = () => {
    revokeModeratorSession();
    try {
      localStorage.removeItem('lekhoni_admin_secret');
      localStorage.removeItem('lekhoni_moderator_token');
      localStorage.removeItem('lekhoni_moderator_user');
    } catch {}
    setSecret(''); setRole('admin'); setModerator(null); setPage('Dashboard');
    setMobileNavOpen(false); setLoginMode('admin'); setModUsername(''); setModPassword(''); setModErr('');
  };
  const moderatorLogin = async () => {
    const u = modUsername.trim().toLowerCase();
    if (!u || !modPassword) { setModErr('Username and password দিন'); return; }
    setModVerifying(true); setModErr('');
    try {
      const res = await fetch(`${API_BASE}/api/moderator/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: modPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.token) { setModErr(d.error || 'Login failed'); return; }
      revokeModeratorSession();
      try {
        localStorage.setItem('lekhoni_moderator_token', d.token);
        localStorage.setItem('lekhoni_moderator_user', JSON.stringify(d.user || {}));
        localStorage.removeItem('lekhoni_admin_secret');
      } catch {}
      setRole('moderator'); setModerator(d.user || null); setSecret(d.token); setPage('Books');
      setModPassword(''); setModErr('');
    } catch { setModErr('Network error — সংযোগ চেক করো'); }
    finally { setModVerifying(false); }
  };

  // Moderator can only use the shared moderation and insights pages.
  useEffect(() => {
    if (role === 'moderator' && !MODERATOR_PAGES.includes(page)) setPage('Books');
  }, [role, page]);

  // Validate a stored moderator session once on load.
  useEffect(() => {
    if (role !== 'moderator' || !secret) return;
    let cancelled = false;
    api<{ user: ModeratorUser }>('/api/moderator/me')
      .then(d => {
        if (cancelled || !d?.user) return;
        setModerator(d.user);
        try { localStorage.setItem('lekhoni_moderator_user', JSON.stringify(d.user)); } catch {}
      })
      .catch(() => {
        if (cancelled) return;
        try { localStorage.removeItem('lekhoni_moderator_token'); localStorage.removeItem('lekhoni_moderator_user'); } catch {}
        setRole('admin'); setModerator(null); setPage('Dashboard'); setSecret('');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    notifAudio.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKIeGBGPWeoqoRbRElujH+Le1xCO22zr4FWRUZ1mZ+UfWBBRnqooperIh1AXJivrJBhNjVggoKIeGBGPWeoqoRbRElujH+Le1xCO22zr4FWRUZ1mZ+UfWBBRnqooperIh1AXJiv');
  }, []);

  // Poll for new notifications every 15 seconds
  useEffect(() => {
    if (!secret) return;
    const interval = setInterval(() => {
      api('/api/admin/analytics').then((d: any) => {
        setPendingComments(d.pending_comments || 0);
        setPendingWriters(d.pending_writers || 0);
      }).catch(() => {});
      api('/api/admin/notifications').then((d: any) => {
        const list = Array.isArray(d) ? d : d.notifications || d.data || [];
        const count = list.length;
        if (lastNotifCount.current > 0 && count > lastNotifCount.current) {
          const diff = count - lastNotifCount.current;
          setPendingNotifications(diff);
          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const newest = list[0];
            new Notification(newest?.title || 'New Notification', {
              body: newest?.body || 'You have a new notification',
              icon: '/favicon.ico',
            });
          }
          // Sound
          try { notifAudio.current?.play().catch(() => {}); } catch {}
        } else if (lastNotifCount.current === 0 && count > 0) {
          setPendingNotifications(count);
        }
        lastNotifCount.current = count;
      }).catch(() => {});
    }, 15000);
    // Initial load
    api('/api/admin/analytics').then((d: any) => {
      setPendingComments(d.pending_comments || 0);
      setPendingWriters(d.pending_writers || 0);
    }).catch(() => {});
    api('/api/admin/notifications').then((d: any) => {
      const list = Array.isArray(d) ? d : d.notifications || d.data || [];
      lastNotifCount.current = list.length;
      setPendingNotifications(list.length);
    }).catch(() => {});
    return () => clearInterval(interval);
  }, [secret]);

  // Clear notification badge when on Notifications page
  useEffect(() => {
    if (page === 'Notifications') setPendingNotifications(0);
  }, [page]);

  const openCreate = (type: string) => { setEditItem(null); setModal(type); };
  const openEdit = (type: string, item: any) => { setEditItem(item); setModal(type); };
  const closeModal = () => { setModal(null); setEditItem(null); };
  const showToast = (msg: string) => setToast(msg);
  const isModerator = role === 'moderator';
  const visibleNav = isModerator ? nav.filter(([label]) => MODERATOR_PAGES.includes(label)) : nav;
  const profileName = isModerator ? (moderator?.displayName || moderator?.display_name || moderator?.username || 'Moderator') : 'Kawsar';
  const profileRole = isModerator ? 'Moderator' : 'Administrator';
  const avatarLetter = (profileName || 'M').charAt(0).toUpperCase();

  if (!secret) return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
      <div style={{ maxWidth: 380, width: '100%', padding: 24, textAlign: 'center', background: '#121b1a', border: '1px solid #25332f', borderRadius: 14 }}>
        <img src="/adminicon.png" alt="Lekhoni Admin" style={{ width: 80, height: 80, borderRadius: 18, objectFit: 'cover', margin: '0 auto 12px', display: 'block', boxShadow: '0 4px 16px #0005' }} />
        <h2 style={{ marginBottom: 6 }}>{loginMode === 'admin' ? 'Admin Login' : 'Moderator Login'}</h2>
        <p style={{ opacity: 0.7, fontSize: 12, marginBottom: 16 }}>
          {loginMode === 'admin' ? 'Enter the ADMIN_SECRET to manage Lekhoni Kahini.' : 'আপনার username ও password দিয়ে লগইন করুন।'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => { setLoginMode('admin'); setModErr(''); setSecretErr(''); }} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid ' + (loginMode === 'admin' ? '#4bc8a5' : '#2a3935'), background: loginMode === 'admin' ? '#173a31' : 'transparent', color: loginMode === 'admin' ? '#56d5b1' : '#8fa19c', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Admin</button>
          <button type="button" onClick={() => { setLoginMode('moderator'); setModErr(''); setSecretErr(''); }} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid ' + (loginMode === 'moderator' ? '#4bc8a5' : '#2a3935'), background: loginMode === 'moderator' ? '#173a31' : 'transparent', color: loginMode === 'moderator' ? '#56d5b1' : '#8fa19c', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Moderator</button>
        </div>
        {loginMode === 'admin' ? (
          <>
            <input type="password" value={secretInput} onChange={e => setSecretInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveSecret(); }} placeholder="Admin secret" style={{ width: '100%', padding: '11px 12px', margin: '4px 0 12px', borderRadius: 8, border: '1px solid #2a3935', background: '#0e1614', color: '#eaf4f0', outline: 'none', fontSize: 16 }} />
            {secretErr && <p style={{ color: '#ff8a7a', fontSize: 12, margin: '0 0 12px' }}>{secretErr}</p>}
            <button onClick={saveSecret} disabled={verifying} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 0, cursor: 'pointer', background: '#4bc8a5', color: '#09221c', fontWeight: 800, opacity: verifying ? 0.6 : 1 }}>{verifying ? 'যাচাই হচ্ছে…' : 'Unlock'}</button>
          </>
        ) : (
          <>
            <input autoComplete="username" value={modUsername} onChange={e => setModUsername(e.target.value)} placeholder="Username" style={{ width: '100%', padding: '11px 12px', margin: '4px 0 8px', borderRadius: 8, border: '1px solid #2a3935', background: '#0e1614', color: '#eaf4f0', outline: 'none', fontSize: 16 }} />
            <input autoComplete="current-password" type="password" value={modPassword} onChange={e => setModPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') moderatorLogin(); }} placeholder="Password" style={{ width: '100%', padding: '11px 12px', margin: '0 0 12px', borderRadius: 8, border: '1px solid #2a3935', background: '#0e1614', color: '#eaf4f0', outline: 'none', fontSize: 16 }} />
            {modErr && <p style={{ color: '#ff8a7a', fontSize: 12, margin: '0 0 12px' }}>{modErr}</p>}
            <button onClick={moderatorLogin} disabled={modVerifying} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 0, cursor: 'pointer', background: '#4bc8a5', color: '#09221c', fontWeight: 800, opacity: modVerifying ? 0.6 : 1 }}>{modVerifying ? 'লগইন হচ্ছে…' : 'Login as Moderator'}</button>
            <p style={{ color: '#71837e', fontSize: 10, margin: '14px 0 0', lineHeight: 1.6 }}>Limited access: Books, Chapters, Categories, Writers, Reports, Analytics and Notifications.</p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="shell">
      <aside className={mobileNavOpen ? 'open' : ''}>
        <div className="brand">
          <img src="/adminicon.png" alt="Lekhoni Admin" style={{ width: 46, height: 46, borderRadius: 13, objectFit: 'cover', boxShadow: '0 2px 8px #0004' }} />
          <div><strong>Lekhoni</strong><small>CONTENT STUDIO</small></div>
          <button onClick={clearSecret} title={isModerator ? 'Logout moderator' : 'Lock admin'} style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}>🔒</button>
          <button className="nav-close" onClick={() => setMobileNavOpen(false)} title="Close menu" aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav>
          {visibleNav.map(([label, Icon]) => (
            <button key={label} title={label} className={page === label ? 'active' : ''} onClick={() => { setPage(label); setMobileNavOpen(false); }}>
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Comments' && pendingComments > 0 && <b>{pendingComments}</b>}
              {label === 'Writers' && pendingWriters > 0 && <b>{pendingWriters}</b>}
              {label === 'Notifications' && pendingNotifications > 0 && <b>{pendingNotifications}</b>}
            </button>
          ))}
        </nav>
        <div className="admin">
          <div className="avatar">{avatarLetter}</div>
          <div><strong>{profileName}</strong><small>{profileRole}</small></div>
          <ChevronDown size={15} />
        </div>
      </aside>
      {mobileNavOpen && <div className="nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <main>
        <header>
          <button className="mobile" onClick={() => setMobileNavOpen(v => !v)} aria-label="Open menu"><Menu /></button>
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
            {(page === 'Books' && !isModerator) && <button className="primary" onClick={() => openCreate('book')}><Plus size={17} /> New book</button>}
            {page === 'Chapters' && <button className="primary" onClick={() => openCreate('chapter')}><Plus size={17} /> New chapter</button>}
            {page === 'Categories' && <button className="primary" onClick={() => openCreate('category')}><Plus size={17} /> New category</button>}
            {page === 'Notifications' && <button className="primary" onClick={() => openCreate('notification')}><Plus size={17} /> New notification</button>}
          </div>
        </header>
        {page === 'Dashboard' && !isModerator && <Dashboard onCreate={() => openCreate('book')} onToast={showToast} />}
        {page === 'Books' && <BooksPage isModerator={isModerator} onEdit={(b: Book) => openEdit('book', b)} onToast={showToast} onRefreshPending={setPendingComments} />}
        {page === 'Chapters' && <ChaptersPage onToast={showToast} />}
        {page === 'Categories' && <CategoriesPage onEdit={(c: Category) => openEdit('category', c)} onToast={showToast} />}
        {page === 'Comments' && !isModerator && <CommentsPage onToast={showToast} onRefreshPending={setPendingComments} />}
            {page === 'Writers' && <WritersPage isModerator={isModerator} onToast={showToast} onRefreshPending={setPendingWriters} />}
            {page === 'Users' && !isModerator && <UsersPage onToast={showToast} />}
            {page === 'Home Control' && !isModerator && <HomeControlPage onToast={showToast} />}
            {page === 'Notifications' && <NotificationsPage canDelete={!isModerator} onToast={showToast} />}
        {page === 'Moderators' && !isModerator && <ModeratorsPage onToast={showToast} />}
        {page === 'Analytics' && <AnalyticsPage />}
        {page === 'Reports' && <ReportsPage onToast={showToast} />}
        {page === 'Settings' && !isModerator && <SettingsPage onToast={showToast} />}
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

function BooksPage({ onEdit, onToast, onRefreshPending, isModerator = false }: { onEdit: (b: Book) => void; onToast: (m: string) => void; onRefreshPending?: (n: number) => void; isModerator?: boolean }) {
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
          <h2>{isModerator ? 'Review stories' : 'Manage books'}</h2>
          <p>{isModerator ? 'Publish, unpublish or delete stories. Editing is restricted to admins.' : 'Everything published here syncs safely with the mobile app.'}</p>
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
            <p>{isModerator ? 'No stories found to review.' : 'Create your first book to get started.'}</p>
          </div>
        ) : (
          <div className="table cards-mobile">
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
                  {!isModerator && (
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
                  )}
                  {!isModerator && (
                    <button style={{ background: 'none', border: 'none', color: '#8fa19c', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => toggleViewsVisible(b)} title={b.views_visible === false ? 'Views OFF — click to show in app' : 'Views ON — click to hide in app'}>
                      {b.views_visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
                      <span style={{ fontSize: 10, fontWeight: 800, color: b.views_visible === false ? '#e15e4e' : '#2aa876' }}>{b.views_visible === false ? 'OFF' : 'ON'}</span>
                    </button>
                  )}
                  {!isModerator && (
                    <button style={{ background: 'none', border: 'none', color: b.featured ? '#f5c660' : '#8fa19c', cursor: 'pointer', padding: 2 }} onClick={() => toggleFeature(b)} title={b.featured ? 'Remove from Featured' : 'Add to Featured'}>
                      <Star size={15} fill={b.featured ? '#f5c660' : 'none'} />
                    </button>
                  )}
                  {!isModerator && (
                    <button style={{ background: 'none', border: 'none', color: '#8fa19c', cursor: 'pointer', padding: 2 }} onClick={() => onEdit(b)} title="Edit">
                      <Edit3 size={14} />
                    </button>
                  )}
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

  const toggleRewardAd = async (ch: Chapter) => {
    const newRewardAd = !ch.reward_ad;
    try {
      await api(`/api/admin/chapters/${ch.id}`, {
        method: 'PUT',
        body: JSON.stringify({ reward_ad: newRewardAd }),
      });
      setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, reward_ad: newRewardAd } : c));
      onToast(`Chapter ${newRewardAd ? 'locked' : 'unlocked'}`);
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
          <div className="table cards-mobile">
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
                <span>
                  <u
                    className={ch.reward_ad ? 'draft' : ''}
                    style={{ cursor: 'pointer', color: ch.reward_ad ? '#8B5CF6' : undefined }}
                    onClick={() => toggleRewardAd(ch)}
                    title={`Click to toggle reward ad`}
                  >
                    {ch.reward_ad ? '🔒 Locked' : '🔓 Free'}
                  </u>
                </span>
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
  const [tab, setTab] = useState<'all' | 'requests'>('all');

  const pending = categories.filter(c => !c.is_active && (c as any).requested_by);
  const shown = tab === 'requests' ? pending : categories;

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

  const approveCategory = async (cat: Category) => {
    try {
      await api(`/api/admin/categories/${cat.id}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) });
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: true } : c));
      onToast(`"${cat.name}" approved`);
    } catch {
      onToast('Failed to approve category');
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
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={() => setTab('all')}
              style={{ background: tab === 'all' ? '#18342d' : 'none', border: '1px solid #2a3f3a', color: tab === 'all' ? '#7fe0b2' : '#8fa19c', cursor: 'pointer', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              All ({categories.length})
            </button>
            <button
              onClick={() => setTab('requests')}
              style={{ background: tab === 'requests' ? '#4a2c10' : 'none', border: '1px solid #2a3f3a', color: tab === 'requests' ? '#fbbf24' : '#8fa19c', cursor: 'pointer', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              ⏳ Requests ({pending.length})
            </button>
          </div>
        </div>
        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading categories...</h3></div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <CloudUpload size={35} />
            <h3>{tab === 'requests' ? 'No pending requests' : 'No categories yet'}</h3>
            <p>{tab === 'requests' ? 'Writer category requests will appear here.' : 'Create categories to organize books.'}</p>
          </div>
        ) : (
          <div className="table cards-mobile">
            {shown.map(cat => (
              <div className="tr" key={cat.id}>
                <span className="book-cell">
                  <i style={{ background: cat.color || '#18342d' }}>{cat.cover_url ? <img src={cat.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : ''}</i>
                  <em>
                    <b>{cat.name}</b>
                    <small>Position: {cat.position}{(cat as any).requested_by && !(cat as any).is_active ? ' · ⏳ writer request' : ''}{(cat as any).visible_on === 'website' ? ' · website-only' : ''}</small>
                  </em>
                </span>
                <span>{cat.books_count ?? 0} books</span>
                <span><u>{cat.color || '#DDF5EC'}</u></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {!cat.is_active && (
                    <button style={{ background: '#18342d', border: 'none', color: '#7fe0b2', cursor: 'pointer', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }} onClick={() => approveCategory(cat)} title="Approve">
                      Approve
                    </button>
                  )}
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
          <div className="table cards-mobile">
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

function WritersPage({ onToast, onRefreshPending, isModerator = false }: { onToast: (m: string) => void; onRefreshPending?: (n: number) => void; isModerator?: boolean }) {
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

  const toggleApproval = async (writer: any, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api(`/api/admin/writers/${writer.id}/approval`, { method: 'PUT', body: JSON.stringify({ approval_required: !current }) });
      setUsers(prev => prev.map(u => u.id === writer.id ? { ...u, approval_required: !current } : u));
      onToast(current ? 'Approval OFF — stories publish directly' : 'Approval ON — stories need review');
    } catch { onToast('Failed to update'); }
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
          <p>{isModerator ? 'Review pending stories and give verified badges to trusted writers.' : 'Check each writer — how many stories they\'ve published and their details.'}</p>
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
          <div className="table writers-table">
            {users.map((u: any) => (
              <div className="tr" key={u.id} style={{ gridTemplateColumns: '52px 1fr 100px 90px 90px 80px 80px', cursor: 'pointer' }} onClick={() => openDetail(u.id)}>
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
                <span onClick={(e) => e.stopPropagation()}>
                  {isModerator ? (
                    <small style={{ color: '#5f716c', fontSize: 10 }}>—</small>
                  ) : (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <div onClick={(e) => toggleApproval(u, u.approval_required !== false, e)} style={{ width: 38, height: 20, borderRadius: 10, background: u.approval_required !== false ? '#10B981' : '#94a3b8', position: 'relative', transition: 'background 0.2s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: u.approval_required !== false ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </div>
                      <small style={{ color: '#6f827d', fontSize: 10 }}>{u.approval_required !== false ? 'On' : 'Off'}</small>
                    </label>
                  )}
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

function UsersPage({ onToast }: { onToast: (m: string) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api('/api/admin/users')
      .then(d => setUsers(d))
      .catch(() => onToast('Failed to load users'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = search
    ? users.filter(u => (u.user_name || u.display_name || '').toLowerCase().includes(search.toLowerCase()) || (u.device_key || '').toLowerCase().includes(search.toLowerCase()))
    : users;

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const d = await api(`/api/admin/users/${deleteId}`, { method: 'DELETE' });
      if (d.ok) { onToast('User deleted'); setDeleteId(null); load(); }
      else onToast(d.error || 'Delete failed');
    } catch { onToast('Delete failed'); }
    finally { setDeleting(false); }
  };

  const formatDate = (s: string) => s ? new Date(s).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
  const formatDateTime = (s: string) => s ? new Date(s).toLocaleString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div className="content">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)', fontSize: 13 }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{filtered.length} users</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} className="spin" style={{ opacity: 0.3 }} /></div>
      ) : !filtered.length ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>No users found</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(u => (
            <div key={u.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17 }}>
                  {(u.user_name || u.display_name || '?')[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{u.user_name || u.display_name || 'Anonymous'}</div>
                {u.user_bio && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.user_bio}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                  <span>Joined: {formatDate(u.last_active || u.last_seen_at)}</span>
                  <span>Favorites: {u.favorites_count || 0}</span>
                  <span>Bookmarks: {u.bookmarks_count || 0}</span>
                  <span>Comments: {u.comments_count || 0}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: u.language === 'bn' ? '#10B98122' : u.language === 'hi' ? '#F59E0B22' : '#3B82F622', color: u.language === 'bn' ? '#10B981' : u.language === 'hi' ? '#F59E0B' : '#3B82F6', fontWeight: 600 }}>
                  {u.language === 'bn' ? 'বাংলা' : u.language === 'hi' ? 'हिन्दी' : 'English'}
                </span>
                <button onClick={() => setDeleteId(u.device_key)} style={{ padding: 6, borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 18, padding: 28, width: 'min(360px, calc(100vw - 32px))', textAlign: 'center', border: '1px solid var(--line)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={26} color="#EF4444" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>Delete this user?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              This will permanently delete the user's data including favorites, bookmarks, history, and comments. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'var(--bg)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Moderators Page ───────────────────────────────────────────────────

function ModeratorsPage({ onToast }: { onToast: (m: string) => void }) {
  const [mods, setMods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [savingReset, setSavingReset] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<any[]>('/api/admin/moderators')
      .then(d => setMods(Array.isArray(d) ? d : []))
      .catch(() => onToast('Failed to load moderators'))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const createModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { onToast('Username and password required'); return; }
    setCreating(true);
    try {
      await api('/api/admin/moderators', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim().toLowerCase(), display_name: displayName.trim(), password }),
      });
      setUsername(''); setDisplayName(''); setPassword('');
      onToast('Moderator account created');
      load();
    } catch (err) {
      onToast(err instanceof Error ? err.message.replace(/^API \d+: /, '') : 'Failed to create moderator');
    } finally { setCreating(false); }
  };

  const toggleActive = async (m: any) => {
    try {
      await api(`/api/admin/moderators/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !m.is_active }),
      });
      setMods(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x));
      onToast(!m.is_active ? 'Moderator enabled' : 'Moderator disabled');
    } catch { onToast('Failed to update moderator'); }
  };

  const saveReset = async (m: any) => {
    if (resetPassword.length < 8) { onToast('Password must be at least 8 characters'); return; }
    setSavingReset(true);
    try {
      await api(`/api/admin/moderators/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetId(null); setResetPassword('');
      onToast('Password reset — moderator must login again');
    } catch (err) {
      onToast(err instanceof Error ? err.message.replace(/^API \d+: /, '') : 'Failed to reset password');
    } finally { setSavingReset(false); }
  };

  const removeModerator = async (m: any) => {
    if (!confirm(`Delete moderator "${m.username}"?`)) return;
    try {
      await api(`/api/admin/moderators/${m.id}`, { method: 'DELETE' });
      setMods(prev => prev.filter(x => x.id !== m.id));
      onToast('Moderator deleted');
    } catch { onToast('Failed to delete moderator'); }
  };

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Moderators</h2>
          <p>Create simple username/password accounts for trusted team members. Admin access stays unchanged.</p>
        </div>
      </div>

      <div className="panel settings-panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Create moderator</h3>
        <p style={{ color: '#71837e', fontSize: 11, lineHeight: 1.6, margin: '0 0 16px' }}>
          Moderators can publish/unpublish stories, approve writer stories, give verified badges, delete stories and send notifications.
        </p>
        <form onSubmit={createModerator}>
          <div className="form-grid">
            <label>
              Username
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. moderator1" autoComplete="off" />
            </label>
            <label>
              Display name
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Content Team" autoComplete="off" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ chars, letter + number" autoComplete="new-password" />
            </label>
          </div>
          <button className="primary" type="submit" disabled={creating} style={{ opacity: creating ? 0.6 : 1 }}>
            {creating ? <Loader2 size={16} className="spin" /> : <Shield size={16} />} Create moderator
          </button>
        </form>
      </div>

      <div className="panel resource">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Moderator accounts</h3>
            <p style={{ margin: '4px 0 0', color: '#71837e', fontSize: 11 }}>Disable an account to immediately invalidate its sessions.</p>
          </div>
          <span style={{ color: '#71837e', fontSize: 11 }}>{mods.length} accounts</span>
        </div>

        {loading ? (
          <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading moderators...</h3></div>
        ) : mods.length === 0 ? (
          <div className="empty"><Shield size={35} /><h3>No moderators yet</h3><p>Create their account above.</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {mods.map(m => (
              <div key={m.id} style={{ border: '1px solid #25332f', borderRadius: 11, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#0f1816' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: m.is_active ? '#18342d' : '#2a2118', color: m.is_active ? '#4fd0ac' : '#e1a74b', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                  {(m.display_name || m.username || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{m.display_name || m.username}</b>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: m.is_active ? '#173a31' : '#40241f', color: m.is_active ? '#4fd0ac' : '#ff9a8a', fontWeight: 700 }}>{m.is_active ? 'ACTIVE' : 'DISABLED'}</span>
                  </div>
                  <div style={{ color: '#71837e', fontSize: 10, marginTop: 4 }}>
                    @{m.username} · Created {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'} · Last login {m.last_login_at ? timeAgo(m.last_login_at) : 'never'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button onClick={() => toggleActive(m)} style={{ border: '1px solid #30413d', background: 'transparent', color: m.is_active ? '#e1a74b' : '#4fd0ac', borderRadius: 7, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{m.is_active ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => { setResetId(resetId === m.id ? null : m.id); setResetPassword(''); }} style={{ border: '1px solid #30413d', background: 'transparent', color: '#8fa19c', borderRadius: 7, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Reset password</button>
                  <button onClick={() => removeModerator(m)} style={{ border: '1px solid #5a302a', background: '#2a1715', color: '#ff8a7a', borderRadius: 7, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                </div>
                {resetId === m.id && (
                  <div style={{ flex: '1 1 100%', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #22302d', paddingTop: 10 }}>
                    <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="New password (8+ chars, letter + number)" autoComplete="new-password" style={{ flex: '1 1 220px', minWidth: 0, border: '1px solid #2d3e39', background: '#0e1614', borderRadius: 8, padding: '9px 11px', color: '#e9f1ee', outline: 'none' }} />
                    <button onClick={() => saveReset(m)} disabled={savingReset} style={{ border: 0, background: '#4bc8a5', color: '#09221c', borderRadius: 8, padding: '9px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: savingReset ? 0.6 : 1 }}>{savingReset ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => { setResetId(null); setResetPassword(''); }} style={{ border: '1px solid #30413d', background: 'transparent', color: '#8fa19c', borderRadius: 8, padding: '9px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const onDragStart = (i: number) => setDragIdx(i);
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setOverIdx(i); };
  const onDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    setSections(s => {
      const next = [...s];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIdx(null); setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const save = () => {
    setSaving(true);
    api('/api/admin/home-config', { method: 'PUT', body: JSON.stringify({ sections }) })
      .then(() => onToast('Home control saved'))
      .catch(() => onToast('Failed to save'))
      .finally(() => setSaving(false));
  };

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
          {sections.map((s, i) => {
            const meta = HOME_SECTIONS.find((x) => x.key === s.key);
            const Icon = meta?.icon || LayoutDashboard;
            return (
              <div
                key={s.key}
                className={`hc-row ${s.enabled ? '' : 'off'} ${dragIdx === i ? 'dragging' : ''} ${overIdx === i ? 'drag-over' : ''}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={() => onDrop(i)}
                onDragEnd={onDragEnd}
              >
                <div className="hc-drag" title="Drag to reorder"><GripVertical size={16} /></div>
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
                <div className="hc-controls">
                  <div className="hc-move">
                    <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} title="Move up" aria-label="Move up"><ChevronUp size={15} /></button>
                    <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} title="Move down" aria-label="Move down"><ChevronDown size={15} /></button>
                  </div>
                  <button className="hc-toggle" onClick={() => toggle(s.key)} title={s.enabled ? 'Visible' : 'Hidden'}>
                    <span className={`hc-toggle-text ${s.enabled ? 'on' : ''}`}>{s.enabled ? 'On' : 'Off'}</span>
                    {s.enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Notifications Page ─────────────────────────────────────────────────

function NotificationsPage({ onToast, canDelete = true }: { onToast: (m: string) => void; canDelete?: boolean }) {
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
          <p>{canDelete ? 'Send and manage push notifications to your readers.' : 'Send push notifications to readers or writers.'}</p>
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
          <div className="table cards-mobile">
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
                  {canDelete && (
                    <button
                      style={{ background: 'none', border: 'none', color: '#e15e4e', cursor: 'pointer', padding: 2 }}
                      onClick={() => deleteNotification(n)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
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
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api<Analytics>('/api/admin/analytics')
      .then(d => setData(d))
      .catch((e: any) => setError(e?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="content">
        <div className="empty"><Loader2 size={35} className="spin" /><h3>Loading real analytics...</h3></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="content">
        <div className="empty">
          <AlertTriangle size={35} />
          <h3>Analytics unavailable</h3>
          <p>{error}</p>
          <button className="primary" onClick={load}><RefreshCw size={16} /> Retry</button>
        </div>
      </div>
    );
  }

  const d = data;

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Analytics</h2>
          <p>Live performance from real production data.</p>
        </div>
        <button className="primary" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      {error && <div className="panel" style={{ color: '#ff8a7a', padding: 12, marginBottom: 14 }}>Refresh failed: {error}</div>}
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
      <div className="dashboard-grid" style={{ marginTop: 14 }}>
        <section className="panel">
          <PanelHead title="Recent comments" sub="Latest reader feedback" />
          {d?.recent_comments && d.recent_comments.length > 0 ? d.recent_comments.slice(0, 5).map((c, i) => (
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
          )) : (
            <div className="live-row">
              <div className="mini-cover" style={{ background: '#123E39', fontSize: 11, width: 32, height: 32, borderRadius: '50%' }}><MessageSquare size={14} /></div>
              <div><b>No comments yet</b><small>Reader feedback will appear here.</small></div>
              <span>--</span>
            </div>
          )}
        </section>
        <section className="panel">
          <PanelHead title="Quick stats" sub="Real content breakdown" />
          <div className="queue-row">
            <div><BookOpen size={18} /><span>Total books</span></div>
            <b>{formatNumber(d?.total_books ?? 0)}</b>
          </div>
          <div className="queue-row">
            <div><FileEdit size={18} /><span>Total chapters</span></div>
            <b>{formatNumber(d?.total_chapters ?? 0)}</b>
          </div>
          <div className="queue-row">
            <div><Menu size={18} /><span>Categories</span></div>
            <b>{formatNumber(d?.total_categories ?? 0)}</b>
          </div>
          <div className="queue-row">
            <div><Users size={18} /><span>Writers</span></div>
            <b>{formatNumber(d?.total_writers ?? 0)}</b>
          </div>
          <div className="queue-row">
            <div><Activity size={18} /><span>Active readers (5 min)</span></div>
            <b>{formatNumber(d?.active_readers ?? 0)}</b>
          </div>
          <div className="queue-row">
            <div><Globe size={18} /><span>Unique readers</span></div>
            <b>{formatNumber(d?.unique_readers ?? 0)}</b>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Reports Page ──────────────────────────────────────────────────────

function ReportsPage({ onToast }: { onToast: (m: string, t?: string) => void }) {
  const [reports, setReports] = useState<any[]>([]);
  const [status, setStatus] = useState<'pending' | 'warned' | 'dismissed' | 'deleted'>('pending');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [actionNote, setActionNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        api(`/api/admin/reports?status=${status}`),
        api('/api/admin/reports/count'),
      ]);
      setReports(Array.isArray(r) ? r : []);
      const map: Record<string, number> = {};
      (Array.isArray(c) ? c : []).forEach((x: any) => { map[x.status] = x.n; });
      setCounts(map);
    } catch { setReports([]); }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (action: 'dismiss' | 'warn' | 'delete') => {
    if (!selected || processing) return;
    if (action === 'delete' && !confirm('Delete this story permanently?')) return;
    setProcessing(true);
    try {
      await api(`/api/admin/reports/${selected.id}`, { method: 'POST', body: JSON.stringify({ action, admin_note: actionNote }) });
      onToast(action === 'dismiss' ? 'Report dismissed' : action === 'warn' ? 'Warning sent to writer' : 'Story deleted', 'success');
      setSelected(null);
      setActionNote('');
      load();
    } catch (e: any) { onToast(e.message || 'Failed', 'error'); }
    setProcessing(false);
  };

  const reasonLabel = (r: string) => ({ abusive: 'Abusive', spam: 'Spam', hate: 'Hate Speech', violence: 'Violence', inappropriate: 'Inappropriate', other: 'Other' }[r] || r);

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2><Flag size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />Reports</h2>
          <p>Manage user-reported content.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['pending', 'warned', 'dismissed', 'deleted'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${status === s ? '#123E39' : '#E5E7EB'}`, background: status === s ? '#123E39' : '#fff', color: status === s ? '#fff' : '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)} {counts[s] ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="spin" size={28} /></div> :
        reports.length === 0 ? <div className="empty"><p>No {status} reports.</p></div> :
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Story</th><th>Reason</th><th>Reporter</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(r)}>
                  <td><strong>{r.book_title || 'Unknown'}</strong><br /><small style={{ color: '#6B7280' }}>by {r.book_author || '—'}</small></td>
                  <td><span style={{ padding: '3px 8px', borderRadius: 6, background: r.reason === 'abusive' ? '#FEE2E2' : r.reason === 'spam' ? '#FEF3C7' : r.reason === 'hate' ? '#EDE9FE' : '#F3F4F6', fontSize: 12, fontWeight: 600 }}>{reasonLabel(r.reason)}</span></td>
                  <td>{r.reporter_name || 'Anonymous'}</td>
                  <td><small>{new Date(r.created_at).toLocaleDateString()}</small></td>
                  <td><button className="icon-btn" onClick={(e) => { e.stopPropagation(); setSelected(r); }}><MoreHorizontal size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setActionNote(''); }}>
          <div className="modal report-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Report Details</h3>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', fontSize: 14 }}>
                <span style={{ color: '#6B7280' }}>Story:</span><strong>{selected.book_title || 'Unknown'}</strong>
                <span style={{ color: '#6B7280' }}>Author:</span><span>{selected.book_author || '—'}</span>
                <span style={{ color: '#6B7280' }}>Reason:</span><span style={{ fontWeight: 600 }}>{reasonLabel(selected.reason)}</span>
                <span style={{ color: '#6B7280' }}>Reporter:</span><span>{selected.reporter_name || 'Anonymous'}</span>
                <span style={{ color: '#6B7280' }}>Date:</span><span>{new Date(selected.created_at).toLocaleString()}</span>
                {selected.details && <><span style={{ color: '#6B7280' }}>Details:</span><span>{selected.details}</span></>}
              </div>
            </div>
            {selected.book_id && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Story Preview</h4>
                <div style={{ padding: 12, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{selected.book_title}</p>
                  <p style={{ margin: '4px 0 0', color: '#6B7280' }}>by {selected.book_author}</p>
                </div>
              </div>
            )}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9fb0ab', marginBottom: 4 }}>Admin Note (optional)</label>
            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #2d3e39', fontSize: 13, resize: 'vertical', marginBottom: 16, background: '#0e1614', color: '#e9f1ee' }} placeholder="Reason for action..." />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => handleAction('dismiss')} disabled={processing} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Dismiss</button>
              <button onClick={() => handleAction('warn')} disabled={processing} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Warn Writer</button>
              <button onClick={() => handleAction('delete')} disabled={processing} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Delete Story</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Page ──────────────────────────────────────────────────────

function SettingsPage({ onToast }: { onToast?: (m: string) => void }) {
  const [siteName, setSiteName] = useState('Lekhoni Kahini');
  const [siteDesc, setSiteDesc] = useState('A Bengali storytelling platform');
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [commentsApproval, setCommentsApproval] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/admin/app-config').then((d: any) => {
      if (d) {
        if (d.views_visible !== undefined) setNotifEnabled(d.views_visible);
        if (d.comments_approval !== undefined) setCommentsApproval(d.comments_approval);
      }
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api('/api/admin/app-config', {
        method: 'PUT',
        body: JSON.stringify({ views_visible: notifEnabled, comments_approval: commentsApproval }),
      });
      onToast?.('Settings saved');
    } catch {
      onToast?.('Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <div className="content">
      <div className="resource-head">
        <div>
          <h2>Settings</h2>
          <p>Configure your admin panel and platform settings.</p>
        </div>
      </div>
      <div className="panel settings-panel" style={{ maxWidth: 600 }}>
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
          <span>Show views on books</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={commentsApproval}
            onChange={e => setCommentsApproval(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Comments require approval</span>
        </label>
        <p style={{ fontSize: 12, color: '#6f827d', marginTop: -8, marginBottom: 16 }}>
          {commentsApproval
            ? 'ON — New comments will be pending until you approve them'
            : 'OFF — All comments are auto-approved and shown immediately'}
        </p>
        <div className="modal-actions">
          <button className="primary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
      <AppVersionEditor onToast={onToast || ((m: string) => {})} />
      <AboutContentEditor onToast={onToast || ((m: string) => {})} />
    </div>
  );
}

function AppVersionEditor({ onToast }: { onToast: (m: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api('/api/admin/app-version')
      .then((d: any) => {
        if (d) {
          setCode(d.androidVersionCode || '');
          setName(d.androidVersionName || '');
          setForce(d.forceUpdate === '1');
        }
      })
      .catch(() => onToast('Failed to load version'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const n = parseInt(String(code), 10);
    if (!Number.isFinite(n) || n < 0) { onToast('Enter a valid version code'); return; }
    setSaving(true);
    try {
      await api('/api/admin/app-version', {
        method: 'PUT',
        body: JSON.stringify({
          androidVersionCode: n,
          androidVersionName: name.trim(),
          forceUpdate: force,
        }),
      });
      onToast('App version saved');
      load();
    } catch {
      onToast('Failed to save version');
    }
    setSaving(false);
  };

  return (
    <div className="panel settings-panel" style={{ maxWidth: 600, marginTop: 20 }}>
      <h3 style={{ marginBottom: 6 }}>App version (Android)</h3>
      <p style={{ fontSize: 12, color: '#6f827d', marginBottom: 16 }}>
        Set the latest Play Store version code. The app checks this on open and shows an
        update prompt when the installed version is older.
      </p>
      <label>
        Version code (versionCode)
        <input
          type="number"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="e.g. 7"
          disabled={loading}
        />
      </label>
      <label>
        Version name
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. 1.3.0"
          disabled={loading}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={force}
          onChange={e => setForce(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <span>Force update (no "Later" button)</span>
      </label>
      <p style={{ fontSize: 12, color: '#6f827d', marginTop: -8, marginBottom: 16 }}>
        {force
          ? 'ON — users cannot dismiss the update popup'
          : 'OFF — users can tap "Later" and keep using the app'}
      </p>
      <div className="modal-actions">
        <button className="primary" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save version'}
        </button>
      </div>
    </div>
  );
}

function AboutContentEditor({ onToast }: { onToast: (m: string) => void }) {
  const [lang, setLang] = useState<'bn' | 'en' | 'hi'>('bn');
  const defaults: Record<string, { title: string; subtitle: string; desc: string; features: string[] }> = {
    bn: { title: 'Lekhoni Kahini', subtitle: 'বাংলা সাহিত্য ও উপন্যাসের এক অনন্য পাঠভুবন', desc: 'এখানে পাবেন নতুন ও জনপ্রিয় লেখকদের অসংখ্য উপন্যাস, ছোটগল্প, কবিতা ও বিভিন্ন সাহিত্যকর্ম। নিজের পছন্দের গল্প খুঁজে পড়ুন, প্রিয় লেখকদের অনুসরণ করুন এবং বাংলা সাহিত্যের গল্পে হারিয়ে যান।', features: ['হাজার হাজার বাংলা গল্প ও উপন্যাস', 'নতুন ও জনপ্রিয় লেখকদের সৃজনশীল সাহিত্য', 'অফলাইনে পড়ার সুবিধা', 'নিজের গল্প লেখা ও প্রকাশের সুযোগ', 'গল্প লিখে আয়ের সুযোগ পান', 'নিরাপদ ও ব্যবহারকারী-বান্ধব অভিজ্ঞতা'] },
    en: { title: 'Lekhoni Kahini', subtitle: 'Your gateway to Bengali literature & novels', desc: 'Discover thousands of novels, short stories, poems and literary works from popular Bengali authors.', features: ['Thousands of Bengali stories & novels', 'Creative works from popular authors', 'Read offline anytime', 'Write & publish your own stories', 'Earn money by writing stories', 'Safe & user-friendly experience'] },
    hi: { title: 'Lekhoni Kahini', subtitle: 'बंगाली साहित्य और उपन्यासों का अनोखा मंच', desc: 'यहाँ पाएं नए और लोकप्रिय लेखकों की असंख्य कहानियाँ, लघु कथाएँ, कविताएँ और साहित्यिक कृतियाँ।', features: ['हज़ारों बंगाली कहानियाँ और उपन्यास', 'लोकप्रिय लेखकों की रचनाएँ', 'कभी भी ऑफ़लाइन पढ़ें', 'अपनी कहानियाँ लिखें और प्रकाशित करें', 'कहानी लिखकर कमाएं', 'सुरक्षित और उपयोगकर्ता-अनुकूल'] }
  };
  const [data, setData] = useState<Record<string, { title: string; subtitle: string; desc: string; features: string[] }>>(defaults);
  const [version, setVersion] = useState('1.0.0');
  const [developer, setDeveloper] = useState('Kawsar Hosen');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/api/admin/about').then((d: any) => {
      if (d && d.title) {
        setVersion(d.version || '1.0.0');
        setDeveloper(d.developer || 'Kawsar Hosen');
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const allFeatures = [...new Set([...data.bn.features, ...data.en.features, ...data.hi.features].filter(f => f.trim()))];
      await api('/api/admin/about', {
        method: 'PUT',
        body: JSON.stringify({
          title: data[lang].title,
          subtitle: data[lang].subtitle,
          description: data[lang].desc,
          features: data[lang].features.filter(f => f.trim()),
          version, developer
        })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  const updateField = (field: string, value: string) => {
    setData(prev => ({ ...prev, [lang]: { ...prev[lang], [field]: value } }));
  };
  const updateFeature = (idx: number, value: string) => {
    const f = [...data[lang].features];
    while (f.length <= idx) f.push('');
    f[idx] = value;
    setData(prev => ({ ...prev, [lang]: { ...prev[lang], features: f } }));
  };
  const addFeature = () => {
    setData(prev => ({ ...prev, [lang]: { ...prev[lang], features: [...prev[lang].features, ''] } }));
  };

  return (
    <div className="panel settings-panel" style={{ maxWidth: 600, marginTop: 24 }}>
      <h3 style={{ marginBottom: 16 }}>About App Content</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>This content appears on the "About App" page. App shows permanent defaults if not saved.</p>
      {/* Language tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['bn', 'en', 'hi'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)} style={{
            padding: '6px 16px', borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: lang === l ? 'var(--primary)' : 'var(--card)', color: lang === l ? '#fff' : 'var(--ink)'
          }}>{l === 'bn' ? 'বাংলা' : l === 'en' ? 'English' : 'हिन्दी'}</button>
        ))}
      </div>
      <label>
        Title
        <input value={data[lang].title} onChange={e => updateField('title', e.target.value)} placeholder="App title" />
      </label>
      <label>
        Subtitle
        <input value={data[lang].subtitle} onChange={e => updateField('subtitle', e.target.value)} placeholder="Short tagline" />
      </label>
      <label>
        Description
        <textarea rows={3} value={data[lang].desc} onChange={e => updateField('desc', e.target.value)} placeholder="App description..." />
      </label>
      <label style={{ fontWeight: 600, marginBottom: 8 }}>Features</label>
      {data[lang].features.map((f: string, i: number) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={f} onChange={e => updateFeature(i, e.target.value)} placeholder={`Feature ${i + 1}`} style={{ flex: 1 }} />
          <button onClick={() => {
            const f2 = data[lang].features.filter((_: string, j: number) => j !== i);
            setData(prev => ({ ...prev, [lang]: { ...prev[lang], features: f2 } }));
          }} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✕</button>
        </div>
      ))}
      <button onClick={addFeature} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>+ Add feature</button>
      <div className="settings-row" style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1 }}>
          Version
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
        </label>
        <label style={{ flex: 1 }}>
          Developer
          <input value={developer} onChange={e => setDeveloper(e.target.value)} placeholder="Kawsar Hosen" />
        </label>
      </div>
      <div className="modal-actions">
        <button className="primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save About Content'}
        </button>
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
  const [writerStatus, setWriterStatus] = useState<string>((editItem as any)?.writer_status || 'complete');
  const [isNew, setIsNew] = useState<boolean>((editItem as any)?.is_new || false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(editItem?.cover_url || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState((editItem as any)?.pdf_url || '');
  const [authorName, setAuthorName] = useState((editItem as any)?.author_name || '');
  const [dedication, setDedication] = useState((editItem as any)?.dedication || '');
  const [showAds, setShowAds] = useState(editItem?.show_ads !== false);
  const [pdfRewardAd, setPdfRewardAd] = useState((editItem as any)?.pdf_reward_ad !== false);
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
        pdf_url: pdfUrl.trim(),
        author_name: authorName.trim(),
        dedication: dedication.trim(),
        show_ads: showAds,
        pdf_reward_ad: pdfRewardAd,
        writer_status: writerStatus,
        is_new: isNew,
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
          <label>
            Story state <small style={{ color: '#6B7280' }}>(চলমান/সমাপ্ত)</small>
            <select value={writerStatus} onChange={e => setWriterStatus(e.target.value)}>
              <option value="complete">সমাপ্ত (Complete)</option>
              <option value="ongoing">চলমান (Ongoing)</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #E5E7EB', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Mark as New</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Shows নতুন badge on website</div>
          </div>
          <button type="button" onClick={() => setIsNew(!isNew)} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', background: isNew ? '#3B82F6' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 3, left: isNew ? 25 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
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
        <label className="upload" style={pdfUrl ? { borderStyle: 'solid', borderColor: '#8B5CF6' } : {}}>
          <CloudUpload />
          <span>{pdfUrl ? 'PDF selected - click to change' : 'Upload PDF file'}</span>
          <small>PDF · max 50MB · stored in Cloudflare R2</small>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setSubmitting(true);
              try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch(`${API_BASE}/api/upload-pdf`, { method: 'POST', body: fd });
                if (!res.ok) throw new Error('Upload failed');
                const data = await res.json();
                setPdfUrl(data.url || '');
                onToast('PDF uploaded');
              } catch { onToast('PDF upload failed'); }
              setSubmitting(false);
            }}
          />
        </label>
        {pdfUrl && (
          <div style={{ marginTop: 8, padding: 8, background: '#F3F4F6', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#374151', flex: 1, wordBreak: 'break-all' }}>{pdfUrl}</span>
            <button type="button" onClick={() => setPdfUrl('')} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
          </div>
        )}
        <label>
          Or PDF URL <small style={{ color: '#6B7280' }}>(if file is hosted elsewhere)</small>
          <input
            placeholder="https://example.com/file.pdf"
            value={pdfUrl}
            onChange={e => setPdfUrl(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Author Name <small style={{ color: '#6B7280' }}>(for PDF)</small>
            <input
              placeholder="লেখকের নাম (PDF-এর জন্য)"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
            />
          </label>
          <label>
            Dedication <small style={{ color: '#6B7280' }}>(optional)</small>
            <input
              placeholder="যাকে উৎসর্গ করতে চান"
              value={dedication}
              onChange={e => setDedication(e.target.value)}
            />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #E5E7EB', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Show Ads</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Interstitial ad before reading</div>
          </div>
          <button type="button" onClick={() => setShowAds(!showAds)} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', background: showAds ? '#10B981' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 3, left: showAds ? 25 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
        {pdfUrl && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>PDF Reward Ad</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>Watch ad to open PDF</div>
            </div>
            <button type="button" onClick={() => setPdfRewardAd(!pdfRewardAd)} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', background: pdfRewardAd ? '#8B5CF6' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: pdfRewardAd ? 25 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
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
  const [rewardAd, setRewardAd] = useState(false);
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
          reward_ad: rewardAd,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid #E5E7EB' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Reward Ad</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Lock chapter + show ad to unlock</div>
          </div>
          <button type="button" onClick={() => setRewardAd(!rewardAd)} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', background: rewardAd ? '#8B5CF6' : '#D1D5DB', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 3, left: rewardAd ? 25 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
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

  if (data.length === 0 || data.every(d => Number(d.views) === 0)) {
    return (
      <div className="chart-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 230 }}>
        <div style={{ textAlign: 'center', color: '#6f827d' }}>
          <BarChart3 size={28} style={{ opacity: 0.55, marginBottom: 6 }} />
          <p style={{ margin: 0, fontSize: 13 }}>No reader view events in the last 7 days</p>
          <p style={{ margin: '4px 0 0', fontSize: 11 }}>The chart will populate as readers open books.</p>
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

function formatNumber(n: number | string): string {
  const num = Number(n);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
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
