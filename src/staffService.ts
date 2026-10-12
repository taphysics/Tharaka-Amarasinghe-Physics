import { supabase } from './supabaseClient';
import { StaffMember, StaffRole } from './types';
import { broadcastRealtimeEvent } from './realtimeSync';

// Helper to hash passwords using standard browser Crypto Web API (SHA-256)
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText) return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  try {
    if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
      const encoder = new TextEncoder();
      const data = encoder.encode(plainText);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const res = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      if (res) return res;
    }
  } catch (err) {
    console.warn('Crypto API hashing failed, fallback to hex hash:', err);
  }
  let hash = 0;
  for (let i = 0; i < plainText.length; i++) {
    const char = plainText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).repeat(8).slice(0, 64);
}

// Helper to verify passwords against stored hash or plain fallback
export async function verifyPassword(plainText: string, storedHashOrPlain: string): Promise<boolean> {
  if (!plainText || !storedHashOrPlain) return false;
  if (plainText === storedHashOrPlain) return true;
  const computedHash = await hashPassword(plainText);
  return computedHash === storedHashOrPlain;
}

// Generate auto credentials based on User Specification:
// Username: NIC number
// Password: Last 2 digits of WhatsApp number + Last 2 digits of Mobile number
export function generateAutoCredentials(nic: string, whatsapp: string, mobile: string): { username: string; password: string } {
  const cleanNic = (nic || '').trim();
  const cleanWa = (whatsapp || '').replace(/\D/g, '');
  const cleanMob = (mobile || '').replace(/\D/g, '');

  const waLast2 = cleanWa.length >= 2 ? cleanWa.slice(-2) : '00';
  const mobLast2 = cleanMob.length >= 2 ? cleanMob.slice(-2) : '28';

  const autoPassword = `${waLast2}${mobLast2}`;
  return {
    username: cleanNic,
    password: autoPassword
  };
}

// Cache keys
const STAFF_CACHE_KEY = 'physics_hub_staff_members_cache';
const ACTIVE_STAFF_KEY = 'physics_hub_active_staff';

function getStaffFromCache(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STAFF_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStaffToCache(staff: StaffMember[]) {
  try {
    localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(staff));
  } catch (err) {
    console.warn('Failed to save staff cache:', err);
  }
}

import { 
  getActiveStaffSession, 
  saveActiveStaffSession, 
  clearStaffSession, 
  touchStaffSession 
} from './sessionService';

export { 
  getActiveStaffSession, 
  saveActiveStaffSession, 
  clearStaffSession, 
  touchStaffSession 
};


export const DEFAULT_SUPERADMIN: StaffMember = {
  id: 'stf_superadmin_master',
  role: 'super_admin',
  username: 'superadmin',
  password: 'dsDANUSHKAds*18223',
  password_hash: 'c8258f8f937d6324090a8755088c630ec06b97e3e5d4745c4dda76acc6bcb1ab', // SHA-256 for dsDANUSHKAds*18223
  first_name: 'Chief Super',
  last_name: 'Admin',
  nic: 'MASTER_ADMIN',
  whatsapp: '0779630100',
  mobile: '0719152128',
  title: 'System Owner & Super Admin',
  assigned_classes: [],
  allowed_sections: ['registry', 'manual_student', 'staff', 'resets', 'payments', 'pending_payments', 'bank_accounts', 'history', 'finance', 'qr_generator', 'site_configs', 'planner', 'live_classes', 'resources', 'tutes', 'broadcast'],
  delete_pin: 'DHANUSHKA18223',
  is_blocked: false,
  created_at: new Date().toISOString()
};

// Authenticate staff member by querying database
export async function authenticateStaff(
  username: string, 
  plainPass: string
): Promise<{ success: boolean; staff?: StaffMember; error?: string }> {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = plainPass.trim();

  if (!cleanUser || !cleanPass) {
    return { success: false, error: 'කරුණාකර පරිශීලක නාමය සහ මුරපදය ඇතුළත් කරන්න.' };
  }

  try {
    // 1. Query Supabase staff_members table directly
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .ilike('username', cleanUser)
      .maybeSingle();

    if (error) {
      console.warn('Supabase staff_members query note:', error.message);
    }

    if (data) {
      if (data.is_blocked) {
        return { 
          success: false, 
          error: 'මෙම ගිණුම තාවකාලිකව අක්‍රීය (Blocked) කර ඇත. කරුණාකර Super Admin අමතන්න.' 
        };
      }

      // Verify password (hash or plain fallback)
      const storedHash = data.password_hash || data.password;
      const isValid = await verifyPassword(cleanPass, storedHash);

      if (isValid) {
        saveActiveStaffSession(data as StaffMember);
        return { success: true, staff: data as StaffMember };
      }
    } else if (cleanUser === 'superadmin' || cleanUser === 'admin') {
      // If table is newly created or unseeded in Supabase, provision master admin into DB
      try {
        await supabase.from('staff_members').upsert([DEFAULT_SUPERADMIN], { onConflict: 'username' });
      } catch (upsertErr) {
        console.warn('Staff auto-seed note:', upsertErr);
      }

      // Verify against master credentials
      const masterHash = 'c8258f8f937d6324090a8755088c630ec06b97e3e5d4745c4dda76acc6bcb1ab';
      const inputHash = await hashPassword(cleanPass);
      if (inputHash === masterHash || cleanPass === 'dsDANUSHKAds*18223') {
        saveActiveStaffSession(DEFAULT_SUPERADMIN);
        return { success: true, staff: DEFAULT_SUPERADMIN };
      }
    }
  } catch (err) {
    console.error('Staff auth database check error:', err);
  }

  // 2. Check local fallback cache
  const cachedList = getStaffFromCache();
  const foundInCache = cachedList.find(s => s.username.toLowerCase() === cleanUser);
  if (foundInCache) {
    if (foundInCache.is_blocked) {
      return { 
        success: false, 
        error: 'මෙම ගිණුම තාවකාලිකව අක්‍රීය කර ඇත. කරුණාකර Super Admin අමතන්න.' 
      };
    }
    const storedHash = foundInCache.password_hash || foundInCache.password || '';
    const isValid = await verifyPassword(cleanPass, storedHash);
    if (isValid) {
      saveActiveStaffSession(foundInCache);
      return { success: true, staff: foundInCache };
    }
  }

  // 3. Fallback verification for master superadmin
  if (cleanUser === 'superadmin' || cleanUser === 'admin') {
    const masterHash = 'c8258f8f937d6324090a8755088c630ec06b97e3e5d4745c4dda76acc6bcb1ab';
    const inputHash = await hashPassword(cleanPass);
    if (inputHash === masterHash || cleanPass === 'dsDANUSHKAds*18223') {
      saveActiveStaffSession(DEFAULT_SUPERADMIN);
      return { success: true, staff: DEFAULT_SUPERADMIN };
    }
  }

  return { success: false, error: 'පරිශීලක නාමය (Username) හෝ මුරපදය (Password) වැරදියි.' };
}

// Verify delete confirmation PIN against database and active session
export async function verifyDeletePin(inputPin: string): Promise<boolean> {
  const cleanPin = (inputPin || '').trim();
  if (!cleanPin) return false;
  const upperPin = cleanPin.toUpperCase();

  // Master override passwords for system owner / Super Admin
  if (upperPin === 'DANUSHKA18223' || upperPin === 'DHANUSHKA18223') {
    return true;
  }

  // 1. Check from active staff session
  const activeStaff = getActiveStaffSession();
  if (activeStaff && activeStaff.delete_pin) {
    const staffPin = activeStaff.delete_pin.trim().toUpperCase();
    if (staffPin === upperPin || 
        (upperPin === 'DANUSHKA18223' && staffPin === 'DHANUSHKA18223') ||
        (upperPin === 'DHANUSHKA18223' && staffPin === 'DANUSHKA18223')) {
      return true;
    }
  }

  // 2. Query Supabase staff_members table
  try {
    const { data } = await supabase
      .from('staff_members')
      .select('delete_pin')
      .eq('role', 'super_admin')
      .maybeSingle();

    if (data && data.delete_pin) {
      const dbPin = data.delete_pin.trim().toUpperCase();
      if (dbPin === upperPin || 
          (upperPin === 'DANUSHKA18223' && dbPin === 'DHANUSHKA18223') ||
          (upperPin === 'DHANUSHKA18223' && dbPin === 'DANUSHKA18223')) {
        return true;
      }
    }
  } catch (err) {
    console.warn('DB delete pin query check error:', err);
  }

  return false;
}

// Fetch all staff members (or filtered by role)
export async function fetchAllStaff(filterRole?: StaffRole): Promise<StaffMember[]> {
  try {
    let query = supabase.from('staff_members').select('*').order('created_at', { ascending: false });
    if (filterRole) {
      query = query.eq('role', filterRole);
    }
    const { data, error } = await query;

    if (!error && data) {
      saveStaffToCache(data as StaffMember[]);
      return data as StaffMember[];
    }
  } catch (err) {
    console.warn('Fetch staff Supabase error:', err);
  }

  // Local fallback
  const cached = getStaffFromCache();
  if (filterRole) {
    return cached.filter(s => s.role === filterRole);
  }
  return cached;
}

// Create new staff member
export async function createStaffMember(
  staff: Omit<StaffMember, 'id' | 'created_at' | 'updated_at'>,
  plainPassword: string
): Promise<{ success: boolean; data?: StaffMember; error?: string }> {
  try {
    const hashed = await hashPassword(plainPassword);
    const newId = `stf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const record: StaffMember = {
      ...staff,
      id: newId,
      password: plainPassword,
      password_hash: hashed,
      created_at: nowIso,
      updated_at: nowIso,
      is_blocked: false
    };

    // 1. Check if username already exists in Supabase
    const { data: existingUser } = await supabase
      .from('staff_members')
      .select('id, username')
      .ilike('username', staff.username.trim())
      .maybeSingle();

    if (existingUser) {
      return { 
        success: false, 
        error: `"${staff.username}" නමින් කාර්යමණ්ඩල ගිණුමක් දැනටමත් පවතී. කරුණාකර වෙනත් Username හෝ NIC අංකයක් භාවිතා කරන්න.` 
      };
    }

    // 2. Save to Supabase
    const { data, error } = await supabase
      .from('staff_members')
      .insert([record])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Could not insert to Supabase staff_members table:', error);
      return { 
        success: false, 
        error: 'දත්ත ගබඩාවට එක්කිරීම අසාර්ථක විය: ' + (error.message || 'Database error') 
      };
    }

    // Save to local cache
    const existing = getStaffFromCache();
    const updatedList = [record, ...existing.filter(s => s.username !== record.username)];
    saveStaffToCache(updatedList);

    broadcastRealtimeEvent('staff_updated');
    return { success: true, data: (data as StaffMember) || record };
  } catch (err: any) {
    console.error('Error creating staff member:', err);
    return { success: false, error: err.message || 'කාර්යමණ්ඩල ගිණුම සෑදීම අසාර්ථක විය.' };
  }
}

// Update staff member
export async function updateStaffMember(
  id: string, 
  updates: Partial<StaffMember>, 
  newPlainPassword?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = { ...updates, updated_at: new Date().toISOString() };
    if (newPlainPassword) {
      payload.password = newPlainPassword;
      payload.password_hash = await hashPassword(newPlainPassword);
    }

    const { error } = await supabase
      .from('staff_members')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Could not update in Supabase staff_members:', error);
      return { success: false, error: 'යාවත්කාලීන කිරීම අසාර්ථක විය: ' + (error.message || 'Database error') };
    }

    // Update cache
    const existing = getStaffFromCache();
    const updatedList = existing.map(s => s.id === id ? { ...s, ...payload } : s);
    saveStaffToCache(updatedList);

    broadcastRealtimeEvent('staff_updated');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Delete staff member
export async function deleteStaffMember(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('staff_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Could not delete from Supabase staff_members:', error.message);
    }

    const existing = getStaffFromCache();
    const updatedList = existing.filter(s => s.id !== id);
    saveStaffToCache(updatedList);

    broadcastRealtimeEvent('staff_updated');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Toggle block/unblock staff member
export async function toggleBlockStaffMember(id: string, is_blocked: boolean): Promise<{ success: boolean; error?: string }> {
  return updateStaffMember(id, { is_blocked });
}

// Generate friendly WhatsApp message with login details and delete PIN
export function generateWhatsAppCredentialsMessage(
  staff: StaffMember, 
  plainPassword: string,
  loginUrl?: string
): string {
  const roleNameMap: Record<StaffRole, string> = {
    super_admin: 'Super Admin (ප්‍රධාන පරිපාලක)',
    admin: 'Admin (පරිපාලක)',
    manager: 'Manager (කළමනාකරු)',
    lecturer: 'Lecturer (දේශක)'
  };

  const portalLink = loginUrl || window.location.origin;

  let msg = `🏛️ *Smart Physics LMS - නිල ගිණුම් තොරතුරු*\n\n`;
  msg += `ආයුබෝවන් *${staff.first_name} ${staff.last_name}*,\n`;
  msg += `ඔබව Smart Physics පද්ධතියේ *${roleNameMap[staff.role]}* තනතුර සඳහා සාර්ථකව ලියාපදිංචි කරන ලදී.\n\n`;
  msg += `📌 *පිවිසුම් තොරතුරු (Login Credentials):*\n`;
  msg += `▫️ *Username (NIC):* \`${staff.username}\`\n`;
  msg += `▫️ *Password:* \`${plainPassword}\`\n`;

  if (staff.delete_pin) {
    msg += `▫️ *Action Delete PIN:* \`${staff.delete_pin}\` (අයිතම මකාදැමීම තහවුරු කිරීමට)\n`;
  }

  if (staff.assigned_classes && staff.assigned_classes.length > 0) {
    msg += `▫️ *අදාළ පන්ති වර්ග:* ${staff.assigned_classes.join(', ')}\n`;
  }

  msg += `\n🌐 *Portal Link:* ${portalLink}\n\n`;
  msg += `🔒 *සටහන:* ඔබගේ ආරක්ෂාව වෙනුවෙන් මෙම තොරතුරු කිසිවෙකු සමඟ බෙදා නොගන්න.\nSmart Physics Digital Support`;

  return msg;
}
