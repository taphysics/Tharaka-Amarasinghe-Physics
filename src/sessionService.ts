import { StaffMember, Student } from './types';
import { DEFAULT_STUDENTS } from './data';

// 6 Hours Session Lifetime (6 * 60 * 60 * 1000 = 21,600,000 milliseconds)
export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// Storage Keys
const STAFF_SESSION_KEY = 'smart_physics_active_staff';
const STAFF_EXPIRY_KEY = 'smart_physics_staff_expiry';
const LEGACY_STAFF_KEY = 'physics_hub_active_staff_session';

const STUDENT_SESSION_KEY = 'smart_physics_active_student';
const STUDENT_EXPIRY_KEY = 'smart_physics_student_expiry';
const LEGACY_STUDENT_USER_KEY = 'physics_hub_current_student';
const LEGACY_STUDENT_EXPIRY_KEY = 'physics_hub_login_expiry';

const SAVED_ADMIN_TAB_KEY = 'smart_physics_admin_active_tab';
const SAVED_STUDENT_TAB_KEY = 'smart_physics_student_active_tab';

// ============================================================================
// STAFF SESSION MANAGEMENT (Super Admin, Admin, Manager, Lecturer)
// ============================================================================

export function getActiveStaffSession(): StaffMember | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawStaff = localStorage.getItem(STAFF_SESSION_KEY) || sessionStorage.getItem(LEGACY_STAFF_KEY) || localStorage.getItem(LEGACY_STAFF_KEY);
    if (!rawStaff) return null;

    const expiryStr = localStorage.getItem(STAFF_EXPIRY_KEY) || localStorage.getItem(LEGACY_STUDENT_EXPIRY_KEY);
    const now = Date.now();

    // Check 6-hour offline expiration
    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      if (now > expiry) {
        // Expired after 6 hours offline - clean up
        clearStaffSession();
        return null;
      }
    }

    const staff: StaffMember = JSON.parse(rawStaff);
    if (staff && staff.username) {
      // Touch session on active access to reset 6h countdown from current moment
      touchStaffSession();
      return staff;
    }
  } catch (err) {
    console.warn('Error reading staff session:', err);
  }

  return null;
}

export function saveActiveStaffSession(staff: StaffMember | null) {
  if (typeof window === 'undefined') return;

  try {
    if (staff) {
      const now = Date.now();
      const expiry = now + SIX_HOURS_MS;

      const serialized = JSON.stringify(staff);
      localStorage.setItem(STAFF_SESSION_KEY, serialized);
      localStorage.setItem(STAFF_EXPIRY_KEY, expiry.toString());

      // Legacy fallbacks
      localStorage.setItem(LEGACY_STAFF_KEY, serialized);
      sessionStorage.setItem(LEGACY_STAFF_KEY, serialized);
    } else {
      clearStaffSession();
    }
  } catch (err) {
    console.warn('Error saving staff session:', err);
  }
}

export function touchStaffSession() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STAFF_SESSION_KEY);
    if (raw) {
      const newExpiry = Date.now() + SIX_HOURS_MS;
      localStorage.setItem(STAFF_EXPIRY_KEY, newExpiry.toString());
    }
  } catch {}
}

export function clearStaffSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STAFF_SESSION_KEY);
    localStorage.removeItem(STAFF_EXPIRY_KEY);
    localStorage.removeItem(LEGACY_STAFF_KEY);
    sessionStorage.removeItem(LEGACY_STAFF_KEY);
    localStorage.removeItem(SAVED_ADMIN_TAB_KEY);
  } catch {}
}

// Helper to normalize student class types and properties uniformly across entire application
export function normalizeStudent(student: any): any {
  if (!student) return student;
  const classTypesList: string[] = [];
  const rawClasses = student.class_types || student.classTypes || student.class || [];
  if (Array.isArray(rawClasses)) {
    rawClasses.forEach(c => {
      if (typeof c === 'string') {
        const trimmed = c.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) classTypesList.push(...parsed);
            else classTypesList.push(trimmed);
          } catch {
            classTypesList.push(trimmed);
          }
        } else if (trimmed.includes(',')) {
          trimmed.split(',').forEach(sub => classTypesList.push(sub.trim()));
        } else {
          classTypesList.push(trimmed);
        }
      }
    });
  } else if (typeof rawClasses === 'string') {
    const trimmed = rawClasses.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) classTypesList.push(...parsed);
        else classTypesList.push(trimmed);
      } catch {
        classTypesList.push(trimmed);
      }
    } else if (trimmed.includes(',')) {
      trimmed.split(',').forEach(sub => classTypesList.push(sub.trim()));
    } else if (trimmed) {
      classTypesList.push(trimmed);
    }
  }

  const uniqueClasses = Array.from(new Set(classTypesList.map(s => s.trim()).filter(Boolean)));

  return {
    ...student,
    class_types: uniqueClasses,
    classTypes: uniqueClasses,
    class: uniqueClasses[0] || student.class || '',
    is_paid: student.is_paid ?? student.isPaid ?? true,
    isPaid: student.is_paid ?? student.isPaid ?? true,
    free_months: student.free_months || student.freeMonths || [],
    freeMonths: student.free_months || student.freeMonths || [],
    whatsapp: student.whatsapp || student.WhatsApp || student.mobile || '',
    WhatsApp: student.whatsapp || student.WhatsApp || student.mobile || '',
    device_block_until: student.device_block_until ?? student.deviceBlockUntil ?? null,
    deviceBlockUntil: student.device_block_until ?? student.deviceBlockUntil ?? null,
    device_violations_count: Number(student.device_violations_count ?? student.deviceViolationsCount ?? 0),
    deviceViolationsCount: Number(student.device_violations_count ?? student.deviceViolationsCount ?? 0),
    current_device_id: student.current_device_id ?? student.currentDeviceId ?? null,
    currentDeviceId: student.current_device_id ?? student.currentDeviceId ?? null,
    device_info: student.device_info ?? student.deviceInfo ?? null,
    deviceInfo: student.device_info ?? student.deviceInfo ?? null,
  };
}

// ============================================================================
// STUDENT SESSION MANAGEMENT
// ============================================================================

export function getActiveStudentSession(): Student | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawStudent = localStorage.getItem(STUDENT_SESSION_KEY);
    const legacyUser = localStorage.getItem(LEGACY_STUDENT_USER_KEY);
    const expiryStr = localStorage.getItem(STUDENT_EXPIRY_KEY) || localStorage.getItem(LEGACY_STUDENT_EXPIRY_KEY);
    const now = Date.now();

    // Check 6-hour offline expiration
    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      if (now > expiry) {
        // Expired after 6 hours of being offline
        clearStudentSession();
        return null;
      }
    }

    // 1. Try full student object from modern key
    if (rawStudent) {
      const parsed: Student = JSON.parse(rawStudent);
      if (parsed && parsed.username) {
        touchStudentSession();
        return normalizeStudent(parsed);
      }
    }

    // 2. Try legacy username key
    if (legacyUser) {
      const cachedListRaw = localStorage.getItem('physics_hub_students') || localStorage.getItem('cached_students');
      const list: Student[] = cachedListRaw ? JSON.parse(cachedListRaw) : DEFAULT_STUDENTS;
      const found = list.find(s => s.username?.toLowerCase() === legacyUser.toLowerCase());
      if (found) {
        touchStudentSession();
        return normalizeStudent(found);
      }
    }
  } catch (err) {
    console.warn('Error reading student session:', err);
  }

  return null;
}

export function saveActiveStudentSession(student: Student | null) {
  if (typeof window === 'undefined') return;

  try {
    if (student) {
      const normalized = normalizeStudent(student);
      const now = Date.now();
      const expiry = now + SIX_HOURS_MS;

      const serialized = JSON.stringify(normalized);
      localStorage.setItem(STUDENT_SESSION_KEY, serialized);
      localStorage.setItem(STUDENT_EXPIRY_KEY, expiry.toString());

      // Legacy keys
      localStorage.setItem(LEGACY_STUDENT_USER_KEY, normalized.username);
      localStorage.setItem(LEGACY_STUDENT_EXPIRY_KEY, expiry.toString());
    } else {
      clearStudentSession();
    }
  } catch (err) {
    console.warn('Error saving student session:', err);
  }
}

export function touchStudentSession() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY) || localStorage.getItem(LEGACY_STUDENT_USER_KEY);
    if (raw) {
      const newExpiry = Date.now() + SIX_HOURS_MS;
      localStorage.setItem(STUDENT_EXPIRY_KEY, newExpiry.toString());
      localStorage.setItem(LEGACY_STUDENT_EXPIRY_KEY, newExpiry.toString());
    }
  } catch {}
}

export function clearStudentSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    localStorage.removeItem(STUDENT_EXPIRY_KEY);
    localStorage.removeItem(LEGACY_STUDENT_USER_KEY);
    localStorage.removeItem(LEGACY_STUDENT_EXPIRY_KEY);
    localStorage.removeItem(SAVED_STUDENT_TAB_KEY);
  } catch {}
}

// ============================================================================
// TAB / VIEW PERSISTENCE
// ============================================================================

export function getSavedAdminTab(): string {
  if (typeof window === 'undefined') return 'overview';
  try {
    return localStorage.getItem(SAVED_ADMIN_TAB_KEY) || 'overview';
  } catch {
    return 'overview';
  }
}

export function setSavedAdminTab(tab: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_ADMIN_TAB_KEY, tab);
  } catch {}
}

export function getSavedStudentTab(): string {
  if (typeof window === 'undefined') return 'live';
  try {
    return localStorage.getItem(SAVED_STUDENT_TAB_KEY) || 'live';
  } catch {
    return 'live';
  }
}

export function setSavedStudentTab(tab: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_STUDENT_TAB_KEY, tab);
  } catch {}
}
