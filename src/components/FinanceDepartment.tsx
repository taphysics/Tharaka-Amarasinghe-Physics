import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  DollarSign, 
  Percent, 
  Calendar, 
  Users, 
  CreditCard, 
  Megaphone, 
  Receipt, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Database, 
  Info,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { StaffMember } from '../types';

export type AdFrequency = 'monthly' | 'quarterly' | 'biannually' | 'annually';
export type OtherDeductionType = 'fixed' | 'percentage';

export interface ClassFinanceSettings {
  id?: string;
  class_type: string;
  lecturer_name: string;
  lecturer_whatsapp: string;
  institute_percentage: number; // e.g. 20%
  // Loan Section
  is_loan_active: boolean;
  loan_monthly_installment: number; // Monthly repayment amount
  loan_start_month: string; // YYYY-MM
  loan_end_month: string; // YYYY-MM
  loan_remaining_months?: number;
  loan_completed_acknowledged?: boolean;
  // Advertising Section
  is_ad_active: boolean;
  ad_amount: number;
  ad_frequency: AdFrequency; // monthly, 3-months, 6-months, yearly
  // Tax Section
  is_tax_active: boolean;
  tax_label: string;
  tax_percentage: number; // Percentage or fixed
  tax_amount: number;
  // Other Deductions Section
  is_other_active: boolean;
  other_label: string;
  other_type: OtherDeductionType; // 'fixed' or 'percentage'
  other_value: number;
  notes?: string;
}

interface FinanceDepartmentProps {
  currentStaff?: StaffMember | null;
  onNavigateToHistory?: () => void;
}

export const FINANCE_SQL_SETUP_SCRIPT = `-- =========================================================================
-- Smart Physics: Comprehensive Finance Department & Lecturer Salary Controls
-- Run this in your Supabase SQL Editor to support all new Finance columns!
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.class_finance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type TEXT NOT NULL UNIQUE,
  lecturer_name TEXT DEFAULT 'තාරක අමරසිංහ (Taraka Amarasinghe)',
  lecturer_whatsapp TEXT DEFAULT '0779630100',
  institute_percentage NUMERIC DEFAULT 20,
  is_loan_active BOOLEAN DEFAULT false,
  loan_monthly_installment NUMERIC DEFAULT 0,
  loan_start_month TEXT,
  loan_end_month TEXT,
  loan_remaining_months INTEGER DEFAULT 0,
  loan_completed_acknowledged BOOLEAN DEFAULT false,
  is_ad_active BOOLEAN DEFAULT false,
  ad_amount NUMERIC DEFAULT 0,
  ad_frequency TEXT DEFAULT 'monthly',
  is_tax_active BOOLEAN DEFAULT false,
  tax_label TEXT DEFAULT 'Tax / Platform Fee',
  tax_percentage NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  is_other_active BOOLEAN DEFAULT false,
  other_label TEXT DEFAULT 'Other Expense',
  other_type TEXT DEFAULT 'fixed',
  other_value NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- If table already exists, safely add any missing columns:
ALTER TABLE public.class_finance_settings 
  ADD COLUMN IF NOT EXISTS loan_monthly_installment NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_start_month TEXT,
  ADD COLUMN IF NOT EXISTS loan_end_month TEXT,
  ADD COLUMN IF NOT EXISTS loan_completed_acknowledged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_frequency TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_other_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS other_label TEXT DEFAULT 'Other Expense',
  ADD COLUMN IF NOT EXISTS other_type TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS other_value NUMERIC DEFAULT 0;

-- Row Level Security (RLS)
ALTER TABLE public.class_finance_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow read-write for class_finance_settings" 
  ON public.class_finance_settings 
  FOR ALL 
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
`;

export default function FinanceDepartment({ currentStaff, onNavigateToHistory }: FinanceDepartmentProps) {
  const currentDate = new Date();
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const [classTypes, setClassTypes] = useState<any[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [financeConfigs, setFinanceConfigs] = useState<Record<string, ClassFinanceSettings>>({});
  const [formConfig, setFormConfig] = useState<ClassFinanceSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [lecturersList, setLecturersList] = useState<StaffMember[]>([]);

  // Loan Completion Prompt Modal state
  const [loanEndPrompt, setLoanEndPrompt] = useState<{
    classType: string;
    lecturerName: string;
    endMonth: string;
  } | null>(null);

  // Load Classes, Lecturers, and Finance Settings
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Class Types
      const { data: ctData } = await supabase
        .from('class_types_config')
        .select('*')
        .order('class_type');

      const resolvedClasses = (ctData && ctData.length > 0)
        ? ctData.map(c => ({ id: c.id, name: c.class_type, fee: c.monthly_fee || 3500 }))
        : [
            { id: '1', name: '2026 Revision', fee: 3500 },
            { id: '2', name: '2026 Theory', fee: 3500 },
            { id: '3', name: '2027 Paper Class', fee: 5000 },
            { id: '4', name: '2027 Revision', fee: 5000 },
            { id: '5', name: '2027 Theory', fee: 5000 },
            { id: '6', name: '2028 Theory', fee: 5000 }
          ];
      setClassTypes(resolvedClasses);
      if (selectedClasses.length === 0 && resolvedClasses.length > 0) {
        setSelectedClasses([resolvedClasses[0].name]);
      }

      // 2. Fetch Lecturers for easy assignment
      const { data: stfData } = await supabase
        .from('staff_members')
        .select('*');
      if (stfData) {
        setLecturersList(stfData.filter((s: StaffMember) => s.role === 'lecturer' || s.role === 'super_admin'));
      }

      // 3. Fetch Settings from Database
      const { data: finData, error: finErr } = await supabase
        .from('class_finance_settings')
        .select('*');

      const map: Record<string, ClassFinanceSettings> = {};
      if (!finErr && finData && finData.length > 0) {
        finData.forEach((f: any) => {
          map[f.class_type] = parseDatabaseRow(f);
        });
      }

      // Merge with LocalStorage fallback
      const savedLocal = localStorage.getItem('physics_class_finance_settings');
      if (savedLocal) {
        try {
          const localMap = JSON.parse(savedLocal);
          Object.keys(localMap).forEach(k => {
            if (!map[k]) {
              map[k] = parseDatabaseRow(localMap[k]);
            } else {
              // Merge any fields that DB might not have yet (e.g. ad_frequency, other_type)
              map[k] = { ...map[k], ...localMap[k] };
            }
          });
        } catch (e) {}
      }

      setFinanceConfigs(map);

      // Check if any active loan has reached or surpassed its end month
      checkActiveLoansForCompletion(map, currentMonthStr);

    } catch (err) {
      console.warn('Finance data load note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const parseDatabaseRow = (raw: any): ClassFinanceSettings => {
    return {
      id: raw.id,
      class_type: raw.class_type,
      lecturer_name: raw.lecturer_name || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
      lecturer_whatsapp: raw.lecturer_whatsapp || '0779630100',
      institute_percentage: Number(raw.institute_percentage ?? 20),
      is_loan_active: Boolean(raw.is_loan_active),
      loan_monthly_installment: Number(raw.loan_monthly_installment ?? raw.loan_deduction_amount ?? 0),
      loan_start_month: raw.loan_start_month || '',
      loan_end_month: raw.loan_end_month || '',
      loan_remaining_months: Number(raw.loan_remaining_months ?? 0),
      loan_completed_acknowledged: Boolean(raw.loan_completed_acknowledged),
      is_ad_active: Boolean(raw.is_ad_active),
      ad_amount: Number(raw.ad_amount ?? raw.ad_deduction_amount ?? 0),
      ad_frequency: (raw.ad_frequency as AdFrequency) || 'monthly',
      is_tax_active: Boolean(raw.is_tax_active),
      tax_label: raw.tax_label || 'Tax / Platform Fee',
      tax_percentage: Number(raw.tax_percentage ?? 0),
      tax_amount: Number(raw.tax_amount ?? raw.tax_deduction_amount ?? 0),
      is_other_active: Boolean(raw.is_other_active),
      other_label: raw.other_label || 'වෙනත් අයකිරීම් (Other Charge)',
      other_type: (raw.other_type as OtherDeductionType) || 'fixed',
      other_value: Number(raw.other_value ?? 0),
      notes: raw.notes || ''
    };
  };

  // Check if a loan completed in current or past month and prompt Super Admin
  const checkActiveLoansForCompletion = (map: Record<string, ClassFinanceSettings>, nowMonth: string) => {
    for (const cName of Object.keys(map)) {
      const cfg = map[cName];
      if (cfg.is_loan_active && cfg.loan_end_month && !cfg.loan_completed_acknowledged) {
        if (nowMonth >= cfg.loan_end_month) {
          setLoanEndPrompt({
            classType: cfg.class_type,
            lecturerName: cfg.lecturer_name,
            endMonth: cfg.loan_end_month
          });
          break;
        }
      }
    }
  };

  // Helper to calculate months between YYYY-MM
  const calculateMonthsDiff = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [sY, sM] = start.split('-').map(Number);
    const [eY, eM] = end.split('-').map(Number);
    if (!sY || !sM || !eY || !eM) return 0;
    const diff = (eY - sY) * 12 + (eM - sM) + 1;
    return Math.max(0, diff);
  };

  // Helper to calculate remaining months from current month
  const calculateRemainingMonthsFromNow = (end: string): number => {
    if (!end) return 0;
    const [eY, eM] = end.split('-').map(Number);
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const diff = (eY - curY) * 12 + (eM - curM) + 1;
    return Math.max(0, diff);
  };

  // Active class config & bulk multi-class support
  const primaryClass = selectedClasses[0] || (classTypes[0]?.name || '2026 Theory');
  const currentConfig: ClassFinanceSettings = formConfig || financeConfigs[primaryClass] || {
    class_type: primaryClass,
    lecturer_name: 'තාරක අමරසිංහ (Taraka Amarasinghe)',
    lecturer_whatsapp: '0779630100',
    institute_percentage: 20,
    is_loan_active: false,
    loan_monthly_installment: 0,
    loan_start_month: currentMonthStr,
    loan_end_month: '',
    loan_remaining_months: 0,
    loan_completed_acknowledged: false,
    is_ad_active: false,
    ad_amount: 0,
    ad_frequency: 'monthly',
    is_tax_active: false,
    tax_label: 'Tax / Platform Fee',
    tax_percentage: 0,
    tax_amount: 0,
    is_other_active: false,
    other_label: 'වෙනත් අයකිරීම් (Other)',
    other_type: 'fixed',
    other_value: 0,
    notes: ''
  };

  const updateCurrentConfig = (patch: Partial<ClassFinanceSettings>) => {
    const updated = { ...currentConfig, ...patch };

    // Auto calculate remaining months if dates change
    if (patch.loan_start_month !== undefined || patch.loan_end_month !== undefined) {
      if (updated.loan_end_month) {
        updated.loan_remaining_months = calculateRemainingMonthsFromNow(updated.loan_end_month);
      }
    }

    setFormConfig(updated);
  };

  // Helper toggle and selection functions
  const toggleClassSelection = (cName: string) => {
    setSelectedClasses(prev => {
      let next: string[];
      if (prev.includes(cName)) {
        if (prev.length === 1) return prev; // Keep at least one class
        next = prev.filter(c => c !== cName);
      } else {
        next = [...prev, cName];
      }
      // If single class selected, populate form with that class's current config
      if (next.length === 1 && financeConfigs[next[0]]) {
        setFormConfig(financeConfigs[next[0]]);
      }
      return next;
    });
  };

  const selectSingleClass = (cName: string) => {
    setSelectedClasses([cName]);
    if (financeConfigs[cName]) {
      setFormConfig(financeConfigs[cName]);
    }
  };

  const selectAllClasses = () => {
    const all = classTypes.map(c => c.name);
    setSelectedClasses(all);
  };

  // Save Settings to Supabase and LocalStorage (Batch / Multi-class support)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const targetClasses = selectedClasses.length > 0 ? selectedClasses : [primaryClass];
    const updatedMap = { ...financeConfigs };

    for (const cName of targetClasses) {
      const target: ClassFinanceSettings = {
        ...currentConfig,
        class_type: cName
      };
      updatedMap[cName] = target;

      try {
        // 1. First attempt full upsert with all extended columns
        const fullPayload = {
          class_type: target.class_type,
          lecturer_name: target.lecturer_name,
          lecturer_whatsapp: target.lecturer_whatsapp,
          institute_percentage: target.institute_percentage,
          is_loan_active: target.is_loan_active,
          loan_deduction_amount: target.loan_monthly_installment,
          loan_monthly_installment: target.loan_monthly_installment,
          loan_start_month: target.loan_start_month,
          loan_end_month: target.loan_end_month,
          loan_remaining_months: target.loan_remaining_months || calculateRemainingMonthsFromNow(target.loan_end_month),
          loan_completed_acknowledged: target.loan_completed_acknowledged,
          is_ad_active: target.is_ad_active,
          ad_deduction_amount: target.ad_amount,
          ad_amount: target.ad_amount,
          ad_frequency: target.ad_frequency,
          is_tax_active: target.is_tax_active,
          tax_label: target.tax_label,
          tax_percentage: target.tax_percentage,
          tax_deduction_amount: target.tax_amount,
          tax_amount: target.tax_amount,
          is_other_active: target.is_other_active,
          other_label: target.other_label,
          other_type: target.other_type,
          other_value: target.other_value,
          notes: target.notes,
          updated_at: new Date().toISOString()
        };

        const { error: fullErr } = await supabase
          .from('class_finance_settings')
          .upsert(fullPayload, { onConflict: 'class_type' });

        if (fullErr) {
          // Fallback for base columns if schema hasn't been migrated yet
          const basePayload = {
            class_type: target.class_type,
            lecturer_name: target.lecturer_name,
            lecturer_whatsapp: target.lecturer_whatsapp,
            institute_percentage: target.institute_percentage,
            loan_deduction_amount: target.loan_monthly_installment,
            loan_remaining_months: target.loan_remaining_months || calculateRemainingMonthsFromNow(target.loan_end_month),
            is_loan_active: target.is_loan_active,
            ad_deduction_amount: target.ad_amount,
            is_ad_active: target.is_ad_active,
            tax_deduction_amount: target.tax_amount,
            is_tax_active: target.is_tax_active,
            tax_label: target.tax_label,
            notes: JSON.stringify({
              loan_start: target.loan_start_month,
              loan_end: target.loan_end_month,
              ad_freq: target.ad_frequency,
              other: { active: target.is_other_active, label: target.other_label, type: target.other_type, val: target.other_value }
            }),
            updated_at: new Date().toISOString()
          };
          await supabase
            .from('class_finance_settings')
            .upsert(basePayload, { onConflict: 'class_type' });
        }
      } catch (err: any) {
        console.warn(`Save note for class ${cName}:`, err);
      }
    }

    setFinanceConfigs(updatedMap);
    localStorage.setItem('physics_class_finance_settings', JSON.stringify(updatedMap));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
    setSaving(false);
  };

  // Handle Lecturer Loan End Modal actions
  const handleLoanEndDecision = (addAnother: boolean) => {
    if (!loanEndPrompt) return;
    const cName = loanEndPrompt.classType;
    const cfg = financeConfigs[cName];
    if (cfg) {
      if (addAnother) {
        // Keep form open for new installment setup
        setSelectedClasses([cName]);
        updateCurrentConfig({
          is_loan_active: true,
          loan_start_month: currentMonthStr,
          loan_end_month: '',
          loan_monthly_installment: 0,
          loan_completed_acknowledged: false
        });
      } else {
        // Mark loan as fully closed and complete!
        const updated = {
          ...cfg,
          is_loan_active: false,
          loan_monthly_installment: 0,
          loan_remaining_months: 0,
          loan_completed_acknowledged: true
        };
        const newMap = { ...financeConfigs, [cName]: updated };
        setFinanceConfigs(newMap);
        localStorage.setItem('physics_class_finance_settings', JSON.stringify(newMap));
        supabase
          .from('class_finance_settings')
          .update({
            is_loan_active: false,
            loan_deduction_amount: 0,
            loan_remaining_months: 0,
            updated_at: new Date().toISOString()
          })
          .eq('class_type', cName)
          .then();
      }
    }
    setLoanEndPrompt(null);
  };

  const totalMonthsLoan = calculateMonthsDiff(currentConfig.loan_start_month, currentConfig.loan_end_month);
  const remainingMonthsLoan = calculateRemainingMonthsFromNow(currentConfig.loan_end_month);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* 1. TOP HEADER & INTRO */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold mb-3">
              <Building2 size={14} className="text-indigo-400" />
              <span>SUPER ADMIN & MANAGER CENTRAL FINANCIAL CONTROL UNIT</span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-black text-white font-display tracking-tight flex items-center gap-3">
              <DollarSign className="text-emerald-400" size={30} />
              <span>ආයතනික මූල්‍ය දෙපාර්තමේන්තුව (Finance Department)</span>
            </h1>
            
            <p className="text-xs md:text-sm text-slate-300 max-w-3xl mt-2 leading-relaxed">
              එක් එක් පන්තිවලට වෙන් වෙන් වශයෙන් ආයතනයට අයකරන ප්‍රතිශතය, ගුරු ණය වාරික අයකිරීම් (ආරම්භක සහ අවසන් දිනයන් අනුව ස්වයංක්‍රීයව අඩු වීම සහ දැනුම්දීම්), ප්‍රචාරණ දැන්වීම් වාරික, බදු (Tax) සහ වෙනත් අයකිරීම් මෙතැනින් සම්පූර්ණයෙන් පාලනය කරන්න.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onNavigateToHistory && (
              <button
                type="button"
                onClick={onNavigateToHistory}
                className="px-4 py-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                <span>ගෙවීම් ඉතිහාසය (Payment History & PDF)</span>
                <ArrowRight size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Refresh Finance Data"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. CLASS TYPE SELECTOR TABS (MULTI-SELECT SUPPORT) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-blue-400" />
            <span>පාලනය සඳහා පන්තිය තෝරන්න (Select Class to Configure):</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllClasses}
              className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 text-[11px] font-bold transition cursor-pointer"
            >
              සියලුම පන්ති තෝරන්න (Select All)
            </button>
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              {selectedClasses.length} {selectedClasses.length > 1 ? 'Classes Selected (Bulk Mode)' : 'Class Selected'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-none">
          {classTypes.map(cls => {
            const isSelected = selectedClasses.includes(cls.name);
            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => toggleClassSelection(cls.name)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border-blue-400 ring-2 ring-blue-500/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title="ක්ලික් කර තෝරන්න / තේරීමෙන් ඉවත් කරන්න (Click to toggle)"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${isSelected ? 'bg-white text-blue-700 border-white' : 'border-slate-600'}`}>
                  {isSelected ? '✓' : ''}
                </div>
                <span>{cls.name}</span>
                {financeConfigs[cls.name]?.is_loan_active && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Active Loan" />
                )}
              </button>
            );
          })}
        </div>

        {selectedClasses.length > 1 && (
          <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-2.5 animate-fade-in">
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            <p className="leading-relaxed">
              <strong>පොදු මූල්‍ය ප්‍රතිපත්ති යෙදීම (Bulk Multi-Class Mode):</strong> ඔබ විසින් පන්ති <strong>{selectedClasses.length}</strong>ක් ({selectedClasses.join(', ')}) තෝරාගෙන ඇත. පහත ඇතුළත් කරන ආයතනික ප්‍රතිශතය, ගුරු ණය, දැන්වීම්, ටැක්ස් සහ වෙනත් අයකිරීම් මෙම තෝරාගත් පන්ති සියල්ලටම එකවර සුරැකෙනු ඇත.
            </p>
          </div>
        )}
      </div>

      {/* 3. MAIN FINANCE CONFIGURATION FORM */}
      <form onSubmit={handleSave} className="space-y-6">

        {/* SECTION A: LECTURER DETAILS & INSTITUTE REVENUE PERCENTAGE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Percent size={18} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  1. ආයතනික ප්‍රතිශතය සහ දේශකයා (Institute Percentage & Lecturer)
                </h3>
                <p className="text-xs text-slate-400">
                  [{selectedClasses.length > 1 ? `${selectedClasses.length} Classes: ${selectedClasses.join(', ')}` : primaryClass}] පන්තියේ ශිෂ්‍ය ගෙවීම් එකතුවෙන් ආයතනයට ලබාගන්නා කොටස
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/30">
              {currentConfig.institute_percentage}% Institute Share
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Lecturer Name */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                දේශකයාගේ නම (Lecturer Name):
              </label>
              <input
                type="text"
                value={currentConfig.lecturer_name}
                onChange={(e) => updateCurrentConfig({ lecturer_name: e.target.value })}
                placeholder="තාරක අමරසිංහ (Taraka Amarasinghe)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 text-sm text-white focus:outline-none"
              />
              {lecturersList.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[10px] text-slate-500">Suggested:</span>
                  {lecturersList.map(l => (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() => updateCurrentConfig({ 
                        lecturer_name: `${l.first_name} ${l.last_name}`,
                        lecturer_whatsapp: l.whatsapp || currentConfig.lecturer_whatsapp 
                      })}
                      className="text-[10px] text-blue-400 hover:underline bg-slate-800 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      {l.first_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lecturer WhatsApp */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                දේශකයාගේ WhatsApp අංකය:
              </label>
              <input
                type="text"
                value={currentConfig.lecturer_whatsapp}
                onChange={(e) => updateCurrentConfig({ lecturer_whatsapp: e.target.value })}
                placeholder="0779630100"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-purple-500 text-sm font-mono text-white focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">වාර්තා සහ පණිවිඩ යැවීමට භාවිතා වේ</span>
            </div>

            {/* Institute Percentage Slider / Input */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                <span>ආයතනයට ගන්නා ප්‍රතිශතය (%):</span>
                <span className="text-purple-400 font-mono font-black">{currentConfig.institute_percentage}%</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={currentConfig.institute_percentage}
                  onChange={(e) => updateCurrentConfig({ institute_percentage: Number(e.target.value) })}
                  className="flex-1 accent-purple-500 cursor-pointer"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={currentConfig.institute_percentage}
                  onChange={(e) => updateCurrentConfig({ institute_percentage: Number(e.target.value) })}
                  className="w-20 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-center font-mono font-bold text-white text-sm"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                ගුරුවරයාට ලැබෙන කොටස: <span className="text-emerald-400 font-bold">{100 - currentConfig.institute_percentage}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* SECTION B: LECTURER LOAN INSTALLMENTS & AUTO-DEDUCTION ENGINE */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <CreditCard size={18} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>2. දේශක ණය වාරික අයකිරීම් (Lecturer Loan Installment Manager)</span>
                  {currentConfig.is_loan_active && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                      සක්‍රීයයි (Active)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  ආරම්භක සහ අවසන් වසර/මාස අනුව ස්වයංක්‍රීයව ගුරු ආදායමෙන් මාසික ණය වාරිකය අඩු කරගනී
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={currentConfig.is_loan_active}
                onChange={(e) => updateCurrentConfig({ is_loan_active: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              <span className="ml-2.5 text-xs font-bold text-slate-300">ණය අයකිරීම් සක්‍රීය කරන්න</span>
            </label>
          </div>

          {currentConfig.is_loan_active ? (
            <div className="space-y-5 animate-slide-up">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Monthly Installment Amount */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    මාසික ණය වාරිකය (රු. Monthly Installment):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs font-mono font-bold">රු.</span>
                    <input
                      type="number"
                      min="0"
                      value={currentConfig.loan_monthly_installment || ''}
                      onChange={(e) => updateCurrentConfig({ loan_monthly_installment: Number(e.target.value) })}
                      placeholder="5000"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm font-mono font-bold text-amber-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">මාසිකව ගුරු වැටුපෙන් අඩු වන මුදල</span>
                </div>

                {/* Loan Start Month */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    ආරම්භක අවුරුද්ද සහ මාසය (Start Month):
                  </label>
                  <input
                    type="month"
                    value={currentConfig.loan_start_month || ''}
                    onChange={(e) => updateCurrentConfig({ loan_start_month: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm font-mono text-white focus:outline-none cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">ණය අයකිරීම ආරම්භ කරන මාසය</span>
                </div>

                {/* Loan End Month */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    අවසන් වන අවුරුද්ද සහ මාසය (End Month):
                  </label>
                  <input
                    type="month"
                    value={currentConfig.loan_end_month || ''}
                    onChange={(e) => updateCurrentConfig({ loan_end_month: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 text-sm font-mono text-white focus:outline-none cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">අවසාන වාරිකය අය කරගන්නා මාසය</span>
                </div>
              </div>

              {/* Realtime Loan Statistics Box */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-amber-500/20 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 block">සම්පූර්ණ වාරික ගණන:</span>
                  <p className="text-base font-black font-mono text-white">{totalMonthsLoan} Months</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">ඉතිරි මාස ගණන:</span>
                  <p className="text-base font-black font-mono text-amber-400">
                    {remainingMonthsLoan > 0 ? `${remainingMonthsLoan} Months Remaining` : 'Completed / Ready to Finish'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">මුළු ණය මුදල (Total Loan):</span>
                  <p className="text-base font-black font-mono text-white">
                    රු. {(totalMonthsLoan * (currentConfig.loan_monthly_installment || 0)).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">වත්මන් මාසයේ තත්ත්වය:</span>
                  <p className={`text-xs font-bold mt-1 ${
                    currentMonthStr >= (currentConfig.loan_start_month || '') && currentMonthStr <= (currentConfig.loan_end_month || '')
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }`}>
                    {currentMonthStr >= (currentConfig.loan_start_month || '') && currentMonthStr <= (currentConfig.loan_end_month || '')
                      ? '● මේ මස වාරිකය අයවේ'
                      : '○ මේ මස ක්‍රියාත්මක නොවේ'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800 text-center">
              <p className="text-xs text-slate-500">
                මෙම පන්තියේ දේශකයා සඳහා කිසිදු ණය වාරිකයක් ක්‍රියාත්මක නොවේ. අවශ්‍ය නම් ඉහත ස්විචය සක්‍රීය කරන්න.
              </p>
            </div>
          )}
        </div>

        {/* SECTION C: MARKETING & ADVERTISING DEDUCTIONS */}
        <div className="bg-slate-900/90 border border-blue-500/30 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <Megaphone size={18} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  3. ප්‍රචාරණ දැන්වීම් අයකිරීම් (Marketing & Advertising Charges)
                </h3>
                <p className="text-xs text-slate-400">
                  මාසිකව / මාස 3කට / මාස 6කට / අවුරුද්දකට වරක් ආයතනය විසින් ප්‍රචාරණය සඳහා අය කරන මුදල්
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={currentConfig.is_ad_active}
                onChange={(e) => updateCurrentConfig({ is_ad_active: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              <span className="ml-2.5 text-xs font-bold text-slate-300">දැන්වීම් අයකිරීම් සක්‍රීය කරන්න</span>
            </label>
          </div>

          {currentConfig.is_ad_active ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-up">
              
              {/* Frequency Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  අයකිරීම් වාර ගණන (Billing Frequency):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'monthly', label: 'මාසිකව (Monthly)' },
                    { id: 'quarterly', label: 'මාස තුනකට වරක් (Every 3 Months)' },
                    { id: 'biannually', label: 'මාස හයකට වරක් (Every 6 Months)' },
                    { id: 'annually', label: 'අවුරුද්දකට වරක් (Annually / 1 Year)' }
                  ].map(freq => (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => updateCurrentConfig({ ad_frequency: freq.id as AdFrequency })}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition text-left cursor-pointer ${
                        currentConfig.ad_frequency === freq.id
                          ? 'bg-blue-600/30 text-blue-300 border-blue-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="block">{freq.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ad Amount */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  අය කරන මුදල (රු. Advertisement Amount):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 text-xs font-mono font-bold">රු.</span>
                  <input
                    type="number"
                    min="0"
                    value={currentConfig.ad_amount || ''}
                    onChange={(e) => updateCurrentConfig({ ad_amount: Number(e.target.value) })}
                    placeholder="2500"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 text-sm font-mono font-bold text-blue-300 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  තෝරාගත් කාල සීමාව ({currentConfig.ad_frequency}) තුළ ගුරු වැටුපෙන් අඩු කෙරේ
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800 text-center">
              <p className="text-xs text-slate-500">
                මෙම පන්තිය සඳහා ප්‍රචාරක දැන්වීම් අයකිරීම් අක්‍රීය කර ඇත.
              </p>
            </div>
          )}
        </div>

        {/* SECTION D: TAX & OTHER DEDUCTIONS (FIXED OR PERCENTAGE) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Tax Section */}
          <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt size={17} className="text-rose-400" />
                <h3 className="text-sm font-extrabold text-white">4. ටැක්ස් අයකිරීම් (Tax / Platform Fee)</h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentConfig.is_tax_active}
                  onChange={(e) => updateCurrentConfig({ is_tax_active: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>

            {currentConfig.is_tax_active && (
              <div className="space-y-4 animate-slide-up">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">ටැක්ස් නම (Label):</label>
                  <input
                    type="text"
                    value={currentConfig.tax_label}
                    onChange={(e) => updateCurrentConfig({ tax_label: e.target.value })}
                    placeholder="Government Tax / Platform Fee"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">අය කරන මුදල (රු.):</label>
                  <input
                    type="number"
                    min="0"
                    value={currentConfig.tax_amount || ''}
                    onChange={(e) => updateCurrentConfig({ tax_amount: Number(e.target.value) })}
                    placeholder="1500"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-rose-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Other Deductions (Fixed or Percentage) */}
          <div className="bg-slate-900/90 border border-teal-500/30 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={17} className="text-teal-400" />
                <h3 className="text-sm font-extrabold text-white">5. වෙනත් අයකිරීම් (Other Custom Deductions)</h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentConfig.is_other_active}
                  onChange={(e) => updateCurrentConfig({ is_other_active: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
              </label>
            </div>

            {currentConfig.is_other_active && (
              <div className="space-y-4 animate-slide-up">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">අයකිරීම් නම (Custom Label):</label>
                  <input
                    type="text"
                    value={currentConfig.other_label}
                    onChange={(e) => updateCurrentConfig({ other_label: e.target.value })}
                    placeholder="Laboratory Maintenance Fee / Print Paper Share"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">අය කරන ක්‍රමය (Type):</label>
                    <select
                      value={currentConfig.other_type}
                      onChange={(e) => updateCurrentConfig({ other_type: e.target.value as OtherDeductionType })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-bold"
                    >
                      <option value="fixed">ස්ථාවර මුදලක් (Fixed LKR)</option>
                      <option value="percentage">ප්‍රතිශතයක් (Percentage %)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      {currentConfig.other_type === 'percentage' ? 'ප්‍රතිශතය (%):' : 'මුදල (රු. LKR):'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={currentConfig.other_value || ''}
                      onChange={(e) => updateCurrentConfig({ other_value: Number(e.target.value) })}
                      placeholder={currentConfig.other_type === 'percentage' ? '5' : '1000'}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-teal-300"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION E: NOTES & SAVE BUTTON */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={currentConfig.notes || ''}
              onChange={(e) => updateCurrentConfig({ notes: e.target.value })}
              placeholder="විශේෂ සටහන් (Notes for this class finance policy)..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 animate-fade-in">
                <CheckCircle2 size={15} />
                <span>සාර්ථකව සුරැකිණි!</span>
              </span>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-700/30 flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
            >
              <Save size={15} />
              <span>
                {saving
                  ? 'සුරකිමින් පවතී...'
                  : selectedClasses.length > 1
                  ? `තෝරාගත් පන්ති ${selectedClasses.length}ටම ප්‍රතිපත්ති සුරකින්න (Save to All ${selectedClasses.length} Classes)`
                  : `[${primaryClass}] මූල්‍ය ප්‍රතිපත්ති සුරකින්න (Save)`}
              </span>
            </button>
          </div>
        </div>

      </form>

      {/* MODAL 1: LOAN END NOTIFICATION & PROMPT MODAL */}
      {loanEndPrompt && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white font-display">
                  ණය වාරිකය අවසන් වී ඇත! (Loan Completed)
                </h3>
                <p className="text-xs text-slate-400">
                  {loanEndPrompt.classType} • {loanEndPrompt.lecturerName}
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                ගුරුතුමාගේ ණය වාරික ගිවිසුම <span className="text-amber-400 font-mono font-bold">[{loanEndPrompt.endMonth}]</span> මසින් සම්පූර්ණ වී අවසන් වී ඇත.
              </p>
              <p className="text-white font-bold">
                ඔහුගේ ණය වාරික නැවත අලුතින් ඇඩ් කිරීමට අවශ්‍යද?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleLoanEndDecision(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
              >
                නැත, ණය සියල්ල අවසන් (Finish Loan)
              </button>

              <button
                type="button"
                onClick={() => handleLoanEndDecision(true)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition shadow-lg shadow-amber-500/30"
              >
                ඔව්, නව ණය වාරිකයක් එක් කරන්න (Add New)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
