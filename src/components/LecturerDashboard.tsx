import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { StaffMember } from '../types';
import { 
  LayoutDashboard, Video, FileText, Award, BookOpen, 
  FileCheck, Users, LogOut, Plus, Clock, Play, Square, 
  Edit, Trash2, Send, EyeOff, CheckCircle2, ChevronRight, 
  Calendar, Search, Filter, AlertCircle, Sparkles, MessageCircle,
  ExternalLink, UserCheck, ShieldAlert, RotateCcw, CheckSquare, Square as SquareIcon
} from 'lucide-react';
import AdminLiveControls from './AdminLiveControls';
import AdminRecordingsManager from './AdminRecordingsManager';
import { fetchAssignmentMarks, saveAssignmentMark, saveBatchAssignmentMarks, deleteAssignmentMark, deleteBatchAssignmentMarks } from '../assignmentService';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '../realtimeSync';

interface LecturerDashboardProps {
  currentStaff: StaffMember;
  handleLogout: () => void;
}

export default function LecturerDashboard({ currentStaff, handleLogout }: LecturerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'live_classes' | 'exams' | 'grades' | 'recordings' | 'tutes' | 'students'>('overview');
  
  // Data States
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});
  const [recordingsCount, setRecordingsCount] = useState(0);
  const [tutesCount, setTutesCount] = useState(0);
  const [examsList, setExamsList] = useState<any[]>([]);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [assignmentMarksList, setAssignmentMarksList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Standalone Exam Modal State
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [examFormData, setExamFormData] = useState({
    id: '',
    title: '',
    class_type: '',
    pdf_url: '',
    total_questions: 50,
    durationHours: 1,
    durationMinutes: 30,
    durationSeconds: 0,
    correct_answer: {} as Record<string, number>,
    auto_push_time: '',
    status: 'pending'
  });

  // Batch Assignment Marks Modal State
  const [isBatchAssignModalOpen, setIsBatchAssignModalOpen] = useState(false);
  const [batchAssignForm, setBatchAssignForm] = useState({
    assignment_name: '',
    class_type: '',
    assignment_date: new Date().toISOString().split('T')[0]
  });
  const [batchStudentRows, setBatchStudentRows] = useState<Array<{
    username: string;
    name: string;
    marks: number;
    selected: boolean;
  }>>([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // Exam Results View State
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [resultsSubTab, setResultsSubTab] = useState<'completed' | 'unattempted'>('completed');

  // Single Edit Assignment Mark Modal State
  const [editingMark, setEditingMark] = useState<any | null>(null);

  // Assignment Marks Ledger UI & Filter States
  const [ledgerViewMode, setLedgerViewMode] = useState<'batches' | 'students'>('batches');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerClassFilter, setLedgerClassFilter] = useState('all');

  // 1-Hour Grace Window Helper for Exams & Live
  const canLecturerEdit = (createdAt?: string): boolean => {
    if (!createdAt) return false;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return diffMs <= 60 * 60 * 1000; // 60 minutes
  };

  const getRemainingMinutes = (createdAt?: string): number => {
    if (!createdAt) return 0;
    const diffMs = 60 * 60 * 1000 - (Date.now() - new Date(createdAt).getTime());
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  // 24-Hour Grace Window Helper for Assignment Marks (පැය 24ක් තුළ එඩිට්/ඩිලීට්)
  const canLecturerEditAssignment = (createdAt?: string): boolean => {
    if (!createdAt) return true;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return diffMs <= 24 * 60 * 60 * 1000; // 24 hours
  };

  const getAssignmentRemainingTime = (createdAt?: string): { hours: number; minutes: number; expired: boolean } => {
    if (!createdAt) return { hours: 24, minutes: 0, expired: false };
    const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - new Date(createdAt).getTime());
    if (remainingMs <= 0) return { hours: 0, minutes: 0, expired: true };
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    return { hours, minutes, expired: false };
  };

  useEffect(() => {
    const rawClasses = currentStaff.assigned_classes || [];
    setAssignedClasses(rawClasses);
    loadAllLecturerData(rawClasses);

    const unsub = subscribeRealtimeEvents((type) => {
      if (['recording_added', 'recording_deleted', 'tute_added', 'tute_deleted', 'assignment_marks_updated'].includes(type)) {
        loadAllLecturerData(rawClasses);
      }
    });

    const channel = supabase.channel('lecturer-dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => loadAllLecturerData(rawClasses))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, () => loadAllLecturerData(rawClasses))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_marks' }, () => loadAllLecturerData(rawClasses))
      .subscribe();

    return () => {
      unsub();
      supabase.removeChannel(channel);
    };
  }, [currentStaff]);

  const loadAllLecturerData = async (classes: string[]) => {
    setIsLoading(true);
    try {
      const norm = (val?: string) => (val || '').trim().toLowerCase();
      const lecturerClasses = (classes || []).map(norm);

      // 1. Fetch Students from database (Strict Privacy: only name and username)
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, name, first_name, last_name, username, class_types, class, course');

      if (studentsData) {
        // Filter students strictly belonging to lecturer's assigned classes
        const filtered = studentsData.filter((std: any) => {
          if (lecturerClasses.length === 0) return true;
          const sList: string[] = [];
          if (Array.isArray(std.class_types)) sList.push(...std.class_types);
          if (std.class) sList.push(std.class);
          if (std.course) sList.push(std.course);
          return lecturerClasses.some(lc => sList.some(sc => norm(sc) === lc));
        });
        
        // Strict privacy sanitization: retain ONLY name and username
        const sanitized = filtered.map((s: any) => {
          const compositeName = s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.username;
          const sList: string[] = [];
          if (Array.isArray(s.class_types)) sList.push(...s.class_types);
          if (s.class) sList.push(s.class);
          if (s.course) sList.push(s.course);
          return {
            id: s.id,
            name: compositeName,
            username: s.username,
            class_types: sList
          };
        });
        setEnrolledStudents(sanitized);

        // Group counts by assigned class
        const counts: Record<string, number> = {};
        classes.forEach(c => {
          counts[c] = sanitized.filter(s => s.class_types.some(sc => norm(sc) === norm(c))).length;
        });
        setStudentsByClass(counts);
      }

      // 2. Fetch Lessons / Recordings Count (strictly scoped to lecturer's classes)
      const { data: recData } = await supabase.from('recordings').select('id, class_type, created_at');
      if (recData) {
        const myRecs = recData.filter((r: any) => {
          if (lecturerClasses.length === 0) return true;
          return lecturerClasses.includes(norm(r.class_type));
        });
        setRecordingsCount(myRecs.length);
      }

      // 3. Fetch Tutes / Papers Count (strictly scoped to lecturer's classes)
      const { data: tuteData } = await supabase.from('class_resources').select('id, target_classes, created_at');
      if (tuteData) {
        const myTutes = tuteData.filter((t: any) => {
          if (lecturerClasses.length === 0) return true;
          const target = t.target_classes || [];
          return target.some((tc: string) => lecturerClasses.includes(norm(tc)));
        });
        setTutesCount(myTutes.length);
      }

      // 4. Fetch Exams (strictly scoped to lecturer's classes)
      const { data: examsData } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
      if (examsData) {
        const myExams = examsData.filter((e: any) => {
          if (lecturerClasses.length === 0) return true;
          return lecturerClasses.includes(norm(e.class_type)) || lecturerClasses.includes(norm(e.target_class_type));
        });
        setExamsList(myExams);
        if (myExams.length > 0 && !selectedExamId) {
          setSelectedExamId(myExams[0].id);
        }
      }

      // 5. Fetch Exam Results from database
      const { data: resultsData } = await supabase.from('exam_results').select('*').order('submitted_at', { ascending: false });
      if (resultsData) {
        setExamResults(resultsData);
      }

      // 6. Fetch Assignment Marks from database & cache
      const marks = await fetchAssignmentMarks();
      const staffClasses = (classes && classes.length > 0) ? classes : (currentStaff.assigned_classes || []);
      const activeLecturerClasses = (staffClasses || []).map(norm);

      const filteredMarks = marks.filter(m => {
        // ALWAYS show marks entered by THIS lecturer
        const isMyLecturerId = m.lecturer_id && (
          String(m.lecturer_id) === String(currentStaff.id) ||
          String(m.lecturer_id) === String(currentStaff.username)
        );
        const isMyLecturerName = m.lecturer_name && currentStaff.first_name && (
          m.lecturer_name.toLowerCase().includes(currentStaff.first_name.toLowerCase()) ||
          m.lecturer_name.toLowerCase().includes((currentStaff.last_name || '').toLowerCase())
        );
        if (isMyLecturerId || isMyLecturerName) return true;

        if (activeLecturerClasses.length === 0) return true;
        return m.class_type && activeLecturerClasses.includes(norm(m.class_type));
      });
      setAssignmentMarksList(filteredMarks);

    } catch (err) {
      console.error('Error fetching lecturer data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Standalone Exam Handlers
  const handleOpenExamModal = (exam?: any) => {
    if (exam) {
      setExamFormData({
        id: exam.id,
        title: exam.title,
        class_type: exam.class_type || exam.target_class_type || assignedClasses[0] || '',
        pdf_url: exam.pdf_url || '',
        total_questions: exam.total_questions || 50,
        durationHours: Math.floor((exam.duration_minutes || 90) / 60),
        durationMinutes: (exam.duration_minutes || 90) % 60,
        durationSeconds: 0,
        correct_answer: exam.correct_answer || {},
        auto_push_time: exam.auto_push_time || '',
        status: exam.status || 'pending'
      });
    } else {
      setExamFormData({
        id: '',
        title: '',
        class_type: assignedClasses[0] || '',
        pdf_url: '',
        total_questions: 50,
        durationHours: 1,
        durationMinutes: 30,
        durationSeconds: 0,
        correct_answer: {},
        auto_push_time: '',
        status: 'pending'
      });
    }
    setIsExamModalOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examFormData.title.trim()) {
      alert('කරුණාකර විභාගයේ මාතෘකාව ඇතුළත් කරන්න.');
      return;
    }
    if (!examFormData.class_type) {
      alert('කරුණාකර අදාළ පන්ති වර්ගය තෝරන්න.');
      return;
    }

    const totalMinutes = (examFormData.durationHours * 60) + examFormData.durationMinutes + Math.round(examFormData.durationSeconds / 60);
    const nowIso = new Date().toISOString();
    const cleanTitle = (examFormData.title || '').trim();
    const generatedExamCode = 'EXAM_' + cleanTitle.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32);

    const payload = {
      title: cleanTitle,
      exam_code: generatedExamCode,
      class_type: examFormData.class_type,
      target_class_type: examFormData.class_type,
      pdf_url: examFormData.pdf_url.trim(),
      total_questions: Number(examFormData.total_questions) || 50,
      duration_minutes: totalMinutes,
      correct_answer: examFormData.correct_answer,
      status: examFormData.status || 'pending'
    };

    try {
      if (examFormData.id) {
        await supabase.from('exams').update(payload).eq('id', examFormData.id);
      } else {
        await supabase.from('exams').insert([{ ...payload, created_at: nowIso }]);
      }
      setIsExamModalOpen(false);
      await loadAllLecturerData(assignedClasses);
      alert('විභාගය සාර්ථකව සුරැකිණි! (Exam Code: ' + generatedExamCode + ')');
    } catch (err: any) {
      alert('විභාගය සුරැකීමේ දෝෂයකි: ' + (err.message || ''));
    }
  };

  // Re-push Exam Handler (pushes the exact exam to unattempted students, or allows retake for all)
  const handlePushExam = async (exam: any, mode: 'pending' | 'retake_all' | boolean = 'pending') => {
    try {
      const isRetakeAll = mode === 'retake_all';
      const nowIso = new Date().toISOString();

      // 1. Mark exam active in exams table
      await supabase.from('exams').update({ status: 'active' }).eq('id', exam.id);
      
      // 2. Also ensure linked scheduled_lives session has active exam and proper flags
      const updatePayload: any = {
        is_exam_active: true, 
        active_exam_id: exam.id,
        exam_push_mode: isRetakeAll ? 'allow_retake' : 'pending_only',
        exam_push_timestamp: nowIso
      };
      if (isRetakeAll) {
        updatePayload.exam_retake_timestamp = nowIso;
      }

      await supabase.from('scheduled_lives')
        .update(updatePayload)
        .eq('active_exam_id', exam.id);

      // 3. Broadcast realtime alert so students immediately get notification
      emitRealtimeEvent('exam_pushed' as any, { 
        examId: exam.id, 
        title: exam.title,
        mode: isRetakeAll ? 'allow_retake' : 'pending_only',
        retakeTimestamp: isRetakeAll ? nowIso : undefined
      });

      await loadAllLecturerData(assignedClasses);
      alert(isRetakeAll 
        ? `"${exam.title}" විභාගය දැනටමත් කළ සිසුන්ටද නැවත කිරීමට අවසර ලැබෙන පරිදි සියලු දෙනාටම සාර්ථකව Re-Push කරන ලදී!`
        : `"${exam.title}" විභාගය තවමත් පෙනී නොසිටි සිසුන්ට සාර්ථකව නැවත PUSH කරන ලදී!`
      );
    } catch (err: any) {
      alert('Push operation failed: ' + err.message);
    }
  };

  const handleRetractExam = async (exam: any) => {
    try {
      await supabase.from('exams').update({ status: 'pending' }).eq('id', exam.id);
      await supabase.from('scheduled_lives')
        .update({ is_exam_active: false })
        .eq('active_exam_id', exam.id);

      await loadAllLecturerData(assignedClasses);
      alert('විභාගය PUSH කිරීම අත්හිටුවන ලදී.');
    } catch (err: any) {
      alert('Retract failed: ' + err.message);
    }
  };

  const handleDeleteExam = async (exam: any) => {
    if (!canLecturerEdit(exam.created_at)) {
      alert('පැය 1 ක කාලය ඉක්මවා ඇති බැවින් මෙම විභාගය මකා දැමිය හැක්කේ ප්‍රධාන පරිපාලක (Super Admin / Admin / Manager) මඟින් පමණි.');
      return;
    }
    if (!window.confirm(`"${exam.title}" විභාගය මකා දැමීමට අවශ්‍යද?`)) return;

    try {
      await supabase.from('exams').delete().eq('id', exam.id);
      await supabase.from('scheduled_lives').update({ active_exam_id: null, is_exam_active: false }).eq('active_exam_id', exam.id);
      await loadAllLecturerData(assignedClasses);
      alert('විභාගය සාර්ථකව මකා දමන ලදී.');
    } catch (err: any) {
      alert('Error deleting exam: ' + err.message);
    }
  };

  // Open Batch Assignment Modal
  const handleOpenBatchAssignModal = (targetClass?: string) => {
    const defaultClass = targetClass || assignedClasses[0] || '';
    setBatchAssignForm({
      assignment_name: '',
      class_type: defaultClass,
      assignment_date: new Date().toISOString().split('T')[0]
    });
    setBatchSearch('');
    updateBatchRowsForClass(defaultClass);
    setIsBatchAssignModalOpen(true);
  };

  // Update Batch Rows when Class Changes
  const updateBatchRowsForClass = (className: string) => {
    const norm = (s: string) => s.trim().toLowerCase();
    const studentsInClass = enrolledStudents.filter(std => {
      if (!className) return true;
      return std.class_types.some((c: string) => norm(c) === norm(className));
    });

    setBatchStudentRows(
      studentsInClass.map(s => ({
        username: s.username,
        name: s.name,
        marks: 100,
        selected: true
      }))
    );
  };

  const handleBatchClassChange = (newClass: string) => {
    setBatchAssignForm(prev => ({ ...prev, class_type: newClass }));
    updateBatchRowsForClass(newClass);
  };

  // Batch Save Assignment Marks (All students at once!)
  const handleSaveBatchAssignmentMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchAssignForm.assignment_name.trim()) {
      alert('කරුණාකර පැවරුම් නාමය (Assignment Title) ඇතුළත් කරන්න.');
      return;
    }

    const selectedRows = batchStudentRows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      alert('කරුණාකර අවම වශයෙන් එක් ශිෂ්‍යයෙකුවත් තෝරන්න.');
      return;
    }

    setIsBatchSaving(true);
    try {
      const recordsToInsert = selectedRows.map(row => ({
        assignment_name: batchAssignForm.assignment_name.trim(),
        class_type: batchAssignForm.class_type,
        student_username: row.username,
        student_name: row.name,
        marks: Number(row.marks) || 0,
        assignment_date: batchAssignForm.assignment_date,
        lecturer_id: currentStaff.id,
        lecturer_name: `${currentStaff.first_name || ''} ${currentStaff.last_name || ''}`.trim(),
        created_at: new Date().toISOString()
      }));

      const savedRecords = await saveBatchAssignmentMarks(recordsToInsert);

      // Immediately reflect newly saved records into assignmentMarksList:
      setAssignmentMarksList(prev => {
        const map = new Map<string, any>();
        savedRecords.forEach(r => map.set(r.id, r));
        prev.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      });

      setIsBatchAssignModalOpen(false);
      await loadAllLecturerData(assignedClasses.length > 0 ? assignedClasses : currentStaff.assigned_classes || []);
      alert(`සිසුන් ${recordsToInsert.length} දෙනෙකුගේ පැවරුම් ලකුණු සාර්ථකව පද්ධතියට ඇතුළත් කරන ලදී!`);
    } catch (err: any) {
      alert('ලකුණු ඇතුළත් කිරීමේ දෝෂයකි: ' + err.message);
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Single Edit Save
  const handleSaveSingleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMark) return;
    if (!canLecturerEditAssignment(editingMark.created_at)) {
      alert('පැය 24 ක කාලය ඉක්මවා ඇති බැවින් මෙම පැවරුම් ලකුණු සංස්කරණය කළ නොහැක.');
      return;
    }
    try {
      await saveAssignmentMark(editingMark);
      setEditingMark(null);
      await loadAllLecturerData(assignedClasses.length > 0 ? assignedClasses : currentStaff.assigned_classes || []);
      alert('ලකුණු සාර්ථකව යාවත්කාලීන කරන ලදී.');
    } catch (err: any) {
      alert('දෝෂයකි: ' + err.message);
    }
  };

  const handleDeleteAssignmentMark = async (mark: any) => {
    if (!canLecturerEditAssignment(mark.created_at)) {
      alert('පැය 24 ක කාලය ඉක්මවා ඇති බැවින් මෙම පැවරුම් ලකුණු මකා දැමිය නොහැක.');
      return;
    }
    if (!window.confirm(`"${mark.student_name || mark.student_username}" සිසුවාගේ "${mark.assignment_name}" ලකුණු සටහන ඉවත් කිරීමට අවශ්‍යද?`)) return;
    try {
      await deleteAssignmentMark(mark.id);
      await loadAllLecturerData(assignedClasses.length > 0 ? assignedClasses : currentStaff.assigned_classes || []);
      alert('ලකුණු සාර්ථකව මකා දමන ලදී.');
    } catch (err: any) {
      alert('දෝෂයකි: ' + err.message);
    }
  };

  // Entire Assignment Batch Deletion (පැය 24ක් තුළ මුළු ලැයිස්තුවම මකාදැමීම)
  const handleDeleteEntireAssignment = async (assignmentName: string, classType: string, createdAt?: string) => {
    if (!canLecturerEditAssignment(createdAt)) {
      alert('පැය 24 ක කාලය ඉක්මවා ඇති බැවින් මෙම පැවරුම මකා දැමිය නොහැක.');
      return;
    }
    const matchingMarks = assignmentMarksList.filter(m => 
      m.assignment_name === assignmentName && 
      (!classType || m.class_type === classType)
    );
    if (!window.confirm(`"${assignmentName}" පැවරුමේ සියලුම සිසුන්ගේ (${matchingMarks.length}) ලකුණු එකවර මකා දැමීමට අවශ්‍යද?`)) return;

    try {
      const ids = matchingMarks.map(m => m.id);
      await deleteBatchAssignmentMarks(ids);
      await loadAllLecturerData(assignedClasses.length > 0 ? assignedClasses : currentStaff.assigned_classes || []);
      alert(`"${assignmentName}" පැවරුමේ සියලුම ලකුණු සාර්ථකව මකා දමන ලදී.`);
    } catch (err: any) {
      alert('දෝෂයකි: ' + err.message);
    }
  };

  // Entire Assignment Batch Edit (පැය 24ක් තුළ මුළු ලැයිස්තුවම සංස්කරණය)
  const handleOpenEditEntireAssignment = (assignmentName: string, classType: string, date: string, createdAt?: string) => {
    if (!canLecturerEditAssignment(createdAt)) {
      alert('පැය 24 ක කාලය ඉක්මවා ඇති බැවින් මෙම පැවරුම සංස්කරණය කළ නොහැක.');
      return;
    }
    const matchingMarks = assignmentMarksList.filter(m => 
      m.assignment_name === assignmentName && 
      (!classType || m.class_type === classType)
    );
    const existingMarksMap = new Map<string, number>();
    matchingMarks.forEach(m => existingMarksMap.set(m.student_username, m.marks));

    const norm = (s: string) => s.trim().toLowerCase();
    const studentsInClass = enrolledStudents.filter(std => {
      if (!classType) return true;
      return std.class_types.some((c: string) => norm(c) === norm(classType));
    });

    setBatchAssignForm({
      assignment_name: assignmentName,
      class_type: classType,
      assignment_date: date || new Date().toISOString().split('T')[0]
    });
    setBatchSearch('');
    setBatchStudentRows(
      studentsInClass.map(s => ({
        username: s.username,
        name: s.name,
        marks: existingMarksMap.has(s.username) ? existingMarksMap.get(s.username)! : 100,
        selected: existingMarksMap.has(s.username)
      }))
    );
    setIsBatchAssignModalOpen(true);
  };

  // Evaluate Selected Exam Completed vs Unattempted Students
  const activeExamObj = examsList.find(e => e.id === selectedExamId) || examsList[0];
  const activeExamClass = activeExamObj?.class_type || activeExamObj?.target_class_type || '';
  
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const studentsInExamClass = enrolledStudents.filter(std => {
    if (!activeExamClass) return true;
    return std.class_types.some((c: string) => norm(c) === norm(activeExamClass));
  });

  const completedResults = examResults.filter(r => r.exam_id === activeExamObj?.id);
  const completedUsernames = new Set(completedResults.map(r => r.username));
  const unattemptedStudents = studentsInExamClass.filter(std => !completedUsernames.has(std.username));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      
      {/* =========================================================================
          TOP NAVBAR: Clean, Student-Dashboard Style (Anti-Cockpit)
          ========================================================================= */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Lecturer Identity Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-900/30">
              {(currentStaff.first_name || 'L')[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm sm:text-base tracking-tight">
                  {currentStaff.first_name} {currentStaff.last_name}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                @{currentStaff.username}
              </p>
            </div>
          </div>

          {/* Assigned Classes Badges & Logout Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-semibold">අයත් පන්ති:</span>
              {assignedClasses.length === 0 ? (
                <span className="text-[11px] text-amber-400">සියලු පන්ති</span>
              ) : (
                assignedClasses.map(c => (
                  <span key={c} className="text-[10px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">
                    {c}
                  </span>
                ))
              )}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 rounded-xl border border-rose-500/30 transition cursor-pointer"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">ඉවත් වන්න</span>
            </button>
          </div>

        </div>
      </header>

      {/* =========================================================================
          NAVIGATION TABS (Simple, Vibrant, High-Readability)
          ========================================================================= */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5 no-scrollbar">
            
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard size={15} />
              <span>📊 දළ විශ්ලේෂණය (Overview)</span>
            </button>

            <button
              onClick={() => setActiveTab('live_classes')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'live_classes'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Video size={15} />
              <span>🎥 සජීවී සූම් පන්ති (Live Classes)</span>
            </button>

            <button
              onClick={() => setActiveTab('exams')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'exams'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileCheck size={15} />
              <span>📝 ලයිව් එක්සෑම් හා පුෂ් (Exams)</span>
            </button>

            <button
              onClick={() => setActiveTab('grades')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'grades'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Award size={15} />
              <span>🏆 ලකුණු හා ඇගයීම් (Marks)</span>
            </button>

            <button
              onClick={() => setActiveTab('recordings')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'recordings'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <BookOpen size={15} />
              <span>📹 පාඩම් හා රෙකෝඩින් (Lessons)</span>
            </button>

            <button
              onClick={() => setActiveTab('tutes')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'tutes'
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileText size={15} />
              <span>📄 ටියුට් හා පේපර්ස් (Tutes)</span>
            </button>

            <button
              onClick={() => setActiveTab('students')}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'students'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users size={15} />
              <span>👥 මගේ සිසුන් (Students)</span>
            </button>

          </nav>
        </div>
      </div>

      {/* =========================================================================
          MAIN CONTENT AREA
          ========================================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* =======================================================================
            TAB 1: LECTURER OVERVIEW (The Primary Landing Page)
            ======================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* Lecturer Welcome Banner */}
            <div className="bg-gradient-to-r from-indigo-900/60 via-purple-900/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3 inline-block">
                  👨‍🏫 Academic Lecturer Cockpit
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ආයුබෝවන්, {currentStaff.first_name} {currentStaff.last_name}!
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-2 max-w-2xl leading-relaxed">
                  මෙය ඔබගේ ඉගැන්වීම් කටයුතු පහසුවෙන් මෙහෙයවිය හැකි ප්‍රධාන දළ විශ්ලේෂණ පිටුවයි. සජීවී සූම් පන්ති පැවැත්වීම, ප්‍රශ්න පත්‍ර ලබා දීම හා සිසුන්ගේ ඇගයීම් මෙතැනින් කළමනාකරණය කරන්න.
                </p>

                {/* Assigned Courses / Classes summary row */}
                <div className="mt-5 flex flex-wrap items-center gap-2 pt-4 border-t border-indigo-500/20">
                  <span className="text-xs font-bold text-slate-300">ඔබට පවරා ඇති පන්ති කාණ්ඩ:</span>
                  {assignedClasses.length === 0 ? (
                    <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-3 py-1 rounded-lg border border-amber-500/30">
                      සියලු පන්ති සඳහා අවසර ඇත (All Classes)
                    </span>
                  ) : (
                    assignedClasses.map(c => (
                      <span key={c} className="text-xs font-bold bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-lg border border-indigo-500/40">
                        📚 {c} ({studentsByClass[c] || 0} සිසුන්)
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-indigo-400 mb-2">
                  <span className="text-xs font-bold text-slate-400">ලියාපදිංචි සිසුන්</span>
                  <Users size={18} />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {enrolledStudents.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">ඔබේ පන්තිවල සම්පූර්ණ සිසුන්</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-purple-400 mb-2">
                  <span className="text-xs font-bold text-slate-400">පාඩම් හා රෙකෝඩින්</span>
                  <BookOpen size={18} />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {recordingsCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">ඔබේ පන්තියේ වීඩියෝ</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-teal-400 mb-2">
                  <span className="text-xs font-bold text-slate-400">ටියුට් හා පේපර්ස්</span>
                  <FileText size={18} />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {tutesCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">ඔබේ පන්තියේ ලේඛන</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-amber-400 mb-2">
                  <span className="text-xs font-bold text-slate-400">ලයිව් එක්සෑම්ස්</span>
                  <FileCheck size={18} />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {examsList.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {examsList.filter(e => e.status === 'active').length} ක් සක්‍රීයව PUSH කර ඇත
                </div>
              </div>

            </div>

            {/* Quick Actions Shortcuts */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles className="text-amber-400" size={18} /> ඉක්මන් මෙහෙයුම් (Quick Actions)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                
                <button
                  onClick={() => setActiveTab('live_classes')}
                  className="p-4 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-red-500/40 rounded-2xl text-left transition group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <Video size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-red-400 transition">
                    සූම් පන්තියක් Schedule කිරීම
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">ලයිව් පන්ති වේලාව සකසා සිසුන්ට PUSH කරන්න</p>
                </button>

                <button
                  onClick={() => { handleOpenExamModal(); setActiveTab('exams'); }}
                  className="p-4 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 rounded-2xl text-left transition group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <FileCheck size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition">
                    නව ලයිව් එක්සෑම් එකක් සෑදීම
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">PDF හා පිළිතුරු ඇතුළත් කර ඔබේ පන්තියට පුෂ් කරන්න</p>
                </button>

                <button
                  onClick={() => { handleOpenBatchAssignModal(); setActiveTab('grades'); }}
                  className="p-4 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl text-left transition group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <Award size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                    එසයිමන්ට් ලකුණු එකවර ඇතුළත් කිරීම
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">පන්තියේ සියලු සිසුන්ට එකවර ලකුණු ඇතුළත් කරන්න</p>
                </button>

                <button
                  onClick={() => setActiveTab('recordings')}
                  className="p-4 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500/40 rounded-2xl text-left transition group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <BookOpen size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-purple-400 transition">
                    පාඩම් වීඩියෝ / ටියුට් එක් කිරීම
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">ඔබේ පන්තිය සඳහා පමණක් අධ්‍යයන ද්‍රව්‍ය එක් කරන්න</p>
                </button>

              </div>
            </div>

            {/* 1-Hour Rule Notice Banner */}
            <div className="bg-slate-900/60 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
              <Clock className="text-blue-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-white">පැයක සංස්කරණ රීතිය (1-Hour Edit Window): </span>
                ඔබ විසින් පද්ධතියට එක් කරන ලද ඕනෑම සූම් පන්තියක්, ලෙසන්, ටියුට් හෝ පේපර් එය ඇතුළත් කළ මොහොතේ සිට පැය 1ක් (මිනිත්තු 60ක්) ඇතුළත ඔබට සංස්කරණය කිරීමට හෝ මකා දැමීමට හැකිය. පැය 1 ඉක්මවූ පසු එම දත්ත සුරක්ෂිතභාවය උදෙසා අගුළු වැටෙන අතර අවශ්‍ය නම් Super Admin / Admin / Manager හරහා වෙනස්කම් සිදු කළ හැකිය.
              </div>
            </div>

          </div>
        )}

        {/* =======================================================================
            TAB 2: LIVE ZOOM CLASSES
            ======================================================================= */}
        {activeTab === 'live_classes' && (
          <div className="space-y-6">
            <AdminLiveControls currentStaff={currentStaff} />
          </div>
        )}

        {/* =======================================================================
            TAB 3: STANDALONE LIVE EXAMS & AUTO PUSH
            ======================================================================= */}
        {activeTab === 'exams' && (
          <div className="space-y-6">
            
            {/* Header with New Exam button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileCheck className="text-amber-500" size={24} /> ලයිව් එක්සෑම් කළමනාකරණය හා සිසුන්ට පුෂ් කිරීම
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  ඔබේ පන්තියට අදාළ ප්‍රශ්න පත්‍ර සාදා, ක්ෂණිකව සිසුන්ගේ Dashboard එකට PUSH කරන්න හෝ වේලාවක් Schedule කරන්න.
                </p>
              </div>

              <button
                onClick={() => handleOpenExamModal()}
                className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-amber-900/30 cursor-pointer"
              >
                <Plus size={16} /> නව ලයිව් එක්සෑම් එකක් සාදන්න
              </button>
            </div>

            {/* List of Created Exams */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <span className="font-bold text-sm text-slate-200">ඔබගේ විභාග ලැයිස්තුව ({examsList.length})</span>
                <span className="text-[11px] text-slate-400">අදාළ පන්ති: {assignedClasses.join(', ') || 'සියල්ල'}</span>
              </div>

              {examsList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  තවමත් විභාග නිර්මාණය කර නොමැත. නව විභාගයක් සෑදීමට ඉහත බොත්තම ඔබන්න.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {examsList.map((exam) => {
                    const isPushed = exam.status === 'active';
                    const canEdit = canLecturerEdit(exam.created_at);
                    const remainingMins = getRemainingMinutes(exam.created_at);

                    return (
                      <div key={exam.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-850/50 transition">
                        
                        <div className="space-y-1.5 max-w-xl">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">{exam.title}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPushed 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse' 
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {isPushed ? '🔴 PUSHED TO STUDENTS' : '⏸️ PENDING'}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800 text-[11px] font-semibold">
                              පන්තිය: {exam.class_type || exam.target_class_type || 'All'}
                            </span>
                            <span>ප්‍රශ්න: {exam.total_questions || 50}</span>
                            <span>කාලය: {exam.duration_minutes || 90} මිනිත්තු</span>
                          </div>

                          {exam.pdf_url && (
                            <a
                              href={exam.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 mt-1 inline-block"
                            >
                              <ExternalLink size={12} /> Google Drive Paper Preview
                            </a>
                          )}
                        </div>

                        {/* Push Controls & Edit Buttons */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          
                          {/* Push / Unpush Button */}
                          {isPushed ? (
                            <button
                              onClick={() => handleRetractExam(exam)}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md bg-rose-600 hover:bg-rose-500 text-white"
                            >
                              <EyeOff size={14} />
                              <span>පුෂ් කිරීම නවත්වන්න</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePushExam(exam, false)}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30"
                            >
                              <Send size={14} />
                              <span>දැන්ම සිසුන්ට PUSH කරන්න</span>
                            </button>
                          )}

                          {/* 1-Hour Protected Edit & Delete */}
                          {canEdit ? (
                            <>
                              <button
                                onClick={() => handleOpenExamModal(exam)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl transition cursor-pointer"
                                title={`Edit Exam (${remainingMins} mins left in 1-hr window)`}
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteExam(exam)}
                                className="p-2 bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-700 rounded-xl transition cursor-pointer"
                                title={`Delete Exam (${remainingMins} mins left in 1-hr window)`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <span 
                              className="text-[10px] bg-slate-950 border border-slate-800 text-slate-500 px-2 py-1.5 rounded"
                              title="පැය 1 ඉක්මවා ඇති බැවින් සංස්කරණය/මැකීම කළ හැක්කේ ප්‍රධාන පරිපාලක මඟින් පමණි."
                            >
                              🔒 Locked (&gt;1h)
                            </span>
                          )}

                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* =======================================================================
            TAB 4: EXAM & ASSIGNMENT MARKS (With Completed + Unattempted Students + Batch Grading)
            ======================================================================= */}
        {activeTab === 'grades' && (
          <div className="space-y-8">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Award className="text-emerald-400" size={24} /> ලකුණු හා ඇගයීම් කළමනාකරණය
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  සජීවී විභාග ලකුණු, විභාගය නොකළ සිසුන් නැවත පුෂ් කිරීම සහ එකවර එසයිමන්ට් ලකුණු ඇතුළත් කිරීම.
                </p>
                <p className="text-[11px] text-amber-400/90 font-semibold mt-1">
                  🔒 රහස්‍යතා රීතිය: සිසුන්ගේ නම සහ Username පමණක් ප්‍රදර්ශනය කෙරේ.
                </p>
              </div>

              <button
                onClick={() => handleOpenBatchAssignModal()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                <Plus size={16} /> නව එසයිමන්ට් ලකුණු එකවර ඇතුළත් කරන්න
              </button>
            </div>

            {/* ===================================================================
                SECTION 1: LIVE EXAM EVALUATION (Completed vs Unattempted Students)
                Requirement: විභාගය නොකල සිසුන් වෙනම පෙන්වා නැවත පුෂ් කිරීමේ හැකියාව
                =================================================================== */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <FileCheck className="text-amber-400" size={20} /> ලයිව් එක්සෑම් ලකුණු සහ සිසුන්ගේ තත්ත්වය (Exam Tracker)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    විභාගය අනුව සම්පූර්ණ කළ සිසුන්ගේ ලකුණු සහ තවමත් නොකළ සිසුන් වෙන වෙනම නිරීක්ෂණය කරන්න.
                  </p>
                </div>

                {/* Exam Selector */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label className="text-xs font-bold text-slate-400 whitespace-nowrap">විභාගය තෝරන්න:</label>
                  <select
                    value={selectedExamId}
                    onChange={e => setSelectedExamId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-amber-300 font-bold text-xs px-3.5 py-2 rounded-xl focus:outline-none focus:border-amber-500 w-full sm:w-64 truncate"
                  >
                    {examsList.map(ex => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.class_type || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeExamObj ? (
                <div className="space-y-4">
                  
                  {/* Selected Exam Meta Banner */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <span className="text-xs font-bold text-amber-400 block">{activeExamObj.title}</span>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-3 mt-1">
                        <span>අදාළ පන්තිය: <strong className="text-white">{activeExamClass || 'All'}</strong></span>
                        <span>පන්තියේ සම්පූර්ණ සිසුන්: <strong className="text-white">{studentsInExamClass.length}</strong></span>
                        <span>සම්පූර්ණ කළ: <strong className="text-emerald-400">{completedResults.length}</strong></span>
                        <span>නොකළ: <strong className="text-rose-400">{unattemptedStudents.length}</strong></span>
                      </div>
                    </div>

                    {/* Re-push Buttons: To Unattempted Students AND To Completed Students (Allow Retake) */}
                    <div className="flex flex-wrap gap-2">
                      {unattemptedStudents.length > 0 && (
                        <button
                          onClick={() => handlePushExam(activeExamObj, 'pending')}
                          className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-900/30 transition flex items-center gap-1.5 cursor-pointer"
                          title="නොකළ සිසුන්ට මෙම විභාගය නැවත push කරන්න"
                        >
                          <RotateCcw size={14} />
                          <span>නොකළ සිසුන්ට ({unattemptedStudents.length}) Re-PUSH</span>
                        </button>
                      )}

                      {completedResults.length > 0 && (
                        <button
                          onClick={() => handlePushExam(activeExamObj, 'retake_all')}
                          className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-900/30 transition flex items-center gap-1.5 cursor-pointer"
                          title="විභාගය දැනටමත් කර ඇති සිසුන්ටද නැවත කිරීමට අවසර ලැබෙන පරිදි Re-PUSH කරන්න"
                        >
                          <RotateCcw size={14} />
                          <span>කළ සිසුන්ට නැවත කිරීමට (Retake for All) Re-PUSH</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-Tabs: Completed vs Unattempted */}
                  <div className="flex border-b border-slate-800 space-x-2">
                    <button
                      onClick={() => setResultsSubTab('completed')}
                      className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                        resultsSubTab === 'completed'
                          ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-xl'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      <span>විභාගය කළ සිසුන් ({completedResults.length})</span>
                    </button>

                    <button
                      onClick={() => setResultsSubTab('unattempted')}
                      className={`px-4 py-2.5 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                        resultsSubTab === 'unattempted'
                          ? 'border-rose-500 text-rose-400 bg-rose-500/10 rounded-t-xl'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      <AlertCircle size={14} />
                      <span>විභාගය නොකළ සිසුන් ({unattemptedStudents.length})</span>
                    </button>
                  </div>

                  {/* Sub-Tab 1: Completed Students Table */}
                  {resultsSubTab === 'completed' && (
                    <div>
                      {completedResults.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs">
                          මෙම විභාගය සඳහා තවමත් කිසිදු ශිෂ්‍යයෙකු පිළිතුරු ලබා දී නොමැත.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                              <tr>
                                <th className="p-3.5">ශිෂ්‍යයා (Student Name)</th>
                                <th className="p-3.5">Username</th>
                                <th className="p-3.5 text-center">ලබාගත් ලකුණු</th>
                                <th className="p-3.5 text-center">ප්‍රතිශතය (%)</th>
                                <th className="p-3.5">වේලාව (Submitted At)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {completedResults.map(res => {
                                const matchedStudent = enrolledStudents.find(s => s.username === res.username);
                                const displayName = matchedStudent?.name || res.username;
                                const percentage = res.meta_data?.percentage ?? (res.meta_data?.total_questions ? Math.round((res.score / res.meta_data.total_questions) * 100) : null);

                                return (
                                  <tr key={res.id} className="hover:bg-slate-850/50 transition">
                                    <td className="p-3.5 font-bold text-white">
                                      {displayName}
                                    </td>
                                    <td className="p-3.5 font-mono text-indigo-400">
                                      @{res.username}
                                    </td>
                                    <td className="p-3.5 text-center">
                                      <span className="font-extrabold text-sm text-amber-400">
                                        {res.score} / {res.meta_data?.total_questions || '-'}
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-center">
                                      {percentage !== null ? (
                                        <span className={`px-2 py-0.5 rounded-full font-bold ${
                                          percentage >= 75 ? 'bg-emerald-500/20 text-emerald-300' :
                                          percentage >= 50 ? 'bg-amber-500/20 text-amber-300' :
                                          'bg-rose-500/20 text-rose-300'
                                        }`}>
                                          {percentage}%
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                                      {res.submitted_at ? new Date(res.submitted_at).toLocaleString() : 'N/A'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Tab 2: Unattempted Students Table */}
                  {resultsSubTab === 'unattempted' && (
                    <div>
                      {unattemptedStudents.length === 0 ? (
                        <div className="p-8 text-center text-emerald-400 text-xs font-bold">
                          🎉 විශිෂ්ටයි! පන්තියේ සියලුම සිසුන් මෙම විභාගයට පෙනී සිට ඇත.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                              <tr>
                                <th className="p-3.5 w-12 text-center">#</th>
                                <th className="p-3.5">ශිෂ්‍යයා (Student Name)</th>
                                <th className="p-3.5">Username</th>
                                <th className="p-3.5">තත්ත්වය (Status)</th>
                                <th className="p-3.5 text-center">නැවත පුෂ් කිරීම</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {unattemptedStudents.map((std, idx) => (
                                <tr key={std.id} className="hover:bg-slate-850/50 transition">
                                  <td className="p-3.5 text-center font-mono text-slate-500">
                                    {idx + 1}
                                  </td>
                                  <td className="p-3.5 font-bold text-white">
                                    {std.name}
                                  </td>
                                  <td className="p-3.5 font-mono text-indigo-400 font-bold">
                                    @{std.username}
                                  </td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                      තවමත් විභාගයට පෙනී සිට නැත
                                    </span>
                                  </td>
                                  <td className="p-3.5 text-center">
                                    <button
                                      onClick={() => handlePushExam(activeExamObj, true)}
                                      className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <Send size={12} /> Re-Push
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  තවමත් ලයිව් විභාග සකසා නොමැත. "ලයිව් එක්සෑම් හා පුෂ්" ටැබ් එක වෙතින් නව විභාගයක් සාදන්න.
                </div>
              )}

            </div>

            {/* ===================================================================
                SECTION 2: ASSIGNMENT MARKS LEDGER (පැවරුම් ලකුණු ලේඛනය)
                Requirement: පෙන්විය යුතුයි + පැය 24ක් තුළ මුළු ලැයිස්තුවම හෝ තනි තනිව Edit/Delete පහසුකම
                =================================================================== */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-5 md:p-6">
              
              {/* Header Bar */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
                <div>
                  <h3 className="font-extrabold text-base md:text-lg text-emerald-400 flex items-center gap-2">
                    <FileText size={20} />
                    <span>එසයිමන්ට් ලකුණු ලැයිස්තුව (Assignment Marks Ledger)</span>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      {assignmentMarksList.length} ලකුණු
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    දේශකවරයා විසින් ඇතුළත් කරන ලද ලකුණු පැය 24ක් තුළ මුළු ලැයිස්තුවම හෝ තනි තනි සිසුන් වෙන වෙනම සංස්කරණය (Edit) හා මකාදැමීම (Delete) කළ හැක.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                  {/* View Mode Switcher */}
                  <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                    <button
                      onClick={() => setLedgerViewMode('batches')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        ledgerViewMode === 'batches'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📋 පැවරුම් අනුව (Batches)
                    </button>
                    <button
                      onClick={() => setLedgerViewMode('students')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        ledgerViewMode === 'students'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👥 ශිෂ්‍ය ලකුණු (All Students)
                    </button>
                  </div>

                  {/* Add New Batch Marks Button */}
                  <button
                    onClick={() => handleOpenBatchAssignModal()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition cursor-pointer shrink-0"
                  >
                    <Plus size={15} /> නව ලකුණු එකවර ඇතුළත් කරන්න
                  </button>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="ශිෂ්‍ය නම, Username හෝ පැවරුම් නාමය අනුව සොයන්න..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {ledgerSearch && (
                    <button
                      onClick={() => setLedgerSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={ledgerClassFilter}
                    onChange={e => setLedgerClassFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">සියලු පන්ති (All Classes)</option>
                    {assignedClasses.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* MAIN CONTENT DISPLAY */}
              {(() => {
                const normVal = (s?: string) => (s || '').trim().toLowerCase();
                const filteredMarks = assignmentMarksList.filter(m => {
                  if (ledgerClassFilter !== 'all' && normVal(m.class_type) !== normVal(ledgerClassFilter)) {
                    return false;
                  }
                  if (ledgerSearch.trim()) {
                    const q = ledgerSearch.toLowerCase().trim();
                    const sName = (m.student_name || '').toLowerCase();
                    const uName = (m.student_username || '').toLowerCase();
                    const aName = (m.assignment_name || '').toLowerCase();
                    if (!sName.includes(q) && !uName.includes(q) && !aName.includes(q)) {
                      return false;
                    }
                  }
                  return true;
                });

                if (assignmentMarksList.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-500 text-xs space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800/80 p-8">
                      <FileText size={36} className="mx-auto text-slate-600" />
                      <p className="font-semibold text-slate-400">තවමත් එසයිමන්ට් ලකුණු ඇතුළත් කර නොමැත.</p>
                      <button
                        onClick={() => handleOpenBatchAssignModal()}
                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus size={14} /> නව එසයිමන්ට් ලකුණු එකවර ඇතුළත් කරන්න
                      </button>
                    </div>
                  );
                }

                if (filteredMarks.length === 0) {
                  return (
                    <div className="py-10 text-center text-slate-500 text-xs bg-slate-950/40 rounded-2xl border border-slate-800/80">
                      සොයන ලද නිර්ණායකවලට ගැලපෙන ලකුණු සටහන් හමු නොවීය.
                    </div>
                  );
                }

                // ==========================================================
                // VIEW 1: BATCHES OVERVIEW (Grouped by assignment_name + class_type)
                // ==========================================================
                if (ledgerViewMode === 'batches') {
                  // Group marks by assignment_name + class_type
                  const batchMap = new Map<string, {
                    assignment_name: string;
                    class_type: string;
                    assignment_date: string;
                    created_at?: string;
                    marks: any[];
                  }>();

                  filteredMarks.forEach(m => {
                    const key = `${m.assignment_name}____${m.class_type || 'General'}`;
                    if (!batchMap.has(key)) {
                      batchMap.set(key, {
                        assignment_name: m.assignment_name,
                        class_type: m.class_type || 'General',
                        assignment_date: m.assignment_date || '',
                        created_at: m.created_at,
                        marks: []
                      });
                    }
                    batchMap.get(key)!.marks.push(m);
                  });

                  const batchList = Array.from(batchMap.values());

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      {batchList.map((batch, bIdx) => {
                        const totalStudents = batch.marks.length;
                        const avgMarks = Math.round(batch.marks.reduce((acc, curr) => acc + (Number(curr.marks) || 0), 0) / (totalStudents || 1));
                        const remTime = getAssignmentRemainingTime(batch.created_at);
                        const isEditable = !remTime.expired;

                        return (
                          <div
                            key={`batch-${bIdx}`}
                            className="p-5 bg-slate-950 rounded-2xl border border-slate-800/90 hover:border-slate-700 transition flex flex-col justify-between gap-4 shadow-lg group"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                                    {batch.class_type}
                                  </span>
                                  <h4 className="text-sm font-extrabold text-white mt-1.5 leading-snug">
                                    {batch.assignment_name}
                                  </h4>
                                </div>
                                <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 whitespace-nowrap">
                                  📅 {batch.assignment_date || 'N/A'}
                                </span>
                              </div>

                              {/* Stats Row */}
                              <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                  <p className="text-[10px] text-slate-400 uppercase font-semibold">ශිෂ්‍ය සංඛ්‍යාව</p>
                                  <p className="text-base font-extrabold text-white font-mono">{totalStudents}</p>
                                </div>
                                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                  <p className="text-[10px] text-slate-400 uppercase font-semibold">සාමාන්‍ය ලකුණු (Avg)</p>
                                  <p className="text-base font-extrabold text-emerald-400 font-mono">{avgMarks}%</p>
                                </div>
                              </div>

                              {/* 24-Hour Edit Window Status Pill */}
                              <div className="pt-1">
                                {isEditable ? (
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                                    <Clock size={13} className="text-emerald-400 animate-spin" />
                                    <span>පැය 24 න් පැය {remTime.hours} මිනිත්තු {remTime.minutes} ඉතිරියි (Edit/Delete හැක)</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
                                    <ShieldAlert size={13} className="text-slate-500" />
                                    <span>පැය 24 ඉක්මවා ඇත (සංස්කරණය ලොක් කර ඇත)</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons: Edit entire batch, Delete entire batch, View students */}
                            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80">
                              <button
                                onClick={() => {
                                  setLedgerViewMode('students');
                                  setLedgerSearch(batch.assignment_name);
                                }}
                                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Users size={13} /> ශිෂ්‍ය ලකුණු ({totalStudents})
                              </button>

                              <button
                                onClick={() => handleOpenEditEntireAssignment(batch.assignment_name, batch.class_type, batch.assignment_date, batch.created_at)}
                                disabled={!isEditable}
                                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                  isEditable
                                    ? 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30'
                                    : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60'
                                }`}
                                title={isEditable ? 'මුළු ලැයිස්තුවම එකවර සංස්කරණය කරන්න' : 'පැය 24 ඉක්මවා ඇති බැවින් සංස්කරණය කළ නොහැක'}
                              >
                                <Edit size={13} /> මුළු ලැයිස්තුවම Edit
                              </button>

                              <button
                                onClick={() => handleDeleteEntireAssignment(batch.assignment_name, batch.class_type, batch.created_at)}
                                disabled={!isEditable}
                                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                  isEditable
                                    ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30'
                                    : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60'
                                }`}
                                title={isEditable ? 'මුළු පැවරුම් ලැයිස්තුවම මකන්න' : 'පැය 24 ඉක්මවා ඇති බැවින් මකා දැමිය නොහැක'}
                              >
                                <Trash2 size={13} /> මුළු ලැයිස්තුවම Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // ==========================================================
                // VIEW 2: INDIVIDUAL STUDENTS TABLE (වෙන වෙනම Edit / Delete)
                // ==========================================================
                return (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">ශිෂ්‍යයා (Student Name)</th>
                          <th className="p-3.5">Username</th>
                          <th className="p-3.5">පැවරුම් නාමය (Assignment)</th>
                          <th className="p-3.5">පන්තිය</th>
                          <th className="p-3.5 text-center">ලකුණු (Marks)</th>
                          <th className="p-3.5">දිනය</th>
                          <th className="p-3.5 text-center">පැය 24 තත්ත්වය</th>
                          <th className="p-3.5 text-center">ක්‍රියාකාරකම්</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                        {filteredMarks.map((mark) => {
                          const rem = getAssignmentRemainingTime(mark.created_at);
                          const isEditable = !rem.expired;

                          return (
                            <tr key={mark.id} className="hover:bg-slate-850/50 transition">
                              <td className="p-3.5 font-bold text-white">
                                {mark.student_name || mark.student_username}
                              </td>
                              <td className="p-3.5 font-mono text-indigo-400">
                                @{mark.student_username}
                              </td>
                              <td className="p-3.5 text-slate-200 font-medium">
                                {mark.assignment_name}
                              </td>
                              <td className="p-3.5">
                                <span className="bg-slate-950 px-2 py-0.5 rounded text-[10px] border border-slate-800 font-semibold text-slate-300">
                                  {mark.class_type || 'General'}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                                  {mark.marks}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-400 font-mono">
                                {mark.assignment_date || 'N/A'}
                              </td>
                              <td className="p-3.5 text-center">
                                {isEditable ? (
                                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
                                    <Clock size={10} /> පැය {rem.hours} ඉතිරියි
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    🔒 ලොක්
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      if (!isEditable) {
                                        alert('පැය 24 ක කාලය ඉක්මවා ඇති බැවින් මෙම ශිෂ්‍යයාගේ ලකුණු සංස්කරණය කළ නොහැක.');
                                        return;
                                      }
                                      setEditingMark(mark);
                                    }}
                                    disabled={!isEditable}
                                    className={`p-1.5 rounded-lg transition ${
                                      isEditable 
                                        ? 'bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer' 
                                        : 'bg-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                                    }`}
                                    title={isEditable ? 'තනිව සංස්කරණය (Edit)' : 'පැය 24 ඉක්මවා ඇති බැවින් ලොක් කර ඇත'}
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAssignmentMark(mark)}
                                    disabled={!isEditable}
                                    className={`p-1.5 rounded-lg transition ${
                                      isEditable 
                                        ? 'bg-slate-800 hover:bg-rose-950 text-rose-400 cursor-pointer' 
                                        : 'bg-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                                    }`}
                                    title={isEditable ? 'තනිව මකාදමන්න (Delete)' : 'පැය 24 ඉක්මවා ඇති බැවින් ලොක් කර ඇත'}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

            </div>

          </div>
        )}

        {/* =======================================================================
            TAB 5: LESSONS & RECORDINGS (Strictly Filtered by Lecturer's Classes)
            ======================================================================= */}
        {activeTab === 'recordings' && (
          <div className="space-y-6">
            <AdminRecordingsManager initialTab="recordings" currentStaff={currentStaff} />
          </div>
        )}

        {/* =======================================================================
            TAB 6: TUTES & PAPERS (Strictly Filtered by Lecturer's Classes)
            ======================================================================= */}
        {activeTab === 'tutes' && (
          <div className="space-y-6">
            <AdminRecordingsManager initialTab="tutes" currentStaff={currentStaff} />
          </div>
        )}

        {/* =======================================================================
            TAB 7: ENROLLED STUDENTS (Database Filtered + Strict Privacy: Name and Username ONLY)
            ======================================================================= */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="text-indigo-400" size={24} /> මගේ පන්තිවල ලියාපදිංචි සිසුන්
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  ඔබට පවරා ඇති පන්ති ({assignedClasses.join(', ') || 'සියල්ල'}) සඳහා ලියාපදිංචිව සිටින සිසුන් පමණක් මෙහි පෙන්වයි.
                </p>
                <div className="mt-2 text-[11px] bg-slate-950 border border-slate-800 text-slate-400 px-3 py-1.5 rounded-xl inline-block">
                  🔒 රහස්‍යතා ප්‍රතිපත්තිය: මෙම ලැයිස්තුවේ ශිෂ්‍යයාගේ නම සහ Username පමණක් ප්‍රදර්ශනය කෙරේ.
                </div>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black text-indigo-400">{enrolledStudents.length}</span>
                <span className="text-xs text-slate-400 block">සම්පූර්ණ සිසුන් ගණන</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-3.5 w-12 text-center">#</th>
                      <th className="p-3.5">ශිෂ්‍යයාගේ සම්පූර්ණ නම (Student Full Name)</th>
                      <th className="p-3.5">පද්ධති නාමය (Username)</th>
                      <th className="p-3.5">ලියාපදිංචි පන්ති කාණ්ඩ</th>
                      <th className="p-3.5 text-center">එසයිමන්ට් ලකුණු ලබාදීම</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {enrolledStudents.map((std, idx) => (
                      <tr key={std.id} className="hover:bg-slate-850/50 transition">
                        <td className="p-3.5 text-center font-mono text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="p-3.5 font-bold text-white text-sm">
                          {std.name}
                        </td>
                        <td className="p-3.5 font-mono text-indigo-400 font-semibold">
                          @{std.username}
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const norm = (s: string) => (s || '').trim().toLowerCase();
                              const visibleClasses = (std.class_types || []).filter((c: string) => {
                                if (assignedClasses.length === 0) return true;
                                return assignedClasses.some(ac => norm(ac) === norm(c));
                              });
                              return visibleClasses.map((c: string) => (
                                <span key={c} className="bg-slate-950 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-800 font-medium">
                                  {c}
                                </span>
                              ));
                            })()}
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              const norm = (s: string) => (s || '').trim().toLowerCase();
                              const matchedClass = (std.class_types || []).find((c: string) =>
                                assignedClasses.length === 0 || assignedClasses.some(ac => norm(ac) === norm(c))
                              ) || assignedClasses[0] || std.class_types?.[0];
                              handleOpenBatchAssignModal(matchedClass);
                              setActiveTab('grades');
                            }}
                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                          >
                            <Plus size={12} /> Add Marks
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* =========================================================================
          MODAL 1: STANDALONE LIVE EXAM CREATION / EDITING
          ========================================================================= */}
      {isExamModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileCheck className="text-amber-500" /> 
                {examFormData.id ? 'විභාගය සංස්කරණය කරන්න' : 'නව ලයිව් එක්සෑම් එකක් නිර්මාණය කරන්න'}
              </h2>
              <button 
                onClick={() => setIsExamModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-mono mb-1">Exam Title (විභාග මාතෘකාව)</label>
                  <input
                    required
                    type="text"
                    value={examFormData.title}
                    onChange={e => setExamFormData({ ...examFormData, title: e.target.value })}
                    placeholder="උදා: 2026 Revision - Unit 01 Live Exam"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 uppercase font-mono mb-1">Target Class (ඔබට අයත් පන්ති පමණි)</label>
                  <select
                    required
                    value={examFormData.class_type}
                    onChange={e => setExamFormData({ ...examFormData, class_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="" disabled>පන්තියක් තෝරන්න</option>
                    {assignedClasses.length > 0 ? (
                      assignedClasses.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    ) : (
                      <option value="2026 Revision">2026 Revision</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 uppercase font-mono mb-1">Google Drive PDF URL (ප්‍රශ්න පත්‍ර Link එක)</label>
                <input
                  required
                  type="url"
                  value={examFormData.pdf_url}
                  onChange={e => setExamFormData({ ...examFormData, pdf_url: e.target.value })}
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Exam Duration */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl">
                <label className="block text-sm font-bold text-slate-300 mb-2">Exam Duration (කාල සීමාව)</label>
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <label className="text-[11px] text-slate-500 mb-1">Hours (පැය)</label>
                    <input
                      type="number"
                      min="0"
                      value={examFormData.durationHours}
                      onChange={e => setExamFormData({ ...examFormData, durationHours: Number(e.target.value) })}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-center font-bold"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[11px] text-slate-500 mb-1">Minutes (මිනිත්තු)</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={examFormData.durationMinutes}
                      onChange={e => setExamFormData({ ...examFormData, durationMinutes: Number(e.target.value) })}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-center font-bold"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[11px] text-slate-500 mb-1">Seconds (තත්පර)</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={examFormData.durationSeconds}
                      onChange={e => setExamFormData({ ...examFormData, durationSeconds: Number(e.target.value) })}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Total Questions Count */}
              <div>
                <label className="block text-xs text-slate-400 uppercase font-mono mb-1">Total Questions Count (ප්‍රශ්න ගණන)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={examFormData.total_questions}
                  onChange={e => setExamFormData({ ...examFormData, total_questions: Number(e.target.value) })}
                  className="w-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold"
                />
              </div>

              {/* Answer Key Grid */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl">
                <label className="block text-sm font-bold text-slate-300 mb-2">Answer Key (නිවැරදි පිළිතුරු 1 සිට 5 දක්වා)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-56 overflow-y-auto p-2">
                  {Array.from({ length: examFormData.total_questions }, (_, i) => i + 1).map(qNum => (
                    <div key={qNum} className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400 font-mono text-xs w-6 text-right font-bold">{qNum}.</span>
                      <select
                        value={examFormData.correct_answer[qNum] || ''}
                        onChange={e => setExamFormData({
                          ...examFormData,
                          correct_answer: { ...examFormData.correct_answer, [qNum]: Number(e.target.value) }
                        })}
                        className="bg-slate-950 border border-slate-800 text-white rounded-lg p-1.5 w-full text-xs font-bold"
                        required
                      >
                        <option value="" disabled>-</option>
                        {[1, 2, 3, 4, 5].map(opt => (
                          <option key={opt} value={opt}>({opt})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition"
                >
                  අවලංගු කරන්න
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-amber-900/30"
                >
                  {examFormData.id ? 'විභාගය යාවත්කාලීන කරන්න' : 'විභාගය සුරකින්න'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: BATCH ASSIGNMENT MARKS ENTRY MODAL (Grade Multiple Students in 1 Form!)
          Requirement: එකම පොරමය තුල එකවර සිසුන් කිහිපදෙනෙක් එකවර ඇඩ් කර සබ්මිට් කිරීම
          ========================================================================= */}
      {isBatchAssignModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-4">
          <div className="bg-slate-900 border border-emerald-500/30 p-6 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="text-emerald-400" />
                  පැවරුම් ලකුණු එකවර ඇතුළත් කිරීම (Batch Assignment Grading)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  පන්තිය තෝරා, සියලු සිසුන්ට හෝ තෝරාගත් සිසුන්ට එකවර ලකුණු ලබා දී සබ්මිට් කරන්න.
                </p>
              </div>
              <button 
                onClick={() => setIsBatchAssignModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBatchAssignmentMarks} className="flex-1 flex flex-col overflow-hidden space-y-4">
              
              {/* Form Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs text-slate-400 uppercase font-mono mb-1">
                    පන්තිය (ඔබට අයත් පන්ති) *
                  </label>
                  <select
                    required
                    value={batchAssignForm.class_type}
                    onChange={e => handleBatchClassChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
                  >
                    {assignedClasses.length > 0 ? (
                      assignedClasses.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    ) : (
                      <option value="2026 Revision">2026 Revision</option>
                    )}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs text-slate-400 uppercase font-mono mb-1">
                    Assignment Name (පැවරුම් නාමය) *
                  </label>
                  <input
                    required
                    type="text"
                    value={batchAssignForm.assignment_name}
                    onChange={e => setBatchAssignForm({ ...batchAssignForm, assignment_name: e.target.value })}
                    placeholder="උදා: Mechanics Sheet 01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs text-slate-400 uppercase font-mono mb-1">
                    දිනය (Date) *
                  </label>
                  <input
                    required
                    type="date"
                    value={batchAssignForm.assignment_date}
                    onChange={e => setBatchAssignForm({ ...batchAssignForm, assignment_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs font-mono"
                  />
                </div>
              </div>

              {/* Student Filter & Bulk Actions Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ශිෂ්‍ය නම හෝ Username සොයන්න..."
                    value={batchSearch}
                    onChange={e => setBatchSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchStudentRows(prev => prev.map(r => ({ ...r, selected: true })));
                    }}
                    className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                  >
                    සියල්ල තෝරන්න
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchStudentRows(prev => prev.map(r => ({ ...r, marks: 100 })));
                    }}
                    className="text-[11px] font-bold text-blue-400 hover:underline cursor-pointer"
                  >
                    සියල්ලන්ටම 100 යොදන්න
                  </button>
                </div>
              </div>

              {/* Batch Student List Table */}
              <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-10 text-center">තෝරන්න</th>
                      <th className="p-3">ශිෂ්‍යයාගේ නම</th>
                      <th className="p-3">Username</th>
                      <th className="p-3 text-center w-36">ලකුණු (Marks)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {batchStudentRows
                      .filter(r => !batchSearch || r.username.toLowerCase().includes(batchSearch.toLowerCase()) || r.name.toLowerCase().includes(batchSearch.toLowerCase()))
                      .map((row, idx) => (
                        <tr key={row.username} className={`hover:bg-slate-850/50 transition ${row.selected ? 'bg-slate-900/40' : 'opacity-60'}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={e => {
                                const checked = e.target.checked;
                                setBatchStudentRows(prev => prev.map(r => r.username === row.username ? { ...r, selected: checked } : r));
                              }}
                              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-bold text-white">
                            {row.name}
                          </td>
                          <td className="p-3 font-mono text-indigo-400">
                            @{row.username}
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={row.marks}
                              disabled={!row.selected}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setBatchStudentRows(prev => prev.map(r => r.username === row.username ? { ...r, marks: val } : r));
                              }}
                              className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-center text-xs font-black text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Form Submit Footer */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <span className="text-xs text-slate-400">
                  තෝරාගත් සිසුන් ගණන: <strong className="text-emerald-400">{batchStudentRows.filter(r => r.selected).length}</strong>
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchAssignModalOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    අවලංගු කරන්න
                  </button>
                  <button
                    type="submit"
                    disabled={isBatchSaving}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition cursor-pointer disabled:opacity-50"
                  >
                    {isBatchSaving ? 'සුරැකෙමින් පවතී...' : 'ලකුණු සියල්ල එකවර සුරකින්න (Save All Marks)'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: SINGLE EDIT ASSIGNMENT MARK MODAL
          ========================================================================= */}
      {editingMark && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-3xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-white">පැවරුම් ලකුණු සංස්කරණය (Single Edit)</h3>
              {(() => {
                const rem = getAssignmentRemainingTime(editingMark.created_at);
                return (
                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <Clock size={10} className="inline mr-1" />
                    පැය {rem.hours} ඉතිරියි
                  </span>
                );
              })()}
            </div>
            <form onSubmit={handleSaveSingleEdit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">ශිෂ්‍යයා</label>
                <div className="p-2.5 bg-slate-950 rounded-xl text-xs font-bold text-white font-mono">
                  {editingMark.student_name} (@{editingMark.student_username})
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">පැවරුම් නාමය</label>
                <input
                  type="text"
                  required
                  value={editingMark.assignment_name}
                  onChange={e => setEditingMark({ ...editingMark, assignment_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">ලකුණු (Marks)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="1000"
                  value={editingMark.marks}
                  onChange={e => setEditingMark({ ...editingMark, marks: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white font-black text-center"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMark(null)}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
                >
                  අවලංගු කරන්න
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"
                >
                  සුරකින්න
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
