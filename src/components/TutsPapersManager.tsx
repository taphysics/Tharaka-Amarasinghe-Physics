import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { FileDown, Calendar, EyeOff, FileText, ExternalLink, CheckCircle, Search, Filter } from 'lucide-react';

interface Props {
  currentStudent: any;
  isPaid: boolean;
}

const TutsPapersManager: React.FC<Props> = ({ currentStudent, isPaid }) => {
  const [resources, setResources] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'tute' | 'paper'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const months = [
    { num: '01', name: 'January' },
    { num: '02', name: 'February' },
    { num: '03', name: 'March' },
    { num: '04', name: 'April' },
    { num: '05', name: 'May' },
    { num: '06', name: 'June' },
    { num: '07', name: 'July' },
    { num: '08', name: 'August' },
    { num: '09', name: 'September' },
    { num: '10', name: 'October' },
    { num: '11', name: 'November' },
    { num: '12', name: 'December' }
  ];

  const years = ['2025', '2026', '2027', '2028'];

  useEffect(() => {
    fetchResources();
  }, [currentStudent]);

  const fetchResources = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_resources')
        .select('*')
        .in('type', ['tute', 'paper'])
        .order('created_at', { ascending: false });

      if (data && !error) {
        setResources(data);
      }
    } catch (err) {
      console.error('Error fetching tutes & papers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Student enrolled classes
  const studentClasses: string[] = Array.isArray(currentStudent?.class_types) 
    ? currentStudent.class_types 
    : typeof currentStudent?.class_types === 'string' 
    ? [currentStudent.class_types] 
    : [];

  // Filter resources
  const filteredList = resources.filter((item: any) => {
    // 1. Enrolled class match
    if (studentClasses.length > 0) {
      const targetClasses = item.target_classes || [];
      const isClassMatch = targetClasses.length === 0 || targetClasses.some((tc: string) => {
        const tcLower = (tc || '').toLowerCase().trim();
        if (tcLower === 'all' || tcLower === 'general') return true;
        return studentClasses.some(sc => sc.toLowerCase().trim().includes(tcLower) || tcLower.includes(sc.toLowerCase().trim()));
      });
      if (!isClassMatch) return false;
    }

    // 2. Material type filter
    if (filterType !== 'all' && item.type !== filterType) {
      return false;
    }

    // 3. Year filter
    if (selectedYear !== 'all' && item.target_month && !item.target_month.startsWith(selectedYear)) {
      return false;
    }

    // 4. Month filter
    if (selectedMonth !== 'all' && item.target_month) {
      const mStr = item.target_month.split('-')[1] || item.target_month;
      if (!mStr.includes(selectedMonth)) return false;
    }

    // 5. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (item.title || '').toLowerCase().includes(q);
      const descMatch = (item.description || '').toLowerCase().includes(q);
      if (!titleMatch && !descMatch) return false;
    }

    return true;
  });

  const handleOpenLink = (linkUrl: string) => {
    if (!isPaid) {
      alert("මෙම ටියුට් ලබා ගැනීමට කරුණාකර අදාළ මාසයේ පන්ති ගාස්තු ගෙවා සක්‍රිය කරගන්න.");
      return;
    }
    if (!linkUrl) {
      alert("බාගත කිරීමේ ලින්ක් එකක් ඇතුළත් කර නොමැත.");
      return;
    }
    window.open(linkUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/15 border border-blue-500/30 rounded-2xl text-blue-400">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">ටියුට් සහ ප්‍රශ්න පත්‍ර (Tutes & Papers)</h3>
              <p className="text-xs text-slate-400">ඔබගේ පන්තියට අදාළ නිල Google Drive ලේඛන සහ ප්‍රශ්න පත්‍ර මෙතැනින් ලබා ගන්න.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterType === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              සියල්ල (All)
            </button>
            <button
              onClick={() => setFilterType('tute')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterType === 'tute' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              ටියුට් (Tutes)
            </button>
            <button
              onClick={() => setFilterType('paper')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterType === 'paper' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              පේපර්ස් (Papers)
            </button>
          </div>
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="ටියුට් නමින් සොයන්න..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400 shrink-0" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">සියලුම වසර (All Years)</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">සියලුම මාස (All Months)</option>
              {months.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Resources List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          ටියුට් සහ ලේඛන පූරණය වෙමින් පවතී...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-12 bg-slate-900/50 border border-slate-800 rounded-3xl text-center space-y-3">
          <FileText size={40} className="mx-auto text-slate-600" />
          <h4 className="text-base font-bold text-slate-300">කිසිදු ටියුට් හෝ ප්‍රශ්න පත්‍රයක් හමු නොවීය</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            තෝරාගත් වසර හෝ මාසය සඳහා මෙතෙක් ටියුට් හෝ පේපර්ස් ඇතුළත් කර නොමැත.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((asset) => {
            const isTute = asset.type === 'tute';
            const classes: string[] = asset.target_classes || [];

            return (
              <div 
                key={asset.id} 
                className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl flex flex-col justify-between gap-4 transition shadow-xl"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                      isTute 
                        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' 
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}>
                      {isTute ? '📚 ටියුට් (Tute)' : '📝 ප්‍රශ්න පත්‍රය (Paper)'}
                    </span>

                    {asset.target_month && (
                      <span className="text-[11px] font-mono text-slate-400">
                        📅 {asset.target_month}
                      </span>
                    )}
                  </div>

                  <h4 className="font-extrabold text-sm md:text-base text-white leading-snug">
                    {asset.title}
                  </h4>

                  {asset.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {asset.description}
                    </p>
                  )}

                  {/* Target Classes Tags */}
                  {classes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {classes.map((clsName, i) => (
                        <span key={i} className="text-[10px] bg-slate-950 border border-slate-800 text-amber-400 font-bold px-2 py-0.5 rounded-md">
                          {clsName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Download / Open Google Drive Button */}
                <button
                  onClick={() => handleOpenLink(asset.link)}
                  disabled={!isPaid}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                    !isPaid 
                      ? 'bg-slate-950 border border-slate-800 text-slate-600 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/30'
                  }`}
                  title="Google Drive හරහා විවෘත කරන්න"
                >
                  {!isPaid ? (
                    <><EyeOff size={14} /> Locked (ගාස්තු ගෙවා නොමැත)</>
                  ) : (
                    <><ExternalLink size={14} /> Google Drive හරහා විවෘත කරන්න</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TutsPapersManager;