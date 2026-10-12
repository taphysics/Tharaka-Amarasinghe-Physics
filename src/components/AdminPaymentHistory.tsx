import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Users, 
  DollarSign, 
  Download, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MessageCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  BookOpen, 
  Sparkles, 
  Award, 
  AlertCircle,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../supabaseClient';

export interface ClassFinanceConfig {
  id?: string;
  class_type: string;
  lecturer_name: string;
  lecturer_whatsapp: string;
  institute_percentage: number;
  loan_deduction_amount: number;
  loan_remaining_months: number;
  is_loan_active: boolean;
  ad_deduction_amount: number;
  is_ad_active: boolean;
  ad_frequency?: 'monthly' | 'quarterly' | 'biannual' | 'yearly';
  tax_deduction_amount: number;
  is_tax_active: boolean;
  tax_label: string;
  notes?: string;
}

export interface StudentLedgerItem {
  id: string;
  name: string;
  username: string;
  whatsapp?: string;
  status: 'paid' | 'unpaid' | 'free';
  paidAmount: number;
  classType: string;
  paidMonthsCount?: number;
  totalMonthsCount?: number;
  paymentRecordId?: string;
  transactionId?: string;
  paymentMethod?: string;
}

export interface LecturerItem {
  id?: string;
  name: string;
  whatsapp: string;
  assignedClasses: string[];
}

interface AdminPaymentHistoryProps {
  students?: any[];
}

export default function AdminPaymentHistory({ students: propStudents = [] }: AdminPaymentHistoryProps) {
  const currentDate = new Date();
  const defaultMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // 1. PRIMARY FILTER: Lecturer (Only lecturers, excluding Super Admin, Admin, Manager)
  const [selectedLecturer, setSelectedLecturer] = useState<string>('තාරක අමරසිංහ (Taraka Amarasinghe)');
  const [lecturersList, setLecturersList] = useState<LecturerItem[]>([]);

  // 2. SECONDARY FILTER: Date / Time Period (Single month vs. Multi-month Range)
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single');
  const [singleMonth, setSingleMonth] = useState<string>(defaultMonth);
  const [selectedYear, setSelectedYear] = useState<string>(() => defaultMonth.split('-')[0] || String(currentDate.getFullYear()));
  const [selectedMonthPart, setSelectedMonthPart] = useState<string>(() => defaultMonth.split('-')[1] || String(currentDate.getMonth() + 1).padStart(2, '0'));

  // Multi-month range state
  const [rangeStartMonth, setRangeStartMonth] = useState<string>(defaultMonth);
  const [rangeEndMonth, setRangeEndMonth] = useState<string>(defaultMonth);

  // 3. TERTIARY FILTER: Classes of the Selected Lecturer (Multi-select support)
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['all']);

  // UI Tab & Search Filter
  const [activeTab, setActiveTab] = useState<'all' | 'paid' | 'unpaid' | 'free'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Database Data States
  const [payments, setPayments] = useState<any[]>([]);
  const [dbStudents, setDbStudents] = useState<any[]>(propStudents);
  const [classTypes, setClassTypes] = useState<any[]>([]);
  const [financeConfigs, setFinanceConfigs] = useState<Record<string, ClassFinanceConfig>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Month & Year Selector Constants
  const MONTHS_LIST = [
    { val: '01', name: '01 - ජනවාරි (Jan)' },
    { val: '02', name: '02 - පෙබරවාරි (Feb)' },
    { val: '03', name: '03 - මාර්තු (Mar)' },
    { val: '04', name: '04 - අප්‍රේල් (Apr)' },
    { val: '05', name: '05 - මැයි (May)' },
    { val: '06', name: '06 - ජූනි (Jun)' },
    { val: '07', name: '07 - ජූලි (Jul)' },
    { val: '08', name: '08 - අගෝස්තු (Aug)' },
    { val: '09', name: '09 - සැප්තැම්බර් (Sep)' },
    { val: '10', name: '10 - ඔක්තෝබර් (Oct)' },
    { val: '11', name: '11 - නොවැම්බර් (Nov)' },
    { val: '12', name: '12 - දෙසැම්බර් (Dec)' }
  ];

  const YEARS_LIST = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

  // Helper to extract student enrolled classes
  const getStudentClasses = (s: any): string[] => {
    const list: string[] = [];
    const addVal = (val: any) => {
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(addVal);
      } else if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) parsed.forEach(addVal);
            else list.push(trimmed);
          } catch { list.push(trimmed); }
        } else if (trimmed.includes(',')) {
          trimmed.split(',').forEach(item => {
            const t = item.trim();
            if (t) list.push(t);
          });
        } else if (trimmed) {
          list.push(trimmed);
        }
      }
    };
    addVal(s.class_types);
    addVal(s.classTypes);
    addVal(s.class);
    addVal(s.classes);
    return Array.from(new Set(list));
  };

  // Helper to get all months between two YYYY-MM strings
  const getMonthsBetween = (start: string, end: string): string[] => {
    if (!start || !end) return [start || end || defaultMonth];
    let [sY, sM] = start.split('-').map(Number);
    let [eY, eM] = end.split('-').map(Number);
    if (sY > eY || (sY === eY && sM > eM)) {
      const tempY = sY; const tempM = sM;
      sY = eY; sM = eM;
      eY = tempY; eM = tempM;
    }
    const months: string[] = [];
    let curY = sY;
    let curM = sM;
    while (curY < eY || (curY === eY && curM <= eM)) {
      months.push(`${curY}-${String(curM).padStart(2, '0')}`);
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
    return months.length > 0 ? months : [start];
  };

  // Live Database Fetch
  const loadDatabaseData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Class Types
      const { data: cData } = await supabase
        .from('class_types_config')
        .select('*')
        .order('class_type', { ascending: true });

      const resolvedClasses = (cData && cData.length > 0) ? cData.map(c => ({
        id: c.id,
        name: c.class_type || c.class_types || '',
        fee: Number(c.monthly_fee ?? 3500),
        whatsapp_link: c.whatsapp_link || ''
      })).filter(c => Boolean(c.name)) : [
        { id: '1', name: '2026 Revision', fee: 5000 },
        { id: '2', name: '2026 Theory', fee: 3500 },
        { id: '3', name: '2027 Paper Class', fee: 5000 },
        { id: '4', name: '2027 Revision', fee: 5000 },
        { id: '5', name: '2027 Theory', fee: 5000 },
        { id: '6', name: '2028 Theory', fee: 5000 }
      ];
      setClassTypes(resolvedClasses);

      // 2. Fetch Payments
      const { data: payData } = await supabase
        .from('payments')
        .select('*');
      if (payData) {
        setPayments(payData);
      }

      // 3. Fetch Students
      const { data: stdData } = await supabase
        .from('students')
        .select('*');
      if (stdData && stdData.length > 0) {
        setDbStudents(stdData);
      } else if (propStudents.length > 0) {
        setDbStudents(propStudents);
      }

      // 4. Fetch Finance Settings
      const map: Record<string, ClassFinanceConfig> = {};
      try {
        const { data: finData } = await supabase
          .from('class_finance_settings')
          .select('*');

        if (finData && finData.length > 0) {
          finData.forEach((f: any) => {
            map[f.class_type] = {
              id: f.id,
              class_type: f.class_type,
              lecturer_name: f.lecturer_name || 'තාරක අමරසිංහ (Taraka Amarasinghe)',
              lecturer_whatsapp: f.lecturer_whatsapp || '0779630100',
              institute_percentage: Number(f.institute_percentage ?? 20),
              loan_deduction_amount: Number(f.loan_deduction_amount ?? f.loan_monthly_installment ?? 0),
              loan_remaining_months: Number(f.loan_remaining_months ?? 0),
              is_loan_active: Boolean(f.is_loan_active),
              ad_deduction_amount: Number(f.ad_deduction_amount ?? f.ad_amount ?? 0),
              is_ad_active: Boolean(f.is_ad_active),
              ad_frequency: f.ad_frequency || 'monthly',
              tax_deduction_amount: Number(f.tax_deduction_amount ?? f.tax_amount ?? 0),
              is_tax_active: Boolean(f.is_tax_active),
              tax_label: f.tax_label || 'Tax / Platform Fee',
              notes: f.notes || ''
            };
          });
        }

        const savedLocal = localStorage.getItem('physics_class_finance_settings');
        if (savedLocal) {
          try {
            const localMap = JSON.parse(savedLocal);
            Object.keys(localMap).forEach(key => {
              if (!map[key]) map[key] = localMap[key];
            });
          } catch (e) {}
        }
        setFinanceConfigs(map);

      } catch (fErr) {
        console.warn('Finance settings load note:', fErr);
      }

      // 5. Fetch Lecturers List (STRICTLY role === 'lecturer', excluding super_admin, admin, manager)
      try {
        const { data: stfData } = await supabase.from('staff_members').select('*');
        const lecturersMap: Map<string, LecturerItem> = new Map();

        // Primary default teacher
        lecturersMap.set('තාරක අමරසිංහ (Taraka Amarasinghe)', {
          name: 'තාරක අමරසිංහ (Taraka Amarasinghe)',
          whatsapp: '0779630100',
          assignedClasses: resolvedClasses.map(c => c.name)
        });

        if (stfData) {
          stfData.forEach((s: any) => {
            // ONLY role === 'lecturer'! Super admin, admin, manager are administrators only.
            if (s.role === 'lecturer') {
              const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.username;
              const assigned = Array.isArray(s.assigned_classes)
                ? s.assigned_classes
                : typeof s.assigned_classes === 'string'
                ? JSON.parse(s.assigned_classes || '[]')
                : [];

              lecturersMap.set(fullName, {
                id: s.id,
                name: fullName,
                whatsapp: s.whatsapp || s.mobile || '0779630100',
                assignedClasses: assigned
              });
            }
          });
        }

        // Map classes from finance configs to lecturers
        Object.values(map).forEach(cfg => {
          if (cfg.lecturer_name && cfg.lecturer_name.trim()) {
            const lName = cfg.lecturer_name.trim();
            if (lecturersMap.has(lName)) {
              const existing = lecturersMap.get(lName)!;
              if (cfg.class_type && !existing.assignedClasses.includes(cfg.class_type)) {
                existing.assignedClasses.push(cfg.class_type);
              }
            } else {
              // Confirm this person is not super admin, admin or manager
              const isSysAdmin = stfData?.some((s: any) => 
                (s.role === 'super_admin' || s.role === 'admin' || s.role === 'manager') &&
                `${s.first_name || ''} ${s.last_name || ''}`.trim().toLowerCase() === lName.toLowerCase()
              );
              if (!isSysAdmin) {
                lecturersMap.set(lName, {
                  name: lName,
                  whatsapp: cfg.lecturer_whatsapp || '0779630100',
                  assignedClasses: cfg.class_type ? [cfg.class_type] : []
                });
              }
            }
          }
        });

        const list = Array.from(lecturersMap.values());
        setLecturersList(list);

        // Ensure selectedLecturer is valid
        if (!lecturersMap.has(selectedLecturer) && list.length > 0) {
          setSelectedLecturer(list[0].name);
        }

      } catch (stfErr) {
        console.warn('Lecturers load error:', stfErr);
      }

    } catch (e) {
      console.warn('Error loading payment history data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabaseData();
  }, []);

  // Helper to get finance config for a class
  const getClassFinanceConfig = (cName: string): ClassFinanceConfig => {
    if (financeConfigs[cName]) {
      return financeConfigs[cName];
    }
    return {
      class_type: cName,
      lecturer_name: 'තාරක අමරසිංහ (Taraka Amarasinghe)',
      lecturer_whatsapp: '0779630100',
      institute_percentage: 20,
      loan_deduction_amount: 0,
      loan_remaining_months: 0,
      is_loan_active: false,
      ad_deduction_amount: 0,
      is_ad_active: false,
      ad_frequency: 'monthly',
      tax_deduction_amount: 0,
      is_tax_active: false,
      tax_label: 'Tax / Platform Fee',
      notes: ''
    };
  };

  // Selected Lecturer Object
  const currentLecturerObj = useMemo<LecturerItem>(() => {
    return lecturersList.find(l => l.name === selectedLecturer) || {
      name: selectedLecturer,
      whatsapp: '0779630100',
      assignedClasses: classTypes.map(c => c.name)
    };
  }, [lecturersList, selectedLecturer, classTypes]);

  // Compute ONLY classes belonging to the selected lecturer ("ලෙක්චර සම්බන්ධව නොමැති අනෙකුත් පන්ති පෙන්වන්න එපා")
  const lecturerAvailableClasses = useMemo(() => {
    const assigned = currentLecturerObj.assignedClasses || [];
    
    // 1. Direct assigned classes
    if (assigned.length > 0) {
      const filtered = classTypes.filter(cls => 
        assigned.some(ac => ac.toLowerCase().trim() === cls.name.toLowerCase().trim())
      );
      if (filtered.length > 0) return filtered;
    }

    // 2. Classes configured with this lecturer in finance settings
    const financeMatches = classTypes.filter(cls => {
      const cfg = financeConfigs[cls.name];
      if (!cfg) return false;
      const lName = (cfg.lecturer_name || '').toLowerCase();
      const sel = selectedLecturer.toLowerCase();
      return lName.includes(sel) || sel.includes(lName);
    });
    if (financeMatches.length > 0) return financeMatches;

    // 3. If Taraka Amarasinghe (primary physics teacher), all classes belong to him
    if (selectedLecturer.includes('තාරක') || selectedLecturer.includes('Taraka')) {
      return classTypes;
    }

    return [];
  }, [currentLecturerObj, classTypes, financeConfigs, selectedLecturer]);

  // Reset or adjust selectedClasses when lecturer changes
  const handleLecturerChange = (newLecturer: string) => {
    setSelectedLecturer(newLecturer);
    setSelectedClasses(['all']); // Default to all classes of this lecturer
  };

  // Toggle class selection for this lecturer
  const toggleClass = (cName: string) => {
    if (cName === 'all') {
      setSelectedClasses(['all']);
      return;
    }

    if (selectedClasses.includes('all')) {
      setSelectedClasses([cName]);
      return;
    }

    if (selectedClasses.includes(cName)) {
      const next = selectedClasses.filter(c => c !== cName);
      if (next.length === 0) {
        setSelectedClasses(['all']);
      } else {
        setSelectedClasses(next);
      }
    } else {
      setSelectedClasses([...selectedClasses, cName]);
    }
  };

  // Target classes list to run reports on
  const targetClassList = useMemo<string[]>(() => {
    if (selectedClasses.includes('all')) {
      return lecturerAvailableClasses.map(c => c.name);
    }
    const valid = selectedClasses.filter(c => 
      lecturerAvailableClasses.some(lac => lac.name === c)
    );
    return valid.length > 0 ? valid : lecturerAvailableClasses.map(c => c.name);
  }, [selectedClasses, lecturerAvailableClasses]);

  // Selected Months List (Single month vs. Range of months)
  const selectedMonthsList = useMemo<string[]>(() => {
    if (dateFilterMode === 'single') {
      return [singleMonth];
    }
    return getMonthsBetween(rangeStartMonth, rangeEndMonth);
  }, [dateFilterMode, singleMonth, rangeStartMonth, rangeEndMonth]);

  // Handle Year & Month changes for Single Month mode
  const handleYearChange = (yr: string) => {
    setSelectedYear(yr);
    setSingleMonth(`${yr}-${selectedMonthPart}`);
  };

  const handleMonthPartChange = (mPart: string) => {
    setSelectedMonthPart(mPart);
    setSingleMonth(`${selectedYear}-${mPart}`);
  };

  const handleMonthInputChange = (val: string) => {
    setSingleMonth(val);
    if (val.includes('-')) {
      const [y, m] = val.split('-');
      if (y) setSelectedYear(y);
      if (m) setSelectedMonthPart(m);
    }
  };

  // Build complete student ledger for the target class(es) & selected month(s)
  const studentLedger = useMemo<StudentLedgerItem[]>(() => {
    const items: StudentLedgerItem[] = [];

    dbStudents.forEach(student => {
      const studentClasses = getStudentClasses(student);
      const isFreePlan = student.plan_type === 'free' || student.is_free === true;

      targetClassList.forEach(cName => {
        const cLower = cName.toLowerCase().trim();
        const isEnrolled = studentClasses.some(sc => {
          const scLower = sc.toLowerCase().trim();
          return scLower === cLower || scLower.includes(cLower) || cLower.includes(scLower);
        });

        if (!isEnrolled) return;

        const classInfo = classTypes.find(c => c.name === cName);
        const standardFee = classInfo?.fee || 3500;

        const studentActiveMonths = Array.isArray(student.active_months) 
          ? student.active_months 
          : typeof student.active_months === 'string' 
          ? JSON.parse(student.active_months || '[]') 
          : [];

        // Check payments across all selected months
        let paidMonthsCount = 0;
        let totalPaidAmount = 0;
        let lastPaymentRecord: any = null;

        selectedMonthsList.forEach(mStr => {
          const pRecord = payments.find(p => {
            const matchStudent = (p.student_id && p.student_id === student.id) || 
                                 (p.username && p.username === student.username);
            const matchMonth = (p.month === mStr) || (p.target_month === mStr);
            const pClass = String(p.class_type || p.class_name || '').toLowerCase().trim();
            const matchClass = pClass === cLower || pClass.includes(cLower) || cLower.includes(pClass);
            return matchStudent && matchMonth && matchClass && p.status === 'paid';
          });

          const hasActiveMonth = studentActiveMonths.includes(mStr) && student.is_paid && !isFreePlan;

          if (pRecord) {
            paidMonthsCount++;
            totalPaidAmount += Number(pRecord.amount || standardFee);
            lastPaymentRecord = pRecord;
          } else if (hasActiveMonth) {
            paidMonthsCount++;
            totalPaidAmount += standardFee;
          }
        });

        let status: 'paid' | 'unpaid' | 'free' = 'unpaid';
        let paidAmount = 0;

        if (isFreePlan) {
          status = 'free';
          paidAmount = 0; // Strictly 0 fee for free card students per user instructions!
        } else if (paidMonthsCount > 0) {
          status = 'paid';
          paidAmount = totalPaidAmount;
        } else {
          status = 'unpaid';
          paidAmount = 0; // Strictly 0 for unpaid students
        }

        items.push({
          id: `${student.id}_${cName}`,
          name: student.name || 'Unnamed Student',
          username: student.username || 'N/A',
          whatsapp: student.whatsapp || student.phone || '',
          status,
          paidAmount,
          classType: cName,
          paidMonthsCount,
          totalMonthsCount: selectedMonthsList.length,
          paymentRecordId: lastPaymentRecord?.id,
          transactionId: lastPaymentRecord?.transaction_id,
          paymentMethod: lastPaymentRecord?.payment_method
        });
      });
    });

    return items;
  }, [dbStudents, payments, selectedMonthsList, targetClassList, classTypes]);

  // Filtered view by tab & search query
  const filteredLedger = useMemo(() => {
    return studentLedger.filter(item => {
      const matchTab = activeTab === 'all' ? true : item.status === activeTab;
      const matchSearch = searchQuery.trim() === '' ? true : 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.whatsapp && item.whatsapp.includes(searchQuery));
      return matchTab && matchSearch;
    });
  }, [studentLedger, activeTab, searchQuery]);

  // Financial Statistics and Calculations across all target classes & months
  const financialStats = useMemo(() => {
    const totalEnrolled = studentLedger.length;
    const paidList = studentLedger.filter(s => s.status === 'paid');
    const unpaidList = studentLedger.filter(s => s.status === 'unpaid');
    const freeList = studentLedger.filter(s => s.status === 'free');

    // Gross Revenue = SUM of paid students' amounts only!
    const grossRevenue = paidList.reduce((acc, curr) => acc + curr.paidAmount, 0);

    let totalInstituteShare = 0;
    let totalLoanDeduction = 0;
    let totalAdDeduction = 0;
    let totalTaxDeduction = 0;

    const numMonths = selectedMonthsList.length;

    targetClassList.forEach(cName => {
      const classPaid = paidList.filter(s => s.classType === cName);
      const classGross = classPaid.reduce((acc, curr) => acc + curr.paidAmount, 0);
      const cfg = getClassFinanceConfig(cName);
      const instPct = Number(cfg.institute_percentage ?? 20);
      totalInstituteShare += Math.round(classGross * (instPct / 100));

      if (cfg.is_loan_active) {
        totalLoanDeduction += Number(cfg.loan_deduction_amount || 0) * numMonths;
      }
      if (cfg.is_ad_active) {
        const adAmt = Number(cfg.ad_deduction_amount || 0);
        if (cfg.ad_frequency === 'quarterly') {
          totalAdDeduction += adAmt * Math.ceil(numMonths / 3);
        } else if (cfg.ad_frequency === 'biannual') {
          totalAdDeduction += adAmt * Math.ceil(numMonths / 6);
        } else if (cfg.ad_frequency === 'yearly') {
          totalAdDeduction += adAmt * Math.ceil(numMonths / 12);
        } else {
          totalAdDeduction += adAmt * numMonths;
        }
      }
      if (cfg.is_tax_active) {
        totalTaxDeduction += Number(cfg.tax_deduction_amount || 0) * numMonths;
      }
    });

    const institutePercent = targetClassList.length === 1 
      ? Number(getClassFinanceConfig(targetClassList[0]).institute_percentage ?? 20)
      : grossRevenue > 0 ? Math.round((totalInstituteShare / grossRevenue) * 100) : 20;

    const totalDeductions = totalInstituteShare + totalLoanDeduction + totalAdDeduction + totalTaxDeduction;
    const netLecturerPayable = Math.max(0, grossRevenue - totalDeductions);

    return {
      totalEnrolled,
      paidCount: paidList.length,
      unpaidCount: unpaidList.length,
      freeCount: freeList.length,
      grossRevenue,
      institutePercent,
      instituteShare: totalInstituteShare,
      loanDeduction: totalLoanDeduction,
      adDeduction: totalAdDeduction,
      taxDeduction: totalTaxDeduction,
      totalDeductions,
      netLecturerPayable
    };
  }, [studentLedger, targetClassList, selectedMonthsList, financeConfigs]);

  // Period label for display & reports
  const periodLabel = useMemo(() => {
    if (dateFilterMode === 'single') {
      return singleMonth;
    }
    return `${rangeStartMonth} to ${rangeEndMonth} (${selectedMonthsList.length} Months Consolidated)`;
  }, [dateFilterMode, singleMonth, rangeStartMonth, rangeEndMonth, selectedMonthsList]);

  // Clean ASCII lecturer name for PDF font safety
  const cleanLecturerName = useMemo(() => {
    const raw = currentLecturerObj.name || 'Taraka Amarasinghe';
    const cleaned = raw.replace(/[^\x00-\x7F]/g, '').trim().replace(/^\(|\)$/g, '').trim();
    return cleaned || 'Taraka Amarasinghe';
  }, [currentLecturerObj]);

  // Reusable PDF Document Builder
  const buildPdfDocument = (): jsPDF => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const currentClassTitle = selectedClasses.includes('all') 
      ? `All Classes (${targetClassList.join(', ')})` 
      : targetClassList.join(', ');

    const lecturerPhone = (currentLecturerObj.whatsapp || '0779630100').replace(/[^0-9+]/g, '');

    // 1. Header & LMS Branding
    doc.setFillColor(15, 23, 42); // Navy Header
    doc.rect(0, 0, 210, 36, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('SMART PHYSICS LEARNING MANAGEMENT SYSTEM (LMS)', 14, 14);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL CLASS FINANCIAL & STUDENT PAYMENT LEDGER', 14, 21);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${new Date().toLocaleString()} | Auto-Generated Certified Payment Statement`, 14, 28);

    // 2. Report Metadata Box
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 40, 182, 28, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 40, 182, 28, 'S');

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`LECTURER: ${cleanLecturerName} (${lecturerPhone})`, 18, 47);
    doc.text(`TIME PERIOD: ${periodLabel}`, 18, 54);
    doc.text(`CLASS: ${currentClassTitle.substring(0, 48)}`, 18, 61);

    doc.setFont('helvetica', 'normal');
    doc.text(`TOTAL ENROLLED: ${financialStats.totalEnrolled}`, 120, 47);
    doc.setTextColor(22, 101, 52); // Green
    doc.text(`PAID STUDENTS: ${financialStats.paidCount}`, 120, 54);
    doc.setTextColor(185, 28, 28); // Red
    doc.text(`UNPAID: ${financialStats.unpaidCount}`, 165, 54);
    doc.setTextColor(2, 132, 199); // Blue
    doc.text(`FREE SCHOLARSHIPS: ${financialStats.freeCount}`, 120, 61);

    // 3. Financial Statement Breakdown Table
    const summaryHead = [['FINANCIAL STATEMENT BREAKDOWN', 'RATE / STATUS', 'AMOUNT (LKR)']];
    const summaryBody = [
      ['Gross Class Revenue (Paid Students Only)', '100%', `+ LKR ${financialStats.grossRevenue.toLocaleString()}`],
      ['Institute Revenue Share Deduction', `${financialStats.institutePercent}%`, `- LKR ${financialStats.instituteShare.toLocaleString()}`],
    ];

    if (financialStats.loanDeduction > 0) {
      summaryBody.push([
        'Lecturer Loan Installment Deduction',
        'Active Deduction',
        `- LKR ${financialStats.loanDeduction.toLocaleString()}`
      ]);
    }

    if (financialStats.adDeduction > 0) {
      summaryBody.push([
        'Marketing & Advertising Campaign Charge',
        'Active Deduction',
        `- LKR ${financialStats.adDeduction.toLocaleString()}`
      ]);
    }

    if (financialStats.taxDeduction > 0) {
      summaryBody.push([
        'Tax & Other Platform Charges',
        'Active Deduction',
        `- LKR ${financialStats.taxDeduction.toLocaleString()}`
      ]);
    }

    summaryBody.push([
      'NET PAYABLE AMOUNT TO LECTURER (FINAL PAYOUT)',
      'Approved Net Salary',
      `LKR ${financialStats.netLecturerPayable.toLocaleString()}`
    ]);

    autoTable(doc, {
      head: summaryHead,
      body: summaryBody,
      startY: 72,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.2
      },
      columnStyles: {
        0: { cellWidth: 95, fontStyle: 'bold' },
        1: { cellWidth: 45, halign: 'center' },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.row.index === summaryBody.length - 1) {
          data.cell.styles.fillColor = [220, 252, 231]; // Light green highlight
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontSize = 9;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // 4. Individual Student Ledger Table
    const finalY = (doc as any).lastAutoTable?.finalY || 120;

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('INDIVIDUAL STUDENT PAYMENT & ATTENDANCE LEDGER', 14, finalY + 8);

    const tableHead = [['#', 'STUDENT NAME', 'USERNAME', 'CLASS', 'PAYMENT STATUS', 'AMOUNT (LKR)']];
    const tableBody = studentLedger.map((s, idx) => {
      let displayStatus = s.totalMonthsCount && s.totalMonthsCount > 1 
        ? `PAID (${s.paidMonthsCount}/${s.totalMonthsCount})` 
        : 'PAID (ACTIVE)';
      let displayAmount = `+ LKR ${s.paidAmount.toLocaleString()}`;

      if (s.status === 'unpaid') {
        displayStatus = s.totalMonthsCount && s.totalMonthsCount > 1 
          ? `UNPAID (0/${s.totalMonthsCount})` 
          : 'UNPAID';
        displayAmount = 'LKR 0';
      } else if (s.status === 'free') {
        displayStatus = 'FREE (SCHOLARSHIP)';
        displayAmount = 'LKR 0';
      }

      const cleanStudentName = s.name.replace(/[^\x00-\x7F]/g, '').trim() || s.name;
      const cleanUsername = s.username.replace(/[^\x00-\x7F]/g, '').trim() || s.username;

      return [
        idx + 1,
        cleanStudentName.substring(0, 32),
        `@${cleanUsername.substring(0, 24)}`,
        s.classType.substring(0, 22),
        displayStatus,
        displayAmount
      ];
    });

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: finalY + 12,
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 46, fontStyle: 'bold' },
        2: { cellWidth: 34 },
        3: { cellWidth: 30 },
        4: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rawItem = studentLedger[data.row.index];
          if (rawItem?.status === 'paid') {
            if (data.column.index === 4 || data.column.index === 5) {
              data.cell.styles.textColor = [22, 101, 52]; // Green
            }
          } else if (rawItem?.status === 'unpaid') {
            data.cell.styles.textColor = [185, 28, 28]; // Red
          } else if (rawItem?.status === 'free') {
            data.cell.styles.textColor = [2, 132, 199]; // Light Blue
          }
        }
      }
    });

    // 5. System Certification Footer on every page
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'This payment report was automatically generated by Smart Physics LMS System | Official Certified Ledger',
        14,
        288
      );
      doc.text(`Page ${p} of ${totalPages}`, 196, 288, { align: 'right' });
    }

    return doc;
  };

  // Direct PDF Download Handler
  const generateClassPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const doc = buildPdfDocument();
      const sanitizedLec = cleanLecturerName.replace(/\s+/g, '_');
      const sanitizedPeriod = periodLabel.replace(/[^\w-]/g, '_');
      doc.save(`Smart_Physics_${sanitizedLec}_${sanitizedPeriod}_Report.pdf`);

      setActionNotice('📄 PDF වාර්තාව සාර්ථකව ජනනය වී බාගත විය (PDF Downloaded)!');
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      console.error('PDF Generation error:', err);
      alert('PDF ජනනය කිරීමේදී දෝෂයක්: ' + (err.message || ''));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // WhatsApp Message & PDF Share to Lecturer
  const handleSendToLecturerWhatsApp = async () => {
    setIsGeneratingPdf(true);
    try {
      const lecturerPhone = (currentLecturerObj.whatsapp || '0779630100').replace(/[^0-9]/g, '');
      const cleanPhone = lecturerPhone.startsWith('0') ? '94' + lecturerPhone.substring(1) : lecturerPhone;

      const currentClassesTitle = selectedClasses.includes('all') 
        ? `All Classes (${targetClassList.join(', ')})` 
        : targetClassList.join(', ');

      const fileName = `Smart_Physics_${cleanLecturerName.replace(/\s+/g, '_')}_${periodLabel.replace(/[^\w-]/g, '_')}_Report.pdf`;

      // 1. Build Document
      const doc = buildPdfDocument();
      
      // 2. Automatically save/download to user's device
      doc.save(fileName);

      // 3. Create File Object for Web Share API
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      // 4. Formulate Detailed Message
      const message = `📊 *Smart Physics - ගුරු ආදායම් සහ සිසු ගෙවීම් නිල වාර්තාව*
━━━━━━━━━━━━━━━━━━━━
👨‍🏫 *දේශකයා:* ${currentLecturerObj.name}
📅 *කාලසීමාව:* ${periodLabel}
🏛️ *පන්ති:* ${currentClassesTitle}

👥 *සිසුන් සංඛ්‍යාලේඛන:*
• මුළු සිසුන්: ${financialStats.totalEnrolled}
• මුදල් ගෙවූ සිසුන්: ${financialStats.paidCount}
• නොගෙවූ සිසුන්: ${financialStats.unpaidCount}
• නොමිලේ (Free Card): ${financialStats.freeCount}

💰 *මූල්‍ය බෙදීයාම සහ ආදායම් විස්තරය:*
• මුළු එකතුව (Gross Revenue): රු. ${financialStats.grossRevenue.toLocaleString()}
• ආයතනයට ලබා ගන්නා ප්‍රතිශතය (${financialStats.institutePercent}%): -රු. ${financialStats.instituteShare.toLocaleString()}
${financialStats.loanDeduction > 0 ? `• ගුරු ණය වාරිකය අඩු කිරීම: -රු. ${financialStats.loanDeduction.toLocaleString()}` : ''}
${financialStats.adDeduction > 0 ? `• ප්‍රචාරණ දැන්වීම් ගාස්තු: -රු. ${financialStats.adDeduction.toLocaleString()}` : ''}
${financialStats.taxDeduction > 0 ? `• ටැක්ස් / වෙනත් අයකිරීම්: -රු. ${financialStats.taxDeduction.toLocaleString()}` : ''}

━━━━━━━━━━━━━━━━━━━━
💵 *ගුරුතුමාට ගෙවිය යුතු ශුද්ධ මුදල (Net Payable):*
👉 *රු. ${financialStats.netLecturerPayable.toLocaleString()}/=*
━━━━━━━━━━━━━━━━━━━━
📌 නිල සහතිකලත් PDF වාර්තාව Super Admin පද්ධතිය මඟින් ස්වයංක්‍රීයව ජනනය කර බාගත කර ඇත.`;

      // 5. Check if browser supports Web Share API with files
      let shared = false;
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: `Smart Physics - Financial Report (${periodLabel})`,
            text: message
          });
          shared = true;
        } catch (shareErr) {
          // User cancelled share dialog
        }
      }

      if (!shared) {
        // Fallback: Open WhatsApp Web / App directly with message prefilled
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

      setActionNotice('📄 PDF වාර්තාව සාර්ථකව බාගත විය සහ WhatsApp විවෘත විය! ඔබට මෙම PDF වාර්තාව ගුරුතුමාට යැවිය හැක.');
      setTimeout(() => setActionNotice(null), 6000);

    } catch (err: any) {
      console.error('WhatsApp send error:', err);
      alert('දෝෂයක්: ' + (err.message || ''));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    const currentClassTitle = selectedClasses.includes('all') ? 'All Classes' : targetClassList.join(', ');
    const summaryText = `Smart Physics - Statement (${currentLecturerObj.name} | ${currentClassTitle} | ${periodLabel})
Gross Revenue: LKR ${financialStats.grossRevenue.toLocaleString()}
Institute Share (${financialStats.institutePercent}%): LKR ${financialStats.instituteShare.toLocaleString()}
Net Lecturer Payable: LKR ${financialStats.netLecturerPayable.toLocaleString()}
Paid: ${financialStats.paidCount} | Unpaid: ${financialStats.unpaidCount} | Free: ${financialStats.freeCount}`;
    navigator.clipboard.writeText(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="space-y-6">

      {/* ACTION NOTICE TOAST BANNER */}
      {actionNotice && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setActionNotice(null)}
            className="text-emerald-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-emerald-950/40"
          >
            ඉවත් කරන්න
          </button>
        </div>
      )}
      
      {/* 1. TOP HEADER & SYSTEM TITLE */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold mb-2">
            <DollarSign size={14} />
            <span>SUPER ADMIN & MANAGER PAYMENT REPORTS & LECTURER SALARY</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white font-display flex items-center gap-2.5">
            <FileText className="text-emerald-400" size={24} />
            <span>ගෙවීම් ඉතිහාසය සහ පන්ති වාර්තා (Payment History & Class Reports)</span>
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1 leading-relaxed">
            දේශකවරයා පදනම් කරගෙන කාලවකවානු හෝ තනි මාස අනුව අදාළ පන්තිවල ගෙවූ, නොගෙවූ සහ Free සිසුන්ගේ වාර්තා සහ ගුරු වැටුප් ස්වයංක්‍රීයව සකස් කර PDF සහ WhatsApp වාර්තා ලබාගන්න.
          </p>
        </div>

        {/* Global Action Refresh Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadDatabaseData}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>නැවත පූරණය (Refresh)</span>
          </button>
        </div>
      </div>

      {/* 2. INTERCONNECTED HIERARCHICAL FILTER SYSTEM */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl space-y-5">
        
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Filter size={15} className="text-blue-400" />
            <span>සම්බන්ධිත පෙරහන් පද්ධතිය (Interconnected Report Filter System)</span>
          </span>
          <span className="text-[11px] text-slate-400">
            ප්‍රධාන දේශකයා → කාලසීමාව → දේශකයාගේ පන්ති
          </span>
        </div>

        {/* Level 1 & 2 Grid: Lecturer Selection & Time Period Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* LEVEL 1: LECTURER SELECTION (Primary Filter - Only Lecturers) */}
          <div className="lg:col-span-5 p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <Users size={15} className="text-purple-400" />
                <span>1. දේශකයා තෝරන්න (Select Lecturer):</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Primary Filter
              </span>
            </div>

            <select
              value={selectedLecturer}
              onChange={(e) => handleLecturerChange(e.target.value)}
              className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:border-purple-500 focus:outline-none cursor-pointer shadow-inner"
            >
              {lecturersList.map((lec, idx) => (
                <option key={idx} value={lec.name} className="bg-slate-900 text-white">
                  👨‍🏫 {lec.name}
                </option>
              ))}
            </select>

            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">
                දුරකථන: <strong className="text-slate-200 font-mono">{currentLecturerObj.whatsapp || '0779630100'}</strong>
              </span>
              <span className="text-emerald-400 font-bold shrink-0">
                පන්ති {lecturerAvailableClasses.length}ක් සම්බන්ධයි
              </span>
            </div>
          </div>

          {/* LEVEL 2: TIME PERIOD / MONTH FILTER (Single Month OR Date Range with Calendars) */}
          <div className="lg:col-span-7 p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <Calendar size={15} className="text-blue-400" />
                <span>2. කාලවකවානුව / මාසය (Time Period Selection):</span>
              </span>

              {/* Mode Toggle Pills */}
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDateFilterMode('single')}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    dateFilterMode === 'single'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  තනි මාසයක් (Single Month)
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('range')}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    dateFilterMode === 'range'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  මාස කිහිපයක් (Date Range)
                </button>
              </div>
            </div>

            {/* Mode A: Single Month Controls */}
            {dateFilterMode === 'single' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {YEARS_LIST.map(y => (
                      <option key={y} value={y} className="bg-slate-900 text-white">{y} අවුරුද්ද (Year)</option>
                    ))}
                  </select>

                  <select
                    value={selectedMonthPart}
                    onChange={(e) => handleMonthPartChange(e.target.value)}
                    className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {MONTHS_LIST.map(m => (
                      <option key={m.val} value={m.val} className="bg-slate-900 text-white">{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <span>තෝරාගත් මාසය:</span>
                    <strong className="text-blue-400 font-mono font-bold">{singleMonth}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">කැලැන්ඩරයෙන් තෝරන්න:</span>
                    <input
                      type="month"
                      value={singleMonth}
                      onChange={(e) => handleMonthInputChange(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white px-2 py-0.5 rounded-lg text-xs cursor-pointer hover:border-blue-400"
                      title="Month Picker Calendar"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Mode B: Multiple Months Range Controls */
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={11} className="text-emerald-400" />
                      <span>ආරම්භක මාසය (Start Year & Month):</span>
                    </label>
                    <input
                      type="month"
                      value={rangeStartMonth}
                      onChange={(e) => setRangeStartMonth(e.target.value)}
                      className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={11} className="text-rose-400" />
                      <span>අවසන් මාසය (End Year & Month):</span>
                    </label>
                    <input
                      type="month"
                      value={rangeEndMonth}
                      onChange={(e) => setRangeEndMonth(e.target.value)}
                      className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:border-rose-500 focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-blue-950/40 border border-blue-500/30 text-[11px] text-blue-300 flex items-center justify-between">
                  <span>
                    කාලසීමාව: <strong>{rangeStartMonth}</strong> සිට <strong>{rangeEndMonth}</strong> දක්වා
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/20 font-bold font-mono">
                    මාස {selectedMonthsList.length}ක් එකතු කළ වාර්තාව (Consolidated)
                  </span>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* LEVEL 3: LECTURER'S REGISTERED CLASSES (Only classes for this lecturer) */}
        <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <BookOpen size={15} className="text-emerald-400" />
              <span>3. දේශකයාගේ පන්ති (Classes Registered for [{selectedLecturer}]):</span>
            </span>

            <span className="text-[11px] text-slate-400">
              {selectedClasses.includes('all') 
                ? `සියලුම පන්ති ${lecturerAvailableClasses.length}ම තෝරාගෙන ඇත` 
                : `පන්ති ${selectedClasses.length}ක් තෝරාගෙන ඇත`}
            </span>
          </div>

          {lecturerAvailableClasses.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>මෙම දේශකයාට මෙතෙක් කිසිදු පන්තියක් සම්බන්ධ කර නොමැත. Finance Settings මඟින් හෝ Staff Management මඟින් පන්ති පවරන්න.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Option to select ALL classes of this lecturer */}
              <button
                type="button"
                onClick={() => toggleClass('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border ${
                  selectedClasses.includes('all')
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-md shadow-emerald-700/30 ring-2 ring-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>✓ සියලුම පන්ති (All {lecturerAvailableClasses.length} Classes)</span>
              </button>

              {/* Individual Class Pills belonging to this lecturer */}
              {lecturerAvailableClasses.map(cls => {
                const isChecked = selectedClasses.includes('all') || selectedClasses.includes(cls.name);
                const isExplicitlySingle = !selectedClasses.includes('all') && selectedClasses.includes(cls.name);

                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => toggleClass(cls.name)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
                      isExplicitlySingle
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md ring-2 ring-blue-500/20'
                        : isChecked
                        ? 'bg-slate-800 text-slate-200 border-slate-700'
                        : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                    title="ක්ලික් කර තෝරන්න / ඉවත් කරන්න"
                  >
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                      isChecked ? 'bg-blue-500 text-white border-blue-400' : 'border-slate-700'
                    }`}>
                      {isChecked ? '✓' : ''}
                    </div>
                    <span>{cls.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      (රු. {cls.fee.toLocaleString()})
                    </span>
                  </button>
                );
              })}

            </div>
          )}

          {/* Active Filter Scope Overview */}
          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 border-t border-slate-800/80">
            <span>සක්‍රීය වාර්තා විෂය පථය:</span>
            <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
              👨‍🏫 {selectedLecturer}
            </span>
            <span className="font-bold text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-800/40">
              📅 {periodLabel}
            </span>
            <span className="font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-800/40">
              🏛️ {selectedClasses.includes('all') ? `පන්ති ${targetClassList.length}ම (All)` : targetClassList.join(', ')}
            </span>
          </div>

        </div>

      </div>

      {/* 3. FINANCIAL SUMMARY & LECTURER PAYOUT STATEMENTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Gross Collection (Paid Students Only) */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 space-y-1 shadow-lg">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
            මුළු එකතුව (Gross Revenue)
          </span>
          <p className="text-2xl font-black font-mono text-emerald-300">
            + රු. {financialStats.grossRevenue.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-400">
            මුදල් ගෙවූ සිසුන් {financialStats.paidCount} දෙනාගෙන් පමණි
          </p>
        </div>

        {/* Institute Share */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 space-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
              ආයතනයට ගන්නා මුදල
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {financialStats.institutePercent}% Share
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-purple-300">
            - රු. {financialStats.instituteShare.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-400">
            ආයතනයේ නඩත්තු හා පද්ධති ගාස්තුව
          </p>
        </div>

        {/* Deductions (Loan, Ads, Tax) */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 space-y-1 shadow-lg">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            වෙනත් අයකිරීම් (Deductions)
          </span>
          <p className="text-2xl font-black font-mono text-amber-300">
            - රු. {(financialStats.loanDeduction + financialStats.adDeduction + financialStats.taxDeduction).toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-400">
            ණය: රු. {financialStats.loanDeduction.toLocaleString()} | දැන්වීම්: රු. {financialStats.adDeduction.toLocaleString()}
          </p>
        </div>

        {/* Net Lecturer Payout */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-950/50 via-indigo-950/50 to-slate-900 border-2 border-blue-500/50 space-y-1 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-blue-300 uppercase tracking-wider block">
              ගුරුතුමාට ගෙවිය යුතු මුදල
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
              Net Payout
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-white">
            රු. {financialStats.netLecturerPayable.toLocaleString()}
          </p>
          <p className="text-[10px] text-blue-200 truncate">
            {currentLecturerObj.name}
          </p>
        </div>

      </div>

      {/* 4. EXPORT & COMMUNICATION TOOLBAR (PDF & WhatsApp) */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        
        {/* Student Counters Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-300">
            සිසුන් ගණන:
          </span>
          <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
            මුළු සිසුන්: <b>{financialStats.totalEnrolled}</b>
          </span>
          <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ගෙවූ: <b>{financialStats.paidCount}</b>
          </span>
          <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40">
            නොගෙවූ: <b>{financialStats.unpaidCount}</b>
          </span>
          <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/40">
            Free Card: <b>{financialStats.freeCount}</b>
          </span>
        </div>

        {/* Action Buttons: PDF Download, WhatsApp to Lecturer, Copy */}
        <div className="flex flex-wrap items-center gap-2">
          
          <button
            onClick={generateClassPdf}
            disabled={isGeneratingPdf}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition shadow-lg shadow-emerald-700/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Download Official PDF Report"
          >
            <Download size={15} />
            <span>{isGeneratingPdf ? 'ජනනය වෙමින්...' : 'PDF වාර්තාව ලබාගන්න (Download PDF)'}</span>
          </button>

          <button
            onClick={handleSendToLecturerWhatsApp}
            disabled={isGeneratingPdf}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl transition shadow-lg shadow-emerald-800/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Send PDF Report & Statement to Lecturer via WhatsApp"
          >
            <MessageCircle size={15} />
            <span>ගුරුතුමාට WhatsApp කරන්න (Send PDF)</span>
          </button>

          <button
            onClick={handleCopySummary}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
            title="Copy Report Summary to Clipboard"
          >
            {copiedSummary ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
          </button>

        </div>

      </div>

      {/* 5. TAB FILTERS & STUDENT SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Tab Filters */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            සියල්ල (All - {studentLedger.length})
          </button>
          <button
            onClick={() => setActiveTab('paid')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'paid'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-emerald-400/80 hover:text-emerald-300'
            }`}
          >
            🟢 ගෙවූ සිසුන් ({financialStats.paidCount})
          </button>
          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'unpaid'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-400/80 hover:text-rose-300'
            }`}
          >
            🔴 නොගෙවූ සිසුන් ({financialStats.unpaidCount})
          </button>
          <button
            onClick={() => setActiveTab('free')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'free'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-sky-400/80 hover:text-sky-300'
            }`}
          >
            🔵 Free Card ({financialStats.freeCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="නම, Username හෝ WhatsApp සොයන්න..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

      </div>

      {/* 6. DETAILED STUDENT ATTENDANCE & PAYMENT LEDGER TABLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw size={24} className="animate-spin mx-auto text-blue-400" />
            <p className="text-xs">වාර්තා සහ දත්ත පූරණය වෙමින් පවතී...</p>
          </div>
        ) : filteredLedger.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Users size={32} className="mx-auto text-slate-600" />
            <p className="text-sm font-bold text-slate-300">සිසුන් වාර්තා හමු නොවීය</p>
            <p className="text-xs text-slate-500">තෝරාගත් දේශකයා හෝ පන්ති සඳහා සිසුන් ලියාපදිංචි වී නොමැත.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 text-center w-12">#</th>
                  <th className="py-3 px-4">සිසුවාගේ නම (Student Name)</th>
                  <th className="py-3 px-4">පරිශීලක නාමය (Username)</th>
                  <th className="py-3 px-4">පන්තිය (Class)</th>
                  <th className="py-3 px-4">WhatsApp අංකය</th>
                  <th className="py-3 px-4">තත්වය (Payment Status)</th>
                  <th className="py-3 px-4 text-right">අයවූ මුදල (Amount)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLedger.map((s, idx) => (
                  <tr 
                    key={s.id} 
                    className="hover:bg-slate-800/40 transition group"
                  >
                    <td className="py-3 px-4 text-center text-slate-500 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    
                    {/* Student Name:
                        Paid: bold white
                        Unpaid: Red text
                        Free: Light blue text
                    */}
                    <td className={`py-3 px-4 font-extrabold ${
                      s.status === 'paid' ? 'text-white' :
                      s.status === 'unpaid' ? 'text-rose-400' :
                      'text-sky-300'
                    }`}>
                      {s.name}
                    </td>

                    <td className={`py-3 px-4 font-mono font-bold ${
                      s.status === 'paid' ? 'text-slate-300' :
                      s.status === 'unpaid' ? 'text-rose-400/90' :
                      'text-sky-300/90'
                    }`}>
                      @{s.username}
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700">
                        {s.classType}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-400">
                      {s.whatsapp ? (
                        <a 
                          href={`https://wa.me/94${s.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-400 transition flex items-center gap-1"
                        >
                          <span>{s.whatsapp}</span>
                        </a>
                      ) : 'N/A'}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      {s.status === 'paid' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                          <CheckCircle2 size={11} /> 
                          {s.totalMonthsCount && s.totalMonthsCount > 1 
                            ? `PAID (${s.paidMonthsCount}/${s.totalMonthsCount})` 
                            : 'PAID'}
                        </span>
                      )}
                      {s.status === 'unpaid' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase">
                          <XCircle size={11} /> නොගෙවූ (UNPAID)
                        </span>
                      )}
                      {s.status === 'free' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/40 uppercase">
                          <Award size={11} /> FREE (නොමිලේ)
                        </span>
                      )}
                    </td>

                    {/* Fee Amount:
                        Paid: Green with + sign
                        Unpaid & Free: Strictly 0 per user instructions
                    */}
                    <td className="py-3 px-4 text-right font-mono font-black">
                      {s.status === 'paid' ? (
                        <span className="text-emerald-400 text-sm">
                          + රු. {s.paidAmount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">
                          රු. 0
                        </span>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
