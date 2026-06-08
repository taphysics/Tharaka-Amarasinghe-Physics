import React, { useState, useEffect } from 'react';
import { Globe, Save } from 'lucide-react';
import { useSupabaseConfig } from '../hooks/useSupabaseConfig';

export default function AdminSiteConfig() {
  const [config, updateConfig] = useSupabaseConfig();
  const [localConfig, setLocalConfig] = useState<any>({});

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleSave = () => {
    updateConfig(localConfig);
    alert("Configurations saved successfully!");
  };

 const handleChange = (field: string, value: string) => {
  setLocalConfig((prev: any) => ({ ...prev, [field]: value }));
};

  return (
    <div className="lg:col-span-12 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-2">
        <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display font-semibold">
          <Globe size={16} className="text-blue-400" /> Website Appearance & Configurations
        </h3>
        <button 
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
        >
          <Save size={14} /> Save Changes
        </button>
      </div>
      
      <div className="space-y-6">
        {/* Core Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Hero Section Title (Home Page)</label>
            <input type="text" value={localConfig.heroTitle || ''} onChange={(e) => handleChange('heroTitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Hero Section Subtitle</label>
            <input type="text" value={localConfig.heroSubtitle || ''} onChange={(e) => handleChange('heroSubtitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Header Logo Title</label>
            <input type="text" value={localConfig.headerTitle || ''} onChange={(e) => handleChange('headerTitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Header Logo Subtitle</label>
            <input type="text" value={localConfig.headerSubtitle || ''} onChange={(e) => handleChange('headerSubtitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400">Main Logo URL</label>
          <input type="text" value={localConfig.logoUrl || ''} onChange={(e) => handleChange('logoUrl', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
        </div>

        {/* Director Details */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
           <h4 className="text-sm font-semibold text-sky-400">Director Details</h4>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
               <label className="text-[10px] text-slate-400">Director Name</label>
               <input type="text" value={localConfig.directorName || ''} onChange={(e) => handleChange('directorName', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
             </div>
             <div className="space-y-1">
               <label className="text-[10px] text-slate-400">Director Title</label>
               <input type="text" value={localConfig.directorTitle || ''} onChange={(e) => handleChange('directorTitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
             </div>
             <div className="space-y-1 md:col-span-2">
               <label className="text-[10px] text-slate-400">Director Quote</label>
               <input type="text" value={localConfig.directorQuote || ''} onChange={(e) => handleChange('directorQuote', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
             </div>
             <div className="space-y-1 md:col-span-2">
               <label className="text-[10px] text-slate-400">Director Image URL</label>
               <input type="text" value={localConfig.directorImage || ''} onChange={(e) => handleChange('directorImage', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
             </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800 pt-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">Home Welcome Badge (e.g. Welcome to Taraka Physics...)</label>
              <input type="text" value={localConfig.homeWelcomeBadge || ''} onChange={(e) => handleChange('homeWelcomeBadge', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">Hero Slider Image 1 URL</label>
              <input type="text" value={localConfig.heroImage1 || ''} onChange={(e) => handleChange('heroImage1', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">Slide 1 Title & Desc</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Title" value={localConfig.slide1Title || ''} onChange={(e) => handleChange('slide1Title', e.target.value)} className="bg-slate-950 text-white w-1/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
                <input type="text" placeholder="Description" value={localConfig.slide1Desc || ''} onChange={(e) => handleChange('slide1Desc', e.target.value)} className="bg-slate-950 text-white w-2/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
              </div>
            </div>

            <div className="space-y-1 mt-4">
              <label className="text-[10px] text-slate-400">Hero Slider Image 2 URL</label>
              <input type="text" value={localConfig.heroImage2 || ''} onChange={(e) => handleChange('heroImage2', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-1 mt-4">
              <label className="text-[10px] text-slate-400">Slide 2 Title & Desc</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Title" value={localConfig.slide2Title || ''} onChange={(e) => handleChange('slide2Title', e.target.value)} className="bg-slate-950 text-white w-1/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
                <input type="text" placeholder="Description" value={localConfig.slide2Desc || ''} onChange={(e) => handleChange('slide2Desc', e.target.value)} className="bg-slate-950 text-white w-2/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">Hero Slider Image 3 URL</label>
              <input type="text" value={localConfig.heroImage3 || ''} onChange={(e) => handleChange('heroImage3', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">Slide 3 Title & Desc</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Title" value={localConfig.slide3Title || ''} onChange={(e) => handleChange('slide3Title', e.target.value)} className="bg-slate-950 text-white w-1/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
                <input type="text" placeholder="Description" value={localConfig.slide3Desc || ''} onChange={(e) => handleChange('slide3Desc', e.target.value)} className="bg-slate-950 text-white w-2/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
              </div>
            </div>

            <div className="space-y-1 mt-4">
              <label className="text-[10px] text-slate-400">Hero Slider Image 4 URL</label>
              <input type="text" value={localConfig.heroImage4 || ''} onChange={(e) => handleChange('heroImage4', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-1 mt-4">
              <label className="text-[10px] text-slate-400">Slide 4 Title & Desc</label>
              <div className="flex gap-2">
                <input type="text" placeholder="Title" value={localConfig.slide4Title || ''} onChange={(e) => handleChange('slide4Title', e.target.value)} className="bg-slate-950 text-white w-1/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
                <input type="text" placeholder="Description" value={localConfig.slide4Desc || ''} onChange={(e) => handleChange('slide4Desc', e.target.value)} className="bg-slate-950 text-white w-2/3 px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
              </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
           <div className="space-y-1">
             <label className="text-[10px] text-slate-400">Feature 1 Box Text</label>
             <textarea rows={3} value={localConfig.feat1Desc || ''} onChange={(e) => handleChange('feat1Desc', e.target.value)} placeholder="Free Resources..." className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
           </div>
           <div className="space-y-1">
             <label className="text-[10px] text-slate-400">Feature 2 Box Text</label>
             <textarea rows={3} value={localConfig.feat2Desc || ''} onChange={(e) => handleChange('feat2Desc', e.target.value)} placeholder="Paid Portal Resources..." className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
           </div>
           <div className="space-y-1">
             <label className="text-[10px] text-slate-400">Feature 3 Box Text</label>
             <textarea rows={3} value={localConfig.feat3Desc || ''} onChange={(e) => handleChange('feat3Desc', e.target.value)} placeholder="Interactive Calendar..." className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
           </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-4 border-t border-slate-800">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Class Fees (මාසික ගාස්තු)</label>
            <textarea rows={3} value={localConfig.classRatesText || ''} onChange={(e) => handleChange('classRatesText', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Class Schedules (පංති දිනයන් සහ වේලාවන්)</label>
            <textarea rows={3} value={localConfig.classScheduleText || ''} onChange={(e) => handleChange('classScheduleText', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Dashboard Welcome Message (ඔබේ ප්‍රධාන ඩෑෂ්බෝඩ් එක)</label>
            <textarea rows={2} value={localConfig.dashboardWelcomeMsg || ''} onChange={(e) => handleChange('dashboardWelcomeMsg', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Dashboard Intro Text</label>
            <textarea rows={3} value={localConfig.dashboardIntroText || ''} onChange={(e) => handleChange('dashboardIntroText', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Dashboard Unpaid Warning Title (ගෙවීම් අනතුරු ඇඟවීමේ ශීර්ෂය)</label>
            <textarea rows={2} value={localConfig.dashboardUnpaidWarningTitle || ''} onChange={(e) => handleChange('dashboardUnpaidWarningTitle', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Dashboard Unpaid Warning Text (ගෙවීම් අනතුරු ඇඟවීමේ අන්තර්ගතය)</label>
            <textarea rows={3} value={localConfig.dashboardUnpaidWarningText || ''} onChange={(e) => handleChange('dashboardUnpaidWarningText', e.target.value)} className="bg-slate-950 text-white w-full px-3 py-2 rounded border border-slate-800 text-xs focus:border-blue-500 outline-none" />
          </div>
        </div>

      </div>
    </div>
  );
}
