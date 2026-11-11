import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Unlock, 
  Award, 
  BookOpen, 
  Video, 
  FileText, 
  User, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { SITE_BRAND_CONFIG, getMergedSiteConfig } from '../config/siteBrandConfig';

interface HomePageViewProps {
  lang: 'si' | 'en';
  theme: 'light' | 'dark';
  dbSiteConfig?: any;
  onNavigate: (view: 'register' | 'login') => void;
}

export default function HomePageView({
  lang,
  theme,
  dbSiteConfig,
  onNavigate
}: HomePageViewProps) {
  const brand = getMergedSiteConfig(dbSiteConfig, lang);
  const [activeSlide, setActiveSlide] = useState(0);

  // Automatic slideshow transition
  useEffect(() => {
    if (!brand.heroSlides || brand.heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % brand.heroSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [brand.heroSlides]);

  // Helper to render icon by name
  const renderCardIcon = (iconType: string) => {
    switch (iconType) {
      case 'unlock':
        return <Unlock size={22} />;
      case 'award':
        return <Award size={22} />;
      case 'book':
        return <BookOpen size={22} />;
      case 'video':
        return <Video size={22} />;
      case 'file':
        return <FileText size={22} />;
      case 'globe':
      default:
        return <Globe size={22} />;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in w-full">
      
      {/* =========================================================================
          HERO SECTION (Split Layout Bento Grid)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column: Introductions & Sliding Backgrounds (Bento Big Card) */}
        <div className="lg:col-span-8 relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 p-6 md:p-10 flex flex-col justify-between shadow-xl bg-white dark:bg-[#0F172A] min-h-[460px] group transition-colors">
          
          {/* Automatic slide changer backdrop */}
          {brand.heroSlides.map((slide, sIdx) => (
            <div 
              key={sIdx}
              style={{ backgroundImage: `url(${slide.url})` }}
              className={`absolute inset-0 bg-cover bg-center transition-all duration-[1200ms] ${
                sIdx === activeSlide 
                  ? 'opacity-35 dark:opacity-25 scale-100' 
                  : 'opacity-0 scale-105 pointer-events-none'
              }`}
            />
          ))}
          
          {/* Contrast overlay gradient for Day and Night */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/40 dark:from-slate-950/95 dark:via-slate-950/85 dark:to-transparent z-10" />

          {/* Content Elements */}
          <div className="relative z-20 space-y-6 max-w-2xl my-auto">
            <div>
              <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-blue-400 rounded-full text-xs font-black tracking-wider border border-blue-200 dark:border-blue-500/30 shadow-sm">
                {brand.homeWelcomeBadge}
              </span>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.15] font-display tracking-tight drop-shadow-sm">
              {brand.heroTitle}
            </h2>
            
            <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base leading-relaxed font-semibold">
              {brand.heroSubtitle}
            </p>

            <div className="flex flex-wrap gap-3.5 pt-2">
              <button 
                type="button"
                onClick={() => onNavigate('register')}
                className="bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-blue-900/30 transition-all duration-150 cursor-pointer flex items-center gap-2"
              >
                <span>{brand.ctaRegister}</span>
                <ArrowRight size={16} />
              </button>
              
              <button 
                type="button"
                onClick={() => onNavigate('login')}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/85 hover:scale-[1.02] active:scale-[0.98] text-slate-900 dark:text-slate-100 font-bold border border-slate-300 dark:border-slate-700 px-6 py-3 rounded-2xl transition-all duration-150 shadow-sm cursor-pointer"
              >
                {brand.ctaLogin}
              </button>
            </div>
          </div>

          {/* Slide Indicator Dots */}
          {brand.heroSlides.length > 1 && (
            <div className="relative z-20 flex items-center gap-2 pt-4">
              {brand.heroSlides.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  type="button"
                  onClick={() => setActiveSlide(dotIdx)}
                  aria-label={`Slide ${dotIdx + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    dotIdx === activeSlide 
                      ? 'w-6 bg-blue-600 dark:bg-blue-400' 
                      : 'w-1.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Professional Teacher / Director Branding (Bento Accent Card) */}
        <div 
          style={{
            backgroundColor: brand.themeColors.bentoCardBg,
            backgroundImage: brand.themeColors.directorGradient
          }}
          className={`lg:col-span-4 rounded-3xl ${brand.themeColors.directorCardBorder} border-2 p-8 flex flex-col justify-between text-center relative shadow-2xl overflow-hidden group text-white`}
        >
          {/* Abstract Glowing Shape */}
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/15 transition-all pointer-events-none" />
          
          <div className="absolute top-4 right-4 text-[10px] tracking-widest font-mono uppercase bg-blue-950/80 text-blue-100 border border-blue-300/40 px-2.5 py-1 rounded font-bold shadow-sm">
            {brand.directorRoleBadge}
          </div>

          {/* Director Graphic / Photo with 3D Rotate Effect */}
          <div className="my-6">
            <div className="relative w-40 h-40 mx-auto bg-white p-1.5 rounded-2xl shadow-2xl rotate-3 transform group-hover:rotate-0 group-hover:scale-105 transition-all duration-300">
              <div className="w-full h-full rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center relative">
                {brand.directorImage && brand.directorImage.trim() !== '' ? (
                  <img 
                    src={brand.directorImage} 
                    className="w-full h-full object-cover relative z-10" 
                    alt={brand.directorName} 
                    onError={(e) => {
                      // Fallback if image not found
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 to-sky-400/30 mix-blend-multiply" />
                    <User size={64} className="text-blue-900 relative z-10" />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 z-10">
            <h3 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
              {brand.directorName}
            </h3>
            <p className="text-xs text-blue-100 font-mono tracking-widest uppercase font-bold drop-shadow-sm">
              {brand.directorTitle}
            </p>
          </div>

          {/* Advice / Quote Box */}
          <div 
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)', color: '#ffffff' }}
            className="bg-slate-900/95 dark:bg-slate-950/90 border border-blue-300/40 rounded-2xl p-4 mt-6 text-left relative z-10 shadow-xl"
          >
            <span 
              style={{ backgroundColor: brand.themeColors.badgeBg, color: '#ffffff' }}
              className="absolute -top-3 left-4 border border-blue-300/60 p-0.5 px-2.5 font-mono text-[9px] !text-white font-black uppercase tracking-wider rounded-md shadow-md"
            >
              {lang === 'si' ? 'ගුරු උපදෙස්' : 'Advice & Quote'}
            </span>
            <p 
              style={{ color: '#ffffff' }}
              className="!text-white text-sm italic font-sans leading-relaxed py-1 drop-shadow-md font-semibold"
            >
              "{brand.directorQuote}"
            </p>
          </div>

          <div className="pt-6 border-t border-blue-400/30 text-xs text-blue-100 justify-center flex items-center gap-1.5 z-10 font-bold drop-shadow-sm">
            <Award size={14} className="text-amber-300 shrink-0" /> 
            <span>{brand.directorModuleNotice}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          FEATURE CARDS SECTION (Bento Grid Style)
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {brand.featureCards.map((card) => {
          const cardTitle = card.title[lang] || card.title.si;
          const cardDesc = card.desc[lang] || card.desc.si;

          return (
            <div 
              key={card.id}
              className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-3xl p-6 space-y-3 group hover:border-blue-500/50 transition-all shadow-md"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/25 transition-all">
                {renderCardIcon(card.iconType)}
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                {cardTitle}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                {cardDesc}
              </p>
            </div>
          );
        })}
      </div>

    </div>
  );
}
