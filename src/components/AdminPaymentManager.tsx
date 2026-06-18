import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, X, Plus, MessageCircle, Bell, LayoutDashboard } from 'lucide-react';

const parseStudentClasses = (classTypes: any): string[] => {
  if (!classTypes) return [];
  if (Array.isArray(classTypes)) return classTypes;
  try {
    return JSON.parse(classTypes);
  } catch (e) {
    return typeof classTypes === 'string' ? classTypes.split(',').map(c => c.trim()) : [];
  }
};

export default function PaymentManager() {
  const [students, setStudents] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  
  const [activeModal, setActiveModal] = useState<{ student: any, month: string, top: number, left: number } | null>(null);
  const [showClassDropdown, setShowClassDropdown] = useState<string | null>(null);

  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const monthsNames = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. Fetch Students
    const { data: stdData, error: stdError } = await supabase.from('students').select('*').order('name');
    if (stdError) console.error("Error fetching students:", stdError);
    if (stdData) {
      const formattedStudents = stdData.map((s: any) => ({
        ...s,
        class_types: parseStudentClasses(s.class_types)
      }));
      setStudents(formattedStudents);
    }

    // 2. Fetch Payments
    const { data: payData, error: payError } = await supabase.from('payments').select('*');
    if (payError) console.error("Error fetching payments:", payError);
    if (payData) setPayments(payData);

    // 3. Fetch Classes from class_types_config table (Fixed Column Name)
    const { data: classesData, error: classesError } = await supabase
      .from('class_types_config')
      .select('class_type') // Changed from class_types to class_type
      .eq('is_active', true)
      .order('class_type', { ascending: true }); 

    if (classesError) {
      console.error("Error fetching class configs:", classesError);
    } else if (classesData) {
      setAllClasses(classesData.map((c: any) => c.class_type).filter(Boolean));
    }
  };

  const handlePaymentStatusChange = async (studentId: string, monthKey: string, className: string, status: string) => {
    const recordId = `${studentId}_${monthKey}_${className}`;
    const student = students.find((s: any) => s.id === studentId);
    
    const existingPayment = payments.find((p: any) => p.record_id === recordId);
    let reminderStatus = existingPayment ? existingPayment.reminder_sent : false;
    let whatsappStatus = existingPayment ? existingPayment.whatsapp_sent : false;

    // Clear reminders if paid, free, or absent
    if (status === 'paid' || status === 'free' || status === 'absent') {
      reminderStatus = false;
      whatsappStatus = false;
      
      if (student?.username) {
        await supabase
          .from('announcements')
          .delete()
          .eq('target_user', student.username)
          .eq('type', 'private')
          .ilike('content', `%[${className}]%`);
      }
    }

    setPayments(prev => {
      const exists = prev.find((p: any) => p.record_id === recordId);
      if (exists) return prev.map((p: any) => p.record_id === recordId ? { ...p, status, reminder_sent: reminderStatus, whatsapp_sent: whatsappStatus } : p);
      return [...prev, { record_id: recordId, student_id: studentId, month: monthKey, class_type: className, status, reminder_sent: reminderStatus, whatsapp_sent: whatsappStatus }];
    });

    const { error } = await supabase.from('payments').upsert({
      record_id: recordId,
      student_id: studentId,
      month: monthKey,
      class_type: className, 
      status: status,
      reminder_sent: reminderStatus,
      whatsapp_sent: whatsappStatus
    }, { onConflict: 'record_id' });

    if (error) {
      console.error("Payment status save failed:", error);
      alert("දත්ත සුරැකීමේදී දෝෂයක් මතු විය. කරුණාකර නැවත උත්සාහ කරන්න.");
    } else {
      const channel = supabase.channel(`student_dashboard_${studentId}`);
      await channel.send({
        type: 'broadcast',
        event: 'payment_updated',
        payload: { studentId, monthKey, className, status }
      });
      supabase.removeChannel(channel);
    }
  };

  const sendDashboardReminder = async (studentId: string, monthKey: string, specificClass: string | null = null) => {
    const student = students.find((s: any) => s.id === studentId);
    const classesToRemind = specificClass ? [specificClass] : (student?.class_types || []);
    
    // Extract Year and Month correctly
    const year = monthKey.split('-')[0];
    const monthName = monthsNames[parseInt(monthKey.split('-')[1]) - 1];
    
    let sentCount = 0;
    let hasError = false;

    for (const cName of classesToRemind) {
      const recordId = `${studentId}_${monthKey}_${cName}`;
      const existing = payments.find((p: any) => p.record_id === recordId);
      const currentStatus = existing ? existing.status : 'unpaid';

      // Ignore if Paid, Free, or Absent
      if (currentStatus !== 'paid' && currentStatus !== 'free' && currentStatus !== 'absent') {
        const { error } = await supabase.from('payments').upsert({
          record_id: recordId,
          student_id: studentId,
          month: monthKey,
          class_type: cName,
          status: currentStatus,
          reminder_sent: true
        }, { onConflict: 'record_id' });

        if (error) {
          console.error("Dashboard Reminder save failed:", error);
          hasError = true;
        } else {
          setPayments(prev => {
            const exists = prev.find((p: any) => p.record_id === recordId);
            if (exists) return prev.map((p: any) => p.record_id === recordId ? { ...p, reminder_sent: true } : p);
            return [...prev, { record_id: recordId, student_id: studentId, month: monthKey, class_type: cName, status: currentStatus, reminder_sent: true }];
          });

          if (student?.username) {
            const today = new Date().toISOString().split('T')[0];
            await supabase.from('announcements').insert({
              title: `පන්ති ගාස්තු සිහිකැඳවීමයි! (${year} ${monthName})`, // Added Year
              content: `ඔබගේ ${year} ${monthName} මාසයේ [${cName}] පන්තිය සඳහා ගාස්තු ගෙවා නොමැත. කරුණාකර ඉක්මනින් ගෙවීම් සිදු කරන්න.`, // Added Year
              date: today,
              type: 'private',
              target_user: student.username
            });
          }
          
          const channel = supabase.channel(`student_dashboard_${studentId}`);
          await channel.send({
            type: 'broadcast',
            event: 'reminder_updated',
            payload: { studentId, monthKey, className: cName }
          });
          supabase.removeChannel(channel);

          sentCount++;
        }
      }
    }

    if (hasError) alert('සමහර සිහිකැඳවීම් Save වීමේදී ගැටළුවක් ඇති විය.');
    else if (sentCount > 0) alert('Dashboard සිහිකැඳවීම සාර්ථකව යවන ලදී!');
    else alert('මෙම පන්ති සඳහා දැනටමත් ගෙවීම් කර ඇත, Absent කර ඇත, හෝ Reminder යවා ඇත.');
  };

  const sendWhatsApp = async (student: any, monthKey: string, specificClass: string | null = null) => {
    const classesToSend = specificClass ? [specificClass] : (student.class_types || []);
    
    // Extract Year and Month correctly
    const year = monthKey.split('-')[0];
    const monthName = monthsNames[parseInt(monthKey.split('-')[1]) - 1];
    
    const baseUrl = window.location.origin; 
    let link = `${baseUrl}/invoice?s=${student.id}&m=${monthKey}`;
    
    // Added Year to the message
    let message = `ආයුබෝවන් ${student.name},\n\nඔබගේ ${year} ${monthName} මාසය සඳහා පන්ති ගාස්තු ගෙවීම් බිල්පත පහත ලින්ක් එකෙන් ලබා ගන්න:\n`;
    if (specificClass) {
      link += `&c=${encodeURIComponent(specificClass)}`;
      message = `ආයුබෝවන් ${student.name},\n\nඔබගේ ${year} ${monthName} මාසයේ [${specificClass}] පන්තිය සඳහා ගාස්තු ගෙවීම් බිල්පත පහත ලින්ක් එකෙන් ලබා ගන්න:\n`;
    }
    message += `\n🔗 Link: ${link}\n\nස්තූතියි!`;
    
    const phoneStr = (student.whatsapp || '').replace(/[^0-9]/g, '');
    const cleanPhone = phoneStr.startsWith('94') ? phoneStr : phoneStr.startsWith('0') ? `94${phoneStr.substring(1)}` : `94${phoneStr}`;
    
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank'); 

    for (const cName of classesToSend) {
      const recordId = `${student.id}_${monthKey}_${cName}`;
      const existing = payments.find((p: any) => p.record_id === recordId);
      const currentStatus = existing ? existing.status : 'unpaid';

      // Ignore if Paid, Free, or Absent
      if (currentStatus !== 'paid' && currentStatus !== 'free' && currentStatus !== 'absent') {
        const { error } = await supabase.from('payments').upsert({
          record_id: recordId,
          student_id: student.id,
          month: monthKey,
          class_type: cName,
          status: currentStatus,
          whatsapp_sent: true
        }, { onConflict: 'record_id' });

        if (error) {
          console.error("WhatsApp status save failed:", error);
        } else {
          setPayments(prev => {
            const exists = prev.find((p: any) => p.record_id === recordId);
            if (exists) return prev.map((p: any) => p.record_id === recordId ? { ...p, whatsapp_sent: true } : p);
            return [...prev, { record_id: recordId, student_id: student.id, month: monthKey, class_type: cName, status: currentStatus, whatsapp_sent: true }];
          });
          
          const channel = supabase.channel(`student_dashboard_${student.id}`);
          await channel.send({
            type: 'broadcast',
            event: 'whatsapp_status_updated',
            payload: { studentId: student.id, monthKey, className: cName }
          });
          supabase.removeChannel(channel);
        }
      }
    }
  };

  const updateStudentClasses = async (studentId: string, newClasses: string[]) => {
    setStudents(prev => prev.map((s: any) => s.id === studentId ? { ...s, class_types: newClasses } : s));
    const { error } = await supabase.from('students').update({ class_types: newClasses }).eq('id', studentId);
    
    if (error) {
      console.error("Error updating student classes:", error);
    } else {
      const channel = supabase.channel(`student_dashboard_${studentId}`);
      await channel.send({
        type: 'broadcast',
        event: 'student_classes_updated',
        payload: { studentId, newClasses }
      });
      supabase.removeChannel(channel);
    }
  };

  const getMonthButtonStyle = (student: any, monthKey: string) => {
    const studentClasses = student.class_types || [];
    if (studentClasses.length === 0) return { backgroundColor: '#1e293b' }; 
    
    const colors = studentClasses.map((cName: string) => {
      const status = payments.find((p: any) => p.record_id === `${student.id}_${monthKey}_${cName}`)?.status || 'unpaid';
      if (status === 'paid') return '#10b981'; 
      if (status === 'free') return '#3b82f6'; 
      if (status === 'absent') return '#64748b'; // Absent status color (Slate Grey)
      return '#ef4444'; 
    });
    
    if (colors.length === 1) return { backgroundColor: colors[0] };
    const percentage = 100 / colors.length;
    const gradientStops = colors.map((col: string, i: number) => `${col} ${i * percentage}%, ${col} ${(i + 1) * percentage}%`).join(', ');
    return { background: `linear-gradient(to right, ${gradientStops})` };
  };

  const filteredStudents = students.filter((s: any) => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nic?.includes(searchTerm)
  );

  const handleMonthClick = (e: React.MouseEvent, student: any, monthKey: string) => {
    const buttonRect = e.currentTarget.getBoundingClientRect();
    const rootElement = document.getElementById('payment-manager-container');
    
    if (!rootElement) return;
    const rootRect = rootElement.getBoundingClientRect();

    let modalTop = buttonRect.bottom - rootRect.top + 6;
    let modalLeft = buttonRect.left - rootRect.left;

    const modalWidth = 340;
    if (modalLeft + modalWidth > rootElement.clientWidth) {
      modalLeft = buttonRect.right - rootRect.left - modalWidth;
    }
    if (modalLeft < 10) modalLeft = 10;

    setActiveModal({ student, month: monthKey, top: modalTop, left: modalLeft });
  };

  return (
    <div id="payment-manager-container" className="p-4 md:p-8 space-y-6 relative">
      <div className="flex gap-4 items-center bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <Search className="text-slate-500" />
        <input 
          type="text" 
          placeholder="නම, Username හෝ NIC..." 
          className="bg-transparent text-white outline-none w-full"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filteredStudents.map((student: any) => (
          <div key={student.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col xl:flex-row gap-6">
            <div className="xl:w-1/3 space-y-3">
              <div>
                <h3 className="text-white font-bold text-lg">{student.name}</h3>
                <div className="flex gap-3 text-xs font-mono mt-1">
                  <span className="text-blue-400">@{student.username}</span>
                  <span className="text-slate-500">NIC: {student.nic}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 relative">
                <span className="text-xs text-slate-500 block mb-2">ලියාපදිංචි පන්ති:</span>
                <div className="flex flex-wrap gap-2">
                  {(student.class_types || []).length === 0 && <span className="text-xs text-amber-500">පන්ති කිසිවක් ඇතුළත් කර නැත.</span>}
                  
                  {(student.class_types || []).map((cls: string) => (
                    <span key={cls} className="bg-slate-800 text-slate-300 text-[11px] px-2 py-1 rounded-md flex items-center gap-1 border border-slate-700">
                      {cls}
                      <button onClick={() => updateStudentClasses(student.id, student.class_types.filter((c:string) => c !== cls))} className="hover:text-red-400"><X size={12}/></button>
                    </span>
                  ))}
                  
                  <button 
                    onClick={() => setShowClassDropdown(showClassDropdown === student.id ? null : student.id)}
                    className="bg-blue-600/20 text-blue-400 text-[11px] px-2 py-1 rounded-md flex items-center gap-1 hover:bg-blue-600/40 border border-blue-500/30"
                  >
                    <Plus size={12}/> ඇතුලත් කරන්න
                  </button>
                </div>

                {showClassDropdown === student.id && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-10 p-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {allClasses.filter((c: string) => !(student.class_types || []).includes(c)).map((c: string) => (
                        <button 
                          key={c}
                          onClick={() => {
                            updateStudentClasses(student.id, [...(student.class_types || []), c]);
                            setShowClassDropdown(null);
                          }}
                          className="text-left text-xs text-slate-200 hover:bg-slate-700 p-2 rounded-lg"
                        >
                          + {c}
                        </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="xl:w-2/3 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {months.map((m, idx) => {
                const monthKey = `${selectedYear}-${m}`;
                const studentClasses = student.class_types || [];
                let reminderCount = 0;
                let whatsappCount = 0;
                let unpaidCount = 0;

                studentClasses.forEach((cName: string) => {
                  const paymentInfo = payments.find((p: any) => p.record_id === `${student.id}_${monthKey}_${cName}`);
                  const status = paymentInfo?.status || 'unpaid';
                  
                  if (status !== 'paid' && status !== 'free' && status !== 'absent') {
                    unpaidCount++;
                    if (paymentInfo?.reminder_sent) reminderCount++;
                    if (paymentInfo?.whatsapp_sent) whatsappCount++;
                  }
                });

                const showReminder = reminderCount > 0;
                const reminderText = (reminderCount === unpaidCount && unpaidCount > 0) ? 'A' : reminderCount.toString();
                const showWhatsApp = whatsappCount > 0;
                const whatsappText = (whatsappCount === unpaidCount && unpaidCount > 0) ? 'A' : whatsappCount.toString();

                return (
                  <button
                    key={m}
                    onClick={(e) => handleMonthClick(e, student, monthKey)}
                    style={getMonthButtonStyle(student, monthKey)}
                    className="h-12 rounded-xl text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-0.5 opacity-90 hover:opacity-100 relative p-1"
                  >
                    <span>{monthsNames[idx]}</span>
                    <div className="flex gap-2 items-center justify-center h-3 mt-0.5">
                      {showReminder && (
                        <div className="flex items-center gap-0.5 text-amber-200">
                          <Bell size={10} className="fill-amber-200/20" />
                          <span className="text-[10px] font-extrabold">{reminderText}</span>
                        </div>
                      )}
                      {showWhatsApp && (
                        <div className="flex items-center gap-0.5 text-emerald-200">
                          <MessageCircle size={10} className="fill-emerald-200/20" />
                          <span className="text-[10px] font-extrabold">{whatsappText}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {activeModal && (
        <div className="absolute inset-0 z-50 bg-black/10 backdrop-blur-[1px]" onClick={() => setActiveModal(null)}>
          <div 
            className="absolute bg-slate-900 border border-slate-700 rounded-2xl w-[340px] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.7)] z-50" 
            style={{ top: activeModal.top, left: activeModal.left }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-white font-bold text-sm truncate max-w-[260px]">{activeModal.student.name}</h3>
                <p className="text-slate-400 text-[10px]">{activeModal.month} මාසයේ ගෙවීම් පාලනය</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
              {(activeModal.student.class_types || []).map((className: string) => {
                const recordId = `${activeModal.student.id}_${activeModal.month}_${className}`;
                const paymentInfo = payments.find((p: any) => p.record_id === recordId);
                const status = paymentInfo?.status || 'unpaid';
                const isReminderSent = paymentInfo?.reminder_sent;
                const isWhatsAppSent = paymentInfo?.whatsapp_sent;
                
                // Disabled state flags
                const isPaidFreeOrAbsent = status === 'paid' || status === 'free' || status === 'absent';

                return (
                  <div key={className} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-200">{className}</span>
                      <div className="flex gap-1 items-center">
                        {isWhatsAppSent && status === 'unpaid' && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">WhatsApp Sent</span>}
                        {isReminderSent && status === 'unpaid' && <span className="text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded animate-pulse">Reminder Sent</span>}
                      </div>
                    </div>
                    
                    {/* 4 buttons instead of 3 for status */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'paid')} className={`py-1 rounded-md text-[11px] font-bold transition-all ${status === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Paid</button>
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'free')} className={`py-1 rounded-md text-[11px] font-bold transition-all ${status === 'free' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Free</button>
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'absent')} className={`py-1 rounded-md text-[11px] font-bold transition-all ${status === 'absent' ? 'bg-slate-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Absent</button>
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'unpaid')} className={`py-1 rounded-md text-[11px] font-bold transition-all ${status === 'unpaid' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Unpaid</button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      <button 
                        onClick={() => sendWhatsApp(activeModal.student, activeModal.month, className)} 
                        disabled={isPaidFreeOrAbsent || isWhatsAppSent}
                        className={`w-full py-1.5 text-[10px] rounded-md flex flex-col items-center justify-center gap-0.5 border transition-all ${
                          isPaidFreeOrAbsent 
                            ? 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed opacity-50' 
                            : isWhatsAppSent
                              ? 'bg-emerald-900/20 border-emerald-900/40 text-emerald-600 cursor-not-allowed'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-green-400'
                        }`}
                      >
                        <MessageCircle size={12} /> {isPaidFreeOrAbsent ? 'WhatsApp (අක්‍රියයි)' : isWhatsAppSent ? 'WhatsApp යවා ඇත' : 'WhatsApp යවන්න'}
                      </button>

                      <button 
                        onClick={() => sendDashboardReminder(activeModal.student.id, activeModal.month, className)} 
                        disabled={isPaidFreeOrAbsent || isReminderSent}
                        className={`w-full py-1.5 text-[10px] rounded-md flex flex-col items-center justify-center gap-0.5 border transition-all ${
                          isPaidFreeOrAbsent 
                            ? 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed opacity-50' 
                            : isReminderSent
                              ? 'bg-amber-900/30 border-amber-900/50 text-amber-600 cursor-not-allowed'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-400'
                        }`}
                      >
                        <LayoutDashboard size={12} /> {isPaidFreeOrAbsent ? 'Dashboard (අක්‍රියයි)' : isReminderSent ? 'Reminder යවා ඇත' : 'Dashboard යවන්න'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {(activeModal.student.class_types || []).length > 1 && (() => {
                const studentClasses = activeModal.student.class_types || [];
                const unpaidClasses = studentClasses.filter((c: string) => {
                  const status = payments.find((p: any) => p.record_id === `${activeModal.student.id}_${activeModal.month}_${c}`)?.status;
                  return status !== 'paid' && status !== 'free' && status !== 'absent';
                });
                
                const isFullyPaid = unpaidClasses.length === 0;
                
                const isAllWhatsAppSent = unpaidClasses.length > 0 && unpaidClasses.every((c: string) => {
                  return payments.find((p: any) => p.record_id === `${activeModal.student.id}_${activeModal.month}_${c}`)?.whatsapp_sent;
                });

                const isAllRemindersSent = unpaidClasses.length > 0 && unpaidClasses.every((c: string) => {
                  return payments.find((p: any) => p.record_id === `${activeModal.student.id}_${activeModal.month}_${c}`)?.reminder_sent;
                });

                return (
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                    <span className="text-[10px] text-slate-500 mb-1 block text-center">සියලුම පන්ති සඳහා පොදු ක්‍රියාමාර්ග</span>
                    <button 
                      onClick={() => sendWhatsApp(activeModal.student, activeModal.month, null)} 
                      disabled={isFullyPaid || isAllWhatsAppSent}
                      className={`w-full py-1.5 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 border ${
                        isFullyPaid || isAllWhatsAppSent
                          ? 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed opacity-50' 
                          : 'bg-slate-800 hover:bg-slate-700 text-green-400 border-slate-700'
                      }`}
                    >
                      <MessageCircle size={13} /> {isFullyPaid ? 'සියලුම පන්ති ගෙවා ඇත/Absent' : isAllWhatsAppSent ? 'සියලුම පන්තිවලට WhatsApp යවා ඇත' : 'සියලුම පන්ති වලට WhatsApp බිල්පත'}
                    </button>
                    <button 
                      onClick={() => sendDashboardReminder(activeModal.student.id, activeModal.month, null)} 
                      disabled={isFullyPaid || isAllRemindersSent}
                      className={`w-full py-1.5 font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 border ${
                        isFullyPaid || isAllRemindersSent
                          ? 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed opacity-50' 
                          : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      <Bell size={13} /> {isFullyPaid ? 'සියලුම පන්ති ගෙවා ඇත/Absent' : isAllRemindersSent ? 'සියලුම පන්තිවලට Reminder යවා ඇත' : 'සියලුම පන්ති වලට Dashboard Reminder'}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}