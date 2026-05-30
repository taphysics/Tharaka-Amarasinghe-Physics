import React, { useState } from 'react';
import { FileText, Users, DollarSign } from 'lucide-react';

export default function AdminPaymentHistory({ students }: { students: any[] }) {
  const [filterMonth, setFilterMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [activeTab, setActiveTab] = useState<'paid' | 'unpaid' | 'free'>('paid');

  // Filter out any students that have no class data to avoid errors
  const processedStudents = students.map(s => ({
    ...s,
    classes: s.class_types || []
  }));

  const paidStudents = processedStudents.filter(s => s.plan_type === 'paid' && s.active_months?.includes(filterMonth));
  const unpaidStudents = processedStudents.filter(s => s.plan_type === 'paid' && (!s.active_months || !s.active_months.includes(filterMonth)));
  const freeStudents = processedStudents.filter(s => s.plan_type === 'free');

  // Helper to group by class
  const groupByClass = (studentList: any[]) => {
    const groups: Record<string, any[]> = {};
    studentList.forEach(s => {
      if (s.classes.length === 0) {
        if (!groups['No Class Assigned']) groups['No Class Assigned'] = [];
        groups['No Class Assigned'].push(s);
      } else {
        s.classes.forEach((c: string) => {
          if (!groups[c]) groups[c] = [];
          groups[c].push(s);
        });
      }
    });
    return groups;
  };

  const currentList = activeTab === 'paid' ? paidStudents : activeTab === 'unpaid' ? unpaidStudents : freeStudents;
  const groupedData = groupByClass(currentList);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <FileText size={20} className="text-emerald-500" /> Payment History & Class Reports
        </h3>
        <div className="flex gap-2">
           <input 
             type="month"
             value={filterMonth}
             onChange={(e) => setFilterMonth(e.target.value)}
             className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 focus:border-emerald-500 focus:outline-none text-sm"
           />
        </div>
      </div>

      <div className="flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('paid')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
        >
          <DollarSign size={16} /> Paid Students
        </button>
        <button 
          onClick={() => setActiveTab('unpaid')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'unpaid' ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-white'}`}
        >
          <Users size={16} /> Unpaid Students
        </button>
        <button 
          onClick={() => setActiveTab('free')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'free' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'}`}
        >
          <Users size={16} /> Free Card
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {Object.keys(groupedData).sort().map(className => (
           <div key={className} className={`p-5 rounded-2xl border bg-slate-900/40 relative overflow-hidden ${
              activeTab === 'paid' ? 'border-emerald-500/30' : 
              activeTab === 'unpaid' ? 'border-red-500/30' : 'border-blue-500/30'
           }`}>
             <div className="absolute top-0 right-0 p-4 opacity-10">
               <FileText size={48} />
             </div>
             <h4 className="font-bold text-white text-lg border-b border-slate-800 pb-2 mb-3">
               {className}
             </h4>
             <div className="text-[10px] text-slate-400 mb-4 bg-slate-950 inline-block px-2 py-1 rounded">
               Total: {groupedData[className].length} Students
             </div>
             
             <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
               {groupedData[className].map(s => (
                 <div key={s.id} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                   <div>
                     <div className="text-slate-200 text-xs font-bold">{s.name}</div>
                     <div className="text-slate-500 font-mono text-[9px]">{s.username} | {s.whatsapp}</div>
                   </div>
                   {activeTab === 'paid' && (
                     <span className="text-[9px] bg-emerald-500/10 text-emerald-500 font-bold px-2 py-1 rounded">Paid</span>
                   )}
                 </div>
               ))}
             </div>
           </div>
         ))}
         {Object.keys(groupedData).length === 0 && (
           <div className="col-span-full py-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800 flex flex-col items-center justify-center">
             <Users size={32} className="text-slate-600 mb-3" />
             <p className="text-slate-400 text-sm">No students found for this category and month.</p>
           </div>
         )}
      </div>

    </div>
  );
}
