import { supabase } from './supabaseClient';
import { emitRealtimeEvent } from './realtimeSync';

export interface DeviceInfo {
  deviceId: string;
  os: string;
  browser: string;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  screenResolution: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

export interface DeviceViolationRecord {
  id: string;
  student_username: string;
  student_name: string;
  strike_count: number;
  blocked_until: string; // ISO date string or 'permanent'
  blocked_at: string;
  reason: string;
  device_info_previous: string;
  device_info_new: string;
  is_active: boolean; // currently blocked?
  warning_notification_shown?: boolean;
  warning_notification_expires_at?: string;
}

export const VIOLATION_LADDER = [
  { strike: 1, durationMs: 2 * 60 * 60 * 1000, label: 'පැය 2යි (2 Hours)' },
  { strike: 2, durationMs: 6 * 60 * 60 * 1000, label: 'පැය 6යි (6 Hours)' },
  { strike: 3, durationMs: 24 * 60 * 60 * 1000, label: 'පැය 24යි (24 Hours)' },
  { strike: 4, durationMs: 3 * 24 * 60 * 60 * 1000, label: 'දින 3යි (3 Days)' },
  { strike: 5, durationMs: 7 * 24 * 60 * 60 * 1000, label: 'සතියයි (7 Days)' },
  { strike: 6, durationMs: 14 * 24 * 60 * 60 * 1000, label: 'සති 2යි (14 Days)' },
  { strike: 7, durationMs: 30 * 24 * 60 * 60 * 1000, label: 'මාසයයි / සදාකාලික (1 Month / Permanent)' },
];

const DEVICE_ID_KEY = 'smart_physics_device_uuid';
const LOCAL_VIOLATIONS_KEY = 'smart_physics_device_violations';
const ACTIVE_SESSIONS_KEY = 'smart_physics_active_device_sessions';

/**
 * Generate or retrieve unique device UUID stored in localStorage
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_instance';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return `dev_fallback_${Date.now()}`;
  }
}

/**
 * Detect Client OS, Browser, Screen and IP/Session
 */
export function getClientDeviceInfo(): DeviceInfo {
  const deviceId = getOrCreateDeviceId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  
  // OS Detection
  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS Apple';
  else if (/linux/i.test(ua)) os = 'Linux';

  // Browser Detection
  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) browser = 'Google Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';

  // Device Type
  let deviceType: 'Mobile' | 'Tablet' | 'Desktop' = 'Desktop';
  if (/mobile/i.test(ua)) deviceType = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet';

  const screenRes = typeof window !== 'undefined' 
    ? `${window.screen.width}x${window.screen.height}` 
    : 'Standard Screen';

  return {
    deviceId,
    os,
    browser,
    deviceType,
    screenResolution: screenRes,
    ipAddress: 'Active Session / IP Network',
    userAgent: ua.substring(0, 160),
    timestamp: new Date().toISOString()
  };
}

export interface FormattedDeviceBadge {
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  os: string;
  browser: string;
  screen?: string;
  ip?: string;
  timestamp?: string;
}

/**
 * Parse any DeviceInfo format into clean structured device badge data
 */
export function parseDeviceBadge(info: DeviceInfo | string | any): FormattedDeviceBadge {
  if (!info) {
    return {
      deviceType: 'Desktop',
      os: 'නොදන්නා OS',
      browser: 'Web Browser'
    };
  }

  let obj = info;
  if (typeof info === 'string') {
    try {
      obj = JSON.parse(info);
    } catch {
      const isMob = /mobile|android|iphone/i.test(info);
      const isTab = /tablet|ipad/i.test(info);
      return {
        deviceType: isMob ? 'Mobile' : isTab ? 'Tablet' : 'Desktop',
        os: info,
        browser: 'Web Browser'
      };
    }
  }

  const rawType = (obj.deviceType || '').toLowerCase();
  const rawOs = (obj.os || '').toLowerCase();
  const rawBrowser = obj.browser || 'Web Browser';

  let deviceType: 'Mobile' | 'Tablet' | 'Desktop' = 'Desktop';
  if (rawType === 'mobile' || /mobile|android|iphone|phone/i.test(rawOs)) {
    deviceType = 'Mobile';
  } else if (rawType === 'tablet' || /tablet|ipad/i.test(rawOs)) {
    deviceType = 'Tablet';
  }

  return {
    deviceType,
    os: obj.os || (deviceType === 'Mobile' ? 'Smart Mobile' : 'Personal Computer'),
    browser: rawBrowser,
    screen: obj.screenResolution,
    ip: obj.ipAddress,
    timestamp: obj.timestamp
  };
}

/**
 * Format DeviceInfo into readable string
 */
export function formatDeviceInfo(info: DeviceInfo | string): string {
  const badge = parseDeviceBadge(info);
  return `${badge.deviceType} • ${badge.os} • ${badge.browser}`;
}

/**
 * Get all stored device violations from localStorage
 */
export function getLocalViolations(): DeviceViolationRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_VIOLATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalViolations(list: DeviceViolationRecord[]) {
  try {
    localStorage.setItem(LOCAL_VIOLATIONS_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Fetch all violations from Supabase, falling back to localStorage
 */
export async function fetchDeviceViolations(): Promise<DeviceViolationRecord[]> {
  try {
    const { data, error } = await supabase
      .from('student_device_violations')
      .select('*')
      .order('blocked_at', { ascending: false });

    if (!error && data && data.length > 0) {
      saveLocalViolations(data);
      return data;
    }
  } catch (e) {
    console.warn('Supabase fetch device violations fallback to localStorage:', e);
  }
  return getLocalViolations();
}

/**
 * Check if a student is currently blocked
 * Robustly checks both snake_case (device_block_until) and camelCase (deviceBlockUntil)
 */
export function isStudentBlocked(student: any): { 
  isBlocked: boolean; 
  remainingMs: number; 
  strike: number; 
  blockedUntil?: string;
  isPermanent: boolean;
} {
  if (!student) return { isBlocked: false, remainingMs: 0, strike: 0, isPermanent: false };

  const blockedUntil = student.device_block_until || student.deviceBlockUntil;
  const strike = Number(student.device_violations_count ?? student.deviceViolationsCount ?? 0);

  if (!blockedUntil) return { isBlocked: false, remainingMs: 0, strike, isPermanent: false };

  if (blockedUntil === 'permanent') {
    return { isBlocked: true, remainingMs: Infinity, strike, blockedUntil: 'permanent', isPermanent: true };
  }

  const expiry = new Date(blockedUntil).getTime();
  const now = Date.now();

  if (isNaN(expiry)) {
    return { isBlocked: false, remainingMs: 0, strike, isPermanent: false };
  }

  if (expiry > now) {
    return {
      isBlocked: true,
      remainingMs: expiry - now,
      strike,
      blockedUntil,
      isPermanent: false
    };
  }

  // Time expired! Account is auto-unblocked.
  return { isBlocked: false, remainingMs: 0, strike, isPermanent: false };
}

/**
 * Calculate progressive ban duration based on strike number
 */
export function getDurationForStrike(strikeNumber: number): { durationMs: number; label: string } {
  const index = Math.min(Math.max(1, strikeNumber), VIOLATION_LADDER.length) - 1;
  return VIOLATION_LADDER[index];
}

/**
 * Helper to update student record across localStorage caches
 */
function updateLocalStudentsCache(
  username: string,
  updates: {
    device_block_until?: string | null;
    deviceBlockUntil?: string | null;
    device_violations_count?: number;
    deviceViolationsCount?: number;
    current_device_id?: string | null;
    currentDeviceId?: string | null;
  },
  studentId?: string
) {
  const uNorm = (username || '').toLowerCase().trim();

  // 1. Update physics_hub_students cache
  try {
    const raw = localStorage.getItem('physics_hub_students');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const updatedList = list.map((st: any) => {
          const matchUser = (st.username || '').toLowerCase().trim() === uNorm;
          const matchId = studentId && String(st.id) === String(studentId);
          if (matchUser || matchId) {
            return { ...st, ...updates };
          }
          return st;
        });
        localStorage.setItem('physics_hub_students', JSON.stringify(updatedList));
      }
    }
  } catch {}

  // 2. Update active student session if matching
  try {
    const raw = localStorage.getItem('smart_physics_active_student');
    if (raw) {
      const active = JSON.parse(raw);
      const matchUser = (active.username || '').toLowerCase().trim() === uNorm;
      const matchId = studentId && String(active.id) === String(studentId);
      if (matchUser || matchId) {
        const updatedActive = { ...active, ...updates };
        localStorage.setItem('smart_physics_active_student', JSON.stringify(updatedActive));
      }
    }
  } catch {}
}

/**
 * Automatically unlock student when countdown timer hits 0
 */
export async function autoUnlockExpiredStudent(username: string, studentId?: string): Promise<void> {
  if (!username) return;
  const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();
  const now = Date.now();
  const warningExpiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const warningPayload = {
    show: true,
    message: 'ඔබගේ ලොගින් ඩීටෙල්ස් වෙනත් පාර්ශවයක් සමග තවදුරටත් බෙදා ගැනීමෙන් වළකින්න. එසේ නැතොත් ඔබගේ ගිණුම ඔබට සදහටම අහිමිවනු ඇත.',
    unblocked_at: new Date(now).toISOString(),
    expires_at: warningExpiresAt
  };

  // 1. Update localStorage active violations
  const local = getLocalViolations();
  const updatedViolations = local.map(v => {
    if (v.student_username?.toLowerCase() === cleanUsername) {
      return { 
        ...v, 
        is_active: false, 
        blocked_until: new Date(0).toISOString(),
        warning_notification_shown: false,
        warning_notification_expires_at: warningExpiresAt
      };
    }
    return v;
  });
  saveLocalViolations(updatedViolations);

  // 2. Clear block from local students caches
  updateLocalStudentsCache(cleanUsername, {
    device_block_until: null,
    deviceBlockUntil: null
  }, studentId);

  try {
    localStorage.setItem(`sp_warning_unblock_${cleanUsername}`, JSON.stringify(warningPayload));
  } catch {}

  // 3. Update Supabase database
  try {
    if (studentId) {
      await supabase.from('students').update({ 
        device_block_until: null,
        warning_notification: warningPayload
      }).eq('id', studentId);
    }
    await supabase.from('students').update({ 
      device_block_until: null,
      warning_notification: warningPayload
    }).ilike('username', cleanUsername);
  } catch (e) {
    console.warn('Supabase auto-unlock student failed:', e);
  }

  try {
    await supabase.from('student_device_violations')
      .update({ 
        is_active: false, 
        blocked_until: new Date(0).toISOString(),
        warning_notification_shown: false,
        warning_notification_expires_at: warningExpiresAt
      })
      .or(`student_username.ilike.${cleanUsername},student_username.ilike.@${cleanUsername}`);
  } catch (e) {}

  // 4. Emit realtime event
  emitRealtimeEvent('student_updated', { username: cleanUsername, unblocked: true });
  emitRealtimeEvent('device_violation_updated');
}

/**
 * Handle new student login, detect concurrent multi-device logins,
 * log violations, apply progressive sequential bans, and broadcast 5s countdown force-logout to the old device.
 */
export async function registerDeviceLogin(student: any): Promise<{
  isConcurrent: boolean;
  oldDeviceId?: string;
  strikeCount: number;
  isBlocked: boolean;
  blockedUntil?: string;
}> {
  if (!student || !student.username) {
    return { isConcurrent: false, strikeCount: 0, isBlocked: false };
  }

  const currentDevice = getClientDeviceInfo();
  const currentDeviceId = currentDevice.deviceId;
  const username = student.username.replace(/^@/, '').toLowerCase().trim();

  // 1. Check existing active session across Supabase and localStorage
  let previousSession: DeviceInfo | null = null;
  let previousDeviceId: string | null = null;

  try {
    const rawLocal = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    if (rawLocal) {
      const map = JSON.parse(rawLocal);
      if (map[username]) {
        previousSession = map[username];
        previousDeviceId = map[username].deviceId;
      }
    }
  } catch {}

  // Query Supabase student_active_sessions for cross-device/cross-browser awareness
  try {
    const { data: dbSession } = await supabase
      .from('student_active_sessions')
      .select('*')
      .or(`student_username.ilike.${username},student_username.ilike.@${username}`)
      .maybeSingle();

    if (dbSession && dbSession.device_id) {
      previousDeviceId = dbSession.device_id;
      if (dbSession.device_info) {
        previousSession = typeof dbSession.device_info === 'string'
          ? JSON.parse(dbSession.device_info)
          : dbSession.device_info;
      }
    }
  } catch (e) {}

  // Fallback to student record in database
  if (!previousDeviceId && (student.current_device_id || student.currentDeviceId)) {
    previousDeviceId = student.current_device_id || student.currentDeviceId;
    if (student.device_info || student.deviceInfo) {
      try {
        const raw = student.device_info || student.deviceInfo;
        previousSession = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {}
    }
  }

  // A concurrent multi-device attempt occurs when a different device was already active
  const isConcurrent = Boolean(previousDeviceId && previousDeviceId !== currentDeviceId);

  // 2. Sequential strike calculation: Query database and student record
  let currentStrikes = Number(student.device_violations_count ?? student.deviceViolationsCount ?? 0);
  try {
    const { data: existingViols } = await supabase
      .from('student_device_violations')
      .select('strike_count')
      .or(`student_username.ilike.${username},student_username.ilike.@${username}`);
    
    if (existingViols && existingViols.length > 0) {
      const maxDbStrike = Math.max(...existingViols.map(v => Number(v.strike_count) || 0));
      currentStrikes = Math.max(currentStrikes, maxDbStrike);
    }
  } catch (e) {}

  let newStrikeCount = currentStrikes;
  let newBlockedUntil = student.device_block_until || student.deviceBlockUntil;

  // Check if student has admin permission for 2 devices
  const isDualDeviceAllowed = Boolean(
    student.dual_device_allowed ?? 
    student.dualDeviceAllowed ?? 
    student.is_dual_device_allowed ?? 
    false
  );

  if (isConcurrent) {
    const newDeviceFormatted = formatDeviceInfo(currentDevice);
    const prevDeviceFormatted = previousSession 
      ? formatDeviceInfo(previousSession) 
      : 'පෙර ලොග් වූ ඩිවයිස් (Previous Session)';

    if (isDualDeviceAllowed) {
      // DUAL DEVICE PERMITTED:
      // The student has approved permission to use 2 devices.
      // Switching devices is allowed without strikes or account ban!
      // Immediately force-logout the previous device with 5-second countdown.
      const logoutPayload = {
        username,
        targetDeviceId: previousDeviceId,
        countdownSeconds: 5,
        newDevice: newDeviceFormatted,
        isDualDeviceSwitch: true,
        message: `මෙම මොහොතේ ඔබගේ (${newDeviceFormatted}) ලොග්වී ඇති බැවින් ඔබව මෙම Device එකෙන් Logout කරේ`
      };

      emitRealtimeEvent('device_force_logout' as any, logoutPayload);

      try {
        const channel = supabase.channel('student_device_security');
        channel.send({
          type: 'broadcast',
          event: 'force_logout',
          payload: logoutPayload
        });
      } catch {}

      // Update student active device without penalty
      updateLocalStudentsCache(username, {
        current_device_id: currentDeviceId,
        currentDeviceId: currentDeviceId
      }, student.id);

      try {
        const updateData = {
          current_device_id: currentDeviceId,
          device_info: JSON.stringify(currentDevice)
        };
        if (student.id) {
          await supabase.from('students').update(updateData).eq('id', student.id);
        }
        await supabase.from('students').update(updateData).ilike('username', username);
      } catch (e) {}

    } else {
      // VIOLATION DETECTED: Sequential strike increment (+1)
      newStrikeCount = currentStrikes + 1;
      const ladderStep = getDurationForStrike(newStrikeCount);
      newBlockedUntil = new Date(Date.now() + ladderStep.durationMs).toISOString();

      const violationRecord: DeviceViolationRecord = {
        id: `viol_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        student_username: username,
        student_name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || username,
        strike_count: newStrikeCount,
        blocked_until: newBlockedUntil,
        blocked_at: new Date().toISOString(),
        reason: `සිසුවා එකවර ඩිවයිස් 2කින් ලොග් විය. (Strike ${newStrikeCount}: ${ladderStep.label} තහනමක් ක්‍රියාත්මක විය)`,
        device_info_previous: JSON.stringify(previousSession || { os: 'Previous Device', browser: 'Browser', deviceType: 'Desktop' }),
        device_info_new: JSON.stringify(currentDevice),
        is_active: true,
        warning_notification_shown: false,
        warning_notification_expires_at: new Date(Date.now() + ladderStep.durationMs + 24 * 60 * 60 * 1000).toISOString()
      };

      // Save violation locally
      const currentViolations = getLocalViolations();
      saveLocalViolations([violationRecord, ...currentViolations]);

      // Update local cache
      updateLocalStudentsCache(username, {
        device_violations_count: newStrikeCount,
        deviceViolationsCount: newStrikeCount,
        device_block_until: newBlockedUntil,
        deviceBlockUntil: newBlockedUntil,
        current_device_id: currentDeviceId,
        currentDeviceId: currentDeviceId
      }, student.id);

      // Upsert into Supabase student_device_violations
      try {
        await supabase.from('student_device_violations').insert([violationRecord]);
      } catch (e) {
        console.warn('Supabase insert violation failed, using local:', e);
      }

      // Update student in Supabase
      try {
        const updateData = {
          device_violations_count: newStrikeCount,
          device_block_until: newBlockedUntil,
          current_device_id: currentDeviceId,
          device_info: JSON.stringify(currentDevice)
        };

        if (student.id) {
          await supabase.from('students').update(updateData).eq('id', student.id);
        }
        await supabase.from('students').update(updateData).ilike('username', username);
      } catch (e) {}

      // Broadcast force-logout with 5-second countdown to the old device
      const logoutPayload = {
        username,
        targetDeviceId: previousDeviceId,
        countdownSeconds: 5,
        strikeCount: newStrikeCount,
        blockedUntil: newBlockedUntil,
        newDevice: newDeviceFormatted,
        isDualDeviceSwitch: false,
        message: `මෙම මොහොතේ ඔබගේ (${newDeviceFormatted}) ලොග්වී ඇති බැවින් ඔබව මෙම Device එකෙන් Logout කරේ`
      };

      emitRealtimeEvent('device_force_logout' as any, logoutPayload);

      try {
        const channel = supabase.channel('student_device_security');
        channel.send({
          type: 'broadcast',
          event: 'force_logout',
          payload: logoutPayload
        });
      } catch {}
    }
  }

  // Update current active session in Supabase & LocalStorage
  try {
    const rawLocal = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    const activeSessions = rawLocal ? JSON.parse(rawLocal) : {};
    activeSessions[username] = currentDevice;
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
  } catch {}

  try {
    await supabase.from('student_active_sessions').upsert({
      student_username: username,
      device_id: currentDeviceId,
      device_info: currentDevice,
      last_seen: new Date().toISOString()
    });
  } catch {}

  // Save latest device info on student
  try {
    const updateData = {
      current_device_id: currentDeviceId,
      device_info: JSON.stringify(currentDevice)
    };
    if (student.id) {
      await supabase.from('students').update(updateData).eq('id', student.id);
    }
    await supabase.from('students').update(updateData).ilike('username', username);
  } catch {}

  return {
    isConcurrent,
    oldDeviceId: previousDeviceId || undefined,
    strikeCount: newStrikeCount,
    isBlocked: Boolean(newBlockedUntil && (newBlockedUntil === 'permanent' || new Date(newBlockedUntil).getTime() > Date.now())),
    blockedUntil: newBlockedUntil
  };
}

/**
 * Clear student device session on logout so legitimate device changes are not penalized
 */
export async function clearStudentDeviceSession(username: string): Promise<void> {
  if (!username) return;
  const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();

  try {
    const raw = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      delete map[cleanUsername];
      localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(map));
    }
  } catch {}

  try {
    await supabase.from('student_active_sessions')
      .delete()
      .or(`student_username.ilike.${cleanUsername},student_username.ilike.@${cleanUsername}`);
    await supabase.from('students')
      .update({ current_device_id: null })
      .ilike('username', cleanUsername);
  } catch (e) {}
}

/**
 * Check & retrieve 24-hour warning notification for unblocked accounts.
 * Automatically deletes itself from the database table after 24 hours!
 */
export function getUnblockWarningNotification(student: any): { show: boolean; message: string; remainingHours: number } | null {
  if (!student) return null;

  // If currently blocked, do not show unblock notification
  const { isBlocked } = isStudentBlocked(student);
  if (isBlocked) return null;

  const strikeCount = Number(student.device_violations_count ?? student.deviceViolationsCount ?? 0);
  if (strikeCount === 0) return null;

  const username = (student.username || '').replace(/^@/, '').toLowerCase().trim();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // 1. Check warning_notification from database or local storage
  let warningData = student.warning_notification || student.warningNotification;
  if (!warningData && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`sp_warning_unblock_${username}`);
      if (raw) warningData = JSON.parse(raw);
    } catch {}
  }

  let expiresAtMs = 0;
  if (warningData && warningData.expires_at) {
    expiresAtMs = new Date(warningData.expires_at).getTime();
  } else {
    const timeKey = `sp_unblock_notification_${username}_${strikeCount}`;
    let startTime = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(timeKey)) : 0;
    if (!startTime) {
      startTime = Date.now();
      try {
        localStorage.setItem(timeKey, String(startTime));
      } catch {}
    }
    expiresAtMs = startTime + TWENTY_FOUR_HOURS;
  }

  const now = Date.now();
  if (now >= expiresAtMs) {
    // 24 HOURS ELAPSED: Auto-delete warning from database table and local storage!
    try {
      localStorage.removeItem(`sp_warning_unblock_${username}`);
      localStorage.removeItem(`sp_unblock_notification_${username}_${strikeCount}`);
      supabase.from('students').update({ warning_notification: null }).ilike('username', username).then();
      supabase.from('student_device_violations')
        .update({ warning_notification_shown: true })
        .or(`student_username.ilike.${username},student_username.ilike.@${username}`).then();
    } catch {}
    return null;
  }

  const remainingMs = expiresAtMs - now;
  const remainingHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));

  return {
    show: true,
    message: warningData?.message || 'ඔබගේ ලොගින් ඩීටෙල්ස් වෙනත් පාර්ශවයක් සමග තවදුරටත් බෙදා ගැනීමෙන් වළකින්න. එසේ නැතොත් ඔබගේ ගිණුම ඔබට සදහටම අහිමිවනු ඇත.',
    remainingHours
  };
}

/**
 * Dismiss unblock notification (kept for interface compatibility)
 */
export function dismissUnblockNotification(username: string, strike: number) {
  // Handled automatically via 24h database expiration
}

/**
 * Super Admin: Manually block student for custom duration
 */
export async function adminManualBlockStudent(
  username: string, 
  studentName: string,
  durationOption: '2h' | '6h' | '24h' | '3d' | '1w' | '2w' | '1mo' | 'permanent',
  studentId?: string,
  currentStrike: number = 0
): Promise<{ success: boolean; error?: string; blockedUntil: string }> {
  const durationMap: Record<string, { ms: number; label: string }> = {
    '2h': { ms: 2 * 60 * 60 * 1000, label: 'පැය 2යි (2 Hours)' },
    '6h': { ms: 6 * 60 * 60 * 1000, label: 'පැය 6යි (6 Hours)' },
    '24h': { ms: 24 * 60 * 60 * 1000, label: 'පැය 24යි (24 Hours)' },
    '3d': { ms: 3 * 24 * 60 * 60 * 1000, label: 'දින 3යි (3 Days)' },
    '1w': { ms: 7 * 24 * 60 * 60 * 1000, label: 'සතියයි (1 Week)' },
    '2w': { ms: 14 * 24 * 60 * 60 * 1000, label: 'සති 2යි (2 Weeks)' },
    '1mo': { ms: 30 * 24 * 60 * 60 * 1000, label: 'මාසයයි (1 Month)' },
    'permanent': { ms: Infinity, label: 'සදාකාලික තහනම (Permanent Block)' }
  };

  const cleanUsername = username.replace(/^@/, '').trim();
  const choice = durationMap[durationOption] || durationMap['24h'];
  const blockedUntil = durationOption === 'permanent' 
    ? 'permanent' 
    : new Date(Date.now() + choice.ms).toISOString();

  const newStrikeCount = currentStrike > 0 ? currentStrike : 1;

  // 1. Create violation record
  const record: DeviceViolationRecord = {
    id: `admin_block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    student_username: cleanUsername,
    student_name: studentName,
    strike_count: newStrikeCount,
    blocked_until: blockedUntil,
    blocked_at: new Date().toISOString(),
    reason: `ඇඩ්මින් විසින් නිකුත් කළ නියෝගය: ${choice.label}`,
    device_info_previous: 'Admin Manual Action',
    device_info_new: 'Admin Manual Action',
    is_active: true
  };

  // 2. Save violation locally
  const local = getLocalViolations();
  saveLocalViolations([record, ...local.filter(v => v.student_username?.toLowerCase() !== cleanUsername.toLowerCase())]);

  // 3. Update local caches immediately
  updateLocalStudentsCache(cleanUsername, {
    device_block_until: blockedUntil,
    deviceBlockUntil: blockedUntil,
    device_violations_count: newStrikeCount,
    deviceViolationsCount: newStrikeCount
  }, studentId);

  // 4. Update Supabase database
  let dbError: string | null = null;
  try {
    const { error: violErr } = await supabase.from('student_device_violations').insert([record]);
    if (violErr) {
      console.warn('Supabase violation insert error:', violErr);
      dbError = violErr.message;
    }

    const updatePayload = {
      device_block_until: blockedUntil,
      device_violations_count: newStrikeCount
    };

    let stdErr = null;
    if (studentId) {
      const resId = await supabase.from('students').update(updatePayload).eq('id', studentId);
      if (resId.error) stdErr = resId.error;
    }

    const resUser = await supabase.from('students').update(updatePayload).ilike('username', cleanUsername);
    if (resUser.error && !stdErr) stdErr = resUser.error;

    if (stdErr) {
      console.error('Supabase students update error:', stdErr);
      dbError = dbError ? `${dbError}; ${stdErr.message}` : stdErr.message;
    }
  } catch (err: any) {
    dbError = err?.message || String(err);
  }

  // 5. Emit realtime update
  emitRealtimeEvent('student_updated', { username: cleanUsername, blockedUntil });
  emitRealtimeEvent('device_violation_updated');

  return { 
    success: !dbError, 
    error: dbError || undefined, 
    blockedUntil 
  };
}

/**
 * Super Admin: Instant unblock student
 */
export async function adminInstantUnblockStudent(
  username: string,
  studentId?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanUsername = username.replace(/^@/, '').trim();
  const uNorm = cleanUsername.toLowerCase();

  // 1. Update local violations
  const local = getLocalViolations();
  const updated = local.map(v => {
    if (v.student_username?.toLowerCase() === uNorm) {
      return { ...v, is_active: false, blocked_until: new Date(0).toISOString() };
    }
    return v;
  });
  saveLocalViolations(updated);

  // 2. Clear block from local caches
  updateLocalStudentsCache(cleanUsername, {
    device_block_until: null,
    deviceBlockUntil: null
  }, studentId);

  // 3. Update Supabase database
  let dbError: string | null = null;
  try {
    if (studentId) {
      const resId = await supabase.from('students').update({ device_block_until: null }).eq('id', studentId);
      if (resId.error) dbError = resId.error.message;
    }

    const resUser = await supabase.from('students').update({ device_block_until: null }).ilike('username', cleanUsername);
    if (resUser.error && !dbError) dbError = resUser.error.message;

    const resViol = await supabase.from('student_device_violations')
      .update({ is_active: false, blocked_until: new Date(0).toISOString() })
      .ilike('student_username', cleanUsername);
    if (resViol.error && !dbError) dbError = resViol.error.message;
  } catch (err: any) {
    dbError = err?.message || String(err);
  }

  // 4. Emit realtime update
  emitRealtimeEvent('student_updated', { username: cleanUsername, unblocked: true });
  emitRealtimeEvent('device_violation_updated');

  return { success: !dbError, error: dbError || undefined };
}

/**
 * Super Admin: Clear violation history & reset strike count to 0
 */
export async function adminClearViolationHistory(
  username: string,
  studentId?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanUsername = username.replace(/^@/, '').trim();
  const uNorm = cleanUsername.toLowerCase();

  // 1. Remove from local violations
  const local = getLocalViolations();
  const filtered = local.filter(v => v.student_username?.toLowerCase() !== uNorm);
  saveLocalViolations(filtered);

  // 2. Remove active sessions & warning state
  try {
    const rawSessions = localStorage.getItem(ACTIVE_SESSIONS_KEY);
    if (rawSessions) {
      const map = JSON.parse(rawSessions);
      delete map[uNorm];
      localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(map));
    }
  } catch {}

  // 3. Reset in local caches
  updateLocalStudentsCache(cleanUsername, {
    device_violations_count: 0,
    deviceViolationsCount: 0,
    device_block_until: null,
    deviceBlockUntil: null,
    current_device_id: null,
    currentDeviceId: null
  }, studentId);

  // 4. Reset in Supabase database
  let dbError: string | null = null;
  try {
    const resetPayload = {
      device_violations_count: 0,
      device_block_until: null,
      current_device_id: null
    };

    if (studentId) {
      const resId = await supabase.from('students').update(resetPayload).eq('id', studentId);
      if (resId.error) {
        await supabase.from('students').update({
          device_violations_count: 0,
          device_block_until: null
        }).eq('id', studentId);
      }
    }

    const resUser = await supabase.from('students').update(resetPayload).ilike('username', cleanUsername);
    if (resUser.error) {
      await supabase.from('students').update({
        device_violations_count: 0,
        device_block_until: null
      }).ilike('username', cleanUsername);
    }

    // Delete violations for both cleanUsername and @cleanUsername
    const resViol = await supabase.from('student_device_violations')
      .delete()
      .or(`student_username.ilike.${cleanUsername},student_username.ilike.@${cleanUsername}`);
    
    // Also mark inactive and 0 strikes as fallback
    try {
      await supabase.from('student_device_violations')
        .update({ strike_count: 0, is_active: false, blocked_until: new Date(0).toISOString() })
        .or(`student_username.ilike.${cleanUsername},student_username.ilike.@${cleanUsername}`);
    } catch {}

    try {
      await supabase.from('student_active_sessions')
        .delete()
        .or(`student_username.ilike.${cleanUsername},student_username.ilike.@${cleanUsername}`);
    } catch {}
  } catch (err: any) {
    dbError = err?.message || String(err);
  }

  // 5. Emit realtime update
  emitRealtimeEvent('student_updated', { username: cleanUsername, reset: true });
  emitRealtimeEvent('device_violation_updated');

  return { success: !dbError, error: dbError || undefined };
}
