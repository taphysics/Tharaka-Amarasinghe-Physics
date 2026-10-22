import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Save, 
  Palette, 
  Type, 
  LayoutTemplate, 
  Phone, 
  Sliders, 
  Sparkles, 
  Check, 
  RotateCcw,
  Menu,
  MessageCircle
} from 'lucide-react';
import { useSupabaseConfig } from '../hooks/useSupabaseConfig';
import SecurityPasswordModal from './SecurityPasswordModal';

const ACCENT_COLORS = [
  { id: '#2563eb', name: 'Electric Blue (Default)', class: 'bg-blue-600' },
  { id: '#059669', name: 'Emerald Green', class: 'bg-emerald-600' },
  { id: '#7c3aed', name: 'Royal Purple', class: 'bg-purple-600' },
  { id: '#d97706', name: 'Amber Gold', class: 'bg-amber-600' },
  { id: '#0891b2', name: 'Cyan Ocean', class: 'bg-cyan-600' },
  { id: '#e11d48', name: 'Crimson Rose', class: 'bg-rose-600' },
];

const FONT_STYLES = [
  { id: 'sans', name: 'Inter / Modern Sans (Default)', desc: 'Clean, legible modern interface' },
  { id: 'tech', name: 'Space Grotesk / High-Tech', desc: 'Futuristic technical STEM styling' },
  { id: 'display', name: 'Outfit / Display Bold', desc: 'Prominent, striking typography' },
  { id: 'system', name: 'System Native UI', desc: 'Ultra-fast native OS font stack' },
];

export default function AdminSiteConfig() {
  const [config, updateConfig] = useSupabaseConfig();
  const [localConfig, setLocalConfig] = useState<any>({});
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'home' | 'footer' | 'menu' | 'appearance'>('home');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (config) {
      setLocalConfig({ ...config });
    }
  }, [config]);

  const handleInitiateSave = () => {
    setIsPasswordModalOpen(true);
  };

  const executeSave = () => {
    updateConfig(localConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    setIsPasswordModalOpen(false);
  };

  const handleChange = (field: string, value: any) => {
    setLocalConfig((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleMenuNameChange = (tabId: string, val: string) => {
    setLocalConfig((prev: any) => {
      const existingMenu = { ...(prev.menuNames || {}) };
      existingMenu[tabId] = val;
      return { ...prev, menuNames: existingMenu, [`menu_${tabId}`]: val };
    });
  };

  return (
    <div className="w-full bg-slate-900/60 border border-slate-700/60 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl backdrop-blur-md">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold mb-2">
            <Globe size={14} />
            <span>WEBSITE APPEARANCE & CONTENT STUDIO</span>
          </div>
          <h3 className="text-xl md:text-2xl font-black text-white font-display flex items-center gap-2">
            වෙබ් අඩවි පෙනුම සහ අන්තර්ගත සැකසුම්
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            ප්‍රධාන හෝම් පේජ් එකේ සියලුම පෙළ, ෆුටර් තොරතුරු, ශිෂ්‍ය ඩෑෂ්බෝඩ් මෙනු නම් (උදා: Class වෙනුවට Course), සහ වර්ණ/ෆොන්ට් මෙතැනින් කළමනාකරණය කරන්න.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
              <Check size={14} /> සුරකින ලදී! (Saved)
            </span>
          )}
          <button 
            type="button"
            onClick={handleInitiateSave}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30"
          >
            <Save size={15} /> Save Changes
          </button>
        </div>
      </div>

      {/* Sub-Section Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveSection('home')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSection === 'home'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <LayoutTemplate size={14} />
          <span>හෝම් පේජ් ටෙක්ස්ට් (Home Page Content)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('footer')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSection === 'footer'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Phone size={14} />
          <span>ෆුටර් &amp; දුරකථන සහාය (Footer &amp; Support)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('menu')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSection === 'menu'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Menu size={14} />
          <span>සිසුවාගේ මෙනු නම් (Dashboard Menu Labels)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('appearance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSection === 'appearance'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Palette size={14} />
          <span>වර්ණ &amp; ෆොන්ට් ස්ටයිල් (Theme &amp; Fonts)</span>
        </button>
      </div>

      {/* SECTION 1: HOME PAGE ALL TEXTS */}
      {activeSection === 'home' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Hero Section Main Title (ප්‍රධාන ශීර්ෂය)</label>
              <input 
                type="text" 
                value={localConfig.heroTitle || ''} 
                onChange={(e) => handleChange('heroTitle', e.target.value)} 
                placeholder="දිවයිනේ විශිෂ්ටතම භෞතික විද්‍යා පන්තිය"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Hero Section Subtitle (උප ශීර්ෂය)</label>
              <input 
                type="text" 
                value={localConfig.heroSubtitle || ''} 
                onChange={(e) => handleChange('heroSubtitle', e.target.value)} 
                placeholder="A/L Physics ගොඩදාන අලුත්ම ක්‍රමවේදය"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Header Brand Title (ලෝගෝ නාමය)</label>
              <input 
                type="text" 
                value={localConfig.headerTitle || ''} 
                onChange={(e) => handleChange('headerTitle', e.target.value)} 
                placeholder="SMART PHYSICS"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-bold" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Header Brand Subtitle (ලෝගෝ උප නාමය)</label>
              <input 
                type="text" 
                value={localConfig.headerSubtitle || ''} 
                onChange={(e) => handleChange('headerSubtitle', e.target.value)} 
                placeholder="තාරක අමරසිංහ"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold">Home Welcome Badge (හෝම් පේජ් පිළිගැනීමේ ලේබලය)</label>
            <input 
              type="text" 
              value={localConfig.homeWelcomeBadge || ''} 
              onChange={(e) => handleChange('homeWelcomeBadge', e.target.value)} 
              placeholder="🌟 සාදරයෙන් පිළිගනිමු Smart Physics පන්ති කාමරයට"
              className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
            />
          </div>

          {/* Director & About Details */}
          <div className="p-5 bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-4">
            <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} /> ආචාර්ය මණ්ඩල තොරතුරු (Instructor / Director Section)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">ගුරුතුමාගේ නම (Director Name)</label>
                <input 
                  type="text" 
                  value={localConfig.directorName || ''} 
                  onChange={(e) => handleChange('directorName', e.target.value)} 
                  placeholder="තාරක අමරසිංහ (Tharaka Amarasinghe)"
                  className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-bold">තනතුර / සුදුසුකම් (Title / Credentials)</label>
                <input 
                  type="text" 
                  value={localConfig.directorTitle || ''} 
                  onChange={(e) => handleChange('directorTitle', e.target.value)} 
                  placeholder="B.Sc. (Eng) Hons, Senior Physics Lecturer"
                  className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs text-slate-300 font-bold">ගුරුතුමාගේ විශේෂ පණිවිඩය (Director Quote)</label>
                <textarea 
                  rows={2} 
                  value={localConfig.directorQuote || ''} 
                  onChange={(e) => handleChange('directorQuote', e.target.value)} 
                  placeholder="භෞතික විද්‍යාව යනු කටපාඩම් කරන විෂයක් නොව, ප්‍රායෝගිකව තේරුම් ගත යුතු රසවත් විෂයකි."
                  className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
                />
              </div>
            </div>
          </div>

          {/* Feature 1, 2, 3 Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Feature 1 Box Text</label>
              <textarea 
                rows={3} 
                value={localConfig.feat1Desc || ''} 
                onChange={(e) => handleChange('feat1Desc', e.target.value)} 
                placeholder="නොමිලේ ලබාගත හැකි සම්පත් සහ සිද්ධාන්ත සටහන්..." 
                className="bg-slate-900 text-white w-full px-3 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Feature 2 Box Text</label>
              <textarea 
                rows={3} 
                value={localConfig.feat2Desc || ''} 
                onChange={(e) => handleChange('feat2Desc', e.target.value)} 
                placeholder="සජීවී පන්ති සහ මාර්ගගත විභාග මධ්‍යස්ථානය..." 
                className="bg-slate-900 text-white w-full px-3 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Feature 3 Box Text</label>
              <textarea 
                rows={3} 
                value={localConfig.feat3Desc || ''} 
                onChange={(e) => handleChange('feat3Desc', e.target.value)} 
                placeholder="අන්තර්ක්‍රියාකාරී පන්ති කාලසටහන සහ HD රෙකෝඩින්..." 
                className="bg-slate-900 text-white w-full px-3 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
          </div>

          {/* Class Fees & Schedules Descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Class Fees Text (මාසික ගාස්තු විස්තර)</label>
              <textarea 
                rows={3} 
                value={localConfig.classRatesText || ''} 
                onChange={(e) => handleChange('classRatesText', e.target.value)} 
                placeholder="සියලුම පන්ති ගාස්තු සහ පැකේජ විස්තර..." 
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Class Schedules Text (පංති දිනයන් සහ වේලාවන්)</label>
              <textarea 
                rows={3} 
                value={localConfig.classScheduleText || ''} 
                onChange={(e) => handleChange('classScheduleText', e.target.value)} 
                placeholder="සෑම සෙනසුරාදා සහ ඉරිදා දිනකම සජීවීව..." 
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: FOOTER & SUPPORT INFORMATION */}
      {activeSection === 'footer' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 bg-blue-950/30 border border-blue-500/20 rounded-2xl text-xs text-blue-300 leading-relaxed">
            මෙහිදී වෙනස් කරන දුරකථන අංක සහ පාඨ මුළු වෙබ් අඩවියේම සහ ශිෂ්‍ය ඩෑෂ්බෝඩ් එකේ පහලම ඇති Footer කොටසෙහි ක්ෂණිකව දිස්වේ.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">Support Hotline Phone (ඇමතුම් අංකය)</label>
              <input 
                type="text" 
                value={localConfig.footerPhone || '0779630100'} 
                onChange={(e) => handleChange('footerPhone', e.target.value)} 
                placeholder="0779630100"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-mono" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-bold">WhatsApp Support Number (වට්ස්ඇප් අංකය)</label>
              <input 
                type="text" 
                value={localConfig.footerWhatsapp || '0779630100'} 
                onChange={(e) => handleChange('footerWhatsapp', e.target.value)} 
                placeholder="0779630100"
                className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-mono" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold">Footer Contact Line Text (සම්බන්ධතා පාඨය)</label>
            <input 
              type="text" 
              value={localConfig.footerContactText || 'Contact: Smart Physics Support Team - 0779630100'} 
              onChange={(e) => handleChange('footerContactText', e.target.value)} 
              placeholder="Contact: Smart Physics Support Team - 0779630100"
              className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-bold" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold">Powered By Attribution (ආයතනික නාමය)</label>
            <input 
              type="text" 
              value={localConfig.footerPoweredBy || '🏛️ Powered by Amarasinghe Digital'} 
              onChange={(e) => handleChange('footerPoweredBy', e.target.value)} 
              placeholder="🏛️ Powered by Amarasinghe Digital"
              className="bg-slate-950 text-white w-full px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-bold text-amber-400" 
            />
          </div>
        </div>
      )}

      {/* SECTION 3: STUDENT DASHBOARD MENU TAB CUSTOM NAMES */}
      {activeSection === 'menu' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 bg-purple-950/30 border border-purple-500/20 rounded-2xl text-xs text-purple-300 leading-relaxed">
            සිසුවාගේ ඩෑෂ්බෝඩ් එකේ ඇති මෙනු නම් ඔබේ අභිමතය පරිදි මෙතැනින් වෙනස් කළ හැක (උදාහරණයක් ලෙස Classes යන්න Course හෝ පාඨමාලා ලෙස වෙනස් කළ හැක).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Overview Tab (ප්‍රධාන දළ විශ්ලේෂණය)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.overview || localConfig.menu_overview || ''} 
                onChange={(e) => handleMenuNameChange('overview', e.target.value)} 
                placeholder="Hub Overview / ප්‍රධාන පිටුව"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Classes / Packages Tab (පන්ති / පාඨමාලා)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.history || localConfig.menu_history || ''} 
                onChange={(e) => handleMenuNameChange('history', e.target.value)} 
                placeholder="Course / වෙනත් පන්ති (Other Classes)"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none font-bold text-emerald-400" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Live Classes Tab (සජීවී පන්තිය)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.live || localConfig.menu_live || ''} 
                onChange={(e) => handleMenuNameChange('live', e.target.value)} 
                placeholder="Live Classes / සජීවී පන්තිය"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Recordings Tab (පන්ති රෙකෝඩින්)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.recordings || localConfig.menu_recordings || ''} 
                onChange={(e) => handleMenuNameChange('recordings', e.target.value)} 
                placeholder="Recordings / වීඩියෝ පාඩම්"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Documents / Tutes Tab (ටියුට් &amp; Papers)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.tutes || localConfig.menu_tutes || ''} 
                onChange={(e) => handleMenuNameChange('tutes', e.target.value)} 
                placeholder="Documents / ටියුට් & Papers"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
              <label className="text-xs text-slate-300 font-bold">Exams Tab (ඔන්ලයින් විභාග)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.exams || localConfig.menu_exams || ''} 
                onChange={(e) => handleMenuNameChange('exams', e.target.value)} 
                placeholder="Exams / විභාග & Tests"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>

            <div className="space-y-1.5 p-4 bg-slate-950/60 rounded-2xl border border-slate-800 md:col-span-2">
              <label className="text-xs text-slate-300 font-bold">Timetable Tab (පන්ති කාලසටහන)</label>
              <input 
                type="text" 
                value={localConfig.menuNames?.calendar || localConfig.menu_calendar || ''} 
                onChange={(e) => handleMenuNameChange('calendar', e.target.value)} 
                placeholder="Class Timetable / කාලසටහන"
                className="bg-slate-900 text-white w-full px-3.5 py-2 rounded-xl border border-slate-800 text-xs focus:border-blue-500 outline-none" 
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: THEME COLORS & FONT STYLES */}
      {activeSection === 'appearance' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="space-y-3">
            <label className="text-xs text-slate-300 font-bold">ප්‍රධාන වර්ණය (Primary Accent Color)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ACCENT_COLORS.map(c => {
                const isSelected = (localConfig.themeAccent || '#2563eb') === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleChange('themeAccent', c.id)}
                    className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
                      isSelected ? 'border-white bg-slate-800 shadow-md ring-2 ring-blue-500' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full ${c.class} shrink-0 ring-2 ring-white/20`} />
                    <span className="text-xs font-bold text-white truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-800">
            <label className="text-xs text-slate-300 font-bold">අකුරු මෝස්තරය (Font Style Family)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FONT_STYLES.map(f => {
                const isSelected = (localConfig.fontStyle || 'sans') === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleChange('fontStyle', f.id)}
                    className={`p-4 rounded-2xl border text-left transition cursor-pointer space-y-1 ${
                      isSelected ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-400' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{f.name}</span>
                      {isSelected && <Check size={14} className="text-blue-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400">{f.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Security Password Protected Save Modal (Requires "DANUSHKA18223") */}
      {isPasswordModalOpen && (
        <SecurityPasswordModal
          isOpen={true}
          onClose={() => setIsPasswordModalOpen(false)}
          onConfirm={executeSave}
          title="වෙබ් අඩවි සැකසුම් සුරැකීම (Save Configurations)"
          description="හෝම් පේජ් හෝ සිසුවාගේ ඩෑෂ්බෝඩ් ඕවර්විව් සහ මෙනු පෙළ වෙනස්කම් ස්ථිරවම සුරැකීමට කරුණාකර පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
          itemSummary="Home Page, Footer, Menu Labels & Styling Configurations"
          actionButtonText="වෙනස්කම් සුරකින්න (Save Now)"
          isDangerous={false}
        />
      )}

    </div>
  );
}
