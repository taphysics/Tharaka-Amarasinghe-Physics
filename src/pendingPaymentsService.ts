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

export async function approvePendingPayment(requestId: string): Promise<boolean> {
  const current = getLocalPendingPayments();
  const target = current.find(p => p.id === requestId);
  if (!target) return false;

  const reviewedAt = new Date().toISOString();
  target.status = 'approved';
  target.reviewed_at = reviewedAt;

  saveLocalPendingPayments(current);

  // 1. Update remote pending_payments table if available
  try {
    await supabase.from('pending_payments').update({
      status: 'approved',
      reviewed_at: reviewedAt
    }).eq('id', requestId);
  } catch (e) {}

  // 2. Add class_type to student record in `students`
  try {
    const { data: stdData } = await supabase
      .from('students')
      .select('*')
      .eq('username', target.username)
      .maybeSingle();

    if (stdData) {
      const targetClasses = target.class_type 
        ? target.class_type.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];
      if (targetClasses.length === 0 && target.class_type) {
        targetClasses.push(target.class_type.trim());
      }

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

      // Ensure active_months includes target.month
      let currentActiveMonths: string[] = [];
      if (stdData.active_months) {
        if (Array.isArray(stdData.active_months)) currentActiveMonths = [...stdData.active_months];
        else if (typeof stdData.active_months === 'string') {
          try { currentActiveMonths = JSON.parse(stdData.active_months); } catch (e) { currentActiveMonths = [stdData.active_months]; }
        }
      }
      if (!currentActiveMonths.includes(target.month)) {
        currentActiveMonths.push(target.month);
      }

      // Calculate past months of the current year before target.month to automatically mark as absent
      const [targetYear, targetMonthNum] = target.month.split('-').map(Number);
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

      // Update in localStorage students
      try {
        const rawSaved = localStorage.getItem('physics_hub_students');
        if (rawSaved) {
          const sList = JSON.parse(rawSaved);
          const student = sList.find((s: any) => s.username === target.username);
          if (student) {
            student.classTypes = student.classTypes || [];
            targetClasses.forEach(cls => {
              if (!student.classTypes.includes(cls)) {
                student.classTypes.push(cls);
              }
            });
            student.activeMonths = student.activeMonths || [];
            if (!student.activeMonths.includes(target.month)) {
              student.activeMonths.push(target.month);
            }
            student.deactivatedMonths = deactivatedList;
            student.isPaid = true;
            localStorage.setItem('physics_hub_students', JSON.stringify(sList));
          }
        }
      } catch (e) {}

      // Automatically mark previous months as 'absent' in payments table
      for (const p of pastMonthsAbsent) {
        const absentRecordId = `${target.student_id}_${p.month}_${p.class}`;
        try {
          await supabase.from('payments').upsert({
            record_id: absentRecordId,
            student_id: target.student_id,
            username: target.username,
            class_type: p.class,
            class_name: p.class,
            month: p.month,
            target_month: p.month,
            amount: 0,
            status: 'absent',
            reminder_sent: false
          }, { onConflict: 'record_id' });
        } catch (errUpsert) {
          try {
            await supabase.from('payments').insert({
              record_id: absentRecordId,
              student_id: target.student_id,
              username: target.username,
              class_type: p.class,
              class_name: p.class,
              month: p.month,
              target_month: p.month,
              amount: 0,
              status: 'absent',
              reminder_sent: false
            });
          } catch (e3) {}
        }
      }
    }
  } catch (e) {
    console.warn('Failed to update student in remote table:', e);
  }

  // 3. Insert paid record into `payments` table for each class paid
  const targetClasses = target.class_type 
    ? target.class_type.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [target.class_type];
  const feePerClass = targetClasses.length > 0 ? Math.round(target.amount / targetClasses.length) : target.amount;

  for (const cls of targetClasses) {
    const recordId = `${target.student_id}_${target.month}_${cls}`;
    try {
      await supabase.from('payments').upsert({
        record_id: recordId,
        student_id: target.student_id,
        username: target.username,
        class_type: cls,
        class_name: cls,
        month: target.month,
        target_month: target.month,
        amount: feePerClass,
        status: 'paid',
        reminder_sent: false
      }, { onConflict: 'record_id' });
    } catch (e) {
      try {
        await supabase.from('payments').insert({
          record_id: recordId,
          student_id: target.student_id,
          username: target.username,
          class_type: cls,
          class_name: cls,
          month: target.month,
          target_month: target.month,
          amount: feePerClass,
          status: 'paid',
          reminder_sent: false
        });
      } catch (e2) {}
    }
  }

  // 4. Send Instant Approval Notification to Student
  const notifId = `notif_appr_${Date.now()}_${target.id}`;
  const notifTitle = `✅ පන්ති ගෙවීම අනුමත විය! (${target.class_type})`;
  const notifContent = `ඔබ විසින් [${target.class_type}] පන්තිය සඳහා යොමු කළ ගෙවීම (ට්‍රාන්සැක්ෂන් අංකය: ${target.transaction_id}) සාර්ථකව අනුමත කරන ලදී! දැන් ඔබට එම පන්තියට අදාළ සජීවී පන්ති, රෙකෝඩින් සහ ටියුට්ස් ලබාගත හැක.`;
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

  // Save to local notifications store as well
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
      status: 'approved',
      timestamp: Date.now()
    });
    localStorage.setItem(notifKey, JSON.stringify(notifs));
  } catch (e) {}

  emitRealtimeEvent('payment_approved', {
    requestId: target.id,
    username: target.username,
    classType: target.class_type
  });
  emitRealtimeEvent('student_updated', { username: target.username });

  return true;
}

export async function rejectPendingPayment(requestId: string, reason?: string): Promise<boolean> {
  const current = getLocalPendingPayments();
  const target = current.find(p => p.id === requestId);
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


