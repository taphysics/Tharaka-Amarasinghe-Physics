import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { format, addHours, isBefore } from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Send, 
  CheckCircle2, 
  Lock, 
  AlertCircle, 
  FileText, 
  Check, 
  X,
  Maximize2
} from 'lucide-react';

interface Student {
  id: string;
  username: string;
  class_types: string[];
  active_months: string[];
  free_months: string[];
  is_paid?: boolean;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type: string;
  target_class_type?: string;
  target_classes?: string[];
  target_month: string;
  status: string;
  zoom_join_url: string;
  zoom_meeting_id: string;
  is_exam_active: boolean;
  active_exam_id?: string;
  pre_class_video_path?: string;
  is_active?: boolean;
}

interface ExamData {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  start_time: string;
  class_type: string;
  target_class_type: string;
}

const getEmbeddableZoomUrl = (joinUrl: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL', error);
    return joinUrl;
  }
};

const getDrivePreviewUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/view')) return url.replace('/view', '/preview');
  if (url.includes('/edit')) return url.replace('/edit', '/preview');
  if (url.includes('drive.google.com') && !url.includes('/preview')) {
    return `${url}/preview`;
  }
  return url;
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [hasPaymentAccess, setHasPaymentAccess] = useState<boolean>(true);
  const [accessRestrictedDetails, setAccessRestrictedDetails] = useState<{
    classType: string;
    month: string;
    year: string;
  } | null>(null);

  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchClassAndScheduleData();

    const channel = supabase
      .channel('live-player-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_lives' },
        () => fetchClassAndScheduleData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const fetchClassAndScheduleData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const currentDateStr = format(now, 'yyyy-MM-dd');

      // අකුරු (case sensitivity) ගැටළු මගහැරීමට සියලුම දත්ත ගෙන JS මගින් ෆිල්ටර් කිරීම
      const { data: livesData, error: livesError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (livesError) throw livesError;

      const userClasses = (currentUser.class_types || []).map(c => c.trim().toLowerCase());

      const studentLives = (livesData || []).filter((cls: ScheduledLive) => {
        const clsType = (cls.target_class_type || cls.class_type || '').trim().toLowerCase();
        const targetClasses = (cls.target_classes || []).map(c => c.trim().toLowerCase());
        
        const isClassMatch = userClasses.includes(clsType) || targetClasses.some(tc => userClasses.includes(tc));
        
        const status = (cls.status || '').toLowerCase();
        const isValidStatus = status === 'live' || status === 'scheduled' || cls.is_active === true;

        return isClassMatch && isValidStatus;
      });

      const livesWithin24h: ScheduledLive[] = [];

      studentLives.forEach(cls => {
        // වේලාවන් නිවැරදිව Parse කිරීම
        const classDateTime = new Date(`${cls.date} ${cls.time}`);
        const isLive = (cls.status || '').toLowerCase() === 'live' || cls.is_active === true;
        
        if (isNaN(classDateTime.getTime())) {
           if (isLive) livesWithin24h.push(cls);
        } else {
           const diffHours = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
           // පන්තිය පටන් ගැනීමට පැය 4ක් ප්‍රමාද වුවද (diffHours >= -4) ස්ක්‍රීන් එක පෙන්වයි
           if (isLive || (diffHours >= -4 && diffHours <= 24)) {
              livesWithin24h.push(cls);
           }
        }
      });

      // Live වන පන්තිය පළමුව පෙන්වීමට Sort කිරීම
      livesWithin24h.sort((a, b) => {
         const aLive = (a.status || '').toLowerCase() === 'live' || a.is_active === true;
         const bLive = (b.status || '').toLowerCase() === 'live' || b.is_active === true;
         if (aLive && !bLive) return -1;
         if (!aLive && bLive) return 1;
         return new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime();
      });

      setUpcomingClasses(livesWithin24h);

      if (livesWithin24h.length === 0) {
        const { data: calData } = await supabase
          .from('calender_events')
          .select('*')
          .gte('date', currentDateStr)
          .order('date', { ascending: true });

        if (calData) {
          const studentCalEvents = calData.filter((evt: CalendarEvent) => {
            const evtType = (evt.target_class_type || evt.class_type || '').trim().toLowerCase();
            return userClasses.includes(evtType);
          });
          setCalendarEvents(studentCalEvents);
        }
      } else {
        await checkStudentPaymentAccess(livesWithin24h[0]);
      }
    } catch (err) {
      console.error('Error fetching live class data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkStudentPaymentAccess = async (targetClass: ScheduledLive) => {
    if (!targetClass) return;

    const classType = targetClass.target_class_type || targetClass.class_type || '';
    const targetMonth = targetClass.target_month || format(new Date(), 'yyyy-MM');
    const [yearVal, monthVal] = targetMonth.includes('-') 
      ? targetMonth.split('-') 
      : [format(new Date(), 'yyyy'), targetMonth];

    const isFreeOrActive = 
      (currentUser.active_months && currentUser.active_months.includes(targetMonth)) ||
      (currentUser.free_months && currentUser.free_months.includes(targetMonth));

    if (isFreeOrActive) {
      setHasPaymentAccess(true);
      return;
    }

    const { data: paymentRecord } = await supabase
      .from('payments')
      .select('*')
      .or(`student_id.eq.${currentUser.id},username.eq.${currentUser.username}`)
      .in('status', ['approved', 'paid', 'success'])
      .maybeSingle();

    const isPaidInTable = !!paymentRecord && (
      paymentRecord.target_month === targetMonth || paymentRecord.month === targetMonth
    );

    if (isPaidInTable || currentUser.is_paid) {
      setHasPaymentAccess(true);
    } else {
      setHasPaymentAccess(false);
      setAccessRestrictedDetails({ classType, month: monthVal, year: yearVal });
    }
  };

  const activeClass = upcomingClasses[0];

  useEffect(() => {
    const loadExam = async (examId: string) => {
      const { data: previousResult } = await supabase
        .from('exam_results')
        .select('*')
        .eq('exam_id', examId)
        .or(`student_id.eq.${currentUser.id},username.eq.${currentUser.username}`)
        .maybeSingle();

      if (previousResult) {
        setIsExamSubmitted(true);
        return;
      }

      const { data: examData } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (examData) {
        setActiveExam(examData);
        setExamTimeLeft((examData.duration_minutes || 30) * 60);
        setIsExamSubmitted(false);
        setExamAnswers({});
      }
    };

    if (activeClass?.is_exam_active && activeClass?.active_exam_id) {
      if (!isExamSubmitted) {
        loadExam(activeClass.active_exam_id);
      }
    } else {
      setActiveExam(null);
    }
  }, [activeClass?.is_exam_active, activeClass?.active_exam_id, currentUser, isExamSubmitted]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeExam && examTimeLeft > 0 && !isExamSubmitted && !showResultModal) {
      timer = setInterval(() => {
        setExamTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            submitExamAnswers(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeExam, examTimeLeft, isExamSubmitted, showResultModal]);

  const handleOptionSelect = (questionNumber: number, optionIndex: number) => {
    setExamAnswers(prev => ({ ...prev, [questionNumber]: optionIndex }));
  };

  const submitExamAnswers = async (autoSubmitted = false) => {
    if (!activeExam) return;
    if (!autoSubmitted) {
      const confirmSubmit = window.confirm('ඔබේ සියලුම පිළිතුරු සබ්මිට් කිරීමට තහවුරු කරන්න.');
      if (!confirmSubmit) return;
    }

    let correctCount = 0;
    const correctAnswers = activeExam.correct_answer || {};

    for (let i = 1; i <= activeExam.total_questions; i++) {
      if (examAnswers[i] && correctAnswers[i] && Number(examAnswers[i]) === Number(correctAnswers[i])) {
        correctCount++;
      }
    }

    try {
      await supabase.from('exam_results').insert([
        {
          username: currentUser.username,
          student_id: currentUser.id,
          exam_id: activeExam.id,
          score: correctCount,
          meta_data: examAnswers,
          submitted_at: new Date().toISOString()
        }
      ]);

      setExamResult({ score: correctCount, total: activeExam.total_questions });
      setShowResultModal(true);
      setIsExamSubmitted(true);
      setActiveExam(null);
    } catch (err) {
      console.error('Error submitting exam:', err);
      alert('පිළිතුරු පත්‍රය සබ්මිට් කිරීමේදී දෝෂයක් සිදු විය.');
    }
  };

  const formatExamTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">
        දත්ත පූරණය වෙමින් පවතී...
      </div>
    );
  }

  if (!hasPaymentAccess && accessRestrictedDetails) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">පන්තිය සඳහා ප්‍රවේශය සීමා කර ඇත</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            කරුණාකර <span className="text-amber-400 font-bold">{accessRestrictedDetails.classType}</span> සඳහා{' '}
            <span className="text-amber-400 font-bold">{accessRestrictedDetails.year} {accessRestrictedDetails.month}</span> මාසික ගාස්තුව ගෙවා පන්තිය සඳහා සම්බන්ධ වන්න.
          </p>
          <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 text-left mb-6 text-xs text-gray-400 space-y-2">
            <div className="flex justify-between">
              <span>පන්ති වර්ගය:</span>
              <span className="text-gray-200 font-bold">{accessRestrictedDetails.classType}</span>
            </div>
            <div className="flex justify-between">
              <span>අදාළ මාසය:</span>
              <span className="text-gray-200 font-bold">{accessRestrictedDetails.year} - {accessRestrictedDetails.month}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            ගෙවීම් සිදුකර ඇත්නම් කරුණාකර පද්ධතියෙන් ඉවත් වී නැවත ලොග් වන්න හෝ ඇඩ්මින් සම්බන්ධ කරගන්න.
          </p>
        </div>
      </div>
    );
  }

  if (upcomingClasses.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <CalendarIcon className="text-blue-500" size={28} />
            <h2 className="text-2xl font-bold text-gray-200">ඉදිරි පන්ති කාලසටහන (Class Schedule)</h2>
          </div>

          {calendarEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {calendarEvents.map(evt => (
                <div key={evt.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-blue-500/40 transition">
                  <span className="bg-blue-500/10 text-blue-400 text-xs px-3 py-1 rounded-full font-bold uppercase">
                    {evt.target_class_type || evt.class_type}
                  </span>
                  <h3 className="text-xl font-bold mt-4 mb-2 text-white">{evt.title}</h3>
                  <p className="text-gray-400 text-sm mb-4">{evt.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400 border-t border-gray-800 pt-4">
                    <span className="flex items-center gap-1"><CalendarIcon size={14} /> {evt.date}</span>
                    <span className="flex items-center gap-1"><Clock size={14} /> {evt.start_time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-900/50 border border-gray-800 rounded-3xl">
              <AlertCircle size={48} className="mx-auto text-gray-600 mb-4" />
              <h3 className="text-xl font-bold text-gray-400">පැය 24ක් ඇතුළත හෝ ඉදිරියට කාලසටහන් කළ පන්ති නොමැත.</h3>
              <p className="text-gray-600 text-sm mt-2">නව පන්ති වේලාවන් ළඟදීම යාවත්කාලීන කරනු ඇත.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isLive = (activeClass.status || '').toLowerCase() === 'live' || activeClass.is_active === true;
  const classDateTime = new Date(`${activeClass.date} ${activeClass.time}`);
  
  // පන්තියට ඉතිරිව ඇති කාලය තත්පර වලින් (සෘණ අගයක් නම් පන්තිය පටන් ගැනීමට නියමිත වේලාව පසුවී ඇත)
  const diffSeconds = Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000);
  
  // පන්තියට පැයක් ඇතුළත හෝ වේලාව පසුවී ඇත්නම් (diffSeconds <= 3600)
  const isWithinOneHour = diffSeconds <= 3600; 
  // පන්තියට විනාඩි 10ක් ඇතුළත හෝ වේලාව පසුවී ඇත්නම් (diffSeconds <= 600)
  const isWithinTenMins = diffSeconds <= 600;

  if (!isLive && !isWithinOneHour) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-200 mb-6 flex items-center gap-3">
            <Clock className="text-amber-500" size={28} /> පැය 24ක් ඇතුළත පැවැත්වෙන පන්ති
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingClasses.map((cls, idx) => {
              const clsTime = new Date(`${cls.date} ${cls.time}`);
              const secDiff = Math.max(0, Math.floor((clsTime.getTime() - currentTime.getTime()) / 1000));
              const hrs = Math.floor(secDiff / 3600);
              const mins = Math.floor((secDiff % 3600) / 60);

              return (
                <div key={cls.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden">
                  {idx === 0 && <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>}
                  <span className="bg-amber-500/10 text-amber-400 text-xs px-3 py-1 rounded-full font-bold uppercase">
                    {cls.target_class_type || cls.class_type}
                  </span>
                  <h3 className="text-xl font-bold mt-4 mb-2 text-white">{cls.title}</h3>
                  <p className="text-gray-400 text-sm mb-4">දිනය: {cls.date} | වේලාව: {cls.time}</p>
                  <div className="bg-black/60 p-4 rounded-xl border border-gray-800 text-center">
                    <p className="text-xs text-gray-500 mb-1">පන්තිය ආරම්භ වීමට තව</p>
                    <p className="text-xl font-mono font-bold text-amber-400">{hrs} පැය {mins} විනාඩි</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!isLive && isWithinOneHour) {
    // සෘණ අගයන් වළක්වා 00:00 ලෙස තබා ගැනීම
    const displayDiff = Math.max(0, diffSeconds);
    const countdownM = Math.floor(displayDiff / 60);
    const countdownS = displayDiff % 60;

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-3xl overflow-hidden bg-gray-950 min-h-[75vh] border border-gray-800 shadow-2xl">
          
          {isWithinTenMins && (
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="absolute inset-0 w-full h-full object-cover opacity-30 z-0 pointer-events-none"
              src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
            />
          )}

          <div className="relative z-10 flex flex-col items-center p-8 bg-black/70 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full mb-4 border border-blue-500/30">
              {activeClass.target_class_type || activeClass.class_type} - {activeClass.title}
            </span>
            <h2 className="text-lg md:text-xl text-gray-300 text-center mb-6 font-medium">
              පන්තිය ආරම්භ වීමට තව...
            </h2>
            
            <div className="text-7xl md:text-8xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
              {String(countdownM).padStart(2, '0')}:{String(countdownS).padStart(2, '0')}
            </div>

            {diffSeconds <= 0 && (
              <p className="mt-8 text-green-400 animate-pulse text-sm font-bold bg-green-500/10 px-5 py-3 rounded-xl border border-green-500/20 flex items-center gap-2">
                <Clock size={18} /> ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLive) {
    const isExamPushed = !!activeExam;

    return (
      <div className="w-full h-screen max-h-screen bg-black text-white flex flex-col overflow-hidden">
        
        <div className="bg-gray-950 px-4 py-2.5 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-gray-200">
              {activeClass.title} {isExamPushed && <span className="text-amber-400 font-normal">| Live Exam Active</span>}
            </span>
          </div>
        </div>

        <div className={`flex-1 w-full ${isExamPushed ? 'flex flex-col lg:flex-row' : 'flex'}`}>
          
          <div className={`${isExamPushed ? 'h-[40vh] lg:h-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900' : 'w-full h-full'}`}>
            
            <div className={isExamPushed ? 'h-1/2 w-full bg-black relative' : 'w-full h-full relative bg-black'}>
              <iframe 
                src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                sandbox="allow-forms allow-scripts allow-same-origin"
                className="w-full h-full border-0 bg-white"
                title="Zoom Classroom"
              />
            </div>

            {isExamPushed && (
              <div className="h-1/2 flex flex-col bg-gray-950 overflow-hidden">
                <div className="bg-gray-900 px-4 py-2.5 flex justify-between items-center border-b border-gray-800 shrink-0">
                  <span className="text-xs font-bold text-gray-300 uppercase flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-500" /> Answer Sheet
                  </span>
                  <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded border ${examTimeLeft < 300 ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                    Time: {formatExamTime(examTimeLeft)}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  {Array.from({ length: activeExam.total_questions }, (_, i) => i + 1).map(qNum => (
                    <div key={qNum} className="flex items-center justify-between bg-gray-900 p-2 rounded-xl border border-gray-800">
                      <span className="text-xs font-mono font-bold text-gray-400 w-6">{qNum}.</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleOptionSelect(qNum, opt)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center border ${
                              examAnswers[qNum] === opt
                                ? 'bg-amber-500 border-amber-400 text-black font-black shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-gray-900 border-t border-gray-800 shrink-0">
                  <button
                    onClick={() => submitExamAnswers(false)}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Send size={14} /> Submit Answers
                  </button>
                </div>
              </div>
            )}
          </div>

          {isExamPushed && (
            <div className="h-[60vh] lg:h-full lg:w-[65%] bg-gray-900 relative">
              <iframe 
                src={getDrivePreviewUrl(activeExam.pdf_url)} 
                className="w-full h-full border-0 bg-gray-800"
                allow="fullscreen"
                title="Exam Document Viewer"
              />
            </div>
          )}
        </div>

        {showResultModal && examResult && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-green-500/30 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative">
              <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">පිළිතුරු පත්‍රය භාරගන්නා ලදී</h2>
              <p className="text-gray-400 text-xs mb-6">ඔබගේ ලකුණු ප්‍රමාණය පහතින් දැක්වේ.</p>

              <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800 mb-6">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-2">
                  නිවැරදි පිළිතුරු සංඛ්‍යාව
                </span>
                <div className="text-5xl font-black text-amber-400 flex items-baseline justify-center gap-2">
                  {examResult.score} <span className="text-2xl text-gray-600 font-normal">/ {examResult.total}</span>
                </div>
              </div>

              <button
                onClick={() => setShowResultModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition text-sm flex items-center justify-center gap-2"
              >
                <Maximize2 size={16} /> Close & Return to Full Screen Video
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  return null;
};

export default LiveClassPlayer;