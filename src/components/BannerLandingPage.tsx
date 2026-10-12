import React, { useEffect, useState } from 'react';
import { 
  Phone, 
  Share2, 
  Check, 
  ExternalLink, 
  Users, 
  Sparkles, 
  MapPin, 
  ArrowRight,
  ShieldCheck,
  BookOpen,
  Sun,
  Moon,
  GraduationCap
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent } from '../realtimeSync';
import { renderRealSocialLogo, WhatsAppLogo } from './SocialLogos';

export interface SocialLinkItem {
  id: string;
  platform: string;
  label: string;
  url: string;
}

export interface WhatsAppGroupItem {
  id: string;
  title: string;
  description?: string;
  url: string;
}

export interface BannerLandingPageData {
  id: string;
  slug: string;
  title: string;
  description?: string;
  banner_image?: string;
  teacher_name?: string;
  contact_phone?: string;
  whatsapp_number?: string;
  contact_address?: string;
  social_links?: SocialLinkItem[];
  whatsapp_groups?: WhatsAppGroupItem[];
  is_active: boolean;
  view_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface AvailableClassType {
  id: string;
  class_type: string;
  monthly_fee: number;
  whatsapp_link?: string;
  is_active: boolean;
}

interface BannerLandingPageProps {
  slug: string;
  onNavigateHome?: () => void;
  previewData?: BannerLandingPageData; // When embedded in live preview mode
  forceTheme?: 'light' | 'dark'; // Admin preview theme switcher
}

export default function BannerLandingPage({ slug, onNavigateHome, previewData, forceTheme }: BannerLandingPageProps) {
  const [pageData, setPageData] = useState<BannerLandingPageData | null>(previewData || null);
  const [loading, setLoading] = useState(!previewData);
  const [copied, setCopied] = useState(false);
  const [views, setViews] = useState<number>(previewData?.view_count || 0);
  const [availableClasses, setAvailableClasses] = useState<AvailableClassType[]>([]);

  // Theme State (Day / Night Mode with LocalStorage Persistence)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (forceTheme) return forceTheme;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('physics_hub_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    if (forceTheme) {
      setTheme(forceTheme);
    }
  }, [forceTheme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('physics_hub_theme', next);
    }
  };

  // Fetch available class types from `class_types_config` table
  useEffect(() => {
    let isMounted = true;
    async function fetchClasses() {
      try {
        const { data, error } = await supabase
          .from('class_types_config')
          .select('*')
          .eq('is_active', true)
          .order('class_type', { ascending: true });

        if (!error && data && data.length > 0 && isMounted) {
          setAvailableClasses(
            data.map((c: any) => ({
              id: c.id,
              class_type: c.class_type || c.class_types || '',
              monthly_fee: Number(c.monthly_fee ?? c.amount ?? c.fee ?? 0),
              whatsapp_link: c.whatsapp_link || '',
              is_active: c.is_active !== false
            }))
          );
        } else if (isMounted) {
          // Fallback initial classes if config table is empty or offline
          setAvailableClasses([
            { id: '1', class_type: '2026 Revision', monthly_fee: 5000, is_active: true },
            { id: '2', class_type: '2026 Theory', monthly_fee: 3500, is_active: true },
            { id: '3', class_type: '2027 Paper Class', monthly_fee: 5000, is_active: true },
            { id: '4', class_type: '2027 Theory', monthly_fee: 5000, is_active: true },
            { id: '5', class_type: '2028 Theory', monthly_fee: 5000, is_active: true },
          ]);
        }
      } catch (err) {
        console.warn('Error fetching classes:', err);
      }
    }
    fetchClasses();
    return () => { isMounted = false; };
  }, []);

  // Load Banner Page Details (or use live previewData)
  useEffect(() => {
    if (previewData) {
      setPageData(previewData);
      setViews(previewData.view_count || 0);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadBannerPage() {
      setLoading(true);
      try {
        let matched: BannerLandingPageData | null = null;

        // 1. Try fetching from Supabase
        try {
          const { data, error } = await supabase
            .from('banner_landing_pages')
            .select('*')
            .eq('slug', slug)
            .maybeSingle();

          if (data && !error) {
            matched = {
              id: data.id,
              slug: data.slug,
              title: data.title || data.batch_name || '',
              description: data.description || data.announcement_text || '',
              banner_image: data.banner_image || '',
              teacher_name: data.teacher_name || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
              contact_phone: data.contact_phone || '0779630100',
              whatsapp_number: data.whatsapp_number || data.contact_phone || '0779630100',
              contact_address: data.contact_address || 'Kandy & Online Islandwide',
              social_links: typeof data.social_links === 'string' ? JSON.parse(data.social_links) : data.social_links || [],
              whatsapp_groups: typeof data.whatsapp_groups === 'string' ? JSON.parse(data.whatsapp_groups) : data.whatsapp_groups || [],
              is_active: data.is_active !== false,
              view_count: data.view_count || 0,
              created_at: data.created_at,
              updated_at: data.updated_at
            };
          }
        } catch (e) {
          console.warn('Supabase banner fetch fallback to local:', e);
        }

        // 2. Fallback to localStorage
        if (!matched) {
          const localStr = localStorage.getItem('physics_banner_landing_pages');
          if (localStr) {
            try {
              const list: BannerLandingPageData[] = JSON.parse(localStr);
              matched = list.find(p => p.slug === slug || p.id === slug) || null;
            } catch (err) {}
          }
        }

        // If not found, create a well-branded default page
        if (!matched) {
          matched = {
            id: `banner_${slug}`,
            slug: slug,
            title: `Smart Physics - ${slug.replace(/-/g, ' ').toUpperCase()}`,
            description: 'තාරක අමරසිංහ ගුරුතුමන් විසින් මෙහෙයවනු ලබන උසස් පෙළ භෞතික විද්‍යාව පන්ති සහ සම්මන්ත්‍රණ මාලාව පිළිබඳ සියලුම තොරතුරු සහ සම්බන්ධීකරණ සබැඳි මෙතැනින් ලබාගන්න.',
            teacher_name: 'තාරක අමරසිංහ (Taraka Amarasinghe)',
            contact_phone: '0779630100',
            whatsapp_number: '0779630100',
            contact_address: 'Kandy & Online Islandwide',
            is_active: true,
            view_count: 1,
            social_links: [
              { id: '1', platform: 'whatsapp', label: 'Official WhatsApp', url: 'https://wa.me/94779630100' },
              { id: '2', platform: 'youtube', label: 'Smart Physics YouTube', url: 'https://youtube.com/@smartphysics' },
              { id: '3', platform: 'telegram', label: 'Smart Physics Telegram', url: 'https://t.me/smartphysicslk' },
              { id: '4', platform: 'facebook', label: 'Facebook Page', url: 'https://facebook.com/smartphysics' }
            ],
            whatsapp_groups: [
              { id: 'g1', title: '2026 A/L Theory Official Group', description: 'අලුතෙන් එක්වන සිසුන් සඳහා නිල WhatsApp සමූහය', url: 'https://chat.whatsapp.com/demo2026' }
            ]
          };
        }

        if (isMounted && matched) {
          setPageData(matched);
          const initialViews = (matched.view_count || 0) + 1;
          setViews(initialViews);

          // Increment view count in Supabase
          try {
            await supabase
              .from('banner_landing_pages')
              .update({ view_count: initialViews, updated_at: new Date().toISOString() })
              .eq('slug', slug);
          } catch (e) {}

          // Update in localStorage
          try {
            const localStr = localStorage.getItem('physics_banner_landing_pages');
            if (localStr) {
              const list: BannerLandingPageData[] = JSON.parse(localStr);
              const updated = list.map(p => p.slug === slug ? { ...p, view_count: initialViews } : p);
              localStorage.setItem('physics_banner_landing_pages', JSON.stringify(updated));
            }
          } catch (e) {}

          emitRealtimeEvent('banner_page_viewed', { slug, views: initialViews });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadBannerPage();

    return () => {
      isMounted = false;
    };
  }, [slug, previewData]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: pageData?.title || 'Smart Physics Banner',
        text: pageData?.description || 'Smart Physics Classes by Taraka Amarasinghe',
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoHome = () => {
    if (onNavigateHome) onNavigateHome();
    else window.location.href = window.location.origin;
  };

  const isDark = theme === 'dark';

  if (loading) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} flex flex-col items-center justify-center p-6`}>
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400">ප්‍රචාරක පිටුව විවෘත වෙමින් පවතී...</p>
      </div>
    );
  }

  if (!pageData || (pageData.is_active === false && !previewData)) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} flex flex-col items-center justify-center p-6 text-center`}>
        <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-500 flex items-center justify-center mb-4 border border-amber-500/30">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-bold mb-2">මෙම ප්‍රචාරක පිටුව තාවකාලිකව අක්‍රීය කර ඇත</h2>
        <p className="text-xs text-slate-500 max-w-md mb-6">
          This promotional banner page is currently inactive or under maintenance.
        </p>
        <button
          onClick={handleGoHome}
          className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-6 py-3 rounded-2xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
        >
          ප්‍රධාන වෙබ් අඩවියට පිවිසෙන්න (Go to Home Portal)
        </button>
      </div>
    );
  }

  const phoneNum = pageData.contact_phone || '0779630100';
  const cleanPhone = phoneNum.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('0') ? '94' + cleanPhone.substring(1) : cleanPhone;

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 selection:bg-blue-600 selection:text-white ${
      isDark ? 'bg-[#0B0F19] text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      
      {/* 1. TOP HEADER WITH OFFICIAL WEBSITE LOGO & NAME */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b px-4 py-3 sm:px-6 flex justify-between items-center transition-colors ${
        isDark 
          ? 'bg-slate-900/90 border-slate-800 text-white' 
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          {/* Official Website Logo */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden bg-slate-950 p-1 flex items-center justify-center border border-blue-500/30 shadow-md shrink-0">
            <img 
              src="/logo.png" 
              alt="Smart Physics Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback icon if logo image path fails
                (e.target as HTMLElement).style.display = 'none';
              }} 
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                Smart Physics
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 uppercase">
                Official
              </span>
            </div>
            <p className={`text-xs font-bold leading-none ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {pageData.teacher_name || 'තාරක අමරසිංහ'}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Day / Night Mode Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDark 
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' 
                : 'bg-slate-100 border-slate-300 text-indigo-600 hover:bg-slate-200'
            }`}
            title={isDark ? 'දිවා මාදිලියට මාරු වන්න (Day Mode)' : 'රාත්‍රී මාදිලියට මාරු වන්න (Night Mode)'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Share Button */}
          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              isDark 
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Share this page"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-500" />
                <span className="text-emerald-500">Copied!</span>
              </>
            ) : (
              <>
                <Share2 size={14} />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          {/* Main Portal Button */}
          <button
            onClick={handleGoHome}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-3.5 py-1.5 rounded-xl shadow-md shadow-blue-600/30 transition cursor-pointer"
          >
            Web Portal
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* HERO CARD WITH TEACHER BRANDING */}
        <div className={`relative rounded-3xl p-6 sm:p-8 border shadow-xl overflow-hidden backdrop-blur-xl transition-all ${
          isDark 
            ? 'bg-gradient-to-br from-blue-950/70 via-slate-900 to-indigo-950/70 border-blue-500/30' 
            : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50/70 border-blue-200 shadow-slate-200/50'
        }`}>
          {/* Subtle Decorative Background Glows */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
            
            {/* Teacher Image */}
            <div className="relative shrink-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border-2 border-blue-500/40 shadow-xl bg-slate-900">
                <img 
                  src="/teacher.png" 
                  alt={pageData.teacher_name || 'තාරක අමරසිංහ'} 
                  className="w-full h-full object-cover object-top"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="absolute -bottom-2 -right-2 p-1.5 rounded-xl bg-blue-600 text-white shadow-md">
                <GraduationCap size={14} />
              </div>
            </div>

            {/* Title & Details */}
            <div className="flex-1 space-y-3 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black border bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
                <Sparkles size={13} className="text-amber-500" />
                <span>OFFICIAL CLASS BANNER & INVITATION</span>
              </div>

              <h1 className={`text-2xl sm:text-3xl font-black tracking-tight leading-snug ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                {pageData.title}
              </h1>

              {pageData.description && (
                <p className={`text-xs sm:text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  {pageData.description}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2 text-[11px] font-semibold">
                <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                  <BookOpen size={14} className="text-blue-500" /> 
                  <b>{pageData.teacher_name || 'තාරක අමරසිංහ'}</b>
                </span>
                
                {pageData.contact_address && (
                  <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                    <MapPin size={14} className="text-rose-500" /> 
                    <span>{pageData.contact_address}</span>
                  </span>
                )}

                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/25">
                  👁️ {views} Realtime Views
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* 3. SECTION: AVAILABLE CLASSES (FROM class_types_config TABLE) */}
        {availableClasses.length > 0 && (
          <div className={`p-5 sm:p-6 rounded-3xl border shadow-lg space-y-4 ${
            isDark 
              ? 'bg-slate-900/80 border-slate-800' 
              : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/50 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}>
                    වෙබ් අඩවියේ පවතින පන්ති වර්ග (Available Classes & Courses)
                  </h2>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    දිවයින පුරා සහ ඔන්ලයින් මෙහෙයවනු ලබන සියලුම භෞතික විද්‍යා පන්ති
                  </p>
                </div>
              </div>
            </div>

            {/* Class Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableClasses.map((cls) => (
                <div 
                  key={cls.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isDark 
                      ? 'bg-slate-950/60 border-slate-800 hover:border-purple-500/40' 
                      : 'bg-slate-50 border-slate-200 hover:border-purple-400 hover:bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className={`text-xs font-black truncate ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}>
                      {cls.class_type}
                    </h3>
                    <p className="text-[11px] font-mono font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {cls.monthly_fee > 0 ? `රු. ${cls.monthly_fee.toLocaleString()} / මාසිකව` : 'නොමිලේ (Free)'}
                    </p>
                  </div>

                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shrink-0">
                    Active Class
                  </span>
                </div>
              ))}
            </div>

            {/* MANDATORY USER NOTICE: "එම පන්තිවලට ඇතුළත් වීම සදහා කරුණා කර රෙජිස්ටර් වන්න" */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-center sm:text-left">
                <span className="text-xl shrink-0">📌</span>
                <p className={`text-xs font-extrabold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>
                  එම පන්තිවලට ඇතුළත් වීම සඳහා කරුණාකර රෙජිස්ටර් වන්න.
                </p>
              </div>

              <button
                onClick={handleGoHome}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>දැන්ම රෙජිස්ටර් වන්න (Register)</span>
                <ArrowRight size={13} />
              </button>
            </div>

          </div>
        )}

        {/* 4. SECTION: DYNAMIC WHATSAPP GROUPS (FOR NEW CLASS ATTENDEES) */}
        {pageData.whatsapp_groups && pageData.whatsapp_groups.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Users size={18} />
              </div>
              <div>
                <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}>
                  නව පන්ති සඳහා WhatsApp සමූහ (Join WhatsApp Groups)
                </h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  පන්තියට අදාළ නිවේදන සහ ලින්ක් ලබා ගැනීමට පහත සමූහයට එක්වන්න
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {pageData.whatsapp_groups.map((group) => (
                <a
                  key={group.id}
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-4 rounded-2xl border transition-all shadow-md group flex items-center justify-between gap-4 cursor-pointer ${
                    isDark 
                      ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30 hover:border-emerald-400' 
                      : 'bg-gradient-to-r from-emerald-50 via-white to-white border-emerald-200 hover:border-emerald-500 shadow-emerald-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center font-bold group-hover:scale-105 transition-transform border border-emerald-500/30 shrink-0">
                      <WhatsAppLogo className="w-7 h-7" />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-sm font-black truncate group-hover:text-emerald-500 transition-colors ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}>
                        {group.title}
                      </h3>
                      {group.description && (
                        <p className={`text-xs mt-0.5 truncate ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-black text-white bg-emerald-600 group-hover:bg-emerald-500 px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-700/30 shrink-0">
                    <span>Join Group</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 5. SECTION: REAL SOCIAL MEDIA LINKS WITH OFFICIAL LOGOS */}
        {pageData.social_links && pageData.social_links.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                {renderRealSocialLogo('website', 'w-5 h-5')}
              </div>
              <div>
                <h2 className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}>
                  සමාජ මාධ්‍ය සහ සම්බන්ධීකරණය (Official Social Channels)
                </h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Smart Physics නිල සමාජ මාධ්‍ය නාලිකා ඔස්සේ අප හා එක්වන්න
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pageData.social_links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-2xl border transition-all shadow-sm flex items-center justify-between gap-3 group cursor-pointer ${
                    isDark 
                      ? 'bg-slate-900/90 border-slate-800 hover:border-blue-500/40' 
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1">
                      {renderRealSocialLogo(link.platform, 'w-8 h-8')}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-black truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}>
                        {link.label}
                      </p>
                      <p className={`text-[10px] truncate font-mono uppercase font-bold ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {link.platform}
                      </p>
                    </div>
                  </div>
                  <ExternalLink size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 6. SUPPORT & DIRECT CALL CARD */}
        <div className={`p-5 sm:p-6 rounded-3xl border shadow-lg space-y-4 ${
          isDark 
            ? 'bg-slate-900/80 border-slate-800' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className={`text-sm font-black flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <Phone size={16} className="text-amber-500" />
                <span>විමසීම් සහ සහාය (Support Hotline)</span>
              </h3>
              <p className={`text-xs mt-0.5 ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}>
                Smart Physics කාර්යාලය සහ සහායක කණ්ඩායම: <b>{phoneNum}</b>
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <a
                href={`tel:${cleanPhone}`}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs border transition ${
                  isDark 
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                }`}
              >
                {renderRealSocialLogo('call', 'w-4 h-4')}
                <span>Call Hotline</span>
              </a>
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-lg shadow-emerald-700/30"
              >
                <WhatsAppLogo className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        {/* 7. REGISTRATION CALL TO ACTION CARD */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="text-base sm:text-lg font-black leading-tight">
              පන්ති සඳහා ලියාපදිංචි වන්න (Join Smart Physics)
            </h3>
            <p className="text-xs text-blue-100 mt-1 max-w-lg leading-relaxed">
              Smart Physics Student Web Portal හරහා ඔබගේ ගිණුම සාදාගෙන පන්ති සඳහා සම්බන්ධ වන්න. සජීවී පන්ති, පසුගිය විභාග සහ සියලුම ටියුට්ස් පහසුවෙන් ලබාගන්න.
            </p>
          </div>
          <button
            onClick={handleGoHome}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white text-blue-800 font-black text-xs hover:bg-blue-50 transition shadow-xl shrink-0 cursor-pointer"
          >
            Register on Portal Now
          </button>
        </div>

      </main>

      {/* FOOTER */}
      <footer className={`border-t py-6 px-4 text-center text-xs space-y-2 mt-8 transition-colors ${
        isDark 
          ? 'bg-slate-950 border-slate-800/80 text-slate-400' 
          : 'bg-slate-100 border-slate-200 text-slate-600'
      }`}>
        <div className="flex flex-wrap items-center justify-center gap-3 font-bold text-blue-600 dark:text-blue-400">
          <span>Hotline: {phoneNum}</span>
          <span>•</span>
          <a href={`tel:${cleanPhone}`} className="hover:underline">Direct Call</a>
          <span>•</span>
          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp Support</a>
        </div>
        <div className="font-semibold text-slate-500">
          🏛️ Smart Physics | Taraka Amarasinghe | Powered by Amarasinghe Digital
        </div>
      </footer>

    </div>
  );
}
