import { supabase } from './supabaseClient';
import { emitRealtimeEvent } from './realtimeSync';

export interface ClassLecturerShare {
  id?: string;
  class_type: string;
  lecturer_name: string;
  lecturer_whatsapp?: string;
  share_percentage: number;
}

const STORAGE_KEY = 'physics_hub_class_lecturer_shares';

export function getLocalLecturerShares(): ClassLecturerShare[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalLecturerShares(list: ClassLecturerShare[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export async function fetchClassLecturerShares(): Promise<ClassLecturerShare[]> {
  const local = getLocalLecturerShares();
  try {
    const { data, error } = await supabase
      .from('class_lecturer_shares')
      .select('*')
      .order('class_type', { ascending: true });

    if (!error && data && data.length > 0) {
      saveLocalLecturerShares(data);
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch class_lecturer_shares from database:', err);
  }
  return local;
}

export async function saveClassLecturerShares(shares: ClassLecturerShare[]): Promise<boolean> {
  saveLocalLecturerShares(shares);

  try {
    // Delete existing records and re-insert to guarantee consistent percentage split
    await supabase.from('class_lecturer_shares').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (shares.length > 0) {
      const rows = shares.map(s => ({
        class_type: s.class_type,
        lecturer_name: s.lecturer_name,
        lecturer_whatsapp: s.lecturer_whatsapp || '',
        share_percentage: Number(s.share_percentage || 0)
      }));
      await supabase.from('class_lecturer_shares').insert(rows);
    }
    
    emitRealtimeEvent('lecturer_shares_updated', { shares });
    return true;
  } catch (err) {
    console.warn('Error saving class_lecturer_shares to database:', err);
    emitRealtimeEvent('lecturer_shares_updated', { shares });
    return false;
  }
}

// Resolves a lecturer's percentage share for a given class
export function getLecturerShareForClass(
  classType: string,
  lecturerName: string,
  allShares: ClassLecturerShare[]
): number {
  if (!classType || !lecturerName) return 100;
  const cleanClass = classType.trim().toLowerCase();
  const cleanLecturer = lecturerName.trim().toLowerCase();

  const classShares = allShares.filter(s => s.class_type.trim().toLowerCase() === cleanClass);
  if (classShares.length === 0) {
    return 100; // If no split is configured, 100% of revenue goes to the lecturer
  }

  if (classShares.length === 1) {
    return 100; // Only one lecturer teaches this class
  }

  const matching = classShares.find(s => s.lecturer_name.trim().toLowerCase() === cleanLecturer);
  if (matching) {
    return Number(matching.share_percentage || 0);
  }

  // If not found among the shares for this multi-lecturer class
  return 0;
}

export async function getLecturerForClass(classType?: string, currentLecturerName?: string): Promise<string> {
  const fallback = 'තාරක අමරසිංහ (Tharaka Amarasinghe)';
  if (currentLecturerName) {
    const lower = currentLecturerName.toLowerCase().trim();
    if (!lower.includes('admin') && !lower.includes('manager') && !lower.includes('staff') && lower !== '') {
      return currentLecturerName;
    }
  }
  if (!classType) return fallback;

  try {
    const shares = await fetchClassLecturerShares();
    const cleanClass = classType.trim().toLowerCase();
    const match = shares.find(s => {
      const sLower = s.class_type.trim().toLowerCase();
      return sLower === cleanClass || sLower.includes(cleanClass) || cleanClass.includes(sLower);
    });
    if (match && match.lecturer_name && match.lecturer_name.trim() !== '') {
      return match.lecturer_name.trim();
    }
  } catch {}

  return fallback;
}

