import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Calendar, MessageSquare, Plus, Trash2, CheckCircle, AlertCircle, ShieldAlert, BookOpen } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  username: string;
  nic?: string;
  whatsapp?: string;
  is_approved: boolean;
  isApproved?: boolean;
  registered_classes?: string[];
  active_months?: string[];
  free_months?: string[];
}

interface CalendarEvent {
  class_name: string;
  month_key: string; // YYYY-MM
  last_class_date: string; // YYYY-MM-DD
}

export default function AdminPaymentManager({ students, setStudents }: { students: Student[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [globalClasses, setGlobalClasses] = useState<string[]>([]);
  const [classFees, setClassFees] = useState<{ [key: string]: number }>({});
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [calendarPlanner, setCalendarPlanner] = useState<CalendarEvent[]>([]);
  const [newClassInput, setNewClassInput] = useState<{ [studentId: string]: string }>({});

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

  // 1. Global Configuration සහ Class Calendar Planner දත්ත ලබා ගැනීම
  useEffect(() => {
    const fetchInitialData = async () => {
      // Rates ලබාගැනීම
      const { data: configData, error: configError } = await supabase.from('site_config').select('class_rates_text').eq('id', 1).single();
      if (!configError && configData?.class_rates_text) {
        const feesMap: { [key: string]: number } = {};
        const classes = configData.class_rates_text.split(',').map((item: string) => {
          const parts = item.split(':');
          const className = parts[0].trim();
          const fee = parts[1] ? parseInt(parts[1].trim()) : 0;
          feesMap[className] = fee;
          return className;
        });
        setGlobalClasses(classes);
        setClassFees(feesMap);
      }

      // Class Calendar Planner දත්ත ලබාගැනීම
      const { data: calendarData, error: calendarError } = await supabase.from('class_calendar').select('*');
      if (!calendarError && calendarData) {
        setCalendarPlanner(calendarData);
      }
    };

    fetchInitialData();

    // රියල් ටයිම් අප්ඩේට් සවන්දීම
    const configSub = supabase.channel('public:site_config').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_config' }, () => { fetchInitialData(); }).subscribe();
    const calendarSub = supabase.channel('public:class_calendar').on('postgres_changes', { event: '*', schema: 'public', table: 'class_calendar' }, () => { fetchInitialData(); }).subscribe();

    return () => {
      supabase.removeChannel(configSub);
      supabase.removeChannel(calendarSub);
    };
  }, []);

  // සෙවුම් පෙරහන (Search Filter)
  const activeStudents = students.filter(s => {
    const isApproved = s.is_approved || s.isApproved;
    if (!isApproved) return false;
    return (
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 2. ශිෂ්‍යයෙකුගේ පන්ති එකතු කිරීම සහ ඉවත් කිරීම (Add / Remove Classes)
  const handleAddClass = async (studentId: string) => {
    const classToAdd = newClassInput[studentId];
    if (!classToAdd) return;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentClasses = student.registered_classes || [];
    if (currentClasses.includes(classToAdd)) {
      alert('මෙම පන්තිය දැනටමත් ඇතුළත් කර ඇත.');
      return;
    }

    const updatedClasses = [...currentClasses, classToAdd];

    const { error } = await supabase.from('students').update({ registered_classes: updatedClasses }).eq('id', studentId);
    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, registered_classes: updatedClasses } : s));
      setNewClassInput(prev => ({ ...prev, [studentId]: '' }));
    } else {
      alert('පන්තිය ඇතුළත් කිරීම අසාර්ථකයි: ' + error.message);
    }
  };

  const handleRemoveClass = async (studentId: string, className: string) => {
    if (!window.confirm(`මෙම සිසුවා ${className} පන්තියෙන් ඉවත් කිරීමට අවශ්‍යද?`)) return;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const updatedClasses = (student.registered_classes || []).filter(c => c !== className);

    const { error } = await supabase.from('students').update({ registered_classes: updatedClasses }).eq('id', studentId);
    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, registered_classes: updatedClasses } : s));
    } else {
      alert('පන්තිය ඉවත් කිරීම අසාර්ථකයි: ' + error.message);
    }
  };

  // 3. පේමන්ට් ස්ටේටස් වෙනස් කිරීම
  const handleStatusChange = async (studentId: string, className: string, monthKey: string, newStatus: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentPaid = [...(student.active_months || [])];
    let currentFree = [...(student.free_months || [])];
    const paymentKey = `${className}:${monthKey}`;

    currentPaid = currentPaid.filter(m => m !== paymentKey);
    currentFree = currentFree.filter(m => m !== paymentKey);

    if (newStatus === 'paid') currentPaid.push(paymentKey);
    if (newStatus === 'free') currentFree.push(paymentKey);

    const { error } = await supabase.from('students').update({ active_months: currentPaid, free_months: currentFree }).eq('id', studentId);

    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, active_months: currentPaid, free_months: currentFree } : s));
    } else {
      alert("දත්ත යාවත්කාලීන කිරීම අසාර්ථකයි: " + error.message);
    }
  };

  // 4. දින දර්ශනය අනුව වත්මන් හෝ ඉදිරි මාසයේ බිල්පත් තත්ත්වය ස්වයංක්‍රීයව හඳුනාගැනීම
  const getAutomatedBillingDetails = (studentClasses: string[]) => {
    const today = new Date();
    const currentYearNum = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1; // 1 - 12
    const currentMonthKey = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`;
    
    // ඊළඟ මාසය ගණනය කිරීම
    const nextMonthObj = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthKey = `${nextMonthObj.getFullYear()}-${String(nextMonthObj.getMonth() + 1).padStart(2, '0')}`;

    let isAdvanceBilling = false;

    // ශිෂ්‍යයා ලියාපදිංචි වී ඇති පන්තිවලින් අවසන් පන්ති දිනය පරීක්ෂා කිරීම
    studentClasses.forEach(className => {
      const planner = calendarPlanner.find(p => p.class_name === className && p.month_key === currentMonthKey);
      if (planner?.last_class_date) {
        const lastClassDate = new Date(planner.last_class_date);
        // අද දිනය අවසන් පන්ති දිනය හෝ ඊට පසුව නම් ඉදිරි මාසයේ බිල සක්‍රීය වේ
        if (today >= lastClassDate) {
          isAdvanceBilling = true;
        }
      }
    });

    const targetMonthKey = isAdvanceBilling ? nextMonthKey : currentMonthKey;
    const targetMonthText = monthsArray.find(m => `${currentYearNum}-${m.id}` === targetMonthKey || `${nextMonthObj.getFullYear()}-${m.id}` === targetMonthKey)?.si || '';
    const targetYear = targetMonthKey.split('-')[0];

    return {
      targetMonthKey,
      targetMonthText,
      targetYear,
      isAdvanceBilling
    };
  };

  // 5. ඒකාබද්ධ WhatsApp පණිවිඩයක් ජෙනරේට් කර යැවීම (Consolidated Bill)
  const triggerWhatsAppBill = (student: Student) => {
    const phone = student.whatsapp || '';
    if (!phone) {
      alert('මෙම සිසුවාට WhatsApp අංකයක් ඇතුළත් කර නැත.');
      return;
    }

    const myClasses = student.registered_classes || [];
    if (myClasses.length === 0) {
      alert('මෙම සිසුවා තවමත් කිසිදු පන්තියකට ලියාපදිංචි වී නැත.');
      return;
    }

    const { targetMonthText, targetYear, isAdvanceBilling } = getAutomatedBillingDetails(myClasses);

    let totalBillAmount = 0;
    let classBreakdownText = '';

    myClasses.forEach(cName => {
      const fee = classFees[cName] || 0;
      totalBillAmount += fee;
      classBreakdownText += `▪️ *${cName}:* ਰੁ. ${fee}/=\n`;
    });

    // පණිවිඩයේ වර්ගය ස්වයංක්‍රීයව වෙනස් වීම
    const headerTitle = isAdvanceBilling 
      ? `*🔔 ඉදිරි මාසය සඳහා පන්ති ගාස්තු කාරුණික මතක් කිරීමයි (Advance Bill)*` 
      : `*⚠️ වත්මන් මාසයේ පන්ති ගාස්තු හිඟ මුදල් පිළිබඳ නිවේදනයයි (Overdue Bill)*`;

    const noteText = isAdvanceBilling
      ? `වත්මන් මාසයේ පන්ති කටයුතු අවසන් බැවින්, ඉදිරි මාසයේ පන්ති වීඩියෝ, ටියුට් සහ ප්‍රශ්න පත්‍ර කිසිදු බාධාවකින් තොරව ලබාගැනීමට පහත ගාස්තු ගෙවා පන්ති කාඩ්පත යාවත්කාලීන කරගන්න.`
      : `ඔබ මෙතෙක් වත්මන් මාසයට අදාළ පන්ති ගාස්තු ගෙවා නොමැති නම්, කරුණාකර ඔබගේ ගෙවීම් කටයුතු කඩිනමින් සිදුකර පන්ති ප්‍රවේශය අඛණ්ඩව ලබාගන්න.`;

    const message = `${headerTitle}\n\n` +
      `👤 *සිසුවාගේ නම:* ${student.name}\n` +
      `🆔 *NIC අංකය:* ${student.nic || 'ඇතුළත් කර නැත'}\n` +
      `🔑 *යූසර්නේම් (Username):* @${student.username}\n` +
      `📅 *අදාළ කාලසීමාව:* ${targetYear} ${targetMonthText}\n\n` +
      `*💳 ලියාපදිංචි පන්ති සහ බිල්පත් විස්තර:*\n${classBreakdownText}\n` +
      `💰 *ගෙවිය යුතු මුළු මුදල (Grand Total):* රු. ${totalBillAmount}/=\n\n` +
      `${noteText}\n\nස්තූතියි!`;

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-8 text-slate-100">
      {/* 🔍 සෙවුම් සහ වර්ෂ තේරීමේ තීරුව */}
      <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between shadow-2xl backdrop-blur-md">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="නම, යූසර්නේම් හෝ NIC මගින් සිසුන් සොයන්න..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-white text-xs focus:outline-none focus:border-blue-500 transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800">
          <Calendar size={16} className="text-blue-500" />
          <span className="text-xs text-slate-400 font-medium">පෙන්වන වර්ෂය:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-transparent border-none text-white text-xs font-bold focus:outline-none font-mono cursor-pointer"
          >
            <option value="2025" className="bg-slate-950">2025</option>
            <option value="2026" className="bg-slate-950">2026</option>
            <option value="2027" className="bg-slate-950">2027</option>
          </select>
        </div>
      </div>

      {/* 📊 ප්‍රධාන මාස්ටර් පැනලය */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold uppercase tracking-wider">
                <th className="p-4 text-left w-[25%]">සිසුවා සහ ලියාපදිංචි පන්ති</th>
                <th className="p-4 text-left w-[75%]">මාසික පන්ති කාඩ්පත් සහ ගෙවීම් පාලනය ({selectedYear})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {activeStudents.map(st => {
                const myClasses = st.registered_classes || [];
                const paidMonths = st.active_months || [];
                const freeMonths = st.free_months || [];
                const billingInfo = getAutomatedBillingDetails(myClasses);

                return (
                  <tr key={st.id} className="hover:bg-slate-900/30 transition duration-150">
                    {/* 👤 සිසුවාගේ විස්තර සහ පන්ති කළමනාකරණය */}
                    <td className="p-4 space-y-3 bg-slate-950/20 valign-top">
                      <div>
                        <div className="font-bold text-white text-sm">{st.name}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-lg text-[10px] border border-blue-500/20 font-mono">@{st.username}</span>
                          <span className="text-slate-500 text-[10px] bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">NIC: {st.nic || 'N/A'}</span>
                        </div>
                      </div>

                      {/* පන්ති එකතු කිරීම සහ ඉවත් කිරීමේ UI කොටස */}
                      <div className="border-t border-slate-800/80 pt-2 space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold block">ලියාපදිංචි පන්ති වර්ග:</span>
                        {myClasses.length === 0 ? (
                          <div className="text-[10px] text-amber-500 italic flex items-center gap-1">
                            <AlertCircle size={12} /> පන්ති කිසිවක් ඇතුළත් කර නැත.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {myClasses.map(c => (
                              <span key={c} className="bg-slate-950 text-slate-300 pl-2 pr-1 py-1 rounded-xl border border-slate-800 flex items-center gap-1 text-[10px]">
                                {c}
                                <button 
                                  onClick={() => handleRemoveClass(st.id, c)}
                                  className="text-red-400 hover:text-red-300 p-0.5 rounded transition"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* අලුතින් පන්ති ඇතුළත් කිරීමේ Dropdown එක */}
                        <div className="flex gap-1.5 mt-2">
                          <select
                            value={newClassInput[st.id] || ''}
                            onChange={(e) => setNewClassInput(prev => ({ ...prev, [st.id]: e.target.value }))}
                            className="bg-slate-950 border border-slate-800 text-[10px] rounded-xl px-2 py-1 text-slate-300 focus:outline-none w-full"
                          >
                            <option value="">-- පන්තියක් තෝරන්න --</option>
                            {globalClasses.map(gc => (
                              <option key={gc} value={gc}>{gc}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddClass(st.id)}
                            className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded-xl transition flex items-center justify-center shrink-0"
                            title="පන්තිය ඇතුළත් කරන්න"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* ස්වයංක්‍රීය WhatsApp බිල්පත් බටනය */}
                      <div className="pt-1">
                        <button
                          onClick={() => triggerWhatsAppBill(st)}
                          className="w-full bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white rounded-xl py-1.5 px-3 font-bold transition flex items-center justify-center gap-1.5 text-[10px]"
                        >
                          <MessageSquare size={12} />
                          WhatsApp බිල්පත (Auto Month)
                        </button>
                        <div className="text-[9px] text-slate-500 mt-1 text-center font-mono">
                          Next Action: {billingInfo.isAdvanceBilling ? `Advance (${billingInfo.targetMonthText})` : `Overdue (${billingInfo.targetMonthText})`}
                        </div>
                      </div>
                    </td>

                    {/* 🎫 ලොග් කාඩ්පත (සිසුවාගේ පන්ති අනුව පමණක් කාඩ්පත් නිර්මාණය වේ) */}
                    <td className="p-4 space-y-3 bg-slate-900/10">
                      {myClasses.length === 0 ? (
                        <div className="text-slate-600 italic text-[11px] py-4 text-center bg-slate-950/20 rounded-2xl border border-dashed border-slate-800">
                          කාඩ්පත් දර්ශනය වීමට සිසුවා පන්තියකට ලියාපදිංචි කරන්න.
                        </div>
                      ) : (
                        myClasses.map((studentClass: string) => {
                          const today = new Date();
                          const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

                          return (
                            <div key={studentClass} className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80 flex flex-col xl:flex-row items-start xl:items-center gap-3 justify-between">
                              <div className="min-w-[140px] max-w-[180px]">
                                <span className="text-slate-300 font-bold text-[11px] block truncate">{studentClass}</span>
                                <span className="text-[10px] text-slate-500 font-mono">රු. {classFees[studentClass] || 0}/=</span>
                              </div>
                              
                              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 w-full">
                                {monthsArray.map(m => {
                                  const monthKey = `${selectedYear}-${m.id}`;
                                  const paymentKey = `${studentClass}:${monthKey}`;
                                  
                                  let status = 'unpaid';
                                  if (paidMonths.includes(paymentKey)) status = 'paid';
                                  else if (freeMonths.includes(paymentKey)) status = 'free';

                                  // වත්මන් මාසය සඳහා වන ප්‍රවේශ නීති පරීක්ෂාව
                                  const isCurrentMonth = monthKey === currentMonthKey;
                                  const isRestricted = isCurrentMonth && status === 'unpaid';

                                  return (
                                    <div 
                                      key={m.id} 
                                      className={`flex flex-col items-center justify-between p-1.5 rounded-xl border transition-all ${
                                        status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                        status === 'free' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                        isRestricted ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 animate-pulse' :
                                        'bg-slate-950 border-slate-800/80 text-slate-500'
                                      }`}
                                    >
                                      <span className="font-bold text-[9px] uppercase font-mono">{m.name}</span>
                                      
                                      <select
                                        value={status}
                                        onChange={(e) => handleStatusChange(st.id, studentClass, monthKey, e.target.value)}
                                        className={`mt-1.5 text-[9px] font-bold bg-transparent border-none focus:outline-none w-full text-center cursor-pointer ${
                                          status === 'paid' ? 'text-emerald-400' : status === 'free' ? 'text-blue-400' : 'text-rose-400/80'
                                        }`}
                                      >
                                        <option value="unpaid" className="bg-slate-950 text-red-400">Unpaid</option>
                                        <option value="paid" className="bg-slate-950 text-emerald-400">Paid</option>
                                        <option value="free" className="bg-slate-950 text-blue-400">Free</option>
                                      </select>

                                      {/* සිසුවාට පෙනෙන ඇක්සස් ස්ටේටස් එක ඇඩ්මින්ට මෙහි පෙන්වයි */}
                                      <div className="mt-1 w-full text-center border-t border-slate-800/40 pt-1 text-[8px] font-medium">
                                        {status === 'paid' || status === 'free' ? (
                                          <span className="text-emerald-500 flex items-center justify-center gap-0.5"><BookOpen size={8} /> Full</span>
                                        ) : (
                                          <span className="text-amber-500 flex items-center justify-center gap-0.5" title="ගෙවූ මාසවල ටියුට්/වීඩියෝ පමණක් ඇක්ටිව් වේ"><ShieldAlert size={8} /> Restr.</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}