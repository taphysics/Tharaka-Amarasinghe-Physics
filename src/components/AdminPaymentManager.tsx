import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Check, X, Plus, Minus, Search } from 'lucide-react';

export default function AdminPaymentManager({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-06'); // ස්ක්‍රීන්ෂොට් එකේ ඇති පරිදි Default ජුනි
  const [selectedClass, setSelectedClass] = useState('All');
  const [newClassInput, setNewClassInput] = useState('');

  // 1. ඇක්ටිව් (Approved) සිසුන් පමණක් පෙරීම සහ සෙවීම් සිදුකිරීම
  const activeStudents = students.filter(s => {
    const isApproved = s.is_approved || s.isApproved;
    if (!isApproved) return false;

    // සෙවුම් පද වලට ගැලපේදැයි බැලීම
    const matchesSearch = 
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.whatsapp?.includes(searchTerm) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase());

    // පන්ති වර්ගය අනුව පෙරීම
    const classes = s.class_types || s.classTypes || [];
    const matchesClass = selectedClass === 'All' || classes.includes(selectedClass);

    return matchesSearch && matchesClass;
  });

  // 2. මාසික ගෙවීම් තත්ත්වය අනුව සිසුන් කොටස් 3කට වෙන් කිරීම (Logic)
  const unpaidStudents = activeStudents.filter(s => {
    const paidMonths = s.active_months || s.activeMonths || [];
    const freeMonths = s.free_months || s.freeMonths || [];
    return !paidMonths.includes(selectedMonth) && !freeMonths.includes(selectedMonth);
  });

  const paidStudents = activeStudents.filter(s => {
    const paidMonths = s.active_months || s.activeMonths || [];
    return paidMonths.includes(selectedMonth);
  });

  const freeStudents = activeStudents.filter(s => {
    const freeMonths = s.free_months || s.freeMonths || [];
    return freeMonths.includes(selectedMonth);
  });

  // 3. ගෙවීම් තත්ත්වයන් Database එකේ අප්ඩේට් කරන Function එක
  const updatePaymentStatus = async (studentId: string, targetColumn: 'paid' | 'free' | 'unpaid') => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentPaidMonths = [...(student.active_months || student.activeMonths || [])];
    let currentFreeMonths = [...(student.free_months || student.freeMonths || [])];

    // කලින් තිබුන තැන් වලින් අදාළ මාසය ඉවත් කිරීම
    currentPaidMonths = currentPaidMonths.filter(m => m !== selectedMonth);
    currentFreeMonths = currentFreeMonths.filter(m => m !== selectedMonth);

    // අලුත් තත්ත්වය අනුව මාසය ඇතුලත් කිරීම
    if (targetColumn === 'paid') currentPaidMonths.push(selectedMonth);
    if (targetColumn === 'free') currentFreeMonths.push(selectedMonth);

    // Supabase අප්ඩේට් කිරීම (Snake case සහ Camel case දෙකටම ඔරොත්තු දෙන පරිදි)
    const { error } = await supabase
      .from('students')
      .update({
        active_months: currentPaidMonths,
        free_months: currentFreeMonths
      })
      .eq('id', studentId);

    if (error) {
      alert("ගෙවීම් යාවත්කාලීන කිරීම අසාර්ථකයි: " + error.message);
    } else {
      // Local State එක එවලේම අප්ඩේට් කිරීම (තිරය එවලේම මාරු වේ)
      setStudents((prev: any) => prev.map((s: any) => {
        if (s.id === studentId) {
          return { ...s, active_months: currentPaidMonths, activeMonths: currentPaidMonths, free_months: currentFreeMonths, freeMonths: currentFreeMonths };
        }
        return s;
      }));
    }
  };

  // 4. මැනුවල් පන්ති ඇතුලත් කිරීම හෝ ඉවත් කිරීම (Class Management)
  const handleClassManagement = async (studentId: string, action: 'add' | 'remove', className: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let currentClasses = [...(student.class_types || student.classTypes || [])];

    if (action === 'add') {
      if (!className || currentClasses.includes(className)) return;
      currentClasses.push(className);
    } else {
      currentClasses = currentClasses.filter(c => c !== className);
    }

    const { error } = await supabase
      .from('students')
      .update({ class_types: currentClasses })
      .eq('id', studentId);

    if (error) {
      alert("පන්ති දත්ත වෙනස් කිරීමට නොහැකි විය: " + error.message);
    } else {
      setStudents((prev: any) => prev.map((s: any) => {
        if (s.id === studentId) {
          return { ...s, class_types: currentClasses, classTypes: currentClasses };
        }
        return s;
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* 🛠️ Filter Bar (ස්ක්‍රීන්ෂොට් එකේ පරිදි) */}
      <div className="flex flex-col md:flex-row gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by Username, NIC, Mobile..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <input 
            type="month" 
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
          <select 
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="All">All Classes</option>
            <option value="2027 Theory">2027 Theory</option>
            <option value="2027 Revision">2027 Revision</option>
          </select>
        </div>
      </div>

      {/* 📊 ප්‍රධාන කොටස් 3 (Unpaid / Paid / Free) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* 🔴 UNPAID COLUMN */}
        <div className="bg-red-950/10 border border-red-900/20 rounded-3xl p-4 min-h-[400px]">
          <h3 className="text-red-400 font-bold mb-4 flex justify-between">
            <span>Unpaid ({selectedMonth})</span>
            <span className="bg-red-500/10 px-2 rounded text-xs">{unpaidStudents.length}</span>
          </h3>
          <div className="space-y-3">
            {unpaidStudents.map(st => (
              <StudentCard key={st.id} student={st} onAction={(col) => updatePaymentStatus(st.id, col)} currentColumn="unpaid" onClassChange={handleClassManagement} />
            ))}
            {unpaidStudents.length === 0 && <p className="text-slate-600 text-xs text-center py-6">No unpaid students</p>}
          </div>
        </div>

        {/* 🟢 PAID COLUMN */}
        <div className="bg-emerald-950/10 border border-emerald-900/20 rounded-3xl p-4 min-h-[400px]">
          <h3 className="text-emerald-400 font-bold mb-4 flex justify-between">
            <span>Paid ({selectedMonth})</span>
            <span className="bg-emerald-500/10 px-2 rounded text-xs">{paidStudents.length}</span>
          </h3>
          <div className="space-y-3">
            {paidStudents.map(st => (
              <StudentCard key={st.id} student={st} onAction={(col) => updatePaymentStatus(st.id, col)} currentColumn="paid" onClassChange={handleClassManagement} />
            ))}
            {paidStudents.length === 0 && <p className="text-slate-600 text-xs text-center py-6">No paid students found</p>}
          </div>
        </div>

        {/* 🔵 FREE CARD COLUMN */}
        <div className="bg-blue-950/10 border border-blue-900/20 rounded-3xl p-4 min-h-[400px]">
          <h3 className="text-blue-400 font-bold mb-4 flex justify-between">
            <span>Free Card Students</span>
            <span className="bg-blue-500/10 px-2 rounded text-xs">{freeStudents.length}</span>
          </h3>
          <div className="space-y-3">
            {freeStudents.map(st => (
              <StudentCard key={st.id} student={st} onAction={(col) => updatePaymentStatus(st.id, col)} currentColumn="free" onClassChange={handleClassManagement} />
            ))}
            {freeStudents.length === 0 && <p className="text-slate-600 text-xs text-center py-6">No free students</p>}
          </div>
        </div>

      </div>
    </div>
  );
}

// 📇 සිසුවාගේ කාඩ්පත සහ පන්ති කළමනාකරණ Component එක
function StudentCard({ student, onAction, currentColumn, onClassChange }: { student: any, onAction: (col: any) => void, currentColumn: string, onClassChange: (id: string, act: 'add' | 'remove', name: string) => void }) {
  const classes = student.class_types || student.classTypes || [];
  
  return (
    <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-2 text-xs">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-white">{student.name}</h4>
          <p className="text-[10px] text-slate-500">ID: {student.username || 'N/A'}</p>
        </div>
        
        {/* Quick Action Buttons */}
        <div className="flex gap-1">
          {currentColumn !== 'paid' && <button onClick={() => onAction('paid')} className="bg-emerald-600/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] hover:bg-emerald-600 hover:text-white transition cursor-pointer">Set Paid</button>}
          {currentColumn !== 'free' && <button onClick={() => onAction('free')} className="bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px] hover:bg-blue-600 hover:text-white transition cursor-pointer">Set Free</button>}
          {currentColumn !== 'unpaid' && <button onClick={() => onAction('unpaid')} className="bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] hover:bg-red-600 hover:text-white transition cursor-pointer">Unpaid</button>}
        </div>
      </div>

      {/* 📚 සිසුවාගේ පන්ති පෙන්වීම සහ ඉවත් කිරීම */}
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[10px] text-slate-400">Classes:</span>
        {classes.map((cls: string) => (
          <span key={cls} className="bg-slate-950 text-slate-300 px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-slate-800">
            {cls}
            <X size={10} className="text-red-400 cursor-pointer hover:text-red-600" onClick={() => onClassChange(student.id, 'remove', cls)} />
          </span>
        ))}
        
        {/* ➕ පන්තියක් මැනුවල් ඇඩ් කිරීමේ බොත්තම */}
        <button 
          onClick={() => {
            const newCls = prompt("ඇතුලත් කිරීමට අවශ්‍ය පන්තියේ නම (e.g. 2027 Theory):");
            if(newCls) onClassChange(student.id, 'add', newCls);
          }}
          className="bg-slate-800 text-slate-400 p-0.5 rounded hover:bg-slate-700 text-[10px]"
        >
          <Plus size={10} />
        </button>
      </div>
    </div>
  );
}