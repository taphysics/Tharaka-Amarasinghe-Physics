import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Calendar, Bell, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

export default function AdminPaymentManager({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [globalClasses, setGlobalClasses] = useState<string[]>([]);
  const [classFees, setClassFees] = useState<{ [key: string]: string }>({});
  const [selectedYear, setSelectedYear] = useState<string>('2026');

  const monthsArray = [
    { id: '01', name: 'Jan', si: 'ජනවාරි' },
    { id: '02', name: 'Feb', si: 'පෙබරවාරි' },
    { id: '03', name: 'Mar', si: 'මාර්තු' },
    { id: '04', name: 'Apr', si: 'අප්‍රේල්' },
    { id: '05', name: 'May', si: 'මැයි' },
    { id: '06', name: 'Jun', si: 'ජූනි' },
    { id: '07', name: 'Jul', si: 'ජූලි' },
    { id: '08', name: 'Aug', si: 'අගෝස්තු' },
    { id: '09', name: 'Sep', si: 'සැප්තැම්බර්' },
    { id: '10', name: 'Oct', si: 'ඔක්තෝබර්' },
    { id: '11', name: 'Nov', si: 'නොවැම්බර්' },
    { id: '12', name: 'Dec', si: 'දෙසැම්බර්' }
  ];

  // 1. Global Config එකෙන් සෑම තැනකම රියල්-ටයිම් අප්ඩේට් වන ලෙස දත්ත ලබාගැනීම
  useEffect(() => {
    const fetchGlobalConfig = async () => {
      const { data, error } = await supabase.from('site_config').select('class_rates_text').eq('id', 1).single();
      if (!error && data?.class_rates_text) {
        const feesMap: { [key: string]: string } = {};
        const classes = data.class_rates_text.split(',').map((item: string) => {
          const parts = item.split(':');
          const className = parts[0].trim();
          const fee = parts[1] ? parts[1].trim() : '0';
          feesMap[className] = fee;
          return className;
        });
        setGlobalClasses(classes);
        setClassFees(feesMap);
      }
    };

    fetchGlobalConfig();
    
    // Realtime Subscription (Fix: 'scheme' changed to 'schema')
    const configSubscription = supabase
      .channel('public:site_config')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_config' }, () => {
        fetchGlobalConfig();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(configSubscription);
    };
  }, []);

  const activeStudents = students.filter(s => {
    const isApproved = s.is_approved || s.isApproved;
    if (!isApproved) return false;
    return (
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 2. ගෙවීම් තත්ත්වයන් වෙනස් කිරීම (Paid / Free / Unpaid)
  const handleStatusChange = async (studentId: string, className: string, monthKey: string, newStatus: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentPaid = [...(student.active_months || [])];
    let currentFree = [...(student.free_months || [])];
    let currentDbReminders = [...(student.dashboard_reminders || [])];
    let currentWaReminders = [...(student.whatsapp_reminders || [])];
    
    const paymentKey = `${className}:${monthKey}`;

    // පරණ දත්ත ඉවත් කිරීම
    currentPaid = currentPaid.filter(m => m !== paymentKey);
    currentFree = currentFree.filter(m => m !== paymentKey);

    if (newStatus === 'paid') {
      currentPaid.push(paymentKey);
      // ගෙවීම් කල පසු රිමයින්ඩර්ස් ඔටෝම ක්ලියර් කිරීම
      currentDbReminders = currentDbReminders.filter(r => !r.startsWith(`${paymentKey}:`));
      currentWaReminders = currentWaReminders.filter(r => !r.startsWith(`${paymentKey}:`));
    }
    if (newStatus === 'free') {
      currentFree.push(paymentKey);
      currentDbReminders = currentDbReminders.filter(r => !r.startsWith(`${paymentKey}:`));
      currentWaReminders = currentWaReminders.filter(r => !r.startsWith(`${paymentKey}:`));
    }

    const { error } = await supabase
      .from('students')
      .update({ 
        active_months: currentPaid, 
        free_months: currentFree,
        dashboard_reminders: currentDbReminders,
        whatsapp_reminders: currentWaReminders
      })
      .eq('id', studentId);

    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { 
        ...s, 
        active_months: currentPaid, 
        free_months: currentFree,
        dashboard_reminders: currentDbReminders,
        whatsapp_reminders: currentWaReminders
      } : s));
    }
  };

  // Helper: වත්මන් රිමයින්ඩර් මට්ටම සෙවීම (Dashboard හෝ WhatsApp)
  const getReminderLevel = (remindersArray: string[], className: string, monthKey: string) => {
    const prefix = `${className}:${monthKey}:`;
    const found = remindersArray?.find(r => r.startsWith(prefix));
    return found ? parseInt(found.split(':')[2]) : 0;
  };

  // 3. Dashboard Multi-Level Reminder ලොජික් එක (1, 2, 3)
  const triggerDashboardReminder = async (student: any, className: string, monthKey: string) => {
    let currentReminders = [...(student.dashboard_reminders || [])];
    const prefix = `${className}:${monthKey}:`;
    const currentLevel = getReminderLevel(currentReminders, className, monthKey);
    
    if (currentLevel >= 3) {
      alert('මෙම මාසය සඳහා අවසාන නිවේදනය (Level 3) දැනටමත් යවා ඇත.');
      return;
    }

    const nextLevel = currentLevel + 1;
    // පරණ ලෙවල් එක අයින් කර නව ලෙවල් එක ඇතුලත් කිරීම
    currentReminders = currentReminders.filter(r => !r.startsWith(prefix));
    
    // Level 3 නම්, දින 3ක Countdown එකක් සක්‍රීය වීමට timestamp එකක්ද ඇතුලත් කරයි
    const reminderValue = nextLevel === 3 ? `${prefix}3:${Date.now()}` : `${prefix}${nextLevel}`;
    currentReminders.push(reminderValue);

    const { error } = await supabase.from('students').update({ dashboard_reminders: currentReminders }).eq('id', student.id);
    if (!error) {
      alert(`සාර්ථකයි! Level ${nextLevel} Dashboard රිමයින්ඩර් එක සිසුවාට යැවුවා.`);
      setStudents((prev: any) => prev.map((s: any) => s.id === student.id ? { ...s, dashboard_reminders: currentReminders } : s));
    }
  };

  // 4. WhatsApp Multi-Level Reminder ලොජික් එක (1, 2, 3)
  const triggerWhatsAppReminder = async (student: any, className: string, monthObj: any, year: string) => {
    const phone = student.whatsapp || '';
    if (!phone) {
      alert('මෙම සිසුවාට වට්ස්ඇප් අංකයක් නොමැත.');
      return;
    }
    const monthKey = `${year}-${monthObj.id}`;
    let currentWaReminders = [...(student.whatsapp_reminders || [])];
    const prefix = `${className}:${monthKey}:`;
    const currentLevel = getReminderLevel(currentWaReminders, className, monthKey);

    if (currentLevel >= 3) {
      alert('මෙම මාසය සඳහා අවසාන WhatsApp නිවේදනය දැනටමත් යවා ඇත.');
      return;
    }

    const nextLevel = currentLevel + 1;
    const fee = classFees[className] || '0';
    let message = '';

    if (nextLevel === 1) {
      message = `*පන්ති ගෙවීම් පිළිබඳ කාරුණික මතක් කිරීමයි (Level 01)* 🔔\n\n👤 *නම:* ${student.name}\n🔑 *Username:* ${student.username}\n📚 *පන්තිය:* ${className}\n📅 *මාසය:* ${year} ${monthObj.si}\n💰 *ගාස්තුව:* රු. ${fee}/=\n\nඔබ මෙම මාසය සඳහා තවමත් ගෙවීම් සිදුකර නොමැති නම් කරුණාකර හැකි ඉක්මනින් ගෙවීම් කටයුතු සිදුකරන්න. ස්තූතියි!`;
    } else if (nextLevel === 2) {
      message = `*දෙවන පන්ති ගෙවීම් මතක් කිරීමයි (Level 02)* ⚠️\n\n👤 *නම:* ${student.name}\n🔑 *Username:* ${student.username}\n📚 *පන්තිය:* ${className}\n📅 *මාසය:* ${year} ${monthObj.si}\n💰 *ගාස්තුව:* රු. ${fee}/=\n\nඔබගේ පන්ති වීඩියෝ (Recordings), නිබන්ධන (Tutes) සහ ප්‍රශ්න පත්‍ර (Papers) බාධාවකින් තොරව ලබාගැනීමට කරුණාකර ඔබගේ ගෙවීම් කටයුතු කඩිනමින් සිදුකරන්න.`;
    } else if (nextLevel === 3) {
      message = `*🚨 අවසාන නිවේදනයයි - ගිණුම තාවකාලිකව අත්හිටුවීම (Level 03)*\n\n👤 *නම:* ${student.name}\n🔑 *Username:* ${student.username}\n📚 *පන්තිය:* ${className}\n📅 *මාසය:* ${year} ${monthObj.si}\n\n*විශේෂ දැනුම්දීමයි:* ඔබ මෙම මාසය සදහා ගෙවීම් පැහැර හැර ඇති බැවින්, මෙම පණිවිඩය ලැබී *දින 3ක් (පැය 72ක්)* ඇතුලත ගෙවීම් සිදු නොකළහොත් ඔබගේ පන්ති ගිණුම තාවකාලිකව විසන්ධි වන බව කරුණාවෙන් සලකන්න.`;
    }

    // Database එකේ ලෙවල් එක අප්ඩේට් කිරීම
    currentWaReminders = currentWaReminders.filter(r => !r.startsWith(prefix));
    currentWaReminders.push(`${prefix}${nextLevel}`);
    
    const { error } = await supabase.from('students').update({ whatsapp_reminders: currentWaReminders }).eq('id', student.id);
    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === student.id ? { ...s, whatsapp_reminders: currentWaReminders } : s));
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  // 5. බ්ලොක් වී ඇති (Suspended) සිසුන් වෙන වෙනම හඳුනාගැනීම
  const suspendedStudentsList: any[] = [];
  students.forEach(st => {
    const isApproved = st.is_approved || st.isApproved;
    if (!isApproved) return;

    const dbReminders = st.dashboard_reminders || [];
    dbReminders.forEach((rem: string) => {
      const parts = rem.split(':');
      if (parts.length >= 4 && parts[2] === '3') {
        const className = parts[0];
        const monthKey = parts[1];
        const timestamp = parseInt(parts[3]);
        
        const paymentKey = `${className}:${monthKey}`;
        const isPaid = (st.active_months || []).includes(paymentKey) || (st.free_months || []).includes(paymentKey);
        const hoursPassed = (Date.now() - timestamp) / (1000 * 60 * 60);

        if (!isPaid && hoursPassed >= 72) {
          suspendedStudentsList.push({
            student: st,
            className,
            monthKey,
            hoursPassed: Math.floor(hoursPassed)
          });
        }
      }
    });
  });

  return (
    <div className="space-y-8">
      {/* 🔍 සෙවුම් තීරුව */}
      <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="නම, යූසර්නේම්, NIC මගින් සොයන්න..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white text-xs focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-blue-400" />
          <span className="text-xs text-slate-400 font-medium">කාඩ් පත් වර්ෂය:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none font-mono"
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
      </div>

      {/* 📊 ප්‍රධාන මාස්ටර් වගුව */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold">
                <th className="p-4 w-[25%]">සිසුවාගේ විස්තර</th>
                <th className="p-4 w-[75%]">මාස 12 ලොග් කාඩ්පත ({selectedYear})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {activeStudents.map(st => {
                const paidMonths = st.active_months || [];
                const freeMonths = st.free_months || [];

                return (
                  <tr key={st.id} className="hover:bg-slate-900/20 transition">
                    <td className="p-4 space-y-1">
                      <div className="font-bold text-white text-sm">{st.name}</div>
                      <div className="flex flex-col gap-1">
                        <span className="bg-slate-950 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-mono w-max">{st.username}</span>
                        <span className="text-slate-500 text-[10px]">NIC: {st.nic || 'N/A'}</span>
                      </div>
                    </td>

                    <td className="p-4 space-y-3">
                      {globalClasses.map((studentClass: string) => (
                        <div key={studentClass} className="bg-slate-950/40 p-2 rounded-2xl border border-slate-800/60 flex flex-col xl:flex-row items-start xl:items-center gap-3 justify-between">
                          <span className="text-slate-400 font-bold text-[11px] min-w-[120px] truncate">{studentClass}</span>
                          
                          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 w-full">
                            {monthsArray.map(m => {
                              const monthKey = `${selectedYear}-${m.id}`;
                              const paymentKey = `${studentClass}:${monthKey}`;
                              
                              let status = 'unpaid';
                              if (paidMonths.includes(paymentKey)) status = 'paid';
                              else if (freeMonths.includes(paymentKey)) status = 'free';

                              const dbLvl = getReminderLevel(st.dashboard_reminders, studentClass, monthKey);
                              const waLvl = getReminderLevel(st.whatsapp_reminders, studentClass, monthKey);

                              return (
                                <div 
                                  key={m.id} 
                                  className={`flex flex-col items-center justify-between p-1 rounded-xl border transition-all ${
                                    status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' :
                                    status === 'free' ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' :
                                    'bg-slate-950 border-slate-800 text-slate-500'
                                  }`}
                                >
                                  <span className="font-bold text-[10px] uppercase font-mono">{m.name}</span>
                                  
                                  <select
                                    value={status}
                                    onChange={(e) => handleStatusChange(st.id, studentClass, monthKey, e.target.value)}
                                    className={`mt-1 text-[9px] font-bold bg-transparent border-none focus:outline-none w-full text-center cursor-pointer ${
                                      status === 'paid' ? 'text-emerald-400' : status === 'free' ? 'text-blue-400' : 'text-red-400/80'
                                    }`}
                                  >
                                    <option value="unpaid" className="bg-slate-950 text-red-400">Unpaid</option>
                                    <option value="paid" className="bg-slate-950 text-emerald-400">Paid</option>
                                    <option value="free" className="bg-slate-950 text-blue-400">Free</option>
                                  </select>

                                  {status === 'unpaid' && (
                                    <div className="flex flex-col items-center w-full mt-1 border-t border-slate-800/40 pt-1 gap-1">
                                      <div className="flex justify-between w-full px-1 text-[8px] font-mono text-slate-500">
                                        <span className={dbLvl > 0 ? 'text-amber-400 font-bold' : ''}>D:{dbLvl}</span>
                                        <span className={waLvl > 0 ? 'text-emerald-400 font-bold' : ''}>W:{waLvl}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <span onClick={() => triggerDashboardReminder(st, studentClass, monthKey)} className="cursor-pointer text-amber-500 hover:text-amber-400">
                                          <Bell size={10} />
                                        </span>
                                        <span onClick={() => triggerWhatsAppReminder(st, studentClass, m, selectedYear)} className="cursor-pointer text-emerald-500 hover:text-emerald-400">
                                          <MessageSquare size={10} />
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🚨 6. තාවකාලිකව විසන්ධි වී ඇති ගිණුම් කළමනාකරණ පැනලය */}
      <div className="bg-slate-900/60 p-5 rounded-3xl border border-red-500/20 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={18} />
          <h3 className="font-bold text-sm">තාවකාලිකව විසන්ධි වී ඇති ගිණුම් ({suspendedStudentsList.length})</h3>
        </div>
        
        {suspendedStudentsList.length === 0 ? (
          <p className="text-xs text-slate-500 italic">දැනට කිසිදු සිසුවෙකුගේ ගිණුමක් විසන්ධි වී නැත.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suspendedStudentsList.map(({ student, className, monthKey, hoursPassed }) => (
              <div key={`${student.id}-${className}-${monthKey}`} className="bg-slate-950 p-4 rounded-2xl border border-red-500/30 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-white font-bold text-xs">{student.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">@{student.username} | {student.whatsapp}</div>
                  <div className="mt-2 bg-red-500/10 text-red-400 p-2 rounded-xl border border-red-500/20 text-[10px] font-medium">
                    ❌ බ්ලොක් වූ පන්තිය: <span className="font-bold text-white">{className}</span> ({monthKey})<br/>
                    ⏳ බ්ලොක් වී ගතවූ කාලය: <span className="font-bold text-white">{hoursPassed} Hours</span>
                  </div>
                </div>
                <button
                  onClick={() => handleStatusChange(student.id, className, monthKey, 'paid')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <CheckCircle size={12} />
                  Mark as Paid & Activate Account
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}