import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { subscribeRealtimeEvents } from '../realtimeSync';
import { fetchAllPendingPayments } from '../pendingPaymentsService';
import { 
  FileText, Calendar, EyeOff, Search, Filter, ShieldCheck, 
  X, Maximize2, ShieldAlert, Sparkles, BookOpen, ChevronRight,
  Clock, Lock, Download
} from 'lucide-react';

interface Props {
  currentStudent: any;
  isPaid: boolean;
  paymentHistory?: Record<string, { monthKey: string; monthName: string; status: 'Paid' | 'Free' | 'Unpaid' | 'Absent' }[]>;
  onOpenPayment?: (classType: string, targetMonth: string) => void;
}

export default function TutsPapersManager({ currentStudent, isPaid: defaultIsPaid, paymentHistory, onOpenPayment }: Props) {
  const [resources, setResources] = useState<any[]>([]);
  const [pendingPaymentsList, setPendingPaymentsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'tute' | 'paper'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Protected In-App PDF Viewer Modal State
  const [activeViewerDoc, setActiveViewerDoc] = useState<any | null>(null);

  const months = [
    { num: '01', name: 'January (ජනවාරි)' },
    { num: '02', name: 'February (පෙබරවාරි)' },
    { num: '03', name: 'March (මාර්තු)' },
    { num: '04', name: 'April (අප්‍රේල්)' },
    { num: '05', name: 'May (මැයි)' },
    { num: '06', name: 'June (ජූනි)' },
    { num: '07', name: 'July (ජූලි)' },
    { num: '08', name: 'August (අගෝස්තු)' },
    { num: '09', name: 'September (සැප්තැම්බර්)' },
    { num: '10', name: 'October (ඔක්තෝබර්)' },
    { num: '11', name: 'November (නොවැම්බර්)' },
    { num: '12', name: 'December (දෙසැම්බර්)' }
  ];

  const years = ['2024', '2025', '2026', '2027', '2028'];

  useEffect(() => {
    fetchResources();

    // Subscribe to realtime updates
    const unsub = subscribeRealtimeEvents((type) => {
      if (
        type === 'tute_added' || 
        type === 'tute_deleted' ||
        type === 'payment_approved' ||
        type === 'payment_rejected' ||
        type === 'pending_payment_submitted' ||
        type === 'pending_payment_deleted'
      ) {
        fetchResources();
      }
    });

    const channelName = `student-tutes-realtime-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_resources' }, () => {
        fetchResources();
      })
      .subscribe();

    return () => {
      unsub();
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [currentStudent?.id, currentStudent?.username, JSON.stringify(currentStudent?.class_types || currentStudent?.classTypes)]);

  const fetchResources = async () => {
    try {
      const { data, error } = await supabase
        .from('class_resources')
        .select('*')
        .in('type', ['tute', 'paper'])
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Remote tutes fetch error:', error);
      }
      if (data) {
        setResources(data);
      }
    } catch (err) {
      console.warn('Remote tutes fetch exception:', err);
    } finally {
      setIsLoading(false);
    }

    // 2. Fetch pending payments for this student
    try {
      const allPending = await fetchAllPendingPayments();
      const sUsername = currentStudent?.username;
      const sId = currentStudent?.id;
      const mine = allPending.filter(p => (p.username === sUsername || p.student_id === sId) && p.status === 'pending');
      setPendingPaymentsList(mine);
    } catch (err) {}
  };

  // Student enrolled classes
  const rawClasses = currentStudent?.class_types || currentStudent?.classTypes || currentStudent?.class || [];
  const studentClasses: string[] = Array.isArray(rawClasses) 
    ? rawClasses 
    : typeof rawClasses === 'string' 
    ? [rawClasses] 
    : [];

  // Helper to convert Google Drive URL to embedded preview mode
  const getDrivePreviewUrl = (url: string) => {
    if (!url) return '';
    const clean = url.trim();
    // match /file/d/FILE_ID
    const matchD = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD && matchD[1]) {
      return `https://drive.google.com/file/d/${matchD[1]}/preview`;
    }
    // match id=FILE_ID
    const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
      return `https://drive.google.com/file/d/${matchId[1]}/preview`;
    }
    // If already has preview
    if (clean.includes('/preview')) return clean;
    return clean;
  };

  // Helper to convert Google Drive or file URL to direct download link
  const getDirectDownloadUrl = (url: string) => {
    if (!url) return '';
    const clean = url.trim();
    const matchD = clean.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD && matchD[1]) {
      return `https://drive.google.com/uc?export=download&id=${matchD[1]}`;
    }
    const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
      return `https://drive.google.com/uc?export=download&id=${matchId[1]}`;
    }
    return clean;
  };

  // Helper to check if student is permitted to download this tute/paper
  const isResourceDownloadAllowed = (asset: any): boolean => {
    if (!asset) return false;
    if (asset.allow_download === true || asset.allow_download === 'true') return true;
    if (typeof asset.description === 'string' && asset.description.includes('[ALLOW_DOWNLOAD]')) return true;
    return false;
  };

  const getCleanDescription = (desc: string) => {
    if (!desc) return '';
    return desc.replace('[ALLOW_DOWNLOAD]', '').trim();
  };

  // Filter resources
  const filteredList = resources.filter((item: any) => {
    const targetClasses = item.target_classes || [];

    // 1. Must belong to student's enrolled classes (unless no classes enrolled or class is general)
    if (studentClasses.length > 0) {
      const isClassMatch = targetClasses.length === 0 || targetClasses.some((tc: string) => {
        const tcLower = (tc || '').toLowerCase().trim();
        if (tcLower === 'all' || tcLower === 'general') return true;
        return studentClasses.some(sc => sc.toLowerCase().trim().includes(tcLower) || tcLower.includes(sc.toLowerCase().trim()));
      });
      if (!isClassMatch) return false;
    }

    // 2. Class Type dropdown filter
    if (selectedClassFilter !== 'all') {
      const isSelectedClassMatch = targetClasses.some((tc: string) => {
        const tcLower = (tc || '').toLowerCase().trim();
        const selLower = selectedClassFilter.toLowerCase().trim();
        return tcLower.includes(selLower) || selLower.includes(tcLower);
      });
      if (!isSelectedClassMatch) return false;
    }

    // 3. Material type filter (tute / paper)
    if (filterType !== 'all' && item.type !== filterType) {
      return false;
    }

    // 4. Year filter
    if (selectedYear !== 'all') {
      const tMonth = item.target_month || '';
      if (!tMonth.startsWith(selectedYear)) return false;
    }

    // 5. Month filter
    if (selectedMonth !== 'all') {
      const tMonth = item.target_month || '';
      const mStr = tMonth.split('-')[1] || tMonth;
      if (!mStr.includes(selectedMonth)) return false;
    }

    // 6. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (item.title || '').toLowerCase().includes(q);
      const descMatch = (item.description || '').toLowerCase().includes(q);
      if (!titleMatch && !descMatch) return false;
    }

    return true;
  });

  // Group filtered list by Class Type
  const groupedResources = filteredList.reduce((acc: Record<string, any[]>, item: any) => {
    const targetClasses = item.target_classes || ['General'];
    const key = targetClasses.length > 0 ? targetClasses[0] : 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const handleOpenSecureViewer = (doc: any) => {
    if (!doc.link) {
      alert("වලංගු ලේඛන ලින්ක් එකක් ඇතුළත් කර නොමැත.");
      return;
    }
    setActiveViewerDoc(doc);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header & Filter Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-2xl text-blue-500 dark:text-blue-400">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg md:text-xl text-slate-900 dark:text-white">
                ටියුට් සහ ප්‍රශ්න පත්‍ර (Tutes &amp; Papers)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                ඔබ තෝරාගෙන ඇති පන්ති වර්ගයන්ට අදාළ නිල Google Drive ලේඛන සහ ප්‍රශ්න පත්‍ර මෙතැනින් ආරක්ෂිතව කියවන්න.
              </p>
            </div>
          </div>

          {/* Type Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterType === 'all' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              සියල්ල (All)
            </button>
            <button
              onClick={() => setFilterType('tute')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterType === 'tute' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ටියුට් (Tutes)
            </button>
            <button
              onClick={() => setFilterType('paper')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterType === 'paper' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              පේපර්ස් (Papers)
            </button>
          </div>
        </div>

        {/* Filters Bar: Class, Year, Month, Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* 1. Class Filter */}
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-1">පන්ති වර්ගය (Class)</label>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-xs font-bold px-3 py-2.5 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="all">සියලුම ලියාපදිංචි පන්ති</option>
              {studentClasses.map((cls, idx) => (
                <option key={idx} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* 2. Year Filter */}
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-1">වසර (Year)</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-xs font-bold px-3 py-2.5 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="all">සියලුම වසර (All Years)</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* 3. Month Filter */}
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-1">මාසය (Month)</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-xs font-bold px-3 py-2.5 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="all">සියලුම මාස (All Months)</option>
              {months.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
            </select>
          </div>

          {/* 4. Search Filter */}
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-1">සෙවුම (Search)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="ටියුට් නම සොයන්න..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-xs pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

        </div>

      </div>

      {/* Main Documents Stream Organized by Class & Month */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-500 dark:text-slate-400 text-xs">
          ටියුට් සහ ලේඛන පූරණය වෙමින් පවතී...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-3 shadow-sm">
          <FileText size={42} className="mx-auto text-slate-400 dark:text-slate-600" />
          <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-300">කිසිදු ටියුට් හෝ ප්‍රශ්න පත්‍රයක් හමු නොවීය</h4>
          <p className="text-xs text-slate-600 dark:text-slate-500 max-w-md mx-auto font-medium">
            ඔබ තෝරාගත් පන්ති වර්ගය, වසර හෝ මාසය සඳහා මෙතෙක් ටියුට් හෝ පේපර්ස් ඇතුළත් කර නොමැත.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedResources).map(([className, docs]: [string, any]) => (
            <div key={className} className="space-y-4">
              
              {/* Class Group Header */}
              <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {className}
                </h4>
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-md">
                  {docs.length} Items
                </span>
              </div>

              {/* Grid of Documents */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {docs.map((asset) => {
                  const isTute = asset.type === 'tute';
                  const targetClass = asset.target_classes?.[0] || className;
                  const targetMonth = asset.target_month || '';

                  // Determine if this item is unlocked
                  let isItemUnlocked = defaultIsPaid;
                  if (currentStudent?.plan_type?.toLowerCase() === 'free') {
                    isItemUnlocked = true;
                  } else if (paymentHistory && paymentHistory[targetClass]) {
                    const mRecord = paymentHistory[targetClass].find(m => 
                      m.monthKey === targetMonth || (targetMonth && (targetMonth.includes(m.monthKey) || targetMonth.includes(m.monthName)))
                    );
                    if (mRecord) {
                      isItemUnlocked = mRecord.status === 'Paid' || mRecord.status === 'Free';
                    }
                  }

                  // Check if pending verification
                  const isPending = !isItemUnlocked && pendingPaymentsList.some(p => {
                    if (p.status !== 'pending') return false;
                    const pClass = String(p.class_type || '').toLowerCase().trim();
                    const tClass = String(targetClass || '').toLowerCase().trim();
                    const classMatch = pClass === tClass || pClass.includes(tClass) || tClass.includes(pClass);
                    
                    const pMonth = String(p.month || '').trim().toLowerCase();
                    const tMonthClean = String(targetMonth || '').trim().toLowerCase();
                    const monthMatch = !pMonth || !tMonthClean || pMonth === tMonthClean || tMonthClean.includes(pMonth) || pMonth.includes(tMonthClean);
                    return classMatch && monthMatch;
                  });

                  return (
                    <div 
                      key={asset.id} 
                      onClick={() => {
                        if (!isItemUnlocked) {
                          if (onOpenPayment) {
                            onOpenPayment(targetClass, targetMonth);
                          }
                          return;
                        }
                        handleOpenSecureViewer(asset);
                      }}
                      className={`p-5 rounded-3xl flex flex-col justify-between gap-4 transition shadow-md group select-none cursor-pointer border ${
                        !isItemUnlocked
                          ? isPending
                            ? 'bg-amber-500/5 dark:bg-amber-950/15 border-amber-500/40'
                            : 'bg-rose-50/20 dark:bg-red-950/10 border-rose-200 dark:border-red-900/40 hover:border-rose-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-blue-400'
                      }`}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <div className="space-y-2.5">
                        
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase border ${
                            isTute 
                              ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' 
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                          }`}>
                            {isTute ? '📚 ටියුට් (Tute)' : '📝 පේපර් (Paper)'}
                          </span>

                          {asset.target_month && (
                            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-0.5 rounded-lg">
                              📅 {asset.target_month}
                            </span>
                          )}
                        </div>

                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition leading-snug line-clamp-2">
                          {asset.title}
                        </h4>

                        {asset.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {getCleanDescription(asset.description)}
                          </p>
                        )}
                      </div>

                      {/* In-App View, 1-Touch Download or Payment Action */}
                      <div>
                        {isItemUnlocked ? (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSecureViewer(asset);
                              }}
                              className="w-full py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer select-none bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/20"
                              title="ආරක්ෂිතව කියවන්න"
                            >
                              <ShieldCheck size={16} /> ආරක්ෂිතව කියවන්න (Secure View)
                            </button>

                            {isResourceDownloadAllowed(asset) && (
                              <a
                                href={getDirectDownloadUrl(asset.link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                onClick={(e) => e.stopPropagation()}
                                className="w-full py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer select-none bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/20 border border-emerald-500/40"
                                title="එක් ටච් එකෙන් PDF එක බාගත කරන්න"
                              >
                                <Download size={15} /> 📥 Download PDF (1-Touch)
                              </a>
                            )}
                          </div>
                        ) : isPending ? (
                          <div className="w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                            <Clock size={15} /> ⏳ පොරොත්තුවේ (Pending Verification)
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenPayment) onOpenPayment(targetClass, targetMonth);
                            }}
                            className="w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer select-none bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-900/20"
                            title="ගෙවීම් කිරීමට ක්ලික් කරන්න"
                          >
                            <Lock size={15} /> 🔒 ගෙවීම් කර නොමැත - ගෙවීමට මෙතැන ක්ලික් කරන්න
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
          PROTECTED IN-APP PDF VIEWER MODAL
          (Disables Right-click, download, and external sharing as requested)
         ========================================================================= */}
      {activeViewerDoc && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4 select-none"
          onContextMenu={(e) => { e.preventDefault(); return false; }}
        >
          <div 
            className="w-full max-w-5xl h-[92vh] bg-slate-900 border border-slate-700 rounded-3xl flex flex-col shadow-2xl overflow-hidden relative"
            onContextMenu={(e) => { e.preventDefault(); return false; }}
          >
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm md:text-base font-extrabold text-white truncate">
                    {activeViewerDoc.title}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      🛡️ ආරක්ෂිත කියවීමේ මාදිලිය (Protected View)
                    </span>
                    <span>• {isResourceDownloadAllowed(activeViewerDoc) ? 'Download Enabled' : 'Download & Share Restricted'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isResourceDownloadAllowed(activeViewerDoc) && (
                  <a
                    href={getDirectDownloadUrl(activeViewerDoc.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow"
                    title="PDF එක Download කරන්න"
                  >
                    <Download size={14} /> Download PDF
                  </a>
                )}
                <button
                  onClick={() => setActiveViewerDoc(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition cursor-pointer"
                  title="වසන්න (Close)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Embedded Google Drive PDF Preview with Protection Layer */}
            <div 
              className="flex-1 w-full h-full relative bg-slate-950 overflow-hidden"
              onContextMenu={(e) => { e.preventDefault(); return false; }}
            >
              <iframe
                src={getDrivePreviewUrl(activeViewerDoc.link)}
                className="w-full h-full border-0 select-none"
                title={activeViewerDoc.title}
                allow="autoplay"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />

              {/* Watermark overlay at bottom */}
              <div className="absolute bottom-2 right-4 pointer-events-none bg-slate-950/80 px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
                Smart Physics • {currentStudent?.username || 'Student'}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}