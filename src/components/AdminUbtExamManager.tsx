import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '../realtimeSync';
import { 
  FileText, 
  Plus, 
  Clock, 
  Calendar, 
  Trash2, 
  Edit, 
  Send, 
  EyeOff, 
  RotateCcw, 
  CheckCircle2, 
  X, 
  Image as ImageIcon, 
  Layers, 
  Search, 
  Award, 
  Play, 
  Check, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Copy,
  Loader2
} from 'lucide-react';

export interface UbtQuestion {
  questionNumber: number;
  questionText: string;
  imageUrl?: string;
  options: string[];
  correctAnswer: number; // 1-indexed (1, 2, 3, 4, 5)
  explanation?: string;
}

export interface UbtExamRecord {
  id: string;
  title: string;
  exam_code: string;
  exam_format: 'form_a_manual' | 'form_b_pdf';
  class_type: string;
  target_classes?: string[];
  pdf_url?: string;
  total_questions: number;
  choices_per_question?: number; // 4 or 5
  duration_minutes: number;
  correct_answers?: Record<string, number>;
  questions?: UbtQuestion[];
  is_scheduled: boolean;
  scheduled_date?: string;
  scheduled_time?: string;
  status: 'draft' | 'scheduled' | 'active' | 'ended';
  created_at?: string;
  created_by?: string;
}

interface AdminUbtExamManagerProps {
  currentStaff?: any;
  availableClasses?: string[];
}

export const getEmbeddableDriveUrl = (url: string) => {
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

export const getDirectDriveImageUrl = (url: string) => {
  if (!url) return '';
  try {
    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) {
      return `https://drive.google.com/uc?export=view&id=${match1[1]}`;
    }
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) {
      return `https://drive.google.com/uc?export=view&id=${match2[1]}`;
    }
    return url;
  } catch {
    return url;
  }
};

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

export const extractQuestionsFromRecord = (exam: any): UbtQuestion[] => {
  if (Array.isArray(exam.questions) && exam.questions.length > 0) {
    return exam.questions;
  }
  if (typeof exam.pdf_url === 'string' && exam.pdf_url.startsWith('ubt_manual_questions://')) {
    try {
      const decoded = JSON.parse(decodeURIComponent(exam.pdf_url.replace('ubt_manual_questions://', '')));
      if (Array.isArray(decoded) && decoded.length > 0) {
        return decoded;
      }
    } catch (e) {}
  }
  return [];
};

export const SUPABASE_UBT_SQL_SCRIPT = `-- =========================================================================
-- Supabase SQL Script: UBT Exams, Realtime & Row Level Security (RLS) Setup
-- =========================================================================

-- 1. Create or Update ubt_exams table with all required columns
CREATE TABLE IF NOT EXISTS public.ubt_exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  exam_code TEXT,
  format TEXT DEFAULT 'form_a',
  exam_format TEXT DEFAULT 'form_a_manual',
  class_type TEXT NOT NULL,
  target_class_type TEXT,
  pdf_url TEXT,
  total_questions INTEGER DEFAULT 10,
  choices_per_question INTEGER DEFAULT 5,
  duration_minutes INTEGER DEFAULT 90,
  questions JSONB DEFAULT '[]'::jsonb,
  correct_answer JSONB DEFAULT '{}'::jsonb,
  correct_answers JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active',
  schedule_type TEXT DEFAULT 'now',
  scheduled_at TIMESTAMPTZ,
  scheduled_date TEXT,
  scheduled_time TEXT,
  is_scheduled BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS target_class_type TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS class_type TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS exam_format TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS exam_code TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'now';
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS scheduled_date TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS scheduled_time TEXT;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT false;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE public.ubt_exams ADD COLUMN IF NOT EXISTS correct_answers JSONB DEFAULT '{}'::jsonb;

-- 2. Configure RLS Policies (CRITICAL: grants insert/update/select/delete to public/anon)
ALTER TABLE public.ubt_exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on ubt_exams" ON public.ubt_exams;
CREATE POLICY "Allow all operations on ubt_exams" 
  ON public.ubt_exams 
  FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- 3. Configure exams table RLS and columns
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on exams" ON public.exams;
CREATE POLICY "Allow all operations on exams" 
  ON public.exams 
  FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- 4. Create exam_results table if not exists & configure RLS
CREATE TABLE IF NOT EXISTS public.exam_results (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  student_id TEXT,
  username TEXT,
  full_name TEXT,
  whatsapp_phone TEXT,
  score NUMERIC,
  total_questions INTEGER,
  percentage NUMERIC,
  answers JSONB,
  summary JSONB,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on exam_results" ON public.exam_results;
CREATE POLICY "Allow all operations on exam_results" 
  ON public.exam_results 
  FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- 5. Safe Supabase Realtime Publication (Idempotent: prevents error 42710)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ubt_exams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ubt_exams;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exam_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_results;
  END IF;
END $$;`;

export default function AdminUbtExamManager({ currentStaff, availableClasses = [] }: AdminUbtExamManagerProps) {
  const isLecturer = currentStaff?.role === 'lecturer';
  
  // Real database classes from class_types_config
  const [dbClasses, setDbClasses] = useState<string[]>([]);

  // Filter classes: Lecturers only see their assigned classes, Admins see all DB classes
  const assignedClasses: string[] = isLecturer 
    ? (currentStaff?.assigned_classes || currentStaff?.class_types || [])
    : [];

  const rawAvailable = dbClasses.length > 0 ? dbClasses : availableClasses;

  const effectiveClasses: string[] = isLecturer && assignedClasses.length > 0
    ? assignedClasses
    : rawAvailable;

  const [exams, setExams] = useState<UbtExamRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'active' | 'ended'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  // SQL Script Viewer Modal State
  const [sqlModalOpen, setSqlModalOpen] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Form State
  const [activeFormat, setActiveFormat] = useState<'form_a_manual' | 'form_b_pdf'>('form_a_manual');
  const [formId, setFormId] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formClass, setFormClass] = useState<string>('');
  const [durationHours, setDurationHours] = useState<number>(1);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [totalQuestions, setTotalQuestions] = useState<number>(10);
  const [choicesPerQuestion, setChoicesPerQuestion] = useState<number>(5);

  // Form B (PDF)
  const [formPdfUrl, setFormPdfUrl] = useState<string>('');
  const [formPdfAnswers, setFormPdfAnswers] = useState<Record<number, number>>({});

  // Form A (Manual Questions)
  const [formQuestions, setFormQuestions] = useState<UbtQuestion[]>([
    {
      questionNumber: 1,
      questionText: '',
      imageUrl: '',
      options: ['', '', '', '', ''],
      correctAnswer: 1,
      explanation: ''
    }
  ]);
  const [activeQuestionTab, setActiveQuestionTab] = useState<number>(1);

  // Scheduling
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');

  // Results View Modal
  const [resultsModalOpen, setResultsModalOpen] = useState<boolean>(false);
  const [selectedExamForResults, setSelectedExamForResults] = useState<UbtExamRecord | null>(null);
  const [selectedExamResults, setSelectedExamResults] = useState<any[]>([]);
  const [unattemptedStudents, setUnattemptedStudents] = useState<any[]>([]);
  const [resultsTab, setResultsTab] = useState<'attempted' | 'unattempted'>('attempted');
  const [resultsLoading, setResultsLoading] = useState<boolean>(false);
  const [repushLoading, setRepushLoading] = useState<boolean>(false);
  const [repushConfirmExam, setRepushConfirmExam] = useState<UbtExamRecord | null>(null);
  const [repushSuccessMessage, setRepushSuccessMessage] = useState<string | null>(null);
  const [repushErrorMessage, setRepushErrorMessage] = useState<string | null>(null);
  const [selectedExamTitle, setSelectedExamTitle] = useState<string>('');

  const fetchDbClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('class_types_config')
        .select('class_type, is_active')
        .order('class_type', { ascending: true });

      if (!error && data && data.length > 0) {
        const activeList = data
          .filter((d: any) => d.is_active !== false)
          .map((d: any) => (d.class_type || '').trim())
          .filter(Boolean);
        const unique = Array.from(new Set(activeList));
        if (unique.length > 0) {
          setDbClasses(unique);
          if (!formClass) {
            setFormClass(unique[0]);
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching class_types_config in UBT manager:', err);
    }
  };

  useEffect(() => {
    fetchDbClasses();
    fetchExams();

    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'ubt_exam_created' || type === 'ubt_exam_updated' || type === 'exam_created') {
        fetchExams();
      }
      if (type === 'class_types_updated') {
        fetchDbClasses();
      }
    });

    return () => unsub();
  }, []);

  // Update default formClass when classes arrive
  useEffect(() => {
    if (!formClass && effectiveClasses.length > 0) {
      setFormClass(effectiveClasses[0]);
    }
  }, [effectiveClasses]);

  const fetchExams = async () => {
    setLoading(true);
    try {
      // 1. Try ubt_exams table first
      let ubtList: any[] = [];
      try {
        const { data, error } = await supabase.from('ubt_exams').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          ubtList = data.map((ex: any) => {
            const isSched = ex.schedule_type === 'scheduled' || Boolean(ex.scheduled_at) || Boolean(ex.is_scheduled);
            let schedDate = ex.scheduled_date || '';
            let schedTime = ex.scheduled_time || '';
            if (ex.scheduled_at && !schedDate) {
              try {
                const d = new Date(ex.scheduled_at);
                schedDate = d.toISOString().split('T')[0];
                schedTime = d.toTimeString().slice(0, 5);
              } catch (e) {}
            }

            const targetClass = ex.class_type || ex.target_class_type || 'Theory';
            const isPub = targetClass === 'Public Exam' || ex.is_public === true;
            const extractedQuestions = extractQuestionsFromRecord(ex);
            const isManual = ex.format === 'form_a' || ex.exam_format === 'form_a_manual' || extractedQuestions.length > 0;

            return {
              id: ex.id,
              title: ex.title,
              exam_code: ex.exam_code || `UBT_${(ex.id || '').replace(/^ubt_/, '').slice(0, 8)}`,
              exam_format: isManual ? 'form_a_manual' : 'form_b_pdf',
              class_type: targetClass,
              pdf_url: ex.pdf_url?.startsWith('ubt_manual_questions://') ? '' : ex.pdf_url,
              total_questions: ex.total_questions || (extractedQuestions.length > 0 ? extractedQuestions.length : 10),
              choices_per_question: ex.choices_per_question || 5,
              duration_minutes: ex.duration_minutes || 90,
              correct_answers: ex.correct_answer || ex.correct_answers || {},
              questions: extractedQuestions,
              is_scheduled: isSched,
              scheduled_date: schedDate,
              scheduled_time: schedTime,
              status: ex.status || 'active',
              created_at: ex.created_at,
              created_by: ex.created_by,
              is_public: isPub
            };
          });
        }
      } catch (e) {}

      // 2. Also fetch from standard exams table with fallback mapping
      let stdList: any[] = [];
      try {
        const { data, error } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          stdList = data.map((ex: any) => {
            const targetClass = ex.class_type || ex.target_class_type || 'Theory';
            const isPub = targetClass === 'Public Exam' || ex.is_public === true;
            const extractedQuestions = extractQuestionsFromRecord(ex);
            const isManual = extractedQuestions.length > 0 || (!ex.pdf_url || ex.pdf_url.startsWith('ubt_manual_questions://'));

            return {
              id: ex.id,
              title: ex.title,
              exam_code: ex.exam_code || `EXAM_${(ex.id || '').slice(0, 8)}`,
              exam_format: isManual ? 'form_a_manual' : 'form_b_pdf',
              class_type: targetClass,
              pdf_url: ex.pdf_url?.startsWith('ubt_manual_questions://') ? '' : ex.pdf_url,
              total_questions: ex.total_questions || (extractedQuestions.length > 0 ? extractedQuestions.length : 10),
              choices_per_question: 5,
              duration_minutes: ex.duration_minutes || 90,
              correct_answers: ex.correct_answer || ex.correct_answers || {},
              questions: extractedQuestions,
              is_scheduled: Boolean(ex.scheduled_date || ex.is_scheduled),
              scheduled_date: ex.scheduled_date || '',
              scheduled_time: ex.scheduled_time || '',
              status: ex.status || 'active',
              created_at: ex.created_at,
              is_public: isPub
            };
          });
        }
      } catch (e) {}

      // Combine and filter by lecturer assigned classes if applicable
      const combined = [...ubtList, ...stdList.filter(s => !ubtList.some(u => u.id === s.id))];
      
      const filtered = isLecturer
        ? combined.filter(ex => {
            if (ex.is_public || ex.class_type === 'Public Exam') return true;
            return effectiveClasses.some(ec => ec.trim().toLowerCase() === (ex.class_type || '').trim().toLowerCase());
          })
        : combined;

      setExams(filtered);
    } catch (err) {
      console.error('Failed to fetch UBT exams:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setFormId('');
    setFormTitle('');
    setFormClass(effectiveClasses[0] || 'Theory');
    setDurationHours(1);
    setDurationMinutes(30);
    setTotalQuestions(10);
    setChoicesPerQuestion(5);
    setActiveFormat('form_a_manual');
    setFormPdfUrl('');
    setFormPdfAnswers({});
    setIsScheduled(false);
    setScheduledDate('');
    setScheduledTime('');

    const initialQ: UbtQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      questionNumber: i + 1,
      questionText: '',
      imageUrl: '',
      options: ['', '', '', '', ''],
      correctAnswer: 1,
      explanation: ''
    }));
    setFormQuestions(initialQ);
    setActiveQuestionTab(1);

    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exam: UbtExamRecord) => {
    setModalMode('edit');
    setFormId(exam.id);
    setFormTitle(exam.title);
    setFormClass(exam.class_type);
    setDurationHours(Math.floor((exam.duration_minutes || 90) / 60));
    setDurationMinutes((exam.duration_minutes || 90) % 60);
    setTotalQuestions(exam.total_questions || 10);
    setChoicesPerQuestion(exam.choices_per_question || 5);
    setActiveFormat(exam.exam_format || 'form_a_manual');
    setFormPdfUrl(exam.pdf_url || '');

    // Normalize PDF answers
    const answers: Record<number, number> = {};
    if (exam.correct_answers) {
      Object.entries(exam.correct_answers).forEach(([k, v]) => {
        answers[parseInt(k, 10)] = Number(v);
      });
    }
    setFormPdfAnswers(answers);

    // Questions for Form A
    if (exam.questions && exam.questions.length > 0) {
      setFormQuestions(exam.questions);
    } else {
      const qList: UbtQuestion[] = Array.from({ length: exam.total_questions || 10 }, (_, i) => ({
        questionNumber: i + 1,
        questionText: '',
        imageUrl: '',
        options: Array.from({ length: exam.choices_per_question || 5 }, () => ''),
        correctAnswer: answers[i + 1] || 1,
        explanation: ''
      }));
      setFormQuestions(qList);
    }
    setActiveQuestionTab(1);

    setIsScheduled(Boolean(exam.is_scheduled));
    setScheduledDate(exam.scheduled_date || '');
    setScheduledTime(exam.scheduled_time || '');

    setIsModalOpen(true);
  };

  const handleTotalQuestionsChange = (count: number) => {
    const validCount = Math.max(1, Math.min(100, count));
    setTotalQuestions(validCount);

    setFormQuestions(prev => {
      const nextList: UbtQuestion[] = [];
      for (let i = 1; i <= validCount; i++) {
        const existing = prev.find(q => q.questionNumber === i);
        if (existing) {
          nextList.push(existing);
        } else {
          nextList.push({
            questionNumber: i,
            questionText: '',
            imageUrl: '',
            options: Array.from({ length: choicesPerQuestion }, () => ''),
            correctAnswer: 1,
            explanation: ''
          });
        }
      }
      return nextList;
    });

    if (activeQuestionTab > validCount) {
      setActiveQuestionTab(1);
    }
  };

  const handleChoicesPerQuestionChange = (choices: number) => {
    setChoicesPerQuestion(choices);
    setFormQuestions(prev => prev.map(q => {
      const currOptions = [...q.options];
      if (currOptions.length < choices) {
        while (currOptions.length < choices) currOptions.push('');
      } else if (currOptions.length > choices) {
        currOptions.length = choices;
      }
      return {
        ...q,
        options: currOptions,
        correctAnswer: Math.min(q.correctAnswer, choices)
      };
    }));
  };

  // Adaptive column upsert helper that gracefully ignores non-existent columns (PGRST204)
  const upsertWithAdaptiveColumns = async (tableName: string, initialPayload: Record<string, any>) => {
    const payloadToTry: Record<string, any> = { ...initialPayload };
    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from(tableName).upsert([payloadToTry]);
      if (!error) {
        return { success: true, error: null };
      }
      // Check if error is PGRST204: Could not find the '<col>' column of '<table>' in the schema cache
      if (error.code === 'PGRST204' || (error.message && error.message.includes('Could not find the'))) {
        const match = error.message.match(/Could not find the '([a-zA-Z0-9_]+)' column/);
        if (match && match[1] && match[1] in payloadToTry) {
          delete payloadToTry[match[1]];
          continue;
        }
      }
      return { success: false, error };
    }
    return { success: false, error: 'Adaptive upsert retry limit reached' };
  };

  // Adaptive column update helper that gracefully ignores non-existent columns (PGRST204)
  const updateWithAdaptiveColumns = async (tableName: string, id: string, initialPayload: Record<string, any>) => {
    const payloadToTry: Record<string, any> = { ...initialPayload };
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data, error } = await supabase.from(tableName).update(payloadToTry).eq('id', id);
      if (!error) {
        return { success: true, error: null, data };
      }
      const msg = error.message || '';
      // Check if error is PGRST204 or PostgreSQL missing column error
      const match1 = msg.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
      const match2 = msg.match(/column "([a-zA-Z0-9_]+)" of relation/i);
      const match3 = msg.match(/column "([a-zA-Z0-9_]+)" does not exist/i);
      const col = match1?.[1] || match2?.[1] || match3?.[1];
      if (col && col in payloadToTry) {
        delete payloadToTry[col];
        continue;
      }
      return { success: false, error };
    }
    return { success: false, error: 'Adaptive update retry limit reached' };
  };

  const handleSaveExam = async (statusOverride?: 'scheduled' | 'active') => {
    if (!formTitle.trim()) {
      alert('කරුණාකර විභාගයේ මාතෘකාව (Title) ඇතුළත් කරන්න.');
      return;
    }

    if (activeFormat === 'form_b_pdf' && !formPdfUrl.trim()) {
      alert('කරුණාකර Google Drive PDF ලින්ක් එක ඇතුළත් කරන්න.');
      return;
    }

    setIsSaving(true);
    const durationTotal = (durationHours * 60) + durationMinutes;
    const cleanTitle = formTitle.trim();

    let status: 'draft' | 'scheduled' | 'active' | 'ended' = statusOverride || 'active';
    if (isScheduled && !statusOverride) {
      status = 'scheduled';
    }

    // Build correct_answers map
    const correctMap: Record<string, number> = {};
    if (activeFormat === 'form_a_manual') {
      formQuestions.forEach(q => {
        correctMap[String(q.questionNumber)] = q.correctAnswer;
      });
    } else {
      for (let i = 1; i <= totalQuestions; i++) {
        correctMap[String(i)] = formPdfAnswers[i] || 1;
      }
    }

    const examId = formId || generateUUID();
    const examCode = 'UBT_' + cleanTitle.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20) + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const isPublic = formClass === 'Public Exam';
    const scheduledIso = (isScheduled && scheduledDate)
      ? new Date(`${scheduledDate}T${scheduledTime || '00:00'}:00`).toISOString()
      : null;

    const encodedPdfUrl = activeFormat === 'form_b_pdf' 
      ? formPdfUrl.trim() 
      : ('ubt_manual_questions://' + encodeURIComponent(JSON.stringify(formQuestions)));

    // 1. Standard exams table payload (100% active RLS & verified table)
    const stdPayload: Record<string, any> = {
      id: examId,
      title: cleanTitle,
      class_type: formClass,
      target_class_type: formClass,
      exam_code: examCode,
      pdf_url: encodedPdfUrl,
      total_questions: totalQuestions,
      duration_minutes: durationTotal,
      correct_answer: correctMap,
      correct_answers: correctMap,
      status: status
    };

    // 2. Schema-aligned primary payload for ubt_exams table
    const ubtPayload: Record<string, any> = {
      id: examId,
      title: cleanTitle,
      exam_code: examCode,
      format: activeFormat === 'form_b_pdf' ? 'form_b' : 'form_a',
      class_type: formClass,
      target_class_type: formClass,
      pdf_url: activeFormat === 'form_b_pdf' ? formPdfUrl.trim() : encodedPdfUrl,
      total_questions: totalQuestions,
      choices_per_question: choicesPerQuestion,
      duration_minutes: durationTotal,
      questions: activeFormat === 'form_a_manual' ? formQuestions : [],
      correct_answer: correctMap,
      correct_answers: correctMap,
      status: status,
      is_scheduled: isScheduled,
      scheduled_date: isScheduled ? scheduledDate : null,
      scheduled_time: isScheduled ? scheduledTime : null,
      is_public: isPublic,
      created_by: currentStaff?.name || currentStaff?.username || 'Admin'
    };

    try {
      let savedSuccessfully = false;
      let lastError: any = null;

      // 1. Save into standard exams table first (RLS & verified schema)
      const stdRes = await upsertWithAdaptiveColumns('exams', stdPayload);
      if (stdRes.success) {
        savedSuccessfully = true;
      } else {
        lastError = stdRes.error;
      }

      // 2. Also save into ubt_exams table with self-healing column adaptation
      const ubtRes = await upsertWithAdaptiveColumns('ubt_exams', ubtPayload);
      if (ubtRes.success) {
        savedSuccessfully = true;
      } else if (!savedSuccessfully) {
        lastError = ubtRes.error;
      }

      if (!savedSuccessfully && lastError) {
        throw new Error(lastError.message || JSON.stringify(lastError));
      }

      emitRealtimeEvent('ubt_exam_created', { id: examId, title: cleanTitle });
      emitRealtimeEvent('exam_created', { id: examId, title: cleanTitle });

      alert(isScheduled 
        ? `📅 UBT විභාගය සාර්ථකව Schedule කරන ලදී! (${scheduledDate} ${scheduledTime})`
        : `⚡ UBT විභාගය සාර්ථකව ඩේටාබේස් එකට සුරැකී සජීවීව පල කරන ලදී!`
      );

      setIsModalOpen(false);
      await fetchExams();
    } catch (e: any) {
      alert('Save error: ' + (e?.message || e));
    } finally {
      setIsSaving(false);
    }
  };

  const executeRepush = async (exam: UbtExamRecord, mode: 'unattempted' | 'all_retake') => {
    setRepushLoading(true);
    const nowIso = new Date().toISOString();
    try {
      // Prepare JSONB-safe retake metadata to store in correct_answers so schema never rejects it
      const currentCorrect = { ...(exam.correct_answers || {}) };
      const updatedCorrect = {
        ...currentCorrect,
        __push_mode: mode === 'all_retake' ? 'allow_retake' : 'pending_only',
        __retake_timestamp: mode === 'all_retake' ? nowIso : null,
        __push_timestamp: nowIso
      };

      // 1. Update exams table adaptively (ensure status is active, reset scheduled flags, update timestamps)
      const examUpdatePayload: Record<string, any> = {
        status: 'active',
        is_scheduled: false,
        updated_at: nowIso,
        correct_answer: updatedCorrect,
        correct_answers: updatedCorrect,
        exam_push_timestamp: nowIso,
        exam_push_mode: mode === 'all_retake' ? 'allow_retake' : 'pending_only',
        ...(mode === 'all_retake' ? { exam_retake_timestamp: nowIso } : {})
      };
      await updateWithAdaptiveColumns('exams', exam.id, examUpdatePayload);

      // 2. Update ubt_exams table adaptively
      const ubtUpdatePayload: Record<string, any> = {
        status: 'active',
        is_scheduled: false,
        scheduled_date: null,
        scheduled_time: null,
        updated_at: nowIso,
        correct_answers: updatedCorrect,
        exam_push_timestamp: nowIso,
        exam_push_mode: mode === 'all_retake' ? 'allow_retake' : 'pending_only',
        ...(mode === 'all_retake' ? { exam_retake_timestamp: nowIso } : {})
      };
      await updateWithAdaptiveColumns('ubt_exams', exam.id, ubtUpdatePayload);

      // Note: Previous scores are preserved per user request (do not delete past attempts)

      // 3. Update scheduled_lives table for the class if any active/today's class exists
      if (exam.class_type && exam.class_type !== 'Public Exam') {
        try {
          const { data: lives } = await supabase
            .from('scheduled_lives')
            .select('id, target_class_type, status')
            .neq('status', 'ended');
          
          if (lives && lives.length > 0) {
            const eClass = (exam.class_type || '').toLowerCase().trim();
            const eWords = eClass.split(/\s+/).filter(Boolean);
            const matchingLives = lives.filter(l => {
              const lClass = (l.target_class_type || '').toLowerCase().trim();
              if (!lClass || lClass === 'all') return true;
              if (lClass.includes(eClass) || eClass.includes(lClass)) return true;
              const lWords = lClass.split(/\s+/).filter(Boolean);
              return eWords.some(w => lWords.includes(w));
            });

            for (const live of matchingLives) {
              await supabase.from('scheduled_lives').update({
                is_exam_active: true,
                active_exam_id: exam.id,
                exam_push_mode: mode === 'all_retake' ? 'allow_retake' : 'pending_only',
                exam_push_timestamp: nowIso,
                ...(mode === 'all_retake' ? { exam_retake_timestamp: nowIso } : {})
              }).eq('id', live.id);
            }
          }
        } catch (e) {
          console.warn('scheduled_lives update notice:', e);
        }
      }

      // 5. Emit all relevant real-time sync events for open student screens
      emitRealtimeEvent('exam_pushed', { examId: exam.id, title: exam.title, classType: exam.class_type, action: mode === 'all_retake' ? 'repush_all' : 'repush_pending', timestamp: nowIso });
      emitRealtimeEvent('exam_created', { id: exam.id, title: exam.title, classType: exam.class_type, timestamp: nowIso });
      emitRealtimeEvent('ubt_exam_created', { id: exam.id, title: exam.title, classType: exam.class_type, timestamp: nowIso });
      emitRealtimeEvent('ubt_exam_updated', { id: exam.id, status: 'active', mode, timestamp: nowIso });
      emitRealtimeEvent('live_exam_updated', { examId: exam.id, action: mode === 'all_retake' ? 'repush_all' : 'repush_pending', timestamp: nowIso });

      // 6. Broadcast via channel
      try {
        const liveChannel = supabase.channel('live_class_push_events');
        liveChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            liveChannel.send({
              type: 'broadcast',
              event: 'exam_pushed',
              payload: { examId: exam.id, title: exam.title, action: mode === 'all_retake' ? 'repush_all' : 'repush_pending', timestamp: nowIso }
            });
          }
        });
      } catch (e) {}

      if (mode === 'all_retake') {
        setRepushSuccessMessage(`🔄 "${exam.title}" විභාගය "${exam.class_type}" පන්තියේ සියලුම සිසුන්ට 2 වන අවස්ථාව (2nd Attempt) ලෙස නැවත ලිවීමට සාර්ථකව Push කරන ලදී!`);
      } else {
        setRepushSuccessMessage(`🚀 "${exam.title}" විභාගය "${exam.class_type}" පන්තියේ තවමත් නොකළ සිසුන් වෙත සාර්ථකව Re-push කරන ලදී!`);
      }

      // Refresh exams list and results modal if open
      await fetchExams();
      if (resultsModalOpen && selectedExamForResults && selectedExamForResults.id === exam.id) {
        await handleViewResults(exam);
      }

      setTimeout(() => {
        setRepushLoading(false);
        setRepushSuccessMessage(null);
        setRepushConfirmExam(null);
      }, 1600);
    } catch (e: any) {
      console.error('Re-push error:', e);
      setRepushErrorMessage('Re-push දෝෂයකි: ' + (e?.message || e));
      setRepushLoading(false);
    }
  };

  const handleToggleStatus = async (exam: UbtExamRecord, newStatus: 'active' | 'ended' | 'scheduled') => {
    try {
      if (newStatus === 'active') {
        await executeRepush(exam, 'unattempted');
        return;
      }
      
      try {
        await supabase.from('exams').update({ status: 'ended' }).eq('id', exam.id);
      } catch (e) {}
      try {
        await supabase.from('ubt_exams').update({ status: 'ended' }).eq('id', exam.id);
      } catch (e) {}
      try {
        await supabase.from('scheduled_lives').update({ is_exam_active: false }).eq('active_exam_id', exam.id);
      } catch (e) {}

      emitRealtimeEvent('ubt_exam_updated', { id: exam.id, status: 'ended' });
      emitRealtimeEvent('live_exam_updated', { examId: exam.id, action: 'retract' });
      alert(`⏹️ "${exam.title}" විභාගය අවසන් කරන ලදී (Ended).`);
      await fetchExams();
    } catch (e: any) {
      alert('Status update error: ' + (e?.message || e));
    }
  };

  const handleDeleteExam = async (exam: UbtExamRecord) => {
    if (!confirm(`"${exam.title}" විභාගය සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?`)) return;
    try {
      try { await supabase.from('exams').delete().eq('id', exam.id); } catch (e) {}
      try { await supabase.from('ubt_exams').delete().eq('id', exam.id); } catch (e) {}
      try { await supabase.from('exam_results').delete().eq('exam_id', exam.id); } catch (e) {}

      emitRealtimeEvent('ubt_exam_updated', { id: exam.id, deleted: true });
      await fetchExams();
    } catch (e) {}
  };

  const handleViewResults = async (exam: UbtExamRecord) => {
    setSelectedExamForResults(exam);
    setSelectedExamTitle(exam.title);
    setResultsModalOpen(true);
    setResultsLoading(true);
    setResultsTab('attempted');
    try {
      // 1. Fetch completed results for this exam
      const { data: resData } = await supabase
        .from('exam_results')
        .select('*')
        .eq('exam_id', exam.id)
        .order('score', { ascending: false });

      const results = resData || [];
      setSelectedExamResults(results);

      // 2. Fetch enrolled students matching this exam's class_type from students table
      let unattempted: any[] = [];
      if (exam.class_type && exam.class_type !== 'Public Exam') {
        const { data: stuData } = await supabase
          .from('students')
          .select('id, username, full_name, name, mobile, phone, class_types, classTypes');

        if (stuData && stuData.length > 0) {
          const attemptedUsernames = new Set(results.map(r => (r.username || '').toLowerCase().trim()));
          const targetClassLower = exam.class_type.toLowerCase().trim();

          unattempted = stuData.filter(s => {
            const rawTypes = s.class_types || s.classTypes || [];
            const typesArr: string[] = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
            const isEnrolled = typesArr.some(t => {
              const tLower = (t || '').toLowerCase().trim();
              return tLower.includes(targetClassLower) || targetClassLower.includes(tLower);
            });

            const usernameLower = (s.username || '').toLowerCase().trim();
            return isEnrolled && !attemptedUsernames.has(usernameLower);
          });
        }
      }
      setUnattemptedStudents(unattempted);
    } catch (e) {
      console.warn('Error fetching exam results:', e);
      setSelectedExamResults([]);
      setUnattemptedStudents([]);
    } finally {
      setResultsLoading(false);
    }
  };

  const handleRepushToUnattempted = async () => {
    if (!selectedExamForResults) return;
    await executeRepush(selectedExamForResults, 'unattempted');
  };

  const handleAllowRetakeForAll = async () => {
    if (!selectedExamForResults) return;
    if (!confirm(`"${selectedExamForResults.title}" විභාගයේ පෙර ලකුණු සියල්ල සුරක්ෂිතව තබා ගනිමින් (ලකුණු මකා නොදමයි), පන්තියේ සියලුම සිසුන්ට දෙවන අවස්ථාව (2nd Attempt) ලෙස නැවත විභාගය ලිවීමට විවෘත කිරීමට (Allow Retake for All) ඔබට අවශ්‍යද?`)) {
      return;
    }
    await executeRepush(selectedExamForResults, 'all_retake');
  };

  return (
    <div className="space-y-6 text-white animate-in fade-in duration-200">
      
      {/* Top Banner & Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border-2 border-amber-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
              UBT Computer-Based Exam System
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {isLecturer ? '👨‍🏫 Lecturer Portal' : '🛡️ Admin & Lecturer Portal'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <FileText className="text-amber-400" size={24} />
            <span>UBT Online Exams (විභාග සැකසුම් හා කාලසටහන් පුවරුව)</span>
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Form A (ප්‍රශ්න හා රූප සෘජුව ඇතුළත් කිරීම) හෝ Form B (Google Drive PDF + OMR Bubble Sheet) මඟින් විභාග සාදා නියමිත වේලාවට Schedule කරන්න හෝ එකවරම Live Push කරන්න.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSqlModalOpen(true)}
            className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition flex items-center gap-2 cursor-pointer shadow-md active:scale-95 shrink-0"
            title="Supabase Database SQL Script එක බලන්න හා Copy කරගන්න"
          >
            <Copy size={16} />
            <span>⚙️ Supabase SQL Setup (Copy Script)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-900/40 transition flex items-center gap-2 cursor-pointer active:scale-95 shrink-0"
          >
            <Plus size={18} />
            <span>නව UBT විභාගයක් සාදන්න (Create Exam)</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Class Filter */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="bg-slate-950 text-white px-3 py-2 rounded-xl border border-slate-800 text-xs font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">සියලුම පන්ති (All Classes)</option>
            <option value="Public Exam">🌐 Public Exam (ප්‍රසිද්ධ විභාග)</option>
            {effectiveClasses.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-slate-950 text-white px-3 py-2 rounded-xl border border-slate-800 text-xs font-semibold focus:outline-none focus:border-amber-500"
          >
            <option value="all">සියලු තත්ත්ව (All Status)</option>
            <option value="active">🟢 Active (සජීවී)</option>
            <option value="scheduled">📅 Scheduled (කාලසටහන්ගත)</option>
            <option value="ended">🔴 Ended (අවසන් වූ)</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="විභාග මාතෘකාව හෝ Code සොයන්න..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 text-white pl-9 pr-3 py-2 rounded-xl border border-slate-800 text-xs focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
        </div>
      </div>

      {/* Exams Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
            <tr>
              <th className="p-4">#</th>
              <th className="p-4">විභාගය (Exam Title &amp; Code)</th>
              <th className="p-4">ආකෘතිය (Format)</th>
              <th className="p-4">පන්තිය (Class)</th>
              <th className="p-4">ප්‍රශ්න ගණන &amp; කාලය</th>
              <th className="p-4">තත්ත්වය (Status)</th>
              <th className="p-4 text-center">ක්‍රියාමාර්ග (Actions)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-medium">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  දත්ත පූරණය වෙමින් පවතී...
                </td>
              </tr>
            ) : exams.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400">
                  තවමත් කිසිදු UBT විභාගයක් නිර්මාණය කර නොමැත. "නව UBT විභාගයක් සාදන්න" ඔබා අලුතින් විභාගයක් එක් කරන්න.
                </td>
              </tr>
            ) : (
              exams
                .filter(ex => {
                  if (filterClass !== 'all' && ex.class_type !== filterClass) return false;
                  if (filterStatus !== 'all' && ex.status !== filterStatus) return false;
                  if (searchTerm) {
                    const q = searchTerm.toLowerCase();
                    return ex.title.toLowerCase().includes(q) || (ex.exam_code || '').toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((exam, idx) => (
                  <tr key={exam.id || idx} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 text-slate-500 font-mono">{idx + 1}</td>
                    
                    {/* Title & Code */}
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">{exam.title}</div>
                      <div className="text-[11px] font-mono text-amber-400 mt-0.5">{exam.exam_code}</div>
                      {exam.is_scheduled && exam.scheduled_date && (
                        <div className="text-[10px] text-purple-300 flex items-center gap-1 mt-1">
                          <Calendar size={11} />
                          <span>Scheduled: {exam.scheduled_date} {exam.scheduled_time}</span>
                        </div>
                      )}
                    </td>

                    {/* Format */}
                    <td className="p-4">
                      {exam.exam_format === 'form_b_pdf' ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 w-fit">
                          <FileText size={11} /> Form B: PDF + OMR
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                          <Layers size={11} /> Form A: UBT Manual
                        </span>
                      )}
                    </td>

                    {/* Class */}
                    <td className="p-4">
                      {exam.class_type === 'Public Exam' || (exam as any).is_public ? (
                        <div className="space-y-1">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 w-fit">
                            🌐 PUBLIC EXAM
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            Home / Guest Only
                          </span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 text-slate-200 border border-slate-800">
                          {exam.class_type}
                        </span>
                      )}
                    </td>

                    {/* Questions & Duration */}
                    <td className="p-4">
                      <div className="text-white font-semibold">{exam.total_questions} Questions</div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                        <Clock size={11} /> {exam.duration_minutes} Mins
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      {exam.status === 'active' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 w-fit animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          ACTIVE (LIVE NOW)
                        </span>
                      ) : exam.status === 'scheduled' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 w-fit">
                          <Clock size={11} />
                          SCHEDULED
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                          ENDED
                        </span>
                      )}
                    </td>

                    {/* Action Buttons */}
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* Copy Public Link (if Public Exam) */}
                        {(exam.class_type === 'Public Exam' || (exam as any).is_public) && (
                          <button
                            type="button"
                            onClick={() => {
                              const publicUrl = `${window.location.origin}/?public_exam=${exam.id}`;
                              navigator.clipboard.writeText(publicUrl).then(() => {
                                alert(`🌐 Public Exam Link එක සාර්ථකව Copy කරගන්නා ලදී!\n\n${publicUrl}\n\nමෙම ලින්ක් එක ඕනෑම කෙනෙකුට WhatsApp / Social Media හරහා Share කර විභාගය කිරීමට ලබා දිය හැක.`);
                              }).catch(() => {
                                prompt("Public Exam Link:", publicUrl);
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                            title="Public Exam එකට අදාළ ලින්ක් එක Copy කරන්න"
                          >
                            <Copy size={13} />
                            <span>Copy Link</span>
                          </button>
                        )}

                        {/* Live Push / Retract Toggle */}
                        {exam.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(exam, 'ended')}
                            className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition cursor-pointer"
                            title="විභාගය අවසන් කරන්න (End Exam)"
                          >
                            <EyeOff size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(exam, 'active')}
                            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                            title="සිසුන්ට සජීවීව Push කරන්න (Push Live)"
                          >
                            <Play size={14} fill="currentColor" />
                          </button>
                        )}

                        {/* Re-push to Students Button */}
                        <button
                          type="button"
                          disabled={repushLoading}
                          onClick={() => setRepushConfirmExam(exam)}
                          className="px-2.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm disabled:opacity-50"
                          title="සිසුන්ට නැවත Push කරන්න (Re-push Exam to Students)"
                        >
                          <Send size={13} />
                          <span>Re-push</span>
                        </button>

                        {/* View Results Leaderboard */}
                        <button
                          type="button"
                          onClick={() => handleViewResults(exam)}
                          className="p-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition cursor-pointer"
                          title="ප්‍රතිඵල ලේඛනය බලන්න (View Results)"
                        >
                          <Award size={14} />
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(exam)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition cursor-pointer"
                          title="සංස්කරණය (Edit Exam)"
                        >
                          <Edit size={14} />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteExam(exam)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-700 transition cursor-pointer"
                          title="මකා දමන්න (Delete Exam)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          CREATE / EDIT UBT EXAM MODAL
         ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[80] p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            
            {/* Header */}
            <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 font-mono">
                  {modalMode === 'create' ? 'Create New UBT Exam' : 'Edit UBT Exam'}
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {modalMode === 'create' ? 'නව UBT විභාගයක් නිර්මාණය කිරීම' : 'UBT විභාගය සංස්කරණය කිරීම'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              
              {/* 1. Format Selection Tabs (Form A vs Form B) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveFormat('form_a_manual')}
                  className={`p-4 rounded-2xl border-2 text-left transition flex items-start gap-3 cursor-pointer ${
                    activeFormat === 'form_a_manual'
                      ? 'bg-amber-950/40 border-amber-400 text-white shadow-lg shadow-amber-950/40'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${activeFormat === 'form_a_manual' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                    <Layers size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Form A: ප්‍රශ්න හා රූප සෘජුව ඇතුළත් කිරීම</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      ප්‍රශ්න, පිළිතුරු (A, B, C, D, E) සහ Google Drive රූප සටහන් එක් කරමින් Interactive CBT ලෙස නිර්මාණය කරන්න.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFormat('form_b_pdf')}
                  className={`p-4 rounded-2xl border-2 text-left transition flex items-start gap-3 cursor-pointer ${
                    activeFormat === 'form_b_pdf'
                      ? 'bg-blue-950/40 border-blue-400 text-white shadow-lg shadow-blue-950/40'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${activeFormat === 'form_b_pdf' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Form B: Drive PDF Link + OMR Sheet</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Google Drive PDF ලින්ක් එක දමා, ප්‍රශ්න ගණන සහ එක් ප්‍රශ්නයකට පිළිතුරු ප්‍රමාණය තෝරා OMR Bubble Sheet එකක් ලබා දෙන්න.
                    </p>
                  </div>
                </button>
              </div>

              {/* 2. Core Exam Meta Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                {/* Title */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-300">විභාගයේ මාතෘකාව (Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026 Physics Unit Test - Mechanics MCQ 01"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Target Class */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">අදාළ පන්තිය (Class) *</label>
                    <span className="text-[10px] text-amber-400 font-mono">class_types_config</span>
                  </div>
                  <select
                    value={formClass}
                    onChange={(e) => setFormClass(e.target.value)}
                    className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs font-bold focus:outline-none focus:border-amber-400"
                  >
                    {effectiveClasses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="Public Exam" className="text-amber-400 font-bold bg-slate-900">
                      🌐 Public Exam (Home Page / ඕනෑම සිසුවෙකුට)
                    </option>
                  </select>
                </div>

                {/* Duration */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">කාලය (Duration) *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={durationHours}
                      onChange={(e) => setDurationHours(parseInt(e.target.value, 10) || 0)}
                      className="w-16 bg-slate-900 text-white px-2 py-2.5 rounded-xl border border-slate-700 text-xs text-center font-bold"
                    />
                    <span className="text-xs text-slate-400">h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                      className="w-16 bg-slate-900 text-white px-2 py-2.5 rounded-xl border border-slate-700 text-xs text-center font-bold"
                    />
                    <span className="text-xs text-slate-400">min</span>
                  </div>
                </div>

                {/* Total Questions */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">මුළු ප්‍රශ්න ගණන *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={totalQuestions}
                    onChange={(e) => handleTotalQuestionsChange(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Choices per question */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">එක් ප්‍රශ්නයකට පිළිතුරු ගණන</label>
                  <select
                    value={choicesPerQuestion}
                    onChange={(e) => handleChoicesPerQuestionChange(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs font-bold focus:outline-none focus:border-amber-400"
                  >
                    <option value={4}>4 Choices (1, 2, 3, 4)</option>
                    <option value={5}>5 Choices (1, 2, 3, 4, 5)</option>
                  </select>
                </div>
              </div>

              {/* 3. FORMAT SPECIFIC BUILDER */}

              {/* FORM A: MANUAL QUESTION BUILDER */}
              {activeFormat === 'form_a_manual' && (
                <div className="space-y-4 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <h4 className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                      <Layers size={16} /> ප්‍රශ්න සහ නිවැරදි පිළිතුරු සකස් කිරීම
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      Question {activeQuestionTab} of {totalQuestions}
                    </span>
                  </div>

                  {/* Question Number Pills */}
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-900/80 rounded-xl border border-slate-800 scrollbar-thin">
                    {formQuestions.slice(0, totalQuestions).map(q => (
                      <button
                        key={q.questionNumber}
                        type="button"
                        onClick={() => setActiveQuestionTab(q.questionNumber)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                          activeQuestionTab === q.questionNumber
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                            : q.questionText.trim()
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {q.questionNumber}
                      </button>
                    ))}
                  </div>

                  {/* Active Question Editor */}
                  {(() => {
                    const currentQ = formQuestions.find(q => q.questionNumber === activeQuestionTab) || formQuestions[0];
                    if (!currentQ) return null;

                    const updateCurrentQ = (updater: Partial<UbtQuestion>) => {
                      setFormQuestions(prev => prev.map(q => q.questionNumber === currentQ.questionNumber ? { ...q, ...updater } : q));
                    };

                    return (
                      <div className="space-y-4 pt-2">
                        {/* Question Text */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-300">
                            ප්‍රශ්න අංක {currentQ.questionNumber} - ප්‍රශ්න විස්තරය (Question Text)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="ප්‍රශ්නය මෙහි ටයිප් කරන්න (Sinhala or English)..."
                            value={currentQ.questionText}
                            onChange={(e) => updateCurrentQ({ questionText: e.target.value })}
                            className="w-full bg-slate-900 text-white p-3 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        {/* Google Drive Image Attachment */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                            <ImageIcon size={14} className="text-amber-400" />
                            <span>Google Drive Image URL (විකල්ප රූප සටහනක් ඇත්නම් Link එක මෙහි දමන්න)</span>
                          </label>
                          <input
                            type="url"
                            placeholder="https://drive.google.com/file/d/.../view"
                            value={currentQ.imageUrl || ''}
                            onChange={(e) => updateCurrentQ({ imageUrl: e.target.value })}
                            className="w-full bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-amber-400 font-mono"
                          />
                          {currentQ.imageUrl && (
                            <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 mt-2 max-w-xs">
                              <span className="text-[10px] text-slate-400 block mb-1">Image Preview:</span>
                              <img
                                src={getDirectDriveImageUrl(currentQ.imageUrl)}
                                alt="Question diagram preview"
                                className="max-h-36 rounded-lg object-contain bg-black/60"
                                onError={(e) => {
                                  (e.target as any).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Options Inputs & Radio for Correct Answer */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-300">
                            පිළිතුරු තේරීම් සහ නිවැරදි පිළිතුර තෝරන්න (Select Correct Radio Option):
                          </label>
                          <div className="space-y-2">
                            {currentQ.options.map((opt, optIdx) => {
                              const choiceNum = optIdx + 1;
                              const isCorrect = currentQ.correctAnswer === choiceNum;
                              return (
                                <div
                                  key={choiceNum}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                                    isCorrect
                                      ? 'bg-emerald-950/40 border-emerald-400/80 text-white'
                                      : 'bg-slate-900 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  {/* Radio button */}
                                  <input
                                    type="radio"
                                    name={`correct_q_${currentQ.questionNumber}`}
                                    checked={isCorrect}
                                    onChange={() => updateCurrentQ({ correctAnswer: choiceNum })}
                                    className="w-4 h-4 text-emerald-500 cursor-pointer"
                                  />
                                  <span className="text-xs font-mono font-bold w-6 text-center">
                                    ({choiceNum})
                                  </span>
                                  <input
                                    type="text"
                                    placeholder={`Option (${choiceNum}) text...`}
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...currentQ.options];
                                      nextOpts[optIdx] = e.target.value;
                                      updateCurrentQ({ options: nextOpts });
                                    }}
                                    className="flex-1 bg-slate-950 text-white px-3 py-1.5 rounded-lg border border-slate-800 text-xs focus:outline-none focus:border-amber-400"
                                  />
                                  {isCorrect && (
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 shrink-0">
                                      Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Navigation between questions */}
                        <div className="flex justify-between items-center pt-2">
                          <button
                            type="button"
                            disabled={activeQuestionTab <= 1}
                            onClick={() => setActiveQuestionTab(prev => Math.max(1, prev - 1))}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-40"
                          >
                            &larr; Previous Question
                          </button>
                          <button
                            type="button"
                            disabled={activeQuestionTab >= totalQuestions}
                            onClick={() => setActiveQuestionTab(prev => Math.min(totalQuestions, prev + 1))}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 transition cursor-pointer disabled:opacity-40"
                          >
                            Next Question &rarr;
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* FORM B: PDF LINK + OMR BUBBLE SHEET */}
              {activeFormat === 'form_b_pdf' && (
                <div className="space-y-4 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                  <h4 className="text-sm font-black text-blue-400 flex items-center gap-1.5 border-b border-slate-800 pb-3">
                    <FileText size={16} /> Google Drive PDF Link සහ OMR Answer Key
                  </h4>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Google Drive PDF Link *</label>
                    <input
                      type="url"
                      required
                      placeholder="https://drive.google.com/file/d/.../view"
                      value={formPdfUrl}
                      onChange={(e) => setFormPdfUrl(e.target.value)}
                      className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-blue-400 font-mono"
                    />
                    <p className="text-[11px] text-slate-400">
                      Google Drive හි "Anyone with link can view" ලෙස permissions සකසා link එක මෙහි paste කරන්න.
                    </p>
                  </div>

                  {/* OMR Answer Sheet Grid */}
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-bold text-slate-300 block">
                      නිවැරදි පිළිතුරු සලකුණු කරන්න (OMR Correct Answer Key):
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2 p-3 bg-slate-900 rounded-2xl border border-slate-800 max-h-64 overflow-y-auto">
                      {Array.from({ length: totalQuestions }, (_, i) => i + 1).map(qNum => (
                        <div key={qNum} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 block font-bold">Q{qNum}</span>
                          <select
                            value={formPdfAnswers[qNum] || 1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setFormPdfAnswers(prev => ({ ...prev, [qNum]: val }));
                            }}
                            className="bg-slate-900 text-white text-xs font-bold rounded p-1 border border-slate-700 w-full text-center"
                          >
                            {Array.from({ length: choicesPerQuestion }, (_, cIdx) => cIdx + 1).map(c => (
                              <option key={c} value={c}>({c})</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Scheduling & Timing Options */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Calendar size={16} className="text-purple-400" />
                      <span>නියමිත වේලාවකට Schedule කිරීම (Schedule with Countdown Timer)</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      දිනයක් සහ වේලාවක් නියම කළ විට සිසුවාගේ ඩෑෂ්බෝඩයේ විභාගය ආරම්භ වීමට ඉතිරි කාලය Countdown Timer එකක් ලෙස පෙන්වයි.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-5 h-5 text-purple-600 rounded cursor-pointer"
                  />
                </div>

                {isScheduled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300">විභාග දිනය (Date)</label>
                      <input
                        type="date"
                        required={isScheduled}
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300">ආරම්භක වේලාව (Time)</label>
                      <input
                        type="time"
                        required={isScheduled}
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              >
                අවලංගු කරන්න (Cancel)
              </button>

              <div className="flex items-center gap-2">
                {/* Save Draft / Schedule */}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveExam()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'සුරකිමින් පවතී...' : isScheduled ? '📅 Schedule කර සුරකින්න' : '💾 Draft සුරකින්න'}
                </button>

                {/* Publish Immediately */}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveExam('active')}
                  className="px-6 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/40 border border-emerald-400/50 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Play size={14} fill="currentColor" />
                  <span>දැන්ම Live Push කරන්න</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          RESULTS LEADERBOARD MODAL (Attempted vs Unattempted + Re-Push Actions)
         ========================================================================= */}
      {resultsModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[80] p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">
                  UBT Exam Marks Leaderboard &amp; Student Status
                </span>
                <h3 className="text-lg font-black text-white">{selectedExamTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setResultsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResultsTab('attempted')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    resultsTab === 'attempted'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                  }`}
                >
                  <Award size={14} />
                  <span>🏆 විභාගයට පෙනී සිටි සිසුන් ({selectedExamResults.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResultsTab('unattempted')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    resultsTab === 'unattempted'
                      ? 'bg-rose-500 text-white shadow-md font-black'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300'
                  }`}
                >
                  <Clock size={14} />
                  <span>⏳ තවමත් නොකළ සිසුන් ({unattemptedStudents.length})</span>
                </button>
              </div>

              {/* Re-Push Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {unattemptedStudents.length > 0 && (
                  <button
                    type="button"
                    disabled={repushLoading}
                    onClick={handleRepushToUnattempted}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="විභාගය තවමත් නොකළ සිසුන්ගේ ඩෑෂ්බෝඩ් වෙත විශේෂ Push දැනුම්දීමක් යවන්න"
                  >
                    <Send size={13} />
                    <span>🚀 නොකළ සිසුන්ට පමණක් Re-push කරන්න</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={repushLoading}
                  onClick={handleAllowRetakeForAll}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-500/30 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="සියලුම සිසුන්ගේ පෙර ලකුණු ඉවත් කර නැවත විභාගය ලිවීමට විවෘත කරන්න"
                >
                  <RotateCcw size={13} />
                  <span>🔄 සියලුම සිසුන්ට නැවත විභාගය විවෘත කරන්න (Allow Retake)</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto">
              {resultsLoading ? (
                <div className="p-10 text-center text-slate-400 text-xs">ප්‍රතිඵල ලබා ගනිමින් පවතී...</div>
              ) : resultsTab === 'attempted' ? (
                /* Tab 1: Attempted / Completed Students */
                selectedExamResults.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">
                    තවමත් කිසිදු සිසුවෙක් මෙම විභාගයට පෙනී සිට නොමැත.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">Rank</th>
                          <th className="p-3">Username</th>
                          <th className="p-3">නම (Student Name)</th>
                          <th className="p-3 text-center">Score</th>
                          <th className="p-3 text-center">Percentage</th>
                          <th className="p-3 text-center">Attempt (අවස්ථාව)</th>
                          <th className="p-3">Submitted At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedExamResults.map((r, i) => (
                          <tr key={r.id || i} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono font-bold text-amber-400">#{i + 1}</td>
                            <td className="p-3 font-mono font-bold text-white">{r.username}</td>
                            <td className="p-3 font-medium text-slate-300">
                              {r.meta_data?.student_name || r.name || '-'}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-white text-sm">
                              {r.score}
                            </td>
                            <td className="p-3 text-center font-mono font-bold">
                              <span className={`px-2 py-0.5 rounded-lg border text-[11px] ${
                                (r.meta_data?.percentage ?? 0) >= 75 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                (r.meta_data?.percentage ?? 0) >= 50 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              }`}>
                                {r.meta_data?.percentage ?? 0}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono border ${
                                (r.meta_data?.attempt_number || 1) > 1 
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}>
                                {r.meta_data?.attempt_label || `${r.meta_data?.attempt_number || 1} වන අවස්ථාව`}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] text-slate-400 font-mono">
                              {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                /* Tab 2: Unattempted Enrolled Students */
                unattemptedStudents.length === 0 ? (
                  <div className="p-10 text-center text-emerald-400 text-xs font-bold">
                    🎉 මෙම පන්තියේ සියලුම සිසුන් විභාගය සාර්ථකව සම්පූර්ණ කර ඇත!
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs flex items-center justify-between">
                      <span>මෙම පන්තියට ලියාපදිංචි වී ඇති නමුත් තවමත් මෙම විභාගයට පෙනී නොසිටි සිසුන්:</span>
                      <span className="font-mono font-black text-amber-300">{unattemptedStudents.length} Students</span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-800">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">Username</th>
                            <th className="p-3">නම (Student Name)</th>
                            <th className="p-3">දුරකථන අංකය (Mobile)</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {unattemptedStudents.map((s, i) => (
                            <tr key={s.id || s.username || i} className="hover:bg-slate-800/40">
                              <td className="p-3 font-mono text-slate-500">{i + 1}</td>
                              <td className="p-3 font-mono font-bold text-amber-400">{s.username}</td>
                              <td className="p-3 font-medium text-white">{s.full_name || s.name || '-'}</td>
                              <td className="p-3 font-mono text-slate-300">{s.mobile || s.phone || '-'}</td>
                              <td className="p-3 text-center">
                                {(s.mobile || s.phone) ? (
                                  <a
                                    href={`https://wa.me/${(s.mobile || s.phone).replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1"
                                  >
                                    <span>WhatsApp</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                {selectedExamResults.length} Attempted &bull; {unattemptedStudents.length} Pending
              </span>
              <button
                type="button"
                onClick={() => setResultsModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          SUPABASE SQL SETUP SCRIPT MODAL
         ========================================================================= */}
      {sqlModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[90] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Supabase Database SQL Script (UBT Exams &amp; Permissions Setup)
                  </h3>
                  <p className="text-xs text-slate-400">
                    මෙම SQL කේතය Supabase SQL Editor වෙත Paste කර Run කරන්න.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSqlModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <CheckCircle2 size={15} />
                  <span>මෙම SQL කේතයෙන් සිදුවන දේ:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-100/90 pl-1">
                  <li><strong>ubt_exams</strong> වගුව සාදා සියලුම අදාළ Columns (Manual questions, PDF link, OMR Answers, Scheduling, Public Exam) එක් කරයි.</li>
                  <li><strong>Row Level Security (RLS)</strong> අක්‍රීය නොකර public/anon role සඳහා insert/update/select/delete permissions ලබා දෙයි (42501 RLS Policy Error වළක්වයි).</li>
                  <li><strong>exams</strong> සහ <strong>exam_results</strong> වගු වලටද නිවැරදි RLS Policies සකසයි.</li>
                  <li><strong>Realtime Publication</strong> (42710 Error ඇති නොවන පරිදි Safe Idempotent ක්‍රමයට) සක්‍රීය කරයි.</li>
                </ul>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-96 leading-relaxed select-all">
                  {SUPABASE_UBT_SQL_SCRIPT}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSqlModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-750 transition cursor-pointer"
              >
                වසන්න (Close)
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_UBT_SQL_SCRIPT).then(() => {
                    setSqlCopied(true);
                    setTimeout(() => setSqlCopied(false), 2500);
                  }).catch(() => {
                    prompt("Copy SQL Script:", SUPABASE_UBT_SQL_SCRIPT);
                  });
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
              >
                {sqlCopied ? <Check size={15} /> : <Copy size={15} />}
                <span>{sqlCopied ? 'SQL කේතය පිටපත් කරන ලදී! (Copied)' : '📋 Copy SQL Code (කේතය පිටපත් කරන්න)'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          RE-PUSH MODAL DIALOG
         ========================================================================= */}
      {repushConfirmExam && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[95] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-purple-500/50 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 font-mono">
                  Re-push Exam to Students
                </span>
                <h3 className="text-base font-black text-white">{repushConfirmExam.title}</h3>
                <span className="text-xs text-slate-400 font-medium block">
                  අදාළ පන්තිය: <strong className="text-amber-400">{repushConfirmExam.class_type || 'General'}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRepushConfirmExam(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              මෙම විභාගය සිසුන්ට නැවත Push කිරීම සඳහා ඔබට පහත ක්‍රම දෙකෙන් එකක් තෝරාගත හැක:
            </p>

            {repushLoading && (
              <div className="p-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center justify-center gap-2 animate-pulse">
                <Loader2 size={16} className="animate-spin" />
                <span>විභාගය පන්තියේ සිසුන්ට Push වෙමින් පවතී, කරුණාකර රැඳී සිටින්න...</span>
              </div>
            )}

            {repushSuccessMessage && (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <span>{repushSuccessMessage}</span>
              </div>
            )}

            {repushErrorMessage && (
              <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-400 shrink-0" />
                <span>{repushErrorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Option 1: Unattempted only */}
              <button
                type="button"
                disabled={repushLoading || !!repushSuccessMessage}
                onClick={() => executeRepush(repushConfirmExam, 'unattempted')}
                className="w-full text-left p-4 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-purple-500/30 hover:border-purple-400 transition cursor-pointer space-y-1 group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-xs font-black text-purple-300 group-hover:text-purple-200">
                  <Send size={15} />
                  <span>🚀 විභාගය තවමත් නොකළ සිසුන්ට පමණක් Re-push කරන්න</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal pl-6">
                  දැනටමත් විභාගය කර ඇති සිසුන්ගේ ලකුණු නොවෙනස්ව තබා, විභාගය ලිවීමට නොහැකි වූ හෝ අතපසු වූ සිසුන්ගේ Dashboard එකට සහ සජීවී පන්තියට විභාගය Re-push කරයි.
                </p>
              </button>

              {/* Option 2: Allow Retake for all */}
              <button
                type="button"
                disabled={repushLoading || !!repushSuccessMessage}
                onClick={() => executeRepush(repushConfirmExam, 'all_retake')}
                className="w-full text-left p-4 rounded-2xl bg-amber-950/20 hover:bg-amber-950/40 border border-amber-500/30 hover:border-amber-400 transition cursor-pointer space-y-1 group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-xs font-black text-amber-300 group-hover:text-amber-200">
                  <RotateCcw size={15} />
                  <span>🔄 සියලුම සිසුන්ට නැවත කිරීමට අවසර දෙන්න (Allow Retake for All)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal pl-6">
                  පෙර සියලු ලකුණු සුරක්ෂිතව තබාගෙන පන්තියේ සියලුම සිසුන්ට දෙවන අවස්ථාව (2nd Attempt) ලෙස නැවත විභාගය ලිවීමට විවෘත කරයි.
                </p>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={repushLoading}
                onClick={() => setRepushConfirmExam(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
              >
                අවලංගු කරන්න (Cancel)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
