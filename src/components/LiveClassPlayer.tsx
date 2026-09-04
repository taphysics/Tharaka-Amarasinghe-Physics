import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, addMonths } from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Send, 
  CheckCircle2, 
  Lock, 
  FileText, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Video,
  Sparkles
} from 'lucide-react';

interface Student {
  id: string;
  username: string;
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
  date: string;
  time: string;
  class_type?: string;
  target_class_type?: string;
  target_classes?: string[];
  target_month?: string;
  status?: string;
  zoom_join_url: string;
  zoom_meeting_id?: string;
  is_exam_active?: boolean;
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
  description?: string;
  start_time: string;
  class_type?: string;
  target_class_type?: string;
}

// ----------------------------------------------------------------------
// 12-Hour / 24-Hour & Diverse Date Format Robust Parser
// ----------------------------------------------------------------------
const parseClassDateTime = (dateStr: string, timeStr: string): Date => {
  if (!dateStr) return new Date();

  try {
    // 1. Clean & Parse Date String (Handles YYYY-MM-DD, DD/MM/YYYY, etc.)
    let cleanDate = dateStr.trim().replace(/\//g, '-');
    const dateParts = cleanDate.split('-');
    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = new Date().getDate();

    if (dateParts.length === 3) {
      if (dateParts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        day = parseInt(dateParts[2], 10);
      } else if (dateParts[2].length === 4) {
        // DD-MM-YYYY
        year = parseInt(dateParts[2], 10);
        month = parseInt(dateParts[1], 10) - 1;
        day = parseInt(dateParts[0], 10);
      }
    }

    // 2. Clean & Parse Time String (Handles 12h AM/PM & 24h Formats)
    let cleanTime = (timeStr || '00:00').trim().toLowerCase();
    const isPM = cleanTime.includes('pm');
    const isAM = cleanTime.includes('am');
    cleanTime = cleanTime.replace(/am|pm/gi, '').trim();

    const timeParts = cleanTime.split(':');
    let hours = parseInt(timeParts[0] || '0', 10);
    let minutes = parseInt(timeParts[1] || '0', 10);

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    const parsedDate = new Date(year, month, day, hours, minutes, 0);
    return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  } catch (err) {
    return new Date();
  }
};

// Convert Zoom standard URL to Web Embedded Join URL
const getEmbeddableZoomUrl = (joinUrl: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
};

// Convert Google Drive view link to embeddable preview link
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
  const [studentProfile, setStudentProfile] = useState<Student | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());

  const [hasPaymentAccess, setHasPaymentAccess] = useState<boolean>(true);
  const [accessRestrictedDetails, setAccessRestrictedDetails] = useState<{
    classType: string;
    month: string;
    year: string;
  } | null>(null);

  // Exam States
  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  // Live Timer Tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Realtime Supabase Subscriptions & Data Fetching
  useEffect(() => {
    initDataFetch();

    const channel = supabase
      .channel('live-class-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => initDataFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => initDataFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calender_events' }, () => initDataFetch())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.username, currentUser?.id]);

  const initDataFetch = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const currentMonthStr = format(now, 'yyyy-MM');

      // 1. Fetch & Sync Full Student Profile
      let fullStudent: Student = currentUser;
      if (currentUser?.username || currentUser?.id) {
        const query = supabase.from('students').select('*');
        if (currentUser.username) query.eq('username', currentUser.username);
        else if (currentUser.id) query.eq('id', currentUser.id);

        const { data: stData } = await query.maybeSingle();
        if (stData) fullStudent = { ...currentUser, ...stData };
      }
      setStudentProfile(fullStudent);

      // Collect all enrolled class identifiers for filtering
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

      // Filter upcoming or active lives
      const activeOrUpcomingLives: ScheduledLive[] = [];
      validLives.forEach((cls: ScheduledLive) => {
        const status = (cls.status || '').toLowerCase();
        const isLive = status === 'live' || cls.is_active === true;
        
        const classDateTime = parseClassDateTime(cls.date, cls.time);
        const diffHours = (classDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (isLive || (diffHours >= -24 && diffHours <= 72)) {
          activeOrUpcomingLives.push(cls);
        }
      });

      // Sort: LIVE status FIRST, then chronological by date/time
      activeOrUpcomingLives.sort((a, b) => {
        const aLive = (a.status || '').toLowerCase() === 'live' || a.is_active === true;
        const bLive = (b.status || '').toLowerCase() === 'live' || b.is_active === true;
        if (aLive && !bLive) return -1;
        if (!aLive && bLive) return 1;

        const dateA = parseClassDateTime(a.date, a.time).getTime();
        const dateB = parseClassDateTime(b.date, b.time).getTime();
        return dateA - dateB;
      });

      setUpcomingClasses(activeOrUpcomingLives);

      // 3. Fetch Calendar Events
      const { data: calData } = await supabase
        .from('calender_events')
        .select('*')
        .order('date', { ascending: true });

      if (calData) {
        const matchingCalEvents = calData.filter((evt: CalendarEvent) => matchesStudentClass(evt.target_class_type || evt.class_type));
        setCalendarEvents(matchingCalEvents);
      }

      // 4. Payment Verification
      if (activeOrUpcomingLives.length > 0) {
        await verifyPaymentAccess(activeOrUpcomingLives[0], fullStudent, currentMonthStr);
      } else {
        setHasPaymentAccess(true);
      }

    } catch (err) {
      console.error('Error fetching live class data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Payment Verification Logic
  const verifyPaymentAccess = async (targetClass: ScheduledLive, student: Student, defaultMonth: string) => {
    const classType = targetClass.target_class_type || targetClass.class_type || 'General Class';
    const targetMonth = targetClass.target_month || defaultMonth;
    const [yearVal, monthVal] = targetMonth.includes('-') 
      ? targetMonth.split('-') 
      : [format(new Date(), 'yyyy'), targetMonth];

    const activeMonths = student?.active_months || [];
    const freeMonths = student?.free_months || [];

    const isDirectApproved = 
      activeMonths.some(m => m.includes(targetMonth) || targetMonth.includes(m)) ||
      freeMonths.some(m => m.includes(targetMonth) || targetMonth.includes(m)) ||
      student?.is_paid === true;

    if (isDirectApproved) {
      setHasPaymentAccess(true);
      return;
    }

    const { data: paymentRecords } = await supabase
      .from('payments')
      .select('*')
      .or(`username.eq.${student.username},student_id.eq.${student.id}`);

    const isPaidInTable = Array.isArray(paymentRecords) && paymentRecords.some(p => {
      const pMonth = p.target_month || p.month || '';
      const pStatus = (p.status || '').toLowerCase();
      const pClassType = (p.class_type || p.class_name || '').toLowerCase();

      const isMonthMatch = pMonth.includes(targetMonth) || targetMonth.includes(pMonth);
      const isStatusApproved = ['approved', 'paid', 'success', 'free'].includes(pStatus);
      const isClassMatch = !pClassType || pClassType.includes(classType.toLowerCase()) || classType.toLowerCase().includes(pClassType);

      return isMonthMatch && isStatusApproved && isClassMatch;
    });

    if (isPaidInTable) {
      setHasPaymentAccess(true);
    } else {
      setHasPaymentAccess(false);
      setAccessRestrictedDetails({
        classType,
        month: monthVal,
        year: yearVal
      });
    }
  };

  const activeClass = upcomingClasses[0];

  // Exam Logic Handler
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
      if (!isExamSubmitted) loadExam(activeClass.active_exam_id);
    } else {
      setActiveExam(null);
    }
  }, [activeClass?.is_exam_active, activeClass?.active_exam_id, currentUser, isExamSubmitted]);

  // Exam Timer Tick
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

  // ----------------------------------------------------------------------
  // VIEW RENDERING LOGIC
  // ----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-black text-white font-semibold gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm">දත්ත පූරණය වෙමින් පවතී, කරුණාකර රැඳී සිටින්න...</p>
      </div>
    );
  }

  // 1. PAYMENT RESTRICTED VIEW
  if (!hasPaymentAccess && accessRestrictedDetails) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
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
          <p className="text-xs text-gray-500 leading-normal">
            ගෙවීම් සිදුකර ඇත්නම් කරුණාකර පද්ධතියෙන් ඉවත් වී නැවත ලොග් වන්න හෝ ආයතන කළමනාකාරිත්වය සම්බන්ධ කරගන්න.
          </p>
        </div>
      </div>
    );
  }

  // Timing Calculations
  const statusStr = (activeClass?.status || '').trim().toLowerCase();
  const isLive = statusStr === 'live' || activeClass?.is_active === true;
  const classDateTime = activeClass ? parseClassDateTime(activeClass.date, activeClass.time) : new Date();
  
  const diffSeconds = activeClass ? Math.floor((classDateTime.getTime() - currentTime.getTime()) / 1000) : 999999;
  
  // Under 12 Hours (43,200 Seconds)
  const isWithin12Hours = activeClass && (diffSeconds <= 43200);
  
  // Under 30 Minutes (1,800 Seconds)
  const isWithin30Mins = activeClass && (diffSeconds <= 1800);

  // ----------------------------------------------------------------------
  // 2. LIVE EMBEDDED ZOOM PLAYER (Highest Priority when admin sets Live)
  // ----------------------------------------------------------------------
  if (isLive) {
    const isExamPushed = !!activeExam;

    return (
      <div className="w-full h-screen max-h-screen bg-black text-white flex flex-col overflow-hidden">
        {/* Top Live Bar */}
        <div className="bg-gray-950 px-4 py-2.5 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-gray-200">
              {activeClass.title} {isExamPushed && <span className="text-amber-400 font-normal">| සජීවී පරීක්ෂණය සක්‍රීයයි</span>}
            </span>
          </div>
        </div>

        {/* Embedded Viewport */}
        <div className={`flex-1 w-full ${isExamPushed ? 'flex flex-col lg:flex-row' : 'flex'}`}>
          <div className={`${isExamPushed ? 'h-[40vh] lg:h-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900' : 'w-full h-full'}`}>
            
            {/* Embedded Zoom Iframe with full Camera and Mic privileges */}
            <div className={isExamPushed ? 'h-1/2 w-full bg-black relative' : 'w-full h-full relative bg-black'}>
              <iframe 
                src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                sandbox="allow-forms allow-scripts allow-same-origin"
                className="w-full h-full border-0 bg-white"
                title="Zoom Classroom"
              />
            </div>

            {/* Split-screen Exam Sheet if Exam Active */}
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

          {/* Exam PDF Viewer */}
          {isExamPushed && (
            <div className="h-[60vh] lg:h-full lg:w-[65%] bg-gray-900 relative">
              <iframe 
                src={getDrivePreviewUrl(activeExam.pdf_url)} 
                className="w-full h-full border-0 bg-gray-800"
                allow="fullscreen"
                title="Exam PDF Document Viewer"
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

  // ----------------------------------------------------------------------
  // 3. LAST 30-MINUTES WAITING VIDEO PLAYER
  // ----------------------------------------------------------------------
  if (isWithin30Mins) {
    const displayDiff = Math.max(0, diffSeconds);
    const countdownM = Math.floor(displayDiff / 60);
    const countdownS = displayDiff % 60;

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-3xl overflow-hidden bg-gray-950 min-h-[75vh] border border-gray-800 shadow-2xl">
          
          <video 
            autoPlay 
            loop 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-35 z-0 pointer-events-none"
            src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
          />

          <div className="relative z-10 flex flex-col items-center p-8 md:p-10 bg-black/80 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl text-center space-y-6">
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
                <Video size={18} /> ගුරුතුමා විසින් පන්තිය සක්‍රීය (Live) කරන තුරු මඳක් රැඳී සිටින්න...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // 4. LAST 12-HOURS CHRONOLOGICAL LIST VIEW (Calendar disappears)
  // ----------------------------------------------------------------------
  if (isWithin12Hours) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-3xl flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock size={28} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">අද දින පැවැත්වෙන සජීවී පන්ති කාලසටහන</h2>
              <p className="text-gray-400 text-xs mt-1">
                පන්තිය ආරම්භ වීමට පැය 12 කට ආසන්න බැවින් අද දින පන්ති ලැයිස්තුව පහතින් වේලාව අනුව දැක්වේ.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {upcomingClasses.map((cls, idx) => {
              const clsTime = parseClassDateTime(cls.date, cls.time);
              const secDiff = Math.max(0, Math.floor((clsTime.getTime() - currentTime.getTime()) / 1000));
              const hrs = Math.floor(secDiff / 3600);
              const mins = Math.floor((secDiff % 3600) / 60);

              return (
                <div 
                  key={cls.id} 
                  className={`bg-gray-900 border rounded-2xl p-6 transition flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden ${
                    idx === 0 ? 'border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-gray-800'
                  }`}
                >
                  {idx === 0 && <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>}
                  <div className="space-y-2">
                    <span className="bg-amber-500/10 text-amber-400 text-xs px-3 py-1 rounded-full font-bold uppercase border border-amber-500/20">
                      {cls.target_class_type || cls.class_type || 'General'}
                    </span>
                    <h3 className="text-xl font-bold text-white">{cls.title}</h3>
                    <p className="text-gray-400 text-sm font-mono flex items-center gap-3">
                      <span>දිනය: {cls.date}</span>
                      <span>|</span>
                      <span>වේලාව: {cls.time}</span>
                    </p>
                  </div>

                  <div className="bg-black/80 px-6 py-4 rounded-xl border border-gray-800 text-center shrink-0 min-w-[180px]">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ආරම්භ වීමට තව</p>
                    <p className="text-2xl font-mono font-black text-amber-400">{hrs}h {mins}m</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // 5. CALENDAR VIEW (Show when class is > 12 hours away or no live class)
  // ----------------------------------------------------------------------
  const monthStart = startOfMonth(currentCalendarMonth);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getEventsForDate = (dayDate: Date) => {
    const dayStr = format(dayDate, 'yyyy-MM-dd');
    return calendarEvents.filter(evt => {
      const evtDateStr = evt.date.replace(/\//g, '-');
      return evtDateStr === dayStr;
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/60 p-6 rounded-3xl border border-gray-800 backdrop-blur-md">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
              <CalendarIcon className="text-blue-500" size={32} /> පන්ති කාලසටහන් කැළැන්ඩරය
            </h1>
            <p className="text-gray-400 text-xs md:text-sm mt-1">
              ඉදිරි පන්ති පැවැත්වෙන දිනයන් සහ වේලාවන් පහත කැළැන්ඩරයෙන් පරීක්ෂා කරගත හැක.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-gray-950 px-4 py-2 rounded-2xl border border-gray-800 self-start md:self-auto">
            <button 
              onClick={() => setCurrentCalendarMonth(subMonths(currentCalendarMonth, 1))}
              className="p-1.5 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-mono font-bold text-sm min-w-[120px] text-center text-blue-400">
              {format(currentCalendarMonth, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setCurrentCalendarMonth(addMonths(currentCalendarMonth, 1))}
              className="p-1.5 hover:bg-gray-800 rounded-lg transition text-gray-400 hover:text-white"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 md:p-6 shadow-2xl overflow-hidden">
          
          <div className="grid grid-cols-7 gap-2 mb-4 text-center font-bold text-xs text-gray-500 uppercase tracking-wider">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((dayDate, idx) => {
              const dayEvents = getEventsForDate(dayDate);
              const hasEvent = dayEvents.length > 0;
              const isToday = isSameDay(dayDate, new Date());

              return (
                <div
                  key={idx}
                  className={`min-h-[90px] md:min-h-[120px] p-2 rounded-2xl border transition relative flex flex-col justify-between ${
                    hasEvent
                      ? 'bg-blue-950/40 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse'
                      : isToday
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-gray-950/50 border-gray-800/80 hover:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                      isToday ? 'bg-amber-500 text-black' : hasEvent ? 'bg-blue-600 text-white' : 'text-gray-400'
                    }`}>
                      {format(dayDate, 'd')}
                    </span>
                    {hasEvent && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                    )}
                  </div>

                  {hasEvent && (
                    <div className="mt-2 space-y-1 overflow-hidden">
                      {dayEvents.map(evt => (
                        <div 
                          key={evt.id} 
                          className="bg-blue-600/30 border border-blue-500/50 rounded-lg p-1 text-[10px] text-blue-200 truncate font-semibold"
                          title={`${evt.title} (${evt.start_time})`}
                        >
                          <span className="block font-bold text-amber-400">{evt.start_time}</span>
                          <span className="truncate block">{evt.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calendar Events List */}
        {calendarEvents.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-300 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" /> ඉදිරි පන්ති ලැයිස්තුව
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calendarEvents.map(evt => (
                <div key={evt.id} className="bg-gray-900 border border-gray-800 hover:border-blue-500/40 p-5 rounded-2xl transition space-y-2">
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border border-blue-500/20">
                    {evt.target_class_type || evt.class_type || 'General'}
                  </span>
                  <h4 className="text-base font-bold text-white leading-snug">{evt.title}</h4>
                  {evt.description && <p className="text-gray-400 text-xs">{evt.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t border-gray-800/80 font-mono">
                    <span className="flex items-center gap-1 text-amber-400"><CalendarIcon size={13} /> {evt.date}</span>
                    <span className="flex items-center gap-1 text-blue-400"><Clock size={13} /> {evt.start_time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default LiveClassPlayer;