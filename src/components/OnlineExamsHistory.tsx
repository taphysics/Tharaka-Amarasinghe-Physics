import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Award, Calendar, CheckCircle2, XCircle, Clock, ChevronDown, 
  ChevronUp, FileText, Check, X, Play, Send, ExternalLink, 
  AlertCircle, Sparkles, BookOpen, Printer, Download, HelpCircle,
  CheckSquare, Square, Loader2
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { fetchAssignmentMarks } from '../assignmentService';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '../realtimeSync';
import { getLecturerForClass } from '../lecturerSharesService';
import { AssignmentMark } from '../types';

interface Props {
  currentStudent: any;
}

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const isValidUUID = (str: any): boolean => {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
};

export const getDirectDriveImageUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  try {
    if (trimmed.includes('googleusercontent.com/d/')) {
      return trimmed;
    }
    const match1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) {
      return `https://lh3.googleusercontent.com/d/${match1[1]}`;
    }
    const match2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) {
      return `https://lh3.googleusercontent.com/d/${match2[1]}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
};

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
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [justSubmittedResult, setJustSubmittedResult] = useState<any | null>(null);

  // Custom in-app Confirmation & Print States
  const [confirmSubmitModalOpen, setConfirmSubmitModalOpen] = useState<boolean>(false);
  const [pdfPrintResult, setPdfPrintResult] = useState<any | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const autoSubmitRef = useRef<() => void>(() => {});

  // Screen Wake Lock API to prevent screen sleeping during exam
  useEffect(() => {
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      try {
        if (takingExam && 'wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.debug('Exam Wake Lock not granted:', err);
      }
    };

    if (takingExam) {
      requestWakeLock();
    }

    return () => {
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch (e) {}
      }
    };
  }, [takingExam]);

  // Exam Countdown Timer (Ticking every second smoothly)
  useEffect(() => {
    let timer: any = null;
    if (takingExam && !justSubmittedResult) {
      timer = setInterval(() => {
        setExamSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            autoSubmitRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [takingExam, Boolean(justSubmittedResult)]);

  useEffect(() => {
    fetchAllData();

    // Supabase Realtime Subscription for exams & results & assignment marks
    const channelName = `student-exams-realtime-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ubt_exams' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_marks' }, () => fetchAllData())
      .subscribe();

    const unsub = subscribeRealtimeEvents((type) => {
      if (
        type === 'exam_submitted' || 
        type === 'exam_created' || 
        type === 'assignment_marks_updated' || 
        type === 'ubt_exam_created' || 
        type === 'ubt_exam_updated' ||
        type === 'exam_pushed' ||
        type === 'live_exam_updated'
      ) {
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

  // Periodically check and promote scheduled exams to active (every 12 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!takingExam) {
        fetchAllData(false);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [takingExam]);

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

      // 1. Fetch Past Exam Results from Supabase (Strict Source of Truth)
      let fetchedResults: any[] = [];
      const submittedExamIds = new Set<string>();

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
          data.forEach(r => {
            if (r.exam_id) submittedExamIds.add(String(r.exam_id));
          });
        }
      }

      // Deduplicate results
      const uniqueList: any[] = [];
      const seenKeys = new Set<string>();

      fetchedResults.forEach(r => {
        const idKey = r.id ? `id_${r.id}` : `exam_${r.exam_id}_${r.submitted_at}`;
        if (!seenKeys.has(idKey)) {
          seenKeys.add(idKey);
          uniqueList.push(r);
        }
      });

      if (uniqueList.length > 0 || fetchedResults.length > 0) {
        const sorted = uniqueList.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        setRecords(sorted);
      }

      // 2. Fetch Active AND Scheduled Exams from exams and ubt_exams
      const [{ data: examsData }, { data: ubtData }] = await Promise.all([
        supabase
          .from('exams')
          .select('*')
          .in('status', ['active', 'scheduled'])
          .order('created_at', { ascending: false }),
        supabase
          .from('ubt_exams')
          .select('*')
          .in('status', ['active', 'scheduled'])
          .order('created_at', { ascending: false })
      ]);

      const combinedExams: any[] = [];
      const seenExamIds = new Set<string>();

      // 1. Prioritize UBT exams first so correct_answers metadata (__push_mode, __retake_timestamp, questions) is preserved
      (ubtData || []).forEach(ubt => {
        if (!seenExamIds.has(String(ubt.id))) {
          seenExamIds.add(String(ubt.id));
          combinedExams.push(ubt);
        }
      });

      // 2. Add standard exams or merge
      (examsData || []).forEach(ex => {
        if (!seenExamIds.has(String(ex.id))) {
          seenExamIds.add(String(ex.id));
          combinedExams.push(ex);
        }
      });

      // Auto-Push Scheduled Exams: Check if any scheduled exam time has arrived
      const nowMs = Date.now();
      const examsToPromote: string[] = [];

      combinedExams.forEach(ex => {
        if (ex.status === 'scheduled') {
          let isDue = false;
          if (ex.scheduled_at) {
            isDue = new Date(ex.scheduled_at).getTime() <= nowMs;
          } else if (ex.scheduled_date) {
            const timeStr = ex.scheduled_time || '00:00';
            const schedMs = new Date(`${ex.scheduled_date}T${timeStr}:00`).getTime();
            if (!isNaN(schedMs) && schedMs <= nowMs) {
              isDue = true;
            }
          }
          if (isDue) {
            ex.status = 'active';
            examsToPromote.push(ex.id);
          }
        }
      });

      // Update Supabase in background for newly promoted scheduled exams
      if (examsToPromote.length > 0) {
        examsToPromote.forEach(async (promoId) => {
          try {
            await supabase.from('exams').update({ status: 'active' }).eq('id', promoId);
            await supabase.from('ubt_exams').update({ status: 'active' }).eq('id', promoId);
            emitRealtimeEvent('ubt_exam_updated', { id: promoId, status: 'active' });
          } catch (e) {}
        });
      }

      // Filter exams:
      // a) Status must be 'active'
      // b) Exclude Public Exams (only meant for unauthenticated guests)
      // c) One-time policy: EXCLUDE if student has ALREADY submitted it (unless admin/lecturer allowed retake)
      // d) Match student's enrolled classes
      const matchingActive = combinedExams.filter((ex: any) => {
        if (ex.status !== 'active') return false;
        if (ex.is_public || ex.class_type === 'Public Exam' || ex.target_class_type === 'Public Exam') {
          return false;
        }

        // Check if student has already submitted this exam
        const isAlreadySubmitted = submittedExamIds.has(String(ex.id)) || (ex.title && submittedExamIds.has(String(ex.title)));

        if (isAlreadySubmitted) {
          const retakeTime = 
            ex.exam_retake_timestamp || 
            ex.correct_answers?.__retake_timestamp || 
            ex.correct_answer?.__retake_timestamp || 
            (ex.exam_push_mode === 'allow_retake' || ex.correct_answers?.__push_mode === 'allow_retake' || ex.correct_answer?.__push_mode === 'allow_retake' 
              ? (ex.exam_push_timestamp || ex.updated_at) 
              : null);
              
          // Find student's most recent submission for this exam
          const studentSubmission = fetchedResults.find(r => 
            String(r.exam_id) === String(ex.id) || 
            (r.meta_data?.exam_title && r.meta_data.exam_title === ex.title)
          );

          const submissionTime = studentSubmission ? new Date(studentSubmission.submitted_at).getTime() : 0;
          const retakeTimeMs = retakeTime ? new Date(retakeTime).getTime() : 0;
          const examUpdatedTime = ex.updated_at ? new Date(ex.updated_at).getTime() : 0;
          const isExamUpdatedAfterSubmission = examUpdatedTime > submissionTime;
          const isAllowRetakeMode = ex.exam_push_mode === 'allow_retake' || 
                                   ex.correct_answers?.__push_mode === 'allow_retake' || 
                                   ex.correct_answer?.__push_mode === 'allow_retake';
          
          if (
            (retakeTimeMs > 0 && retakeTimeMs > submissionTime) ||
            (isAllowRetakeMode && (isExamUpdatedAfterSubmission || retakeTimeMs > submissionTime))
          ) {
            // Retake explicitly allowed by Lecturer/Admin for all students!
            ex.isRetakeAllowed = true;
          } else {
            return false;
          }
        }

        if (studentClasses.length === 0) return true;
        const target = (ex.class_type || ex.target_class_type || '').toLowerCase().trim();
        if (!target || target === 'all' || target === 'general') return true;
        
        const targetWords = target.split(/\s+/).filter(Boolean);
        return studentClasses.some(sc => {
          const scLower = sc.toLowerCase().trim();
          if (target.includes(scLower) || scLower.includes(target)) return true;
          const scWords = scLower.split(/\s+/).filter(Boolean);
          return targetWords.some(tw => scWords.includes(tw));
        });
      });

      setActiveExams(matchingActive);

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
    let examToStart = { ...exam };
    if ((!examToStart.questions || examToStart.questions.length === 0) && typeof examToStart.pdf_url === 'string' && examToStart.pdf_url.startsWith('ubt_manual_questions://')) {
      try {
        const decoded = JSON.parse(decodeURIComponent(examToStart.pdf_url.replace('ubt_manual_questions://', '')));
        if (Array.isArray(decoded) && decoded.length > 0) {
          examToStart.questions = decoded;
        }
      } catch (e) {}
    }
    setTakingExam(examToStart);
    setExamAnswers({});
    setActiveQuestionIndex(0);
    setJustSubmittedResult(null);
    setConfirmSubmitModalOpen(false);
    const totalSecs = (examToStart.duration_minutes || 90) * 60;
    setExamSecondsLeft(totalSecs);
  };

  // Auto Submit on Time Expiry
  const handleAutoSubmitExam = () => {
    handleSubmitExamAnswers(true);
  };
  autoSubmitRef.current = handleAutoSubmitExam;

  // Submit Exam
  const handleSubmitExamAnswers = async (isAuto = false) => {
    if (!takingExam) return;
    setIsSubmitting(true);
    setConfirmSubmitModalOpen(false);

    try {
      const correctMap = { ...(takingExam.correct_answer || takingExam.correct_answers || {}) };
      if (Array.isArray(takingExam.questions) && takingExam.questions.length > 0) {
        takingExam.questions.forEach((q: any, idx: number) => {
          const qNum = q.questionNumber || q.id || (idx + 1);
          const cAns = q.correctAnswer ?? q.correct_choice;
          if (cAns !== undefined) {
            correctMap[qNum] = Number(cAns);
            correctMap[String(qNum)] = Number(cAns);
          }
        });
      }

      const hasQuestionsArray = Array.isArray(takingExam.questions) && takingExam.questions.length > 0;
      const totalQ = hasQuestionsArray
        ? takingExam.questions.length
        : (takingExam.total_questions || 50);

      let score = 0;
      const summary: any[] = [];

      for (let i = 1; i <= totalQ; i++) {
        const userAns = examAnswers[i] ?? null;
        const correctAns = correctMap[i] ?? correctMap[String(i)] ?? null;
        const isCorrect = userAns !== null && correctAns !== null && Number(userAns) === Number(correctAns);
        if (isCorrect) score++;

        const qObj = hasQuestionsArray ? takingExam.questions[i - 1] : null;
        summary.push({
          questionNumber: i,
          questionText: qObj?.questionText || qObj?.question_text || `ප්‍රශ්න අංක ${i}`,
          imageUrl: qObj?.imageUrl || qObj?.image_url || '',
          options: qObj?.options || [],
          explanation: qObj?.explanation || '',
          userAnswer: userAns,
          correctAns: correctAns,
          isCorrect
        });
      }

      const percentage = Math.round((score / totalQ) * 100);
      const submissionId = generateUUID(); // MUST be UUID to avoid 22P02
      const nowIso = new Date().toISOString();

      const studentIdValid = isValidUUID(currentStudent?.id) ? currentStudent.id : null;
      const examIdValid = isValidUUID(takingExam.id) ? takingExam.id : generateUUID();

      const resolvedLecturer = await getLecturerForClass(
        takingExam.class_type || takingExam.target_class_type,
        takingExam.created_by
      );

      // Count previous attempts for this student on this exam to preserve history & label 2nd/3rd attempts
      const previousAttempts = records.filter(r => 
        (r.exam_id && String(r.exam_id) === String(takingExam.id)) ||
        (r.meta_data?.exam_title && r.meta_data.exam_title === takingExam.title)
      );
      const attemptNumber = previousAttempts.length + 1;
      const attemptLabel = `${attemptNumber} වන අවස්ථාව (${attemptNumber === 1 ? '1st' : attemptNumber === 2 ? '2nd' : attemptNumber === 3 ? '3rd' : `${attemptNumber}th`} Attempt)`;

      const resultPayload = {
        id: submissionId,
        username: currentStudent.username,
        student_id: studentIdValid,
        exam_id: examIdValid,
        score,
        submitted_at: nowIso,
        meta_data: {
          exam_title: takingExam.title,
          class_type: takingExam.class_type || takingExam.target_class_type || 'General',
          lecturer_name: resolvedLecturer,
          total_questions: totalQ,
          score,
          percentage,
          results_summary: summary,
          questions: hasQuestionsArray ? takingExam.questions : [],
          is_auto_submitted: isAuto,
          attempt_number: attemptNumber,
          attempt_label: attemptLabel
        }
      };

      // 1. Insert into Supabase exam_results table
      try {
        const { error: insErr } = await supabase.from('exam_results').insert([resultPayload]);
        if (insErr) {
          console.warn('Direct insert note, retrying without student_id if constraint:', insErr);
          // If foreign key constraint failed on student_id, retry with null student_id
          await supabase.from('exam_results').insert([{
            ...resultPayload,
            student_id: null
          }]);
        }
      } catch (e) {
        console.warn('Supabase result save notice:', e);
      }

      // Emit realtime event
      emitRealtimeEvent('exam_submitted', {
        examId: examIdValid,
        username: currentStudent.username,
        score,
        percentage,
        attemptNumber,
        attemptLabel
      });

      const submittedResultState = {
        id: submissionId,
        score,
        totalQ,
        percentage,
        summary,
        examTitle: takingExam.title,
        classType: takingExam.class_type || takingExam.target_class_type || 'General',
        lecturerName: resolvedLecturer,
        submittedAt: nowIso,
        questions: hasQuestionsArray ? takingExam.questions : [],
        attemptNumber,
        attemptLabel
      };

      setJustSubmittedResult(submittedResultState);
      setTakingExam(null); // Clear taking exam state so it closes active session

      // Refresh records to populate results history & ensure exam leaves active list
      await fetchAllData(false);

    } catch (err: any) {
      alert('විභාගය ඉදිරිපත් කිරීමේ දෝෂයකි: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfPrintResult) return;
    setIsGeneratingPdf(true);
    try {
      const element = document.getElementById('exam-printable-area');
      if (!element) {
        window.print();
        return;
      }

      // Temporarily expand element overflow for full document capture
      const originalMaxHeight = element.style.maxHeight;
      const originalOverflow = element.style.overflow;
      element.style.maxHeight = 'none';
      element.style.overflow = 'visible';
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      element.style.maxHeight = originalMaxHeight;
      element.style.overflow = originalOverflow;
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      
      const totalPages = Math.ceil(imgHeight / pageHeight);

      // Add sliced pages
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -(i * pageHeight), imgWidth, imgHeight, undefined, 'FAST');
      }

      // Overlay subtle, non-intrusive watermark and page numbering on every page
      const numPages = pdf.getNumberOfPages();
      for (let p = 1; p <= numPages; p++) {
        pdf.setPage(p);
        try {
          if ((pdf as any).GState) {
            pdf.saveGraphicsState();
            // Subtle, non-obtrusive watermark
            pdf.setGState(new (pdf as any).GState({ opacity: 0.055 }));
            pdf.setTextColor(30, 41, 59);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(20);
            pdf.text('SMART PHYSICS  •  THARAKA AMARASINGHE', 105, 75, { align: 'center', angle: 40 });
            pdf.text('SMART PHYSICS  •  THARAKA AMARASINGHE', 105, 150, { align: 'center', angle: 40 });
            pdf.text('SMART PHYSICS  •  THARAKA AMARASINGHE', 105, 225, { align: 'center', angle: 40 });

            // Page number footer
            pdf.setGState(new (pdf as any).GState({ opacity: 0.7 }));
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 116, 139);
            pdf.text(`Page ${p} of ${numPages}  •  Smart Physics Official Assessment`, 105, 292, { align: 'center' });
            pdf.restoreGraphicsState();
          }
        } catch (e) {
          console.debug('PDF watermark pass note:', e);
        }
      }

      const safeTitle = (pdfPrintResult.examTitle || 'Exam_Report').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`${safeTitle}_${currentStudent?.username || 'Report'}.pdf`);
    } catch (err) {
      console.error('PDF export failed, using browser print dialog:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-500 dark:text-amber-400">
            <Award size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">ඔබගේ විභාග සහ පැවරුම් ලකුණු වාර්තා ලේඛනය</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">ලෙක්චර්වරුන් විසින් ලබා දුන් ලයිව් විභාග, පැවරුම් ලකුණු සහ ප්‍රතිඵල.</p>
          </div>
        </div>

        <button 
          onClick={() => fetchAllData(true)} 
          className="text-xs px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition font-medium self-start sm:self-auto cursor-pointer"
        >
          යාවත්කාලීන කරන්න (Refresh)
        </button>
      </div>

      {/* =======================================================================
          SECTION 1: ACTIVE PUSHED LIVE EXAMS (ලෙක්චර පුෂ් කරන ලද සජීවී විභාග)
          ======================================================================= */}
      {activeExams.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-extrabold text-sm uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
            <span>🔴 සජීවී විභාගය ක්‍රියාත්මකයි (Active Live Exams Pushed Now)</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {activeExams.map((exam) => {
              return (
                <div
                  key={exam.id}
                  className="bg-gradient-to-r from-rose-50 via-white to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900 border-2 border-rose-400 dark:border-rose-500/50 rounded-3xl p-6 shadow-md dark:shadow-2xl relative overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-2 max-w-xl">
                      <div className="flex items-center gap-2">
                        {exam.isRetakeAllowed ? (
                          <span className="px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/50 animate-pulse">
                            🔄 RETAKE (2 වන අවස්ථාව)
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400 dark:border-rose-500/40 animate-pulse">
                            LIVE PUSHED EXAM
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-indigo-700 dark:bg-slate-950 dark:text-indigo-300 border border-slate-200 dark:border-slate-800">
                          {exam.class_type || exam.target_class_type}
                        </span>
                      </div>

                      <h4 className="text-xl font-black text-slate-900 dark:text-white">
                        {exam.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1">
                          <Clock size={13} className="text-amber-500 dark:text-amber-400" /> කාලය: {exam.duration_minutes || 90} මිනිත්තු
                        </span>
                        <span>&bull;</span>
                        <span>ප්‍රශ්න ගණන: {exam.total_questions || 50}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div>
                      <button
                        onClick={() => handleStartExam(exam)}
                        className="px-6 py-3.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-rose-900/40 transition flex items-center gap-2 cursor-pointer scale-100 hover:scale-105"
                      >
                        <Play size={18} fill="currentColor" />
                        <span>{exam.isRetakeAllowed ? 'නැවත විභාගය ආරම්භ කරන්න (Start Retake)' : 'විභාගය ආරම්භ කරන්න (Start Exam Now)'}</span>
                      </button>
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
          ======================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400">
              <FileText size={18} />
            </div>
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-white">📝 පැවරුම් ලකුණු (Assignment Marks)</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">දේශකතුමා විසින් ඔබගේ Assignment සඳහා ලබා දුන් ලකුණු මට්ටම.</p>
            </div>
          </div>
          <span className="text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">
            {assignmentMarks.length} Assignments
          </span>
        </div>

        {assignmentMarks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-medium">
            තවමත් ඔබට අදාළ පැවරුම් ලකුණු (Assignment Marks) ඇතුළත් කර නොමැත.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3.5">පැවරුම් නාමය (Assignment Title)</th>
                  <th className="p-3.5">පන්තිය (Class)</th>
                  <th className="p-3.5">දිනය (Date)</th>
                  <th className="p-3.5 text-center">ලබාගත් ලකුණු</th>
                  <th className="p-3.5">දේශකවරයා (Lecturer)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {assignmentMarks.map((mark) => (
                  <tr key={mark.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white text-sm">
                      {mark.assignment_name}
                    </td>
                    <td className="p-3.5">
                      <span className="bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded text-[10px] border border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
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
          <Award size={18} className="text-amber-500 dark:text-amber-400" />
          <h4 className="font-bold text-base text-slate-900 dark:text-white">🏆 UBT විභාග ලකුණු සහ ප්‍රතිඵල</h4>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
            විභාග වාර්තා පූරණය වෙමින් පවතී...
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-3">
            <FileText size={40} className="mx-auto text-slate-400 dark:text-slate-600" />
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-300">තවමත් සම්පූර්ණ කළ විභාග වාර්තා නොමැත</h4>
            <p className="text-xs text-slate-600 dark:text-slate-500 max-w-sm mx-auto">
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
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm transition-all duration-200"
                >
                  <div className="p-5 flex justify-between items-start gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold rounded-lg uppercase tracking-wider">
                          {classType}
                        </span>

                        {/* Attempt Number / Label Badge */}
                        {(() => {
                          const attemptNum = meta.attempt_number || (function() {
                            const matching = records.filter(r => 
                              (r.exam_id && rec.exam_id && String(r.exam_id) === String(rec.exam_id)) ||
                              (r.meta_data?.exam_title && rec.meta_data?.exam_title && r.meta_data.exam_title === rec.meta_data.exam_title)
                            );
                            if (matching.length <= 1) return null;
                            const chronological = [...matching].sort((a,b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
                            const idx = chronological.findIndex(r => (r.id && r.id === rec.id) || r.submitted_at === rec.submitted_at);
                            return idx >= 0 ? idx + 1 : null;
                          })();
                          const label = meta.attempt_label || (attemptNum ? `${attemptNum} වන අවස්ථාව (${attemptNum === 1 ? '1st' : attemptNum === 2 ? '2nd' : attemptNum === 3 ? '3rd' : `${attemptNum}th`} Attempt)` : null);
                          if (!label) return null;
                          return (
                            <span className="px-2.5 py-0.5 bg-amber-500/15 border border-amber-500/35 text-[10px] font-bold text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-1">
                              🔄 {label}
                            </span>
                          );
                        })()}

                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar size={12} /> {formattedDate} &bull; {formattedTime}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate leading-snug" title={examTitle}>
                        {examTitle}
                      </h4>

                      <div className="flex items-center gap-3 pt-1 flex-wrap">
                        {summaryArray.length > 0 && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : (rec.id || rec.submitted_at))}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            {isExpanded ? (
                              <><span>සමාලෝචනය සඟවන්න</span> <ChevronUp size={14} /></>
                            ) : (
                              <><span>ප්‍රශ්න සමාලෝචනය</span> <ChevronDown size={14} /></>
                            )}
                          </button>
                        )}

                        <button
                          onClick={async () => {
                            const resolved = await getLecturerForClass(classType, meta.lecturer_name);
                            setPdfPrintResult({
                              id: rec.id,
                              score: scoreVal,
                              totalQ,
                              percentage,
                              summary: summaryArray,
                              examTitle,
                              classType,
                              lecturerName: resolved,
                              submittedAt: rec.submitted_at,
                              questions: meta.questions || []
                            });
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Printer size={13} />
                          <span>Exam Report PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Score Badge Display */}
                    <div className="text-right bg-slate-50 dark:bg-slate-950/90 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 min-w-[95px] shrink-0">
                      <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 block uppercase tracking-wider font-semibold">ලකුණු</span>
                      <div className="flex items-baseline justify-end gap-0.5">
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{scoreVal}</span>
                        <span className="text-xs text-slate-500 font-bold font-mono">/{totalQ}</span>
                      </div>
                      <span className={`text-[10px] font-mono block mt-1 px-1.5 py-0.5 rounded font-bold text-center border ${
                        percentage >= 75 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' :
                        percentage >= 50 ? 'bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300' :
                        'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
                      }`}>
                        {percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detailed Question Breakdown */}
                  {isExpanded && summaryArray.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 animate-in fade-in duration-200">
                      <h5 className="text-xs font-bold text-slate-800 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
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
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200' 
                                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
                              }`}
                            >
                              <span className="font-bold flex items-center gap-1.5">
                                {isCorrect ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <X size={14} className="text-rose-600 dark:text-rose-400" />}
                                ප්‍රශ්න {item.questionNumber}
                              </span>
                              <span className="font-mono text-[11px]">
                                ඔබගේ පිළිතුර: <strong>{item.userAnswer || 'මඟහැර ඇත'}</strong>
                                {!isCorrect && (
                                  <span className="ml-2 text-emerald-700 dark:text-emerald-400 font-bold">
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
        <div className="fixed inset-0 bg-black/75 dark:bg-black/95 backdrop-blur-md flex items-center justify-center z-[70] p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-rose-500/40 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  🔴 සජීවී විභාගය (LIVE ONLINE EXAM)
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{takingExam.title}</h3>
              </div>

              {/* Countdown Timer & Close */}
              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 font-mono font-black text-base shadow-inner ${
                  examSecondsLeft < 300 
                    ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400 animate-pulse' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-amber-600 dark:text-amber-400'
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
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-2 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {(() => {
              const hasQuestionsArray = Array.isArray(takingExam.questions) && takingExam.questions.length > 0;
              const totalQ = hasQuestionsArray ? takingExam.questions.length : (takingExam.total_questions || 50);
              const currentQ = hasQuestionsArray ? takingExam.questions[activeQuestionIndex] : null;
              const currentQNumber = currentQ ? (currentQ.questionNumber || currentQ.id || (activeQuestionIndex + 1)) : (activeQuestionIndex + 1);
              const choicesCount = currentQ?.choices_count || (currentQ?.options && currentQ.options.length) || 5;

              const qText = currentQ ? (currentQ.questionText || currentQ.question_text || currentQ.text || `ප්‍රශ්න අංක ${activeQuestionIndex + 1}`) : '';
              const qImage = currentQ ? (currentQ.imageUrl || currentQ.image_url || currentQ.image) : '';
              const directImageUrl = getDirectDriveImageUrl(qImage);

              const answeredCount = Object.keys(examAnswers).length;

              return (
                <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
                  
                  {/* Left Pane: Question Paper (Interactive CBT Form A or Google Drive PDF Form B) */}
                  <div className="p-4 md:col-span-7 lg:col-span-8 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950/50">
                    {hasQuestionsArray && currentQ ? (
                      /* Form A Interactive CBT Question View */
                      <div className="flex flex-col h-full space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                          <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-black font-mono">
                            ප්‍රශ්න අංක {activeQuestionIndex + 1} / {totalQ}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={activeQuestionIndex === 0}
                              onClick={() => setActiveQuestionIndex(prev => Math.max(0, prev - 1))}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                            >
                              ◀ පෙර ප්‍රශ්නය
                            </button>
                            <button
                              type="button"
                              disabled={activeQuestionIndex >= totalQ - 1}
                              onClick={() => setActiveQuestionIndex(prev => Math.min(totalQ - 1, prev + 1))}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                            >
                              ඊළඟ ප්‍රශ්නය ▶
                            </button>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
                          <p className="text-sm md:text-base font-bold text-slate-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                            {qText}
                          </p>
                        </div>

                        {/* Attached Image Preview if available */}
                        {directImageUrl && (
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
                            <img
                              src={directImageUrl}
                              alt={`Question ${activeQuestionIndex + 1} Diagram`}
                              className="w-full max-w-2xl max-h-[520px] object-contain rounded-xl shadow-sm"
                              loading="eager"
                              onError={(e) => {
                                console.warn('Image failed to load:', directImageUrl);
                              }}
                            />
                          </div>
                        )}

                        {/* Interactive Option Selector on Question Card */}
                        <div className="space-y-2 mt-auto pt-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            මෙම ප්‍රශ්නය සඳහා ඔබගේ පිළිතුර තෝරන්න:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Array.from({ length: choicesCount }, (_, i) => i + 1).map(opt => {
                              const isSelected = examAnswers[currentQNumber] === opt;
                              const optionText = currentQ.options && currentQ.options[opt - 1] ? currentQ.options[opt - 1] : null;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setExamAnswers(prev => ({ ...prev, [currentQNumber]: opt }))}
                                  className={`p-3 rounded-xl border text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-400'
                                      : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-black ${
                                    isSelected ? 'bg-white text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}>
                                    {opt}
                                  </span>
                                  <span className="truncate">{optionText ? optionText : `පිළිතුර (${opt})`}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    ) : (
                      /* Form B PDF View (Cleaned: NO external window button as requested) */
                      <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-300">
                            📄 ප්‍රශ්න පත්‍රය (Question Paper PDF)
                          </span>
                        </div>

                        {takingExam.pdf_url ? (
                          <iframe
                            src={takingExam.pdf_url.replace('/view', '/preview').replace('?usp=sharing', '')}
                            className="w-full flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                            title="Exam PDF"
                          />
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center p-4">
                            ප්‍රශ්න පත්‍රයේ PDF සබැඳියක් නොමැත.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Pane: Form A Square Grid Tile OMR or Form B Bubble OMR */}
                  <div className="p-4 md:col-span-5 lg:col-span-4 flex flex-col h-full overflow-y-auto bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          පිළිතුරු පත්‍රිකාව (OMR Sheet)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {hasQuestionsArray ? 'කොටුව ක්ලික් කර ප්‍රශ්නයට යන්න' : 'පිළිතුරු බුබුළු තෝරන්න'}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {answeredCount} / {totalQ}
                      </span>
                    </div>

                    {hasQuestionsArray ? (
                      /* Form A Requirement: Square Tile Grid of Question Numbers.
                         Answered = Solid Green with Answer/Checkmark; Unanswered = Slate/Neutral.
                         Clicking any tile navigates directly to that question. */
                      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="w-3 h-3 rounded-md bg-emerald-600 inline-block"></span>
                            සපයූ ({answeredCount})
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-800 inline-block"></span>
                            නොසැපයූ ({totalQ - answeredCount})
                          </span>
                        </div>

                        <div className="grid grid-cols-5 gap-2.5 pt-1">
                          {Array.from({ length: totalQ }, (_, i) => i + 1).map(qNum => {
                            const isAnswered = examAnswers[qNum] !== undefined;
                            const selectedOption = examAnswers[qNum];
                            const isCurrentActive = activeQuestionIndex === (qNum - 1);

                            return (
                              <button
                                key={qNum}
                                type="button"
                                onClick={() => setActiveQuestionIndex(qNum - 1)}
                                className={`aspect-square rounded-xl border flex flex-col items-center justify-center transition p-1 cursor-pointer active:scale-95 ${
                                  isCurrentActive
                                    ? 'ring-2 ring-blue-500 border-blue-500 shadow-md'
                                    : ''
                                } ${
                                  isAnswered
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                <span className="font-mono text-xs font-black leading-none">
                                  {qNum}
                                </span>
                                {isAnswered && (
                                  <span className="text-[10px] font-black opacity-90 mt-0.5 font-mono">
                                    ({selectedOption})
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Form B Traditional Bubble Sheet */
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[52vh]">
                        {Array.from({ length: totalQ }, (_, i) => i + 1).map(qNum => {
                          const selected = examAnswers[qNum];
                          return (
                            <div
                              key={qNum}
                              className={`p-2 rounded-xl border flex items-center justify-between transition ${
                                selected 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-500/30' 
                                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-300 w-7">
                                {qNum}.
                              </span>

                              <div className="grid grid-cols-5 gap-1 flex-1 max-w-[200px]">
                                {[1, 2, 3, 4, 5].map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setExamAnswers(prev => ({ ...prev, [qNum]: opt }))}
                                    className={`py-1 rounded text-[11px] font-bold font-mono transition border cursor-pointer ${
                                      selected === opt
                                        ? 'bg-blue-600 border-blue-500 text-white shadow'
                                        : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Submit Action */}
                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => setConfirmSubmitModalOpen(true)}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Send size={16} /> 
                        <span>{isSubmitting ? 'සුරැකෙමින් පවතී...' : 'ප්‍රශ්න පත්‍රය Submit කරන්න'}</span>
                      </button>
                    </div>

                  </div>

                </div>
              );
            })()}

            {/* Custom In-App Confirmation Modal (NO browser window popups!) */}
            {confirmSubmitModalOpen && (() => {
              const hasQuestionsArray = Array.isArray(takingExam.questions) && takingExam.questions.length > 0;
              const totalQ = hasQuestionsArray ? takingExam.questions.length : (takingExam.total_questions || 50);
              const answeredCount = Object.keys(examAnswers).length;
              const unansweredCount = totalQ - answeredCount;

              return (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[85] p-4 animate-in fade-in duration-150">
                  <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                    
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-2xl ${
                        unansweredCount > 0 ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {unansweredCount > 0 ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-900 dark:text-white">
                          විභාගය Submit කිරීම තහවුරු කරන්න
                        </h4>
                        <p className="text-xs text-slate-500">
                          කරුණාකර ඔබ සැපයූ පිළිතුරු ප්‍රමාණය පරීක්ෂා කරන්න.
                        </p>
                      </div>
                    </div>

                    {/* Progress summary box */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600 dark:text-slate-400">මුළු ප්‍රශ්න ගණන:</span>
                        <span className="font-mono text-slate-900 dark:text-white">{totalQ}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-emerald-600 dark:text-emerald-400">පිළිතුරු සපයා ඇති ප්‍රමාණය:</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">{answeredCount}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-amber-600 dark:text-amber-400">නොසැපයූ ප්‍රශ්න ගණන:</span>
                        <span className="font-mono text-amber-600 dark:text-amber-400">{unansweredCount}</span>
                      </div>
                    </div>

                    {unansweredCount > 0 ? (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold leading-relaxed">
                        ⚠️ ඔබ තවමත් ප්‍රශ්න <strong>{unansweredCount}</strong> කට පිළිතුරු සපයා නොමැත. ඔබට මෙම විභාගය අවසන් කර දැන්ම Submit කිරීමට අවශ්‍ය බව තහවුරු කරන්නද?
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold leading-relaxed">
                        ✅ ඔබ සියලුම ප්‍රශ්න සාර්ථකව සම්පූර්ණ කර ඇත! විභාගය අවසන් කර Submit කිරීමට සනාථ කරන්න.
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmSubmitModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
                      >
                        ආපසු ගොස් පිළිතුරු සපයන්න
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSubmitExamAnswers(false)}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-900/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Check size={15} />
                        <span>{isSubmitting ? 'Submit වෙමින් පවතී...' : 'ඔව්, Submit කරන්න'}</span>
                      </button>
                    </div>

                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* =======================================================================
          INSTANT RESULTS VIEW (Displayed immediately upon submission)
          ======================================================================= */}
      {justSubmittedResult && (
        <div className="fixed inset-0 bg-black/80 dark:bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-[90] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/50 p-6 sm:p-8 rounded-3xl max-w-lg w-full text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
              <Award size={36} />
            </div>

            <div>
              <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  EXAMINATION COMPLETED
                </span>
                {justSubmittedResult.attemptLabel && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                    🔄 {justSubmittedResult.attemptLabel}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                විභාගය සාර්ථකව අවසන් කළා!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {justSubmittedResult.examTitle}
              </p>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
                {justSubmittedResult.score} <span className="text-xl text-slate-400 font-normal">/ {justSubmittedResult.totalQ}</span>
              </div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                ලබාගත් ප්‍රතිශතය: <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">{justSubmittedResult.percentage}%</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setPdfPrintResult(justSubmittedResult);
                }}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold rounded-2xl text-xs sm:text-sm shadow-xl shadow-indigo-900/40 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Download size={16} />
                <span>Download Exam PDF (සම්පූර්ණ ප්‍රශ්න පත්‍රය සහ පිළිතුරු)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setJustSubmittedResult(null);
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                ප්‍රතිඵල ලේඛනය වෙත ආපසු යන්න
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          PRINTABLE / DOWNLOADABLE EXAM REPORT MODAL WITH WATERMARK
          ======================================================================= */}
      {pdfPrintResult && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-4xl h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300">
            
            {/* Action Bar (Hidden during print) */}
            <div className="print:hidden bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="text-amber-400" size={20} />
                <span className="font-bold text-sm">නිල විභාග වාර්තාව (Exam Paper &amp; Answers Report)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isGeneratingPdf}
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>{isGeneratingPdf ? 'PDF ගොනුව සකසමින් පවතී...' : 'Download PDF File (.pdf)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Printer size={15} />
                  <span>මුද්‍රණය කරන්න (Print)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPdfPrintResult(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Document Container */}
            <div 
              id="exam-printable-area" 
              className="flex-1 overflow-y-auto p-6 sm:p-10 relative bg-white text-slate-900 print:p-0 print:overflow-visible max-w-[800px] mx-auto"
            >
              {/* Subtle background diagonal watermark that never obstructs text */}
              <div 
                className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex flex-col justify-around py-6 select-none opacity-[0.035] print:opacity-[0.04]"
                aria-hidden="true"
              >
                {Array.from({ length: 40 }).map((_, idx) => (
                  <div key={idx} className="whitespace-nowrap -rotate-25 text-center font-black text-xl sm:text-2xl text-slate-900 tracking-widest my-5">
                    SMART PHYSICS &bull; THARAKA AMARASINGHE &bull; SMART PHYSICS &bull; THARAKA AMARASINGHE
                  </div>
                ))}
              </div>

              {/* Printable Content */}
              <div className="relative z-10 space-y-6">
                
                {/* Official Header */}
                <div className="border-b-2 border-slate-800 pb-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <img 
                      src="/logo_cropped.png" 
                      onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                      alt="Smart Physics Logo" 
                      className="w-16 h-16 object-contain rounded-xl p-0.5 bg-white shrink-0 drop-shadow-sm" 
                    />
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight leading-none">
                        SMART PHYSICS
                      </h1>
                      <div className="text-sm sm:text-base font-extrabold text-indigo-700 tracking-wide mt-1">
                        THARAKA AMARASINGHE
                      </div>
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-0.5">
                        ස්වයංක්‍රීයව ජනනය කරන ලද නිල විභාග වාර්තාව
                      </p>
                      <p className="text-[9px] text-slate-500 font-mono">
                        Official Automated Examination Performance Report
                      </p>
                    </div>
                  </div>

                  <div className="text-right sm:text-right">
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-900 border border-slate-300">
                      {pdfPrintResult.classType || 'Advanced Level Physics'}
                    </span>
                    <div className="text-xs font-mono text-slate-600 mt-1">
                      {new Date(pdfPrintResult.submittedAt || Date.now()).toLocaleDateString('si-LK', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })} &bull; {new Date(pdfPrintResult.submittedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* Student Details & Results Table */}
                <div className="rounded-2xl border-2 border-slate-300 overflow-hidden bg-slate-50/70">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-3 font-bold text-slate-600 w-1/4 bg-slate-100/70">සිසුවාගේ නම (Student Name):</td>
                        <td className="p-3 font-black text-slate-900">{currentStudent?.full_name || currentStudent?.name || currentStudent?.username}</td>
                        <td className="p-3 font-bold text-slate-600 w-1/4 bg-slate-100/70">Username / Student ID:</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{currentStudent?.username}</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-600 bg-slate-100/70">විභාගයේ මාතෘකාව (Exam Title):</td>
                        <td className="p-3 font-bold text-slate-900">{pdfPrintResult.examTitle}</td>
                        <td className="p-3 font-bold text-slate-600 bg-slate-100/70">දේශකතුමා (Lecturer):</td>
                        <td className="p-3 font-bold text-slate-900">{pdfPrintResult.lecturerName || 'තාරක අමරසිංහ (Tharaka Amarasinghe)'}</td>
                      </tr>
                      <tr className="bg-emerald-50/60">
                        <td className="p-3 font-bold text-emerald-900 bg-emerald-100/60">ලබාගත් ලකුණු (Marks Obtained):</td>
                        <td className="p-3 font-black text-base text-emerald-700">
                          {pdfPrintResult.score} / {pdfPrintResult.totalQ}
                        </td>
                        <td className="p-3 font-bold text-emerald-900 bg-emerald-100/60">ප්‍රතිශතය (Percentage):</td>
                        <td className="p-3 font-black text-base text-emerald-700 font-mono">
                          {pdfPrintResult.percentage}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Questions and Detailed Review */}
                <div className="space-y-4 pt-2">
                  <div className="border-b border-slate-300 pb-2 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      සම්පූර්ණ ප්‍රශ්න පත්‍රය සහ ඔබ තෝරාගත් පිළිතුරු සමාලෝචනය
                    </h3>
                    <span className="text-xs font-bold text-slate-500">
                      ප්‍රශ්න {pdfPrintResult.summary?.length || pdfPrintResult.totalQ}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {(pdfPrintResult.summary || []).map((item: any, qIdx: number) => {
                      const isCorrect = item.isCorrect;
                      const hasOptions = Array.isArray(item.options) && item.options.length > 0;
                      const directImg = getDirectDriveImageUrl(item.imageUrl);
                      const isQuestionNumberText = item.questionText && 
                        new RegExp(`^(ප්‍රශ්න\\s*අංක|Question)\\s*${item.questionNumber}$`, 'i').test(item.questionText.trim());

                      return (
                        <div 
                          key={qIdx} 
                          className={`p-4 rounded-2xl border ${
                            isCorrect 
                              ? 'border-emerald-300 bg-emerald-50/30' 
                              : 'border-rose-300 bg-rose-50/20'
                          } space-y-3 break-inside-avoid`}
                        >
                          {/* Question Number and Status */}
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                            <span className="px-3 py-1 rounded-lg bg-indigo-900 text-white font-mono text-xs font-black tracking-wide shadow-sm">
                              ප්‍රශ්න අංක {item.questionNumber}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                              isCorrect 
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {isCorrect ? '✓ නිවැරදියි (Correct)' : '✗ වැරදියි (Incorrect)'}
                            </span>
                          </div>

                          {/* Question Text (Only show if not merely repeating the question number) */}
                          {item.questionText && !isQuestionNumberText && (
                            <p className="text-xs sm:text-sm font-bold text-slate-900 whitespace-pre-wrap leading-relaxed">
                              {item.questionText}
                            </p>
                          )}

                          {/* Diagram / Image */}
                          {directImg && (
                            <div className="my-2 border border-slate-200 rounded-xl overflow-hidden bg-white p-2">
                              <img
                                src={directImg}
                                alt={`Question ${item.questionNumber} Diagram`}
                                className="max-h-72 w-auto object-contain mx-auto"
                                crossOrigin="anonymous"
                                loading="eager"
                              />
                            </div>
                          )}

                          {/* Options Grid if manual Form A */}
                          {hasOptions && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                              {item.options.map((optStr: string, optIdx: number) => {
                                const optNum = optIdx + 1;
                                const isUserChoice = item.userAnswer === optNum;
                                const isCorrectChoice = Number(item.correctAns) === optNum;

                                return (
                                  <div
                                    key={optIdx}
                                    className={`p-2 rounded-xl border flex items-center gap-2 font-medium ${
                                      isCorrectChoice
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold'
                                        : isUserChoice
                                          ? 'bg-rose-100 text-rose-900 border-rose-400'
                                          : 'bg-white border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-black ${
                                      isCorrectChoice ? 'bg-emerald-700 text-white' : isUserChoice ? 'bg-rose-700 text-white' : 'bg-slate-200 text-slate-800'
                                    }`}>
                                      {optNum}
                                    </span>
                                    <span className="truncate">{optStr || `පිළිතුර (${optNum})`}</span>
                                    {isCorrectChoice && <span className="ml-auto text-emerald-800 font-bold">✓ නිවැරදි</span>}
                                    {isUserChoice && !isCorrectChoice && <span className="ml-auto text-rose-800 font-bold">ඔබගේ තේරීම</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Answers Summary strip */}
                          <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1 text-slate-700 border-t border-slate-200">
                            <span>
                              ඔබගේ පිළිතුර: <strong className={isCorrect ? 'text-emerald-700' : 'text-rose-700'}>
                                {item.userAnswer !== null ? `(${item.userAnswer})` : 'මඟහැර ඇත (Skipped)'}
                              </strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              නිවැරදි පිළිතුර: <strong className="text-emerald-700 font-bold">({item.correctAns})</strong>
                            </span>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Stamp */}
                <div className="pt-6 border-t-2 border-slate-800 text-center text-xs text-slate-500 font-mono space-y-1">
                  <p className="font-bold text-slate-700">
                    Official System Generated Record • Tharaka Amarasinghe Physics • LMS Verified
                  </p>
                  <p className="text-[10px]">
                    Watermark: SMART PHYSICS THARAKA AMARASINGHE &bull; Generated on {new Date().toLocaleString()}
                  </p>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default OnlineExamsHistory;