import React, { useState, useEffect } from 'react';
import { 
  Award, Clock, CheckCircle2, ChevronRight, Send, 
  ExternalLink, ArrowLeft, BookOpen, AlertCircle, Sparkles, Check, X, Phone, User,
  Download, Printer, Loader2, FileText, ChevronLeft
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../supabaseClient';

interface Props {
  examId?: string;
  onBackHome?: () => void;
}

export default function PublicExamPortal({ examId: initialExamId, onBackHome }: Props) {
  // Enforce Day Mode (Light Mode) for Public Exam Portal as requested
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) {
        root.classList.add('dark');
      }
    };
  }, []);

  // Extract examId from URL param if not directly passed
  const [examId, setExamId] = useState<string>(() => {
    if (initialExamId) return initialExamId;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('public_exam') || params.get('id') || '';
    } catch {
      return '';
    }
  });

  const [exam, setExam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guest Student Details Form
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestSchool, setGuestSchool] = useState('');
  const [isStarted, setIsStarted] = useState(false);

  // Active Exam Taker States
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);

  // PDF Download States
  const [pdfPrintResult, setPdfPrintResult] = useState<any | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      try {
        if (isStarted && !submissionResult && 'wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.debug('Public Exam Wake Lock note:', err);
      }
    };

    if (isStarted && !submissionResult) {
      requestWakeLock();
    }

    return () => {
      if (wakeLockSentinel) {
        try { wakeLockSentinel.release(); } catch (e) {}
      }
    };
  }, [isStarted, submissionResult]);

  // Load Exam Data
  useEffect(() => {
    if (!examId) {
      setLoading(false);
      setErrorMsg('විභාග අංකයක් (Exam ID) හමු නොවීය. කරුණාකර නිවැරදි Public Link එක පරීක්ෂා කරන්න.');
      return;
    }

    const loadExam = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        // 1. Try ubt_exams table
        let found: any = null;
        const { data: ubtData } = await supabase.from('ubt_exams').select('*').eq('id', examId).maybeSingle();
        if (ubtData) {
          let questions = ubtData.questions || [];
          if ((!questions || questions.length === 0) && typeof ubtData.pdf_url === 'string' && ubtData.pdf_url.startsWith('ubt_manual_questions://')) {
            try {
              questions = JSON.parse(decodeURIComponent(ubtData.pdf_url.replace('ubt_manual_questions://', '')));
            } catch (e) {}
          }
          found = {
            ...ubtData,
            questions: questions
          };
        } else {
          // 2. Try exams table
          const { data: stdData } = await supabase.from('exams').select('*').eq('id', examId).maybeSingle();
          if (stdData) {
            let questions = stdData.questions || [];
            if ((!questions || questions.length === 0) && typeof stdData.pdf_url === 'string' && stdData.pdf_url.startsWith('ubt_manual_questions://')) {
              try {
                questions = JSON.parse(decodeURIComponent(stdData.pdf_url.replace('ubt_manual_questions://', '')));
              } catch (e) {}
            }
            const isManual = questions.length > 0 || !stdData.pdf_url || stdData.pdf_url.startsWith('ubt_manual_questions://');
            found = {
              id: stdData.id,
              title: stdData.title,
              format: isManual ? 'form_a' : 'form_b',
              pdf_url: stdData.pdf_url?.startsWith('ubt_manual_questions://') ? '' : stdData.pdf_url,
              total_questions: stdData.total_questions || (questions.length > 0 ? questions.length : 10),
              duration_minutes: stdData.duration_minutes || 90,
              correct_answers: stdData.correct_answer || stdData.correct_answers || {},
              questions: questions,
              status: stdData.status || 'active'
            };
          }
        }

        if (!found) {
          setErrorMsg('අදාළ Public Exam එක ඩේටාබේස් එකේ හමු නොවීය. එය ඉවත් කර හෝ අවසන් කර තිබිය හැක.');
        } else {
          setExam(found);
          const totalSecs = (found.duration_minutes || 90) * 60;
          setSecondsLeft(totalSecs);
        }
      } catch (err: any) {
        setErrorMsg('විභාග දත්ත ලබා ගැනීමේ දෝෂයකි: ' + (err.message || ''));
      } finally {
        setLoading(false);
      }
    };

    loadExam();
  }, [examId]);

  // Countdown timer
  useEffect(() => {
    let timer: any = null;
    if (isStarted && secondsLeft > 0 && !submissionResult) {
      timer = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmitAnswers(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isStarted, secondsLeft, submissionResult]);

  const getDirectDriveImageUrl = (url?: string) => {
    if (!url) return '';
    try {
      const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match1 && match1[1]) return `https://drive.google.com/uc?export=view&id=${match1[1]}`;
      const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match2 && match2[1]) return `https://drive.google.com/uc?export=view&id=${match2[1]}`;
      return url;
    } catch {
      return url;
    }
  };

  const handleStartExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      alert('කරුණාකර ඔබගේ නම ඇතුළත් කරන්න.');
      return;
    }
    if (!guestPhone.trim() || guestPhone.trim().length < 9) {
      alert('කරුණාකර නිවැරදි දුරකථන / WhatsApp අංකයක් ඇතුළත් කරන්න.');
      return;
    }
    setIsStarted(true);
  };

  const handleSubmitAnswers = async (isAuto = false) => {
    if (!exam || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const correctMap = { ...(exam.correct_answers || exam.correct_answer || {}) };
      if (Array.isArray(exam.questions) && exam.questions.length > 0) {
        exam.questions.forEach((q: any, idx: number) => {
          const qNum = q.id ?? q.questionNumber ?? (idx + 1);
          if (q.correctAnswer !== undefined || q.correct_choice !== undefined) {
            const cAns = q.correctAnswer ?? q.correct_choice;
            correctMap[qNum] = cAns;
            correctMap[String(qNum)] = cAns;
          }
        });
      }

      const totalQ = (Array.isArray(exam.questions) && exam.questions.length > 0)
        ? exam.questions.length
        : (exam.total_questions || 50);

      let score = 0;
      const summary: any[] = [];

      for (let i = 1; i <= totalQ; i++) {
        const userAns = examAnswers[i] ?? null;
        const correctAns = correctMap[i] ?? correctMap[String(i)] ?? null;
        const isCorrect = userAns !== null && correctAns !== null && Number(userAns) === Number(correctAns);
        if (isCorrect) score++;

        const qObj = (Array.isArray(exam.questions) && exam.questions[i - 1]) ? exam.questions[i - 1] : null;
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
      const submissionId = `public_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const guestUsername = `guest_${guestPhone.trim().replace(/[^0-9]/g, '')}`;

      const resultPayload = {
        id: submissionId,
        username: guestUsername,
        student_id: guestUsername,
        exam_id: exam.id,
        score,
        submitted_at: nowIso,
        meta_data: {
          exam_title: exam.title,
          class_type: 'Public Exam',
          is_public_submission: true,
          full_name: guestName.trim(),
          phone: guestPhone.trim(),
          school: guestSchool.trim(),
          total_questions: totalQ,
          percentage,
          results_summary: summary,
          questions: Array.isArray(exam.questions) ? exam.questions : [],
          is_auto_submitted: isAuto
        }
      };

      try {
        await supabase.from('exam_results').insert([resultPayload]);
      } catch (err) {
        console.warn('Public exam result insert note:', err);
      }

      const finalResult = {
        id: submissionId,
        score,
        totalQ,
        percentage,
        summary,
        examTitle: exam.title,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestSchool: guestSchool.trim(),
        submittedAt: nowIso,
        questions: Array.isArray(exam.questions) ? exam.questions : []
      };

      setSubmissionResult(finalResult);
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
      const element = document.getElementById('public-exam-printable-area');
      if (!element) {
        window.print();
        return;
      }

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
            pdf.text(`Page ${p} of ${numPages}  •  Smart Physics Public Assessment`, 105, 292, { align: 'center' });
            pdf.restoreGraphicsState();
          }
        } catch (e) {
          console.debug('PDF watermark pass note:', e);
        }
      }

      const safeTitle = (pdfPrintResult.examTitle || 'Public_Exam_Report').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`${safeTitle}_${pdfPrintResult.guestName || 'Report'}.pdf`);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-700">ප්‍රසිද්ධ විභාගය පූරණය වෙමින් පවතී...</p>
      </div>
    );
  }

  if (errorMsg || !exam) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-black mb-2 text-slate-900">විභාගය විවෘත කළ නොහැක</h2>
        <p className="text-xs text-slate-600 max-w-md mb-6">{errorMsg || 'විභාගය හමු නොවීය.'}</p>
        <button
          onClick={() => {
            if (onBackHome) onBackHome();
            else window.location.href = '/';
          }}
          className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
        >
          <ArrowLeft size={16} /> මුල් පිටුව වෙත යන්න (Home)
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Top Header - Pure Crisp Day Mode */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 px-4 py-3 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src="/logo_cropped.png" 
            onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
            alt="Smart Physics Logo" 
            className="w-11 h-11 object-contain rounded-xl p-0.5 bg-white drop-shadow-sm border border-slate-200 shrink-0" 
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-slate-950 tracking-tight leading-none">
                SMART PHYSICS
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-bold">
                🌐 PUBLIC EXAM
              </span>
            </div>
            <div className="text-[11px] font-bold text-blue-700 tracking-wide mt-0.5">
              THARAKA AMARASINGHE
            </div>
            <p className="text-[11px] font-semibold text-slate-600 truncate max-w-xs sm:max-w-md">
              {exam.title}
            </p>
          </div>
        </div>

        {isStarted && !submissionResult && (
          <div className="flex items-center gap-2 font-mono font-black text-xs px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 shadow-sm">
            <Clock size={14} className="text-amber-600" />
            <span>{formatTimer(secondsLeft)}</span>
          </div>
        )}
      </header>

      {/* Main Body */}
      <main className="flex-1 p-3 sm:p-6 max-w-6xl mx-auto w-full">
        
        {/* Step 1: Pre-Exam Registration Form - Day Mode */}
        {!isStarted && !submissionResult && (
          <div className="max-w-xl mx-auto mt-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <BookOpen size={28} />
              </div>
              <h2 className="text-xl font-black text-slate-900">ප්‍රසිද්ධ විභාගයට ලියාපදිංචි වන්න</h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                මෙම විභාගයට මුහුණ දීමට කිසිදු Password එකක් හෝ ගිණුමක් අවශ්‍ය නොවේ. ඔබගේ නම සහ දුරකථන අංකය ඇතුළත් කර ආරම්භ කරන්න.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">ප්‍රශ්න ගණන</span>
                <span className="text-base font-black text-slate-900">{exam.total_questions || 50}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">කාලය</span>
                <span className="text-base font-black text-amber-700">{exam.duration_minutes || 90} Mins</span>
              </div>
            </div>

            <form onSubmit={handleStartExam} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User size={13} className="text-blue-600" /> ඔබගේ සම්පූර්ණ නම (Full Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. කසුන් පෙරේරා / Kasun Perera"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-600 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Phone size={13} className="text-blue-600" /> WhatsApp / දුරකථන අංකය *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0771234567"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-blue-600 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  පාසල / නගරය (School / City)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ananda College, Colombo"
                  value={guestSchool}
                  onChange={(e) => setGuestSchool(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-600 focus:bg-white transition"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm rounded-xl shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2 cursor-pointer pt-3 mt-4 active:scale-95"
              >
                <span>විභාගය ආරම්භ කරන්න (Start Exam Now)</span>
                <ChevronRight size={18} />
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Exam Taking View - Day Mode */}
        {isStarted && !submissionResult && (
          <div className="bg-white border border-slate-200 rounded-3xl h-[84vh] flex flex-col shadow-xl overflow-hidden">
            {(() => {
              const hasQuestions = Array.isArray(exam.questions) && exam.questions.length > 0;
              const totalQ = hasQuestions ? exam.questions.length : (exam.total_questions || 50);
              const currentQ = hasQuestions ? exam.questions[activeQuestionIndex] : null;
              const currentQNumber = currentQ ? (currentQ.id ?? currentQ.questionNumber ?? (activeQuestionIndex + 1)) : (activeQuestionIndex + 1);
              const choicesCount = currentQ?.choices_count || 5;

              return (
                <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                  
                  {/* Left Pane: Questions (Form A CBT or Form B PDF) */}
                  <div className="p-4 md:col-span-7 lg:col-span-8 flex flex-col h-full overflow-y-auto bg-slate-50/60">
                    {hasQuestions && currentQ ? (
                      <div className="flex flex-col h-full space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-black font-mono">
                            ප්‍රශ්න අංක {activeQuestionIndex + 1} / {totalQ}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={activeQuestionIndex === 0}
                              onClick={() => setActiveQuestionIndex(prev => Math.max(0, prev - 1))}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer shadow-sm flex items-center gap-1"
                            >
                              <ChevronLeft size={14} /> පෙර ප්‍රශ්නය
                            </button>
                            <button
                              type="button"
                              disabled={activeQuestionIndex >= totalQ - 1}
                              onClick={() => setActiveQuestionIndex(prev => Math.min(totalQ - 1, prev + 1))}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer shadow-sm flex items-center gap-1"
                            >
                              ඊළඟ ප්‍රශ්නය <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm">
                          <p className="text-sm md:text-base font-bold text-slate-900 whitespace-pre-wrap leading-relaxed">
                            {currentQ.questionText || currentQ.question_text || `ප්‍රශ්න අංක ${activeQuestionIndex + 1}`}
                          </p>
                        </div>

                        {/* Image Preview if available */}
                        {(currentQ.imageUrl || currentQ.image_url) && (
                          <div className="bg-white border border-slate-200 p-2.5 rounded-2xl flex items-center justify-center max-h-[280px] overflow-hidden shadow-sm">
                            <img
                              src={getDirectDriveImageUrl(currentQ.imageUrl || currentQ.image_url)}
                              alt={`Question ${activeQuestionIndex + 1}`}
                              className="max-h-[260px] w-auto object-contain rounded-lg"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          </div>
                        )}

                        {/* Options */}
                        <div className="space-y-2 mt-auto pt-2">
                          <span className="text-xs font-bold text-slate-700">පිළිතුර තෝරන්න:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Array.from({ length: choicesCount }, (_, i) => i + 1).map(opt => {
                              const isSelected = examAnswers[currentQNumber] === opt;
                              const optText = currentQ.options && currentQ.options[opt - 1] ? currentQ.options[opt - 1] : null;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setExamAnswers(prev => ({ ...prev, [currentQNumber]: opt }))}
                                  className={`p-3 rounded-xl border text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer shadow-sm ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-black shrink-0 ${
                                    isSelected ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {opt}
                                  </span>
                                  <span className="truncate">{optText ? optText : `පිළිතුර (${opt})`}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    ) : (
                      /* Form B PDF View */
                      <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-800">ප්‍රශ්න පත්‍රය (Question Paper)</span>
                          {exam.pdf_url && (
                            <a
                              href={exam.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <ExternalLink size={12} /> වෙනම Window එකක විවෘත කරන්න
                            </a>
                          )}
                        </div>

                        {exam.pdf_url ? (
                          <iframe
                            src={exam.pdf_url.replace('/view', '/preview').replace('?usp=sharing', '')}
                            className="w-full flex-1 rounded-xl border border-slate-200 bg-white"
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

                  {/* Right Pane: OMR Bubble Sheet */}
                  <div className="p-4 md:col-span-5 lg:col-span-4 flex flex-col h-full overflow-y-auto bg-white">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-800">OMR Bubble Sheet:</span>
                      <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        {Object.keys(examAnswers).length} / {totalQ} සම්පූර්ණයි
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[55vh]">
                      {Array.from({ length: totalQ }, (_, i) => i + 1).map(qNum => {
                        const selected = examAnswers[qNum];
                        const isCurrent = hasQuestions && activeQuestionIndex === (qNum - 1);
                        return (
                          <div
                            key={qNum}
                            onClick={() => {
                              if (hasQuestions) setActiveQuestionIndex(qNum - 1);
                            }}
                            className={`p-2 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                              isCurrent
                                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50'
                                : selected 
                                ? 'bg-emerald-50/80 border-emerald-300' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <span className="font-mono font-bold text-xs text-slate-800 w-7">
                              {qNum}.
                            </span>

                            <div className="grid grid-cols-5 gap-1 flex-1 max-w-[200px]">
                              {[1, 2, 3, 4, 5].map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExamAnswers(prev => ({ ...prev, [qNum]: opt }));
                                  }}
                                  className={`py-1 rounded text-[11px] font-bold font-mono transition border cursor-pointer ${
                                    selected === opt
                                      ? 'bg-blue-600 border-blue-600 text-white shadow'
                                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
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

                    {/* Submit Button */}
                    <div className="pt-3 mt-3 border-t border-slate-200">
                      <button
                        onClick={() => {
                          const answered = Object.keys(examAnswers).length;
                          if (answered < totalQ) {
                            if (!window.confirm(`ඔබ තවමත් ප්‍රශ්න ${totalQ - answered} කට පිළිතුරු සපයා නොමැත. විභාගය Submit කිරීමට සනාථ කරන්නද?`)) return;
                          } else {
                            if (!window.confirm('ප්‍රශ්න පත්‍රය අවසන් කර Submit කිරීමට සනාථ කරන්නද?')) return;
                          }
                          handleSubmitAnswers(false);
                        }}
                        disabled={isSubmitting}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                      >
                        <Send size={16} />
                        <span>{isSubmitting ? 'සුරැකෙමින් පවතී...' : 'විභාගය Submit කරන්න'}</span>
                      </button>
                    </div>

                  </div>

                </div>
              );
            })()}
          </div>
        )}

        {/* Step 3: Instant Result Card - Day Mode */}
        {submissionResult && (
          <div className="max-w-xl mx-auto mt-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
              <Award size={36} />
            </div>

            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                EXAMINATION COMPLETED
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                විභාගය සාර්ථකව අවසන් කළා!
              </h2>
              <p className="text-xs text-slate-600 mt-1 font-semibold">
                {guestName} &bull; {guestPhone}
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-500 font-bold block">ලබාගත් ලකුණු</span>
              <div className="text-4xl font-black text-emerald-600 my-1">
                {submissionResult.score} <span className="text-xl text-slate-400 font-normal">/ {submissionResult.totalQ}</span>
              </div>
              <div className="text-sm font-bold text-slate-700">
                ප්‍රතිශතය: <span className="text-emerald-700 font-mono font-black">{submissionResult.percentage}%</span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              {/* Download Exam PDF Button */}
              <button
                type="button"
                onClick={() => setPdfPrintResult(submissionResult)}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl text-xs sm:text-sm shadow-xl shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Download size={16} />
                <span>Download Exam PDF (සම්පූර්ණ ප්‍රශ්න පත්‍රය සහ පිළිතුරු)</span>
              </button>

              <button
                onClick={() => {
                  if (onBackHome) onBackHome();
                  else window.location.href = '/';
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                මුල් පිටුව වෙත යන්න (Back to Home)
              </button>
            </div>
          </div>
        )}

      </main>

      {/* =======================================================================
          PRINTABLE / DOWNLOADABLE EXAM REPORT MODAL WITH WATERMARK (PUBLIC EXAM)
          ======================================================================= */}
      {pdfPrintResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-4xl h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300">
            
            {/* Action Bar (Hidden during print) */}
            <div className="print:hidden bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="text-amber-400" size={20} />
                <span className="font-bold text-sm">නිල විභාග වාර්තාව (Public Assessment Report)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isGeneratingPdf}
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
              id="public-exam-printable-area" 
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
                      <div className="text-sm sm:text-base font-extrabold text-blue-700 tracking-wide mt-1">
                        THARAKA AMARASINGHE
                      </div>
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-0.5">
                        ස්වයංක්‍රීයව ජනනය කරන ලද නිල විභාග වාර්තාව
                      </p>
                      <p className="text-[9px] text-slate-500 font-mono">
                        Official Automated Examination Performance Report (Public Exam)
                      </p>
                    </div>
                  </div>

                  <div className="text-right sm:text-right">
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-900 border border-slate-300">
                      Public Assessment
                    </span>
                    <div className="text-xs font-mono text-slate-600 mt-1">
                      {new Date(pdfPrintResult.submittedAt || Date.now()).toLocaleDateString('si-LK', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })} &bull; {new Date(pdfPrintResult.submittedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* Candidate & Exam Metadata Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">සිසුවාගේ නම (Student)</span>
                    <span className="font-extrabold text-slate-900">{pdfPrintResult.guestName || 'Public Candidate'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">දුරකථන අංකය (Contact)</span>
                    <span className="font-bold font-mono text-slate-800">{pdfPrintResult.guestPhone || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">පාසල (School)</span>
                    <span className="font-bold text-slate-800">{pdfPrintResult.guestSchool || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">විභාගය (Exam)</span>
                    <span className="font-extrabold text-blue-700 truncate block" title={pdfPrintResult.examTitle}>
                      {pdfPrintResult.examTitle}
                    </span>
                  </div>
                </div>

                {/* Score Summary Box */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">ප්‍රතිඵල සාරාංශය (Score Summary)</h3>
                    <div className="text-3xl font-black text-slate-900 mt-1 flex items-baseline gap-2">
                      <span>{pdfPrintResult.score}</span>
                      <span className="text-base text-slate-500 font-normal">/ {pdfPrintResult.totalQ}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-center px-4 py-2 bg-white rounded-xl border border-blue-200 shadow-sm">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">ප්‍රතිශතය</span>
                      <span className="text-xl font-black text-blue-700 font-mono">{pdfPrintResult.percentage}%</span>
                    </div>
                    <div className="text-center px-4 py-2 bg-white rounded-xl border border-blue-200 shadow-sm">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">තත්වය</span>
                      <span className={`text-base font-black ${pdfPrintResult.percentage >= 40 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {pdfPrintResult.percentage >= 40 ? 'PASSED' : 'ATTEMPTED'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Questions & Answers Breakdown */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                    <span>ප්‍රශ්න සහ පිළිතුරු විස්තරය (Questions &amp; Detailed Review)</span>
                  </h4>

                  <div className="space-y-4">
                    {(pdfPrintResult.summary || []).map((item: any, idx: number) => {
                      const isCorrect = Boolean(item.isCorrect);
                      const qObj = (pdfPrintResult.questions && pdfPrintResult.questions[idx]) || null;
                      const qText = item.questionText || qObj?.questionText || `ප්‍රශ්න අංක ${idx + 1}`;
                      const qImage = item.imageUrl || qObj?.imageUrl || '';
                      const qOptions: string[] = item.options?.length > 0 ? item.options : (qObj?.options || []);

                      return (
                        <div 
                          key={idx} 
                          className={`p-4 rounded-xl border text-xs space-y-2 ${
                            isCorrect 
                              ? 'bg-emerald-50/40 border-emerald-200' 
                              : 'bg-rose-50/40 border-rose-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-black text-slate-900 font-mono text-xs">
                              {idx + 1}. {qText}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                              isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}>
                              {isCorrect ? 'නිවැරදියි (Correct)' : 'වැරදියි (Incorrect)'}
                            </span>
                          </div>

                          {qImage && (
                            <div className="max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 inline-block">
                              <img 
                                src={getDirectDriveImageUrl(qImage)} 
                                alt={`Question ${idx + 1}`} 
                                className="max-h-44 w-auto object-contain"
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              />
                            </div>
                          )}

                          {qOptions.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                              {qOptions.map((optStr, optIdx) => {
                                const choiceNum = optIdx + 1;
                                const isUserChoice = Number(item.userAnswer) === choiceNum;
                                const isCorrectChoice = Number(item.correctAns) === choiceNum;
                                
                                return (
                                  <div 
                                    key={optIdx} 
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-between ${
                                      isCorrectChoice
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold'
                                        : isUserChoice && !isCorrect
                                        ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                                        : 'bg-white text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    <span>({choiceNum}) {optStr}</span>
                                    {isCorrectChoice && <span className="text-[10px] font-extrabold text-emerald-700">✓ නිවැරදි පිළිතුර</span>}
                                    {isUserChoice && !isCorrect && <span className="text-[10px] font-extrabold text-rose-700">✗ ඔබගේ පිළිතුර</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-[11px] pt-1 text-slate-700">
                            <span>
                              ඔබ ලබාදුන් පිළිතුර: <strong className={isCorrect ? 'text-emerald-700' : 'text-rose-700'}>{item.userAnswer ? `(${item.userAnswer})` : 'නොසැපයීය'}</strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              නිවැරදි පිළිතුර: <strong className="text-emerald-700">({item.correctAns || 'N/A'})</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Sign-off */}
                <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-500 font-mono">
                  Smart Physics Online Assessment System &bull; Lecturer: Tharaka Amarasinghe &bull; Generated on {new Date().toISOString().split('T')[0]}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
