import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Lock, 
  Unlock, 
  User, 
  Settings, 
  Phone, 
  Calendar as CalendarIcon, 
  AlertTriangle, 
  CheckCircle, 
  LogOut, 
  Copy, 
  Bell, 
  Volume2, 
  Clock, 
  FileText, 
  UserCheck, 
  Award,
  Globe,
  Plus,
  Trash2,
  X,
  Menu,
  ChevronRight,
  Send,
  Video,
  Folder,
  Download,
  Play
} from 'lucide-react';
import { Student, CalendarEvent, Announcement, SiteConfig } from './types';
import { 
  DEFAULT_STUDENTS, 
  DEFAULT_CALENDAR_EVENTS, 
  DEFAULT_ANNOUNCEMENTS, 
  DEFAULT_SITE_CONFIG,
  SRI_LANKA_DISTRICTS 
} from './data';
import { supabase } from './supabaseClient';

import { useSupabaseSync } from './hooks/useSupabaseSync';
import AdminRegistryTable from './components/AdminRegistryTable';
import ClassTypesFeesManager from './components/ClassTypesFeesManager';
import AdminPaymentManager from './components/AdminPaymentManager';
import AdminPaymentHistory from './components/AdminPaymentHistory';
import AdminGlobalConfig from './components/AdminGlobalConfig';
import AdminCalendarPlanner from './components/AdminCalendarPlanner';
import AdminSiteConfig from './components/AdminSiteConfig';
import AdminSampleDataGenerator from './components/AdminSampleDataGenerator';
import { useSupabaseConfig } from './hooks/useSupabaseConfig';
import AdminAttentionLogs from './components/AdminAttentionLogs';
import StudentPaymentInvoice from './components/StudentPaymentInvoice';
import ResetPassword from './components/ResetPassword';
import StudentDashboard from './components/StudentDashboard';
import AdminRecordingsManager from './components/AdminRecordingsManager';

export default function App() {

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

  const [calendarEvents, setCalendarEvents] = useSupabaseSync<any>('calendar_events', []);
  const [announcements, setAnnouncements] = useSupabaseSync<any>('announcements', []);
  const [resourceLinks, setResourceLinks] = useSupabaseSync<any>('class_resources', []);
  const [scheduledLives, setScheduledLives] = useSupabaseSync<any>('scheduled_lives', []);

  const [currentView, setCurrentView] = useState<'home' | 'free-notes' | 'register' | 'login' | 'dashboard' | 'admin' | 'live' | 'tutes' | 'recordings'>(() => {
    const cached = localStorage.getItem('physics_hub_current_student');
    const expiryStr = localStorage.getItem('physics_hub_login_expiry');
    
    // ලොග් වී ඇත්නම් සහ පැය 2ක කාලය අවසන් වී නැත්නම් කෙලින්ම dashboard එකට යන්න
    if (cached && expiryStr) {
      const now = new Date().getTime();
      const expiryTime = parseInt(expiryStr, 10);
      if (now < expiryTime) {
        return 'dashboard';
      } else {
        // කාලය අවසන් වී ඇත්නම් (පැය 2කට වඩා බැහැරව සිටියා නම්) පැරණි දත්ත මකා දමන්න
        localStorage.removeItem('physics_hub_current_student');
        localStorage.removeItem('physics_hub_login_expiry');
      }
    }
    return 'home';
  });

  const [currentStudent, setCurrentStudent] = useState<Student | null>(() => {
    const cached = localStorage.getItem('physics_hub_current_student');
    const expiryStr = localStorage.getItem('physics_hub_login_expiry');

    if (cached && expiryStr) {
      const now = new Date().getTime();
      const expiryTime = parseInt(expiryStr, 10);
      
      // කාලය ඉකුත් වී නැත්නම් පමණක් ළමයාගේ දත්ත ලබා ගන්න
      if (now < expiryTime) {
        const saved = localStorage.getItem('physics_hub_students');
        const list: Student[] = saved ? JSON.parse(saved) : DEFAULT_STUDENTS;
        return list.find(s => s.username === cached) || null;
      }
    }
    return null;
  });

  // ළමයා වෙබ් අඩවියේ රැඳී සිටින තාක් කල් කල් ඉකුත්වීමේ කාලය අඛණ්ඩව පැය 2කින් ඉදිරියට ගෙන යාම (Heartbeat)
  useEffect(() => {
    if (currentStudent) {
      const extendSessionTime = () => {
        const newExpiryTime = new Date().getTime() + (2 * 60 * 60 * 1000);
        localStorage.setItem('physics_hub_login_expiry', newExpiryTime.toString());
      };

      // මුලින්ම ආපු ගමන්ම Session එක පැය 2කින් Extend කරනවා
      extendSessionTime();

      // ඉන්පසු සෑම තත්පර 60කට වරක්ම කාලය දික් කරනවා
      const intervalId = setInterval(extendSessionTime, 60000);

      // වෙබ් අඩවියෙන් ඉවත් වූ විට (Tab එක Close කළ විට) මෙය නවතින අතර, එතැන් සිට පැය 2ක ගණන් කිරීම ඇරඹේ
      return () => clearInterval(intervalId);
    }
  }, [currentStudent]);
  
  // Slide index
  const [activeSlide, setActiveSlide] = useState(0);
  const slideImages = [
    {
      url: siteConfig.heroImage1,
      title: siteConfig.slide1Title || "Interactive Live Feed",
      desc: siteConfig.slide1Desc || "Weekly real-time streams paired with live quiz features."
    },
    {
      url: siteConfig.heroImage2,
      title: siteConfig.slide2Title || "Particle & Quantum Models",
      desc: siteConfig.slide2Desc || "Deconstructing core theories using high-end simulated models."
    },
    {
      url: siteConfig.heroImage3,
      title: siteConfig.slide3Title || "Practical Laboratory Sessions",
      desc: siteConfig.slide3Desc || "Comprehensive guides on practical apparatus and physics methodologies."
    },
    {
      url: siteConfig.heroImage4,
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

  // Ensure current password matches to handle cross-device password refresh
  useEffect(() => {
    if (currentStudent) {
      const found = students.find(s => s.username === currentStudent.username);
      if (!found || found.password !== currentStudent.password) {
        // Password changed or student deleted, log out
        setCurrentStudent(null);
        localStorage.removeItem('physics_hub_current_student');
        if (currentView !== 'login') {
          setCurrentView('login');
        }
      }
    }
  }, [students, currentStudent, currentView]);

  // Dashboard inner tabs
  const [dashboardTab, setDashboardTab] = useState<'live' | 'recordings' | 'tutes' | 'exams'>('live');
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const studentAlerts = currentStudent ? announcements.filter((alert: any) => 
    alert.type === 'public' || (alert.type === 'private' && alert.target_user === currentStudent.username)
  ) : [];
  
  // Attention Check states
  const [attentionCheckTime, setAttentionCheckTime] = useState<number>(0);
  const [showAttentionCheck, setShowAttentionCheck] = useState(false);

  // Attention Check Timer setup for Live Video Watch
  useEffect(() => {
    // Determine interval dynamically (default 45 minutes)
    let intervalSeconds = 2700; 
    try {
      if (siteConfig?.classRatesText) {
         const parsed = JSON.parse(siteConfig.classRatesText);
         if (parsed.attentionInterval) {
           intervalSeconds = parseInt(parsed.attentionInterval, 10) * 60;
         }
      }
    } catch(e) {}

    const isWatchingVideo = (currentView === 'dashboard' && dashboardTab === 'live') || playingVideoUrl !== null;

    if (isWatchingVideo && !showAttentionCheck) {
      const intervalId = setInterval(() => {
        setAttentionCheckTime(prev => {
          const next = prev + 1;
          if (next >= intervalSeconds) {
            setShowAttentionCheck(true);
            return 0; // reset
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(intervalId);
    } else if (!isWatchingVideo) {
      // Reset timer if video is closed
      setAttentionCheckTime(0);
      setShowAttentionCheck(false);
    }
  }, [currentView, dashboardTab, showAttentionCheck, playingVideoUrl, siteConfig]);

// පිටුව ලෝඩ් වෙද්දීම class_types_config එකෙන් පන්ති වර්ග කියවා ගැනීම
useEffect(() => {
  const fetchAvailableClasses = async () => {
    const { data, error } = await supabase
      .from('class_types_config')
      .select('class_type') // අපිට අවශ්‍ය වන්නේ පන්තියේ නම පමණි
      .order('class_type', { ascending: true }); // අකාරාදී පිළිවෙලට සකස් කිරීම

    if (!error && data) {
      setAvailableClasses(data);
    } else {
      console.error('Error fetching class configs:', error);
    }
  };

  fetchAvailableClasses();
}, []);

  useEffect(() => {
    // If attention check is shown, wait 5 minutes (300 seconds) to play ringtone
    if (showAttentionCheck) {
      const timeoutId = setTimeout(() => {
        const audio = document.getElementById('attention-audio') as HTMLAudioElement;
        if (audio) {
          audio.play().catch(e => console.log('Audio autoplay blocked', e));
        }
      }, 300000); // 5 minutes
      return () => clearTimeout(timeoutId);
    }
  }, [showAttentionCheck]);

  // Modal / Message box states
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Profile modal click details
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Admin access states
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'registry' | 'planner' | 'broadcast' | 'site_configs' | 'payments' | 'history' | 'resources' | 'live_classes' | 'resets' | 'global_configs'>('registry');

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
  const [loginError, setLoginError] = useState(false);
  const [loginShake, setLoginShake] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);

  // Forgot password username
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNIC, setForgotNIC] = useState('');
  const [showForgotBox, setShowForgotBox] = useState(false);

  // Registration states
  const [regFirst, setRegFirst] = useState('');
  const [regLast, setRegLast] = useState('');
  const [regNIC, setRegNIC] = useState('');
  const [regDistrict, setRegDistrict] = useState('');
  const [regClassTypes, setRegClassTypes] = useState<string[]>([]);
  const [regWhatsApp, setRegWhatsApp] = useState('');
  const [regMobile, setRegMobile] = useState('');
  // ඩේටාබේස් එකෙන් ලැබෙන පන්ති වර්ග තබා ගැනීමට අලුත් State එකක්
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

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

  const handleAdminTabChange = (tab: "registry" | "planner" | "broadcast" | "site_configs" | "payments" | "history" | "resources" | "live_classes" | "resets" | "global_configs") => {
    setActiveAdminTab(tab);
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

  // Refresh කළ විට Auto-login වීම සහ පැය 2 පරීක්ෂා කිරීම (අලුතින් එකතු කළ කොටස)
  useEffect(() => {
    const savedStudentUser = localStorage.getItem('physics_hub_current_student');
    const expiryTimeStr = localStorage.getItem('physics_hub_login_expiry');

    if (savedStudentUser && expiryTimeStr && students.length > 0 && !currentStudent) {
      const now = new Date().getTime();
      const expiryTime = parseInt(expiryTimeStr, 10);

      if (now < expiryTime) {
        // පැය 2ක කාලය අවසන් වී නැත්නම් ළමයාව සොයා ලොග් කරවන්න
        const found = students.find(s => s.username === savedStudentUser);
        if (found) {
          setCurrentStudent(found);
          setCurrentView('dashboard');
        }
      } else {
        // පැය 2 අවසන් වී ඇත්නම්, පැරණි දත්ත මකා දමන්න (Auto logout)
        localStorage.removeItem('physics_hub_current_student');
        localStorage.removeItem('physics_hub_login_expiry');
      }
    }
    setIsLoading(false);
  }, [students]); 

  // Check login states on bootup
  const handleStudentLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    setLoginShake(false);

    setTimeout(() => {
      const found = students.find(s => 
        s.username.toLowerCase() === loginUser.trim().toLowerCase() && 
        (s as any).password === loginPass
      );

      if (found) {
        setLoginAttempts(0);
        setCurrentStudent(found);
        
        // Username එක සහ පැය 2ක කල් ඉකුත්වීමේ වේලාව LocalStorage හි සේව් කිරීම
        localStorage.setItem('physics_hub_current_student', found.username);
        const expiryTime = new Date().getTime() + (2 * 60 * 60 * 1000); 
        localStorage.setItem('physics_hub_login_expiry', expiryTime.toString());

        setLoginUser('');
        setLoginPass('');
        setCurrentView('dashboard');
      } else {
        setLoginError(true);
        setLoginShake(true);
        setLoginAttempts(prev => prev + 1);
        setTimeout(() => setLoginShake(false), 1000); // Remove animation class after shake 1s
      }
    }, 10);
  };

  const handleStudentLogout = () => {
    setCurrentStudent(null);
    // ලොග් අවුට් වන විට LocalStorage හි ඇති දත්ත සියල්ල මකා දැමීම
    localStorage.removeItem('physics_hub_current_student');
    localStorage.removeItem('physics_hub_login_expiry');
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
    const text = `හෙලෝ සර්, මගේ Taraka Physics Hub ගිණුමේ මුරපදය අමතක වී ඇත. කරුණාකර එය යථා තත්ත්වයට පත් කර දෙන්න (Password Reset). Username: ${forgotUsername.trim()} NIC: ${forgotNIC.trim()}`;
    const encText = encodeURIComponent(text);
    const waUrl = `https://wa.me/94719152128?text=${encText}`;
    window.open(waUrl, '_blank');
    setShowForgotBox(false);
    setForgotUsername('');
    setForgotNIC('');
  };

// NIC එක පරීක්ෂා කිරීමේ අලුත් කේතය
  const checkNICExists = async (nicValue: string) => {
    if (!nicValue) return false;
    
    const { data, error } = await supabase
      .from('students')
      .select('nic')
      .eq('nic', nicValue)
      .maybeSingle(); // .single() වෙනුවට .maybeSingle() යොදා ඇත

    if (data) {
      alert("මෙම NIC අංකයෙන් දැනටමත් ගිණුමක් ලියාපදිංචි කර ඇත!");
      return true; 
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
          .select('class_type') // මෙතන class_type විය යුතුයි
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
  }, []); // හිස් array එකක් දැම්මම මේක run වෙන්නේ එක පාරයි

const handleStudentRegistrationSubmit = async (e: React.FormEvent) => {
  e.preventDefault(); // ෆෝම් එක සබ්මිට් වෙද්දී පේජ් එක රීලෝඩ් වීම නවත්වයි
  setIsSubmitButtonDisabled(true);

    // 1. මුලින්ම NIC එක Database එකේ තියෙනවද බලනවා
    const isDuplicate = await checkNICExists(regNIC); 
    
    if (isDuplicate) {
      return; // Duplicate නම් මෙතැනින් නවතිනවා. පහළ කේතය වැඩ කරන්නේ නෑ.
    }
    // Validate fields strictly
    const errors: { [key: string]: boolean } = {};
    let firstInvalidRef: React.RefObject<HTMLDivElement | null> | null = null;

    if (!regFirst.trim()) {
      errors.first = true;
      if (!firstInvalidRef) firstInvalidRef = grpFirstRef;
    }
    if (!regLast.trim()) {
      errors.last = true;
      if (!firstInvalidRef) firstInvalidRef = grpLastRef;
    }
    if (!regNIC.trim() || regNIC.trim().length < 9) {
      errors.nic = true;
      if (!firstInvalidRef) firstInvalidRef = grpNIPRef;
    }
    if (!regDistrict) {
      errors.district = true;
      if (!firstInvalidRef) firstInvalidRef = grpDistRef;
    }
    if (regClassTypes.length === 0) {
      errors.classes = true;
      if (!firstInvalidRef) firstInvalidRef = grpClassRef;
    }
    // Validation: Exactly 10 digits starting with 0
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(regWhatsApp)) {
      errors.whatsapp = true;
      if (!firstInvalidRef) firstInvalidRef = grpWhatsAppRef;
    }
    if (!phoneRegex.test(regMobile)) {
      errors.mobile = true;
      if (!firstInvalidRef) firstInvalidRef = grpMobileRef;
    }
    if (Object.keys(errors).length > 0) {
      setInvalidGroups(errors);
      setIsSubmitButtonDisabled(true);

      // Smooth scroll to the first invalid element
      if (firstInvalidRef && firstInvalidRef.current) {
        firstInvalidRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Format secure message for Tutor/Admin on WhatsApp status
  const formattedMessage = `*New Student Registration - TA Physics Online Hub*\n\n` +
    `• First Name: *${regFirst}*\n` +
    `• Last Name: *${regLast}*\n` +
    `• NIC Number: *${regNIC}*\n` +
    `• District: *${regDistrict}*\n` +
    `• Class Type(s): *${regClassTypes.join(', ')}*\n` +
    `• WhatsApp Number: *${regWhatsApp}*\n` +
    `• Mobile Number: *${regMobile}*\n\n` +
    `Please verify my details and provide my login username and password. Thank you!`;

  const encoded = encodeURIComponent(formattedMessage);
  const whatsappLink = `https://wa.me/94719152128?text=${encoded}`;
  
  // Save to Supabase (async/await ක්‍රමයට වඩාත් නිවැරදිව සකසා ඇත)
  const { error } = await supabase.from('students').insert([{
    username: `PENDING_${Date.now()}`, // Temporary unique username
    password: '',
    name: `${regFirst} ${regLast}`,
    first_name: regFirst,
    last_name: regLast,
    nic: regNIC,
    district: regDistrict,
    class_types: regClassTypes, // මෙතනට dynamic ලෙස තෝරාගත් පන්ති Array එක එකතු වේ
    whatsapp: regWhatsApp,
    mobile: regMobile,
    is_paid: false,
    is_approved: false,
    active_months: [], 
    joined_at: new Date().toISOString()
  }]);

  if (error) {
    console.error('Error saving to DB:', error);
    alert('දත්ත ගබඩා කිරීමේ දෝෂයකි. කරුණාකර නැවත උත්සහ කරන්න.');
    setIsSubmitButtonDisabled(false);
    return; // එරර් එකක් ආවොත් ක්‍රියාවලිය මෙතනින් නතර කරයි
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
  setModalTitle("ලියාපදිංචි වීමට අවශ්‍ය තොරතුරු!");
  setModalContent(
    <div className="space-y-4">
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
        ඔබගේ විස්තර Admin වෙත යැවීමට පහත බොත්තම ඔබන්න. ඔබව පෞද්ගලිකව WhatsApp ඔස්සේ සම්බන්ධ කර Username සහ Password ලබා දෙනු ඇත.
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

  // Admin Cockpit authentication
  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === 'dsPHYSICSds*18223') {
      setIsAdminLoggedIn(true);
      setAdminError('');
    } else {
      setAdminError('වැරදි ඇඩ්මින් මුරපදයක්! කරුණාකර නිවැරදි මුරපදය ඇතුළත් කරන්න.');
      setIsAdminLoggedIn(false);
    }
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
            <p className="text-sm text-slate-400">දුරකථන: 0719152128 (Taraka Physics Admin Zone)</p>
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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Dynamic Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-850 px-4 py-3 md:px-8 flex justify-between items-center transition-all">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setCurrentView(currentStudent ? 'dashboard' : 'home')}
        >
          {siteConfig.logoUrl && siteConfig.logoUrl.trim() !== '' ? (
            <img src={siteConfig.logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-lg group-hover:scale-105 transition-transform" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20 font-display text-lg group-hover:scale-105 transition-transform">
              Ω
            </div>
          )}
          <div>
            <h1 className="text-lg md:text-xl font-bold font-sans tracking-tight text-white leading-tight group-hover:text-blue-200 transition-colors">
              {siteConfig.headerTitle || siteConfig.heroTitle}
            </h1>
            <p className="text-[10px] text-blue-400 font-sans tracking-widest font-bold uppercase transition-colors group-hover:text-amber-400">
              {siteConfig.headerSubtitle || 'PHYSICS ONLINE HUB'}
            </p>
          </div>
        </div>

        {/* Navigation Elements */}
        <nav className="hidden md:flex items-center gap-1.5">
          <button 
            onClick={() => setCurrentView('home')} 
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${currentView === 'home' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Home
          </button>
          <button 
            onClick={() => setCurrentView('free-notes')} 
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${currentView === 'free-notes' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Free Notes
          </button>
          
          {currentStudent ? (
            <button 
              onClick={() => setCurrentView('dashboard')} 
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${currentView === 'dashboard' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
            >
              Dashboard
            </button>
          ) : (
            <>
              <button 
                onClick={() => setCurrentView('login')} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${currentView === 'login' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                Login
              </button>
              <button 
                onClick={() => setCurrentView('register')} 
                className="ml-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-5 py-2 rounded-full tracking-wide shadow-md transition transform hover:-translate-y-0.5"
              >
                Register
              </button>
            </>
          )}

          <button 
            onClick={() => setCurrentView('admin')}
            className={`ml-3 border border-dashed border-amber-500/30 text-amber-400 hover:text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 px-3.5 py-1.5 rounded-full text-xs font-mono tracking-wider uppercase flex items-center gap-1`}
          >
            <Settings size={12} /> Cockpit
          </button>
        </nav>

        {/* Mobile menu trigger */}
        <div className="md:hidden flex items-center gap-2">
          <button 
            onClick={() => setCurrentView('admin')}
            className="border border-amber-500/20 text-amber-500 bg-amber-500/5 p-2 rounded-lg text-xs"
          >
            <Settings size={14} />
          </button>
          <button 
            onClick={() => setCurrentView(currentView === 'home' ? 'free-notes' : 'home')}
            className="text-slate-400 p-2 rounded-lg border border-slate-800"
            title="Toggle Fast Menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Sticky Bar for quick links */}
      <div className="md:hidden bg-[#0F172A] border-b border-slate-850 py-2.5 px-4 flex justify-around text-xs text-slate-400">
        <button onClick={() => setCurrentView('home')} className={currentView === 'home' ? 'text-blue-400 font-bold' : ''}>Home</button>
        <button onClick={() => setCurrentView('free-notes')} className={currentView === 'free-notes' ? 'text-blue-400 font-bold' : ''}>Free Notes</button>
        {currentStudent ? (
          <button onClick={() => setCurrentView('dashboard')} className={currentView === 'dashboard' ? 'text-blue-400 font-bold' : ''}>Dashboard</button>
        ) : (
          <>
            <button onClick={() => setCurrentView('login')} className={currentView === 'login' ? 'text-blue-400 font-bold' : ''}>Login</button>
            <button onClick={() => setCurrentView('register')} className={currentView === 'register' ? 'text-blue-400 font-bold' : ''}>Register</button>
          </>
        )}
      </div>

      {/* Main Container Views */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col justify-start">
        
        {/* VIEW 1: HOME */}
        {currentView === 'home' && (
          <div className="space-y-8 animate-fade-in">
            
            {/* Split layout HERO SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left Column: Introductions & Sliding physics backgrounds (Bento Big Card) */}
              <div className="lg:col-span-8 relative rounded-3xl overflow-hidden border border-slate-800 p-6 md:p-10 flex flex-col justify-between shadow-2xl bg-[#0F172A] min-h-[460px] group">
                
                {/* Embedded automatic slide changer backdrop */}
                {slideImages.map((slide, sIdx) => (
                  <div 
                    key={sIdx}
                    style={{ backgroundImage: `url(${slide.url})` }}
                    className={`absolute inset-0 bg-cover bg-center transition-all duration-[1500ms] ${sIdx === activeSlide ? 'opacity-20 scale-100' : 'opacity-0 scale-105'}`}
                  />
                ))}
                
                {/* Dark overlay ensuring white fonts contrast beautifully */}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent z-10" />

                {/* Content Elements */}
                <div className="relative z-20 space-y-6 max-w-2xl my-auto">
                  <div>
                    <span className="inline-block px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs font-bold tracking-wider border border-blue-500/30">
                      {siteConfig.homeWelcomeBadge || "Welcome to Taraka Physics Online Space"}
                    </span>
                  </div>
                  
                  <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-[1.15] font-display tracking-tight text-shadow-md">
                    {siteConfig.heroTitle}
                  </h2>
                  
                  <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                    {siteConfig.heroSubtitle}
                  </p>

                  <div className="flex flex-wrap gap-3.5 pt-2">
                    <button 
                      onClick={() => setCurrentView('register')}
                      className="bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] text-white font-semibold px-6 py-3 rounded-2xl shadow-lg shadow-blue-900/40 transition-all duration-150"
                    >
                      New Student Registration
                    </button>
                    <button 
                      onClick={() => setCurrentView('login')}
                      className="bg-slate-800/80 hover:bg-slate-700/85 hover:scale-[1.02] active:scale-[0.98] text-slate-100 hover:text-white font-medium border border-slate-700 px-6 py-3 rounded-2xl transition-all duration-150 backdrop-blur-sm"
                    >
                      Student Login
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Professional Teacher Branding (Bento Accent Card) */}
              <div className="lg:col-span-4 rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-900 border border-blue-400/20 p-8 flex flex-col justify-between text-center relative shadow-2xl overflow-hidden group">
                {/* Abstract Shape Background */}
                <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/15 transition-all" />
                
                <div className="absolute top-4 right-4 text-[10px] tracking-widest font-mono uppercase bg-white/10 text-blue-200 border border-white/20 px-2 py-0.5 rounded">
                  Director Core
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
                    {siteConfig.directorName || siteConfig.heroTitle}
                  </h3>
                  <p className="text-xs text-blue-200 font-mono tracking-widest uppercase font-semibold opacity-90">
                    {siteConfig.directorTitle || "B.Sc (Hon's) University of Peradeniya | Physics Teacher"}
                  </p>
                </div>

                <div className="bg-slate-950/40 border border-blue-400/20 rounded-2xl p-4 mt-6 text-left relative z-10">
                  <span className="absolute -top-3 left-4 bg-[#142340] border border-blue-400/20 p-0.5 px-2 font-mono text-[9px] text-blue-300 font-semibold uppercase tracking-wider rounded">
                    Advice &amp; Quote
                  </span>
                  <p className="text-blue-100 text-sm italic font-sans leading-relaxed py-1">
                    "{siteConfig.directorQuote || 'භෞතික විද්‍යාව යනු කටපාඩම් කිරීමක් නොව, විශ්වයේ රහස්‍ය ස්වභාවය අවබෝධ කරගැනීමේ සුන්දර ගමනකි.'}"
                  </p>
                </div>

                <div className="pt-6 border-t border-blue-400/20 text-[11px] text-blue-200 justify-center flex items-center gap-1 z-10 opacity-75">
                  <Award size={12} className="text-white" /> Professional physics learning modules
                </div>
              </div>
            </div>

            {/* Feature Cards Section grid (Bento Grid Style) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 space-y-3 group hover:bg-slate-800/60 hover:border-blue-500/50 transition-all shadow-lg">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-all">
                  <Globe size={22} />
                </div>
                <h4 className="text-lg font-bold text-white font-display">Free Resources</h4>
                <p className="text-sm text-slate-400 leading-relaxed font-sans">
                  {siteConfig.feat1Desc || "නොමිලේ ලබාදෙන සම්මන්ත්‍රණ, වීඩියෝ දර්ශන, ක්‍රියාකාරී ඇලර්ට් සහ අනුමාන ප්‍රශ්න පත්‍ර ඕනෑම අයෙකුට පහසුවෙන් ලබා ගත හැක."}
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 space-y-3 group hover:bg-slate-800/60 hover:border-blue-500/50 transition-all shadow-lg">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-all">
                  <Unlock size={22} />
                </div>
                <h4 className="text-lg font-bold text-white font-display">Paid Portal Resources</h4>
                <p className="text-sm text-slate-400 leading-relaxed font-sans">
                  {siteConfig.feat2Desc || "සක්‍රීය සිසුන්ට අදාළ මාසයේ සජීවී දේශන සබැඳි, සවිස්තරාත්මක නිබන්ධන පත්‍රිකා සහ සියලුම පටිගත කළ පාඩම් ලිපිගොනු ඇතුළත් වේ."}
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
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 to-sky-400" />
              
              {showForgotBox ? (
                 <div className="space-y-5 animate-slide-up">
                   <div className="text-center space-y-1.5">
                     <h3 className="text-lg font-bold text-white uppercase tracking-wider font-display">මුරපදය යළි සැකසීම (Request Reset)</h3>
                     <p className="text-xs text-slate-400 leading-relaxed mt-2">
                       ඔබගේ Username එක සහ NIC අංකය පහතින් ටයිප් කර සෙන්ඩ් කළ පසු, මුරපදය අලුත් කර දෙන ලෙස ඉල්ලීමක් ගුරුතුමාගේ WhatsApp ගිණුමට (0719152128) යොමු කිරීමට හැකි වනු ඇත.
                     </p>
                   </div>
                   
                   <form onSubmit={(e) => {
                     e.preventDefault();
                     if (!forgotUsername || !forgotNIC) return;
                     const text = `මට මගේ මුරපදය අමතක වී ඇත.\nUsername: ${forgotUsername}\nNIC: ${forgotNIC}\nකරුණාකර සහාය වන්න.`;
                     window.open(`https://wa.me/94719152128?text=${encodeURIComponent(text)}`, '_blank');
                   }} className="space-y-4 flex flex-col">
                     <div className="space-y-1.5">
                       <input 
                         type="text" 
                         required
                         placeholder="Username (ID)"
                         value={forgotUsername}
                         onChange={(e) => setForgotUsername(e.target.value)}
                         className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:border-blue-500 text-white"
                       />
                     </div>
                     <div className="space-y-1.5">
                       <input 
                         type="text" 
                         required
                         placeholder="NIC අංකය"
                         value={forgotNIC}
                         onChange={(e) => setForgotNIC(e.target.value)}
                         className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:border-blue-500 text-white"
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
                  <div className="text-center space-y-1.5">
                    <h3 className="text-2xl font-bold text-white font-display">Student Portal Login</h3>
                    <p className="text-xs text-slate-400">
                      ලියාපදිංචි වීමේදී ඔබට ලැබුණු පරිශීලක නාමය (Username) හා මුරපදය (NIC) ඇතුළත් කරන්න.
                    </p>
                  </div>

                  {loginAttempts >= 4 ? (
                    <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700 space-y-4 text-center animate-slide-up">
                      <h3 className="text-lg font-bold text-red-400 mb-2">ඔබට ලොගින් ඩීටේල්ස් අමතක උනාද?</h3>
                      <p className="text-sm text-slate-300">දැන්ම ඇඩ්මින්ව සම්බන්ධ කරගන්න</p>
                      <a 
                        href="https://wa.me/94719152128?text=මට%20මගේ%20ලොගින්%20විස්තර%20අමතක%20වී%20ඇත.%20කරුණාකර%20සහාය%20වන්න." 
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
                        className="mt-4 block w-full text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 py-2.5 rounded-xl text-sm font-semibold transition"
                      >
                        Back to Login
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleStudentLoginSubmit} className={`space-y-4 ${loginShake ? 'animate-shake' : ''}`}>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-350 font-medium font-sans">Username (පරිශීලක හැඳුනුම)</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="e.g. KAPE7882"
                          value={loginUser}
                          onChange={(e) => {
                            setLoginUser(e.target.value);
                            if (loginError) {
                              setLoginError(false);
                              setLoginShake(false);
                            }
                          }}
                          className={`w-full px-4 py-2.5 rounded-xl text-sm bg-slate-950/60 border ${loginError ? 'border-red-500 text-red-100' : 'border-slate-800 text-white'} focus:border-blue-500 focus:outline-none transition-all`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-350 font-medium font-sans">Password or NIC Number (මුරපදය)</label>
                        <input 
                          type="password" 
                          required 
                          placeholder="Enter password or National ID"
                          value={loginPass}
                          onChange={(e) => {
                            setLoginPass(e.target.value);
                            if (loginError) {
                              setLoginError(false);
                              setLoginShake(false);
                            }
                          }}
                          className={`w-full px-4 py-2.5 rounded-xl text-sm bg-slate-950/60 border ${loginError ? 'border-red-500 text-red-100' : 'border-slate-800 text-white'} focus:border-blue-500 focus:outline-none transition-all`}
                        />
                      </div>

                      {loginError && (
                         <div className="text-red-500 text-center text-xs font-bold leading-relaxed">
                            ඔබගේ ලොගින් යූසනේම් හෝ පාස්වර්ඩ් වැරැදි.<br/>නැවත පරික්ෂා කර බලා ලොග් වන්න.
                         </div>
                      )}

                      <div className="flex justify-between items-center text-xs pt-1">
                        <button 
                          type="button" 
                          onClick={() => setShowForgotBox(true)}
                          className="text-blue-450 hover:text-blue-300 hover:underline transition font-semibold"
                        >
                          Forgot Password?
                        </button>
                        <span className="text-slate-500">Support: WhatsApp 0719152128</span>
                      </div>

                      <button 
                        type="submit" 
                        className={`w-full font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-blue-900/10 ${loginError ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                      >
                        Confirm Login
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
                  නැවත ලියාපදිංචි වීමට අවශ්‍යද? <strong className="text-blue-400 font-semibold">මෙහි ක්ලික් කරන්න</strong>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: REGISTER VIEW */}
        {currentView === 'register' && (
          <div className="max-w-2xl w-full mx-auto animate-fade-in my-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative">
              
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-xl md:text-2xl font-bold text-white font-display">New Student Registration</h3>
                <p className="text-xs text-slate-400 mt-1">
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
                    <label className={`text-xs font-semibold ${invalidGroups.first ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
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
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.first ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    />
                    {invalidGroups.first && <span className="text-[10px] text-red-400 block mt-0.5">පළමු නම අනිවාර්ය වේ</span>}
                  </div>

                  {/* Last Name */}
                  <div 
                    ref={grpLastRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.last ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.last ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
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
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.last ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    />
                    {invalidGroups.last && <span className="text-[10px] text-red-400 block mt-0.5">වාසගම අනිවාර්ය වේ</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* NIC Number */}
                  <div 
                    ref={grpNIPRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.nic ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.nic ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
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
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.nic ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    />
                    {invalidGroups.nic && <span className="text-[10px] text-red-400 block mt-0.5">වලංගු ජාතික හැඳුනුම්පත් අංකය ඇතුළත් කරන්න</span>}
                  </div>

                  {/* District */}
                  <div 
                    ref={grpDistRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.district ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.district ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                      Select Home District
                    </label>
                    <select 
                      value={regDistrict}
                      onChange={(e) => {
                        setRegDistrict(e.target.value);
                        handleInputChange('district', e.target.value);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 outline-none border transition-all focus:border-blue-500 text-white ${invalidGroups.district ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    >
                      <option value="" className="text-black bg-white">-- Select District --</option>
                      {SRI_LANKA_DISTRICTS.map((dist, idx) => (
                        <option key={idx} value={dist} className="text-black bg-white">{dist}</option>
                      ))}
                    </select>
                    {invalidGroups.district && <span className="text-[10px] text-red-400 block mt-0.5">කරුණාකර දිස්ත්‍රික්කයක් තෝරන්න</span>}
                  </div>
                </div>

                {/* Class Types MULTI_SELECT options */}
                <div 
                  ref={grpClassRef}
                  className={`space-y-2 form-group transition-all ${invalidGroups.classes ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                >
                  <label className={`text-xs font-semibold ${invalidGroups.classes ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                    Class Option (Select one or more)
                  </label>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/60 border border-slate-850 rounded-2xl p-4">
                    {/* අලුතින් වෙනස් කළ කොටස මෙතැන් සිට */}
                    {dbClasses.length > 0 ? (
                      dbClasses.map((item, idx) => (
                        <label key={idx} className="flex items-center gap-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none font-medium">
                          <input 
                            type="checkbox"
                            value={item}
                            checked={regClassTypes.includes(item)}
                            onChange={(e) => handleClassCheckboxChange(item, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 bg-slate-905 border-slate-700 focus:ring-blue-500"
                          />
                          {item}
                        </label>
                      ))
                    ) : (
                      <span className="text-slate-400 text-xs col-span-2">පන්ති ලැයිස්තුව පූරණය වෙමින් පවතී...</span>
                    )}
                    {/* මෙතනින් අවසන් */}
                  </div>
                  {invalidGroups.classes && <span className="text-[10px] text-red-400 block mt-0.5">අවම වශයෙන් එක් පන්ති වර්ගයක් තෝරන්න</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* WhatsApp Number */}
                  <div 
                    ref={grpWhatsAppRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.whatsapp ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.whatsapp ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
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
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.whatsapp ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    />
                    {invalidGroups.whatsapp && <span className="text-[10px] text-red-400 block mt-0.5">බිංදුවෙන් (0) ආරම්භ වන ඉලක්කම් 10ක වලංගු දුරකථන අංකයක්</span>}
                  </div>

                  {/* Calling phone Number */}
                  <div 
                    ref={grpMobileRef}
                    className={`space-y-1.5 form-group transition-all ${invalidGroups.mobile ? 'border-l-2 border-red-500 pl-3 invalid animate-shake' : ''}`}
                  >
                    <label className={`text-xs font-semibold ${invalidGroups.mobile ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
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
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950/60 text-white outline-none border transition-all focus:border-blue-500 ${invalidGroups.mobile ? 'border-red-500/80 focus:border-red-500' : 'border-slate-800'}`}
                    />
                    {invalidGroups.mobile && <span className="text-[10px] text-red-400 block mt-0.5">බිංදුවෙන් (0) ආරම්භ වන ඉලක්කම් 10ක වලංගු දුරකථන අංකයක්</span>}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-800/80">
                  <button 
                    type="submit" 
                    disabled={isSubmitButtonDisabled}
                    className={`flex-1 font-semibold text-sm px-6 py-3 rounded-xl transition-all shadow-lg ${isSubmitButtonDisabled ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40 hover:shadow-blue-700/50 hover:translate-y-[-1px]'}`}
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
                    className="bg-slate-800 hover:bg-slate-755 text-slate-300 border border-slate-700 px-6 py-3 rounded-xl transition"
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
    // අවශ්‍ය නම් තවත් props මෙතැනට එකතු කරන්න
  />
)}

        {/* VIEW 6: COCKPIT PANEL ADMIN CONSOLE */}
        {currentView === 'admin' && (
          <div className="space-y-6 animate-fade-in w-full">
            
            {/* Authenticated block checking */}
            {!isAdminLoggedIn ? (
              <div className="max-w-md w-full mx-auto my-auto py-12">
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                  
                  <div className="text-center space-y-1">
                    <h3 className="text-xl font-bold text-white font-display">Tutor Admin Authenticate</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      ශිෂ්‍ය ගිණුම් සක්‍රිය කිරීමට හා පන්ති දින සැලසුම් කිරීමට කරුණාකර ඔබගේ පරිපාලක රහස් මුරපදය ඇතුළත් කරන්න.
                    </p>
                  </div>

                  <form onSubmit={handleAdminAuth} className="space-y-4">
                    <div className="space-y-1.5 focus-within:text-blue-400">
                      <label className="text-xs text-slate-300 font-medium">Core Admin Password</label>
                      <input 
                        type="password"
                        placeholder="Enter Admin Password"
                        value={adminPasswordInput}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-950/60 border border-slate-800 text-white focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                    {adminError && <p className="text-xs text-red-400 font-sans">{adminError}</p>}

                    <button 
                      type="submit" 
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl tracking-wide transition-all shadow"
                    >
                      Authenticate Verification Key
                    </button>
                    <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-mono font-semibold">
                      Security Protection Loop Active
                    </p>
                  </form>
                </div>
              </div>
            ) : (
              // Authenticated Dashboard Space
              <div className="space-y-6">
                
                {/* Header overview control */}
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/50 border border-slate-800 rounded-xl p-4 md:p-5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 font-display">
                      <Settings className="text-blue-500" size={24} /> Admin Cockpit &amp; Class Controller
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      ශිෂ්‍ය ගිණුම් කළමනාකරණය, පද්ධති කේත නිර්මාණය සහ පන්ති දින සැලසුම්කරණ මධ්‍යස්ථානය.
                    </p>
                  </div>
                  <button 
                    onClick={handleAdminLogout}
                    className="bg-slate-850 hover:bg-slate-800 text-xs text-rose-400 hover:text-rose-300 px-4 py-2.5 rounded-xl border border-slate-705 font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    Lock Session admin
                  </button>
                </div>

                {/* Admin Tab Navigation */}
                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-800">
                  <button 
                    onClick={() => handleAdminTabChange('registry')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'registry' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Student Registry
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('resets')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'resets' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Class Types & Fees Manager
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('payments')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'payments' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Manage Payments
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('history')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'history' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Payment History
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('global_configs')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'global_configs' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Global Config
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('site_configs')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'site_configs' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Site Configuration
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('planner')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'planner' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Class Planner
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('live_classes')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'live_classes' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Live Scheduled
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('resources')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'resources' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Tutes &amp; Records
                  </button>
                  <button 
                    onClick={() => handleAdminTabChange('broadcast')}
                    className={`px-4 py-2 text-xs font-bold whitespace-nowrap rounded-t-xl transition-colors ${activeAdminTab === 'broadcast' ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                  >
                    Broadcast Notices
                  </button>
                </div>

                {/* Sub panels split grids */}
                <div ref={adminContentRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start scroll-mt-6">
                  
                  {activeAdminTab === 'registry' && (
                    <>
                      <div className="lg:col-span-12">
                         <AdminRegistryTable students={students} setStudents={setStudents} />
                      </div>
                      <div className="lg:col-span-12">
                         <AdminSampleDataGenerator />
                      </div>

                  {/* Password Reset Tool Removed to separate view tab */}

                  <div className="lg:col-span-12 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl backdrop-blur-sm">
                    <h3 className="text-md font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-1.5 font-display font-semibold">
                      <Plus size={16} className="text-blue-400" /> Quick Student Registration Coder
                    </h3>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">First Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Nimal"
                            value={manFirst}
                            onChange={(e) => setManFirst(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Last Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Silva"
                            value={manLast}
                            onChange={(e) => setManLast(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">National ID Number (NIC)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 20021345678"
                          value={manNIC}
                          onChange={(e) => setManNIC(e.target.value)}
                          className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">District</label>
                        <select 
                          value={manDistrict}
                          onChange={(e) => setManDistrict(e.target.value)}
                          className="w-full bg-slate-950 text-white border border-slate-800 text-xs p-1.5 rounded focus:outline-none"
                        >
                          {SRI_LANKA_DISTRICTS.map((dst, idx) => (
                            <option key={idx} value={dst} className="text-black bg-white">{dst}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Class Option Checkboxes</label>
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-2.5 border border-slate-850 rounded">
                          {globalClassNames.map((item, idx) => (
                            <label key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                              <input 
                                type="checkbox"
                                checked={manClassTypes.includes(item)}
                                onChange={(e) => {
                                  if (e.target.checked) setManClassTypes(prev => [...prev, item]);
                                  else setManClassTypes(prev => prev.filter(c => c !== item));
                                }}
                                className="w-3.5 h-3.5"
                              />
                              {item}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">WhatsApp Number</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 0712345678"
                            value={manWhatsApp}
                            onChange={(e) => setManWhatsApp(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Mobile Number</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 0712345678"
                            value={manMobile}
                            onChange={(e) => setManMobile(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 mb-4 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                         <input 
                           type="checkbox"
                           id="freeStudentToggle"
                           checked={manFreeToggle}
                           onChange={(e) => setManFreeToggle(e.target.checked)}
                           className="w-4 h-4 cursor-pointer"
                         />
                         <label htmlFor="freeStudentToggle" className="text-xs text-blue-300 font-bold cursor-pointer">
                           Give this student a FREE CARD (Full Access)
                         </label>
                      </div>

                      {manFreeToggle && (
                        <div className="space-y-1 bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl mt-2 mb-2">
                          <label className="text-[10px] text-blue-300 font-bold">Free Access Months (Comma separated)</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 2026-05, 2026-06, 2026-07"
                            value={manFreeMonthsString}
                            onChange={(e) => setManFreeMonthsString(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-blue-500/50 text-xs focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      )}

                      <button 
                        onClick={handleAdminManualGenerate}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                      >
                        Formulate Registered JSON Code &amp; Credentials
                      </button>

                      {generatedJSON && (
                        <div className="space-y-1.5 pt-2">
                          <label className="text-[10px] text-slate-400 block font-mono">Generated Output Profile block:</label>
                          <textarea 
                            readOnly
                            value={generatedJSON}
                            className="bg-slate-950/80 text-blue-300 w-full h-[100px] font-mono text-[10px] border border-slate-800 p-2 rounded-xl outline-none resize-none font-semibold"
                          />
                          <button 
                            type="button"
                            onClick={handleCopyJSON}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-705 p-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <Copy size={12} /> Copy Student Profile JSON Data
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                    </>
                  )}

                  {activeAdminTab === 'payments' && (
                    <div className="lg:col-span-12">
                       <AdminPaymentManager />
                    </div>
                  )}

                  {activeAdminTab === 'history' && (
                    <div className="lg:col-span-12">
                       <AdminPaymentHistory students={students} />
                    </div>
                  )}

                  {activeAdminTab === 'global_configs' && (
                    <div className="lg:col-span-12">
                       <AdminGlobalConfig />
                    </div>
                  )}

                  {activeAdminTab === 'resets' && (
  <div className="lg:col-span-12 w-full">
    <ClassTypesFeesManager />
  </div>
)}

                  {activeAdminTab === 'live_classes' && (
                    <div className="lg:col-span-12 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl backdrop-blur-sm">
                      <h3 className="text-md font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-1.5 font-display font-semibold">
                        <Video size={16} className="text-red-400" /> Manage Scheduled Live Classes (YouTube)
                      </h3>

                      <form onSubmit={handleAddLive} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-900/40 p-4 border border-slate-700/50 rounded-xl">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Class Type (Subject/Batch)</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. 2026 Theory"
                            value={liveClassType}
                            onChange={(e) => setLiveClassType(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Date & Time (Auto-play trigger)</label>
                          <input 
                            type="datetime-local" 
                            required
                            value={liveScheduleDate}
                            onChange={(e) => setLiveScheduleDate(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">YouTube Unlisted URL</label>
                          <input 
                            type="text" 
                            required
                            placeholder="https://youtu.be/..."
                            value={liveUrl}
                            onChange={(e) => setLiveUrl(e.target.value)}
                            className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Lesson Title</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              required
                              placeholder="e.g. Mechanics Week 04"
                              value={liveTitle}
                              onChange={(e) => setLiveTitle(e.target.value)}
                              className="bg-slate-950 text-white w-full px-2.5 py-1.5 rounded border border-slate-800 text-xs focus:outline-none focus:border-red-500"
                            />
                            <button 
                              type="submit"
                              className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-1.5 rounded text-xs transition shadow-md cursor-pointer whitespace-nowrap"
                            >
                              Add Live
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* Display scheduled lives */}
                      <div className="mt-6">
                         <h4 className="font-bold text-sm text-slate-300 mb-3">Live Broadcast Schedule</h4>
                         <div className="max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 space-y-2">
                           {scheduledLives.map((sl, idx) => (
                             <div key={idx} className="flex flex-col md:flex-row justify-between md:items-center bg-slate-900 border border-slate-800 p-3 rounded-xl gap-2">
                               <div>
                                 <strong className="text-white text-xs font-mono">{sl.target_classes?.[0]}</strong>
                                 <span className="text-slate-400 text-xs ml-2 font-semibold">- {sl.title}</span>
                                 <div className="text-[10px] text-slate-500 mt-0.5">Scheduled info: {sl.date} • {sl.time}</div>
                               </div>
                               <div className="flex items-center gap-3">
                                 <div className="text-xs text-red-400 font-mono truncate max-w-[200px]">{sl.link}</div>
                                 <button
                                   onClick={async () => {
                                      if(confirm('මෙම සක්‍රීය සැලසුම පවතින ලැයිස්තුවෙන් ඉවත් කිරීමට අවශ්‍යද?')) {
                                        await supabase.from('scheduled_lives').delete().eq('id', sl.id);
                                      }
                                   }}
                                   className="text-[10px] text-red-500 hover:text-red-400 underline cursor-pointer"
                                 >
                                   Delete
                                 </button>
                               </div>
                             </div>
                           ))}
                           {scheduledLives.length === 0 && (
                             <p className="text-[11px] text-slate-500 text-center py-4">No scheduled live broadcasts yet.</p>
                           )}
                         </div>
                      </div>

                      <AdminAttentionLogs scheduledLives={scheduledLives} />

                    </div>
                  )}

                  {/* අලුතින් සම්බන්ධ කළ නවීන Recordings Manager කොටස */}
                  {activeAdminTab === 'resources' && (
                    <AdminRecordingsManager />
                  )}

                  {activeAdminTab === 'site_configs' && (
                    <AdminSiteConfig />
                  )}

                  {activeAdminTab === 'planner' && (
                    <div className="lg:col-span-12 w-full">
                      <AdminCalendarPlanner />
                    </div>
                  )}

                  {activeAdminTab === 'broadcast' && (
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
                </div>

              </div>
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

      {/* Elegant Standard XHTML Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-8 px-4 mt-12 text-center text-xs text-slate-500 space-y-4 font-sans">
        <div className="flex justify-center gap-6 text-slate-400 font-bold">
          <button onClick={() => { setCurrentView('home'); window.scrollTo(0,0); }} className="hover:text-white transition cursor-pointer">Home Page</button>
          <button onClick={() => { setCurrentView('free-notes'); window.scrollTo(0,0); }} className="hover:text-white transition cursor-pointer">Free Notes</button>
        </div>
        <div>
          <p className="font-sans">© 2026 Taraka Amarasinghe Physics Zone. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
