/**
 * ==============================================================================
 * 🏛️ WEBSITE BRANDING, COMPANY IDENTITY & HOME PAGE CONFIGURATION
 * ==============================================================================
 * 
 * මෙම ෆයිල් එක මගින් මෙම වෙබ් අඩවියේ ප්‍රධාන නම, ටැග්ලයින්, හෝම් පේජ් එකේ සියලුම ටෙක්ස්ට්,
 * ඡායාරූප, ගුරු/දේශක තොරතුරු, දුරකථන අංක සහ ඩිසයින් වෙනත් ආයතනයකට හෝ කම්පැණියකට 
 * ක්ෂණිකව මාරු කිරීමට (White-Labeling / Rebranding) පහසුකම් සලසයි.
 * 
 * 💡 වෙනත් ආයතනයකට මෙම ප්‍රොජෙක්ට් එක ලබා දීමේදී වෙනස් කළ යුතු තැන්:
 * 1. brandName: ආයතනයේ / පන්තියේ ප්‍රධාන නම (උදා: "Smart Physics", "Apex Science Academy")
 * 2. directorName: ප්‍රධාන ගුරුතුමාගේ / දේශකයාගේ නම
 * 3. tagline: ප්‍රධාන සටන් පාඨය / පාඨමාලා විස්තරය
 * 4. supportHotline / supportWhatsAppNumber: සම්බන්ධීකරණ දුරකථන අංක
 * 5. heroSlides: හෝම් පේජ් එකේ පසුබිමේ මාරු වන ඡායාරූප
 * 6. featureCards: හෝම් පේජ් එකේ ඇති කාඩ්පත් වල නම් හා විස්තර
 * ==============================================================================
 */

export interface BrandLanguageText {
  si: string;
  en: string;
}

export interface HeroSlide {
  url: string;
  label: string;
}

export interface FeatureCardConfig {
  id: string;
  iconType: 'globe' | 'unlock' | 'award' | 'book' | 'video' | 'file';
  title: BrandLanguageText;
  desc: BrandLanguageText;
  accentColor?: string;
}

export interface SiteBrandConfiguration {
  // 1. ප්‍රධාන ආයතන / වෙබ් අඩවි නාමය
  brandName: string;
  brandSymbol: string; // Logo එකක් නොමැති විට පෙන්වන අකුර හෝ සංකේතය (උදා: "Ω", "S", "A")
  logoUrl: string; // Logo image link (හිස් නම් brandSymbol පෙන්වයි)
  faviconUrl: string;

  // 2. ප්‍රධාන දේශකයා / අධ්‍යක්ෂකවරයාගේ තොරතුරු
  directorName: BrandLanguageText;
  directorTitle: BrandLanguageText;
  directorImage: string; // ඡායාරූපයේ Link එක (උදා: "/teacher.png")
  directorRoleBadge: BrandLanguageText;
  directorQuote: BrandLanguageText;
  directorModuleNotice: BrandLanguageText;

  // 3. හෝම් පේජ් Hero බැනරය සහ සටන් පාඨ
  homeWelcomeBadge: BrandLanguageText;
  heroTitle: BrandLanguageText;
  heroSubtitle: BrandLanguageText;
  ctaRegister: BrandLanguageText;
  ctaLogin: BrandLanguageText;

  // 4. හෝම් පේජ් පසුබිම් ස්ලයිඩර් ඡායාරූප
  heroSlides: HeroSlide[];

  // 5. හෝම් පේජ් විශේෂාංග කාඩ්පත් (Bento Feature Cards)
  featureCards: FeatureCardConfig[];

  // 6. පාරිභෝගික සහාය හා දුරකථන අංක
  supportTeamName: string;
  supportCallingPhone: string;
  supportHotline: string;
  supportWhatsAppNumber: string; // 9477xxxxxxx ජාත්‍යන්තර ආකෘතියෙන්
  supportWhatsAppDisplay: string; // දේශීය ආකෘතියෙන්
  footerPoweredBy: string;

  // 7. ඩිසයින් සහ තේමා වර්ණ (Design Theme Accents)
  themeColors: {
    primaryColorHex: string; // ප්‍රධාන වර්ණය (#2563eb, #059669, #7c3aed, etc.)
    directorGradient: string; // දේශක කාඩ්පතේ Gradient එක
    directorCardBorder: string;
    bentoCardBg: string;
    badgeBg: string;
  };
}

/**
 * ⚡ පෙරනිමි වෙබ් අඩවි සන්නාම සැකසුම් (Default Site Brand Settings)
 * මෙම අගයන් සංස්කරණය කිරීමෙන් මුළු වෙබ් අඩවියම ක්ෂණිකව වෙනස් වේ.
 */
export const SITE_BRAND_CONFIG: SiteBrandConfiguration = {
  // 1. ආයතන නාමය
  brandName: "Smart Physics",
  brandSymbol: "Ω",
  logoUrl: "/logo.png",
  faviconUrl: "/favicon.ico.png",

  // 2. දේශක / ගුරු තොරතුරු
  directorName: {
    si: "තාරක අමරසිංහ",
    en: "Tharaka Amarasinghe"
  },
  directorTitle: {
    si: "B.Sc (Hon's) පේරාදෙණිය විශ්වවිද්‍යාලය | භෞතික විද්‍යා දේශක",
    en: "B.Sc (Hon's) University of Peradeniya | Physics Teacher"
  },
  directorImage: "/teacher.png",
  directorRoleBadge: {
    si: "ප්‍රධාන දේශක",
    en: "Director Core"
  },
  directorQuote: {
    si: "භෞතික විද්‍යාව යනු කටපාඩම් කිරීමක් නොව, විශ්වයේ රහස්‍ය ස්වභාවය අවබෝධ කරගැනීමේ සුන්දර ගමනකි.",
    en: "Physics is not mere memorization; it is a fascinating journey of understanding how the universe works."
  },
  directorModuleNotice: {
    si: "වෘත්තීය භෞතික විද්‍යා අධ්‍යයන ඒකක",
    en: "Professional physics learning modules"
  },

  // 3. Hero බැනරය
  homeWelcomeBadge: {
    si: "Welcome to Tharaka Physics Online Space",
    en: "Welcome to Smart Physics Learning Hub"
  },
  heroTitle: {
    si: "තාරක අමරසිංහ",
    en: "Tharaka Amarasinghe"
  },
  heroSubtitle: {
    si: "දිවයිනේ ප්‍රමුඛතම භෞතික විද්‍යා පන්ති",
    en: "Island's Leading Advanced Physics Classes"
  },
  ctaRegister: {
    si: "නව සිසු ලියාපදිංචිය (Register)",
    en: "New Student Registration"
  },
  ctaLogin: {
    si: "සිසු පිවිසුම (Login)",
    en: "Student Login"
  },

  // 4. හෝම් පේජ් ස්ලයිඩර් ඡායාරූප
  heroSlides: [
    {
      url: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&w=1200&auto=format&fit=crop",
      label: "Quantum Mechanics & Atomic Space"
    },
    {
      url: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop",
      label: "Electromagnetism & Waves"
    },
    {
      url: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?q=80&w=1200&auto=format&fit=crop",
      label: "Advanced Theoretical Physics"
    },
    {
      url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop",
      label: "Astrophysics & Relativity"
    }
  ],

  // 5. හෝම් පේජ් විශේෂාංග කාඩ්පත්
  featureCards: [
    {
      id: "free_resources",
      iconType: "globe",
      title: {
        si: "නොමිලේ සම්පත් (Free Resources)",
        en: "Free Resources Hub"
      },
      desc: {
        si: "නොමිලේ ලබාදෙන සම්මන්ත්‍රණ, වීඩියෝ දර්ශන, ක්‍රියාකාරී ඇලර්ට් සහ අනුමාන ප්‍රශ්න පත්‍ර ඕනෑම අයෙකුට පහසුවෙන් ලබා ගත හැක.",
        en: "Free seminar sessions, video walkthroughs, active broadcast alerts and model papers accessible to any student."
      },
      accentColor: "blue"
    },
    {
      id: "paid_portal",
      iconType: "unlock",
      title: {
        si: "ගෙවීම් කළ සිසු සම්පත් (Paid Portal Resources)",
        en: "Paid Portal Resources"
      },
      desc: {
        si: "සක්‍රීය සිසුන්ට අදාළ මාසයේ සජීවී දේශන සබැඳි, සවිස්තරාත්මක නිබන්ධන පත්‍රිකා සහ සියලුම පටිගත කළ පාඩම් ලිපිගොනු ඇතුළත් වේ.",
        en: "Active enrolled students access live stream classes, comprehensive tutorial papers, and complete recorded video vaults."
      },
      accentColor: "blue"
    }
  ],

  // 6. පාරිභෝගික සහාය හා අමතන අංක
  supportTeamName: "Smart Physics Support Team",
  supportCallingPhone: "0779630100",
  supportHotline: "0779630100",
  supportWhatsAppNumber: "94779630100",
  supportWhatsAppDisplay: "0779630100",
  footerPoweredBy: "🏛️ Powered by Amarasinghe Digital",

  // 7. තේමා වර්ණ සහ ශෛලිය (Styles)
  themeColors: {
    primaryColorHex: "#2563eb",
    directorGradient: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 50%, #312e81 100%)",
    directorCardBorder: "border-blue-400/40",
    bentoCardBg: "#1d4ed8",
    badgeBg: "#1e3a8a"
  }
};

/**
 * 🛠️ Helper function to merge database config overrides (if any) with the static branding configuration.
 * This guarantees that even if database values exist, fallback values seamlessly load from SITE_BRAND_CONFIG.
 */
export function getMergedSiteConfig(dbConfig?: any, lang: 'si' | 'en' = 'si') {
  const base = SITE_BRAND_CONFIG;

  return {
    brandName: dbConfig?.brandName || base.brandName,
    brandSymbol: dbConfig?.brandSymbol || base.brandSymbol,
    logoUrl: dbConfig?.logoUrl || base.logoUrl,
    faviconUrl: dbConfig?.faviconUrl || base.faviconUrl,

    directorName: dbConfig?.directorName || base.directorName[lang] || base.directorName.si,
    directorTitle: dbConfig?.directorTitle || base.directorTitle[lang] || base.directorTitle.si,
    directorImage: dbConfig?.directorImage || base.directorImage,
    directorRoleBadge: base.directorRoleBadge[lang] || base.directorRoleBadge.si,
    directorQuote: dbConfig?.directorQuote || base.directorQuote[lang] || base.directorQuote.si,
    directorModuleNotice: base.directorModuleNotice[lang] || base.directorModuleNotice.si,

    homeWelcomeBadge: dbConfig?.homeWelcomeBadge || base.homeWelcomeBadge[lang] || base.homeWelcomeBadge.si,
    heroTitle: dbConfig?.heroTitle || base.heroTitle[lang] || base.heroTitle.si,
    heroSubtitle: dbConfig?.heroSubtitle || base.heroSubtitle[lang] || base.heroSubtitle.si,
    ctaRegister: base.ctaRegister[lang] || base.ctaRegister.si,
    ctaLogin: base.ctaLogin[lang] || base.ctaLogin.si,

    heroSlides: (dbConfig?.heroImage1) ? [
      { url: dbConfig.heroImage1, label: "Slide 1" },
      { url: dbConfig.heroImage2 || base.heroSlides[1]?.url, label: "Slide 2" },
      { url: dbConfig.heroImage3 || base.heroSlides[2]?.url, label: "Slide 3" },
      { url: dbConfig.heroImage4 || base.heroSlides[3]?.url, label: "Slide 4" }
    ] : base.heroSlides,

    featureCards: base.featureCards,

    supportTeamName: dbConfig?.supportTeamName || base.supportTeamName,
    supportCallingPhone: dbConfig?.contactPhone || base.supportCallingPhone,
    supportHotline: dbConfig?.supportHotline || base.supportHotline,
    supportWhatsAppNumber: dbConfig?.supportWhatsAppNumber || base.supportWhatsAppNumber,
    supportWhatsAppDisplay: dbConfig?.supportWhatsAppDisplay || base.supportWhatsAppDisplay,
    footerPoweredBy: dbConfig?.footerPoweredBy || base.footerPoweredBy,

    themeColors: base.themeColors
  };
}
