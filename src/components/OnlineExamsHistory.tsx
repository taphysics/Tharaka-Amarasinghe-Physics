import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Award, Calendar, CheckCircle2, XCircle, Clock, ChevronDown, 
  ChevronUp, FileText, Check, X, Play, Send, ExternalLink, 
  AlertCircle, Sparkles, BookOpen 
} from 'lucide-react';
import { fetchAssignmentMarks } from '../assignmentService';
import { subscribeRealtimeEvents } from '../realtimeSync';
import { AssignmentMark } from '../types';

interface Props {
  currentStudent: any;
}

const OnlineExamsHistory: React.FC<Props> = ({ currentStudent }) => {
  const [records, setRecords] = useState<any[]>(() => {
    try {
      const username = currentStudent?.username;
      const raw = username ? localStorage.getItem(`online_exams_history_${username}`) : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeExams, setActiveExams] = useState<any[]>([]);
  const [assignmentMarks, setAssignmentMarks] = useState<AssignmentMark[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      const username = currentStudent?.username;
      const raw = username ? localStorage.getItem(`online_exams_history_${username}`) : null;
      return !raw;
    } catch {
      return true;
    }
  });

  const isInitialLoadRef = useRef(true);

  // Active Exam Taker Modal States
  const [takingExam, setTakingExam] = useState<any | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examSecondsLeft, setExamSecondsLeft] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [justSubmittedResult, setJustSubmittedResult] = useState<any | null>(null);

  useEffect(() => {
    fetchAllData();

    // Supabase Realtime Subscription for exams & results & assignment marks
    const channelName = `student-exams-realtime-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_marks' }, () => fetchAllData())
      .subscribe();

    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'exam_submitted' || type === 'exam_created' || type === 'assignment_marks_updated') {
        fetchAllData();
      }
    });

    return () => {
      unsub();
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [currentStudent?.id, currentStudent?.username, JSON.stringify(currentStudent?.class_types || currentStudent?.classTypes)]);

  // Exam Countdown Timer
  useEffect(() => {
    let timer: any = null;
    if (takingExam && examSecondsLeft > 0 && !justSubmittedResult) {
      timer = setInterval(() => {
        setExamSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoSubmitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [takingExam, examSecondsLeft, justSubmittedResult]);

  const fetchAllData = async (isManual = false) => {
    if (takingExam) return; // Do not interrupt or clear state while writing exam!
    if (isManual || (isInitialLoadRef.current && records.length === 0 && activeExams.length === 0)) {
      setIsLoading(true);
    }
    try {
      const username = currentStudent?.username;
      const studentId = currentStudent?.id;
      const rawClasses = currentStudent?.class_types || currentStudent?.classTypes || [];
      const studentClasses: string[] = Array.isArray(rawClasses) ? rawClasses : [rawClasses].filter(Boolean);

      // 1. Fetch Past Exam Results
      let fetchedResults: any[] = [];
      if (username || studentId) {
        let query = supabase.from('exam_results').select('*');
        if (username && studentId) {
          query = query.or(`username.eq.${username},student_id.eq.${studentId}`);
        } else if (username) {
          query = query.eq('username', username);
        } else if (studentId) {
          query = query.eq('student_id', studentId);
        }
        const { data, error } = await query.order('submitted_at', { ascending: false });

        if (!error && data) {
          fetchedResults = data;
        }
      }

      // Local storage cache for offline/instant access
      let localRecords: any[] = [];
      try {
        const cacheKey = `online_exams_history_${username}`;
        const raw = localStorage.getItem(cacheKey);
        if (raw) localRecords = JSON.parse(raw);
      } catch (e) {}

      // Combine and deduplicate
      const uniqueList: any[] = [];
      const seenKeys = new Set<string>();

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

      localRecords.forEach(r => {
        const minuteBucket = r.submitted_at ? r.submitted_at.substring(0, 16) : 'nodate';
        const examKey = `${r.exam_id || r.meta_data?.exam_title || 'exam'}_${minuteBucket}`;
        const idKey = r.id ? `id_${r.id}` : examKey;
        if (!seenKeys.has(idKey) && !seenKeys.has(examKey)) {
          seenKeys.add(idKey);
          seenKeys.add(examKey);
          uniqueList.push(r);
        }
      });

      if (uniqueList.length > 0) {
        const sorted = uniqueList.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        setRecords(sorted);
        if (username) {
          try {
            localStorage.setItem(`online_exams_history_${username}`, JSON.stringify(sorted));
          } catch (e) {}
        }
      }

      // 2. Fetch Active Pushed Live Exams
      const { data: examsData } = await supabase
        .from('exams')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (examsData) {
        // Filter exams matching student's enrolled classes
        const matchingActive = examsData.filter((ex: any) => {
          if (studentClasses.length === 0) return true;
          const target = (ex.class_type || ex.target_class_type || '').toLowerCase().trim();
          if (!target || target === 'all' || target === 'general') return true;
          return studentClasses.some(sc => {
            const scLower = sc.toLowerCase().trim();
            return target.includes(scLower) || scLower.includes(target);
          });
        });
        setActiveExams(matchingActive);
      }

      // 3. Fetch Assignment Marks for this student username
      if (username) {
        const marks = await fetchAssignmentMarks({ studentUsername: username });
        if (marks) {
          setAssignmentMarks(marks);
        }
      }

    } catch (err) {
      console.error('Error fetching student exam & marks data:', err);
    } finally {
      isInitialLoadRef.current = false;
      setIsLoading(false);
    }
  };

  // Start Taking Pushed Live Exam
  const handleStartExam = (exam: any) => {
    setTakingExam(exam);
    setExamAnswers({});
    setJustSubmittedResult(null);
    const totalSecs = (exam.duration_minutes || 90) * 60;
    setExamSecondsLeft(totalSecs);
  };

  // Auto Submit on Time Expiry
  const handleAutoSubmitExam = () => {
    handleSubmitExamAnswers(true);
  };

  // Submit Exam
  const handleSubmitExamAnswers = async (isAuto = false) => {
    if (!takingExam) return;
    setIsSubmitting(true);

    try {
      const correctMap = takingExam.correct_answer || {};
      const totalQ = takingExam.total_questions || 50;
      let score = 0;
      const summary: any[] = [];

      for (let i = 1; i <= totalQ; i++) {
        const userAns = examAnswers[i] ?? null;
        const correctAns = correctMap[i] ?? correctMap[String(i)] ?? null;
        const isCorrect = userAns !== null && correctAns !== null && Number(userAns) === Number(correctAns);
        if (isCorrect) score++;

        summary.push({
          questionNumber: i,
          userAnswer: userAns,
          correctAns: correctAns,
          isCorrect
        });
      }

      const percentage = Math.round((score / totalQ) * 100);
      const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();

      const resultPayload = {
        id: submissionId,
        username: currentStudent.username,
        student_id: currentStudent.id,
        exam_id: takingExam.id,
        score,
        submitted_at: nowIso,
        meta_data: {
          exam_title: takingExam.title,
          class_type: takingExam.class_type || takingExam.target_class_type || 'General',
          total_questions: totalQ,
          percentage,
          results_summary: summary,
          is_auto_submitted: isAuto
        }
      };

      // 1. Try Supabase Insert
      try {
        await supabase.from('exam_results').insert([resultPayload]);
      } catch (e) {
        console.warn('Supabase result save note:', e);
      }

      // 2. Cache Locally
      try {
        const cacheKey = `online_exams_history_${currentStudent.username}`;
        const raw = localStorage.getItem(cacheKey);
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(resultPayload);
        localStorage.setItem(cacheKey, JSON.stringify(list));
      } catch (e) {}

      setJustSubmittedResult({
        score,
        totalQ,
        percentage,
        summary
      });

      await fetchAllData();
    } catch (err: any) {
      alert('විභාගය ඉදිරිපත් කිරීමේ දෝෂයකි: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
            <Award size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-white">ඔබගේ විභාග සහ පැවරුම් ලකුණු වාර්තා ලේඛනය</h3>
            <p className="text-xs text-slate-400">ලෙක්චර්වරුන් විසින් ලබා දුන් ලයිව් විභාග, පැවරුම් ලකුණු සහ ප්‍රතිඵල.</p>
          </div>
        </div>

        <button 
          onClick={() => fetchAllData(true)} 
          className="text-xs px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition font-medium self-start sm:self-auto cursor-pointer"
        >
          යාවත්කාලීන කරන්න (Refresh)
        </button>
      </div>

      {/* =======================================================================
          SECTION 1: ACTIVE PUSHED LIVE EXAMS (ලෙක්චර පුෂ් කරන ලද සජීවී විභාග)
          Requirement: "ඔවුන්ගේ ලයිව් එක්සෑම් එක තුළ උඩින්ම පෙන්වන්න ඕනි ලෙක්චර පුෂ් කරන ලද ලයිව් එක්සෑම් එකස්ටාර්ට් කරන්න"
          ======================================================================= */}
      {activeExams.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
            <span>🔴 සජීවී විභාගය ක්‍රියාත්මකයි (Active Live Exams Pushed Now)</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {activeExams.map((exam) => {
              // Check if student has already completed this exam
              const alreadySubmitted = records.find(r => r.exam_id === exam.id);

              return (
                <div
                  key={exam.id}
                  className="bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border-2 border-rose-500/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-2 max-w-xl">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                          LIVE PUSHED EXAM
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                          {exam.class_type || exam.target_class_type}
                        </span>
                      </div>

                      <h4 className="text-xl font-black text-white">
                        {exam.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                        <span className="flex items-center gap-1">
                          <Clock size={13} className="text-amber-400" /> කාලය: {exam.duration_minutes || 90} මිනිත්තු
                        </span>
                        <span>&bull;</span>
                        <span>ප්‍රශ්න ගණන: {exam.total_questions || 50}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div>
                      {alreadySubmitted ? (
                        <div className="bg-emerald-950/40 border border-emerald-500/40 p-4 rounded-2xl text-center">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 justify-center mb-1">
                            <CheckCircle2 size={16} /> ඔබ මෙම විභාගය සම්පූර්ණ කර ඇත
                          </span>
                          <span className="text-sm font-black text-white">
                            ලබාගත් ලකුණු: {alreadySubmitted.score} / {alreadySubmitted.meta_data?.total_questions || 50}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartExam(exam)}
                          className="px-6 py-3.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-rose-900/40 transition flex items-center gap-2 cursor-pointer scale-100 hover:scale-105"
                        >
                          <Play size={18} fill="currentColor" />
                          <span>විභාගය ආරම්භ කරන්න (Start Exam Now)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =======================================================================
          SECTION 2: ASSIGNMENT MARKS (පැවරුම් ලකුණු)
          Requirement: "ඒ ඒ සිසුන්ගේ ලයිව් එක්සෑම් එක තුළ වෙනම සෙක්ෂන් එකක් මගින් ඒ එසයිමන්ට් වල ලකුණු පෙන්විය යුතුයි."
          ======================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400">
              <FileText size={18} />
            </div>
            <div>
              <h4 className="font-bold text-base text-white">📝 පැවරුම් ලකුණු (Assignment Marks)</h4>
              <p className="text-[11px] text-slate-400">දේශකතුමා විසින් ඔබගේ Assignment සඳහා ලබා දුන් ලකුණු මට්ටම.</p>
            </div>
          </div>
          <span className="text-xs font-bold bg-emerald-500/15 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">
            {assignmentMarks.length} Assignments
          </span>
        </div>

        {assignmentMarks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            තවමත් ඔබට අදාළ පැවරුම් ලකුණු (Assignment Marks) ඇතුළත් කර නොමැත.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3.5">පැවරුම් නාමය (Assignment Title)</th>
                  <th className="p-3.5">පන්තිය (Class)</th>
                  <th className="p-3.5">දිනය (Date)</th>
                  <th className="p-3.5 text-center">ලබාගත් ලකුණු</th>
                  <th className="p-3.5">දේශකවරයා (Lecturer)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {assignmentMarks.map((mark) => (
                  <tr key={mark.id} className="hover:bg-slate-850/50 transition">
                    <td className="p-3.5 font-bold text-white text-sm">
                      {mark.assignment_name}
                    </td>
                    <td className="p-3.5">
                      <span className="bg-slate-950 px-2 py-0.5 rounded text-[10px] border border-slate-800 font-semibold text-slate-300">
                        {mark.class_type || 'General'}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono">
                      {mark.assignment_date || 'N/A'}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="font-black text-base px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {mark.marks}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-300 font-medium">
                      {mark.lecturer_name || 'Academic Lecturer'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =======================================================================
          SECTION 3: COMPLETED EXAM RESULTS HISTORY
          ======================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Award size={18} className="text-amber-400" />
          <h4 className="font-bold text-base text-white">🏆 සම්පූර්ණ කරන ලද විභාග ලකුණු සහ ප්‍රතිඵල</h4>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            විභාග වාර්තා පූරණය වෙමින් පවතී...
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 bg-slate-900/50 border border-slate-800 rounded-2xl text-center space-y-3">
            <FileText size={40} className="mx-auto text-slate-600" />
            <h4 className="text-base font-bold text-slate-300">තවමත් සම්පූර්ණ කළ විභාග වාර්තා නොමැත</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              සජීවී විභාගයකට පෙනී සිටි පසු ඔබගේ ලකුණු සහ ප්‍රතිඵල මෙහි ස්වයංක්‍රීයව දිස්වනු ඇත.
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
                                    (නිවැරදි: {item.correctAns})
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

      {/* =======================================================================
          INTERACTIVE EXAM TAKER MODAL
          ======================================================================= */}
      {takingExam && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[70] p-2 sm:p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  🔴 සජීවී විභාගය (LIVE ONLINE EXAM)
                </span>
                <h3 className="text-lg font-black text-white">{takingExam.title}</h3>
              </div>

              {/* Countdown Timer */}
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 font-mono font-black text-base shadow-inner ${
                  examSecondsLeft < 300 
                    ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse' 
                    : 'bg-slate-900 border-slate-700 text-amber-400'
                }`}>
                  <Clock size={18} />
                  <span>{formatTimer(examSecondsLeft)}</span>
                </div>

                <button
                  onClick={() => {
                    if (window.confirm('විභාගයෙන් ඉවත් වීමට අවශ්‍යද? ඔබ මෙතෙක් තෝරාගත් පිළිතුරු සුරැකෙන්නේ නැත.')) {
                      setTakingExam(null);
                    }
                  }}
                  className="text-slate-400 hover:text-white p-2 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
              
              {/* Left Pane: Question Paper (Google Drive PDF / Preview) */}
              <div className="p-4 flex flex-col h-full overflow-hidden bg-slate-950/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-300">ප්‍රශ්න පත්‍රය (Question Paper)</span>
                  {takingExam.pdf_url && (
                    <a
                      href={takingExam.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={12} /> වෙනම Window එකක විවෘත කරන්න
                    </a>
                  )}
                </div>

                {takingExam.pdf_url ? (
                  <iframe
                    src={takingExam.pdf_url.replace('/view', '/preview').replace('?usp=sharing', '')}
                    className="w-full flex-1 rounded-xl border border-slate-800 bg-white"
                    title="Exam PDF"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center p-4">
                    ප්‍රශ්න පත්‍රයේ PDF සබැඳියක් නොමැත.
                  </div>
                )}
              </div>

              {/* Right Pane: MCQ Answer Selector */}
              <div className="p-4 flex flex-col h-full overflow-y-auto">
                <span className="text-xs font-bold text-slate-300 mb-3 block">
                  පිළිතුරු පත්‍රිකාව (Select 1 - 5 for each Question):
                </span>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 max-h-[55vh]">
                  {Array.from({ length: takingExam.total_questions || 50 }, (_, i) => i + 1).map(qNum => {
                    const selected = examAnswers[qNum];
                    return (
                      <div
                        key={qNum}
                        className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                          selected 
                            ? 'bg-indigo-950/40 border-indigo-500/40' 
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <span className="font-mono font-bold text-xs text-slate-300 w-8">
                          {qNum}.
                        </span>

                        <div className="grid grid-cols-5 gap-1.5 flex-1 max-w-xs">
                          {[1, 2, 3, 4, 5].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setExamAnswers(prev => ({ ...prev, [qNum]: opt }))}
                              className={`py-1.5 rounded-lg text-xs font-bold font-mono transition border cursor-pointer ${
                                selected === opt
                                  ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                              }`}
                            >
                              ({opt})
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submit Action */}
                <div className="pt-4 mt-3 border-t border-slate-800">
                  <button
                    onClick={() => {
                      if (window.confirm('ප්‍රශ්න පත්‍රය අවසන් කර Submit කිරීමට සනාථ කරන්නද?')) {
                        handleSubmitExamAnswers(false);
                      }
                    }}
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send size={16} /> 
                    <span>{isSubmitting ? 'සුරැකෙමින් පවතී...' : 'ප්‍රශ්න පත්‍රය Submit කරන්න'}</span>
                  </button>
                </div>

              </div>

            </div>

            {/* Instant Result View if just submitted */}
            {justSubmittedResult && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 z-20">
                <div className="bg-slate-900 border border-emerald-500/40 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                    <Award size={36} />
                  </div>
                  <h3 className="text-xl font-black text-white">විභාගය සාර්ථකව අවසන් කළා!</h3>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <div className="text-3xl font-black text-emerald-400">
                      {justSubmittedResult.score} / {justSubmittedResult.totalQ}
                    </div>
                    <div className="text-sm font-bold text-slate-400 mt-1">
                      ප්‍රතිශතය: {justSubmittedResult.percentage}%
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setTakingExam(null);
                      setJustSubmittedResult(null);
                    }}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition"
                  >
                    ප්‍රතිඵල ලේඛනය වෙත ආපසු යන්න
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default OnlineExamsHistory;