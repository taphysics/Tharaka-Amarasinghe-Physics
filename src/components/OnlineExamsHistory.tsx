import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Award, Calendar, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, FileText, Check, X } from 'lucide-react';

interface Props {
  currentStudent: any;
}

const OnlineExamsHistory: React.FC<Props> = ({ currentStudent }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchGradesLedger();
  }, [currentStudent]);

  const fetchGradesLedger = async () => {
    setIsLoading(true);
    try {
      const username = currentStudent?.username;
      const studentId = currentStudent?.id;

      // 1. Fetch from Supabase `exam_results` table
      let fetchedResults: any[] = [];
      if (username || studentId) {
        const { data, error } = await supabase
          .from('exam_results')
          .select('*')
          .or(`username.eq.${username},student_id.eq.${studentId}`)
          .order('submitted_at', { ascending: false });

        if (!error && data) {
          fetchedResults = data;
        }
      }

      // 2. Fetch locally stored records for instant offline / cache support
      let localRecords: any[] = [];
      try {
        const cacheKey = `online_exams_history_${username}`;
        const raw = localStorage.getItem(cacheKey);
        if (raw) localRecords = JSON.parse(raw);
      } catch (e) {
        console.warn('Local exam records parse error:', e);
      }

      // Robust deduplication: prevent the same exam result from showing twice
      const uniqueList: any[] = [];
      const seenKeys = new Set<string>();

      // Priority 1: Supabase authoritative records
      fetchedResults.forEach(r => {
        const minuteBucket = r.submitted_at ? r.submitted_at.substring(0, 16) : 'nodate';
        const examKey = `${r.exam_id || r.meta_data?.exam_title || 'exam'}_${minuteBucket}`;
        const idKey = r.id ? `id_${r.id}` : examKey;

        if (!seenKeys.has(idKey) && !seenKeys.has(examKey)) {
          seenKeys.add(idKey);
          seenKeys.add(examKey);
          uniqueList.push(r);
        }
      });

      // Priority 2: Local records (only if not already fetched from Supabase)
      localRecords.forEach(r => {
        const minuteBucket = r.submitted_at ? r.submitted_at.substring(0, 16) : 'nodate';
        const examKey = `${r.exam_id || r.meta_data?.exam_title || 'exam'}_${minuteBucket}`;
        const idKey = r.id ? `id_${r.id}` : examKey;

        const isAlreadyInSupabase = fetchedResults.some(f => 
          (f.id && r.id && f.id === r.id) ||
          (f.exam_id === r.exam_id && (
            f.score === r.score ||
            Math.abs(new Date(f.submitted_at).getTime() - new Date(r.submitted_at).getTime()) < 3600000
          ))
        );

        if (!isAlreadyInSupabase && !seenKeys.has(idKey) && !seenKeys.has(examKey)) {
          seenKeys.add(idKey);
          seenKeys.add(examKey);
          uniqueList.push(r);
        }
      });

      const combined = uniqueList.sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );

      setRecords(combined);
    } catch (err) {
      console.error('Error fetching exam grades ledger:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
            <Award size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-white">ඔබගේ විභාග ලකුණු පත්‍රිකා වාර්තා ලේඛනය</h3>
            <p className="text-xs text-slate-400">සජීවී පන්ති සහ ඔන්ලයින් විභාගවල ප්‍රතිඵල දින පිළිවෙළට මෙහි සටහන් වේ.</p>
          </div>
        </div>

        <button 
          onClick={fetchGradesLedger} 
          className="text-xs px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition font-medium self-start sm:self-auto cursor-pointer"
        >
          යාවත්කාලීන කරන්න (Refresh)
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          විභාග වාර්තා පූරණය වෙමින් පවතී...
        </div>
      ) : records.length === 0 ? (
        <div className="p-12 bg-slate-900/50 border border-slate-800 rounded-2xl text-center space-y-3">
          <FileText size={40} className="mx-auto text-slate-600" />
          <h4 className="text-base font-bold text-slate-300">තවමත් විභාග වාර්තා නොමැත</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            සජීවී පන්තිය අතරතුර හෝ වෙනත් ඔන්ලයින් විභාගවලට පෙනී සිටි පසු ඔබගේ ලකුණු සහ ප්‍රශ්න පත්‍ර ප්‍රතිඵල මෙහි ස්වයංක්‍රීයව දිස්වනු ඇත.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {records.map((rec) => {
            const dateObj = new Date(rec.submitted_at || Date.now());
            const formattedDate = dateObj.toLocaleDateString('si-LK', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
            const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const meta = rec.meta_data || {};
            const totalQ = meta.total_questions || rec.total_questions || 50;
            const scoreVal = rec.score ?? 0;
            const percentage = meta.percentage ?? Math.round((scoreVal / totalQ) * 100);
            const examTitle = meta.exam_title || rec.title || 'Online MCQ Examination';
            const classType = meta.class_type || rec.class_type || 'Physics';
            const summaryArray: any[] = meta.results_summary || [];

            const isExpanded = expandedId === (rec.id || rec.submitted_at);

            return (
              <div 
                key={rec.id || rec.submitted_at} 
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl overflow-hidden shadow-xl transition-all duration-200"
              >
                <div className="p-5 flex justify-between items-start gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-[10px] font-mono text-blue-400 font-bold rounded-lg uppercase tracking-wider">
                        {classType}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                        <Calendar size={12} /> {formattedDate} &bull; {formattedTime}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white truncate leading-snug" title={examTitle}>
                      {examTitle}
                    </h4>

                    {summaryArray.length > 0 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : (rec.id || rec.submitted_at))}
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 pt-1 transition cursor-pointer"
                      >
                        {isExpanded ? (
                          <><span>සමාලෝචනය සඟවන්න</span> <ChevronUp size={14} /></>
                        ) : (
                          <><span>ප්‍රශ්න පත්‍ර සමාලෝචනය බලන්න</span> <ChevronDown size={14} /></>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Score Badge Display */}
                  <div className="text-right bg-slate-950/90 p-3.5 rounded-xl border border-slate-800/80 min-w-[95px] shrink-0">
                    <span className="text-[9px] font-mono text-slate-400 block uppercase tracking-wider font-semibold">ලකුණු</span>
                    <div className="flex items-baseline justify-end gap-0.5">
                      <span className="text-xl font-black text-emerald-400">{scoreVal}</span>
                      <span className="text-xs text-slate-500 font-bold font-mono">/{totalQ}</span>
                    </div>
                    <span className={`text-[10px] font-mono block mt-1 px-1.5 py-0.5 rounded font-bold text-center border ${
                      percentage >= 75 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' :
                      percentage >= 50 ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' :
                      'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    }`}>
                      {percentage}%
                    </span>
                  </div>
                </div>

                {/* Expanded Detailed Question Breakdown */}
                {isExpanded && summaryArray.length > 0 && (
                  <div className="bg-slate-950/90 border-t border-slate-800 p-4 space-y-3 animate-in fade-in duration-200">
                    <h5 className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                      ප්‍රශ්න පත්‍ර ප්‍රතිඵල විස්තරය:
                    </h5>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {summaryArray.map((item: any, qIdx: number) => {
                        const isCorrect = item.isCorrect;
                        return (
                          <div
                            key={qIdx}
                            className={`p-2 rounded-lg text-xs flex items-center justify-between border ${
                              isCorrect 
                                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                                : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                            }`}
                          >
                            <span className="font-bold flex items-center gap-1.5">
                              {isCorrect ? <Check size={14} className="text-emerald-400" /> : <X size={14} className="text-rose-400" />}
                              ප්‍රශ්න {item.questionNumber}
                            </span>
                            <span className="font-mono text-[11px]">
                              ඔබගේ පිළිතුර: <strong>{item.userAnswer || 'මඟහැර ඇත'}</strong>
                              {!isCorrect && (
                                <span className="ml-2 text-emerald-400 font-bold">
                                  (නිවැරදි: {item.correctAnswer})
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OnlineExamsHistory;