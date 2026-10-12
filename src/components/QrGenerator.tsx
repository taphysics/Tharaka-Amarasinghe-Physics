import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { 
  QrCode, 
  Download, 
  Copy, 
  Check, 
  Trash2, 
  ExternalLink, 
  Plus, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Globe, 
  Share2, 
  Sparkles, 
  Edit3, 
  Lock, 
  Phone,
  Users,
  FileText,
  MessageCircle,
  Sun,
  Moon,
  Smartphone,
  Maximize2,
  X
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '../realtimeSync';
import SecurityPasswordModal from './SecurityPasswordModal';
import BannerLandingPage, { BannerLandingPageData, SocialLinkItem, WhatsAppGroupItem } from './BannerLandingPage';

const SOCIAL_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', placeholder: 'https://wa.me/94779630100' },
  { id: 'telegram', label: 'Telegram', icon: '✈️', placeholder: 'https://t.me/smartphysicslk' },
  { id: 'youtube', label: 'YouTube', icon: '▶️', placeholder: 'https://youtube.com/@smartphysics' },
  { id: 'facebook', label: 'Facebook', icon: '🌐', placeholder: 'https://facebook.com/smartphysics' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', placeholder: 'https://tiktok.com/@smartphysics' },
  { id: 'instagram', label: 'Instagram', icon: '📷', placeholder: 'https://instagram.com/smartphysics' },
  { id: 'twitter', label: 'Twitter / X', icon: '🐦', placeholder: 'https://x.com/smartphysics' },
  { id: 'website', label: 'Official Website', icon: '🔗', placeholder: 'https://physics.lk' },
  { id: 'call', label: 'Direct Call / Hotline', icon: '📞', placeholder: 'tel:0779630100' },
];

export default function QrGenerator() {
  const [pages, setPages] = useState<BannerLandingPageData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [teacherName, setTeacherName] = useState('තාරක අමරසිංහ (Taraka Amarasinghe)');
  const [contactPhone, setContactPhone] = useState('0779630100');
  const [contactAddress, setContactAddress] = useState('Kandy & Online Islandwide');
  const [isActive, setIsActive] = useState(true);

  // Social Links Builder
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState('whatsapp');
  const [socialUrl, setSocialUrl] = useState('');
  const [socialCustomLabel, setSocialCustomLabel] = useState('');

  // WhatsApp Groups Builder
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroupItem[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupUrl, setGroupUrl] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  // UI States
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<BannerLandingPageData | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'page' | 'qr'>('page');
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

  // Delete Security Modal
  const [deleteTarget, setDeleteTarget] = useState<BannerLandingPageData | null>(null);

  // Helper to validate UUID
  const isUuid = (str?: string) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  // Fetch all pages
  const fetchPages = async () => {
    try {
      // 1. Supabase
      const { data, error } = await supabase
        .from('banner_landing_pages')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const parsed: BannerLandingPageData[] = data.map((d: any) => ({
          id: d.id,
          slug: d.slug,
          title: d.title || '',
          description: d.description || '',
          teacher_name: d.teacher_name || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
          contact_phone: d.contact_phone || '0779630100',
          whatsapp_number: d.whatsapp_number || d.contact_phone || '0779630100',
          contact_address: d.contact_address || 'Kandy & Online Islandwide',
          banner_image: d.banner_image || '',
          social_links: typeof d.social_links === 'string' ? JSON.parse(d.social_links) : d.social_links || [],
          whatsapp_groups: typeof d.whatsapp_groups === 'string' ? JSON.parse(d.whatsapp_groups) : d.whatsapp_groups || [],
          is_active: d.is_active !== false,
          view_count: d.view_count || 0,
          created_at: d.created_at,
          updated_at: d.updated_at
        }));
        setPages(parsed);
        localStorage.setItem('physics_banner_landing_pages', JSON.stringify(parsed));
        return;
      }
    } catch (e) {
      console.warn('Failed to load from Supabase:', e);
    }

    // 2. LocalStorage Fallback
    const local = localStorage.getItem('physics_banner_landing_pages');
    if (local) {
      try {
        setPages(JSON.parse(local));
      } catch (e) {}
    } else {
      // Default Seed Page
      const samplePage: BannerLandingPageData = {
        id: 'banner_seed_1',
        slug: '2026-theory-physical',
        title: '2026 A/L Theory Physical Class - Kandy',
        description: 'තාරක අමරසිංහ සර්ගේ 2026 සිද්ධාන්ත පන්තිය සඳහා සම්බන්ධ වීමට QR කේතය ස්කෑන් කර හෝ මෙතැනින් නව WhatsApp සමූහයට එක්වන්න.',
        teacher_name: 'තාරක අමරසිංහ (Taraka Amarasinghe)',
        contact_phone: '0779630100',
        whatsapp_number: '0779630100',
        contact_address: 'Kandy & Online Islandwide',
        social_links: [
          { id: '1', platform: 'whatsapp', label: 'Official WhatsApp', url: 'https://wa.me/94779630100' },
          { id: '2', platform: 'youtube', label: 'Smart Physics YouTube', url: 'https://youtube.com/@smartphysics' },
          { id: '3', platform: 'telegram', label: 'Smart Physics Telegram', url: 'https://t.me/smartphysicslk' },
          { id: '4', platform: 'facebook', label: 'Facebook Page', url: 'https://facebook.com/smartphysics' }
        ],
        whatsapp_groups: [
          { id: 'g1', title: '2026 Theory Kandy Group 01', description: 'අලුතෙන් එක්වන සිසුන් සඳහා නිල WhatsApp සමූහය', url: 'https://chat.whatsapp.com/demo2026' }
        ],
        is_active: true,
        view_count: 48,
        created_at: new Date().toISOString()
      };
      setPages([samplePage]);
      localStorage.setItem('physics_banner_landing_pages', JSON.stringify([samplePage]));
    }
  };

  useEffect(() => {
    fetchPages().finally(() => setLoading(false));

    // Live continuous sync interval (every 3 seconds for 100% accurate view counter sync)
    const interval = setInterval(() => {
      fetchPages();
    }, 3000);

    // Subscribe to realtime broadcast events
    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'banner_page_viewed' || type === 'banner_page_updated') {
        fetchPages();
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  // Auto-generate slug from title if slug not manually changed
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!editingId && !slug) {
      const generated = val
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generated);
    }
  };

  // Add Social Link
  const handleAddSocialLink = () => {
    if (!socialUrl.trim()) return;
    const platformDef = SOCIAL_PLATFORMS.find(p => p.id === selectedPlatform);
    const newLink: SocialLinkItem = {
      id: `soc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      platform: selectedPlatform,
      label: socialCustomLabel.trim() || platformDef?.label || selectedPlatform,
      url: socialUrl.trim()
    };
    setSocialLinks(prev => [...prev, newLink]);
    setSocialUrl('');
    setSocialCustomLabel('');
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks(prev => prev.filter(l => l.id !== id));
  };

  // Add WhatsApp Group
  const handleAddWhatsAppGroup = () => {
    if (!groupTitle.trim() || !groupUrl.trim()) return;
    const newGroup: WhatsAppGroupItem = {
      id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: groupTitle.trim(),
      description: groupDesc.trim(),
      url: groupUrl.trim()
    };
    setWhatsappGroups(prev => [...prev, newGroup]);
    setGroupTitle('');
    setGroupUrl('');
    setGroupDesc('');
  };

  const handleRemoveWhatsAppGroup = (id: string) => {
    setWhatsappGroups(prev => prev.filter(g => g.id !== id));
  };

  // Reset form
  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSlug('');
    setDescription('');
    setTeacherName('තාරක අමරසිංහ (Taraka Amarasinghe)');
    setContactPhone('0779630100');
    setContactAddress('Kandy & Online Islandwide');
    setIsActive(true);
    setSocialLinks([]);
    setWhatsappGroups([]);
  };

  // Load into editor
  const handleEdit = (p: BannerLandingPageData) => {
    setEditingId(p.id);
    setTitle(p.title);
    setSlug(p.slug);
    setDescription(p.description || '');
    setTeacherName(p.teacher_name || 'තාරක අමරසිංහ (Taraka Amarasinghe)');
    setContactPhone(p.contact_phone || '0779630100');
    setContactAddress(p.contact_address || '');
    setIsActive(p.is_active);
    setSocialLinks(p.social_links || []);
    setWhatsappGroups(p.whatsapp_groups || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save or Create Page
  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      alert('කරුණාකර පේජ් එකේ නම සහ Slug එක ඇතුළත් කරන්න.');
      return;
    }

    const cleanSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^\w-]/g, '-');

    // Ensure valid UUID for the database record (since banner_landing_pages.id is uuid NOT NULL)
    const targetUuid = (editingId && isUuid(editingId))
      ? editingId
      : (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }));

    const pagePayload: BannerLandingPageData = {
      id: targetUuid,
      slug: cleanSlug,
      title: title.trim(),
      description: description.trim(),
      teacher_name: teacherName.trim() || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
      contact_phone: contactPhone.trim() || '0779630100',
      whatsapp_number: contactPhone.trim() || '0779630100',
      contact_address: contactAddress.trim() || 'Kandy & Online Islandwide',
      social_links: socialLinks,
      whatsapp_groups: whatsappGroups,
      is_active: isActive,
      view_count: editingId ? (pages.find(p => p.id === editingId || p.slug === cleanSlug)?.view_count || 0) : 0,
      updated_at: new Date().toISOString()
    };

    // Save to Supabase matching EXACT existing columns of banner_landing_pages table
    let savedToDb = false;
    let dbErrorMsg = '';

    const dbRecord: any = {
      id: targetUuid,
      slug: cleanSlug,
      title: title.trim(),
      description: description.trim(),
      teacher_name: teacherName.trim() || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
      contact_phone: contactPhone.trim() || '0779630100',
      whatsapp_number: contactPhone.trim() || '0779630100',
      contact_address: contactAddress.trim() || 'Kandy & Online Islandwide',
      banner_image: '',
      social_links: socialLinks,
      whatsapp_groups: whatsappGroups,
      is_active: isActive,
      view_count: pagePayload.view_count,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('banner_landing_pages')
        .upsert(dbRecord, { onConflict: 'slug' })
        .select();

      if (!error) {
        savedToDb = true;
        if (data && data[0]?.id) {
          pagePayload.id = data[0].id;
        }
      } else {
        console.warn('Supabase upsert failed:', error.message);
        dbErrorMsg = error.message;
      }
    } catch (e: any) {
      console.warn('Supabase upsert failed:', e);
      dbErrorMsg = e?.message || 'Network exception';
    }

    // Save to localStorage as well
    const existing = pages.filter(p => p.id !== pagePayload.id && p.slug !== pagePayload.slug);
    const updatedList = [pagePayload, ...existing];
    setPages(updatedList);
    localStorage.setItem('physics_banner_landing_pages', JSON.stringify(updatedList));

    emitRealtimeEvent('banner_page_updated', { slug: pagePayload.slug });
    await fetchPages();
    resetForm();

    if (savedToDb) {
      alert('✅ ප්‍රචාරක බැනර් පිටුව සාර්ථකව Supabase ඩේටාබේස් එකට ඇතුළත් කර පබ්ලික් කරන ලදී! පහතින් QR Code එක Download කරගන්න.');
    } else {
      alert(`⚠️ බැනර් පිටුව LocalStorage වෙත සුරැකිණි. Supabase සටහන: ${dbErrorMsg || 'වගුව පරීක්ෂා කරන්න'}\nපහතින් QR Code එක ලබාගත හැක.`);
    }
  };

  // Toggle page enable/disable status
  const handleToggleActive = async (p: BannerLandingPageData) => {
    const updatedStatus = !p.is_active;
    try {
      await supabase
        .from('banner_landing_pages')
        .update({ 
          is_active: updatedStatus,
          updated_at: new Date().toISOString() 
        })
        .eq('slug', p.slug);
    } catch (e) {
      console.warn('Supabase toggle failed:', e);
    }

    const updated = pages.map(item => item.id === p.id ? { ...item, is_active: updatedStatus } : item);
    setPages(updated);
    localStorage.setItem('physics_banner_landing_pages', JSON.stringify(updated));
    emitRealtimeEvent('banner_page_updated', { slug: p.slug });
  };

  // Confirm delete with password
  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      await supabase
        .from('banner_landing_pages')
        .delete()
        .eq('slug', deleteTarget.slug);
    } catch (e) {}

    const updated = pages.filter(item => item.id !== deleteTarget.id && item.slug !== deleteTarget.slug);
    setPages(updated);
    localStorage.setItem('physics_banner_landing_pages', JSON.stringify(updated));
    emitRealtimeEvent('banner_page_updated', { slug: deleteTarget.slug });
    setDeleteTarget(null);
  };

  // Generate full public URL
  const getPublicUrl = (pSlug: string) => {
    const origin = window.location.origin;
    return `${origin}?b=${pSlug}`;
  };

  // Copy Link
  const handleCopyLink = (pSlug: string) => {
    const fullUrl = getPublicUrl(pSlug);
    navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(pSlug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  // Universal Bulletproof QR Downloader (1024x1024 High Resolution PNG & Scalable SVG Vector)
  const downloadQrImage = async (elementId: string, filename: string, format: 'png' | 'svg') => {
    try {
      const container = document.getElementById(elementId);
      if (!container) {
        alert('QR කේතය සොයාගත නොහැකි විය.');
        return;
      }

      const svgEl = container.tagName.toLowerCase() === 'svg' 
        ? container 
        : container.querySelector('svg');

      if (!svgEl) {
        alert('QR SVG මූලද්‍රව්‍යය සොයාගත නොහැකි විය.');
        return;
      }

      // Clone SVG and configure clean dimensions & background
      const clone = svgEl.cloneNode(true) as SVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', '1024');
      clone.setAttribute('height', '1024');

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clone);
      if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      if (format === 'svg') {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }

      // PNG Format with High-Resolution 1024x1024 Canvas
      const canvas = document.createElement('canvas');
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      // Solid white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);

      // Base64 Data URL avoids browser cross-origin or blob revocation issues
      const base64Data = btoa(unescape(encodeURIComponent(svgString)));
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const padding = 60; // Clean margin for physical print scanners
        ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);

        try {
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `${filename}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${filename}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
          }, 'image/png');
        }
      };

      img.onerror = () => {
        // Fallback to SVG if canvas rasterization fails
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };

      img.src = `data:image/svg+xml;base64,${base64Data}`;
    } catch (e: any) {
      console.error('Error generating QR image:', e);
      alert('QR කේතය බාගත කිරීමේදී දෝෂයක්: ' + (e.message || ''));
    }
  };

  const handleDownloadPng = (p: BannerLandingPageData) => {
    downloadQrImage(`qr-svg-${p.id}`, `QR_${p.slug}_Banner_Print_1024px`, 'png');
  };

  const handleDownloadSvg = (p: BannerLandingPageData) => {
    downloadQrImage(`qr-svg-${p.id}`, `QR_${p.slug}_Vector_Banner`, 'svg');
  };

  const currentPreviewUrl = slug.trim() ? getPublicUrl(slug.trim()) : `${window.location.origin}?b=preview`;

  const livePreviewData: BannerLandingPageData = {
    id: editingId || 'preview_id',
    slug: slug.trim() || 'preview',
    title: title.trim() || '2026 A/L Physics Theory & Revision Class',
    description: description.trim() || 'තාරක අමරසිංහ සර් විසින් මෙහෙයවනු ලබන දිවයිනේ ප්‍රමුඛතම භෞතික විද්‍යා පන්තියට සම්බන්ධ වීමට පහත WhatsApp සමූහයට එක්වන්න.',
    teacher_name: teacherName.trim() || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
    contact_phone: contactPhone.trim() || '0779630100',
    whatsapp_number: contactPhone.trim() || '0779630100',
    contact_address: contactAddress.trim() || 'Kandy & Online Islandwide',
    social_links: socialLinks.length > 0 ? socialLinks : [
      { id: '1', platform: 'whatsapp', label: 'Official WhatsApp', url: 'https://wa.me/94779630100' },
      { id: '2', platform: 'youtube', label: 'Smart Physics YouTube', url: 'https://youtube.com/@smartphysics' },
      { id: '3', platform: 'telegram', label: 'Smart Physics Telegram', url: 'https://t.me/smartphysicslk' },
      { id: '4', platform: 'facebook', label: 'Facebook Page', url: 'https://facebook.com/smartphysics' }
    ],
    whatsapp_groups: whatsappGroups.length > 0 ? whatsappGroups : [
      { id: 'g1', title: '2026 A/L Theory Official Group', description: 'අලුතෙන් එක්වන සිසුන් සඳහා නිල WhatsApp සමූහය', url: 'https://chat.whatsapp.com/demo2026' }
    ],
    is_active: isActive,
    view_count: editingId ? (pages.find(p => p.id === editingId || p.slug === slug)?.view_count || 1) : 1,
    created_at: new Date().toISOString()
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* Hidden fixed QR element to always ensure DOM rendering for downloadQrImage */}
      <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '512px', height: '512px', pointerEvents: 'none', opacity: 0 }}>
        <div id="qr-svg-preview">
          <QRCode
            value={currentPreviewUrl}
            size={512}
            viewBox="0 0 256 256"
          />
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/60 via-slate-900 to-indigo-900/60 border border-blue-500/30 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold mb-2">
            <QrCode size={14} className="text-amber-400" />
            <span>PHYSICAL PRINT BANNERS & LANDING PAGES STUDIO</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white font-display">
            ප්‍රචාරක බැනර් සඳහා QR & ලෑන්ඩින් පේජ් පද්ධතිය
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1 leading-relaxed">
            පිසිකල් ප්‍රින්ට් කරන බැනර් සඳහා QR කේත සාදා, ස්කෑන් කළ විට විවෘත වන ප්‍රොෆෙෂනල් පිටුවක්, WhatsApp Groups, සමාජ මාධ්‍ය සබැඳි සහ 100% ක් නිවැරදි සජීවී View Count පෙන්වන ස්වාධීන පද්ධතිය.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchPages}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-bold border border-blue-500/30 transition cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Sync Realtime (1s)</span>
          </button>
        </div>
      </div>

      {/* Grid: Left = Create/Edit Form, Right = Real-Time Live Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* FORM CONTAINER (7 cols on xl) */}
        <div className="xl:col-span-7 bg-slate-800/40 border border-slate-700/60 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl backdrop-blur-sm">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <Sparkles size={18} className="text-blue-400" />
              <span>{editingId ? 'ප්‍රචාරක පිටුව සංස්කරණය (Edit Page)' : 'නව ප්‍රචාරක පිටුවක් සහ QR එකක් සෑදීම (Create New)'}</span>
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold"
              >
                අවලංගු කරන්න (Cancel Edit)
              </button>
            )}
          </div>

          <form onSubmit={handleSavePage} className="space-y-5">
            
            {/* Title & Slug */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">
                  පිටුවේ නම (Page Title) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026 Theory Physical Class - Kandy"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">
                  URL Slug (අද්විතීය ලින්ක් නාමය) *
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-500 text-xs font-mono">?b=</span>
                  <input
                    type="text"
                    required
                    placeholder="2026-theory-kandy"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^\w-]/g, '-'))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">
                විස්තරය (Page Description / Note)
              </label>
              <textarea
                rows={2}
                placeholder="පන්තිය ආරම්භ වන දිනය, වේලාව, ස්ථානය සහ විශේෂ කරුණු..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Teacher Branding & Contact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">ගුරු නාමය (Teacher)</label>
                <input
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">දුරකථන අංකය (Hotline)</label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">පන්ති ස්ථානය (Location / Address)</label>
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* --- SECTION: DYNAMIC WHATSAPP GROUPS (For New Class Attendees) --- */}
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Users size={15} />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    WhatsApp සමූහ එක් කිරීම (WhatsApp Groups for New Students)
                  </h4>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  {whatsappGroups.length} Groups Added
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="Group Name (e.g. 2026 Theory Group 01)"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  className="md:col-span-4 px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Invite Link (https://chat.whatsapp.com/...)"
                  value={groupUrl}
                  onChange={(e) => setGroupUrl(e.target.value)}
                  className="md:col-span-5 px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddWhatsAppGroup}
                  disabled={!groupTitle || !groupUrl}
                  className="md:col-span-3 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus size={14} /> Add Group
                </button>
              </div>

              {/* Added WhatsApp groups list */}
              {whatsappGroups.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  {whatsappGroups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageCircle size={14} className="text-emerald-400 shrink-0" />
                        <span className="font-bold text-white truncate">{g.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">{g.url}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveWhatsAppGroup(g.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* --- SECTION: DYNAMIC SOCIAL MEDIA LINKS --- */}
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-blue-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-blue-500/20 text-blue-400">
                    <Globe size={15} />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    සමාජ මාධ්‍ය සබැඳි එක් කිරීම (Social Media Links with Logos)
                  </h4>
                </div>
                <span className="text-[10px] text-blue-400 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-md">
                  {socialLinks.length} Links Added
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="md:col-span-3 px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                >
                  {SOCIAL_PLATFORMS.map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Display Label (Optional)"
                  value={socialCustomLabel}
                  onChange={(e) => setSocialCustomLabel(e.target.value)}
                  className="md:col-span-3 px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />

                <input
                  type="text"
                  placeholder={SOCIAL_PLATFORMS.find(p => p.id === selectedPlatform)?.placeholder || 'URL'}
                  value={socialUrl}
                  onChange={(e) => setSocialUrl(e.target.value)}
                  className="md:col-span-4 px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleAddSocialLink}
                  disabled={!socialUrl}
                  className="md:col-span-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus size={14} /> Add Link
                </button>
              </div>

              {/* Added Social Links */}
              {socialLinks.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  {socialLinks.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{SOCIAL_PLATFORMS.find(p => p.id === item.platform)?.icon || '🔗'}</span>
                        <span className="font-bold text-white truncate">{item.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]">{item.url}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSocialLink(item.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Toggle & Submit */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-800 cursor-pointer"
                />
                <span>පිටුව සක්‍රීයව තබන්න (Publish Immediately)</span>
              </label>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={15} />
                  <span>{editingId ? 'වෙනස්කම් සුරකින්න (Update Page)' : 'පබ්ලික් කර QR කේතය සාදන්න (Publish & Generate QR)'}</span>
                </button>
              </div>
            </div>

          </form>
        </div>

        {/* REAL-TIME LIVE PREVIEW & QR STUDIO (5 cols on xl) */}
        <div className="xl:col-span-5 bg-slate-800/40 border border-slate-700/60 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl backdrop-blur-sm sticky top-4">
          
          {/* Header with Mode Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5 font-display">
                  <span>Real-Time Live Preview</span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ස්වයංක්‍රීයව යාවත්කාලීන වන පිටු පෙරදසුන සහ QR කේතය
              </p>
            </div>

            {/* Tab Selector: Live Page vs Print QR */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setActivePreviewTab('page')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activePreviewTab === 'page'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone size={13} />
                <span>📱 Live Page</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewTab('qr')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activePreviewTab === 'qr'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode size={13} />
                <span>🔲 Print QR</span>
              </button>
            </div>
          </div>

          {/* TAB 1: REAL-TIME LIVE PAGE PREVIEW */}
          {activePreviewTab === 'page' && (
            <div className="space-y-4">
              
              {/* Preview Control Bar: Day/Night Toggle & Fullscreen */}
              <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px] font-bold">Theme Mode:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewTheme(t => t === 'dark' ? 'light' : 'dark')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border transition cursor-pointer ${
                      previewTheme === 'dark'
                        ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                        : 'bg-white text-indigo-700 border-slate-300 shadow-sm hover:bg-slate-50'
                    }`}
                    title="දිවා / රාත්‍රී මාදිලිය මාරු කර Text පැහැදිලි බව පරීක්ෂා කරන්න"
                  >
                    {previewTheme === 'dark' ? <Moon size={13} className="text-amber-400" /> : <Sun size={13} className="text-amber-500" />}
                    <span>{previewTheme === 'dark' ? '🌙 Night Mode' : '☀️ Day Mode'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewPage(livePreviewData)}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold transition cursor-pointer"
                    title="විශාල තිරයකින් පෙරදසුන බලන්න"
                  >
                    <Maximize2 size={13} />
                    <span>Fullscreen</span>
                  </button>
                  <a
                    href={currentPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold transition"
                    title="නව Tab එකකින් විවෘත කරන්න"
                  >
                    <ExternalLink size={13} />
                    <span>Open URL</span>
                  </a>
                </div>
              </div>

              {/* Realistic Scrollable Device Viewport Mockup */}
              <div className="relative rounded-2xl border-2 border-slate-700/80 bg-slate-950 shadow-2xl overflow-hidden">
                {/* Device Status Header */}
                <div className="bg-slate-900/95 px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="font-mono font-bold text-slate-300">LIVE PREVIEW</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                    ?b={slug || 'preview'}
                  </span>
                </div>

                {/* Scrollable Viewport with Real-Time Live Component Rendering */}
                <div className="max-h-[500px] overflow-y-auto overscroll-contain">
                  <BannerLandingPage
                    slug={slug || 'preview'}
                    previewData={livePreviewData}
                    forceTheme={previewTheme}
                  />
                </div>
              </div>

              {/* Quick Actions Row under Live Page */}
              <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 p-1 bg-white rounded-lg shrink-0 border border-slate-300">
                    <QRCode value={currentPreviewUrl} size={32} style={{ width: '100%', height: '100%' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{title || 'Smart Physics Banner'}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{currentPreviewUrl}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadQrImage('qr-svg-preview', `QR_${slug || 'Banner'}_Print_1024px`, 'png')}
                    className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                    title="Download 1024x1024 High-Resolution PNG"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadQrImage('qr-svg-preview', `QR_${slug || 'Banner'}_Vector`, 'svg')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer"
                    title="Download Scalable Vector SVG"
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(slug || 'preview')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer"
                    title="Copy Page Link"
                  >
                    {copiedSlug === (slug || 'preview') ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: PRINT QR CODE VIEW */}
          {activePreviewTab === 'qr' && (
            <div className="space-y-4 text-center py-2">
              <div className="p-6 bg-white rounded-2xl shadow-xl inline-block mx-auto border-4 border-slate-200">
                <div>
                  <QRCode
                    value={currentPreviewUrl}
                    size={200}
                    style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                    viewBox="0 0 256 256"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-white truncate">
                  {title || 'Smart Physics Print Banner'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {currentPreviewUrl}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => downloadQrImage('qr-svg-preview', `QR_${slug || 'Banner'}_Print_1024px`, 'png')}
                    className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 cursor-pointer"
                    title="Download 1024x1024 High-Resolution PNG for Physical Print Banners"
                  >
                    <Download size={14} />
                    <span>PNG (1024px)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadQrImage('qr-svg-preview', `QR_${slug || 'Banner'}_Vector`, 'svg')}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Download Scalable Vector SVG for Large Billboards"
                  >
                    <FileText size={14} />
                    <span>SVG Vector</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyLink(slug || 'sample')}
                  className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700/80 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedSlug === (slug || 'sample') ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedSlug === (slug || 'sample') ? 'Link Copied!' : 'Copy Landing Page Link'}</span>
                </button>

                <a
                  href={currentPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={14} />
                  <span>Open & Preview Page</span>
                </a>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* --- SECTION: ALL CREATED BANNER LANDING PAGES LIST (WITH LIVE VIEWS COUNT) --- */}
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-3xl p-6 md:p-8 space-y-5 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-display">
              <Globe size={18} className="text-blue-400" />
              <span>සාදන ලද ප්‍රචාරක පිටු සහ QR ලැයිස්තුව (All Banner Pages & Realtime Analytics)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ස්කෑන් කරන හෝ බලන වාර ගණන (Views Count) සෑම තත්පරයකදීම 100% ක් නිවැරදිව යාවත්කාලීන වේ.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              Total Pages: <b className="text-blue-400">{pages.length}</b>
            </span>
          </div>
        </div>

        {pages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            තවමත් කිසිදු ප්‍රචාරක පිටුවක් සාදා නැත. ඉහත පෝරමය මඟින් පළමු පිටුව සාදන්න.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pages.map((p) => {
              const fullUrl = getPublicUrl(p.slug);
              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl bg-slate-900/80 border transition-all shadow-md flex flex-col justify-between gap-4 group ${
                    p.is_active ? 'border-slate-800 hover:border-blue-500/40' : 'border-rose-900/30 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    
                    {/* Status & Views Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        p.is_active 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                      }`}>
                        {p.is_active ? '● LIVE / PUBLISHED' : '○ DISABLED'}
                      </span>

                      {/* 100% Realtime View Count Badge */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-lg shadow-sm">
                        <Eye size={12} className="text-amber-400" />
                        <span>{p.view_count || 0} Views</span>
                      </span>
                    </div>

                    {/* Title & Slug */}
                    <div>
                      <h4 className="text-sm font-extrabold text-white group-hover:text-blue-300 transition-colors line-clamp-1">
                        {p.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                        {p.description || 'ප්‍රචාරක බැනර් පිටුව'}
                      </p>
                    </div>

                    {/* Mounted Offscreen QR Element with Fixed Coords to Ensure DOM Rendering */}
                    <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '512px', height: '512px', pointerEvents: 'none', opacity: 0 }}>
                      <div id={`qr-svg-${p.id}`}>
                        <QRCode
                          value={fullUrl}
                          size={512}
                          viewBox={`0 0 256 256`}
                        />
                      </div>
                    </div>

                    {/* Mini Stats: Groups & Social links */}
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/80">
                      <span>💬 {p.whatsapp_groups?.length || 0} WA Groups</span>
                      <span>•</span>
                      <span>🌐 {p.social_links?.length || 0} Social Links</span>
                    </div>

                    {/* Link Display Box */}
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-[10px] text-blue-400 font-mono truncate flex items-center justify-between">
                      <span className="truncate">{fullUrl}</span>
                    </div>

                  </div>

                  {/* Actions Grid */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    
                    {/* Primary Export Actions (PNG & SVG Vector) */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadPng(p)}
                        className="py-2 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 cursor-pointer"
                        title="Download High-Resolution PNG for Physical Banners"
                      >
                        <Download size={12} />
                        <span>PNG</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadSvg(p)}
                        className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] border border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                        title="Download Scalable Vector SVG"
                      >
                        <FileText size={12} />
                        <span>SVG</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyLink(p.slug)}
                        className="py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] border border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {copiedSlug === p.slug ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedSlug === p.slug ? 'Copied' : 'Link'}</span>
                      </button>
                    </div>

                    {/* Secondary Actions (Preview, Edit, Toggle, Delete) */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewPage(p)}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        title="පෙරදසුන බලන්න (Preview in Modal)"
                      >
                        <Eye size={15} />
                      </button>

                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        title="Open Landing Page in New Tab"
                      >
                        <ExternalLink size={15} />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleEdit(p)}
                        className="p-2 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-slate-800 transition"
                        title="Edit Page"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(p)}
                        className={`p-2 rounded-lg transition ${
                          p.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'
                        } hover:bg-slate-800`}
                        title={p.is_active ? 'තාවකාලිකව ඩිසේබල් කරන්න (Disable Page)' : 'නැවත සක්‍රීය කරන්න (Enable Page)'}
                      >
                        {p.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                        title="Delete Page (Password Protected)"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation with Security Password DANUSHKA18223 */}
      {deleteTarget && (
        <SecurityPasswordModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={executeDelete}
          title="ප්‍රචාරක බැනර් පිටුව ඉවත් කිරීම (Delete Page)"
          description="මෙම ප්‍රචාරක පිටුව සහ එයට අදාළ දත්ත ස්ථිරවම ඉවත් කිරීමට කරුණාකර පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
          itemSummary={`පිටුව: ${deleteTarget.title} (Slug: ${deleteTarget.slug})`}
          actionButtonText="ස්ථිරවම මකා දමන්න (Delete Now)"
          isDangerous={true}
        />
      )}

      {/* Fullscreen Interactive Landing Page Preview Modal */}
      {previewPage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                <span className="font-extrabold text-white text-xs sm:text-sm truncate">
                  පිටු පෙරදසුන (Preview): {previewPage.title}
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  (?b={previewPage.slug})
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewTheme(t => t === 'dark' ? 'light' : 'dark')}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                  title="Toggle Day/Night mode"
                >
                  {previewTheme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                  <span>{previewTheme === 'dark' ? 'Night' : 'Day'}</span>
                </button>
                <a
                  href={getPublicUrl(previewPage.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs font-bold border border-blue-500/30 transition flex items-center gap-1"
                >
                  <ExternalLink size={12} />
                  <span className="hidden sm:inline">Live URL</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPage(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <BannerLandingPage
                slug={previewPage.slug}
                previewData={previewPage}
                forceTheme={previewTheme}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}