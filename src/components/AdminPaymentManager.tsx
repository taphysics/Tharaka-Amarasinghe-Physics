import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Layers, Calendar, Bell, MessageSquare } from 'lucide-react';

export default function AdminPaymentManager({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [globalClasses, setGlobalClasses] = useState<string[]>([]);
  const [classFees, setClassFees] = useState<{ [key: string]: string }>({});
  const [selectedYear, setSelectedYear] = useState<string>('2026'); // Default Year 2026

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

  // 1. Global Config එකෙන් පන්ති සහ ගාස්තු නිවැරදිව සින්ක් කරගැනීම
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
      } else {
        setGlobalClasses(['2027 Theory', '2027 Revision']);
        setClassFees({ '2027 Theory': '2500', '2027 Revision': '3000' });
      }
    };
    fetchGlobalConfig();
  }, []);

  // 2. ඇක්ටිව් සිසුන් ෆිල්ටර් කර ගැනීම
  const activeStudents = students.filter(s => {
    const isApproved = s.is_approved || s.isApproved;
    if (!isApproved) return false;

    return (
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 3. Dropdown එක මගින් Status එක වෙනස් කරන ප්‍රධාන ලොජික් එක
  const handleStatusChange = async (studentId: string, className: string, monthKey: string, newStatus: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentPaid = [...(student.active_months || student.activeMonths || [])];
    let currentFree = [...(student.free_months || student.freeMonths || [])];
    const paymentKey = `${className}:${monthKey}`;

    currentPaid = currentPaid.filter(m => m !== paymentKey);
    currentFree = currentFree.filter(m => m !== paymentKey);

    if (newStatus === 'paid') currentPaid.push(paymentKey);
    if (newStatus === 'free') currentFree.push(paymentKey);

    const { error } = await supabase
      .from('students')
      .update({ active_months: currentPaid, free_months: currentFree })
      .eq('id', studentId);

    if (error) {
      alert("යාවත්කාලීන කිරීම අසාර්ථකයි: " + error.message);
    } else {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, active_months: currentPaid, activeMonths: currentPaid, free_months: currentFree, freeMonths: currentFree } : s));
    }
  };

  // 4. සිසුවාගේ පන්ති මැනුවල් ලෙස ඇඩ්/රිමූව් කිරීම
  const handleToggleStudentClass = async (studentId: string, className: string, currentClasses: string[]) => {
    let updatedClasses = [...currentClasses];
    if (updatedClasses.includes(className)) {
      updatedClasses = updatedClasses.filter(c => c !== className);
    } else {
      updatedClasses.push(className);
    }

    const { error } = await supabase.from('students').update({ class_types: updatedClasses }).eq('id', studentId);
    if (!error) {
      setStudents((prev: any) => prev.map((s: any) => s.id === studentId ? { ...s, class_types: updatedClasses, classTypes: updatedClasses } : s));
    }
  };

  // 5. Dashboard Reminder එකක් යැවීම
  const sendDashboardReminder = async (student: any, className: string, monthKey: string) => {
    const currentReminders = [...(student.dashboard_reminders || [])];
    const reminderKey = `${className}:${monthKey}`;

    if (currentReminders.includes(reminderKey)) {
      alert('මෙම මාසය සඳහා දැනටමත් Dashboard මතක් කිරීමක් යවා ඇත.');
      return;
    }

    currentReminders.push(reminderKey);
    const { error } = await supabase.from('students').update({ dashboard_reminders: currentReminders }).eq('id', student.id);

    if (!error) {
      alert(`${className} (${monthKey}) සඳහා සාර්ථකව Dashboard එකට මතක් කිරීමක් යැවුවා!`);
      setStudents((prev: any) => prev.map((s: any) => s.id === student.id ? { ...s, dashboard_reminders: currentReminders } : s));
    }
  };

  // 6. WhatsApp Reminder එකක් සකසා වෙනත් ටැබ් එකක ඕපන් කිරීම
  const sendWhatsAppReminder = (student: any, className: string, monthObj: any, year: string) => {
    const phone = student.whatsapp || '';
    if (!phone) {
      alert('මෙම සිසුවාට වට්ස්ඇප් අංකයක් ඇතුලත් කර නැත.');
      return;
    }
    const fee = classFees[className] || '0';
    
    const message = `*පන්ති ගෙවීම් මතක් කිරීමයි!* 🔔\n\n` +
                    `👤 *සිසුවාගේ නම:* ${student.name}\n` +
                    `🔑 *Username:* ${student.username}\n` +
                    `📚 *පන්ති වර්ගය:* ${className}\n` +
                    `📅 *අදාළ මාසය:* ${year} ${monthObj.si} (${year}-${monthObj.id})\n` +
                    `💰 *පන්ති ගාස්තුව:* රු. ${fee}/=\n\n` +
                    `ඔබ මෙම මාසය සඳහා තවමත් ගෙවීම් සිදුකර නොමැති නම් කරුණාකර හැකි ඉක්මනින් ගෙවීම් කටයුතු සිදුකර පන්තියට සම්බන්ධ වන්න. ස්තූතියි!`;

    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* 🔍 සෙවුම් සහ අවුරුදු තේරීමේ තීරුව */}
      <div className="bg-slate-900/60 p-4 rounded-3xl border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="නම, යූසර්නේම්, NIC මගින් සොයන්න..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
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
            <option value="2028">2028</option>
          </select>
        </div>
      </div>

      {/* 📊 ප්‍රධාන මාස්ටර් වගුව */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold">
                <th className="p-4 w-[20%]">සිසුවාගේ විස්තර</th>
                <th className="p-4 w-[20%]">ඇතුළත් පන්ති වර්ග</th>
                <th className="p-4 w-[60%]">මාස 12 ලොග් කාඩ්පත ({selectedYear})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {activeStudents.map(st => {
                const studentClasses = st.class_types || st.classTypes || [];
                const paidMonths = st.active_months || st.activeMonths || [];
                const freeMonths = st.free_months || st.freeMonths || [];

                return (
                  <tr key={st.id} className="hover:bg-slate-900/20 transition">
                    {/* 👤 විස්තර */}
                    <td className="p-4 space-y-1">
                      <div className="font-bold text-white text-sm">{st.name}</div>
                      <div className="flex flex-col gap-1">
                        <span className="bg-slate-950 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20 font-mono w-max">{st.username}</span>
                        <span className="text-slate-500 text-[10px]">NIC: {st.nic || 'N/A'}</span>
                      </div>
                    </td>

                    {/* 📚 පන්ති වර්ග */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {globalClasses.map(cls => {
                          const isEnrolled = studentClasses.includes(cls);
                          return (
                            <button
                              key={cls}
                              onClick={() => handleToggleStudentClass(st.id, cls, studentClasses)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition flex items-center gap-1 cursor-pointer border ${
                                isEnrolled 
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 font-bold' 
                                  : 'bg-slate-950 text-slate-600 border-transparent hover:border-slate-800'
                              }`}
                            >
                              <Layers size={10} />
                              {cls}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* 🎫 මාස 12 ග්‍රිඩ් එක */}
                    <td className="p-4 space-y-3">
                      {studentClasses.length === 0 ? (
                        <span className="text-slate-600 italic text-[11px]">කිසිදු පන්තියක් තෝරාගෙන නැත.</span>
                      ) : (
                        studentClasses.map((studentClass: string) => (
                          <div key={studentClass} className="bg-slate-950/40 p-2 rounded-2xl border border-slate-800/60 flex flex-col xl:flex-row items-start xl:items-center gap-3 justify-between">
                            <span className="text-slate-400 font-bold text-[11px] min-w-[110px] truncate">{studentClass}</span>
                            
                            {/* මාස 12 කොටු ටේබල් එක */}
                            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 w-full">
                              {monthsArray.map(m => {
                                const monthKey = `${selectedYear}-${m.id}`;
                                const paymentKey = `${studentClass}:${monthKey}`;
                                
                                let status = 'unpaid';
                                if (paidMonths.includes(paymentKey)) status = 'paid';
                                else if (freeMonths.includes(paymentKey)) status = 'free';

                                return (
                                  <div 
                                    key={m.id} 
                                    className={`flex flex-col items-center justify-between p-1 rounded-xl border transition-all ${
                                      status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/5' :
                                      status === 'free' ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-md shadow-blue-500/5' :
                                      'bg-slate-950 border-slate-800 text-slate-500'
                                    }`}
                                  >
                                    <span className="font-bold text-[10px] uppercase font-mono">{m.name}</span>
                                    
                                    <select
                                      value={status}
                                      onChange={(e) => handleStatusChange(st.id, studentClass, monthKey, e.target.value)}
                                      className={`mt-1 text-[9px] font-bold rounded px-0.5 py-0.5 bg-transparent border-none focus:outline-none w-full cursor-pointer text-center ${
                                        status === 'paid' ? 'text-emerald-400' :
                                        status === 'free' ? 'text-blue-400' :
                                        'text-red-400/80'
                                      }`}
                                    >
                                      <option value="unpaid" className="bg-slate-950 text-red-400">Unpaid</option>
                                      <option value="paid" className="bg-slate-950 text-emerald-400">Paid</option>
                                      <option value="free" className="bg-slate-950 text-blue-400">Free</option>
                                    </select>

                                    {/* Unpaid නම් පමණක් පෙන්වන Reminder Icons (Fix: Wrapped inside HTML spans to bypass TS error) */}
                                    {status === 'unpaid' && (
                                      <div className="flex gap-1.5 mt-1 border-t border-slate-800/60 pt-1 w-full justify-center">
                                        <span 
                                          title="Dashboard Reminder" 
                                          onClick={() => sendDashboardReminder(st, studentClass, monthKey)} 
                                          className="cursor-pointer text-amber-500 hover:text-amber-400"
                                        >
                                          <Bell size={10} />
                                        </span>
                                        <span 
                                          title="WhatsApp Reminder" 
                                          onClick={() => sendWhatsAppReminder(st, studentClass, m, selectedYear)} 
                                          className="cursor-pointer text-emerald-500 hover:text-emerald-400"
                                        >
                                          <MessageSquare size={10} />
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
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