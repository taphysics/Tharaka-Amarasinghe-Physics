import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Clock, 
  Send, 
  CheckCircle2, 
  FileText, 
  Maximize2,
  Video,
  AlertTriangle
} from 'lucide-react';

interface Student {
  id: string;
  username: string;
  name?: string;
  class_types?: string[];
  class?: string;
  course?: string;
  enrolled_coures?: string[];
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  target_classes?: string[];
  target_class_type?: string;
  status?: string;
  zoom_meeting_id?: string;
  zoom_join_url: string;
  pre_class_video_path?: string;
  is_exam_active?: boolean;
  active_exam_id?: string;
}

interface ExamData {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

// --------------------------------------------------
// Time & Date Formatter Helpers
// --------------------------------------------------
const formatTo12Hour = (timeStr: string): string => {
  if (!timeStr) return '';
  const clean = timeStr.trim().toLowerCase();
  if (clean.includes('am') || clean.includes('pm')) return timeStr.toUpperCase();
  const parts = clean.split(':');
  let hours = parseInt(parts[0] || '0', 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes.slice(0, 2)} ${ampm}`;
};

const parseClassDateTime = (dateStr: string, timeStr: string): Date => {
  if (!dateStr) return new Date();
  const cleanDate = dateStr.trim().replace(/\//g, '-');
  const cleanTime = (timeStr || '00:00').trim().toUpperCase().replace(/AM|PM/g, '').trim();
  
  const parsedDate = new Date(`${cleanDate}T${cleanTime}:00`);
  if (isNaN(parsedDate.getTime())) {
    return new Date(`${dateStr} ${timeStr}`);
  }
  return parsedDate;
};

// --------------------------------------------------
// Zoom URL to Embeddable Web Client URL Converter
// --------------------------------------------------
const getEmbeddableZoomUrl = (joinUrl?: string) => {
  if (!joinUrl) return '';
  try {
    const urlObj = new URL(joinUrl);
    // Convert standard /j/ zoom link to /wc/ web client link for embedding
    if (urlObj.pathname.startsWith('/j/')) {
      const meetingId = urlObj.pathname.split('/')[2];
      urlObj.pathname = `/wc/${meetingId}/join`;
      return urlObj.toString();
    }
    return joinUrl;
  } catch (e) {
    return joinUrl;
  }
};

const getDrivePreviewUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/view')) return url.replace('/view', '/preview');
  if (url.includes('drive.google.com') && !url.includes('/preview')) return `${url}/preview`;
  return url;
};

export default function LiveClassPlayer({ currentUser }: { currentUser: Student }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Exam States
  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  // Live Clock Tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Data & Setup Realtime Listeners
  useEffect(() => {
    fetchLives();

    const channel = supabase
      .channel('live-classroom-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchLives())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => fetchLives())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.username, currentUser?.id]);

  const fetchLives = async () => {
    setIsLoading(true);
    try {
      // Collect student's classes to filter targeted classes
      const studentClassesSet = new Set<string>();
      if (Array.isArray(currentUser.class_types)) currentUser.class_types.forEach(c => c && studentClassesSet.add(c.trim().toLowerCase()));
      if (currentUser.class) studentClassesSet.add(currentUser.class.trim().toLowerCase());
      if (currentUser.course) studentClassesSet.add(currentUser.course.trim().toLowerCase());
      if (Array.isArray(currentUser.enrolled_coures)) currentUser.enrolled_coures.forEach(c => c && studentClassesSet.add(c.trim().toLowerCase()));
      
      const studentClassList = Array.from(studentClassesSet);

      const isTargetedStudent = (classTypeRaw?: string, targetArrayRaw?: string[]) => {
        const typeStr = (classTypeRaw || '').trim().toLowerCase();
        const arrStr = (targetArrayRaw || []).map(c => String(c).trim().toLowerCase());
        
        if (!typeStr || ['all', 'public'].includes(typeStr)) return true;
        if (studentClassList.length === 0) return true;

        const matchesString = studentClassList.some(sc => sc.includes(typeStr) || typeStr.includes(sc));
        const matchesArray = arrStr.some(tc => studentClassList.some(sc => sc.includes(tc) || tc.includes(sc)));
        
        return matchesString || matchesArray;
      };

      const { data: livesData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .neq('status', 'ended'); // Skip ended classes

      if (livesData) {
        const validLives = livesData.filter(cls => isTargetedStudent(cls.target_class_type, cls.target_classes));
        
        // Sort: LIVE status first, then by nearest date/time
        validLives.sort((a, b) => {
          const aLive = a.status === 'live';
          const bLive = b.status === 'live';
          if (aLive && !bLive) return -1;
          if (!aLive && bLive) return 1;

          const dateA = parseClassDateTime(a.date, a.time).getTime();
          const dateB = parseClassDateTime(b.date, b.time).getTime();
          return dateA - dateB;
        });

        setUpcomingClasses(validLives);
      }
    } catch (err) {
      console.error('Data Fetch Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const activeClass = upcomingClasses[0];

  // Exam Logic
  useEffect(() => {
    const loadExam = async (examId: string) => {
      // Check if already submitted
      const { data: existingResult } = await supabase
        .from('exam_results')
        .select('id')
        .eq('exam_id', examId)
        .eq('username', currentUser.username)
        .maybeSingle();

      if (existingResult) {
        setIsExamSubmitted(true);
        return;
      }

      // Load Exam Data
      const { data: examData } = await supabase.from('exams').select('*').eq('id', examId).single();
      if (examData) {
        setActiveExam(examData);
        setExamTimeLeft((examData.duration_minutes || 30) * 60);
        setIsExamSubmitted(false);
        setExamAnswers({});
      }
    };

    if (activeClass?.is_exam_active && activeClass?.active_exam_id) {
      if (!isExamSubmitted) loadExam(activeClass.active_exam_id);
    } else {
      setActiveExam(null);
    }
  }, [activeClass?.is_exam_active, activeClass?.active_exam_id, currentUser, isExamSubmitted]);

  // Exam Countdown Timer
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

  const handleOptionSelect = (qNum: number, optIndex: number) => {
    setExamAnswers(prev => ({ ...prev, [qNum]: optIndex }));
  };

  const submitExamAnswers = async (autoSubmitted = false) => {
    if (!activeExam) return;
    if (!autoSubmitted) {
      if (!window.confirm('ඔබේ සියලුම පිළිතුරු Submit කිරීමට තහවුරු කරන්න.')) return;
    }

    let correctCount = 0;
    const correctAnswers = activeExam.correct_answer || {};

    for (let i = 1; i <= activeExam.total_questions; i++) {
      if (examAnswers[i] && correctAnswers[i] && Number(examAnswers[i]) === Number(correctAnswers[i])) {
        correctCount++;
      }
    }

    try {
      await supabase.from('exam_results').insert([{
        username: currentUser.username,
        student_id: currentUser.id,
        exam_id: activeExam.id,
        score: correctCount,
        meta_data: examAnswers,
        submitted_at: new Date().toISOString()
      }]);

      setExamResult({ score: correctCount, total: activeExam.total_questions });
      setShowResultModal(true);
      setIsExamSubmitted(true);
      setActiveExam(null);
    } catch (err) {
      console.error('Submission Error:', err);
      alert('පිළිතුරු පත්‍රය Submit කිරීමේදී දෝෂයක් සිදු විය.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-slate-950 text-white font-semibold gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm animate-pulse">පන්ති විස්තර පූරණය වෙමින් පවතී...</p>
      </div>
    );
  }

  const isLive = activeClass?.status === 'live';
  const classDateTime = activeClass ? parseClassDateTime(activeClass.date, activeClass.time) : new Date();
  const diffSeconds = activeClass ? Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000) : 999999;
  
  // Wait Room starts exactly 1 hour (3600 seconds) before. 
  const isWithin1Hour = activeClass && (diffSeconds <= 3600);

  // ---------------------------------------------------------
  // SCENARIO 1: ADMIN STARTED ZOOM (LIVE MODE)
  // ---------------------------------------------------------
  if (isLive && activeClass) {
    const isExamPushed = !!activeExam;

    return (
      <div className="w-full h-screen max-h-screen bg-slate-950 text-white flex flex-col overflow-hidden font-sans">
        
        {/* Top Live Banner */}
        <div className="bg-slate-900 px-4 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-slate-200">
              {activeClass.title} <span className="text-xs text-amber-400 font-normal">({formatTo12Hour(activeClass.time)})</span>
              {isExamPushed && <span className="text-emerald-400 font-bold ml-3 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-500/20">Live Exam Active</span>}
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 w-full ${isExamPushed ? 'flex flex-col lg:flex-row' : 'flex'}`}>
          
          {/* ZOOM IFRAME PLAYER */}
          <div className={`${isExamPushed ? 'h-[40vh] lg:h-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800' : 'w-full h-full'} bg-black relative`}>
            {/* The web client sandbox permissions are crucial for audio/video to work within iframe */}
            <iframe 
              src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-presentation"
              className="w-full h-full border-0 bg-slate-900"
              title="Zoom Live Stream"
            />

            {/* MCQ Answer Panel (Appears only if Exam is pushed) */}
            {isExamPushed && (
              <div className="h-1/2 flex flex-col bg-slate-950 border-t border-slate-800">
                <div className="bg-slate-900 px-4 py-2.5 flex justify-between items-center border-b border-slate-800 shrink-0">
                  <span className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-500" /> Answer Sheet
                  </span>
                  <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded border ${examTimeLeft < 300 ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                    Time: {Math.floor(examTimeLeft / 60).toString().padStart(2, '0')}:{(examTimeLeft % 60).toString().padStart(2, '0')}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {Array.from({ length: activeExam.total_questions }, (_, i) => i + 1).map(qNum => (
                    <div key={qNum} className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-xs font-mono font-bold text-slate-400 w-6">{qNum}.</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleOptionSelect(qNum, opt)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center border ${
                              examAnswers[qNum] === opt
                                ? 'bg-amber-500 border-amber-400 text-black font-black'
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
                  <button onClick={() => submitExamAnswers(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition">
                    <Send size={14} /> Submit Answers
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PDF Viewer for Exam */}
          {isExamPushed && (
            <div className="h-[60vh] lg:h-full lg:w-[65%] bg-slate-900 relative">
              <iframe 
                src={getDrivePreviewUrl(activeExam.pdf_url)} 
                className="w-full h-full border-0"
                allow="fullscreen"
                title="Exam PDF"
              />
            </div>
          )}
        </div>

        {/* Results Modal */}
        {showResultModal && examResult && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-emerald-500/30 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">පිළිතුරු පත්‍රය භාරගන්නා ලදී!</h2>
              <p className="text-slate-400 text-xs mb-6">ඔබගේ ලකුණු ප්‍රමාණය පහතින් දැක්වේ.</p>

              <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 mb-6">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">නිවැරදි පිළිතුරු සංඛ්‍යාව</span>
                <div className="text-5xl font-black text-amber-400 flex items-baseline justify-center gap-2">
                  {examResult.score} <span className="text-2xl text-slate-600 font-normal">/ {examResult.total}</span>
                </div>
              </div>

              <button onClick={() => setShowResultModal(false)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
                <Maximize2 size={16} /> Close & Watch Live
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------
  // SCENARIO 2: 1-HOUR WAITING ROOM (Admin not started yet)
  // ---------------------------------------------------------
  if (!isLive && isWithin1Hour && activeClass) {
    const displayDiff = Math.max(0, diffSeconds); // Stops countdown at 00:00 but stays on screen
    const countdownM = Math.floor(displayDiff / 60);
    const countdownS = displayDiff % 60;

    return (
      <div className="w-full min-h-screen bg-slate-950 text-white flex flex-col p-4 md:p-8 font-sans">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-3xl overflow-hidden bg-black min-h-[80vh] border border-slate-800 shadow-2xl">
          
          <video 
            autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-50 z-0 pointer-events-none"
            src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
          />

          <div className="relative z-10 flex flex-col items-center p-8 md:p-12 bg-slate-950/80 rounded-3xl backdrop-blur-md border border-slate-800/50 max-w-lg w-full mx-4 shadow-2xl text-center space-y-6">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30">
              {activeClass.target_class_type || 'Zoom Class'} - {activeClass.title}
            </span>

            <h2 className="text-lg md:text-xl text-slate-300 font-medium">පන්තිය ආරම්භ වීමට තව...</h2>

            <div className="text-7xl md:text-8xl font-mono font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              {String(countdownM).padStart(2, '0')}:{String(countdownS).padStart(2, '0')}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl w-full">
              <p className="text-emerald-400 animate-pulse text-xs md:text-sm font-bold flex items-center justify-center gap-2">
                <Video size={18} /> Admin විසින් පන්තිය ආරම්භ කරන තුරු රැඳී සිටින්න...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // SCENARIO 3: UPCOMING CLASSES (More than 1 hour away)
  // ---------------------------------------------------------
  if (upcomingClasses.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock size={28} className="animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">ඉදිරි සජීවී පන්ති කාලසටහන</h2>
              <p className="text-slate-400 text-xs mt-1">පන්තිය ආරම්භ වීමට පැයකට පෙර ඔබට පන්තියට සම්බන්ධ වීමට ඉඩ හිමිවේ.</p>
            </div>
          </div>

          <div className="space-y-4">
            {upcomingClasses.map((cls, idx) => {
              const clsTime = parseClassDateTime(cls.date, cls.time);
              const secDiff = Math.max(0, Math.floor((clsTime.getTime() - currentTime.getTime()) / 1000));
              const days = Math.floor(secDiff / 86400);
              const hrs = Math.floor((secDiff % 86400) / 3600);
              const mins = Math.floor((secDiff % 3600) / 60);

              return (
                <div key={cls.id} className={`bg-slate-900 border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden ${idx === 0 ? 'border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-slate-800'}`}>
                  {idx === 0 && <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>}
                  <div className="space-y-2">
                    <span className="bg-slate-800 text-slate-300 text-[10px] px-3 py-1 rounded-full font-bold uppercase border border-slate-700">
                      {cls.target_class_type || 'General'}
                    </span>
                    <h3 className="text-xl font-bold text-white">{cls.title}</h3>
                    <p className="text-slate-400 text-sm font-mono flex items-center gap-3">
                      <span>{cls.date}</span> | <span>{formatTo12Hour(cls.time)}</span>
                    </p>
                  </div>
                  <div className="bg-slate-950 px-6 py-4 rounded-xl border border-slate-800 text-center shrink-0 min-w-[180px]">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">ආරම්භ වීමට තව</p>
                    <p className="text-xl font-mono font-black text-amber-500">{days > 0 && `${days}d `}{hrs}h {mins}m</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // SCENARIO 4: NO CLASSES AVAILABLE
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-md text-center space-y-4">
        <div className="w-20 h-20 bg-slate-900 border border-slate-800 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-300">ඉදිරියේදී පන්ති කිසිවක් නොමැත</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          මේ මොහොතේ ඔබගේ ගිණුමට අදාලව කාලසටහන්ගත කල සජීවී පන්ති කිසිවක් නොමැත. කරුණාකර පසුව නැවත පරීක්ෂා කරන්න.
        </p>
      </div>
    </div>
  );
}