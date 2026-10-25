import React, { useState, useEffect } from 'react';
import { 
  StaffMember, 
  StaffRole 
} from '../types';
import { 
  fetchAllStaff, 
  createStaffMember, 
  updateStaffMember, 
  deleteStaffMember, 
  toggleBlockStaffMember,
  generateAutoCredentials,
  generateWhatsAppCredentialsMessage,
  getActiveStaffSession
} from '../staffService';
import { subscribeRealtimeEvents } from '../realtimeSync';
import SecurityPasswordModal from './SecurityPasswordModal';
import { supabase } from '../supabaseClient';
import { 
  ShieldCheck, 
  UserCheck, 
  Briefcase, 
  GraduationCap, 
  UserPlus, 
  Search, 
  Copy, 
  Check, 
  MessageSquare, 
  Trash2, 
  Ban, 
  CheckCircle, 
  RefreshCw, 
  Lock, 
  Eye, 
  EyeOff, 
  KeyRound, 
  ExternalLink,
  Edit,
  Sparkles,
  PhoneCall,
  X,
  Plus
} from 'lucide-react';

const ROLE_CONFIG: Record<StaffRole, { label: string; badgeClass: string; icon: any }> = {
  super_admin: {
    label: 'Super Admin (ප්‍රධාන පරිපාලක)',
    badgeClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    icon: ShieldCheck
  },
  admin: {
    label: 'Admin (පරිපාලක)',
    badgeClass: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    icon: UserCheck
  },
  manager: {
    label: 'Manager (කළමනාකරු)',
    badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    icon: Briefcase
  },
  lecturer: {
    label: 'Lecturer (දේශක)',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    icon: GraduationCap
  }
};

const AVAILABLE_SECTIONS = [
  { id: 'overview', label: 'දළ විශ්ලේෂණය (Overview Dashboard)' },
  { id: 'registry', label: 'ශිෂ්‍ය ලේඛනය (Student Registry)' },
  { id: 'manual_student', label: 'ශිෂ්‍ය ලියාපදිංචිය (Manual Registration)' },
  { id: 'staff', label: 'කාර්යමණ්ඩලය (Staff Management)' },
  { id: 'device_security', label: '🛡️ ඩිවයිස් පාලනය (Device Security & Bans)' },
  { id: 'resets', label: 'පන්ති ගාස්තු සහ වර්ග (Class Fees & Types)' },
  { id: 'payments', label: 'ගෙවීම් කළමනාකරණය (Manage Payments)' },
  { id: 'pending_payments', label: 'පොරොත්තු ගෙවීම් (Pending Approvals)' },
  { id: 'bank_accounts', label: 'බැංකු ගිණුම් (Bank Accounts)' },
  { id: 'history', label: 'ගෙවීම් ඉතිහාසය (Payment History)' },
  { id: 'finance', label: 'මූල්‍ය දෙපාර්තමේන්තුව (Finance Department)' },
  { id: 'qr_generator', label: 'QR Generator (Banner Landing)' },
  { id: 'site_configs', label: 'වෙබ් අඩවි සැකසුම් (Site Configs)' },
  { id: 'planner', label: 'දින දර්ශනය (Calendar Planner)' },
  { id: 'live_classes', label: 'සජීවී පන්ති (Scheduled Lives)' },
  { id: 'resources', label: 'වීඩියෝ රෙකෝඩින් (Recordings)' },
  { id: 'tutes', label: 'ටියුට්ස් (Tutes Drive)' },
  { id: 'broadcast', label: 'නිවේදන (Broadcast Notices)' }
];

interface AdminStaffManagerProps {
  currentStaff?: StaffMember | null;
}

export default function AdminStaffManager({ currentStaff }: AdminStaffManagerProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'all' | StaffRole>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Current session & role hierarchy
  const activeUser = currentStaff || getActiveStaffSession();
  const actorRole: StaffRole = activeUser?.role || 'super_admin';

  // Role hierarchy for adding new staff:
  // super_admin -> admin, manager, lecturer
  // admin -> manager, lecturer (cannot add admin or super_admin)
  // manager -> lecturer (cannot add admin, super_admin, or manager)
  const assignableRoles: StaffRole[] = 
    actorRole === 'super_admin' ? ['admin', 'manager', 'lecturer'] :
    actorRole === 'admin' ? ['manager', 'lecturer'] :
    actorRole === 'manager' ? ['lecturer'] : [];

  // Allowed visible roles in staff list based on viewer's rank:
  // User Requirement: For Admin and Manager dashboards, DO NOT show Super Admin details!
  // Show only staff members whose roles are BELOW them:
  // - super_admin -> sees super_admin, admin, manager, lecturer
  // - admin -> sees manager, lecturer (never super_admin, never admin)
  // - manager -> sees lecturer (never super_admin, never admin, never manager)
  const allowedVisibleRoles: StaffRole[] =
    actorRole === 'super_admin' ? ['super_admin', 'admin', 'manager', 'lecturer'] :
    actorRole === 'admin' ? ['manager', 'lecturer'] :
    actorRole === 'manager' ? ['lecturer'] : [];

  const viewableTabs: ('all' | StaffRole)[] = ['all', ...allowedVisibleRoles];

  // Check if current user has permission to modify (edit/delete/block) a specific staff member:
  const canModifyStaff = (target: StaffMember): boolean => {
    if (actorRole === 'super_admin') {
      return target.role !== 'super_admin' || target.id === activeUser?.id;
    }
    if (actorRole === 'admin') {
      return target.role === 'manager' || target.role === 'lecturer';
    }
    if (actorRole === 'manager') {
      return target.role === 'lecturer';
    }
    return false;
  };
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dynamic Class Types from database table class_types_config
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  // Form states
  const [role, setRole] = useState<StaffRole>(assignableRoles[0] || 'lecturer');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nic, setNic] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [mobile, setMobile] = useState('');
  const [title, setTitle] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [allowedSections, setAllowedSections] = useState<string[]>([
    'registry', 'manual_student', 'payments', 'pending_payments', 'live_classes', 'resources', 'tutes', 'planner'
  ]);
  const [deletePin, setDeletePin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Success message modal after creating
  const [createdStaffSuccess, setCreatedStaffSuccess] = useState<{
    staff: StaffMember;
    plainPassword: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchClassesFromDb = async () => {
    try {
      const { data, error } = await supabase
        .from('class_types_config')
        .select('class_type')
        .eq('is_active', true)
        .order('class_type', { ascending: true });
      if (data && data.length > 0) {
        const names = data.map((d: any) => d.class_type).filter(Boolean);
        setAvailableClasses(names);
      }
    } catch (e) {
      console.warn('Error fetching class_types_config in staff manager:', e);
    }
  };

  const loadStaff = async (silent = false) => {
    if (!silent && staffList.length === 0) {
      setLoading(true);
    }
    try {
      const data = await fetchAllStaff();
      setStaffList(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff(false);
    fetchClassesFromDb();

    // Event listener for realtime staff updates (no jitter, no loading flicker)
    const unsubscribe = subscribeRealtimeEvents((type) => {
      if (type === 'staff_updated') {
        loadStaff(true);
      }
    });

    const channel = supabase
      .channel('staff_manager_class_types_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_types_config' }, () => {
        fetchClassesFromDb();
      })
      .subscribe();

    // Occasional gentle background check (every 30s) without flashing the loading spinner
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadStaff(true);
    }, 30000);

    return () => {
      clearInterval(timer);
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto calculate suggested credentials
  useEffect(() => {
    if (!editingStaff) {
      if (nic.trim()) {
        const auto = generateAutoCredentials(nic, whatsapp, mobile);
        if (!customUsername) {
          setCustomUsername(auto.username);
        }
        if (!customPassword) {
          setCustomPassword(auto.password);
        }
      }
    }
  }, [nic, whatsapp, mobile, editingStaff]);

  const handleRoleChange = (newRole: StaffRole) => {
    setRole(newRole);
    // Requirement: Admin and Manager have full access to all classes in database
    if (newRole === 'admin' || newRole === 'manager' || newRole === 'super_admin') {
      setAssignedClasses(availableClasses);
    }
  };

  const handleOpenAddModal = () => {
    setEditingStaff(null);
    const initialRole = assignableRoles[0] || 'lecturer';
    setRole(initialRole);
    setFirstName('');
    setLastName('');
    setNic('');
    setWhatsapp('');
    setMobile('');
    setTitle('');
    setCustomUsername('');
    setCustomPassword('');
    // For admin or manager, grant all classes in database
    if (initialRole === 'admin' || initialRole === 'manager') {
      setAssignedClasses(availableClasses);
    } else {
      // Newly created lecturers start with no classes auto-assigned
      setAssignedClasses([]);
    }
    setAllowedSections(initialRole === 'lecturer' ? [] : ['registry', 'manual_student', 'payments', 'pending_payments', 'live_classes', 'resources', 'tutes', 'planner']);
    setDeletePin('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setRole(staff.role);
    setFirstName(staff.first_name);
    setLastName(staff.last_name);
    setNic(staff.nic);
    setWhatsapp(staff.whatsapp);
    setMobile(staff.mobile);
    setTitle(staff.title || '');
    setCustomUsername(staff.username);
    setCustomPassword('');
    // Admin and Manager have access to all database classes
    if (staff.role === 'admin' || staff.role === 'manager' || staff.role === 'super_admin') {
      setAssignedClasses(availableClasses.length > 0 ? availableClasses : (staff.assigned_classes || []));
    } else {
      // Filter strictly by available classes in database
      const filtered = (staff.assigned_classes || []).filter(c => availableClasses.includes(c));
      setAssignedClasses(filtered);
    }
    setAllowedSections(staff.allowed_sections || []);
    setDeletePin(staff.delete_pin || '');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Quick Class Assignment Modal State
  const [assignClassTarget, setAssignClassTarget] = useState<StaffMember | null>(null);
  const [selectedClassesToAdd, setSelectedClassesToAdd] = useState<string[]>([]);
  const [assigningClasses, setAssigningClasses] = useState(false);

  const handleQuickAddClasses = async () => {
    if (!assignClassTarget || selectedClassesToAdd.length === 0) return;
    setAssigningClasses(true);
    try {
      const currentAssigned = Array.isArray(assignClassTarget.assigned_classes) ? assignClassTarget.assigned_classes : [];
      const updated = Array.from(new Set([...currentAssigned, ...selectedClassesToAdd]));
      
      await updateStaffMember(assignClassTarget.id, { assigned_classes: updated });
      setStaffList(prev => prev.map(s => s.id === assignClassTarget.id ? { ...s, assigned_classes: updated } : s));
      setAssignClassTarget(null);
      setSelectedClassesToAdd([]);
    } catch (err: any) {
      alert('පන්ති ඇඩ් කිරීමේදී දෝෂයක්: ' + (err.message || ''));
    } finally {
      setAssigningClasses(false);
    }
  };

  const handleQuickRemoveClass = async (staff: StaffMember, classToRemove: string) => {
    if (!confirm(`[${classToRemove}] පන්තිය මෙම සාමාජිකයාගෙන් ඉවත් කිරීමට ඔබට සහතිකද?`)) return;
    try {
      const currentAssigned = Array.isArray(staff.assigned_classes) ? staff.assigned_classes : [];
      const updated = currentAssigned.filter(c => c !== classToRemove);
      
      await updateStaffMember(staff.id, { assigned_classes: updated });
      setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, assigned_classes: updated } : s));
    } catch (err: any) {
      alert('පන්තිය ඉවත් කිරීමේදී දෝෂයක්: ' + (err.message || ''));
    }
  };

  const handleSubmitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('කරුණාකර මුල් නම සහ වාසගම සම්පූර්ණ කරන්න.');
      return;
    }
    if (!nic.trim()) {
      setFormError('කරුණාකර NIC අංකය ඇතුළත් කරන්න.');
      return;
    }

    const autoCreds = generateAutoCredentials(nic, whatsapp, mobile);
    const finalUsername = (customUsername.trim() || nic.trim() || `STF${Date.now().toString().slice(-4)}`);
    const finalPassword = customPassword.trim() || (editingStaff ? '' : autoCreds.password || nic.trim().slice(-4) || '1234');

    if (!editingStaff && !finalPassword) {
      setFormError('කරුණාකර මුරපදයක් (Password) ඇතුළත් කරන්න.');
      return;
    }

    // Admins and Managers have access to all classes in database
    const finalClasses = (role === 'admin' || role === 'manager' || role === 'super_admin')
      ? (availableClasses.length > 0 ? availableClasses : assignedClasses)
      : (assignedClasses.length > 0 ? assignedClasses : availableClasses);

    setSubmitting(true);
    try {
      if (editingStaff) {
        const updates: Partial<StaffMember> = {
          role,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nic: nic.trim(),
          whatsapp: whatsapp.trim(),
          mobile: mobile.trim(),
          title: title.trim(),
          assigned_classes: finalClasses,
          allowed_sections: allowedSections,
          delete_pin: deletePin.trim()
        };
        const res = await updateStaffMember(editingStaff.id, updates, finalPassword || undefined);
        if (!res.success) {
          setFormError(res.error || 'යාවත්කාලීන කිරීම අසාර්ථක විය.');
          setSubmitting(false);
          return;
        }
        await loadStaff();
        setIsAddModalOpen(false);
      } else {
        const newStaff: Omit<StaffMember, 'id' | 'created_at' | 'updated_at'> = {
          role,
          username: finalUsername,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nic: nic.trim(),
          whatsapp: whatsapp.trim(),
          mobile: mobile.trim(),
          title: title.trim(),
          assigned_classes: finalClasses,
          allowed_sections: role === 'lecturer' ? [] : allowedSections,
          delete_pin: deletePin.trim()
        };
        const res = await createStaffMember(newStaff, finalPassword);
        if (!res.success || !res.data) {
          setFormError(res.error || 'ගිණුම සෑදීම අසාර්ථක විය.');
          setSubmitting(false);
          return;
        }
        await loadStaff();
        setIsAddModalOpen(false);
        setCreatedStaffSuccess({
          staff: res.data,
          plainPassword: finalPassword
        });
      }
    } catch (err: any) {
      setFormError(err.message || 'දෝෂයක් ඇති විය.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBlock = async (staff: StaffMember) => {
    const updatedStatus = !staff.is_blocked;
    await toggleBlockStaffMember(staff.id, updatedStatus);
    await loadStaff();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteStaffMember(deleteTarget.id);
      await loadStaff();
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSendWhatsApp = (staff: StaffMember, plainPass: string = '••••••••') => {
    const phone = staff.whatsapp || staff.mobile;
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? `94${cleanPhone.slice(1)}` : cleanPhone;
    const msg = generateWhatsAppCredentialsMessage(staff, plainPass);
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // User Requirement:
  // Admin and Manager must NOT see Super Admin details!
  // Only display staff members whose roles are BELOW them.
  const visibleStaffList = staffList.filter(s => allowedVisibleRoles.includes(s.role));

  const filteredStaff = visibleStaffList.filter(s => {
    if (filterRole !== 'all' && s.role !== filterRole) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = `${s.first_name} ${s.last_name}`.toLowerCase().includes(q);
      const matchUser = s.username.toLowerCase().includes(q);
      const matchNic = (s.nic || '').toLowerCase().includes(q);
      const matchPhone = (s.whatsapp || s.mobile || '').includes(q);
      return matchName || matchUser || matchNic || matchPhone;
    }
    return true;
  });

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner & Stats Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-purple-900/30">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                කාර්යමණ්ඩලය (Staff & Roles Management)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {actorRole === 'manager' 
                  ? 'දේශකවරුන් (Lecturers) පද්ධතියට එක් කිරීම, පන්ති පැවරීම සහ ගිණුම් පාලනය'
                  : actorRole === 'admin'
                  ? 'Manager සහ Lecturer වරුන් පද්ධතියට එක් කිරීම, අවසර ලබා දීම සහ ගිණුම් පාලනය'
                  : 'Admin, Manager සහ Lecturer වරුන් පද්ධතියට එක් කිරීම, අවසර ලබා දීම සහ ගිණුම් පාලනය'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadStaff(false)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {assignableRoles.length > 0 && (
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-900/30 flex items-center gap-2 transition cursor-pointer"
              >
                <UserPlus size={16} /> {actorRole === 'manager' ? 'නව Lecturer කෙනෙක් එක් කරන්න' : 'නව සාමාජිකයෙක් එක් කරන්න'}
              </button>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Role Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-950/60 rounded-2xl border border-slate-800/80">
            {viewableTabs.map((r) => {
              const labelMap: Record<string, string> = {
                all: 'සියල්ල (All)',
                super_admin: 'Super Admin',
                admin: 'Admin',
                manager: 'Manager',
                lecturer: 'Lecturer'
              };
              const count = r === 'all' ? visibleStaffList.length : visibleStaffList.filter(s => s.role === r).length;
              return (
                <button
                  key={r}
                  onClick={() => setFilterRole(r)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                    filterRole === r 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <span>{labelMap[r]}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filterRole === r ? 'bg-white/20' : 'bg-slate-800'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              type="text"
              placeholder="නම, NIC, Username හෝ දුරකථන අංකය..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Staff Table / Cards List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
          <span>ලියාපදිංචි කාර්යමණ්ඩල ලැයිස්තුව</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
            {filteredStaff.length} Members
          </span>
        </h3>

        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="animate-spin text-blue-500" size={28} />
            <p className="text-xs">කාර්යමණ්ඩල තොරතුරු ලබාගනිමින් පවතී...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            කිසිදු කාර්යමණ්ඩල සාමාජිකයෙකු හමු නොවීය.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3">සාමාජිකයා (Member)</th>
                  <th className="py-3 px-3">තනතුර (Role)</th>
                  <th className="py-3 px-3">පිවිසුම් තොරතුරු (Credentials)</th>
                  <th className="py-3 px-3">සම්බන්ධතා (Contact)</th>
                  <th className="py-3 px-3">පන්ති / අවසර (Classes & Sections)</th>
                  <th className="py-3 px-3">තත්ත්වය (Status)</th>
                  <th className="py-3 px-3 text-right">ක්‍රියාමාර්ග (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStaff.map((staff) => {
                  const roleMeta = ROLE_CONFIG[staff.role] || ROLE_CONFIG.admin;
                  const RoleIcon = roleMeta.icon;
                  const initials = `${(staff.first_name || '')[0] || ''}${(staff.last_name || '')[0] || ''}`.toUpperCase();

                  return (
                    <tr key={staff.id} className="hover:bg-slate-850/40 transition">
                      
                      {/* Member Info */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-sm">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs flex items-center gap-1.5">
                              {staff.first_name} {staff.last_name}
                              {staff.role === 'super_admin' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 font-bold border border-purple-500/30">
                                  Owner
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {staff.title || `NIC: ${staff.nic || 'N/A'}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${roleMeta.badgeClass}`}>
                          <RoleIcon size={12} />
                          {roleMeta.label.split(' ')[0]}
                        </span>
                      </td>

                      {/* Credentials */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1 font-mono">
                          <div className="flex items-center gap-1.5 text-slate-200">
                            <span className="text-slate-500 text-[10px]">User:</span>
                            <span className="font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              {staff.username}
                            </span>
                            <button
                              onClick={() => handleCopy(staff.username, `user_${staff.id}`)}
                              className="text-slate-400 hover:text-white transition"
                              title="Copy Username"
                            >
                              {copiedKey === `user_${staff.id}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            </button>
                          </div>
                          {staff.delete_pin && (
                            <div className="flex items-center gap-1.5 text-[10px] text-rose-400">
                              <span className="text-slate-500">Delete PIN:</span>
                              <span>{staff.delete_pin}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-0.5 text-slate-300">
                          {staff.whatsapp && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <MessageSquare size={11} className="text-emerald-400" />
                              <span>{staff.whatsapp}</span>
                            </div>
                          )}
                          {staff.mobile && staff.mobile !== staff.whatsapp && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                              <PhoneCall size={11} className="text-blue-400" />
                              <span>{staff.mobile}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Assigned Classes */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          <div className="flex flex-wrap items-center gap-1">
                            {(() => {
                              const validAssigned = (staff.assigned_classes || []).filter(c => 
                                availableClasses.includes(c)
                              );

                              if (validAssigned.length === 0) {
                                return (
                                  <span className="text-[10px] text-slate-500 italic">
                                    {staff.role === 'lecturer' ? 'පන්ති පවරා නොමැත (No classes)' : 'සියලුම පන්ති (All Classes)'}
                                  </span>
                                );
                              }

                              return validAssigned.map(c => (
                                <span 
                                  key={c} 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-950/70 border border-indigo-500/30 text-[10px] text-indigo-200 font-bold"
                                >
                                  <span>{c}</span>
                                  {canModifyStaff(staff) && (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickRemoveClass(staff, c)}
                                      className="text-indigo-400 hover:text-rose-400 transition cursor-pointer ml-0.5 font-bold"
                                      title="පන්තිය ඉවත් කරන්න"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ));
                            })()}
                          </div>

                          {/* + Add Class Button */}
                          {canModifyStaff(staff) && (
                            <button
                              type="button"
                              onClick={() => {
                                setAssignClassTarget(staff);
                                setSelectedClassesToAdd([]);
                              }}
                              className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[10px] font-bold transition cursor-pointer"
                              title="අලුතින් පන්ති පවරන්න"
                            >
                              <Plus size={10} />
                              <span>පන්ති එක් කරන්න (Add)</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        {staff.is_blocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                            <Ban size={10} /> Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                            <CheckCircle size={10} /> Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Send WhatsApp message */}
                          <button
                            onClick={() => handleSendWhatsApp(staff)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                            title="Send Login details via WhatsApp"
                          >
                            <MessageSquare size={13} />
                          </button>

                          {canModifyStaff(staff) ? (
                            <>
                              {/* Toggle Block (Super admin can't be blocked) */}
                              {staff.role !== 'super_admin' && (
                                <button
                                  onClick={() => handleToggleBlock(staff)}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                    staff.is_blocked 
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                                  }`}
                                  title={staff.is_blocked ? 'Unblock Account' : 'Block Account'}
                                >
                                  <Ban size={13} />
                                </button>
                              )}

                              {/* Edit */}
                              <button
                                onClick={() => handleOpenEditModal(staff)}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition cursor-pointer"
                                title="Edit Staff Member"
                              >
                                <Edit size={13} />
                              </button>

                              {/* Delete (Super admin can't be deleted) */}
                              {staff.role !== 'super_admin' && (
                                <button
                                  onClick={() => setDeleteTarget(staff)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                                  title="Delete Account"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-900 border border-slate-800" title="මෙම තනතුර වෙනස් කිරීමට ඔබට අවසර නොමැත">
                              🔒 ආරක්ෂිතයි
                            </span>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {editingStaff ? 'කාර්යමණ්ඩල ගිණුම සංස්කරණය (Edit Staff)' : 'නව කාර්යමණ්ඩල ගිණුමක් සෑදීම (Add New Staff)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Admin, Manager හෝ Lecturer ගිණුම් විස්තර සහ පිවිසුම් අවසර
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitStaff} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {formError}
                </div>
              )}

              {/* 1. Select Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">කාර්යමණ්ඩල තනතුර (Staff Role) *</label>
                <div className={`grid gap-2 ${assignableRoles.length === 1 ? 'grid-cols-1' : assignableRoles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {(editingStaff ? Array.from(new Set([editingStaff.role, ...assignableRoles])) : assignableRoles).map((r) => {
                    const meta = ROLE_CONFIG[r];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => handleRoleChange(r)}
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                          role === r 
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500 shadow-md shadow-blue-900/30' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon size={18} />
                        <span>{meta.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">මුල් නම (First Name) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kasun"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">වාසගම (Last Name) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Perera"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 3. NIC & Official Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">ජාතික හැඳුනුම්පත් අංකය (NIC) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 199512345678"
                    value={nic}
                    onChange={(e) => setNic(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">නිල නාමය / තනතුර (Title)</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Physics Lecturer"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 4. Contact Numbers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">WhatsApp අංකය *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0771234567"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">ජංගම දුරකථන අංකය (Mobile)</label>
                  <input
                    type="text"
                    placeholder="e.g. 0719876543"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 5. Credentials Box */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <KeyRound size={14} /> පිවිසුම් තොරතුරු (Login Credentials)
                  </span>
                  {!editingStaff && (
                    <button
                      type="button"
                      onClick={() => {
                        const auto = generateAutoCredentials(nic, whatsapp, mobile);
                        setCustomUsername(auto.username);
                        setCustomPassword(auto.password);
                      }}
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Sparkles size={11} /> ස්වයංක්‍රීයව සකසන්න
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400">Username</label>
                    <input
                      type="text"
                      placeholder="Username (හිස්ව තැබුවහොත් NIC යොදාගනී)"
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      disabled={Boolean(editingStaff)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400">
                      {editingStaff ? 'නව Password (හිස්ව තැබුවහොත් වෙනස් නොවේ)' : 'Password (Auto/Custom)'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={editingStaff ? 'Leave blank to keep current' : 'e.g. Auto හෝ කැමති මුරපදයක්'}
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Delete PIN - User Requirement: Do NOT hardcode DANUSHKA18223 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-rose-400">
                      ක්‍රියාමාර්ග මකාදැමීමේ PIN අංකය (Delete Confirmation PIN)
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">Custom PIN</span>
                  </div>
                  <input
                    type="text"
                    value={deletePin}
                    onChange={(e) => setDeletePin(e.target.value)}
                    placeholder="අදාළ පුද්ගලයාට කැමති PIN අංකයක් මෙහි ඇතුළත් කරන්න (e.g. 1234)"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-rose-300 font-mono focus:outline-none focus:border-rose-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    මෙම සාමාජිකයාට දත්ත මකාදැමීම තහවුරු කිරීමට අවශ්‍ය ආරක්ෂිත PIN අංකය මෙහි ඇතුළත් කරන්න (සුපර් ඇඩ්මින්ගේ PIN අංකය යෙදීමෙන් වළකින්න).
                  </p>
                </div>
              </div>

              {/* 6. Assigned Classes (Dynamic from class_types_config table) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    අදාළ පන්ති වර්ග (Assigned Classes - class_types_config)
                  </label>
                  <span className="text-[11px] text-blue-400 font-medium">
                    (දත්ත ගබඩාවේ සක්‍රීය පන්ති: {availableClasses.length})
                  </span>
                </div>

                {(role === 'admin' || role === 'manager') ? (
                  <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                      <Sparkles size={14} className="text-amber-400" />
                      <span>{ROLE_CONFIG[role].label.split(' ')[0]} සඳහා සම්පූර්ණ පන්ති ප්‍රවේශය (Full Class Access):</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      ඇඩ්මින් සහ මැනේජර් යන දෙදෙනාට ඩේටාබේස් එක සතු සම්පූර්ණ පන්ති වර්ග සඳහා ස්වයංක්‍රීයව පූර්ණ ප්‍රවේශය (Full Access) හිමිවේ.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {availableClasses.map(cls => (
                        <span key={cls} className="px-2.5 py-1 rounded-lg bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[11px] font-semibold flex items-center gap-1">
                          ✓ {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableClasses.map(cls => (
                      <button
                        type="button"
                        key={cls}
                        onClick={() => {
                          setAssignedClasses(prev => 
                            prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                          assignedClasses.includes(cls)
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                        }`}
                      >
                        {assignedClasses.includes(cls) ? '✓ ' : '+ '}{cls}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 7. Allowed Sections (Super admin controls admin/manager viewable sections) */}
              {role !== 'lecturer' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      පද්ධති ප්‍රවේශ අවසර (Section Permissions - Cockpit Panels)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAllowedSections(AVAILABLE_SECTIONS.map(s => s.id))}
                        className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                      >
                        සියල්ල තෝරන්න (Select All)
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setAllowedSections([])}
                        className="text-[11px] text-slate-400 hover:text-slate-300 underline cursor-pointer"
                      >
                        ඉවත් කරන්න (Clear)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                    {AVAILABLE_SECTIONS.map(sec => (
                      <label key={sec.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white p-1 rounded hover:bg-slate-900/60 transition">
                        <input
                          type="checkbox"
                          checked={allowedSections.includes(sec.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedSections(prev => [...prev, sec.id]);
                            } else {
                              setAllowedSections(prev => prev.filter(s => s !== sec.id));
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span>{sec.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    තෝරාගත් අංශ පමණක් මෙම පරිශීලකයාගේ ඇඩ්මින් පැනලයේ (Dashboard) දිස්වේ. අනෙකුත් අංශ සඟවනු ලැබේ.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-purple-950/30 border border-purple-500/20 rounded-xl space-y-1">
                  <div className="text-xs font-bold text-purple-300">
                    👨‍🏫 Lecturer ඉගැන්වීම් ප්‍රවේශය (Teaching Dashboard):
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    ලෙක්චර කෙනෙකුට Cockpit Panels ප්‍රවේශ අවසර ලබා නොදේ. ඔහුට සජීවී Zoom පන්ති පැවැත්වීම, විභාග සහ අදාළ පාඩම්/ටියුට්ස් පද්ධතියට එක්කිරීමේ පහසුකම් පමණක් ස්වයංක්‍රීයව ක්‍රියාත්මක වේ.
                  </p>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
                >
                  අවලංගු කරන්න
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-900/30 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{editingStaff ? 'යාවත්කාලීන කරන්න' : 'ගිණුම සාදන්න (Create Staff)'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Created Staff Success & WhatsApp Sender Modal */}
      {createdStaffSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-emerald-400 font-extrabold text-base">
              <CheckCircle size={24} />
              <span>කාර්යමණ්ඩල ගිණුම සාර්ථකව සාදන ලදී!</span>
            </div>
            
            <p className="text-xs text-slate-300">
              නව සාමාජිකයාගේ පිවිසුම් තොරතුරු සුරැකී ඇත. කරුණාකර පහත තොරතුරු ඔහු වෙත WhatsApp මඟින් යොමු කරන්න:
            </p>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>නම:</span>
                <span className="text-white font-bold">{createdStaffSuccess.staff.first_name} {createdStaffSuccess.staff.last_name}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Username:</span>
                <span className="text-emerald-400 font-bold">{createdStaffSuccess.staff.username}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Password:</span>
                <span className="text-amber-400 font-bold">{createdStaffSuccess.plainPassword}</span>
              </div>
              {createdStaffSuccess.staff.delete_pin && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Delete PIN:</span>
                  <span className="text-rose-400 font-bold">{createdStaffSuccess.staff.delete_pin}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={() => handleSendWhatsApp(createdStaffSuccess.staff, createdStaffSuccess.plainPassword)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                <MessageSquare size={15} /> WhatsApp මඟින් යවන්න
              </button>
              <button
                onClick={() => {
                  const msg = generateWhatsAppCredentialsMessage(createdStaffSuccess.staff, createdStaffSuccess.plainPassword);
                  handleCopy(msg, 'success_msg');
                }}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
              >
                {copiedKey === 'success_msg' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>Copy Message</span>
              </button>
            </div>

            <button
              onClick={() => setCreatedStaffSuccess(null)}
              className="w-full py-2 bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs rounded-xl transition"
            >
              වසන්න (Close)
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Confirmation Modal for Deleting Staff Member */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />
            
            <div className="flex justify-between items-center p-5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    කාර්යමණ්ඩල ගිණුම මකාදැමීම
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Delete Staff Member Account
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setDeleteTarget(null)} 
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-xs font-bold text-white">
                  {deleteTarget.first_name} {deleteTarget.last_name} ({deleteTarget.username})
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>තනතුර: <strong className="text-blue-300">{ROLE_CONFIG[deleteTarget.role]?.label || deleteTarget.role}</strong></span>
                  <span>NIC: <strong className="text-slate-300">{deleteTarget.nic}</strong></span>
                </div>
              </div>

              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl leading-relaxed">
                ⚠️ මෙම සාමාජිකයාගේ ගිණුම පද්ධතියෙන් සම්පූර්ණයෙන්ම ඉවත් කරනු ලැබේ. මෙම ක්‍රියාව ආපසු හැරවිය නොහැක.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  අවලංගු කරන්න (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>ඔව්, මකාදමන්න (Delete)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Classes Modal for Staff/Lecturer */}
      {assignClassTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>පන්ති පැවරීම (Assign Classes)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {assignClassTarget.first_name} {assignClassTarget.last_name} ({assignClassTarget.role})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignClassTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 block">
                ඩේටාබේස් එකේ ඇති පන්ති වලින් එක් කිරීමට පන්ති තෝරන්න:
              </label>

              {(() => {
                const currentAssigned = assignClassTarget.assigned_classes || [];
                const unassignedAvailable = availableClasses.filter(c => !currentAssigned.includes(c));

                if (unassignedAvailable.length === 0) {
                  return (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs text-center">
                      ඩේටාබේස් එකේ ඇති සියලුම පන්ති දැනටමත් මෙම සාමාජිකයාට පවරා ඇත.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto p-2 bg-slate-950 rounded-2xl border border-slate-800">
                    {unassignedAvailable.map(cName => {
                      const isSelected = selectedClassesToAdd.includes(cName);
                      return (
                        <button
                          type="button"
                          key={cName}
                          onClick={() => {
                            setSelectedClassesToAdd(prev => 
                              isSelected ? prev.filter(c => c !== cName) : [...prev, cName]
                            );
                          }}
                          className={`p-3 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600/20 text-blue-200 border-blue-500 shadow-sm'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span>{cName}</span>
                          <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                            isSelected ? 'bg-blue-500 text-white' : 'border border-slate-700'
                          }`}>
                            {isSelected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAssignClassTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                අවලංගු කරන්න (Cancel)
              </button>
              <button
                type="button"
                onClick={handleQuickAddClasses}
                disabled={assigningClasses || selectedClassesToAdd.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {assigningClasses ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Add ({selectedClassesToAdd.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
