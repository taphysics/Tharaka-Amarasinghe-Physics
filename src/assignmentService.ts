import { supabase } from './supabaseClient';
import { AssignmentMark } from './types';
import { emitRealtimeEvent, subscribeRealtimeEvents } from './realtimeSync';

const LOCAL_STORAGE_KEY = 'physics_hub_assignment_marks';

export async function fetchAssignmentMarks(filter?: {
  classType?: string;
  studentUsername?: string;
  lecturerId?: string;
}): Promise<AssignmentMark[]> {
  let dbMarks: AssignmentMark[] = [];
  try {
    let query = supabase.from('assignment_marks').select('*').order('created_at', { ascending: false });
    if (filter?.classType && filter.classType !== 'all') {
      query = query.eq('class_type', filter.classType);
    }
    if (filter?.studentUsername) {
      query = query.eq('student_username', filter.studentUsername);
    }
    if (filter?.lecturerId) {
      query = query.eq('lecturer_id', filter.lecturerId);
    }
    const { data, error } = await query;
    if (!error && data) {
      dbMarks = data;
    }
  } catch (err) {
    console.warn('Supabase fetchAssignmentMarks error, using local fallback:', err);
  }

  // Local storage fallback / synchronization
  let localMarks: AssignmentMark[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) localMarks = JSON.parse(raw);
  } catch (e) {
    console.warn('LocalStorage parse error for assignment marks:', e);
  }

  // Combine and deduplicate by ID
  const map = new Map<string, AssignmentMark>();
  localMarks.forEach(m => map.set(m.id, m));
  dbMarks.forEach(m => map.set(m.id, m));

  const allMarks = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  // Sync to local storage for fast cached access
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(allMarks));

  if (filter?.classType && filter.classType !== 'all') {
    return allMarks.filter(m => m.class_type === filter.classType);
  }
  if (filter?.studentUsername) {
    return allMarks.filter(m => m.student_username === filter.studentUsername);
  }
  return allMarks;
}

export async function saveAssignmentMark(mark: Omit<AssignmentMark, 'id'> & { id?: string }): Promise<AssignmentMark> {
  const finalMark: AssignmentMark = {
    id: mark.id || `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    assignment_name: mark.assignment_name,
    class_type: mark.class_type,
    assignment_date: mark.assignment_date || new Date().toISOString().split('T')[0],
    student_id: mark.student_id,
    student_username: mark.student_username,
    student_name: mark.student_name,
    marks: Number(mark.marks) || 0,
    lecturer_id: mark.lecturer_id,
    lecturer_name: mark.lecturer_name,
    created_at: mark.created_at || new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('assignment_marks').upsert([finalMark]);
    if (error) {
      console.warn('Supabase upsert assignment mark note:', error.message);
    }
  } catch (err) {
    console.warn('Supabase save error:', err);
  }

  // Update local storage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const list: AssignmentMark[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex(m => m.id === finalMark.id);
    if (index >= 0) {
      list[index] = finalMark;
    } else {
      list.unshift(finalMark);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('LocalStorage save note:', e);
  }

  emitRealtimeEvent('assignment_marks_updated' as any, finalMark);
  return finalMark;
}

export async function saveBatchAssignmentMarks(
  marks: Array<Omit<AssignmentMark, 'id'> & { id?: string }>
): Promise<AssignmentMark[]> {
  const prepared: AssignmentMark[] = marks.map((m, idx) => ({
    id: m.id || `asgn_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
    assignment_name: m.assignment_name,
    class_type: m.class_type,
    assignment_date: m.assignment_date || new Date().toISOString().split('T')[0],
    student_id: m.student_id,
    student_username: m.student_username,
    student_name: m.student_name,
    marks: Number(m.marks) || 0,
    lecturer_id: m.lecturer_id,
    lecturer_name: m.lecturer_name,
    created_at: m.created_at || new Date().toISOString()
  }));

  try {
    const { error } = await supabase.from('assignment_marks').upsert(prepared);
    if (error) {
      console.warn('Supabase upsert batch assignment marks note:', error.message);
    }
  } catch (err) {
    console.warn('Supabase save error:', err);
  }

  // Update local storage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const list: AssignmentMark[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, AssignmentMark>();
    list.forEach(m => map.set(m.id, m));
    prepared.forEach(m => map.set(m.id, m));
    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(combined));
  } catch (e) {}

  emitRealtimeEvent('assignment_marks_updated' as any, prepared);
  return prepared;
}

export async function deleteAssignmentMark(id: string): Promise<boolean> {
  try {
    await supabase.from('assignment_marks').delete().eq('id', id);
  } catch (e) {
    console.warn('Supabase delete error:', e);
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list: AssignmentMark[] = JSON.parse(raw);
      const filtered = list.filter(m => m.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {}

  emitRealtimeEvent('assignment_marks_updated' as any, { id, deleted: true });
  return true;
}

export async function deleteBatchAssignmentMarks(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  try {
    await supabase.from('assignment_marks').delete().in('id', ids);
  } catch (e) {
    console.warn('Supabase batch delete error:', e);
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list: AssignmentMark[] = JSON.parse(raw);
      const idSet = new Set(ids);
      const filtered = list.filter(m => !idSet.has(m.id));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {}

  emitRealtimeEvent('assignment_marks_updated' as any, { ids, batchDeleted: true });
  return true;
}
