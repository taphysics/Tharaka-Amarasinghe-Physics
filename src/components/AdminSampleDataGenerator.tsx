import React, { useState } from 'react';
import { Database, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function AdminSampleDataGenerator() {
  const [loading, setLoading] = useState(false);

  const handleGenerateDummies = async () => {
    if(!window.confirm("සත්‍ය දත්ත පද්ධතියට Sample Data 10 ක් ඇතුළත් කිරීමට ඔබට විශ්වාසද?")) return;
    setLoading(true);
    
    // Fake data generator (Static 10 users for manual testing)
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const dummies = [
      { username: "DUMMY1001", password: "password123", name: "Sample Student 1", nic: "100000000V", class_types: ["2027 Theory"], district: "Colombo", whatsapp: "0771111111", mobile: "0771111111", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
      { username: "DUMMY1002", password: "password123", name: "Sample Student 2", nic: "200000000V", class_types: ["2026 Revision"], district: "Gampaha", whatsapp: "0772222222", mobile: "0772222222", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
      { username: "DUMMY1003", password: "password123", name: "Sample Student 3", nic: "300000000V", class_types: ["2028 Theory"], district: "Kalutara", whatsapp: "0773333333", mobile: "0773333333", is_approved: true, plan_type: "paid", active_months: [] }, // Expired access
      { username: "DUMMY1004", password: "password123", name: "Sample Student 4", nic: "400000000V", class_types: ["2026 Theory"], district: "Colombo", whatsapp: "0774444444", mobile: "0774444444", is_approved: true, plan_type: "free", active_months: [] }, // Free access card
      { username: "DUMMY1005", password: "password123", name: "Sample Student 5", nic: "500000000V", class_types: ["2027 Revision"], district: "Kandy", whatsapp: "0775555555", mobile: "0775555555", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
      { username: "DUMMY1006", password: "password123", name: "Sample Student 6", nic: "600000000V", class_types: ["2028 Paper Class"], district: "Galle", whatsapp: "0776666666", mobile: "0776666666", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
      { username: "DUMMY1007", password: "password123", name: "Sample Student 7", nic: "700000000V", class_types: ["2026 Revision"], district: "Matara", whatsapp: "0777777777", mobile: "0777777777", is_approved: true, plan_type: "paid", active_months: [] }, // Expired access
      { username: "DUMMY1008", password: "password123", name: "Sample Student 8", nic: "800000000V", class_types: ["2027 Theory"], district: "Kurunegala", whatsapp: "0778888888", mobile: "0778888888", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
      { username: "DUMMY1009", password: "password123", name: "Sample Student 9", nic: "900000000V", class_types: ["2028 Theory"], district: "Kegalle", whatsapp: "0779999999", mobile: "0779999999", is_approved: true, plan_type: "free", active_months: [] }, // Free access
      { username: "DUMMY1010", password: "password123", name: "Sample Student 10", nic: "1010101010V", class_types: ["2026 Theory", "2026 Revision"], district: "Colombo", whatsapp: "0770000000", mobile: "0770000000", is_approved: true, plan_type: "paid", active_months: [currentMonth] },
    ];

    const { error } = await supabase.from('students').insert(dummies);
    setLoading(false);
    if(error) {
       alert("Error generating dummy users: " + error.message);
    } else {
       alert("Sample users 10 generated successfully.");
       window.location.reload();
    }
  };

  const handleClearDummies = async () => {
    if(!window.confirm("ඔබට සියලුම DUMMY පරිශීලකයින් මැකීමට අවශ්‍යද? මෙය ආපසු හැරවිය නොහැක!")) return;
    setLoading(true);
    const { error } = await supabase.from('students').delete().like('username', 'DUMMY%');
    setLoading(false);
    if(error){
      alert("Error deleting dummy users: " + error.message);
    } else {
      alert("All sample users successfully deleted.");
      window.location.reload();
    }
  };

  return (
    <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700">
      <h4 className="font-bold text-emerald-400 mb-4 flex items-center gap-2">
        <Database size={18} /> Sample Data Simulator
      </h4>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        වෙබ් අඩවිය පරීක්ෂා කිරීම සඳහා සාම්පල සිසු දත්ත 10ක් ඇතුළත් කළ හැකිය. (පන්ති කිහිපයක් සහ ගෙවීම් කළ/නොකළ ලෙස මිශ්‍රව). යෙදුම පරීක්ෂා කිරීමෙන් පසු ඔබට ඒවා මෙතැනින්ම මකා දැමිය හැක.
      </p>

      <div className="flex gap-4">
        <button 
          onClick={handleGenerateDummies}
          disabled={loading}
          className="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <PlusCircle size={16} /> Generate 10 Users
        </button>
        <button 
          onClick={handleClearDummies}
          disabled={loading}
          className="flex-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <Trash2 size={16} /> Delete Models
        </button>
      </div>
    </div>
  );
}
