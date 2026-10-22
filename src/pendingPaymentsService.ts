import { supabase } from './supabaseClient';
import { emitRealtimeEvent } from './realtimeSync';

export interface PendingPaymentRequest {
  id: string;
  student_id: string;
  username: string;
  student_name: string;
  whatsapp: string;
  class_type: string;
  amount: number;
  payment_method: 'bank' | 'qr';
  transaction_id: string;
  status: 'pending' | 'approved' | 'rejected';
  month: string;
  created_at: string;
  reviewed_at?: string;
  note?: string;
  admin_notes?: string;
}

const STORAGE_KEY = 'physics_hub_pending_payments';

export function getLocalPendingPayments(): PendingPaymentRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveLocalPendingPayments(list: PendingPaymentRequest[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

// User Requirement:
// Auto-delete rejected and approved payments from `pending_payments` table 29 days after review/creation.
// NOTE: This does NOT delete student payment records from `payments` table or student history/active_months.
export async function autoCleanupExpiredPendingPayments(): Promise<void> {
  const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const cutoffIso = new Date(now - TWENTY_NINE_DAYS_MS).toISOString();

  // 1. Clean from local cache
  try {
    const local = getLocalPendingPayments();
    const activeOnly = local.filter(req => {
      if (req.status === 'rejected' || req.status === 'approved') {
        const actionDate = new Date(req.reviewed_at || req.created_at).getTime();
        if (!isNaN(actionDate) && (now - actionDate) > TWENTY_NINE_DAYS_MS) {
          return false;
        }
      }
      return true;
    });
    saveLocalPendingPayments(activeOnly);
  } catch (e) {}

  // 2. Clean from Supabase pending_payments table only
  try {
    // Delete rejected older than 29 days
    await supabase
      .from('pending_payments')
      .delete()
      .eq('status', 'rejected')
      .lt('reviewed_at', cutoffIso);

    // Also fallback if reviewed_at is null but created_at is older than 29 days
    await supabase
      .from('pending_payments')
      .delete()
      .eq('status', 'rejected')
      .lt('created_at', cutoffIso);

    // Delete approved older than 29 days
    await supabase
      .from('pending_payments')
      .delete()
      .eq('status', 'approved')
      .lt('reviewed_at', cutoffIso);

    await supabase
      .from('pending_payments')
      .delete()
      .eq('status', 'approved')
      .lt('created_at', cutoffIso);
  } catch (err) {
    console.warn('Auto cleanup of expired pending_payments error:', err);
  }
}

export async function fetchAllPendingPayments(): Promise<PendingPaymentRequest[]> {
  // Execute 29-day auto cleanup first
  await autoCleanupExpiredPendingPayments();

  const localList = getLocalPendingPayments();
  try {
    const { data, error } = await supabase
      .from('pending_payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      // Merge with any local ones that might not be synced yet
      const map = new Map<string, PendingPaymentRequest>();
      localList.forEach(item => map.set(item.id, item));
      data.forEach((item: any) => map.set(item.id, item as PendingPaymentRequest));
      const merged = Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
      saveLocalPendingPayments(merged);
      return merged;
    }
  } catch (e) {
    console.warn('Could not fetch pending_payments from remote table, using local store', e);
  }
  return localList;
}

export async function submitClassJoinPayment(params: {
  student: any;
  classType: string;
  amount: number;
  paymentMethod: 'bank' | 'qr';
  transactionId: string;
  month?: string;
}): Promise<PendingPaymentRequest> {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const newRequest: PendingPaymentRequest = {
    id: `payreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    student_id: String(params.student.id || params.student.username),
    username: params.student.username,
    student_name: params.student.name || `${params.student.firstName || ''} ${params.student.lastName || ''}`.trim() || params.student.username,
    whatsapp: params.student.whatsapp || params.student.mobile || '',
    class_type: params.classType,
    amount: params.amount,
    payment_method: params.paymentMethod,
    transaction_id: params.transactionId.trim(),
    status: 'pending',
    month: params.month || currentMonthKey,
    created_at: now.toISOString()
  };

  // 1. Save locally
  const current = getLocalPendingPayments();
  const updated = [newRequest, ...current.filter(p => p.id !== newRequest.id)];
  saveLocalPendingPayments(updated);

  // 2. Try Supabase insert
  try {
    await supabase.from('pending_payments').insert([newRequest]);
  } catch (e) {
    console.warn('Remote insert to pending_payments skipped or failed:', e);
  }

  // 3. Emit realtime event
  emitRealtimeEvent('pending_payment_submitted', newRequest);

  return newRequest;
}

export function normalizeToYearMonth(rawMonth?: string): string {
  const now = new Date();
  const currentY = now.getFullYear();
  if (!rawMonth) {
    return `${currentY}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const clean = rawMonth.trim();
  // If already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(clean)) return clean;
  // If YYYY-M
  const ym = clean.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) return `${ym[1]}-${String(ym[2]).padStart(2, '0')}`;
  
  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const lower = clean.toLowerCase();
  let foundMonth = '';
  for (const [k, v] of Object.entries(monthMap)) {
    if (lower.includes(k)) {
      foundMonth = v;
      break;
    }
  }
  const yearMatch = clean.match(/\b(20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : String(currentY);
  if (foundMonth) {
    return `${year}-${foundMonth}`;
  }
  return clean;
}

export async function approvePendingPayment(requestId: string): Promise<boolean> {
  const current = getLocalPendingPayments();
  let target = current.find(p => p.id === requestId);

  // If not found in local cache, load directly from Supabase
  if (!target) {
    try {
      const { data: dbTarget } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (dbTarget) {
        target = dbTarget;
      }
    } catch (e) {}
  }

  if (!target) return false;

  const reviewedAt = new Date().toISOString();
  target.status = 'approved';
  target.reviewed_at = reviewedAt;

  saveLocalPendingPayments(current);

  // 1. Update remote pending_payments table in Supabase
  try {
    await supabase.from('pending_payments').update({
      status: 'approved',
      reviewed_at: reviewedAt
    }).eq('id', requestId);
  } catch (e) {
    console.warn('Failed to update pending_payments status:', e);
  }

  // 2. Normalize target month to YYYY-MM format (e.g. 2026-06)
  const normalizedMonth = normalizeToYearMonth(target.month);

  // 3. Find real student in Supabase
  let realStudentId: string = target.student_id;
  let targetClasses: string[] = target.class_type 
    ? target.class_type.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];
  if (targetClasses.length === 0 && target.class_type) {
    targetClasses.push(target.class_type.trim());
  }

  try {
    const { data: stdData } = await supabase
      .from('students')
      .select('*')
      .or(`username.eq.${target.username},id.eq.${target.student_id}`)
      .maybeSingle();

    if (stdData) {
      realStudentId = stdData.id;

      let currentClasses: string[] = [];
      if (stdData.class_types) {
        if (Array.isArray(stdData.class_types)) currentClasses = [...stdData.class_types];
        else if (typeof stdData.class_types === 'string') {
          try { currentClasses = JSON.parse(stdData.class_types); } catch (e) { currentClasses = [stdData.class_types]; }
        }
      }
      
      // Ensure all target classes are added
      targetClasses.forEach(cls => {
        if (!currentClasses.includes(cls)) {
          currentClasses.push(cls);
        }
      });

      // Ensure active_months includes normalized month as well as target.month
      let currentActiveMonths: string[] = [];
      if (stdData.active_months) {
        if (Array.isArray(stdData.active_months)) currentActiveMonths = [...stdData.active_months];
        else if (typeof stdData.active_months === 'string') {
          try { currentActiveMonths = JSON.parse(stdData.active_months); } catch (e) { currentActiveMonths = [stdData.active_months]; }
        }
      }
      if (!currentActiveMonths.includes(normalizedMonth)) {
        currentActiveMonths.push(normalizedMonth);
      }
      if (target.month && !currentActiveMonths.includes(target.month)) {
        currentActiveMonths.push(target.month);
      }

      // Calculate past months of the current year before target.month to mark as absent
      const [targetYear, targetMonthNum] = normalizedMonth.split('-').map(Number);
      const pastMonthsAbsent: { class: string; month: string; status: string }[] = [];
      if (!isNaN(targetYear) && !isNaN(targetMonthNum)) {
        for (let m = 1; m < targetMonthNum; m++) {
          const mStr = `${targetYear}-${String(m).padStart(2, '0')}`;
          targetClasses.forEach(cls => {
            pastMonthsAbsent.push({ class: cls, month: mStr, status: 'absent' });
          });
        }
      }

      // Read and update deactivated_months
      let deactivatedList: any[] = [];
      if (stdData.deactivated_months) {
        if (Array.isArray(stdData.deactivated_months)) deactivatedList = [...stdData.deactivated_months];
        else if (typeof stdData.deactivated_months === 'string') {
          try { deactivatedList = JSON.parse(stdData.deactivated_months); } catch (e) {}
        }
      }
      for (const p of pastMonthsAbsent) {
        if (!deactivatedList.some((d: any) => d.class === p.class && d.month === p.month)) {
          deactivatedList.push(p);
        }
      }

      // Update student table directly in Supabase
      await supabase.from('students').update({
        class_types: currentClasses,
        active_months: currentActiveMonths,
        deactivated_months: deactivatedList,
        is_paid: true
      }).eq('id', stdData.id);

      // Record in student_class_enrollments for each class
      for (const cls of targetClasses) {
        try {
          await supabase.from('student_class_enrollments').insert({
            id: `enr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${stdData.id}`,
            student_id: stdData.id,
            class_type_id: cls,
            enrollment_status: 'active',
            enrolled_at: reviewedAt
          });
        } catch (e) {}
      }

      // Automatically mark previous months as 'absent' in payments table
      for (const p of pastMonthsAbsent) {
        const absentRecordId = `${stdData.id}_${p.month}_${p.class}`;
        try {
          await supabase.from('payments').upsert({
            id: crypto.randomUUID(),
            record_id: absentRecordId,
            student_id: stdData.id,
            username: target.username,
            class_type: p.class,
            month: p.month,
            target_month: p.month,
            amount: 0,
            status: 'absent',
            reminder_sent: false,
            whatsapp_sent: false
          }, { onConflict: 'record_id' });
        } catch (errUpsert) {}
      }
    }
  } catch (e) {
    console.warn('Failed to update student in remote table:', e);
  }

  // 4. CRITICAL: Automatically update Manage Payments in Supabase `payments` table
  const feePerClass = targetClasses.length > 0 ? Math.round(target.amount / targetClasses.length) : target.amount;

  for (const cls of targetClasses) {
    // 1. Primary Record ID matching AdminPaymentManager: `${student.id}_${monthKey}_${className}`
    const recordId = `${realStudentId}_${normalizedMonth}_${cls}`;
    
    const paymentPayload = {
      id: crypto.randomUUID(),
      record_id: recordId,
      student_id: realStudentId,
      username: target.username,
      class_type: cls,
      month: normalizedMonth,
      target_month: normalizedMonth,
      amount: feePerClass,
      status: 'paid',
      reminder_sent: false,
      whatsapp_sent: false,
      payment_method: target.payment_method || 'bank',
      transaction_id: target.transaction_id || '',
      enrollment_id: target.id,
      created_at: reviewedAt
    };

    try {
      const { error: upsertErr } = await supabase.from('payments').upsert(paymentPayload, { onConflict: 'record_id' });
      if (upsertErr) {
        console.warn('Payment upsert error, trying update/insert fallback:', upsertErr);
        await supabase.from('payments').update({
          status: 'paid',
          amount: feePerClass,
          reminder_sent: false,
          whatsapp_sent: false
        }).eq('record_id', recordId);
      }
    } catch (e) {
      try {
        await supabase.from('payments').insert(paymentPayload);
      } catch (e2) {}
    }

    // Also update any existing records that used target.month or target.student_id
    try {
      await supabase.from('payments').update({
        status: 'paid',
        amount: feePerClass,
        reminder_sent: false,
        whatsapp_sent: false
      })
      .eq('class_type', cls)
      .or(`student_id.eq.${realStudentId},username.eq.${target.username}`)
      .or(`month.eq.${normalizedMonth},month.eq.${target.month},target_month.eq.${normalizedMonth}`);
    } catch (e3) {}

    // Clear any past fee reminders for this class from announcements
    try {
      await supabase
        .from('announcements')
        .delete()
        .eq('target_user', target.username)
        .eq('type', 'private')
        .ilike('content', `%[${cls}]%`);
    } catch (e) {}

    // Broadcast realtime update to student dashboard
    try {
      const channel = supabase.channel(`student_dashboard_${realStudentId}`);
      await channel.send({
        type: 'broadcast',
        event: 'payment_updated',
        payload: { studentId: realStudentId, monthKey: normalizedMonth, className: cls, status: 'paid' }
      });
      supabase.removeChannel(channel);
    } catch (errB) {}
  }

  // 5. Send Instant Approval Notification to Student
  const notifId = `notif_appr_${Date.now()}_${target.id}`;
  const notifTitle = `✅ පන්ති ගෙවීම අනුමත විය! (${target.class_type})`;
  const notifContent = `ඔබ විසින් [${target.class_type}] පන්තිය සඳහා (${normalizedMonth}) මාසයට යොමු කළ ගෙවීම (ට්‍රාන්සැක්ෂන් අංකය: ${target.transaction_id}) සාර්ථකව අනුමත කරන ලදී! Manage Payments සහ ඔබගේ Dashboard එක Paid ලෙස ස්වයංක්‍රීයව යාවත්කාලීන විය.`;
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    await supabase.from('announcements').insert({
      id: notifId,
      title: notifTitle,
      content: notifContent,
      date: todayStr,
      type: 'private',
      target_user: target.username
    });
  } catch (e) {}

  // 6. Emit Realtime Events across the entire LMS
  emitRealtimeEvent('payment_approved', {
    requestId: target.id,
    username: target.username,
    classType: target.class_type,
    month: normalizedMonth,
    studentId: realStudentId
  });
  emitRealtimeEvent('payment_status_changed', {
    studentId: realStudentId,
    monthKey: normalizedMonth,
    status: 'paid'
  });
  emitRealtimeEvent('payments_updated', {
    studentId: realStudentId,
    monthKey: normalizedMonth
  });
  emitRealtimeEvent('student_updated', { username: target.username });

  return true;
}

export async function rejectPendingPayment(requestId: string, reason?: string): Promise<boolean> {
  const current = getLocalPendingPayments();
  let target = current.find(p => p.id === requestId);

  // If not found in local cache, load directly from Supabase
  if (!target) {
    try {
      const { data: dbTarget } = await supabase
        .from('pending_payments')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (dbTarget) {
        target = dbTarget;
      }
    } catch (e) {}
  }

  if (!target) return false;

  const reviewedAt = new Date().toISOString();
  target.status = 'rejected';
  target.reviewed_at = reviewedAt;
  target.note = reason || 'ගෙවීම් තොරතුරු තහවුරු කරගත නොහැකි විය';

  saveLocalPendingPayments(current);

  try {
    await supabase.from('pending_payments').update({
      status: 'rejected',
      reviewed_at: reviewedAt,
      note: target.note
    }).eq('id', requestId);
  } catch (e) {}

  // Send Instant Rejection Notification to Student
  const notifId = `notif_rej_${Date.now()}_${target.id}`;
  const notifTitle = `❌ පන්ති ගෙවීම ප්‍රතික්ෂේප විය (${target.class_type})`;
  const notifContent = `ඔබ විසින් [${target.class_type}] පන්තිය සඳහා යොමු කළ ගෙවීම් තොරතුරු (ට්‍රාන්සැක්ෂන් අංකය: ${target.transaction_id}) තහවුරු කරගත නොහැකි විය. කරුණාකර නිවැරදි Transaction ID ඇතුළත් කර නැවත උත්සාහ කරන්න හෝ සහය අංශය (0779630100) අමතන්න.`;
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    await supabase.from('announcements').insert({
      id: notifId,
      title: notifTitle,
      content: notifContent,
      date: todayStr,
      type: 'private',
      target_user: target.username
    });
  } catch (e) {}

  try {
    const notifKey = `notifications_${target.username}`;
    const rawNotifs = localStorage.getItem(notifKey);
    const notifs = rawNotifs ? JSON.parse(rawNotifs) : [];
    notifs.unshift({
      id: notifId,
      title: notifTitle,
      content: notifContent,
      date: todayStr,
      type: 'private',
      targetUser: target.username,
      classType: target.class_type,
      status: 'rejected',
      timestamp: Date.now()
    });
    localStorage.setItem(notifKey, JSON.stringify(notifs));
  } catch (e) {}

  emitRealtimeEvent('payment_rejected', {
    requestId: target.id,
    username: target.username,
    classType: target.class_type
  });

  return true;
}

// Permanently delete a pending payment request (e.g. when student dismisses approved/rejected alert)
export async function deletePendingPaymentRequest(requestId: string): Promise<boolean> {
  if (!requestId) return false;

  // 1. Remove from local store
  const current = getLocalPendingPayments();
  const targetReq = current.find(p => p.id === requestId);
  const filtered = current.filter(p => p.id !== requestId);
  saveLocalPendingPayments(filtered);

  // 2. Delete from Supabase pending_payments table (with fallback update)
  try {
    const { error } = await supabase.from('pending_payments').delete().eq('id', requestId);
    if (error) {
      console.warn('Pending payment delete error, falling back to status update:', error);
      await supabase.from('pending_payments').update({ status: 'dismissed' }).eq('id', requestId);
    }
  } catch (e) {
    console.warn('Failed to delete pending payment from remote:', e);
    try {
      await supabase.from('pending_payments').update({ status: 'dismissed' }).eq('id', requestId);
    } catch (e2) {}
  }

  // 3. Delete any associated notification announcements in Supabase
  try {
    await supabase.from('announcements').delete().ilike('id', `%${requestId}%`);
  } catch (e) {}

  // 4. Remove from user's local notification feed if stored
  if (targetReq?.username) {
    try {
      const notifKey = `notifications_${targetReq.username}`;
      const raw = localStorage.getItem(notifKey);
      if (raw) {
        const notifs = JSON.parse(raw);
        const filteredNotifs = notifs.filter((n: any) => !n.id?.includes(requestId));
        localStorage.setItem(notifKey, JSON.stringify(filteredNotifs));
      }
    } catch (e) {}
  }

  // 5. Emit realtime event to notify components
  emitRealtimeEvent('pending_payment_deleted', { requestId });
  return true;
}


