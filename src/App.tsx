import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Unlock, 
  User, 
  Settings, 
  Calendar, 
  Copy, 
  Bell, 
  FileText, 
  Award,
  Globe,
  Plus,
  X,
  Menu,
  Send,
  Video,
  Sun,
  Moon,
  LogOut,
  Phone,
  MessageCircle,
  Eye,
  EyeOff,
  Lock,
  LayoutDashboard
} from 'lucide-react';
import SecurityPasswordModal from './components/SecurityPasswordModal';
import { Student, StaffMember } from './types';
import { 
  DEFAULT_STUDENTS, 
  DEFAULT_SITE_CONFIG,
  SRI_LANKA_DISTRICTS 
} from './data';
import { supabase } from './supabaseClient';

import { useSupabaseSync, toCamelCase } from './hooks/useSupabaseSync';
import AdminRegistryTable from './components/AdminRegistryTable';
import ClassTypesFeesManager from './components/ClassTypesFeesManager';
import AdminPaymentManager from './components/AdminPaymentManager';
import AdminPaymentHistory from './components/AdminPaymentHistory';
import QrGenerator from './components/QrGenerator';
import AdminCalendarPlanner from './components/AdminCalendarPlanner';
import AdminSiteConfig from './components/AdminSiteConfig';
import AdminManualStudentRegistration from './components/AdminManualStudentRegistration';
import { useSupabaseConfig } from './hooks/useSupabaseConfig';
import AdminAttentionLogs from './components/AdminAttentionLogs';
import StudentPaymentInvoice from './components/StudentPaymentInvoice';
import ResetPassword from './components/ResetPassword';
import StudentDashboard from './components/StudentDashboard';
import AdminRecordingsManager from './components/AdminRecordingsManager';
import AdminGlobalConfig from "./components/AdminGlobalConfig";
import AdminLiveControls from './components/AdminLiveControls';
import AdminPendingPayments from './components/AdminPendingPayments';
import AdminBankAccountsManager from './components/AdminBankAccountsManager';
import AdminStaffManager from './components/AdminStaffManager';
import AdminManualStudentRegister from './components/AdminManualStudentRegister';
import AdminOverview from './components/AdminOverview';
import LecturerDashboard from './components/LecturerDashboard';
import BannerLandingPage from './components/BannerLandingPage';
import FinanceDepartment from './components/FinanceDepartment';
import AdminDeviceSecurityManager from './components/AdminDeviceSecurityManager';
import { registerDeviceLogin } from './deviceSecurityService';
import { fetchAllPendingPayments } from './pendingPaymentsService';
import { subscribeRealtimeEvents } from './realtimeSync';
import { translations, Language } from './translations';
import { authenticateStaff } from './staffService';
import {
  getActiveStaffSession,
  saveActiveStaffSession,
  clearStaffSession,
  touchStaffSession,
  getActiveStudentSession,
  saveActiveStudentSession,
  clearStudentSession,
  touchStudentSession,
  getSavedAdminTab,
  setSavedAdminTab,
  getSavedStudentTab,
  setSavedStudentTab
} from './sessionService';


export default function App() {
  // Check for banner landing page URL: /b/:slug, ?b=:slug, ?banner=:slug, ?p=:slug
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const bannerSlug = searchParams?.get('b') || searchParams?.get('banner') || searchParams?.get('p') || 
    (window.location.pathname.startsWith('/b/') ? window.location.pathname.replace(/^\/b\//, '') : null);

  if (bannerSlug) {
    return (
      <BannerLandingPage
        slug={bannerSlug}
        onNavigateHome={() => {
          window.location.href = window.location.origin;
        }}
      />
    );
  }

  // බ්‍රව්සර් එකේ ලින්ක් එක '/reset-password' නම් කෙලින්ම මේ පිටුව පෙන්වන්න
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  // Helper for current month payment check
  const isCurrentMonthPaid = (activeMonths?: string[]) => {
    if (!activeMonths || activeMonths.length === 0) return false;
    const now = new Date();
    // Assuming month string format is like "2026-05" or year "2026"
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearStr = `${now.getFullYear()}`;
    return activeMonths.includes(currentMonthStr) || activeMonths.includes(currentYearStr);
  };
  // Language State (Sinhala & English)
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('physics_hub_lang') as Language) || 'si';
  });

  const toggleLanguage = () => {
    setLang(prev => {
      const next = prev === 'si' ? 'en' : 'si';
      localStorage.setItem('physics_hub_lang', next);
      return next;
    });
  };

  // Day / Night Theme State (Default to Day Mode 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('physics_hub_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light';
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const t = translations[lang];

  // State variables
  const [siteConfigRaw, setSiteConfigRaw] = useSupabaseConfig();
  const siteConfig = siteConfigRaw || DEFAULT_SITE_CONFIG;

  const globalClasses: { id: string, name: string, fee: number }[] = (() => {
    try {
      if (siteConfig?.classRatesText) {
        const parsed = JSON.parse(siteConfig.classRatesText);
        if (parsed.classes && Array.isArray(parsed.classes)) return parsed.classes;
      }
    } catch (e) {}
    return [
      { id: '1', name: '2027 Theory', fee: 3500 },
      { id: '2', name: '2027 Revision', fee: 3500 },
      { id: '3', name: '2027 Paper Class', fee: 3500 },
      { id: '4', name: '2028 Theory', fee: 3500 },
      { id: '5', name: '2028 Revision', fee: 3500 },
      { id: '6', name: '2028 Paper Class', fee: 3500 }
    ];
  })();
  const globalClassNames = (globalClasses || []).map(c => c?.name || '').filter(Boolean);
  const setSiteConfig = setSiteConfigRaw;
  
  // Replace localStorage students with Supabase Realtime sync
  const [students, setStudents] = useSupabaseSync<any>('students', []);
  const [dbClassTypes] = useSupabaseSync<any>('class_types_config', []);
  const activeDbClasses = (dbClassTypes || []).filter((c: any) => c.is_active !== false);
  const effectiveClasses: { id: string, name: string, fee: number }[] = activeDbClasses.length > 0
    ? activeDbClasses.map((c: any) => ({ id: c.id || c.class_type, name: c.class_type, fee: c.monthly_fee || 3500 }))
    : globalClasses;

  const [calendarEvents, setCalendarEvents] = useSupabaseSync<any>('calendar_events', []);
  const [announcements, setAnnouncements] = useSupabaseSync<any>('announcements', []);
  const [resourceLinks, setResourceLinks] = useSupabaseSync<any>('class_resources', []);
  const [scheduledLives, setScheduledLives] = useSupabaseSync<any>('scheduled_lives', []);

  const [currentView, setCurrentView] = useState<'home' | 'free-notes' | 'register' | 'login' | 'dashboard' | 'admin' | 'live' | 'tutes' | 'recordings'>(() => {
    // 1. First check if staff (Super Admin, Admin, Manager, Lecturer) has active 6-hour session
    const staff = getActiveStaffSession();
    if (staff) {
      return 'admin';
    }
    // 2. Then check if student has active 6-hour session
    const student = getActiveStudentSession();
    if (student) {
      return 'dashboard';
    }
    // 3. Check for direct register query param
    if (searchParams?.get('register') === 'true') {
      return 'register';
    }
    return 'home';
  });

  const [currentStudent, setCurrentStudent] = useState<Student | null>(() => {
    return getActiveStudentSession();
  });

  // Active 6-Hour Session Heartbeat: while user is active on the website, continuously extend 6-hour offline countdown
  useEffect(() => {
    const handleActiveHeartbeat = () => {
      touchStaffSession();
      touchStudentSession();
    };

    // Immediate touch on boot
    handleActiveHeartbeat();

    // Heartbeat every 30 seconds
    const intervalId = setInterval(handleActiveHeartbeat, 30000);

    // Also touch on any user activity (clicks, keys, touches, focus)
    const onUserActivity = () => {
      handleActiveHeartbeat();
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange', 'focus'];
    activityEvents.forEach(evt => window.addEventListener(evt, onUserActivity, { passive: true }));

    return () => {
      clearInterval(intervalId);
      activityEvents.forEach(evt => window.removeEventListener(evt, onUserActivity));
    };
  }, []);
  
  // Fallback high-resolution physics photos (never disappear on page switch or re-render)
  const DEFAULT_HERO_PHOTOS = [
    "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507668077129-56e32842fceb?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop"
  ];

  // Slide index
  const [activeSlide, setActiveSlide] = useState(0);
  const slideImages = [
    {
      url: (siteConfig.heroImage1 && siteConfig.heroImage1.trim() !== '') ? siteConfig.heroImage1 : DEFAULT_HERO_PHOTOS[0],
      title: siteConfig.slide1Title || "Interactive Live Feed",
      desc: siteConfig.slide1Desc || "Weekly real-time streams paired with live quiz features."
    },
    {
      url: (siteConfig.heroImage2 && siteConfig.heroImage2.trim() !== '') ? siteConfig.heroImage2 : DEFAULT_HERO_PHOTOS[1],
      title: siteConfig.slide2Title || "Particle & Quantum Models",
      desc: siteConfig.slide2Desc || "Deconstructing core theories using high-end simulated models."
    },
    {
      url: (siteConfig.heroImage3 && siteConfig.heroImage3.trim() !== '') ? siteConfig.heroImage3 : DEFAULT_HERO_PHOTOS[2],
      title: siteConfig.slide3Title || "Practical Laboratory Sessions",
      desc: siteConfig.slide3Desc || "Comprehensive guides on practical apparatus and physics methodologies."
    },
    {
      url: (siteConfig.heroImage4 && siteConfig.heroImage4.trim() !== '') ? siteConfig.heroImage4 : DEFAULT_HERO_PHOTOS[3],
      title: siteConfig.slide4Title || "Astrophysics & Solar Systems",
      desc: siteConfig.slide4Desc || "Special seminars investigating gravitation, fields, and mechanics."
    }
  ];

  // Global Slide Timer (5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(p => (p + 1) % slideImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slideImages.length]);

  // Ensure current password matches to handle cross-device password refresh without falsely logging out on reload
  useEffect(() => {
    if (currentStudent && students && students.length > 0) {
      const found = students.find(s => s.username?.toLowerCase() === currentStudent.username?.toLowerCase());
      if (found) {
        if (found.password && currentStudent.password && String(found.password).trim() !== String(currentStudent.password).trim()) {
          // Password explicitly changed in database, log out
          handleStudentLogout();
        } else {
          // Silently sync latest database details (activeMonths, payment status, etc.)
          setCurrentStudent(prev => prev ? ({ ...prev, ...found }) : found);
          saveActiveStudentSession(found);
        }
      }
    }
  }, [students]);

  // Dashboard inner tabs with persistence
  const [dashboardTab, setDashboardTab] = useState<'live' | 'recordings' | 'tutes' | 'exams' | 'calendar' | 'history' | null>(() => (getSavedStudentTab() as any) || 'live');
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const studentAlerts = currentStudent ? announcements.filter((alert: any) => 
    alert.type === 'public' || (alert.type === 'private' && alert.target_user === currentStudent.username)
  ) : [];
  
// 1. useState එක හැමවිටම Component එකේ ඉහළින්ම (useEffect එකෙන් පිටත) තැබිය යුතුය
const [availableClasses, setAvailableClasses] = useState<any[]>([]);

// පිටුව ලෝඩ් වෙද්දීම class_types_config එකෙන් පන්ති වර්ග කියවා ගැනීම
useEffect(() => {
  const fetchAvailableClasses = async () => {
    const { data, error } = await supabase
      .from('class_types_config')
      .select('class_type') // අපිට අවශ්‍ය වන්නේ පන්තියේ නම පමණි
      .order('class_type', { ascending: true }); // අකාරාදී පිළිවෙලට සකස් කිරීම

    if (!error && data) {
      // 2. මෙතනදී කලින් හැදූ state එක Update කිරීම පමණක් සිදු කරයි
      setAvailableClasses(data);
    } else {
      console.error('Error fetching class configs:', error);
    }
  };

  fetchAvailableClasses();
}, []);

// Modal / Message box states
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Profile modal click details
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Admin access states with 6-Hour Persistent Session
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(() => getActiveStaffSession());
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return Boolean(getActiveStaffSession());
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'registry' | 'manual_student' | 'staff' | 'planner' | 'broadcast' | 'site_configs' | 'payments' | 'pending_payments' | 'bank_accounts' | 'history' | 'finance' | 'resources' | 'tutes' | 'live_classes' | 'resets' | 'qr_generator' | 'device_security'>(() => {
    return (getSavedAdminTab() as any) || 'overview';
  });
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);

  // Restore staff session on reload and ensure isAdminLoggedIn stays true
  useEffect(() => {
    const savedStaff = getActiveStaffSession();
    if (savedStaff) {
      setCurrentStaff(savedStaff);
      setIsAdminLoggedIn(true);
    }
  }, []);

  // Super Admin, Admin, and Manager dashboards and admin panels strictly remain in Night Mode
  const isNightOnlyAdmin = (currentView === 'admin' || isAdminLoggedIn) && Boolean(currentStaff) && currentStaff?.role !== 'lecturer';

  useEffect(() => {
    if (isNightOnlyAdmin || theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('physics_hub_theme', theme);
  }, [theme, isNightOnlyAdmin, currentView]);

  // Permission helper: Controls which sections are accessible based on staff role and allowed_sections
  const isTabAllowed = (tabId: string): boolean => {
    if (!currentStaff) return true;
    // Overview is the unified homepage for Super Admin, Admin, Manager, and Lecturer
    if (tabId === 'overview') return true;

    if (currentStaff.role === 'super_admin') return true;

    // Device security management accessible to Super Admin, Admin, and Manager
    if (tabId === 'device_security') {
      if (currentStaff.role === 'admin' || currentStaff.role === 'manager') return true;
      return !!currentStaff.allowed_sections?.includes('device_security');
    }

    // Staff management is accessible to Super Admin, Admin, and Manager (restricted by rank hierarchy inside component)
    if (tabId === 'staff') {
      if (currentStaff.role === 'admin' || currentStaff.role === 'manager') return true;
      return !!currentStaff.allowed_sections?.includes('staff');
    }

    // For Admin, Manager, Lecturer: check granted sections
    if (currentStaff.allowed_sections && Array.isArray(currentStaff.allowed_sections)) {
      return currentStaff.allowed_sections.includes(tabId);
    }

    // Default safe tabs based on role if allowed_sections is not defined
    if (currentStaff.role === 'admin' || currentStaff.role === 'manager') {
      return ['overview', 'registry', 'manual_student', 'staff', 'payments', 'pending_payments', 'live_classes', 'resources', 'tutes', 'planner', 'device_security'].includes(tabId);
    }
    if (currentStaff.role === 'lecturer') {
      return ['overview', 'live_classes', 'resources', 'tutes', 'planner'].includes(tabId);
    }
    return false;
  };

  // Auto-switch active tab if currently active tab is not in allowed tabs for this staff member
  useEffect(() => {
    if (isAdminLoggedIn && currentStaff) {
      if (!isTabAllowed(activeAdminTab)) {
        const candidateTabs: Array<typeof activeAdminTab> = [
          'overview', 'registry', 'manual_student', 'staff', 'resets', 'payments', 
          'pending_payments', 'bank_accounts', 'history', 'qr_generator', 
          'site_configs', 'planner', 'live_classes', 'resources', 'tutes', 'broadcast', 'device_security'
        ];
        const firstPermitted = candidateTabs.find(t => isTabAllowed(t));
        if (firstPermitted) {
          setActiveAdminTab(firstPermitted);
        }
      }
    }
  }, [currentStaff, activeAdminTab, isAdminLoggedIn]);

  const refreshPendingPaymentsCount = async () => {
    try {
      const list = await fetchAllPendingPayments();
      const pendingOnly = list.filter(p => p.status === 'pending');
      setPendingPaymentsCount(pendingOnly.length);
    } catch (e) {}
  };

  useEffect(() => {
    refreshPendingPaymentsCount();
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshPendingPaymentsCount();
    }, 1500);

    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'pending_payment_submitted' || type === 'pending_payment_deleted' || type === 'payment_approved' || type === 'payment_rejected') {
        refreshPendingPaymentsCount();
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsub();
    };
  }, []);

  // Manual Profile Code generator inside cockpit
  const [manFirst, setManFirst] = useState('');
  const [manLast, setManLast] = useState('');
  const [manNIC, setManNIC] = useState('');
  const [manDistrict, setManDistrict] = useState('Colombo');
  const [manClassTypes, setManClassTypes] = useState<string[]>([]);
  const [manFreeToggle, setManFreeToggle] = useState(false);
  const [manFreeMonthsString, setManFreeMonthsString] = useState('');
  const [manWhatsApp, setManWhatsApp] = useState('');
  const [manMobile, setManMobile] = useState('');
  const [generatedJSON, setGeneratedJSON] = useState('');

  // Broadcast Alert fields
  const [notType, setNotType] = useState<'public' | 'private'>('public');
  const [notTargetUser, setNotTargetUser] = useState('');
  const [notTitle, setNotTitle] = useState('');
  const [notContent, setNotContent] = useState('');

  // Payment manager states
  const [payStudentUser, setPayStudentUser] = useState('');
  const [payMonth, setPayMonth] = useState('');
  const [payAmount, setPayAmount] = useState('2500');
  const [payStatus, setPayStatus] = useState<'paid' | 'pending'>('paid');

  // Live Manager states
  const [liveTitle, setLiveTitle] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [liveClassType, setLiveClassType] = useState('2026 Theory');
  const [liveScheduleDate, setLiveScheduleDate] = useState('');

  // Resource Manager states
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resClassType, setResClassType] = useState('2026 Theory');
  const [resTargetMonth, setResTargetMonth] = useState('');
  const [resType, setResType] = useState<'tute' | 'recording'>('tute');

  // Filter states for view panels
  const [filterClassType, setFilterClassType] = useState('All');
  const [filterMonth, setFilterMonth] = useState('');

  // Free resources lists (Simulation of materials)
  const [freeMaterials, setFreeMaterials] = useState([
    { id: '1', title: 'Measurement Systems Notes 2027/28', linkUrl: 'https://taphysics.blogspot.com/p/free-notes.html' },
    { id: '2', title: 'Vector Geometry Practical Exercises', linkUrl: 'https://taphysics.blogspot.com/p/free-notes.html' },
    { id: '3', title: 'Calculus Foundations for Physicists', linkUrl: 'https://taphysics.blogspot.com/p/free-notes.html' }
  ]);
  const [newFreeTitle, setNewFreeTitle] = useState('');

  // Login inputs
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [loginShake, setLoginShake] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);

  // Security Unlock for Website Appearance & Configurations
  const [isSiteConfigUnlocked, setIsSiteConfigUnlocked] = useState(false);
  const [showSiteConfigPasswordModal, setShowSiteConfigPasswordModal] = useState(false);

  // Forgot password username
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNIC, setForgotNIC] = useState('');
  const [showForgotBox, setShowForgotBox] = useState(false);

  // Registration states
  const [regFirst, setRegFirst] = useState('');
  const [regLast, setRegLast] = useState('');
  const [regNIC, setRegNIC] = useState('');
  const [regDistrict, setRegDistrict] = useState('');
  const [regClassTypes, setRegClassTypes] = useState<string[]>(() => {
    const urlClass = searchParams?.get('class');
    return urlClass ? [decodeURIComponent(urlClass)] : [];
  });
  const [regWhatsApp, setRegWhatsApp] = useState('');
  const [regMobile, setRegMobile] = useState('');
  
    // Registration Validation Highlight States
  const [invalidGroups, setInvalidGroups] = useState<{ [key: string]: boolean }>({});
  const [isSubmitButtonDisabled, setIsSubmitButtonDisabled] = useState(false);

  // Refs for smooth scroll
  const regFormRef = useRef<HTMLFormElement>(null);
  const grpFirstRef = useRef<HTMLDivElement>(null);
  const grpLastRef = useRef<HTMLDivElement>(null);
  const grpNIPRef = useRef<HTMLDivElement>(null);
  const grpDistRef = useRef<HTMLDivElement>(null);
  const grpClassRef = useRef<HTMLDivElement>(null);
  const grpWhatsAppRef = useRef<HTMLDivElement>(null);
  const grpMobileRef = useRef<HTMLDivElement>(null);
  const adminContentRef = useRef<HTMLDivElement>(null);

  const handleAdminTabChange = (tab: typeof activeAdminTab) => {
    if (tab === 'site_configs' && !isSiteConfigUnlocked) {
      setShowSiteConfigPasswordModal(true);
      return;
    }
    setActiveAdminTab(tab);
    setSavedAdminTab(tab);
    setTimeout(() => {
      adminContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Welcome back active state
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);

  useEffect(() => {
    if (currentStudent) {
      const closed = localStorage.getItem(`has_closed_welcome_${currentStudent.username}`);
      if (!closed && currentStudent.isPaid) {
        setShowWelcomeBanner(true);
      } else {
        setShowWelcomeBanner(false);
      }
    }
  }, [currentStudent]);

  // Sync loaded student once students table is fetched
  useEffect(() => {
    if (!currentStudent) {
      const activeStudent = getActiveStudentSession();
      if (activeStudent) {
        setCurrentStudent(activeStudent);
        if (currentView === 'home' || currentView === 'login') {
          setCurrentView('dashboard');
        }
      }
    }
    setIsLoading(false);
  }, [students]);

  // Check login states on bootup (Zero hardcoded credentials, 100% database verification)
  const handleStudentLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    setLoginShake(false);

    const trimmedUser = loginUser.trim();
    const cleanPass = loginPass.trim();

    if (!trimmedUser || !cleanPass) return;

    try {
      // 1. Staff Authentication Check against Database (Super Admin, Admin, Manager, Lecturer)
      const staffAuth = await authenticateStaff(trimmedUser, cleanPass);
      if (staffAuth.success && staffAuth.staff) {
        setCurrentStaff(staffAuth.staff);
        saveActiveStaffSession(staffAuth.staff);
        setIsAdminLoggedIn(true);
        setCurrentView('admin');
        setActiveAdminTab('overview');
        setSavedAdminTab('overview');
        setLoginAttempts(0);
        setLoginUser('');
        setLoginPass('');

        // If lecturer, default to Day Mode (light); for admins/managers keep dark
        if (staffAuth.staff.role === 'lecturer') {
          setTheme('light');
          localStorage.setItem('physics_hub_theme', 'light');
        } else {
          setTheme('dark');
          localStorage.setItem('physics_hub_theme', 'dark');
        }
        return;
      }

      // 2. Student Authentication Check against Database
      let found = students.find(s => 
        s.username.toLowerCase() === trimmedUser.toLowerCase() && 
        (s as any).password === cleanPass
      );

      // If not in memory list, query Supabase directly for realtime check
      if (!found) {
        const { data: dbStudent } = await supabase
          .from('students')
          .select('*')
          .ilike('username', trimmedUser)
          .maybeSingle();

        if (dbStudent && (dbStudent.password === cleanPass || dbStudent.nic === cleanPass)) {
          found = toCamelCase(dbStudent);
        }
      }

      if (found) {
        setLoginAttempts(0);

        // Single Device Login & Disciplinary Security Verification
        const loginCheck = await registerDeviceLogin(found);
        if (loginCheck.isConcurrent) {
          found.device_violations_count = loginCheck.strikeCount;
          found.device_block_until = loginCheck.blockedUntil;
        }

        setCurrentStudent(found);
        
        // Ensure student dashboard automatically boots up in Day Mode ('light')
        setTheme('light');
        localStorage.setItem('physics_hub_theme', 'light');

        // Save student session with full object and 6-hour offline validity
        saveActiveStudentSession(found);

        setLoginUser('');
        setLoginPass('');
        setCurrentView('dashboard');
      } else {
        setLoginError(true);
        setLoginShake(true);
        setLoginAttempts(prev => prev + 1);
        setTimeout(() => setLoginShake(false), 1000);
      }
    } catch (err) {
      console.error('Login process error:', err);
      setLoginError(true);
      setLoginShake(true);
      setTimeout(() => setLoginShake(false), 1000);
    }
  };

  const handleStudentLogout = () => {
    setCurrentStudent(null);
    clearStudentSession();
    setCurrentView('home');
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim() || !forgotNIC.trim()) {
      alert("කරුණාකර ඔබගේ පරිශීලක නාමය (Username) සහ NIC අංකය ඇතුළත් කරන්න.");
      return;
    }
    
    // Find the student locally first to verify
    const std = students.find(s => s.username === forgotUsername.trim() && s.nic === forgotNIC.trim());
    if (!std) {
      alert("ඔබ ලබා දුන් Username හෝ NIC අංකය වැරදිය. නැවත පරීක්ෂා කර බලන්න.");
      return;
    }

    // Set the password_reset_requested flag in Supabase
    await supabase.from('students').update({ password_reset_requested: true }).eq('id', std.id);

    // Construct WhatsApp Message
    const text = `හෙලෝ සර්, මගේ Tharaka Physics Hub ගිණුමේ මුරපදය අමතක වී ඇත. කරුණාකර එය යථා තත්ත්වයට පත් කර දෙන්න (Password Reset). Username: ${forgotUsername.trim()} NIC: ${forgotNIC.trim()}`;
    const encText = encodeURIComponent(text);
    const waUrl = `https://wa.me/94719152128?text=${encText}`;
    window.open(waUrl, '_blank');
    setShowForgotBox(false);
    setForgotUsername('');
    setForgotNIC('');
  };

  // NIC එක පරීක්ෂා කිරීමේ අලුත් කේතය
  const checkNICExists = async (nicValue: string) => {
    if (!nicValue || !nicValue.trim()) return false;
    
    try {
      const { data } = await supabase
        .from('students')
        .select('nic')
        .eq('nic', nicValue.trim().toUpperCase())
        .maybeSingle();

      if (data) {
        alert("මෙම NIC අංකයෙන් දැනටමත් ගිණුමක් ලියාපදිංචි කර ඇත!");
        return true; 
      }
    } catch (err) {
      console.warn("NIC check warning:", err);
    }
    return false; 
  };

  // Student direct registration submission from student app view
  // පන්ති ලැයිස්තුව තබා ගැනීමට අලුතින් state එකක්
  const [dbClasses, setDbClasses] = useState<string[]>([]);

  // Component එක ලෝඩ් වෙද්දිම Supabase එකෙන් පන්ති ටික ගෙන්වා ගැනීම
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { data, error } = await supabase
          .from('class_types_config')
          .select('class_type')
          .eq('is_active', true);

        if (error) throw error;
        
        if (data) {
          // දත්ත ආවා නම් ඒවා array එකකට දාලා state එකට සෙට් කරනවා
          setDbClasses(data.map(item => item.class_type));
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, []); 

  const handleStudentRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsSubmitButtonDisabled(true);

    const cleanFirst = regFirst.trim();
    const cleanLast = regLast.trim();
    const cleanNIC = regNIC.trim().toUpperCase();
    const cleanDistrict = regDistrict.trim();
    const cleanWhatsApp = regWhatsApp.trim();
    const cleanMobile = regMobile.trim();
    const cleanClasses = [...regClassTypes];

    // 1. මුලින්ම NIC එක Database එකේ තියෙනවද බලනවා
    const isDuplicate = await checkNICExists(cleanNIC); 
    
    if (isDuplicate) {
      setIsSubmitButtonDisabled(false);
      return; 
    }
    
    // Validate fields strictly
    const errors: { [key: string]: boolean } = {};
    let firstInvalidRef: React.RefObject<HTMLDivElement | null> | null = null;

    if (!cleanFirst) {
      errors.first = true;
      if (!firstInvalidRef) firstInvalidRef = grpFirstRef;
    }
    if (!cleanLast) {
      errors.last = true;
      if (!firstInvalidRef) firstInvalidRef = grpLastRef;
    }
    if (!cleanNIC || cleanNIC.length < 9) {
      errors.nic = true;
      if (!firstInvalidRef) firstInvalidRef = grpNIPRef;
    }
    if (!cleanDistrict) {
      errors.district = true;
      if (!firstInvalidRef) firstInvalidRef = grpDistRef;
    }
    if (cleanClasses.length === 0) {
      errors.classes = true;
      if (!firstInvalidRef) firstInvalidRef = grpClassRef;
    }
    
    // Validation: Exactly 10 digits starting with 0
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(cleanWhatsApp)) {
      errors.whatsapp = true;
      if (!firstInvalidRef) firstInvalidRef = grpWhatsAppRef;
    }
    if (!phoneRegex.test(cleanMobile)) {
      errors.mobile = true;
      if (!firstInvalidRef) firstInvalidRef = grpMobileRef;
    }
    
    if (Object.keys(errors).length > 0) {
      setInvalidGroups(errors);
      setIsSubmitButtonDisabled(false); // Enable the button again if there are errors

      // Smooth scroll to the first invalid element
      if (firstInvalidRef && firstInvalidRef.current) {
        firstInvalidRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Format secure message for Tutor/Admin on WhatsApp status
    const formattedMessage = `*New Student Registration - TA Physics Online Hub*\n\n` +
      `• First Name: *${cleanFirst}*\n` +
      `• Last Name: *${cleanLast}*\n` +
      `• NIC Number: *${cleanNIC}*\n` +
      `• District: *${cleanDistrict}*\n` +
      `• Class Type(s): *${cleanClasses.join(', ')}*\n` +
      `• WhatsApp Number: *${cleanWhatsApp}*\n` +
      `• Mobile Number: *${cleanMobile}*\n\n` +
      `Please verify my details and provide my login username and password. Thank you!`;

    const encoded = encodeURIComponent(formattedMessage);
    const whatsappLink = `https://wa.me/94719152128?text=${encoded}`;
    
    // Save to Supabase (සුරක්ෂිත හා සහතික ලියාපදිංචි කිරීමේ ක්‍රමවේදය)
    const studentData = {
      username: `PENDING_${Date.now()}`,
      password: '',
      name: `${cleanFirst} ${cleanLast}`,
      first_name: cleanFirst,
      last_name: cleanLast,
      nic: cleanNIC,
      district: cleanDistrict,
      whatsapp: cleanWhatsApp,
      mobile: cleanMobile,
      is_paid: false,
      is_approved: false,
      plan_type: 'paid',
      active_months: [], 
      joined_at: new Date().toISOString()
    };

    // 1. ප්‍රථමයෙන් class_types සහිතව සෘජුව insert කිරීමට උත්සාහ කරයි
    let { error } = await supabase.from('students').insert([{
      ...studentData,
      class_types: cleanClasses
    }]);

    // 2. Database trigger එකක් හේතුවෙන් දෝෂයක් ආවහොත් (class_name vs class_type ගැටලුව) safe 2-step insert ක්‍රමය භාවිත කරයි
    if (error) {
      console.warn('Direct insert failed, attempting safe 2-step insert:', error.message);

      const step1 = await supabase.from('students').insert([{
        ...studentData,
        class_types: []
      }]).select();

      if (step1.error) {
        console.error('Error saving to DB (Step 1):', step1.error);
        alert('දත්ත ගබඩා කිරීමේ දෝෂයකි: ' + (step1.error.message || 'කරුණාකර නැවත උත්සහ කරන්න.'));
        setIsSubmitButtonDisabled(false);
        return; 
      }

      // Step 2: ලියාපදිංචි වූ සිසුවාට අදාළ පන්ති වර්ග update කිරීම
      if (step1.data && step1.data[0]?.id && cleanClasses.length > 0) {
        const step2 = await supabase.from('students').update({
          class_types: cleanClasses
        }).eq('id', step1.data[0].id);

        if (step2.error) {
          console.warn('Warning updating class_types:', step2.error.message);
        }
      }
    }

    // Reset fields
    setRegFirst('');
    setRegLast('');
    setRegNIC('');
    setRegDistrict('');
    setRegClassTypes([]);
    setRegWhatsApp('');
    setRegMobile('');
    setInvalidGroups({});
    setIsSubmitButtonDisabled(false);

    // Prompt user with modal containing instructions
    setModalTitle("ලියාපදිංචිය සාර්ථකයි!");
    setModalContent(
      <div className="space-y-4">
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
          ඔබගේ ලියාපදිංචි විස්තර සාර්ථකව පද්ධතියට (Database) ඇතුළත් විය! Admin වෙත යැවීමට පහත බොත්තම ඔබන්න. ඔබව පෞද්ගලිකව WhatsApp ඔස්සේ සම්බන්ධ කර Username සහ Password ලබා දෙනු ඇත.
        </div>
        <div className="flex gap-3 pt-2">
          <button 
            onClick={() => {
              window.open(whatsappLink, '_blank');
              setIsModalOpen(false);
              setCurrentView('login');
            }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Send size={18} /> Send Data via WhatsApp
          </button>
          <button 
            onClick={() => {
              setIsModalOpen(false);
              setCurrentView('login');
            }}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-2.5 px-4 rounded-lg transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
    setIsModalOpen(true);
  };

// Safe input changer to clear invalid styling
const handleInputChange = (field: string, val: string) => {
  if (invalidGroups[field]) {
    setInvalidGroups(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
  setIsSubmitButtonDisabled(false);
};

// Checkbox එකක් ක්ලික් කරද්දී Array එක අප්ඩේට් වන කොටස
const handleClassCheckboxChange = (course: string, checked: boolean) => {
  if (invalidGroups.classes) {
    setInvalidGroups(prev => {
      const next = { ...prev };
      delete next.classes;
      return next;
    });
  }
  setIsSubmitButtonDisabled(false);

  if (checked) {
    setRegClassTypes(prev => [...prev, course]);
  } else {
    setRegClassTypes(prev => prev.filter(c => c !== course));
  }
};

  // Admin Cockpit authentication (Verified against database hash)
  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = adminPasswordInput.trim();
    // 1. Check superadmin first
    const auth = await authenticateStaff('superadmin', cleanPass);
    if (auth.success && auth.staff) {
      setCurrentStaff(auth.staff);
      saveActiveStaffSession(auth.staff);
      setIsAdminLoggedIn(true);
      setActiveAdminTab('overview');
      setAdminError('');
      return;
    }

    // 2. Also check if any registered staff member (Admin/Manager) has this password/pin
    try {
      const { data: staffList } = await supabase.from('staff_members').select('*').eq('is_blocked', false);
      if (staffList && staffList.length > 0) {
        for (const stf of staffList) {
          const stfAuth = await authenticateStaff(stf.username, cleanPass);
          if (stfAuth.success && stfAuth.staff) {
            setCurrentStaff(stfAuth.staff);
            saveActiveStaffSession(stfAuth.staff);
            setIsAdminLoggedIn(true);
            setActiveAdminTab('overview');
            setAdminError('');
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Staff auth lookup note:', err);
    }

    setAdminError('වැරදි ඇඩ්මින් මුරපදයක්! කරුණාකර නිවැරදි මුරපදය ඇතුළත් කරන්න.');
    setIsAdminLoggedIn(false);
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payStudentUser || !payMonth || !payAmount) {
      alert("කරුණාකර සියලුම දත්ත සම්පූර්ණ කරන්න.");
      return;
    }

    setStudents(prev => {
      const copy = [...prev];
      const targetIdx = copy.findIndex(s => s.username === payStudentUser);
      if (targetIdx === -1) {
        alert("එම username එක සහිත ශිෂ්‍යයෙක් හමු නොවිණි.");
        return prev;
      }
      
      const st = { ...copy[targetIdx] };
      const currentPayments = st.payments || [];
      const newPayment = {
        id: `pay-${Date.now()}`,
        month: payMonth,
        amount: payAmount,
        status: payStatus,
        paidDate: new Date().toISOString()
      };

      // update isPaid flag automatically if they made a paid payment for the current month
      const currentMonthStr = new Date().toISOString().slice(0, 7);
      if (payMonth.includes(currentMonthStr) && payStatus === 'paid') {
        st.isPaid = true;
      }

      st.payments = [newPayment, ...currentPayments];
      copy[targetIdx] = st;
      
      alert("ගෙවීම් තොරතුරු සාර්ථකව යාවත්කාලීන කරන ලදී.");
      return copy;
    });
    
    setPayMonth('');
    setPayAmount('2500');
  };

  const handleAddLive = async (e: React.FormEvent) => {
    e.preventDefault();
    const isYouTube = liveUrl.includes('youtube.com') || liveUrl.includes('youtu.be');
    let embedUrl = liveUrl;
    
    if (isYouTube) {
      const match = liveUrl.match(/[?&]v=([^&]+)/) || liveUrl.match(/youtu\.be\/([^?]+)/);
      if (match && match[1]) {
        embedUrl = `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
      }
    }

    // Split datetime-local value (e.g. "2026-05-28T14:30")
    let [datePart, timePart] = liveScheduleDate.split('T');
    
    const newLive = {
      title: liveTitle,
      link: embedUrl,
      platform: liveUrl.includes('zoom') ? 'zoom' : 'youtube',
      target_classes: [liveClassType],
      date: datePart,
      time: timePart,
      visibility: 'paid'
    };
    const { error } = await supabase.from('scheduled_lives').insert([newLive]);
    if (error) {
      console.error(error);
      alert('Error saving live class.');
    } else {
      alert('සජීවී පන්තිය සුරැකිණි.');
      setLiveTitle('');
      setLiveUrl('');
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRes = {
      title: resTitle,
      link: resUrl.includes('http') ? resUrl : `https://${resUrl}`,
      target_classes: [resClassType],
      target_month: resTargetMonth,
      date_added: new Date().toISOString(),
      type: resType
    };
    const { error } = await supabase.from('class_resources').insert([newRes]);
    if (error) {
      console.error(error);
      alert('Error updating resource.');
    } else {
      alert(`${resType === 'tute' ? 'නිබන්ධනය' : 'පටිගත කිරීම'} සාර්ථකව යාවත්කාලීන කරන ලදී.`);
      setResTitle('');
      setResUrl('');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminPasswordInput('');
    setCurrentStaff(null);
    clearStaffSession();
    setCurrentView('home');
  };

  // Code generator form inside admin cockpit
  const handleAdminManualGenerate = async () => {
    if (!manFirst.trim() || !manLast.trim() || !manNIC.trim() || !manWhatsApp.trim() || manClassTypes.length === 0) {
      alert("සියලුම අත්‍යවශ්‍ය ක්ෂේත්‍ර පුරවන්න.");
      return;
    }

    const firstPrefix = manFirst.slice(0, 2).toUpperCase();
    const lastPrefix = manLast.slice(0, 2).toUpperCase();
    const nicSuffix = manNIC.slice(-2);
    const waSuffix = manWhatsApp.slice(-2);
    const finalUsername = `${firstPrefix}${lastPrefix}${nicSuffix}${waSuffix}`;

    const parsedFreeMonths = manFreeToggle ? manFreeMonthsString.split(',').map(s => s.trim()).filter(Boolean) : [];
    const initialMonths = parsedFreeMonths.length > 0 ? parsedFreeMonths : [new Date().toISOString().slice(0, 7)];

    const newStudent = {
      username: finalUsername,
      password: manNIC,
      name: `${manFirst} ${manLast}`,
      first_name: manFirst,
      last_name: manLast,
      nic: manNIC,
      class_types: manClassTypes,
      district: manDistrict,
      whatsapp: manWhatsApp,
      mobile: manMobile,
      is_paid: true,
      is_approved: true, // Manual generations are auto-approved
      activeMonths: initialMonths,
      plan_type: manFreeToggle ? 'free' : 'paid',
      joined_at: new Date().toISOString()
    };

    const { error } = await supabase.from('students').insert([newStudent]);

    if (error) {
      console.error(error);
      alert('දත්ත ගබඩා කිරීමේ දෝෂයකි.');
    } else {
      setGeneratedJSON(JSON.stringify(newStudent, null, 2));
      alert(`ක්‍රියාව සාර්ථකයි! ශිෂ්‍යයා නිර්මාණය විය.\n• Username: ${finalUsername}\n• Password: ${manNIC}`);
    }
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(generatedJSON);
    alert("ශිෂ්‍ය ගොනුවේ JSON කේතය සාර්ථකව පිටපත් කර ගන්නා ලදී.");
  };

  // Add Free Resource Notes simulated inside Admin view
  const handleAddFreeNotes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFreeTitle.trim()) return;
    setFreeMaterials(prev => [
      ...prev,
      { id: Date.now().toString(), title: newFreeTitle.trim(), linkUrl: 'https://taphysics.blogspot.com/p/free-notes.html' }
    ]);
    setNewFreeTitle('');
    alert("නොමිලේ ලබාදෙන ලිපිගොනුව එක් කරන ලදී.");
  };


  // Broadcast Alert notification creator
  const handleBroadcastAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notTitle.trim() || !notContent.trim()) {
      alert("මාතෘකාව සහ විස්තරය අනිවාර්ය වේ.");
      return;
    }

    const newAlert = {
      title: notTitle.trim(),
      content: notContent.trim(),
      date: new Date().toISOString().split('T')[0],
      type: notType,
      target_user: notType === 'private' ? notTargetUser.trim() : null
    };

    const { error } = await supabase.from('announcements').insert([newAlert]);
    if (error) {
      console.error(error);
      alert('Error broadcasting alert.');
    } else {
      setNotTitle('');
      setNotContent('');
      setNotTargetUser('');
      alert("නිවේදනය සාර්ථකව විකාශනය කෙරිණි!");
    }
  };

  // Interactive custom portals access checking
  const handlePortalClick = (target: 'live' | 'tutes' | 'recordings') => {
    if (!currentStudent) return;

    if (!currentStudent.isPaid) {
      setModalTitle("🔒 ප්‍රවේශය සීමා කර ඇත (Access Locked)");
      setModalContent(
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300">
            සජීවී පන්ති (Live), නිබන්ධන (Tutes/Papers) සහ පටිගත කිරීම් (Recordings) නැරඹීම සඳහා ඔබගේ ගෙවීම් වාර්තා තහවුරු විය යුතුය. ඔබ දැනටමත් ගෙවා ඇත්නම් හෝ ලියාපදිංචි වී ඇත්නම්, කරුණාකර ඔබගේ ගෙවීම් රිසිට්පත WhatsApp හරහා ගුරු මණ්ඩලයට යොමු කරන්න.
          </div>
          <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg">
            <h5 className="font-semibold text-white mb-1">WhatsApp Admin Support:</h5>
            <p className="text-sm text-slate-400">දුරකථන: 0719152128 (Tharaka Physics Admin Zone)</p>
          </div>
          <div className="flex gap-2">
            <a 
              href={`https://wa.me/94719152128?text=Hello%20Sir%2C%20I%20have%20payment%20slips%20to%20verify%20for%20physics%20username%3A%20${currentStudent.username}`}
              target="_blank"
              referrerPolicy="no-referrer"
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded-lg text-center transition block"
            >
              Send Slip to WhatsApp
            </a>
            <button 
              onClick={() => setIsModalOpen(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-4 rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      );
      setIsModalOpen(true);
      return;
    }

    // Paid redirects
    if (target === 'live') {
      setDashboardTab('live');
    } else if (target === 'tutes') {
      setDashboardTab('tutes');
    } else if (target === 'recordings') {
      setDashboardTab('recordings');
    }
  };

  // Profile Modal popup builder on click
  const openStudentProfileModal = () => {
    if (!currentStudent) return;
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  // General welcome modal closing persisting logic
  const closeWelcomeActiveBanner = () => {
    if (currentStudent) {
      localStorage.setItem(`has_closed_welcome_${currentStudent.username}`, 'true');
      setShowWelcomeBanner(false);
    }
  };

  const openPublicAlertsModal = () => {
    window.open('https://taphysics.blogspot.com/p/public-alert.html', '_blank');
  };
  if (window.location.pathname === '/invoice') {
    return <StudentPaymentInvoice />;
  }

  // Build high contrast, clean interactive calendar cells for May 2026
  const cellsOffset = 5; // Starts on Friday
  const cellsCount = 31;
  const daysHeaders = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200`}>
      
      {/* Dynamic Top Navigation Bar */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b px-4 py-2.5 md:px-8 flex justify-between items-center transition-all ${
        theme === 'dark' ? 'bg-slate-900/90 border-slate-800 text-white' : 'bg-white/90 border-slate-200 text-slate-900 shadow-sm'
      }`}>
        {/* Brand: Logo & Title */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => setCurrentView(currentStudent ? 'dashboard' : 'home')}
        >
          {siteConfig.logoUrl && siteConfig.logoUrl.trim() !== '' ? (
            <img src={siteConfig.logoUrl} alt="Logo" className="w-9 h-9 rounded-xl object-cover shadow-sm group-hover:scale-105 transition-transform" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-md font-display text-base group-hover:scale-105 transition-transform">
              Ω
            </div>
          )}
          <div>
            <h1 className="text-base md:text-lg font-bold font-sans tracking-tight leading-tight group-hover:text-blue-500 transition-colors">
              Smart Physics
            </h1>
            <p className="text-[10px] text-blue-500 font-sans tracking-wider font-bold uppercase">
              {lang === 'si' ? 'තාරක අමරසිංහ' : 'Tharaka Amarasinghe'}
            </p>
          </div>
        </div>

        {/* Navigation Elements (Dashboard & Cockpit removed, Language & Day/Night mode added) */}
        <nav className="hidden md:flex items-center gap-2">
          {!(currentStudent || isAdminLoggedIn) && (
            <button 
              onClick={() => setCurrentView('home')} 
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                currentView === 'home' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t.home}
            </button>
          )}

          {!currentStudent && !isAdminLoggedIn && (
            <>
              <button 
                onClick={() => setCurrentView('login')} 
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  currentView === 'login' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {t.login}
              </button>
              <button 
                onClick={() => setCurrentView('register')} 
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-1.5 rounded-full shadow-sm transition cursor-pointer"
              >
                {t.register}
              </button>
            </>
          )}

          {isAdminLoggedIn && (
            <button 
              onClick={() => setCurrentView('admin')} 
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                currentView === 'admin' 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t.adminPanel}
            </button>
          )}

          {/* Language Switcher Button (සිංහල / English) */}
          <button
            onClick={toggleLanguage}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
              theme === 'dark'
                ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
            title="භාෂාව මාරු කරන්න / Switch Language"
          >
            <Globe size={13} className="text-blue-500" />
            <span>{lang === 'si' ? 'English' : 'සිංහල'}</span>
          </button>

          {/* Day / Night Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
              theme === 'dark'
                ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
            title="Day / Night Theme Toggle"
          >
            {theme === 'dark' ? (
              <>
                <Sun size={13} className="text-amber-400" />
                <span>{lang === 'si' ? 'දහවල්' : 'Day'}</span>
              </>
            ) : (
              <>
                <Moon size={13} className="text-indigo-600" />
                <span>{lang === 'si' ? 'රාත්‍රී' : 'Night'}</span>
              </>
            )}
          </button>

          {/* Logout Button (For student or admin) */}
          {(currentStudent || isAdminLoggedIn) && (
            <button
              onClick={() => {
                if (currentStudent) handleStudentLogout();
                if (isAdminLoggedIn) handleAdminLogout();
              }}
              className="px-3 py-1.5 rounded-full text-xs text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition cursor-pointer flex items-center gap-1 font-bold ml-1"
            >
              <LogOut size={12} />
              <span>{t.logout}</span>
            </button>
          )}
        </nav>

        {/* Mobile menu trigger and fast controls */}
        <div className="md:hidden flex items-center gap-2">
          {/* Mobile Language Switcher */}
          <button
            onClick={toggleLanguage}
            className={`p-1.5 rounded-xl border text-xs font-bold ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}
            title="Language"
          >
            <Globe size={14} className="text-blue-500" />
          </button>

          {/* Mobile Theme Switcher */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-xl border text-xs font-bold ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-slate-100 border-slate-300 text-indigo-600'
            }`}
            title="Theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Mobile Logout if logged in */}
          {(currentStudent || isAdminLoggedIn) && (
            <button
              onClick={() => {
                if (currentStudent) handleStudentLogout();
                if (isAdminLoggedIn) handleAdminLogout();
              }}
              className="p-1.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/30 text-xs font-bold"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Sticky Bar for quick links (Cockpit & Dashboard removed) */}
      <div className={`md:hidden border-b py-2 px-4 flex justify-around text-xs ${
        theme === 'dark' ? 'bg-[#0F172A] border-slate-850 text-slate-400' : 'bg-white border-slate-200 text-slate-600 shadow-sm'
      }`}>
        {!(currentStudent || isAdminLoggedIn) && (
          <>
            <button onClick={() => setCurrentView('home')} className={currentView === 'home' ? 'text-blue-500 font-bold' : ''}>{t.home}</button>
            <button onClick={() => setCurrentView('login')} className={currentView === 'login' ? 'text-blue-500 font-bold' : ''}>{t.login}</button>
            <button onClick={() => setCurrentView('register')} className={currentView === 'register' ? 'text-blue-500 font-bold' : ''}>{t.register}</button>
          </>
        )}
        {isAdminLoggedIn && (
          <button onClick={() => setCurrentView('admin')} className={currentView === 'admin' ? 'text-amber-500 font-bold' : ''}>{t.adminPanel}</button>
        )}
      </div>

      {/* Main Container Views */}
      <main className={`flex-grow w-full flex flex-col justify-start ${currentView === 'dashboard' ? 'px-0 py-0' : 'max-w-7xl mx-auto px-4 md:px-8 py-6'}`}>
        
        {/* VIEW 1: HOME */}
        {currentView === 'home' && (
          <div className="space-y-8 animate-fade-in">
            
            {/* Split layout HERO SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left Column: Introductions & Sliding physics backgrounds (Bento Big Card) */}
              <div className="lg:col-span-8 relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 md:p-10 flex flex-col justify-between shadow-xl bg-white dark:bg-[#0F172A] min-h-[460px] group transition-colors">
                
                {/* Embedded automatic slide changer backdrop */}
                {slideImages.map((slide, sIdx) => (
                  <div 
                    key={sIdx}
                    style={{ backgroundImage: `url(${slide.url})` }}
                    className={`absolute inset-0 bg-cover bg-center transition-all duration-[1200ms] ${sIdx === activeSlide ? 'opacity-35 dark:opacity-25 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}
                  />
                ))}
                
                {/* Overlay ensuring fonts contrast beautifully in Day and Night */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/40 dark:from-slate-950/95 dark:via-slate-950/85 dark:to-transparent z-10" />

                {/* Content Elements */}
                <div className="relative z-20 space-y-6 max-w-2xl my-auto">
                  <div>
                    <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-blue-400 rounded-full text-xs font-black tracking-wider border border-blue-200 dark:border-blue-500/30 shadow-sm">
                      {siteConfig.homeWelcomeBadge || "Welcome to Tharaka Physics Online Space"}
                    </span>
                  </div>
                  
                  <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.15] font-display tracking-tight drop-shadow-sm">
                    {siteConfig.heroTitle}
                  </h2>
                  
                  <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base leading-relaxed font-semibold">
                    {siteConfig.heroSubtitle}
                  </p>

                  <div className="flex flex-wrap gap-3.5 pt-2">
                    <button 
                      onClick={() => setCurrentView('register')}
                      className="bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-blue-900/30 transition-all duration-150 cursor-pointer"
                    >
                      {lang === 'si' ? 'නව සිසු ලියාපදිංචිය (Register)' : 'New Student Registration'}
                    </button>
                    <button 
                      onClick={() => setCurrentView('login')}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/85 hover:scale-[1.02] active:scale-[0.98] text-slate-900 dark:text-slate-100 font-bold border border-slate-300 dark:border-slate-700 px-6 py-3 rounded-2xl transition-all duration-150 shadow-sm cursor-pointer"
                    >
                      {lang === 'si' ? 'සිසු පිවිසුම (Login)' : 'Student Login'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Professional Teacher Branding (Bento Accent Card) */}
              <div className="lg:col-span-4 rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-900 border border-blue-400/20 p-8 flex flex-col justify-between text-center relative shadow-2xl overflow-hidden group">
                {/* Abstract Shape Background */}
                <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/15 transition-all" />
                
                <div className="absolute top-4 right-4 text-[10px] tracking-widest font-mono uppercase bg-white/10 text-blue-200 border border-white/20 px-2 py-0.5 rounded">
                  {lang === 'si' ? 'ප්‍රධාන දේශක' : 'Director Core'}
                </div>

                {/* Professional Looking Mock Vector/Graphic with rotate effect */}
                <div className="my-6">
                  <div className="relative w-40 h-40 mx-auto bg-white p-1.5 rounded-2xl shadow-2xl rotate-3 transform group-hover:rotate-0 group-hover:scale-105 transition-all duration-300">
                    <div className="w-full h-full rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center relative">
                      {siteConfig.directorImage && siteConfig.directorImage.trim() !== '' ? (
                         <img src={siteConfig.directorImage} className="w-full h-full object-cover relative z-10" alt="Director Core" />
                      ) : (
                         <>
                           <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-sky-400/30 mix-blend-multiply" />
                           <User size={64} className="text-blue-900 relative z-10" />
                         </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 z-10">
                  <h3 className="text-2xl font-bold text-white tracking-tight">
                    {siteConfig.directorName || (lang === 'si' ? 'තාරක අමරසිංහ' : 'Tharaka Amarasinghe')}
                  </h3>
                  <p className="text-xs text-blue-200 font-mono tracking-widest uppercase font-semibold opacity-90">
                    {siteConfig.directorTitle || (lang === 'si' ? "B.Sc (Hon's) පේරාදෙණිය විශ්වවිද්‍යාලය | භෞතික විද්‍යා දේශක" : "B.Sc (Hon's) University of Peradeniya | Physics Teacher")}
                  </p>
                </div>

                <div className="bg-slate-950/40 border border-blue-400/20 rounded-2xl p-4 mt-6 text-left relative z-10">
                  <span className="absolute -top-3 left-4 bg-[#142340] border border-blue-400/20 p-0.5 px-2 font-mono text-[9px] text-blue-300 font-semibold uppercase tracking-wider rounded">
                    {lang === 'si' ? 'ගුරු උපදෙස්' : 'Advice & Quote'}
                  </span>
                  <p className="text-blue-100 text-sm italic font-sans leading-relaxed py-1">
                    "{siteConfig.directorQuote || (lang === 'si' ? 'භෞතික විද්‍යාව යනු කටපාඩම් කිරීමක් නොව, විශ්වයේ රහස්‍ය ස්වභාවය අවබෝධ කරගැනීමේ සුන්දර ගමනකි.' : 'Physics is not mere memorization; it is a fascinating journey of understanding how the universe works.')}"
                  </p>
                </div>

                <div className="pt-6 border-t border-blue-400/20 text-[11px] text-blue-200 justify-center flex items-center gap-1 z-10 opacity-75">
                  <Award size={12} className="text-white" /> {lang === 'si' ? 'වෘත්තීය භෞතික විද්‍යා අධ්‍යයන ඒකක' : 'Professional physics learning modules'}
                </div>
              </div>
            </div>

            {/* Feature Cards Section grid (Bento Grid Style) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 space-y-3 group hover:border-blue-500/50 transition-all shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/25 transition-all">
                  <Globe size={22} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'si' ? 'නොමිලේ සම්පත් (Free Resources)' : 'Free Resources'}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                  {siteConfig.feat1Desc || (lang === 'si' ? "නොමිලේ ලබාදෙන සම්මන්ත්‍රණ, වීඩියෝ දර්ශන, ක්‍රියාකාරී ඇලර්ට් සහ අනුමාන ප්‍රශ්න පත්‍ර ඕනෑම අයෙකුට පහසුවෙන් ලබා ගත හැක." : "Free seminar sessions, video walkthroughs, active broadcast alerts and model papers accessible to any student.")}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 space-y-3 group hover:border-blue-500/50 transition-all shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/25 transition-all">
                  <Unlock size={22} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'si' ? 'ගෙවීම් කළ සිසු සම්පත් (Paid Portal Resources)' : 'Paid Portal Resources'}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                  {siteConfig.feat2Desc || (lang === 'si' ? "සක්‍රීය සිසුන්ට අදාළ මාසයේ සජීවී දේශන සබැඳි, සවිස්තරාත්මක නිබන්ධන පත්‍රිකා සහ සියලුම පටිගත කළ පාඩම් ලිපිගොනු ඇතුළත් වේ." : "Active enrolled students access live stream classes, comprehensive tutorial papers, and complete recorded video vaults.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: FREE NOTES */}
        {currentView === 'free-notes' && (
          <div className="space-y-6 animate-fade-in">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2 font-display">
                <BookOpen className="text-blue-400" size={24} /> Free Resources Hub
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                ලියාපදිංචි වී නොමැති සැමට හා ලියාපදිංචි වූ සියලු දෙනාටම බාගත හැකි පොදු නිබන්ධන හා විභාග ප්‍රශ්න පත්‍ර.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Materials PDF Column */}
              <div className="lg:col-span-6 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 space-y-4 shadow-lg">
                <h3 className="text-lg font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-3 font-display">
                  <FileText className="text-sky-400" size={18} /> 📚 Free Physics Syllabus Notes
                </h3>
                
                <div className="divide-y divide-slate-800/80">
                  {resourceLinks.filter(r => r.target_classes?.includes("Free Notes / Public")).map((mat: any) => (
                    <div key={mat.id} className="py-3.5 flex justify-between items-center gap-4 transition hover:bg-slate-800/30 px-2 rounded-xl">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-slate-100">{mat.title}</p>
                        <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest font-semibold flex items-center gap-1">FORMAT: {mat.type.toUpperCase()} • FREE ACCESS</p>
                      </div>
                      <a 
                        href={mat.link}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        className="bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white px-4 py-2 rounded-full text-xs font-semibold border border-slate-700 hover:border-blue-500 transition-all shrink-0 shadow-sm"
                      >
                        {mat.type === 'recording' ? 'Watch Video' : 'Download PDF'}
                      </a>
                    </div>
                  ))}
                  {resourceLinks.filter(r => r.target_classes?.includes("Free Notes / Public")).length === 0 && (
                     <div className="py-8 text-center text-slate-500 text-xs font-semibold">කිසිදු දත්තයක් හමුවී නොමැත. පසුව නැවත උත්සාහ කරන්න.</div>
                  )}
                </div>
              </div>

              {/* Public Notice Section */}
              <div className="lg:col-span-6 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 space-y-4 shadow-lg">
                <h3 className="text-lg font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-3 font-display">
                  <Bell className="text-blue-400" size={18} /> 📢 Public Notices &amp; Announcements
                </h3>

                <div className="space-y-4">
                  {announcements.filter(a => a.type === 'public').map((not) => (
                    <div key={not.id} className="bg-slate-900/60 border-l-4 border-blue-500 rounded-2xl p-4.5 space-y-1.5 border border-slate-800/80 shadow-md">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="font-bold text-sm text-white font-sans">{not.title}</h4>
                        <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/25 px-2.5 py-0.5 rounded-full shrink-0 font-bold">
                          {not.date}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">{not.content}</p>
                    </div>
                  ))}

                  {announcements.filter(a => a.type === 'public').length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6 font-sans">අලුත්ම නිවේදන කිසිවක් දැනට නොමැත.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: STUDENT LOGIN */}
        {currentView === 'login' && (
          <div className="max-w-md w-full mx-auto animate-fade-in my-auto py-8 font-sans">
            <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-white">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400" />
              
              {showForgotBox ? (
                 <div className="space-y-5 animate-slide-up">
                   <div className="text-center space-y-1.5">
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">මුරපදය යළි සැකසීම (Request Reset)</h3>
                     <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-2">
                       ඔබගේ Username එක සහ NIC අංකය පහතින් ටයිප් කර සෙන්ඩ් කළ පසු, මුරපදය අලුත් කර දෙන ලෙස ඉල්ලීමක් Smart Physics Support Admin ගේ WhatsApp ගිණුමට (0779630100) යොමු කිරීමට හැකි වනු ඇත.
                     </p>
                   </div>
                   
                   <form onSubmit={(e) => {
                     e.preventDefault();
                     if (!forgotUsername || !forgotNIC) return;
                     const text = `මට මගේ මුරපදය අමතක වී ඇත.\nUsername: ${forgotUsername}\nNIC: ${forgotNIC}\nකරුණාකර සහාය වන්න.`;
                     window.open(`https://wa.me/94779630100?text=${encodeURIComponent(text)}`, '_blank');
                   }} className="space-y-4 flex flex-col">
                     <div className="space-y-1.5">
                       <input 
                         type="text" 
                         required 
                         placeholder="Username (ID)"
                         value={forgotUsername}
                         onChange={(e) => setForgotUsername(e.target.value)}
                         className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                       />
                     </div>
                     <div className="space-y-1.5">
                       <input 
                         type="text" 
                         required 
                         placeholder="NIC අංකය"
                         value={forgotNIC}
                         onChange={(e) => setForgotNIC(e.target.value)}
                         className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                       />
                     </div>
                     <button 
                       type="submit" 
                       className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-md transition"
                     >
                       Send WhatsApp Request
                     </button>
                     <button 
                       type="button" 
                       onClick={() => setShowForgotBox(false)}
                       className="w-full text-amber-500 hover:text-amber-400 hover:underline px-4 py-2 rounded-xl text-xs font-semibold transition"
                     >
                       Back to Login
                     </button>
                   </form>
                 </div>
              ) : (
                <>
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
                      Login
                    </h3>
                  </div>

                  {loginAttempts >= 4 ? (
                    <div className="bg-slate-100 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 space-y-4 text-center animate-slide-up">
                      <h3 className="text-lg font-bold text-red-500 mb-2">ඔබට ලොගින් ඩීටේල්ස් අමතක උනාද?</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">දැන්ම ඇඩ්මින්ව සම්බන්ධ කරගන්න</p>
                      <a 
                        href="https://wa.me/94779630100?text=මට%20මගේ%20ලොගින්%20විස්තර%20අමතක%20වී%20ඇත.%20කරුණාකර%20සහාය%20වන්න." 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="block w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-all shadow-md mt-4 text-sm"
                      >
                        WhatsApp ඔස්සේ පණිවිඩයක් එවන්න
                      </a>
                      <button 
                        onClick={() => {
                          setLoginAttempts(0);
                          setLoginError(false);
                          setLoginShake(false);
                          setLoginPass('');
                        }}
                        className="mt-4 block w-full text-blue-500 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 py-2.5 rounded-xl text-sm font-semibold transition"
                      >
                        Back to Login
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleStudentLoginSubmit} className={`space-y-4 ${loginShake ? 'animate-shake' : ''}`}>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-700 dark:text-slate-300 font-bold font-sans">
                          {lang === 'si' ? 'Username (පරිශීලක නාමය)' : 'Username'}
                        </label>
                        <input 
                          type="text" 
                          required 
                          placeholder={lang === 'si' ? 'උදා: KAPE7882' : 'e.g. KAPE7882'}
                          value={loginUser}
                          onChange={(e) => {
                            setLoginUser(e.target.value);
                            if (loginError) {
                              setLoginError(false);
                              setLoginShake(false);
                            }
                          }}
                          className={`w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-950/60 border ${loginError ? 'border-red-500 text-red-600 dark:text-red-100' : 'border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white'} focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-700 dark:text-slate-300 font-bold font-sans">
                          {lang === 'si' ? 'Password (මුරපදය)' : 'Password'}
                        </label>
                        <div className="relative flex items-center">
                          <input 
                            type={showLoginPass ? 'text' : 'password'} 
                            required 
                            placeholder={lang === 'si' ? 'මුරපදය ඇතුළත් කරන්න' : 'Enter password'}
                            value={loginPass}
                            onChange={(e) => {
                              setLoginPass(e.target.value);
                              if (loginError) {
                                setLoginError(false);
                                setLoginShake(false);
                              }
                            }}
                            className={`w-full pl-4 pr-11 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-950/60 border ${loginError ? 'border-red-500 text-red-600 dark:text-red-100' : 'border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white'} focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPass(!showLoginPass)}
                            className="absolute right-3.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
                            title={showLoginPass ? 'Hide password' : 'Show password'}
                          >
                            {showLoginPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {loginError && (
                         <div className="text-red-500 text-center text-xs font-bold leading-relaxed">
                            {lang === 'si' 
                              ? <>ඔබගේ ලොගින් යූසනේම් හෝ පාස්වර්ඩ් වැරැදි.<br/>නැවත පරික්ෂා කර බලා ලොග් වන්න.</>
                              : <>Invalid username or password.<br/>Please check and try again.</>
                            }
                         </div>
                      )}

                      <div className="flex justify-between items-center text-xs pt-1">
                        <button 
                          type="button" 
                          onClick={() => setShowForgotBox(true)}
                          className="text-blue-450 hover:text-blue-300 hover:underline transition font-semibold"
                        >
                          {lang === 'si' ? 'මුරපදය අමතකද?' : 'Forgot Password?'}
                        </button>
                        <span className="text-slate-500">Support: WhatsApp 0779630100</span>
                      </div>

                      <button 
                        type="submit" 
                        className={`w-full font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-blue-900/10 ${loginError ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                      >
                        {lang === 'si' ? 'ඇතුල් වන්න (Confirm Login)' : 'Confirm Login'}
                      </button>
                    </form>
                  )}
                </>
              )}
              <div className="text-center pt-4 border-t border-slate-700/50 mt-4">
                <button 
                  onClick={() => setCurrentView('register')}
                  className="text-xs text-slate-400 hover:text-white transition"
                >
                  {lang === 'si' ? 'නැවත ලියාපදිංචි වීමට අවශ්‍යද?' : 'Need to register as a student?'}{' '}
                  <strong className="text-blue-400 font-semibold">{lang === 'si' ? 'මෙහි ක්ලික් කරන්න' : 'Click here'}</strong>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: REGISTER VIEW */}
        {currentView === 'register' && (
          <div className="max-w-2xl w-full mx-auto animate-fade-in my-4">
            <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl relative text-slate-900 dark:text-white">
              
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-display">New Student Registration</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  සියලුම තොරතුරු පිරවීම අත්‍යවශ්‍ය වේ. පද්ධතිය විසින් ඔබගේ ඇතුළත් කිරීම් නිරීක්ෂණය කරනු ඇත.
                </p>
              </div>

              <form ref={regFormRef} onSubmit={handleStudentRegistrationSubmit} className="space-y-5">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* First Name */}
                  <div 
                    ref={grpFirstRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.first ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.first ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      First Name (English)
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. Kasun"
                      value={regFirst}
                      onChange={(e) => {
                        setRegFirst(e.target.value);
                        handleInputChange('first', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 text-slate-900 dark:text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.first ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    />
                    {invalidGroups.first && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">පළමු නම අනිවාර්ය වේ</span>}
                  </div>

                  {/* Last Name */}
                  <div 
                    ref={grpLastRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.last ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.last ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      Last Name (English)
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. Perera"
                      value={regLast}
                      onChange={(e) => {
                        setRegLast(e.target.value);
                        handleInputChange('last', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 text-slate-900 dark:text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.last ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    />
                    {invalidGroups.last && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">වාසගම අනිවාර්ය වේ</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* NIC Number */}
                  <div 
                    ref={grpNIPRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.nic ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.nic ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      National ID (NIC) Number
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. 200412345678"
                      value={regNIC}
                      onChange={(e) => {
                        setRegNIC(e.target.value);
                        handleInputChange('nic', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 text-slate-900 dark:text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.nic ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    />
                    {invalidGroups.nic && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">වලංගු ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න</span>}
                  </div>

                  {/* District */}
                  <div 
                    ref={grpDistRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.district ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.district ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      Select Home District
                    </label>
                    <select 
                      value={regDistrict}
                      onChange={(e) => {
                        setRegDistrict(e.target.value);
                        handleInputChange('district', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 outline-none border transition-all focus:border-blue-500 text-slate-900 dark:text-white ${invalidGroups.district ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    >
                      <option value="" className="text-slate-900 bg-white dark:bg-slate-900 dark:text-white">-- Select District --</option>
                      {SRI_LANKA_DISTRICTS.map((dist, idx) => (
                        <option key={idx} value={dist} className="text-slate-900 bg-white dark:bg-slate-900 dark:text-white">{dist}</option>
                      ))}
                    </select>
                    {invalidGroups.district && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">කරුණාකර දිස්ත්‍රික්කයක් තෝරන්න</span>}
                  </div>
                </div>

                {/* Class Types MULTI_SELECT options */}
                <div 
                  ref={grpClassRef}
                  className={`space-y-2 form-group transition-all ${invalidGroups.classes ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                >
                  <label className={`text-xs font-semibold ${invalidGroups.classes ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                    Class Option (Select one or more)
                  </label>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-300 dark:border-slate-800 rounded-2xl p-4">
                    {dbClasses.length > 0 ? (
                      dbClasses.map((item, idx) => (
                        <label key={idx} className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-white cursor-pointer select-none font-semibold">
                          <input 
                            type="checkbox"
                            value={item}
                            checked={regClassTypes.includes(item)}
                            onChange={(e) => handleClassCheckboxChange(item, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-blue-500"
                          />
                          <span>{item}</span>
                        </label>
                      ))
                    ) : (
                      <span className="text-slate-500 text-xs col-span-2">පන්ති ලැයිස්තුව පූරණය වෙමින් පවතී...</span>
                    )}
                  </div>
                  {invalidGroups.classes && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">අවම වශයෙන් එක් පන්ති වර්ගයක් තෝරන්න</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* WhatsApp Number */}
                  <div 
                    ref={grpWhatsAppRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.whatsapp ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.whatsapp ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      WhatsApp Contact Number
                    </label>
                    <input 
                      type="text" 
                      maxLength={10}
                      placeholder="e.g. 0711234567"
                      value={regWhatsApp}
                      onChange={(e) => {
                        setRegWhatsApp(e.target.value.replace(/\D/g, ''));
                        handleInputChange('whatsapp', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 text-slate-900 dark:text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.whatsapp ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    />
                    {invalidGroups.whatsapp && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">බිංදුවෙන් (0) ආරම්භ වන ඉලක්කම් 10ක වලංගු දුරකථන අංකයක්</span>}
                  </div>

                  {/* Calling phone Number */}
                  <div 
                    ref={grpMobileRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.mobile ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.mobile ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      Mobile Voice (Calling) Code
                    </label>
                    <input 
                      type="text" 
                      maxLength={10}
                      placeholder="e.g. 0771234567"
                      value={regMobile}
                      onChange={(e) => {
                        setRegMobile(e.target.value.replace(/\D/g, ''));
                        handleInputChange('mobile', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950/60 text-slate-900 dark:text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.mobile ? 'border-red-500/80 focus:border-red-500' : 'border-slate-300 dark:border-slate-800'}`}
                    />
                    {invalidGroups.mobile && <span className="text-[10px] text-red-500 dark:text-red-400 block mt-0.5">බිංදුවෙන් (0) ආරම්භ වන ඉලක්කම් 10ක වලංගු දුරකථන අංකයක්</span>}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                  <button 
                    type="submit" 
                    disabled={isSubmitButtonDisabled}
                    className={`flex-1 font-semibold text-sm px-6 py-3 rounded-xl transition-all shadow-lg ${isSubmitButtonDisabled ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40 hover:shadow-blue-700/50 hover:translate-y-[-1px]'}`}
                  >
                    Confirm Registration &amp; Send Admin [0719152128]
                  </button>
                  <button 
                    type="reset" 
                    onClick={() => {
                      setRegFirst('');
                      setRegLast('');
                      setRegNIC('');
                      setRegDistrict('');
                      setRegClassTypes([]);
                      setRegWhatsApp('');
                      setRegMobile('');
                      setInvalidGroups({});
                      setIsSubmitButtonDisabled(false);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-6 py-3 rounded-xl transition font-semibold text-sm"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* VIEW 5: ACTIVE STUDENTS INTERACTIVE DASHBOARD */}
{currentView === 'dashboard' && currentStudent && (
  <StudentDashboard 
    currentStudent={currentStudent}
    handleStudentLogout={handleStudentLogout}
    // Dashboard States
    dashboardTab={dashboardTab}
    setDashboardTab={setDashboardTab}
    showWelcomeBanner={showWelcomeBanner}
    closeWelcomeActiveBanner={closeWelcomeActiveBanner}
    // Data Props
    studentAlerts={studentAlerts}
    siteConfig={siteConfig}
    calendarEvents={calendarEvents}
    announcements={announcements}
    scheduledLives={scheduledLives}
    resourceLinks={resourceLinks}
    // Utilities & Filters
    isCurrentMonthPaid={isCurrentMonthPaid(currentStudent?.activeMonths)}
    filterMonth={filterMonth}
    setFilterMonth={setFilterMonth}
    supabase={supabase}
    lang={lang}
    setLang={setLang}
    theme={theme}
    toggleTheme={toggleTheme}
  />
)}

        {/* VIEW 6: ADMIN PANEL */}
        {currentView === 'admin' && (
          <div className="space-y-6 animate-fade-in w-full">
            
            {/* If not logged in, redirect to normal login */}
            {!isAdminLoggedIn ? (
              <div className="max-w-md w-full mx-auto my-auto py-12 text-center space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-4 shadow-xl">
                  <h3 className="text-base font-bold text-white font-display">පරිපාලක පිවිසුම අවශ්‍යයි (Admin Login Required)</h3>
                  <p className="text-xs text-slate-400">
                    පරිපාලක පැනලයට පිවිසීමට කරුණාකර සාමාන්‍ය Login පිටුව හරහා Admin ගිණුමෙන් ඇතුල් වන්න.
                  </p>
                  <button 
                    onClick={() => setCurrentView('login')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-blue-900/30"
                  >
                    සාමාන්‍ය Login පිටුවට යන්න (Go to Login)
                  </button>
                </div>
              </div>
            ) : currentStaff?.role === 'lecturer' ? (
              // Dedicated Student-Dashboard Style Lecturer Dashboard
              <LecturerDashboard 
                currentStaff={currentStaff} 
                handleLogout={handleAdminLogout} 
                lang={lang}
                setLang={setLang}
              />
            ) : (
              // Authenticated Dashboard Space for Super Admin, Admin, Manager
              <div className="space-y-6">
                
                {/* Header overview control */}
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/50 border border-slate-800 rounded-xl p-4 md:p-5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 font-display">
                      <Settings className="text-amber-500" size={24} /> පරිපාලක පැනලය (Admin Panel & Controls)
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                        currentStaff?.role === 'super_admin' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                        currentStaff?.role === 'admin' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                        currentStaff?.role === 'manager' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        <User size={13} />
                        <span>
                          {currentStaff ? (
                            `${currentStaff.role === 'super_admin' ? 'Super Admin' : currentStaff.role === 'admin' ? 'Admin' : currentStaff.role === 'manager' ? 'Manager' : 'Lecturer'}: ${currentStaff.first_name || ''} ${currentStaff.last_name || ''} (${currentStaff.username})`
                          ) : 'Super Admin (System Owner)'}
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-400 font-mono">
                        {currentStaff?.role === 'super_admin' 
                          ? '🌟 සම්පූර්ණ පාලන ප්‍රවේශය (Full Access)' 
                          : `අවසර ලත් අංශ: ${currentStaff?.allowed_sections?.length || 0}/15`}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={handleAdminLogout}
                    className="bg-slate-850 hover:bg-slate-800 text-xs text-rose-400 hover:text-rose-300 px-4 py-2.5 rounded-xl border border-slate-705 font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>පරිපාලක ගිණුමෙන් ඉවත් වන්න (Logout Admin)</span>
                  </button>
                </div>

                {/* Admin Tab Navigation - Filtered by Staff Role & Permissions */}
                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-800">
                  {isTabAllowed('overview') && (
                    <button 
                      onClick={() => handleAdminTabChange('overview')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${
                        activeAdminTab === 'overview' 
                          ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <LayoutDashboard size={14} />
                      <span>
                        {currentStaff?.role === 'manager' 
                          ? '📊 Manager Overview (දළ විශ්ලේෂණය)' 
                          : '📊 Overview (දළ විශ්ලේෂණය)'}
                      </span>
                    </button>
                  )}
                  {isTabAllowed('registry') && (
                    <button 
                      onClick={() => handleAdminTabChange('registry')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'registry' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Student Registry
                    </button>
                  )}
                  {isTabAllowed('manual_student') && (
                    <button 
                      onClick={() => handleAdminTabChange('manual_student')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'manual_student' ? 'bg-emerald-600/20 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      🎓 ශිෂ්‍ය ලියාපදිංචිය (Manual Register)
                    </button>
                  )}
                  {isTabAllowed('staff') && (
                    <button 
                      onClick={() => handleAdminTabChange('staff')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'staff' ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      👥 කාර්යමණ්ඩලය (Staff: Admin, Manager, Lecturer)
                    </button>
                  )}
                  {isTabAllowed('resets') && (
                    <button 
                      onClick={() => handleAdminTabChange('resets')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'resets' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Class Types & Fees Manager
                    </button>
                  )}
                  {isTabAllowed('payments') && (
                    <button 
                      onClick={() => handleAdminTabChange('payments')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'payments' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Manage Payments
                    </button>
                  )}
                  {isTabAllowed('pending_payments') && (
                    <button 
                      onClick={() => handleAdminTabChange('pending_payments')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'pending_payments' ? 'bg-amber-600/20 text-amber-400 border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      ⏳ Pending Payments (පොරොත්තු ගෙවීම්)
                      {pendingPaymentsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse">
                          {pendingPaymentsCount}
                        </span>
                      )}
                    </button>
                  )}
                  {isTabAllowed('bank_accounts') && (
                    <button 
                      onClick={() => handleAdminTabChange('bank_accounts')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'bank_accounts' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      🏦 Bank Accounts (බැංකු ගිණුම්)
                    </button>
                  )}
                  {isTabAllowed('history') && (
                    <button 
                      onClick={() => handleAdminTabChange('history')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'history' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Payment History
                    </button>
                  )}
                  {isTabAllowed('finance') && (
                    <button 
                      onClick={() => handleAdminTabChange('finance')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'finance' ? 'bg-indigo-600/20 text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      <span>🏛️ මූල්‍ය දෙපාර්තමේන්තුව (Finance Dept)</span>
                    </button>
                  )}
                  {isTabAllowed('qr_generator') && (
                    <button 
                      onClick={() => handleAdminTabChange('qr_generator')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'qr_generator' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      QR Generator
                    </button>
                  )}
                  {isTabAllowed('site_configs') && (
                    <button 
                      onClick={() => handleAdminTabChange('site_configs')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'site_configs' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Site Configuration
                    </button>
                  )}
                  {isTabAllowed('planner') && (
                    <button 
                      onClick={() => handleAdminTabChange('planner')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'planner' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Class Planner
                    </button>
                  )}
                  {isTabAllowed('live_classes') && (
                    <button 
                      onClick={() => handleAdminTabChange('live_classes')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'live_classes' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Live Scheduled
                    </button>
                  )}
                  {isTabAllowed('tutes') && (
                    <button 
                      onClick={() => handleAdminTabChange('tutes')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'tutes' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      📚 Tutes (Google Drive)
                    </button>
                  )}
                  {isTabAllowed('resources') && (
                    <button 
                      onClick={() => handleAdminTabChange('resources')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'resources' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      📹 Class Recordings
                    </button>
                  )}
                  {isTabAllowed('broadcast') && (
                    <button 
                      onClick={() => handleAdminTabChange('broadcast')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'broadcast' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      Broadcast Notices
                    </button>
                  )}
                  {isTabAllowed('device_security') && (
                    <button 
                      onClick={() => handleAdminTabChange('device_security')}
                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors flex items-center gap-1.5 ${activeAdminTab === 'device_security' ? 'bg-rose-600/20 text-rose-400 border-b-2 border-rose-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                    >
                      <span>🛡️ ඩිවයිස් පාලනය (Device Security)</span>
                    </button>
                  )}
                </div>

                {/* Sub panels split grids */}
                <div ref={adminContentRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start scroll-mt-6">
                  
                  {/* Access Denied Warning if active tab is unauthorized */}
                  {!isTabAllowed(activeAdminTab) && (
                    <div className="col-span-12 p-8 md:p-12 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-3">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                        <Lock size={26} />
                      </div>
                      <h3 className="text-base font-bold text-white">ප්‍රවේශ අවසර සීමා කර ඇත (Access Denied)</h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        ඔබගේ ගිණුමට ({currentStaff?.role || 'Staff'}) මෙම අංශයට පිවිසීමට අවසර ලබා දී නොමැත. කරුණාකර ප්‍රධාන පරිපාලක (Super Admin) අමතන්න.
                      </p>
                    </div>
                  )}

                  {activeAdminTab === 'overview' && isTabAllowed('overview') && (
                    <div className="col-span-12 w-full">
                      <AdminOverview 
                        currentStaff={currentStaff} 
                        students={students}
                        onTabChange={handleAdminTabChange}
                        availableClasses={Array.from(new Set(effectiveClasses.map(c => c.name).filter(Boolean)))}
                      />
                    </div>
                  )}

                  {activeAdminTab === 'registry' && isTabAllowed('registry') && (
                    <div className="lg:col-span-12 space-y-6">
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleAdminTabChange('manual_student')}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition cursor-pointer"
                        >
                          ➕ නව ශිෂ්‍යයෙක් ලියාපදිංචි කරන්න (Manual Register)
                        </button>
                      </div>
                      <AdminRegistryTable students={students} setStudents={setStudents} />
                    </div>
                  )}

                  {activeAdminTab === 'manual_student' && isTabAllowed('manual_student') && (
                    <div className="col-span-12 w-full">
                      <AdminManualStudentRegister 
                        availableClasses={effectiveClasses.map(c => c.name)}
                        onStudentRegistered={async () => {
                          const { data } = await supabase.from('students').select('*').order('joined_at', { ascending: false });
                          if (data) setStudents(data);
                        }}
                      />
                    </div>
                  )}

                  {activeAdminTab === 'staff' && isTabAllowed('staff') && (
                    <div className="col-span-12 w-full">
                      <AdminStaffManager currentStaff={currentStaff} />
                    </div>
                  )}

                  {activeAdminTab === 'payments' && isTabAllowed('payments') && (
                    <div className="lg:col-span-12">
                       <AdminPaymentManager />
                    </div>
                  )}

                  {activeAdminTab === 'history' && isTabAllowed('history') && (
                    <div className="lg:col-span-12">
                       <AdminPaymentHistory students={students} />
                    </div>
                  )}

                  {activeAdminTab === 'finance' && isTabAllowed('finance') && (
                    <div className="col-span-12 w-full">
                       <FinanceDepartment 
                         currentStaff={currentStaff} 
                         onNavigateToHistory={() => handleAdminTabChange('history')}
                       />
                    </div>
                  )}

                  {activeAdminTab === 'qr_generator' && isTabAllowed('qr_generator') && (
                    <div className="col-span-12 w-full">
                      <QrGenerator />
                    </div>
                  )}

                  {activeAdminTab === 'resets' && isTabAllowed('resets') && (
                    <div className="lg:col-span-12 w-full">
                      <ClassTypesFeesManager />
                    </div>
                  )}

                  {/* අලුත් AdminLiveControls ෆයිල් එක භාවිතා කිරීම */}
                  {activeAdminTab === 'live_classes' && isTabAllowed('live_classes') && (
                    <div className="col-span-12 w-full">
                      <AdminLiveControls currentStaff={currentStaff} />
                    </div>
                  )}

                  {activeAdminTab === 'pending_payments' && isTabAllowed('pending_payments') && (
                    <div className="col-span-12 w-full">
                       <AdminPendingPayments />
                    </div>
                  )}

                  {activeAdminTab === 'bank_accounts' && isTabAllowed('bank_accounts') && (
                    <div className="col-span-12 w-full">
                       <AdminBankAccountsManager />
                    </div>
                  )}

                  {/* අලුතින් සම්බන්ධ කළ නවීන Tutes සහ Recordings Manager කොටස් - FULL SCREEN WIDTH */}
                  {activeAdminTab === 'tutes' && isTabAllowed('tutes') && (
                    <div className="col-span-12 w-full">
                      <AdminRecordingsManager initialTab="tutes" currentStaff={currentStaff} />
                    </div>
                  )}
                  {activeAdminTab === 'resources' && isTabAllowed('resources') && (
                    <div className="col-span-12 w-full">
                      <AdminRecordingsManager initialTab="recordings" currentStaff={currentStaff} />
                    </div>
                  )}

                  {activeAdminTab === 'site_configs' && isTabAllowed('site_configs') && (
                    <div className="col-span-12 w-full">
                      <AdminSiteConfig />
                    </div>
                  )}

                  {activeAdminTab === 'planner' && isTabAllowed('planner') && (
                    <div className="lg:col-span-12 w-full">
                      <AdminCalendarPlanner />
                    </div>
                  )}

                  {activeAdminTab === 'broadcast' && isTabAllowed('broadcast') && (
                    <div className="lg:col-span-12 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl backdrop-blur-sm">
                    <h3 className="text-md font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-1.5 font-display font-semibold">
                      <Bell size={16} className="text-rose-400" /> Multi-Cast Alert Notifications Sender
                    </h3>

                    <form onSubmit={handleBroadcastAlert} className="space-y-3.5 text-xs">
                      
                      <div className="space-y-1">
                        <label className="text-slate-400">Notification Mode</label>
                        <select 
                          value={notType}
                          onChange={(e) => setNotType(e.target.value as any)}
                          className="w-full bg-slate-950 text-white border border-slate-800 p-1.5 rounded focus:outline-none"
                        >
                          <option value="public" className="text-black bg-white">Public (Broadcast to All Visitors &amp; Students)</option>
                          <option value="private" className="text-black bg-white">Private (Target Specific Student ID - Red Alert Box)</option>
                        </select>
                      </div>

                      {notType === 'private' && (
                        <div className="space-y-1 animate-slide-up">
                          <label className="text-red-400">Target Student Usernames (IDs) - Comma separated for multi-cast</label>
                          <input 
                            type="text"
                            required
                            placeholder="e.g. TAAS8899, RASI2233"
                            value={notTargetUser}
                            onChange={(e) => setNotTargetUser(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-slate-400">Notice Heading / Title</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. Important Slips validation alert"
                          value={notTitle}
                          onChange={(e) => setNotTitle(e.target.value)}
                          className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-400">Notice Content Details</label>
                        <textarea 
                          required
                          placeholder="Type informative notice details..."
                          value={notContent}
                          onChange={(e) => setNotContent(e.target.value)}
                          className="bg-slate-950 text-white w-full h-[60px] px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none resize-none"
                        />
                      </div>

                      <button 
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md cursor-pointer"
                      >
                        Publish Broadcast Notice
                      </button>
                    </form>

                    {/* Manage Announcements */}
                    <div className="pt-4 border-t border-slate-800">
                      <h4 className="font-bold text-sm text-slate-300 mb-3">Manage Sent Notices</h4>
                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                        {announcements.map((a) => (
                          <div key={a.id} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex justify-between items-center gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${a.type === 'public' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>{a.type}</span>
                                <h5 className="font-bold text-xs text-white">{a.title}</h5>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate max-w-[400px]">{a.content}</p>
                              {a.targetUser && <div className="text-[9px] text-red-500 font-mono">Target: {a.targetUser}</div>}
                            </div>
                            <button
                              onClick={async () => {
                                if(confirm("මෙම නිවේදනය මකාදැමීමට අවශ්‍යද?")) {
                                  await supabase.from('announcements').delete().eq('id', a.id);
                                }
                              }}
                              className="text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded hover:bg-red-500/20 transition cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                        {announcements.length === 0 && (
                          <div className="text-[11px] text-slate-500 text-center py-4">No active notices available.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {activeAdminTab === 'device_security' && isTabAllowed('device_security') && (
                    <div className="col-span-12 w-full">
                      <AdminDeviceSecurityManager students={students} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Security Password Protected Site Configurations Entry Modal */}
            {showSiteConfigPasswordModal && (
              <SecurityPasswordModal
                isOpen={true}
                onClose={() => setShowSiteConfigPasswordModal(false)}
                onConfirm={() => {
                  setIsSiteConfigUnlocked(true);
                  setActiveAdminTab('site_configs');
                  setShowSiteConfigPasswordModal(false);
                  setTimeout(() => {
                    adminContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                title="වෙබ් අඩවි සැකසුම් අංශය (Website Appearance & Configurations)"
                description="වෙබ් අඩවියේ හෝම් පේජ් ටෙක්ස්ට්, ෆුටර්, සහ සිසුන්ගේ මෙනු නම් ඇතුළු ප්‍රධාන සැකසුම් වෙනස් කිරීමේ අංශයට ඇතුළු වීමට පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
                itemSummary="Website Appearance & Configurations Section Access"
                actionButtonText="අංශයට පිවිසෙන්න (Unlock Access)"
                isDangerous={false}
                expectedPassword="DANUSHKA18223"
              />
            )}
          </div>
        )}

      </main>

      {/* Dynamic Popups Modal Interface Backdrop */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-6 shadow-2xl relative animation-modal">
            <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-4">
              <h4 className="font-bold text-white text-md font-display">{modalTitle}</h4>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="text-sm text-slate-300">
              {modalContent}
            </div>
          </div>
        </div>
      )}

      {/* Profile Detail Modals */}
      {isProfileModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md antialiased">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-6 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-4">
              <h4 className="font-bold text-white text-md font-display">Verify Student Profile Data</h4>
              <button 
                onClick={closeProfileModal}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-center pb-4 border-b border-slate-850/80">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center font-bold text-white text-2xl mx-auto mb-2 shadow-lg">
                  {currentStudent.firstName.slice(0, 1).toUpperCase()}
                  {currentStudent.lastName.slice(0, 1).toUpperCase()}
                </div>
                <h5 className="font-bold text-white text-base leading-tight">{currentStudent.name}</h5>
                <p className="text-xs text-slate-500 font-mono tracking-wider mt-1">REGISTRATION FILE VERIFIED</p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300 font-sans">
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-400">STUDENT ID (Username):</span>
                  <strong className="text-purple-400 font-mono text-sm">{currentStudent.username}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-400">First Name:</span>
                  <span className="text-white font-medium">{currentStudent.firstName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-400">Last Name:</span>
                  <span className="text-white font-medium">{currentStudent.lastName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5 font-sans">
                  <span className="text-slate-400">National ID (NIC) Number:</span>
                  <span className="text-white font-mono font-medium">{currentStudent.nic}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-400">Enrolled Course Plan:</span>
                  <span className="text-purple-300 font-semibold">{currentStudent.classTypes.join(', ')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5 font-sans">
                  <span className="text-slate-400 font-medium">Home District:</span>
                  <span className="text-white font-medium">{currentStudent.district}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5 font-sans">
                  <span className="text-slate-400 font-medium">WhatsApp Number:</span>
                  <span className="text-white font-mono">{currentStudent.whatsapp}</span>
                </div>
                <div className="flex justify-between font-sans">
                  <span className="text-slate-400 font-medium">Mobile Voice Call:</span>
                  <span className="text-white font-mono">{currentStudent.mobile}</span>
                </div>
              </div>

              <div className="pt-4 text-center font-sans">
                <button 
                  onClick={closeProfileModal}
                  className="bg-slate-850 hover:bg-slate-755 text-slate-200 text-xs font-bold py-2.5 px-6 rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Close Profile Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {currentView !== 'dashboard' && (
        <footer className={`border-t py-6 px-4 mt-12 text-center text-xs space-y-2 font-sans ${
          theme === 'dark' ? 'bg-slate-950 border-slate-900 text-slate-400' : 'bg-white border-slate-200 text-slate-600 shadow-inner'
        }`}>
          <div className="flex justify-center gap-6 text-slate-400 font-bold mb-2">
            {!(currentStudent || isAdminLoggedIn) && (
              <button onClick={() => { setCurrentView('home'); window.scrollTo(0,0); }} className="hover:text-blue-500 transition cursor-pointer">{t.home}</button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-blue-600 dark:text-blue-400 font-bold">
            <span>Contact: Smart Physics Support Team - 0779630100</span>
            <a 
              href="tel:0779630100" 
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px] transition"
              title="Call Smart Physics Support Team"
            >
              <Phone size={12} /> Call Hotline
            </a>
            <a 
              href="https://wa.me/94779630100" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] transition"
              title="WhatsApp Smart Physics Support Team"
            >
              <MessageCircle size={12} /> WhatsApp
            </a>
          </div>
          <div className="text-slate-700 dark:text-slate-300 font-semibold">
            🏛️ Powered by Amarasinghe Digital
          </div>
        </footer>
      )}

    </div>
  );
}
