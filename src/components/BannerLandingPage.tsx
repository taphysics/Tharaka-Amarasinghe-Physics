import React, { useEffect, useState } from 'react';
import { 
  Phone, 
  MessageCircle, 
  Globe, 
  Share2, 
  Check, 
  ExternalLink, 
  Users, 
  Sparkles, 
  Calendar, 
  MapPin, 
  ArrowRight,
  ShieldCheck,
  Send,
  Video,
  BookOpen
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent } from '../realtimeSync';

export interface SocialLinkItem {
  id: string;
  platform: string; // 'whatsapp' | 'telegram' | 'youtube' | 'facebook' | 'tiktok' | 'instagram' | 'twitter' | 'linkedin' | 'website' | 'call'
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

interface BannerLandingPageProps {
  slug: string;
  onNavigateHome?: () => void;
}

export default function BannerLandingPage({ slug, onNavigateHome }: BannerLandingPageProps) {
  const [pageData, setPageData] = useState<BannerLandingPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [views, setViews] = useState<number>(0);

  useEffect(() => {
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
              ...data,
              social_links: typeof data.social_links === 'string' ? JSON.parse(data.social_links) : data.social_links || [],
              whatsapp_groups: typeof data.whatsapp_groups === 'string' ? JSON.parse(data.whatsapp_groups) : data.whatsapp_groups || []
            };
          }
        } catch (e) {
          console.warn('Supabase fetch failed, checking localStorage fallback', e);
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

        // If not found in either, provide default sample matching slug
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
              { id: '2', platform: 'youtube', label: 'YouTube Channel', url: 'https://youtube.com/@smartphysics' },
              { id: '3', platform: 'telegram', label: 'Telegram Channel', url: 'https://t.me/smartphysicslk' },
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

          // Increment view count in background
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
  }, [slug]);

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

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    switch (p) {
      case 'whatsapp':
        return {
          icon: <MessageCircle size={20} className="text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-400',
          textColor: 'text-emerald-400',
          name: 'WhatsApp'
        };
      case 'telegram':
        return {
          icon: <Send size={20} className="text-sky-400" />,
          bg: 'bg-sky-500/10 border-sky-500/25 hover:border-sky-400',
          textColor: 'text-sky-400',
          name: 'Telegram'
        };
      case 'youtube':
        return {
          icon: <Video size={20} className="text-rose-400" />,
          bg: 'bg-rose-500/10 border-rose-500/25 hover:border-rose-400',
          textColor: 'text-rose-400',
          name: 'YouTube'
        };
      case 'facebook':
        return {
          icon: <Globe size={20} className="text-blue-400" />,
          bg: 'bg-blue-500/10 border-blue-500/25 hover:border-blue-400',
          textColor: 'text-blue-400',
          name: 'Facebook'
        };
      case 'tiktok':
        return {
          icon: <Sparkles size={20} className="text-fuchsia-400" />,
          bg: 'bg-fuchsia-500/10 border-fuchsia-500/25 hover:border-fuchsia-400',
          textColor: 'text-fuchsia-400',
          name: 'TikTok'
        };
      case 'instagram':
        return {
          icon: <Sparkles size={20} className="text-pink-400" />,
          bg: 'bg-pink-500/10 border-pink-500/25 hover:border-pink-400',
          textColor: 'text-pink-400',
          name: 'Instagram'
        };
      case 'call':
      case 'phone':
        return {
          icon: <Phone size={20} className="text-amber-400" />,
          bg: 'bg-amber-500/10 border-amber-500/25 hover:border-amber-400',
          textColor: 'text-amber-400',
          name: 'Direct Call'
        };
      default:
        return {
          icon: <Globe size={20} className="text-indigo-400" />,
          bg: 'bg-indigo-500/10 border-indigo-500/25 hover:border-indigo-400',
          textColor: 'text-indigo-400',
          name: 'Website'
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-400">පිටුව විවෘත වෙමින් පවතී...</p>
      </div>
    );
  }

  if (!pageData || pageData.is_active === false) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 border border-amber-500/30">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-bold mb-2">මෙම ප්‍රචාරක පිටුව තාවකාලිකව අක්‍රීය කර ඇත</h2>
        <p className="text-xs text-slate-400 max-w-md mb-6">
          This promotional banner page is currently inactive or under maintenance.
        </p>
        <button
          onClick={() => {
            if (onNavigateHome) onNavigateHome();
            else window.location.href = window.location.origin;
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-2xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
        >
          ප්‍රධාන වෙබ් අඩවියට පිවිසෙන්න (Go to Home)
        </button>
      </div>
    );
  }

  const phoneNum = pageData.contact_phone || '0779630100';
  const cleanPhone = phoneNum.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('0') ? '94' + cleanPhone.substring(1) : cleanPhone;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Floating Glass Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/80 border-b border-slate-800/80 px-4 py-3 sm:px-6 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md font-display text-base">
            Ω
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-tight">
              Smart Physics
            </h1>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
              {pageData.teacher_name || 'තාරක අමරසිංහ'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer"
            title="Share this page"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Share2 size={14} />
                <span>Share</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              if (onNavigateHome) onNavigateHome();
              else window.location.href = window.location.origin;
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition cursor-pointer"
          >
            Web Portal
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        
        {/* Hero Card */}
        <div className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-blue-900/80 via-slate-900 to-indigo-950/80 border border-blue-500/30 shadow-2xl overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold">
              <Sparkles size={13} className="text-amber-400" />
              <span>OFFICIAL CLASS PORTAL</span>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-snug">
              {pageData.title}
            </h1>

            {pageData.description && (
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                {pageData.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1 text-slate-300">
                <BookOpen size={13} className="text-blue-400" /> {pageData.teacher_name || 'තාරක අමරසිංහ'}
              </span>
              {pageData.contact_address && (
                <span className="flex items-center gap-1 text-slate-300">
                  <MapPin size={13} className="text-rose-400" /> {pageData.contact_address}
                </span>
              )}
              <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                👁️ {views} Views
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp Class Groups Section (High Priority for New Class Attendees) */}
        {pageData.whatsapp_groups && pageData.whatsapp_groups.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Users size={16} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                නව පන්ති සඳහා WhatsApp සමූහ (Join WhatsApp Groups)
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {pageData.whatsapp_groups.map((group) => (
                <a
                  key={group.id}
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 hover:border-emerald-400 transition-all shadow-md group flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold group-hover:scale-105 transition-transform border border-emerald-500/30">
                      <MessageCircle size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-white group-hover:text-emerald-300 transition-colors">
                        {group.title}
                      </h3>
                      {group.description && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 group-hover:bg-emerald-500 px-3.5 py-2 rounded-xl transition shadow-lg shrink-0">
                    <span>Join Group</span>
                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Social Media Links Section */}
        {pageData.social_links && pageData.social_links.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                <Globe size={16} />
              </div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                සමාජ මාධ්‍ය සහ සම්බන්ධීකරණය (Social Channels & Links)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pageData.social_links.map((link) => {
                const conf = getPlatformIcon(link.platform);
                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-3.5 rounded-2xl border ${conf.bg} transition-all shadow-sm flex items-center justify-between gap-3 group cursor-pointer`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                        {conf.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-blue-300 transition-colors">
                          {link.label || conf.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate font-mono">
                          {conf.name}
                        </p>
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-slate-500 group-hover:text-white transition-colors shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Contact & Action Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Phone size={15} className="text-amber-400" />
                <span>විමසීම් සහ සහාය (Support Hotline)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Smart Physics Support Team: {phoneNum}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <a
                href={`tel:${cleanPhone}`}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
              >
                <Phone size={14} className="text-amber-400" />
                <span>Call Hotline</span>
              </a>
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/30"
              >
                <MessageCircle size={14} />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        {/* Register CTA Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <h3 className="text-base font-extrabold">පන්ති සඳහා ලියාපදිංචි වන්න</h3>
            <p className="text-xs text-blue-100 mt-1">
              Smart Physics Student Web Portal හරහා ඔබගේ ගිණුම සාදාගෙන සියලුම පන්ති සඳහා සම්බන්ධ වන්න.
            </p>
          </div>
          <button
            onClick={() => {
              if (onNavigateHome) onNavigateHome();
              else window.location.href = window.location.origin;
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white text-blue-700 font-extrabold text-xs hover:bg-blue-50 transition shadow-lg shrink-0 cursor-pointer"
          >
            Register on Portal
          </button>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-4 mt-8 text-center text-xs space-y-2 bg-slate-950/80">
        <div className="flex items-center justify-center gap-3 text-blue-400 font-bold">
          <span>Contact: Smart Physics Support Team - 0779630100</span>
          <a href={`tel:${cleanPhone}`} className="hover:underline">Call</a>
          <span>•</span>
          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp</a>
        </div>
        <div className="text-slate-400 font-semibold">
          🏛️ Powered by Amarasinghe Digital
        </div>
      </footer>
    </div>
  );
}
