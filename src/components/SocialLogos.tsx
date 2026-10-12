import React from 'react';

// Exact authentic brand logos matching the uploaded reference images:
// 1. WhatsApp official chat icon (green speech bubble with phone handset)
// 2. Direct Call / Phone (green circular phone icon)
// 3. Telegram (blue circular paper plane)
// 4. YouTube (red rounded rectangle with play triangle)
// 5. Facebook (blue rounded square with white 'f')
// 6. TikTok (authentic note logo with cyan/magenta 3D shift)
// 7. Website / WWW (navy globe with WWW pill base)
// 8. Instagram & X / Twitter official logos

export function WhatsAppLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 448 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#25D366"
        d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"
      />
    </svg>
  );
}

export function PhoneCallLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="256" cy="256" r="256" fill="#1BB934" />
      <path
        fill="#FFFFFF"
        d="M362.7 321.4c-12.1-12.1-28.2-18.8-45.3-18.8-17.1 0-33.2 6.7-45.3 18.8l-15.5 15.5c-34.9-20.2-63.5-48.8-83.7-83.7l15.5-15.5c25-25 25-65.7 0-90.7l-35.8-35.8c-25-25-65.7-25-90.7 0l-16.7 16.7c-21.7 21.7-28.7 54-18.2 83.7 29.5 83.3 94.2 148 177.5 177.5 29.7 10.5 62 3.5 83.7-18.2l16.7-16.7c12.1-12.1 18.8-28.2 18.8-45.3s-6.7-33.2-18.8-45.3l-7.1-7.6z"
      />
    </svg>
  );
}

export function TelegramLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="120" cy="120" r="120" fill="#29B6F6" />
      <path
        fill="#FFFFFF"
        d="M98 175c-3.9 0-3.2-1.5-4.6-5.3L79.5 124 168 73l-105 60.5L98 175zm18.3 0c3 0 4.3-1.4 6-3l16.3-15.8-20.4-12.3L116.3 175zm50.6-96.8c1.6-7.8-3-10.4-9.8-7.9L40.7 114c-7.4 2.9-7.2 7 1.2 9.6l29.4 9.2 68.2-43c3.2-2 6.2-.9 3.8 1.2l-55.2 49.8 2.2 31.7c3.1 0 4.4-1.4 6.2-3.1l14.9-14.4 31 22.8c5.7 3.2 9.8 1.5 11.2-5.3l20.4-95.9z"
      />
    </svg>
  );
}

export function YouTubeLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#FF0000"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
      />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function FacebookLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="100" fill="url(#fb-grad)" />
      <path
        fill="#FFFFFF"
        d="M355.6 275l10.4-67.9h-65.2V163c0-18.6 9.1-36.8 38.4-36.8h29.7V68.5s-26.9-4.6-52.7-4.6c-53.8 0-89 32.6-89 91.6v51.6h-59.6V275h59.6v164h78.8V275h49.6z"
      />
      <defs>
        <linearGradient id="fb-grad" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#18ACFE" />
          <stop offset="1" stopColor="#0165E1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TikTokLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 448 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#25F4EE"
        d="M440.5 153.6A111.4 111.4 0 0 1 336 88V32h-64v296a64 64 0 1 1-64-64c7.6 0 14.8 1.4 21.6 3.8v-67A128 128 0 1 0 336 328V197.6c34.7 24.8 77 39.4 122.5 40v-64c-6.1 0-12.2-1.3-18-4z"
      />
      <path
        fill="#FE2C55"
        d="M448 147.6A111.4 111.4 0 0 1 343.5 82V26h-64v296a64 64 0 1 1-64-64c7.6 0 14.8 1.4 21.6 3.8v-67A128 128 0 1 0 343.5 322V191.6c34.7 24.8 77 39.4 122.5 40v-64c-6.1 0-12.2-1.3-18-4z"
        opacity="0.85"
      />
      <path
        fill="#000000"
        d="M444.3 150.6A111.4 111.4 0 0 1 339.8 85V29h-64v296a64 64 0 1 1-64-64c7.6 0 14.8 1.4 21.6 3.8v-67A128 128 0 1 0 339.8 325V194.6c34.7 24.8 77 39.4 122.5 40v-64c-6.1 0-12.2-1.3-18-4z"
      />
    </svg>
  );
}

export function WebsiteLogo({ className = 'w-6 h-6' }: { className?: string }) {
  // Matching user's exact uploaded 149441737_dc143b1c-4789-430a-bdbd-b50289d8c553.jpg (Globe with WWW base pill)
  return (
    <svg className={className} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="256" cy="220" r="170" stroke="#005B88" strokeWidth="26" fill="none" />
      <ellipse cx="256" cy="220" rx="75" ry="170" stroke="#005B88" strokeWidth="24" fill="none" />
      <line x1="88" y1="220" x2="424" y2="220" stroke="#005B88" strokeWidth="24" />
      <line x1="120" y1="140" x2="392" y2="140" stroke="#005B88" strokeWidth="22" />
      <line x1="120" y1="300" x2="392" y2="300" stroke="#005B88" strokeWidth="22" />
      <rect x="80" y="340" width="352" height="110" rx="55" fill="#003B6D" />
      <text
        x="256"
        y="420"
        fill="#FFFFFF"
        fontSize="68"
        fontFamily="sans-serif"
        fontWeight="bold"
        textAnchor="middle"
      >
        WWW
      </text>
    </svg>
  );
}

export function InstagramLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 448 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ig-grad" cx="20%" cy="100%" r="130%">
          <stop offset="0%" stopColor="#ffda77" />
          <stop offset="25%" stopColor="#fca048" />
          <stop offset="50%" stopColor="#e1306c" />
          <stop offset="80%" stopColor="#c13584" />
          <stop offset="100%" stopColor="#833ab4" />
        </radialGradient>
      </defs>
      <rect width="448" height="448" y="32" rx="110" fill="url(#ig-grad)" />
      <path
        fill="#FFFFFF"
        d="M224 144c-53 0-96 43-96 96s43 96 96 96 96-43 96-96-43-96-96-96zm0 159c-34.8 0-63-28.2-63-63s28.2-63 63-63 63 28.2 63 63-28.2 63-63 63zm122.5-167.3c0 12.6-10.2 22.8-22.8 22.8-12.6 0-22.8-10.2-22.8-22.8 0-12.6 10.2-22.8 22.8-22.8 12.6 0 22.8 10.2 22.8 22.8zm59.2 23.3c-2.4-50.6-33.8-82-84.4-84.4-20.1-.9-80.4-.9-100.5 0-50.5 2.4-82 33.8-84.4 84.4-.9 20.1-.9 80.4 0 100.5 2.4 50.6 33.8 82 84.4 84.4 20.1.9 80.4.9 100.5 0 50.6-2.4 82-33.8 84.4-84.4.9-20.1.9-80.4 0-100.5zm-38.3 162.7c-8.2 20.7-24.1 36.6-44.8 44.8-19.3 7.7-65.1 5.9-98.6 5.9s-79.3 1.8-98.6-5.9c-20.7-8.2-36.6-24.1-44.8-44.8-7.7-19.3-5.9-65.1-5.9-98.6s-1.8-79.3 5.9-98.6c8.2-20.7 24.1-36.6 44.8-44.8 19.3-7.7 65.1-5.9 98.6-5.9s79.3-1.8 98.6 5.9c20.7 8.2 36.6 24.1 44.8 44.8 7.7 19.3 5.9 65.1 5.9 98.6s1.8 79.3-5.9 98.6z"
      />
    </svg>
  );
}

export function TwitterXLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="100" fill="#000000" />
      <path
        fill="#FFFFFF"
        d="M389.2 120h53.1L326.4 252.7 463 432H356.1l-83.7-109.4L176.4 432H123.2l123-140.6L115 120h109.6l75.8 100.2L389.2 120zm-18.6 280.2h29.4L206.8 150.2h-31.6l195.4 250z"
      />
    </svg>
  );
}

export function renderRealSocialLogo(platform: string, className = 'w-6 h-6') {
  const p = (platform || '').toLowerCase().trim();
  switch (p) {
    case 'whatsapp':
      return <WhatsAppLogo className={className} />;
    case 'call':
    case 'phone':
    case 'hotline':
      return <PhoneCallLogo className={className} />;
    case 'telegram':
      return <TelegramLogo className={className} />;
    case 'youtube':
      return <YouTubeLogo className={className} />;
    case 'facebook':
      return <FacebookLogo className={className} />;
    case 'tiktok':
      return <TikTokLogo className={className} />;
    case 'instagram':
      return <InstagramLogo className={className} />;
    case 'twitter':
    case 'x':
      return <TwitterXLogo className={className} />;
    case 'website':
    case 'web':
    default:
      return <WebsiteLogo className={className} />;
  }
}
