import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds } from 'date-fns';
import { 
  Maximize2, 
  Minimize2, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  MessageCircle, 
  ExternalLink, 
  Calendar, 
  Clock, 
  CreditCard, 
  ShieldAlert,
  Play,
  UserCheck,
  Mic,
  Video,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  ChevronUp,
  ChevronDown,
  Send,
  Check,
  X,
  FileText,
  Award,
  AlertCircle,
  HelpCircle,
  GripHorizontal
} from 'lucide-react';

interface Student {
  id?: string;
  username: string;
  name?: string;
  class_types: string[];
  free_months?: string[];
  active_months?: string[];
  plan_type?: string;
  is_paid?: boolean;
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  status: string;
  target_class_type: string;
  class_type: string;
  start_time: string;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  target_class_type?: string;
  target_classes?: string[];
  target_month?: string;
  pre_class_video_path?: string;
  status: string;
  zoom_join_url?: string;
  link?: string;
  platform?: string;
  is_exam_active?: boolean;
  active_exam_id?: string;
}

interface OnlineExam {
  id: string;
  title: string;
  class_type?: string;
  target_class_type?: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer?: Record<string, number>;
  correct_answers?: Record<string, number>;
  status?: string;
}

interface LiveClassPlayerProps {
  currentUser: Student | null;
  onNavigateToPayment?: () => void;
}

// Convert month string (e.g. "2026-10") into readable Sinhala & English display name
const getMonthDisplayName = (monthStr: string) => {
  if (!monthStr) return format(new Date(), 'MMMM yyyy');
  const clean = monthStr.trim();
  const parts = clean.split('-');
  if (parts.length === 2) {
    const mIdx = parseInt(parts[1], 10) - 1;
    const sinhalaMonths = [
      "ජනවාරි (January)", "පෙබරවාරි (February)", "මාර්තු (March)", "අප්‍රේල් (April)",
      "මැයි (May)", "ජූනි (June)", "ජූලි (July)", "අගෝස්තු (August)",
      "සැප්තැම්බර් (September)", "ඔක්තෝබර් (October)", "නොවැම්බර් (November)", "දෙසැම්බර් (December)"
    ];
    if (mIdx >= 0 && mIdx < 12) {
      return `${sinhalaMonths[mIdx]} ${parts[0]}`;
    }
  }
  return clean;
};

// Generates embeddable Zoom Web Client URL pre-filling student's username
const getEmbeddableZoomUrl = (joinUrl: string, userName: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);

    // Zoom Web Client URL structure: /wc/<meeting_id>/join
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    } else if (!url.pathname.includes('/wc/')) {
      const match = url.pathname.match(/\/(\d+)/);
      if (match && match[1]) {
        url.pathname = `/wc/${match[1]}/join`;
      }
    }

    const pwd = url.searchParams.get('pwd');
    if (pwd) url.searchParams.set('pwd', pwd);

    // Automatically fill the student's username into Zoom Attendee Name
    if (userName) {
      const trimmedUser = userName.trim();
      try {
        const encodedName = btoa(unescape(encodeURIComponent(trimmedUser)));
        url.searchParams.set('un', encodedName);
      } catch {
        url.searchParams.set('un', btoa(trimmedUser));
      }
      url.searchParams.set('uname', trimmedUser);
      url.searchParams.set('userName', trimmedUser);
      url.searchParams.set('name', trimmedUser);
    }

    url.searchParams.set('prefer', '1');
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
};

// Convert Google Drive Link to embed preview
const getEmbeddableDriveUrl = (url: string) => {
  if (!url) return '';
  try {
    if (url.includes('/preview')) return url;
    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) {
      return `https://drive.google.com/file/d/${match1[1]}/preview`;
    }
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) {
      return `https://drive.google.com/file/d/${match2[1]}/preview`;
    }
    return url;
  } catch {
    return url;
  }
};

const getClassColor = (type: string) => {
  if (!type) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  const colors = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-pink-500/10 text-pink-400 border-pink-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  ];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const LiveClassPlayer: React.FC<LiveClassPlayerProps> = ({ currentUser, onNavigateToPayment }) => {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledLives, setScheduledLives] = useState<ScheduledLive[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [freshStudent, setFreshStudent] = useState<any>(currentUser);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingPayment, setIsRefreshingPayment] = useState<boolean>(false);
  const [viewState, setViewState] = useState<'loading' | 'live' | 'waiting-0s' | 'waiting-30m' | 'waiting-24h' | 'upcoming-list' | 'no-classes'>('loading');
  const [targetClass, setTargetClass] = useState<ScheduledLive | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<{ isPaidOrFree: boolean; reason: 'paid' | 'free' | 'unpaid' }>({ isPaidOrFree: true, reason: 'paid' });
  const [timer, setTimer] = useState({ h: 0, m: 0, s: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Student username strictly used for Zoom auto-population
  const studentUsername = currentUser?.username || 'Student';

  // Browser Media Permission state (Camera & Mic across Chrome, Firefox, Safari, Edge)
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState<boolean>(false);

  // Pushed Online Exam States
  const [activeExam, setActiveExam] = useState<OnlineExam | null>(null);
  const [isExamOpen, setIsExamOpen] = useState<boolean>(false);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examSecondsLeft, setExamSecondsLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{
    score: number;
    total: number;
    percentage: number;
    summary: { questionNumber: number; userAnswer: number | null; correctAnswer: number; isCorrect: boolean }[];
  } | null>(null);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState<boolean>(false);
  const [isZoomMinimized, setIsZoomMinimized] = useState<boolean>(false);

  // Floating Player Drag and Drop State (Anywhere on screen)
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [isFloatingDragging, setIsFloatingDragging] = useState<boolean>(false);
  const [isFloatingCollapsed, setIsFloatingCollapsed] = useState<boolean>(false);
  const floatingDragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const isSubmittingExamRef = useRef<boolean>(false);

  // PDF Viewer Interactive States (Zoom, Drag, Pan, Scroll)
  const [pdfZoom, setPdfZoom] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Drag listeners for floating Zoom player
  useEffect(() => {
    if (!isFloatingDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - floatingDragStartRef.current.startX;
      const dy = e.clientY - floatingDragStartRef.current.startY;
      const newX = floatingDragStartRef.current.posX + dx;
      const newY = floatingDragStartRef.current.posY + dy;

      const playerW = isFloatingCollapsed ? 180 : 250;
      const playerH = isFloatingCollapsed ? 44 : 155;
      const maxX = Math.max(10, window.innerWidth - playerW - 10);
      const maxY = Math.max(10, window.innerHeight - playerH - 10);

      setFloatingPos({
        x: Math.max(10, Math.min(maxX, newX)),
        y: Math.max(10, Math.min(maxY, newY))
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - floatingDragStartRef.current.startX;
        const dy = touch.clientY - floatingDragStartRef.current.startY;
        const newX = floatingDragStartRef.current.posX + dx;
        const newY = floatingDragStartRef.current.posY + dy;

        const playerW = isFloatingCollapsed ? 180 : 250;
        const playerH = isFloatingCollapsed ? 44 : 155;
        const maxX = Math.max(10, window.innerWidth - playerW - 10);
        const maxY = Math.max(10, window.innerHeight - playerH - 10);

        setFloatingPos({
          x: Math.max(10, Math.min(maxX, newX)),
          y: Math.max(10, Math.min(maxY, newY))
        });
      }
    };

    const onEnd = () => {
      setIsFloatingDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isFloatingDragging, isFloatingCollapsed]);

  // 1. Initial Fetch and Realtime Subscriptions
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('live-class-player-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.username]);

  const fetchData = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Student enrolled classes normalized
      const studentClasses = (currentUser?.class_types || []).map(c => c.trim().toLowerCase());
      const hasClasses = studentClasses.length > 0;

      const isMatch = (type1?: string, type2?: string, arr?: string[]) => {
        if (!hasClasses) return true;
        if (type1 && studentClasses.includes(type1.trim().toLowerCase())) return true;
        if (type2 && studentClasses.includes(type2.trim().toLowerCase())) return true;
        if (arr && arr.some(a => studentClasses.includes(a.trim().toLowerCase()))) return true;
        return false;
      };

      // 1. Calendar Events (Scheduled classes)
      const { data: calData } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('date', today)
        .eq('status', 'scheduled');

      if (calData) {
        const filteredCal = calData
          .filter(ev => isMatch(ev.class_type, ev.target_class_type))
          .sort((a, b) => new Date(`${a.date}T${a.start_time || '00:00'}:00`).getTime() - new Date(`${b.date}T${b.start_time || '00:00'}:00`).getTime());
        setCalendarEvents(filteredCal);
      }

      // 2. Scheduled Lives (Zoom / YouTube Live Classes)
      const { data: liveData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live']);

      if (liveData) {
        // Show live classes matching student classes, sorted: 'live' first, then nearest scheduled
        const filteredLive = liveData
          .filter((cls: any) => isMatch(cls.target_class_type, undefined, cls.target_classes))
          .sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            return new Date(`${a.date}T${a.time || '00:00'}:00`).getTime() - new Date(`${b.date}T${b.time || '00:00'}:00`).getTime();
          });
        setScheduledLives(filteredLive);
      }

      // 3. Fresh Student Info & Payments Table (for accurate Paid / Free verification)
      if (currentUser?.id) {
        const [studentRes, payRes] = await Promise.all([
          supabase.from('students').select('*').eq('id', currentUser.id).single(),
          supabase.from('payments').select('*').eq('student_id', currentUser.id)
        ]);

        if (studentRes.data) {
          setFreshStudent(studentRes.data);
        }
        if (payRes.data) {
          setPaymentsList(payRes.data);
        }
      }
    } catch (error) {
      console.error('Error fetching live class player data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshingPayment(false);
    }
  };

  // 2. Function to evaluate student's current payment status for a specific class & month
  const verifyStudentPayment = (
    cls: ScheduledLive, 
    student: any, 
    payments: any[]
  ): { isPaidOrFree: boolean; reason: 'paid' | 'free' | 'unpaid' } => {
    // A. Check Global Scholarship / Free Student plan
    if (student?.plan_type === 'free') {
      return { isPaidOrFree: true, reason: 'free' };
    }

    const classType = (cls.target_class_type || cls.target_classes?.[0] || '').trim().toLowerCase();
    const targetMonthKey = (cls.target_month || (cls.date ? cls.date.substring(0, 7) : format(new Date(), 'yyyy-MM'))).trim().toLowerCase();
    const monthName = format(new Date(cls.date || new Date()), 'MMMM').toLowerCase();

    // B. Check Student's free_months array
    const freeMonths: string[] = (student?.free_months || []).map((m: any) => String(m).trim().toLowerCase());
    const isFree = freeMonths.some(fm => {
      return fm === targetMonthKey ||
             fm === `${classType}:${targetMonthKey}` ||
             fm.includes(targetMonthKey) ||
             fm.includes(monthName);
    });
    if (isFree) {
      return { isPaidOrFree: true, reason: 'free' };
    }

    // C. Check Student's active_months array
    const activeMonths: string[] = (student?.active_months || []).map((m: any) => String(m).trim().toLowerCase());
    const isActivePaid = activeMonths.some(am => {
      return am === targetMonthKey ||
             am === `${classType}:${targetMonthKey}` ||
             am.includes(targetMonthKey) ||
             am.includes(monthName);
    });
    if (isActivePaid) {
      return { isPaidOrFree: true, reason: 'paid' };
    }

    // D. Check records in `payments` table in Supabase
    if (payments && payments.length > 0) {
      const match = payments.find(p => {
        const pClass = String(p.class_name || p.class_type || '').trim().toLowerCase();
        const pMonth = String(p.month || p.target_month || '').trim().toLowerCase();

        const classMatches = !pClass || !classType || pClass === classType || classType.includes(pClass) || pClass.includes(classType);
        const monthMatches = pMonth === targetMonthKey || pMonth === monthName || pMonth.includes(targetMonthKey) || pMonth.includes(monthName);

        return classMatches && monthMatches;
      });

      if (match) {
        const status = (match.status || '').toLowerCase();
        if (status === 'paid') return { isPaidOrFree: true, reason: 'paid' };
        if (status === 'free') return { isPaidOrFree: true, reason: 'free' };
      }
    }

    return { isPaidOrFree: false, reason: 'unpaid' };
  };

  // 3. Countdown & Live State Timer Effect
  useEffect(() => {
    if (isLoading) return;

    const interval = setInterval(() => {
      const live = scheduledLives.find(c => c.status === 'live');
      if (live) {
        setTargetClass(live);
        const perm = verifyStudentPayment(live, freshStudent, paymentsList);
        setPaymentStatus(perm);
        setViewState('live');
        return;
      }

      const nextLive = scheduledLives.find(c => c.status === 'scheduled');
      if (nextLive) {
        setTargetClass(nextLive);
        const perm = verifyStudentPayment(nextLive, freshStudent, paymentsList);
        setPaymentStatus(perm);

        const classDateTime = new Date(`${nextLive.date}T${nextLive.time || '00:00'}:00`);
        const diffSeconds = differenceInSeconds(classDateTime, new Date());

        if (diffSeconds > 86400) {
          setViewState(calendarEvents.length > 0 ? 'upcoming-list' : 'no-classes');
        } else if (diffSeconds > 1800) {
          setViewState('waiting-24h');
          setTimer({ h: Math.floor(diffSeconds / 3600), m: Math.floor((diffSeconds % 3600) / 60), s: diffSeconds % 60 });
        } else if (diffSeconds > 0) {
          setViewState('waiting-30m');
          setTimer({ h: 0, m: Math.floor(diffSeconds / 60), s: diffSeconds % 60 });
        } else {
          setViewState('waiting-0s');
        }
      } else {
        setTargetClass(null);
        setViewState(calendarEvents.length > 0 ? 'upcoming-list' : 'no-classes');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [scheduledLives, calendarEvents, isLoading, freshStudent, paymentsList]);

  // 4. Check for Pushed Active Exam in Current Live Class
  useEffect(() => {
    if (targetClass?.is_exam_active && targetClass.active_exam_id && !isExamSubmitted) {
      fetchPushedExam(targetClass.active_exam_id);
    }
  }, [targetClass?.is_exam_active, targetClass?.active_exam_id]);

  const fetchPushedExam = async (examId: string) => {
    try {
      const { data, error } = await supabase.from('exams').select('*').eq('id', examId).single();
      if (!error && data) {
        setActiveExam(data);
        setIsExamOpen(true);
        setIsZoomMinimized(true);

        // Initialize exam countdown timer if not already running
        if (examSecondsLeft === 0) {
          const totalSecs = (data.duration_minutes || 60) * 60;
          setExamSecondsLeft(totalSecs);
        }
      }
    } catch (err) {
      console.error('Error fetching pushed exam:', err);
    }
  };

  // 5. Exam Countdown Timer Effect (Auto-Submit when Time Expires)
  useEffect(() => {
    if (!isExamOpen || isExamSubmitted || examSecondsLeft <= 0) return;

    const timerInt = setInterval(() => {
      setExamSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerInt);
          handleAutoSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInt);
  }, [isExamOpen, isExamSubmitted, examSecondsLeft]);

  // Handle Auto Submit upon countdown expiration
  const handleAutoSubmitExam = () => {
    executeExamGrading(true);
  };

  // Execute Exam Grading & Score Save
  const executeExamGrading = async (isAuto: boolean = false) => {
    if (!activeExam || isExamSubmitted || isSubmittingExamRef.current) return;
    isSubmittingExamRef.current = true;

    const totalQuestions = activeExam.total_questions || 50;
    const correctAnswers = activeExam.correct_answer || activeExam.correct_answers || {};

    let score = 0;
    const summary: { questionNumber: number; userAnswer: number | null; correctAnswer: number; isCorrect: boolean }[] = [];

    for (let q = 1; q <= totalQuestions; q++) {
      const userAns = examAnswers[q] || null;
      const correctAns = correctAnswers[q] ?? correctAnswers[String(q)] ?? 1;

      // Note: If student skipped question, userAns is null and counted as wrong
      const isCorrect = userAns !== null && Number(userAns) === Number(correctAns);
      if (isCorrect) score += 1;

      summary.push({
        questionNumber: q,
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect
      });
    }

    const percentage = Math.round((score / totalQuestions) * 100);
    const resultObj = { score, total: totalQuestions, percentage, summary };

    setExamResult(resultObj);
    setIsExamSubmitted(true);
    setShowSubmitConfirmModal(false);

    // Save record to Supabase `exam_results` table
    const resultPayload = {
      username: currentUser?.username || 'Student',
      student_id: currentUser?.id || null,
      exam_id: activeExam.id,
      score: score,
      submitted_at: new Date().toISOString(),
      meta_data: {
        exam_title: activeExam.title,
        class_type: activeExam.class_type || targetClass?.target_class_type || 'Theory',
        total_questions: totalQuestions,
        percentage: percentage,
        results_summary: summary,
        is_auto_submitted: isAuto
      }
    };

    let savedRecord = resultPayload;
    try {
      const { data: insertedData, error: insErr } = await supabase
        .from('exam_results')
        .insert([resultPayload])
        .select();

      if (!insErr && insertedData && insertedData[0]) {
        savedRecord = insertedData[0];
      }
    } catch (e) {
      console.warn('Supabase exam results insert warning:', e);
    }

    // Also cache in local storage with deduplication (keyed by exam_id)
    try {
      const localKey = `online_exams_history_${currentUser?.username}`;
      const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
      const filtered = existing.filter((item: any) => item.exam_id !== activeExam.id);
      localStorage.setItem(localKey, JSON.stringify([savedRecord, ...filtered]));
    } catch (e) {
      console.warn('Local storage save error:', e);
    }
  };

  // Close Exam Overlay & Auto Fullscreen Zoom Class
  const handleCloseExamAndRestoreZoom = () => {
    setIsExamOpen(false);
    setIsZoomMinimized(false);
    setIsFullscreen(true); // Automatically return Zoom class to full screen
    if (playerContainerRef.current?.requestFullscreen) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
    }
  };

  // Camera & Mic Permission Requester (Cross-browser User Gesture Handler)
  const requestBrowserMediaPermissions = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop()); // Release hardware immediately after approval
        setMediaPermissionGranted(true);
        alert("✅ කැමරා සහ මයික්‍රෆෝන් අවසරය සාර්ථකව ලබා දෙන ලදී! දැන් සූම් පන්තිය තුළදී ඔබගේ කැමරාව සහ මයික්‍රෆෝනය නිසි පරිදි ක්‍රියා කරනු ඇත.");
      } else {
        alert("ඔබගේ බ්‍රවුසරය mediaDevices සහය නොදක්වයි.");
      }
    } catch (err: any) {
      console.warn("Media permission prompt warning:", err);
      alert("බ්‍රවුසරයේ කැමරා හෝ මයික්‍රෆෝන අවසරය (Allow) ලබා දෙන්න.");
    }
  };

  // Fullscreen support
  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;

    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        if (playerContainerRef.current.requestFullscreen) {
          await playerContainerRef.current.requestFullscreen();
        } else if ((playerContainerRef.current as any).webkitRequestFullscreen) {
          await (playerContainerRef.current as any).webkitRequestFullscreen();
        }
        if ((window.screen?.orientation as any)?.lock) {
          await (window.screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (err) {
        console.warn("Fullscreen API fallback active");
      }
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        }
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (err) {
        console.warn("Exit fullscreen error", err);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleManualPaymentRefresh = async () => {
    setIsRefreshingPayment(true);
    await fetchData();
  };

  // PDF Pan mouse handlers
  const handlePdfMouseDown = (e: React.MouseEvent) => {
    if (pdfZoom <= 1) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pdfPan.x, y: e.clientY - pdfPan.y });
  };
  const handlePdfMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPdfPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handlePdfMouseUp = () => setIsPanning(false);

  // PDF Page scroll buttons
  const handlePdfScroll = (direction: 'up' | 'down') => {
    if (!pdfContainerRef.current) return;
    const amount = direction === 'down' ? 350 : -350;
    pdfContainerRef.current.scrollBy({ top: amount, behavior: 'smooth' });
  };

  if (isLoading || viewState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-950 rounded-2xl border border-slate-800 text-white font-semibold gap-3">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
        <span className="text-sm text-slate-400">සජීවී පන්ති සහ ගෙවීම් දත්ත පූරණය වෙමින් පවතී...</span>
      </div>
    );
  }

  // Target class metadata
  const currentClassType = targetClass?.target_class_type || targetClass?.target_classes?.[0] || 'Theory';
  const currentMonth = targetClass?.target_month || (targetClass?.date ? targetClass.date.substring(0, 7) : format(new Date(), 'yyyy-MM'));
  const currentMonthFormatted = getMonthDisplayName(currentMonth);

  // =========================================================================
  // REQUIREMENT 1: UNPAID STUDENTS -> LIVE CLASS DISABLED / LOCKED VIEW
  // =========================================================================
  if (targetClass && !paymentStatus.isPaidOrFree) {
    const whatsappNotice = `හෙලෝ සර්, මගේ සජීවී පන්තියට සම්බන්ධ වීමට ගෙවීම් තහවුරු කර දෙන්න.\nUsername: ${studentUsername}\nපන්තිය: ${currentClassType}\nමාසය: ${currentMonthFormatted} (${currentMonth})`;
    const waUrl = `https://wa.me/94719152128?text=${encodeURIComponent(whatsappNotice)}`;

    return (
      <div className="w-full bg-slate-950 text-white flex flex-col p-4 md:p-6 rounded-2xl border border-rose-900/40 shadow-2xl animate-in fade-in duration-300">
        <div className="max-w-3xl mx-auto w-full space-y-6">
          
          {/* Locked Header Banner */}
          <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-b from-rose-950/40 to-slate-900/90 border border-rose-500/30 shadow-[0_0_40px_rgba(244,63,94,0.12)] text-center relative overflow-hidden">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 text-rose-400 shadow-lg">
              <Lock size={36} className="animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase tracking-wider mb-4">
              <ShieldAlert size={14} /> සජීවී පන්තිය අක්‍රීය කර ඇත (Live Class Disabled)
            </div>

            <h1 className="text-xl md:text-3xl font-extrabold text-white mb-3 leading-snug">
              {targetClass.title}
            </h1>

            <p className="text-sm md:text-base text-rose-200/90 max-w-xl mx-auto leading-relaxed">
              ඔබ තෝරාගෙන ඇති <strong className="text-white underline decoration-rose-500 underline-offset-4">{currentClassType}</strong> පන්තියේ <strong className="text-white">{currentMonthFormatted}</strong> මාසික ගාස්තු ගෙවීම් තහවුරු කර නොමැත. කරුණාකර මුදල් ගෙවා සජීවී පන්තියට සම්බන්ධ වන්න.
            </p>

            {/* Target Class & Month Meta Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mt-6 text-left">
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <Calendar size={18} />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">අදාළ පන්ති වර්ගය</span>
                  <span className="text-xs md:text-sm font-bold text-white">{currentClassType}</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                  <Clock size={18} />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">වත්මන් මාසය</span>
                  <span className="text-xs md:text-sm font-bold text-amber-300">{currentMonthFormatted}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-7">
              {onNavigateToPayment && (
                <button
                  onClick={onNavigateToPayment}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition hover:scale-[1.02] cursor-pointer"
                >
                  <CreditCard size={16} /> ගෙවීම් තොරතුරු සහ රිසිට්පත (Invoice)
                </button>
              )}

              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition hover:scale-[1.02]"
              >
                <MessageCircle size={16} /> Admin WhatsApp [0719152128]
              </a>

              <button
                onClick={handleManualPaymentRefresh}
                disabled={isRefreshingPayment}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs md:text-sm flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
              >
                <RefreshCw size={14} className={isRefreshingPayment ? 'animate-spin' : ''} />
                {isRefreshingPayment ? 'පරීක්ෂා කරමින්...' : 'Refresh Status'}
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 1. NO SCHEDULED OR LIVE CLASSES AVAILABLE
  if (viewState === 'no-classes') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
          <Calendar size={40} className="mx-auto mb-3 text-slate-500" />
          <h2 className="text-xl md:text-2xl font-bold text-slate-300 mb-2">පන්ති නොමැත</h2>
          <p className="text-slate-400 text-xs md:text-sm">
            ඉදිරි දින සඳහා ඔබගේ විෂයයන්ට අදාළව සජීවී පන්ති කාලසටහන් කර නොමැත. නව පන්ති පිළිබඳ තොරතුරු ඉක්මනින් මෙහි දිස්වනු ඇත.
          </p>
        </div>
      </div>
    );
  }

  // 2. UPCOMING CLASS LIST
  if (viewState === 'upcoming-list') {
    return (
      <div className="flex flex-col items-center min-h-[450px] bg-slate-950 text-white p-4 md:p-8 rounded-2xl border border-slate-800">
        <h2 className="text-xl md:text-2xl font-bold text-slate-200 mb-6 text-center">
          ඉදිරියේදී පැවැත්වීමට නියමිත පන්ති
        </h2>
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
          {calendarEvents.map((ev, idx) => (
            <div key={idx} className={`p-6 rounded-2xl border bg-slate-900/80 shadow-lg ${getClassColor(ev.target_class_type || ev.class_type)} border-opacity-30 hover:border-opacity-100 transition-all duration-300`}>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-black/40 inline-block shadow-sm mb-3">
                {ev.target_class_type || ev.class_type}
              </span>
              <h3 className="text-lg text-white font-bold mb-3 line-clamp-2 leading-tight">{ev.title}</h3>
              <div className="flex flex-col gap-2 text-xs bg-black/30 p-3 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">දිනය:</span>
                  <span className="text-slate-200 font-semibold">{ev.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">වේලාව:</span>
                  <span className="text-slate-200 font-semibold">{ev.start_time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Direct Zoom fallback URL & Embed URL
  const zoomDirectUrl = targetClass ? (targetClass.zoom_join_url || targetClass.link || '') : '';
  const zoomEmbedUrl = targetClass ? getEmbeddableZoomUrl(zoomDirectUrl, studentUsername) : '';

  // Google Drive PDF embed link
  const drivePdfEmbedUrl = activeExam ? getEmbeddableDriveUrl(activeExam.pdf_url) : '';

  // Count answered questions
  const answeredCount = Object.keys(examAnswers).length;
  const totalExamQuestions = activeExam?.total_questions || 50;

  // Format exam timer seconds into MM:SS or HH:MM:SS
  const formatExamTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-slate-950 text-white flex flex-col p-2 md:p-4 rounded-2xl border border-slate-800 relative">

      {/* =========================================================================
          FEATURE: PUSHED ONLINE EXAM FULL-STAGE SPLIT VIEW (PDF + MCQ ANSWER SHEET)
         ========================================================================= */}
      {isExamOpen && activeExam && (
        <div className="w-full mb-6 bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-4 md:p-6 shadow-2xl relative overflow-hidden animate-in fade-in duration-300">
          
          {/* Top Header of Pushed Paper */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <FileText size={12} /> සජීවී විභාග පත්‍රිකාව (Active Online Exam)
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {activeExam.class_type || currentClassType}
                </span>
              </div>
              <h2 className="text-lg md:text-2xl font-black text-white">{activeExam.title}</h2>
            </div>

            {/* Live Exam Timer & Top Close Button */}
            <div className="flex items-center gap-3">
              {!isExamSubmitted && (
                <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2.5 font-mono font-bold shadow-lg ${
                  examSecondsLeft <= 300 
                    ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse' 
                    : examSecondsLeft <= 900 
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                }`}>
                  <Clock size={16} />
                  <span className="text-xs uppercase font-sans text-slate-400">ඉතිරි කාලය:</span>
                  <span className="text-base md:text-lg">{formatExamTime(examSecondsLeft)}</span>
                </div>
              )}

              {/* TOP CLOSE BUTTON (ඉහළින් ඇති Close බොත්තම) */}
              <button
                onClick={handleCloseExamAndRestoreZoom}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="ප්‍රශ්න පත්‍රය වසා නැවත සූම් පන්තියට යන්න"
              >
                <X size={15} />
                <span className="hidden sm:inline">සූම් පන්තියට යන්න</span>
              </button>
            </div>
          </div>

          {/* If Exam is NOT Submitted yet: SHOW SPLIT STAGE (Google Drive PDF Viewer + Answer Sheet) */}
          {!isExamSubmitted ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[680px]">
              
              {/* SIDE 1: GOOGLE DRIVE PDF VIEWER (Interactive Zoom, Pan, Drag, Scroll) */}
              <div className="lg:col-span-7 flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                {/* PDF Interactive Toolbar */}
                <div className="bg-slate-900/90 border-b border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1 text-slate-300 font-semibold">
                    <span>PDF පත්‍රිකා පාලනය:</span>
                    <span className="text-[11px] font-mono text-amber-400 ml-1">{Math.round(pdfZoom * 100)}%</span>
                  </div>

                  {/* PDF Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPdfZoom(z => Math.min(2.5, z + 0.25))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
                      title="Zoom In (විශාල කරන්න)"
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button
                      onClick={() => setPdfZoom(z => Math.max(0.7, z - 0.25))}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
                      title="Zoom Out (කුඩා කරන්න)"
                    >
                      <ZoomOut size={15} />
                    </button>
                    <button
                      onClick={() => { setPdfZoom(1); setPdfPan({ x: 0, y: 0 }); }}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
                      title="Reset (මූලික ප්‍රමාණය)"
                    >
                      <RotateCcw size={15} />
                    </button>

                    <div className="h-4 w-px bg-slate-700 mx-1"></div>

                    {/* Page Scrolling Buttons */}
                    <button
                      onClick={() => handlePdfScroll('up')}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition flex items-center gap-1 text-[11px] font-medium"
                      title="පෙර පිටුවට / Scroll Up"
                    >
                      <ChevronUp size={14} /> <span className="hidden sm:inline">ඉහළට</span>
                    </button>
                    <button
                      onClick={() => handlePdfScroll('down')}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition flex items-center gap-1 text-[11px] font-medium"
                      title="ඊළඟ පිටුවට / Scroll Down"
                    >
                      <ChevronDown size={14} /> <span className="hidden sm:inline">පහළට</span>
                    </button>

                    {activeExam.pdf_url && (
                      <a
                        href={activeExam.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg transition ml-1"
                        title="Google Drive එකෙන් Open කරන්න"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>

                {/* PDF Container with Zoom & Pan Dragging */}
                <div
                  ref={pdfContainerRef}
                  onMouseDown={handlePdfMouseDown}
                  onMouseMove={handlePdfMouseMove}
                  onMouseUp={handlePdfMouseUp}
                  className={`flex-1 relative overflow-auto bg-slate-900 select-none min-h-[500px] ${
                    pdfZoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                  }`}
                >
                  <div
                    style={{
                      transform: `scale(${pdfZoom}) translate(${pdfPan.x / pdfZoom}px, ${pdfPan.y / pdfZoom}px)`,
                      transformOrigin: 'top center',
                      transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                      width: '100%',
                      height: '100%',
                      minHeight: '620px'
                    }}
                  >
                    {drivePdfEmbedUrl ? (
                      <iframe
                        src={drivePdfEmbedUrl}
                        className="w-full h-full min-h-[620px] border-0 rounded-b-2xl bg-white"
                        title="Google Drive Exam Paper Preview"
                        allow="autoplay"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                        <FileText size={48} className="mb-3 text-slate-600" />
                        <p>Google Drive PDF ලින්ක් එක ලබා දී නොමැත.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SIDE 2: ONLINE MCQ ANSWER SHEET (Interactive radio cards, progress & submit) */}
              <div className="lg:col-span-5 flex flex-col bg-slate-950 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-inner">
                {/* Answer Sheet Header & Progress */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-white">Online Answer Sheet</h3>
                    <span className="text-xs text-slate-400">
                      පිළිතුරු ලියා ඇත: <strong className="text-emerald-400">{answeredCount}</strong> / {totalExamQuestions}
                    </span>
                  </div>

                  <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-amber-400">
                    {Math.round((answeredCount / totalExamQuestions) * 100)}% Complete
                  </div>
                </div>

                {/* Quick Question Palette (jump to question) */}
                <div className="mb-4 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 max-h-24 overflow-y-auto">
                  <div className="text-[10px] text-slate-400 font-semibold mb-1.5">ප්‍රශ්න ලැයිස්තුව (Quick Navigator):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: totalExamQuestions }, (_, i) => i + 1).map((qNum) => {
                      const isAnswered = !!examAnswers[qNum];
                      return (
                        <button
                          key={qNum}
                          onClick={() => {
                            const el = document.getElementById(`mcq-question-${qNum}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className={`w-6 h-6 rounded-md text-[10px] font-mono font-bold flex items-center justify-center transition cursor-pointer ${
                            isAnswered
                              ? 'bg-emerald-500 text-slate-950 shadow-sm'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {qNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Question List (Q1 to Q50 with options 1, 2, 3, 4, 5) */}
                <div className="flex-1 overflow-y-auto max-h-[460px] pr-2 space-y-3">
                  {Array.from({ length: totalExamQuestions }, (_, i) => i + 1).map((qNum) => {
                    const selectedOpt = examAnswers[qNum];
                    return (
                      <div
                        key={qNum}
                        id={`mcq-question-${qNum}`}
                        className={`p-3 rounded-xl border transition-all ${
                          selectedOpt
                            ? 'bg-slate-900/90 border-blue-500/40 shadow-sm'
                            : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold font-mono text-slate-200">
                            ප්‍රශ්න අංක {qNum}:
                          </span>
                          {selectedOpt ? (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              තෝරාගත් පිළිතුර: ({selectedOpt})
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500">පිළිතුරක් තෝරන්න</span>
                          )}
                        </div>

                        {/* Options (1) to (5) */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {[1, 2, 3, 4, 5].map((opt) => {
                            const isSelected = selectedOpt === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setExamAnswers(prev => ({ ...prev, [qNum]: opt }))}
                                className={`py-2 rounded-lg font-bold font-mono text-xs transition flex items-center justify-center border cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/40 scale-[1.03]'
                                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                                }`}
                              >
                                ({opt})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Submit Action Button */}
                <div className="pt-4 border-t border-slate-800 mt-3">
                  <button
                    onClick={() => setShowSubmitConfirmModal(true)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send size={16} /> ප්‍රශ්න පත්‍රය අවසන් කර Submit කරන්න
                  </button>
                </div>
              </div>

            </div>
          ) : (
            // =========================================================================
            // INSTANT RESULTS & SCORE BREAKDOWN DISPLAY (Green for correct, Red for wrong)
            // =========================================================================
            examResult && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Scorecard Header */}
                <div className="p-6 md:p-8 bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800 rounded-3xl text-center relative overflow-hidden shadow-2xl">
                  <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-400">
                    <Award size={36} />
                  </div>

                  <h3 className="text-xl md:text-2xl font-black text-white mb-1">
                    විභාග ප්‍රතිඵල සටහන (Exam Evaluation)
                  </h3>
                  <p className="text-xs text-slate-400 mb-6">
                    නිවැරදි පිළිතුරු සමඟ සසඳන ලද ඔබගේ අවසන් ලකුණු මට්ටම පහත පරිදි වේ:
                  </p>

                  <div className="inline-flex items-center gap-6 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner">
                    <div>
                      <span className="text-[11px] text-slate-400 block font-mono">ලබාගත් ලකුණු</span>
                      <span className="text-3xl md:text-4xl font-black text-emerald-400 font-mono">
                        {examResult.score} <span className="text-lg text-slate-500 font-bold">/ {examResult.total}</span>
                      </span>
                    </div>

                    <div className="h-10 w-px bg-slate-800"></div>

                    <div>
                      <span className="text-[11px] text-slate-400 block font-mono">ප්‍රතිශතය</span>
                      <span className="text-3xl md:text-4xl font-black text-amber-400 font-mono">
                        {examResult.percentage}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Question Breakdown List (Green for Correct, Red for Wrong) */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-inner space-y-4">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                    ප්‍රශ්න පත්‍රයේ පිළිතුරු සමාලෝචනය (Correct: Green | Wrong: Red):
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                    {examResult.summary.map((item) => {
                      const isCorrect = item.isCorrect;
                      return (
                        <div
                          key={item.questionNumber}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                            isCorrect
                              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold">
                            {isCorrect ? (
                              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                            ) : (
                              <X size={16} className="text-rose-400 shrink-0" />
                            )}
                            <span>ප්‍රශ්න අංක {item.questionNumber}</span>
                          </div>

                          <div className="text-right font-mono text-[11px]">
                            {isCorrect ? (
                              <span className="font-bold text-emerald-300">
                                ඔබගේ පිළිතුර: ({item.userAnswer}) &bull; නිවැරදියි
                              </span>
                            ) : (
                              <div>
                                <span className="text-rose-300">
                                  {item.userAnswer ? `ඔබගේ: (${item.userAnswer})` : 'මඟහැර ඇත'}
                                </span>
                                <span className="ml-2 font-bold text-emerald-400">
                                  (නිවැරදි පිළිතුර: {item.correctAnswer})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* BOTTOM CLOSE BUTTON (පහළින් ඇති Close බොත්තම) */}
                <div className="pt-2 text-center">
                  <button
                    onClick={handleCloseExamAndRestoreZoom}
                    className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm rounded-xl shadow-xl shadow-blue-900/40 transition hover:scale-[1.02] cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Maximize2 size={16} /> සූම් පන්තිය Full Screen එකට ගන්න (Back to Zoom Fullscreen)
                  </button>
                </div>
              </div>
            )
          )}

        </div>
      )}

      {/* =========================================================================
          FEATURE: ACCIDENTAL SUBMISSION PREVENT MODAL (CONFIRMATION DIALOG)
         ========================================================================= */}
      {showSubmitConfirmModal && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <AlertCircle size={30} />
            </div>

            <h3 className="text-lg font-bold text-white">ප්‍රශ්න පත්‍රය Submit කිරීමට අවශ්‍යද?</h3>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">මුළු ප්‍රශ්න ගණන:</span>
                <span className="font-bold text-white">{totalExamQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">පිළිතුරු ලියා ඇති ප්‍රශ්න:</span>
                <span className="font-bold text-emerald-400">{answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">මඟහැරි ප්‍රශ්න ගණන:</span>
                <span className="font-bold text-rose-400">{totalExamQuestions - answeredCount}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              මඟහැරි ප්‍රශ්න වැරදි ප්‍රශ්න ලෙස ලකුණු ගණනය කිරීමේදී සලකනු ලැබේ. ඔබගේ පිළිතුරු ස්ථිරවම Submit කිරීමට පහතින් තහවුරු කරන්න.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => executeExamGrading(false)}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                ඔව්, අවසන් කර Submit කරන්න
              </button>
              <button
                onClick={() => setShowSubmitConfirmModal(false)}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition cursor-pointer"
              >
                තවදුරටත් ලියන්න (Cancel)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. 24-HOUR COUNTDOWN SCREEN */}
      {viewState === 'waiting-24h' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full min-h-[500px] bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl relative p-6">
          <div className="z-10 text-center flex flex-col items-center w-full max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full ${getClassColor(currentClassType)}`}>
                {currentClassType}
              </span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} /> {paymentStatus.reason === 'free' ? 'Free Access' : 'Paid'}
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-white mb-4 leading-tight">{targetClass.title}</h1>
            <p className="text-slate-400 mb-6 text-sm md:text-base">පන්තිය ආරම්භ වීමට තව...</p>

            <div className="flex gap-3 md:gap-6 text-center">
              {['h', 'm', 's'].map((unit) => (
                <div key={unit} className="flex flex-col items-center">
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-950 border border-slate-700 rounded-2xl flex items-center justify-center text-3xl md:text-5xl font-mono font-black text-white shadow-inner">
                    {String(unit === 'h' ? timer.h : unit === 'm' ? timer.m : timer.s).padStart(2, '0')}
                  </div>
                  <span className="text-slate-500 text-xs md:text-sm mt-2 font-medium">
                    {unit === 'h' ? 'පැය' : unit === 'm' ? 'විනාඩි' : 'තත්පර'}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 text-xs text-slate-400 bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800">
              👤 ශිෂ්‍ය නාමය (Username): <strong className="text-blue-400">{studentUsername}</strong> (පන්තිය ආරම්භ වූ වහාම Zoom වෙත ස්වයංක්‍රීයව එක් වේ)
            </div>
          </div>
        </div>
      )}

      {/* 4. 30-MINUTE COUNTDOWN WITH BACKGROUND VIDEO */}
      {viewState === 'waiting-30m' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full min-h-[500px] relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl p-6">
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none">
            <source src={targetClass.pre_class_video_path || "/videos/waiting-video.mp4"} type="video/mp4" />
          </video>

          <div className="relative z-10 flex flex-col items-center p-8 bg-slate-950/70 rounded-3xl backdrop-blur-md border border-white/10 shadow-2xl text-center max-w-lg">
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full ${getClassColor(currentClassType)}`}>
                {currentClassType}
              </span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} /> {paymentStatus.reason === 'free' ? 'Free Access' : 'Paid'}
              </span>
            </div>

            <h2 className="text-base md:text-lg text-slate-200 mb-4">{targetClass.title}</h2>
            <p className="text-xs text-slate-400 mb-3">පන්තිය ආරම්භ වීමට තව සුළු වේලාවකි...</p>

            <div className="text-5xl md:text-7xl font-mono font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] animate-pulse">
              {String(timer.m).padStart(2, '0')}:{String(timer.s).padStart(2, '0')}
            </div>

            <div className="mt-6 text-xs text-slate-400 bg-black/40 px-3 py-1.5 rounded-lg border border-slate-800">
              👤 ශිෂ්‍ය නාමය: <strong className="text-blue-400">{studentUsername}</strong>
            </div>
          </div>
        </div>
      )}

      {/* 5. 0-SECONDS SCREEN WAITING FOR TEACHER */}
      {viewState === 'waiting-0s' && targetClass && (
        <div className="flex flex-col items-center justify-center w-full min-h-[500px] relative rounded-2xl overflow-hidden bg-slate-950 border border-emerald-500/40 p-6">
          <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none">
            <source src={targetClass.pre_class_video_path || "/videos/waiting-video.mp4"} type="video/mp4" />
          </video>

          <div className="relative z-10 flex flex-col items-center p-8 bg-slate-950/80 rounded-3xl backdrop-blur-lg border border-emerald-500/30 text-center shadow-2xl max-w-lg">
            <span className="animate-ping h-4 w-4 rounded-full bg-emerald-500 mb-4"></span>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3">{targetClass.title}</h2>
            
            <div className="bg-emerald-500/10 px-5 py-3 rounded-xl border border-emerald-500/20 mb-4">
              <p className="text-emerald-300 font-medium text-xs md:text-sm">ගුරුවරයා පන්තිය ආරම්භ කරන තෙක් රැඳී සිටින්න...</p>
            </div>

            <p className="text-xs text-slate-400">
              ගුරුවරයා Zoom ආරම්භ කළ වහාම ඔබගේ Username (<strong className="text-blue-400">{studentUsername}</strong>) සමඟින් Zoom Web Client මෙම සෙක්ෂන් එක තුළම ක්‍රියාත්මක වේ.
            </p>
          </div>
        </div>
      )}

      {/* 6. LIVE ZOOM PLAYER EMBEDDED DIRECTLY IN SECTION */}
      {viewState === 'live' && targetClass && (
        <div
          ref={playerContainerRef}
          style={isExamOpen && isZoomMinimized && floatingPos ? { 
            left: `${floatingPos.x}px`, 
            top: `${floatingPos.y}px`, 
            right: 'auto', 
            bottom: 'auto' 
          } : undefined}
          className={`flex flex-col bg-slate-950 border-emerald-500/40 overflow-hidden transition-all duration-150 ${
            isFullscreen
              ? 'fixed inset-0 z-[999999] w-full h-full m-0 p-0 rounded-none'
              : isExamOpen && isZoomMinimized
              ? `fixed z-[99999] ${!floatingPos ? 'bottom-4 right-4' : ''} ${isFloatingCollapsed ? 'w-44' : 'w-56 sm:w-64'} rounded-2xl border-2 border-emerald-500 shadow-2xl shadow-emerald-950/80 backdrop-blur select-none ${isFloatingDragging ? 'cursor-grabbing opacity-90' : ''}`
              : 'flex-1 rounded-2xl border shadow-[0_0_30px_rgba(16,185,129,0.15)] min-h-[600px]'
          }`}
        >
          {/* Top Player Control Header */}
          <div 
            onMouseDown={isExamOpen && isZoomMinimized ? (e) => {
              if ((e.target as HTMLElement).closest('button, a')) return;
              e.preventDefault();
              const rect = playerContainerRef.current?.getBoundingClientRect();
              const currentX = rect ? rect.left : (floatingPos?.x ?? (window.innerWidth - 270));
              const currentY = rect ? rect.top : (floatingPos?.y ?? (window.innerHeight - 190));
              floatingDragStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                posX: currentX,
                posY: currentY
              };
              setIsFloatingDragging(true);
            } : undefined}
            onTouchStart={isExamOpen && isZoomMinimized ? (e) => {
              if ((e.target as HTMLElement).closest('button, a')) return;
              if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = playerContainerRef.current?.getBoundingClientRect();
                const currentX = rect ? rect.left : (floatingPos?.x ?? (window.innerWidth - 270));
                const currentY = rect ? rect.top : (floatingPos?.y ?? (window.innerHeight - 190));
                floatingDragStartRef.current = {
                  startX: touch.clientX,
                  startY: touch.clientY,
                  posX: currentX,
                  posY: currentY
                };
                setIsFloatingDragging(true);
              }
            } : undefined}
            className={`bg-slate-900/95 text-slate-200 border-b border-slate-800 text-xs z-10 ${
              isExamOpen && isZoomMinimized 
                ? 'px-2 py-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-slate-800/90 select-none' 
                : 'px-4 py-2.5 flex flex-wrap items-center justify-between md:text-sm gap-2'
            }`}
            title={isExamOpen && isZoomMinimized ? "Drag to move anywhere on screen (තිරයේ ඕනෑම තැනකට ගෙන යන්න)" : undefined}
          >
            {/* Live Indicator & Class Title or Drag Handle */}
            <div className="flex items-center gap-1.5 font-semibold min-w-0">
              {isExamOpen && isZoomMinimized ? (
                <>
                  <GripHorizontal size={15} className="text-emerald-400 shrink-0" />
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-white font-bold text-[11px] truncate" title={targetClass.title}>
                    Zoom Live
                  </span>
                </>
              ) : (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-white font-bold text-xs md:text-sm truncate max-w-[200px] md:max-w-md">
                    සජීවී: {targetClass.title}
                  </span>
                </>
              )}
            </div>

            {/* Student Username Badge, Cam/Mic Perms & Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Media permission button (hidden on floating minibar to save space) */}
              {!isExamOpen && (
                <button
                  onClick={requestBrowserMediaPermissions}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition cursor-pointer ${
                    mediaPermissionGranted
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40 text-blue-300'
                  }`}
                  title="බ්‍රවුසරයේ කැමරා සහ මයික්‍රෆෝන් අවසරය ලබා ගන්න"
                >
                  {mediaPermissionGranted ? (
                    <><Check size={14} className="text-emerald-400" /> <span className="hidden sm:inline">Cam/Mic OK</span></>
                  ) : (
                    <><Mic size={13} /> <span className="hidden sm:inline">Cam & Mic Access</span></>
                  )}
                </button>
              )}

              {!isExamOpen && (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs border border-slate-700">
                  <UserCheck size={14} className="text-emerald-400" />
                  <span><strong className="text-white">{studentUsername}</strong></span>
                </div>
              )}

              {/* Direct Zoom App Link */}
              {zoomDirectUrl && !isExamOpen && (
                <a
                  href={zoomDirectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 transition"
                  title="Zoom App එක හරහා සම්බන්ධ වන්න"
                >
                  <ExternalLink size={13} /> <span className="hidden sm:inline">App</span>
                </a>
              )}

              {/* Toggle Collapse on Floating Player */}
              {isExamOpen && isZoomMinimized && (
                <button
                  onClick={() => setIsFloatingCollapsed(!isFloatingCollapsed)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md transition border border-slate-700/60"
                  title={isFloatingCollapsed ? "Expand Zoom View (විශාල කරන්න)" : "Collapse Zoom View (හකුලන්න)"}
                >
                  {isFloatingCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 p-1.5 rounded-lg transition border border-emerald-500/30 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                title="Fullscreen (සම්පූර්ණ තිරය)"
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </div>
          </div>

          {/* Embedded Zoom Web Client Iframe with Full Media Permissions */}
          {!isFloatingCollapsed && (
            <div className={`w-full bg-slate-900 relative ${
              isExamOpen && isZoomMinimized 
                ? 'h-32 sm:h-36' 
                : isFullscreen 
                ? 'flex-1' 
                : 'h-[75vh] min-h-[500px]'
            }`}>
              <iframe
                src={zoomEmbedUrl}
                allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *; clipboard-read *"
                allowFullScreen={true}
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
                className={`absolute inset-0 w-full h-full border-0 ${isFloatingDragging ? 'pointer-events-none' : 'pointer-events-auto'}`}
                title="Zoom Live Class Web Client"
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default LiveClassPlayer;