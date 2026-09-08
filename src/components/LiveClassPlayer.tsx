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
  active_months?: string[];
  free_months?: string[];
  is_paid?: boolean;
  class?: string;
  course?: string;
  enrolled_coures?: string[];
}

interface ScheduledLive {
  id: string;
  title: string;
  platform?: string;
  link?: string;
  date: string;
  time: string;
  target_month?: string;
  target_classes?: string[];
  class_type?: string;
  target_class_type?: string;
  status?: string;
  is_active?: boolean;
  zoom_meeting_id?: string;
  zoom_start_url?: string;
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
// 12-Hour Time & Date Formatter & Parser Helpers
// --------------------------------------------------
const formatTo12Hour = (timeStr: string): string => {
  if (!timeStr) return '';
  const clean = timeStr.trim().toLowerCase();
  if (clean.includes('am') || clean.includes('pm')) {
    return timeStr.toUpperCase();
  }
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

  let cleanDate = dateStr.trim().replace(/\//g, '-');
  const dateParts = cleanDate.split('-');
  if (dateParts.length === 3) {
    if (dateParts[0].length === 2 && dateParts[2].length === 4) {
      cleanDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
    } else if (dateParts[0].length === 4) {
      cleanDate = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
    }
  }

  let cleanTime = (timeStr || '00:00').trim().toUpperCase();
  const isPM = cleanTime.includes('PM');
  const isAM = cleanTime.includes('AM');
  cleanTime = cleanTime.replace(/AM|PM/g, '').trim().replace('.', ':');

  const timeParts = cleanTime.split(':');
  let hours = parseInt(timeParts[0] || '0', 10);
  let minutes = parseInt(timeParts[1] || '0', 10);

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  const hoursStr = String(hours).padStart(2, '0');
  const minutesStr = String(minutes).padStart(2, '0');

  const parsedDate = new Date(`${cleanDate}T${hoursStr}:${minutesStr}:00`);

  if (isNaN(parsedDate.getTime())) {
    const fallback = new Date(`${dateStr} ${timeStr}`);
    return isNaN(fallback.getTime()) ? new Date() : fallback;
  }

  return parsedDate;
};

// Convert Zoom URL to Web Client Join URL
const getEmbeddableZoomUrl = (joinUrl?: string, meetingId?: string) => {
  if (!joinUrl && !meetingId) return '';
  if (joinUrl && joinUrl.includes('/wc/')) return joinUrl;

  if (joinUrl) {
    try {
      const url = new URL(joinUrl);
      if (url.pathname.includes('/j/')) {
        url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
        return url.toString();
      }
    } catch (e) {
      // Ignore URL parse fail
    }
  }

  if (meetingId) {
    return `https://zoom.us/wc/${meetingId}/join`;
  }

  return joinUrl || '';
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
    initDataFetch();

    const channel = supabase
      .channel('live-classroom-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_lives' },
        () => initDataFetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.username, currentUser?.id]);

  const initDataFetch = async () => {
    setIsLoading(true);
    try {
      // 1. Get full Student Profile
      let fullStudent: Student = currentUser;
      if (currentUser?.username || currentUser?.id) {
        const query = supabase.from('students').select('*');
        if (currentUser.username) query.eq('username', currentUser.username);
        else if (currentUser.id) query.eq('id', currentUser.id);

        const { data: stData } = await query.maybeSingle();
        if (stData) fullStudent = { ...currentUser, ...stData };
      }

      // Collect all student enrolled class identifiers
      const studentClassesSet = new Set<string>();
      if (Array.isArray(fullStudent.class_types)) {
        fullStudent.class_types.forEach(c => c && studentClassesSet.add(String(c).trim().toLowerCase()));
      }
      if (fullStudent.class) studentClassesSet.add(String(fullStudent.class).trim().toLowerCase());
      if (fullStudent.course) studentClassesSet.add(String(fullStudent.course).trim().toLowerCase());
      if (Array.isArray(fullStudent.enrolled_coures)) {
        fullStudent.enrolled_coures.forEach(c => c && studentClassesSet.add(String(c).trim().toLowerCase()));
      }
      const studentClassList = Array.from(studentClassesSet);

      const matchesStudentClass = (targetTypeRaw?: string, targetClassesRaw?: string[]) => {
        const targetType = (targetTypeRaw || '').trim().toLowerCase();
        const targetClasses = (targetClassesRaw || []).map(c => String(c).trim().toLowerCase());

        if (!targetType || ['all', 'public', 'general', 'all classes', 'සෑම පන්තියකටම'].includes(targetType)) {
          return true;
        }
        if (studentClassList.length === 0) return true;

        const directMatch = studentClassList.some(sc => sc === targetType || sc.includes(targetType) || targetType.includes(sc));
        const arrayMatch = targetClasses.some(tc => tc === 'all' || studentClassList.some(sc => sc === tc || sc.includes(tc) || tc.includes(sc)));

        return directMatch || arrayMatch;
      };

      // 2. Fetch Scheduled Lives
      const { data: livesData, error: livesError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .order('created_at', { ascending: false });

      if (livesError) throw livesError;

      const validLives = (livesData || []).filter((cls: ScheduledLive) => {
        const status = (cls.status || '').toLowerCase();
        if (['ended', 'completed', 'finished', 'archived'].includes(status)) return false;
        return matchesStudentClass(cls.target_class_type || cls.class_type, cls.target_classes);
      });

      // Sort: LIVE status first, then by earliest date/time
      validLives.sort((a, b) => {
        const aLive = (a.status || '').toLowerCase() === 'live' || a.is_active === true;
        const bLive = (b.status || '').toLowerCase() === 'live' || b.is_active === true;
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;

        const dateA = parseClassDateTime(a.date, a.time).getTime();
        const dateB = parseClassDateTime(b.date, b.time).getTime();
        return dateA - dateB;
      });

      setUpcomingClasses(validLives);

    } catch (err) {
      console.error('Error in initDataFetch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const activeClass = upcomingClasses[0];

  // Exam Loading
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

  // Exam Countdown
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

  // Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-black text-white font-semibold gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm">දත්ත පූරණය වෙමින් පවතී, කරුණාකර රැඳී සිටින්න...</p>
      </div>
    );
  }

  // Calculate timing state
  const statusStr = (activeClass?.status || '').toLowerCase();
  const isLive = statusStr === 'live' || activeClass?.is_active === true;

  const classDateTime = activeClass ? parseClassDateTime(activeClass.date, activeClass.time) : new Date();
  const diffSeconds = activeClass ? Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000) : 999999;

  // 1 Hour = 3600 seconds. 
  const isWithin1Hour = activeClass && (diffSeconds <= 3600);

  // --------------------------------------------------
  // 1. LIVE EMBEDDED ZOOM PLAYER (PRIORITY #1 - IF STATUS IS LIVE, SHOW IMMEDIATELY!)
  // --------------------------------------------------
  if (isLive && activeClass) {
    const isExamPushed = !!activeExam;

    return (
      <div className="w-full h-screen max-h-screen bg-black text-white flex flex-col overflow-hidden">

        {/* Top Header */}
        <div className="bg-gray-950 px-4 py-2.5 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-gray-200">
              {activeClass.title} <span className="text-xs text-amber-400 font-normal">({formatTo12Hour(activeClass.time)})</span>
              {isExamPushed && <span className="text-amber-400 font-normal ml-2">| Live Exam Active</span>}
            </span>
          </div>
        </div>

        {/* Live Zoom Main Container */}
        <div className={`flex-1 w-full ${isExamPushed ? 'flex flex-col lg:flex-row' : 'flex'}`}>

          {/* Zoom Player Section */}
          <div className={`${isExamPushed ? 'h-[40vh] lg:h-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900' : 'w-full h-full'}`}>
            <div className={isExamPushed ? 'h-1/2 w-full bg-black relative' : 'w-full h-full relative bg-black'}>
              <iframe 
                src={getEmbeddableZoomUrl(activeClass.zoom_join_url, activeClass.zoom_meeting_id)} 
                allow="camera *; microphone *; fullscreen; display-capture; autoplay"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"
                className="w-full h-full border-0 bg-white"
                title="Zoom Classroom"
              />
            </div>

            {/* MCQ Answer Sheet if Exam Active */}
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

          {/* PDF Viewer Section */}
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

        {/* Results Modal */}
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
                <Maximize2 size={16} /> Close & Return to Live Video
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  // --------------------------------------------------
  // 2. WAITING VIDEO PLAYER (Last 1 hour, waits until Admin starts Zoom)
  // --------------------------------------------------
  if (!isLive && isWithin1Hour && activeClass) {
    // If diffSeconds goes below 0 (time passed but admin hasn't started), 
    // keep countdown at 00:00 and keep showing this screen.
    const displayDiff = Math.max(0, diffSeconds);
    const countdownM = Math.floor(displayDiff / 60);
    const countdownS = displayDiff % 60;

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-3xl overflow-hidden bg-gray-950 min-h-[80vh] border border-gray-800 shadow-2xl">

          {/* Waiting Video Background */}
          <video 
            autoPlay 
            loop 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none"
            src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
          />

          {/* Countdown & Waiting Overlay Card */}
          <div className="relative z-10 flex flex-col items-center p-8 md:p-12 bg-black/85 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl text-center space-y-6">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30">
              {activeClass.target_class_type || activeClass.class_type || 'General Class'} - {activeClass.title}
            </span>

            <h2 className="text-lg md:text-xl text-gray-300 font-medium">
              පන්තිය ආරම්භ වීමට තව...
            </h2>

            <div className="text-7xl md:text-8xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">
              {String(countdownM).padStart(2, '0')}:{String(countdownS).padStart(2, '0')}
            </div>

            <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-2xl w-full">
              <p className="text-green-400 animate-pulse text-xs md:text-sm font-bold flex items-center justify-center gap-2">
                <Video size={18} /> ගුරුතුමා පැමිණෙන තුරු රැඳී සිටින්න...
              </p>
            </div>

            <p className="text-[11px] text-gray-400 font-mono">
              ආරම්භක වේලාව: {formatTo12Hour(activeClass.time)} ({activeClass.date})
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // 3. UPCOMING CLASSES LIST (More than 1 hour away)
  // --------------------------------------------------
  if (upcomingClasses.length > 0) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-blue-900/20 border border-blue-500/30 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock size={28} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">ඉදිරි සජීවී පන්ති කාලසටහන</h2>
              <p className="text-gray-400 text-xs mt-1">
                පන්තිය ආරම්භ වීමට පැයකට පෙර ඔබට පන්තියට සම්බන්ධ වීමට හැකිවනු ඇත.
              </p>
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
                <div 
                  key={cls.id} 
                  className={`bg-gray-900 border rounded-2xl p-6 transition flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden ${
                    idx === 0 ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'border-gray-800'
                  }`}
                >
                  {idx === 0 && <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>}
                  <div className="space-y-2">
                    <span className="bg-blue-500/10 text-blue-400 text-xs px-3 py-1 rounded-full font-bold uppercase border border-blue-500/20">
                      {cls.target_class_type || cls.class_type || 'General'}
                    </span>
                    <h3 className="text-xl font-bold text-white">{cls.title}</h3>
                    <p className="text-gray-400 text-sm font-mono flex items-center gap-3">
                      <span>දිනය: {cls.date}</span>
                      <span>|</span>
                      <span>වේලාව: {formatTo12Hour(cls.time)}</span>
                    </p>
                  </div>

                  <div className="bg-black/80 px-6 py-4 rounded-xl border border-gray-800 text-center shrink-0 min-w-[180px]">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ආරම්භ වීමට තව</p>
                    <p className="text-xl font-mono font-black text-amber-400">
                      {days > 0 && `${days}d `}{hrs}h {mins}m
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // 4. NO UPCOMING CLASSES
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-20 h-20 bg-gray-900 border border-gray-800 text-gray-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-300">ඉදිරියේදී පන්ති කිසිවක් නොමැත</h2>
        <p className="text-gray-500 text-sm">
          මේ මොහොතේ ඔබගේ ගිණුමට අදාලව කාලසටහන්ගත කල සජීවී පන්ති කිසිවක් නොමැත. කරුණාකර පසුව නැවත පරීක්ෂා කරන්න.
        </p>
      </div>
    </div>
  );
};

export default LiveClassPlayer;