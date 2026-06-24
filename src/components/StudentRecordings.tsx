import { supabase } from '../supabaseClient';
import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle, Clock, ArrowLeft, Play } from 'lucide-react';

interface StudentRecordingsProps {
  student: any; 
  onBack: () => void; 
}

export default function StudentRecordings({ student, onBack }: StudentRecordingsProps) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<{year: string, month: string}[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('current');
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, boolean>>({});
  
  const currentYear = new Date().getFullYear().toString();
  const currentMonthNumStr = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  useEffect(() => {
    if (student) {
      fetchRecordingsAndPayments();
    }
  }, [student, selectedFilter]);

  const fetchRecordingsAndPayments = async () => {
    try {
      const studentClasses = student.class_types || [];
      if (studentClasses.length === 0) return;

      const { data: recData } = await supabase
        .from('recordings') 
        .select('*')
        .in('class_type', studentClasses)
        .order('created_at', { ascending: true }); 
      
      if (recData) {
        setRecordings(recData);
        const monthsList = Array.from(new Set<string>(recData.map((r: any) => `${r.year}-${r.month}`)))
          .map((str: string) => {
            const [y, m] = str.split('-');
            return { year: y, month: m };
          });
        setAvailableMonths(monthsList);
      }

      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .eq('username', student.username);

      const statusMap: Record<string, boolean> = {};
      
      const formatYearMonth = (year: any, month: any) => {
        let yStr = String(year).trim();
        let mStr = String(month).trim();
        const monthMap: Record<string, string> = {
            'january': '01', 'jan': '01', '1': '01', 'february': '02', 'feb': '02', '2': '02',
            'march': '03', 'mar': '03', '3': '03', 'april': '04', 'apr': '04', '4': '04',
            'may': '05', '5': '05', 'june': '06', 'jun': '06', '6': '06',
            'july': '07', 'jul': '07', '7': '07', 'august': '08', 'aug': '08', '8': '08',
            'september': '09', 'sep': '09', '9': '09', 'october': '10', 'oct': '10', 
            'november': '11', 'nov': '11', 'december': '12', 'dec': '12'
        };
        const mappedMonth = monthMap[mStr.toLowerCase()] || mStr.padStart(2, '0');
        return `${yStr}-${mappedMonth}`;
      };

      if (recData) {
        recData.forEach((rec: any) => {
          const recMonthStr = String(rec.month).trim();
          const recYearStr = String(rec.year).trim();
          const recYearMonthStr = `${rec.year}-${rec.month}`;
          const standardizedDbMonth = formatYearMonth(rec.year, rec.month); 

          const isGloballyFree = student.plan_type?.toLowerCase() === 'free'; 
          const isThisMonthFree = student.free_months?.includes(recMonthStr) || 
                                  student.free_months?.includes(recYearMonthStr) || 
                                  student.free_months?.includes(standardizedDbMonth);
          
          const paymentRecord = payData?.find((p: any) => {
            const pClass = String(p.class_type || p.class_name || "").toLowerCase().trim();
            const rClass = String(rec.class_type || "").toLowerCase().trim();
            const isClassMatch = pClass === rClass || pClass.includes(rClass) || rClass.includes(pClass);
            
            const pTargetMonth = String(p.target_month || "").trim();
            const pMonth = String(p.month || "").trim();

            const isMonthMatch = 
              pTargetMonth === standardizedDbMonth || pMonth === standardizedDbMonth || 
              pTargetMonth === recMonthStr || pMonth === recMonthStr || pMonth === `${recYearStr}-${recMonthStr.padStart(2, '0')}`;

            return isClassMatch && isMonthMatch;
          });
          
          const pStatus = paymentRecord?.status?.toLowerCase()?.trim();
          const isPaid = pStatus === 'paid' || pStatus === 'free' || pStatus === 'approved' || pStatus === 'success';
          
          statusMap[`${rec.class_type}-${rec.year}-${rec.month}`] = isGloballyFree || isThisMonthFree || isPaid; 
        });
      }
      setPaymentStatuses(statusMap);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const getCleanVideoUrl = (video: any) => {
    if (!video) return '';
    const rawInput = video.video_url || video.youtube_id || video.url || video.link || '';
    if (!rawInput) return '';

    let val = String(rawInput).trim();
    // YouTube ID එකක් පමණක් නම් ලින්ක් එක සාදා ගැනීම
    if (val.startsWith('http')) return val;
    return `https://www.youtube.com/watch?v=${val}`;
  };

  const getVideoThumbnail = (video: any) => {
    if (video.thumbnail_url) return video.thumbnail_url;
    const url = getCleanVideoUrl(video);
    let vidId = '';
    if (url.includes('v=')) vidId = url.split('v=')[1]?.split('&')[0];
    else if (url.includes('youtu.be/')) vidId = url.split('youtu.be/')[1]?.split('?')[0];
    
    if (vidId) return `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`;
    return 'https://via.placeholder.com/640x360.png?text=Video+Recording';
  };

  const handleVideoClick = (video: any, isUnlocked: boolean) => {
    if (isUnlocked) {
      const url = getCleanVideoUrl(video);
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      alert(`ඔබ තවමත් ${video.year} ${video.month} මාසය සඳහා ${video.class_type} පන්තියට මුදල් ගෙවා නොමැත.`);
    }
  };

  const filteredRecordings = recordings.filter((r: any) => {
    if (selectedFilter === 'current') {
        return r.year === currentYear && (r.month === currentMonthNumStr || r.month === currentMonthName || r.month === String(new Date().getMonth() + 1));
    }
    const [fYear, fMonth] = selectedFilter.split('-');
    return r.year === fYear && r.month === fMonth;
  });

  const groupedRecordings = filteredRecordings.reduce((acc: any, video: any) => {
    acc[video.class_type] = acc[video.class_type] || [];
    acc[video.class_type].push(video);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="bg-slate-950 min-h-screen text-white p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-2xl font-bold text-blue-400">Class Recordings</h1>
            <p className="text-slate-400 text-sm">පන්තිවල මඟහැරුණු කොටස් නරඹන්න</p>
          </div>
        </div>

        <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} className="bg-slate-900 border border-slate-700 text-white px-4 py-2 rounded-xl">
          <option value="current">මෙම මාසය ({currentMonthName})</option>
          {availableMonths.map((m, idx) => <option key={idx} value={`${m.year}-${m.month}`}>{m.year} - {m.month}</option>)}
        </select>
      </div>

      {Object.keys(groupedRecordings).length === 0 ? (
        <div className="text-center py-20 text-slate-500">වීඩියෝ කිසිවක් ලබා දී නොමැත.</div>
      ) : (
        Object.entries(groupedRecordings).map(([classType, videos]: [string, any]) => (
          <div key={classType} className="mb-10">
            <h2 className="text-xl font-bold text-emerald-400 mb-4 border-b border-slate-800 pb-2">{classType}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {videos.map((video: any) => {
                const isUnlocked = paymentStatuses[`${video.class_type}-${video.year}-${video.month}`] || false;
                return (
                  <div key={video.id} onClick={() => handleVideoClick(video, isUnlocked)} className="relative group rounded-2xl overflow-hidden cursor-pointer border-2 border-slate-700 hover:border-blue-500 transition-all">
                    <div className="relative aspect-video bg-slate-900">
                      <img src={getVideoThumbnail(video)} alt={video.title} className="w-full h-full object-cover" />
                      {!isUnlocked && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                          <Lock className="text-red-500 mb-2" />
                          <p className="text-xs">ගෙවීම් සිදුකර නොමැත</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Play size={48} className="text-white" />
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900">
                      <h3 className="text-sm font-semibold">{video.title}</h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}