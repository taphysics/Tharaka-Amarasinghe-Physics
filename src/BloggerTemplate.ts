export const BLOGGER_TEMPLATE_CODE = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://google.com/2005/gml/b' xmlns:data='http://google.com/2005/gml/data' xmlns:expr='http://google.com/2005/gml/expr'>
<head>
  <meta charset='UTF-8' />
  <meta content='width=device-width, initial-scale=1.0' name='viewport' />
  <title>Taraka Amarasinghe | Physics Online Hub</title>
  
  <!-- Blogger Essential Skin -->
  <b:skin><![CDATA[
    /* 
    * Taraka Amarasinghe - Physics Online Learning Hub
    * Standard Blogger XHTML Skin
    */
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #0f172a; /* Slate 900 */
      color: #f1f5f9; /* Slate 100 */
    }
  ]]></b:skin>

  <!-- Google Fonts & Tailwind CSS Import -->
  <link href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap' rel='stylesheet' />
  
  <style>
    /* Styling System - CSS fallback variables and modern layout */
    :root {
      --primary: #8b5cf6; /* Violet 500 */
      --primary-hover: #7c3aed; /* Violet 600 */
      --secondary: #475569; /* Slate 600 */
      --danger: #ef4444; /* Red 500 */
      --warning: #f59e0b; /* Amber 500 */
      --success: #10b981; /* Emerald 500 */
      --bg-dark: #0f172a; /* Slate 900 */
      --card-bg: #1e293b; /* Slate 800 */
      --border: #334155; /* Slate 700 */
    }

    * {
      box-sizing: border-box;
      scroll-behavior: smooth;
    }

    body {
      background-color: var(--bg-dark);
      color: #f8fafc;
      overflow-x: hidden;
    }

    /* Top Navigation bar */
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background-color: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo-circle {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, var(--primary), #ec4899);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 1.25rem;
      font-family: 'Space Grotesk', sans-serif;
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
    }

    .brand-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.3rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.1;
    }

    .brand-subtitle {
      font-size: 0.8rem;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }

    .nav {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .nav-btn {
      padding: 0.55rem 1.1rem;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      background: transparent;
      border: 1px solid transparent;
      color: #94a3b8;
    }

    .nav-btn:hover {
      color: #ffffff;
      background-color: rgba(255, 255, 255, 0.05);
    }

    .nav-btn.active {
      color: #ffffff;
      background-color: rgba(139, 92, 246, 0.15);
      border-color: rgba(139, 92, 246, 0.3);
    }

    .nav-btn.primary {
      background-color: var(--primary);
      color: white;
      border: none;
    }

    .nav-btn.primary:hover {
      background-color: var(--primary-hover);
      transform: translateY(-1px);
    }

    .nav-btn.admin-toggle {
      border: 1px dashed rgba(245, 158, 11, 0.4);
      color: var(--warning);
    }

    .nav-btn.admin-toggle:hover {
      background-color: rgba(245, 158, 11, 0.1);
      color: #ffffff;
    }

    /* Views Framework */
    .view {
      display: none;
      min-height: calc(100vh - 80px);
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      animation: fadeIn 0.4s ease forwards;
    }

    .view.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Hero Section with slider background */
    .hero {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 2.5rem;
      margin-bottom: 3rem;
      align-items: center;
    }

    @media (max-width: 968px) {
      .hero {
        grid-template-columns: 1fr;
      }
    }

    /* Left Side: Dynamic Animated Slider */
    .hero-slides-container {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      min-height: 480px;
      display: flex;
      align-items: center;
      padding: 3rem;
      border: 1px solid var(--border);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    /* Individual sliding backdrops */
    .hero-bg-slide {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      transition: opacity 1.2s ease-in-out;
      opacity: 0;
      z-index: 1;
    }

    .hero-bg-slide.active {
      opacity: 0.35; /* Darkened slide image */
    }

    .hero-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 20%, rgba(15, 23, 42, 0.6) 100%);
      z-index: 2;
    }

    .hero-copy {
      position: relative;
      z-index: 3;
      max-width: 100%;
    }

    .eyebrow {
      display: inline-block;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--primary);
      font-weight: 600;
      margin-bottom: 1rem;
      background-color: rgba(139, 92, 246, 0.1);
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      border: 1px solid rgba(139, 92, 246, 0.2);
    }

    .hero-copy h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 2.5rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      margin-bottom: 1.5rem;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }

    .hero-copy p {
      font-size: 1.05rem;
      color: #cbd5e1;
      margin-bottom: 2rem;
      line-height: 1.6;
    }

    .cta-row {
      display: flex;
      gap: 15px;
      margin-bottom: 2.5rem;
    }

    .cta {
      padding: 0.85rem 1.8rem;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      border: none;
    }

    .cta.primary {
      background: linear-gradient(135deg, var(--primary), #7c3aed);
      color: white;
      box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
    }

    .cta.primary:hover {
      box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
      transform: translateY(-2px);
    }

    .cta.secondary {
      background-color: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .cta.secondary:hover {
      background-color: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      border-top: 1px solid rgba(255,255,255,0.1);
      padding-top: 1.5rem;
    }

    .stats div strong {
      display: block;
      font-size: 1.3rem;
      color: #ffffff;
      font-family: 'Space Grotesk', sans-serif;
    }

    .stats div span {
      font-size: 0.8rem;
      color: #94a3b8;
    }

    /* Right Side: Professional Teacher Branding */
    .hero-panel {
      background: linear-gradient(180deg, var(--card-bg) 0%, #111827 100%);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      position: relative;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }

    .panel-badge {
      position: absolute;
      top: 15px;
      right: 15px;
      font-size: 0.75rem;
      background-color: rgba(236, 72, 153, 0.1);
      color: #ec4899;
      padding: 0.25rem 0.6rem;
      border-radius: 12px;
      font-weight: 500;
      border: 1px solid rgba(236, 72, 153, 0.2);
    }

    .teacher-portrait-area {
      width: 150px;
      height: 150px;
      margin: 1.5rem auto 1rem auto;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), #ec4899);
      padding: 4px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.4);
    }

    .teacher-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      background-color: #1e293b;
    }

    .teacher-name {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.2rem;
    }

    .teacher-title {
      font-size: 0.85rem;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }

    .teacher-quote-box {
      background-color: rgba(255, 255, 255, 0.03);
      border-left: 3px solid var(--primary);
      padding: 1rem;
      border-radius: 0 8px 8px 0;
      text-align: left;
      margin-top: 1rem;
    }

    .teacher-quote {
      font-style: italic;
      font-size: 0.95rem;
      color: #e2e8f0;
      line-height: 1.5;
    }

    /* Grid and Feature Cards */
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    @media (max-width: 768px) {
      .feature-grid {
        grid-template-columns: 1fr;
      }
    }

    .feature-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .feature-card:hover {
      transform: translateY(-3px);
      border-color: rgba(139, 92, 246, 0.4);
    }

    .feature-card h3 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.2rem;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 0.75rem;
    }

    .feature-card p {
      font-size: 0.9rem;
      color: #94a3b8;
      line-height: 1.5;
    }

    .highlight-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      padding: 1.5rem 2rem;
      border-radius: 12px;
      margin-top: 2rem;
    }

    @media (max-width: 640px) {
      .highlight-banner {
        flex-direction: column;
        gap: 15px;
        text-align: center;
      }
    }

    .highlight-banner h2 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.3rem;
      font-weight: 600;
      color: white;
      margin: 0 0 5px 0;
    }

    .highlight-banner p {
      font-size: 0.9rem;
      color: #cbd5e1;
      margin: 0;
    }

    .mini-btn {
      background-color: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .mini-btn:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }

    /* Input & Selection Coloring Overrides */
    select, input, textarea {
      color: #ffffff !important;
      background-color: #1e293b !important;
      border: 1px solid var(--border) !important;
    }

    select option {
      color: #000000 !important; /* Explicit black option text */
      background-color: #ffffff !important;
    }

    /* Red Validation Indicators */
    .form-group.invalid {
      animation: shake 0.4s ease;
    }

    .form-group.invalid label {
      color: var(--danger) !important;
    }

    .form-group.invalid input, .form-group.invalid select {
      border-color: var(--danger) !important;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    /* Registration View */
    .register-form {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      padding: 2rem;
      border-radius: 12px;
      margin-top: 1.5rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
    }

    @media (max-width: 768px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 0.9rem;
      font-weight: 500;
      color: #cbd5e1;
    }

    .form-group input, .form-group select {
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.95rem;
      width: 100%;
      outline: none;
    }

    .form-group input:focus, .form-group select:focus {
      border-color: var(--primary) !important;
      box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
    }

    .check-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .check-stack label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
      color: #e2e8f0;
      cursor: pointer;
    }

    .check-stack input[type="checkbox"] {
      width: auto !important;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 15px;
      margin-top: 2rem;
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }

    /* Auth views */
    .auth-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 3rem 1rem;
    }

    .auth-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }

    .auth-card h2 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
      color: white;
    }

    .auth-card p {
      font-size: 0.9rem;
      color: #94a3b8;
      margin-bottom: 1.5rem;
    }

    .full {
      width: 100%;
    }

    .link-btn {
      background: transparent;
      border: none;
      color: var(--primary);
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      margin-top: 1rem;
      display: block;
      text-align: center;
    }

    .link-btn:hover {
      text-decoration: underline;
    }

    /* Dashboard & Profile style */
    .dashboard {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 2rem;
    }

    @media (max-width: 868px) {
      .dashboard {
        grid-template-columns: 1fr;
      }
    }

    .profile-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      align-self: flex-start;
      text-align: center;
    }

    .profile-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.5rem;
    }

    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), #ec4899);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 1.8rem;
      font-family: 'Space Grotesk', sans-serif;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
    }

    .avatar:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
    }

    .profile-details {
      border-top: 1px solid var(--border);
      margin-top: 1.5rem;
      padding-top: 1rem;
      text-align: left;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      margin-bottom: 0.6rem;
    }

    .detail-label {
      color: #94a3b8;
    }

    .detail-val {
      color: #f1f5f9;
      font-weight: 500;
    }

    .dashboard-main {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Payment Reminder banner */
    .payment-reminder {
      background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
      color: #0f172a;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }

    .payment-reminder p {
      margin: 4px 0 0 0;
      color: #1e293b;
    }

    .status-strip {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .status-pill {
      background-color: rgba(16, 185, 129, 0.15);
      color: #10b981;
      padding: 0.4rem 0.8rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .status-pill.soft {
      background-color: var(--card-bg);
      color: #94a3b8;
      border-color: var(--border);
    }

    /* Premium interactive portal buttons */
    .premium-portal-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }

    @media (max-width: 640px) {
      .premium-portal-row {
        grid-template-columns: 1fr;
      }
    }

    .portal-link-btn {
      position: relative;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.7rem 1.2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
      text-decoration: none;
    }

    /* Gradient Glowing Borders */
    .portal-link-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      transition: all 0.3s ease;
    }

    .portal-link-btn.btn-live::before { background: linear-gradient(90deg, #ec4899, #f43f5e); }
    .portal-link-btn.btn-papers::before { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
    .portal-link-btn.btn-rec::before { background: linear-gradient(90deg, #8b5cf6, #d946ef); }

    .portal-link-btn:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.5);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .portal-link-btn:hover.btn-live { box-shadow: 0 10px 25px rgba(236, 72, 153, 0.2); }
    .portal-link-btn:hover.btn-papers { box-shadow: 0 10px 25px rgba(59, 130, 246, 0.2); }
    .portal-link-btn:hover.btn-rec { box-shadow: 0 10px 25px rgba(139, 92, 246, 0.2); }

    .portal-btn-icon {
      width: 50px;
      height: 50px;
      border-radius: 10px;
      margin-bottom: 1rem;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 1.5rem;
      background-color: rgba(255, 255, 255, 0.05);
      transition: transform 0.3s ease;
    }

    .portal-link-btn:hover .portal-btn-icon {
      transform: scale(1.1) rotate(5deg);
    }

    .portal-btn-title {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 1.1rem;
      color: #ffffff;
      margin-bottom: 0.3rem;
    }

    .portal-btn-desc {
      font-size: 0.75rem;
      color: #64748b;
    }

    .portal-btn-sticker {
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: var(--primary);
      color: white;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Interactive Calendar Area */
    .calendar-widget {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
    }

    .calendar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 5px;
      text-align: center;
    }

    .calendar-day-header {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      padding: 5px 0;
      text-transform: uppercase;
    }

    .calendar-cell {
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      font-size: 0.9rem;
      border-radius: 6px;
      background-color: rgba(255,255,255,0.02);
      border: 1px solid transparent;
      cursor: default;
      position: relative;
    }

    .calendar-cell.inactive {
      opacity: 0.3;
    }

    .calendar-cell.highlight-class {
      background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05));
      border: 1px solid rgba(139, 92, 246, 0.4);
      color: #ffffff;
      cursor: pointer;
      animation: pulse-light 3s infinite alternate;
    }

    @keyframes pulse-light {
      0% { box-shadow: 0 0 5px rgba(139, 92, 246, 0.1); }
      100% { box-shadow: 0 0 15px rgba(139, 92, 246, 0.4); }
    }

    .calendar-cell.disabled-class {
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px dashed rgba(255, 255, 255, 0.1);
      color: #475569;
      cursor: not-allowed;
    }

    .calendar-cell.cancelled-class {
      background-color: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--danger);
      color: var(--danger);
      font-weight: 600;
      cursor: pointer;
      animation: alert-ping 1s infinite alternate;
    }

    @keyframes alert-ping {
      0% { box-shadow: 0 0 1px rgba(239, 68, 68, 0.1); }
      100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }
    }

    .calendar-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background-color: var(--primary);
      position: absolute;
      bottom: 5px;
    }

    .calendar-dot.cancelled {
      background-color: var(--danger);
    }

    /* Alerts and Notification Boxes with animation */
    .announcement-box {
      background-color: var(--card-bg);
      border-left: 4px solid var(--primary);
      border-radius: 4px 8px 8px 4px;
      padding: 1.2rem;
      margin-bottom: 1rem;
      position: relative;
      animation: slideInRight 0.3s ease;
    }

    .announcement-box.private {
      border-left-color: var(--danger);
      background-color: rgba(239, 68, 68, 0.05);
    }

    .announcement-title {
      font-weight: 600;
      font-size: 1rem;
      color: #ffffff;
      margin-bottom: 0.3rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .announcement-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .announcement-content {
      font-size: 0.9rem;
      color: #cbd5e1;
      line-height: 1.4;
    }

    /* Modal dialog */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(8px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .modal-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      padding: 2rem;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      animation: modalEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes modalEnter {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }

    .close-x {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
    }

    .close-x:hover {
      color: white;
    }

    /* Admin cockpit table styling */
    .admin-cockpit {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 2rem;
      margin-top: 2rem;
    }

    .admin-tables {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.9rem;
    }

    .admin-tables th, .admin-tables td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }

    .admin-tables th {
      color: #94a3b8;
      font-weight: 500;
      background-color: rgba(255,255,255,0.02);
    }

    /* Locked overlay fallback design */
    .locked-card {
      position: relative;
    }

    .locked-card::after {
      content: '🔒 ACCESS REQUIRED';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      justify-content: center;
      align-items: center;
      font-weight: bold;
      color: var(--danger);
      font-size: 0.95rem;
      border-radius: 12px;
    }

    /* Footer structure matching specifications */
    footer {
      border-top: 1px solid var(--border);
      background-color: #0c111d;
      padding: 2.5rem 2rem;
      margin-top: 5rem;
      text-align: center;
    }

    .footer-nav {
      display: flex;
      justify-content: center;
      gap: 25px;
      margin-bottom: 1.5rem;
    }

    .footer-link {
      color: #64748b;
      text-decoration: none;
      font-size: 0.9rem;
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .footer-link:hover {
      color: #ffffff;
    }

    .footer-credits {
      color: #475569;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>

  <div id='app'>
    <!-- Header Area -->
    <header class='topbar'>
      <div class='brand'>
        <img src='/logo.png' class='brand-logo-circle' alt='Logo' style='object-fit: cover; background: white;' onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class='brand-logo-circle' style='display:none;'>Ω</div>
        <div>
          <div class='brand-title'>Taraka Amarasinghe</div>
          <div class='brand-subtitle'>Physics Online Learning Hub</div>
        </div>
      </div>
      <nav class='nav'>
        <button class='nav-btn active' id='btnHome' onclick='switchView("homeView")'>Home</button>
        <button class='nav-btn' id='btnFree' onclick='switchView("freeView")'>Free Notes</button>
        <button class='nav-btn' id='btnLogin' onclick='switchView("loginView")'>Login</button>
        <button class='nav-btn primary' id='btnRegister' onclick='switchView("registerView")'>Register</button>
        <button class='nav-btn admin-toggle' id='btnAdmin' onclick='toggleAdminView()'>Admin Cockpit</button>
      </nav>
    </header>

    <main>
      <!-- View 1: Homepage -->
      <section class='view active' id='homeView'>
        <div class='hero'>
          <!-- Left side sliding backdrop area -->
          <div class='hero-slides-container' id='heroSlider'>
            <div class='hero-bg-slide active' style='background-image: url("https://images.unsplash.com/photo-1614064641938-3bbee52942c7?q=80&amp;w=800&amp;auto=format&amp;fit=crop");'></div>
            <div class='hero-bg-slide' style='background-image: url("https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&amp;w=800&amp;auto=format&amp;fit=crop");'></div>
            <div class='hero-bg-slide' style='background-image: url("https://images.unsplash.com/photo-1507668077129-56e32842fceb?q=80&amp;w=800&amp;auto=format&amp;fit=crop");'></div>
            <div class='hero-bg-slide' style='background-image: url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&amp;w=800&amp;auto=format&amp;fit=crop");'></div>
            <div class='hero-overlay'></div>
            
            <div class='hero-copy'>
              <span class='eyebrow'>Welcome to the Physics learning space</span>
              <h1>ලස්සන, වෘත්තීයමය, සහ කළමනාකරණය කළ හැකි ඔන්ලයින් පංති පද්ධතියක්</h1>
              <p>
                Free seminars, free notes/papers, paid live classes, month-wise access, recordings, student profile panel, and auto-generated registration messages.
              </p>
              <div class='cta-row'>
                <button class='cta primary' onclick='switchView("registerView")'>New Student Registration</button>
                <button class='cta secondary' onclick='switchView("loginView")'>Login</button>
              </div>
              <div class='stats'>
                <div><strong>Free</strong><span>Seminars &amp; Notices</span></div>
                <div><strong>Paid</strong><span>Live + Recordings</span></div>
                <div><strong>Secure</strong><span>Username &amp; Password</span></div>
              </div>
            </div>
          </div>

          <!-- Right side: Teacher Portrait Section -->
          <div class='hero-panel'>
            <div class='panel-badge'>Physics (Theory &amp; Revision)</div>
            <div class='teacher-portrait-area'>
              <img src='/teacher.png' class='teacher-img' alt='Taraka Amarasinghe' onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div style='display:none; background-color:#1e293b; border-radius:50%; width:100%; height:100%; align-items:center; justify-content:center; font-family:"Space Grotesk", sans-serif; font-size:3rem; font-weight:700; color:var(--primary); box-shadow:0 0 10px rgba(0,0,0,0.5);'>TA</div>
            </div>
            <div class='teacher-name'>Taraka Amarasinghe</div>
            <div class='teacher-title'>B.Sc (Hon's) University of Peradeniya | Physics Tutor</div>
            <div class='teacher-quote-box'>
              <p class='teacher-quote'>
                "භෞතික විද්‍යාව යනු කටපාඩම් කිරීමක් නොව, විශ්වයේ රහස්‍ය ස්වභාවය අවබෝධ කරගැනීමේ සුන්දර ගමනකි."
              </p>
            </div>
          </div>
        </div>

        <!-- Featured Section Content -->
        <section class='feature-grid'>
          <article class='feature-card'>
            <h3>Free Services</h3>
            <p>Public seminars, free notes, free papers, and announcements for visitors who are not registered.</p>
          </article>
          <article class='feature-card'>
            <h3>Paid Access</h3>
            <p>Live class videos, recordings, tutor notes, paper packs, and month-based private pages for paid students.</p>
          </article>
          <article class='feature-card'>
            <h3>Reminder System</h3>
            <p>Monthly payment reminders stay prominent and reappear on the next visit after closing.</p>
          </article>
        </section>
      </section>

      <!-- View 2: Free Notes Page -->
      <section class='view' id='freeView'>
        <h2>Free Resources</h2>
        <p>Accessible to all registered and unregistered visitors.</p>
        
        <div style='display:grid; grid-template-columns:1fr 1.2fr; gap:2rem; margin-top:1.5rem;'>
          <!-- Free Materials -->
          <div class='feature-card' style='height:fit-content;'>
            <h3 style='border-bottom:1px solid var(--border); padding-bottom:0.5rem; margin-bottom:1rem;'>📚 Free Physics Notes &amp; PDF Papers</h3>
            <ul style='list-style:none; padding:0; margin:0;'>
              <li style='padding:0.8rem 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;'>
                <span>📄 Measurement Units Notes</span>
                <a class='mini-btn' href='https://taphysics.blogspot.com/p/free-notes.html' style='text-decoration:none;' target='_blank'>Download</a>
              </li>
              <li style='padding:0.8rem 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;'>
                <span>📄 Vectors Introductory Paper</span>
                <a class='mini-btn' href='https://taphysics.blogspot.com/p/free-notes.html' style='text-decoration:none;' target='_blank'>Download</a>
              </li>
            </ul>
          </div>
          <!-- General Announcements -->
          <div class='feature-card'>
            <h3 style='border-bottom:1px solid var(--border); padding-bottom:0.5rem; margin-bottom:1rem;'>📢 Public Notices &amp; Announcements</h3>
            <div id='listPublicNotices'>
              <!-- Injected dynamically -->
              <p style='color:#64748b;'>Loading announcements...</p>
            </div>
          </div>
        </div>
      </section>

      <!-- View 3: Student Login Page -->
      <section class='view' id='loginView'>
        <div class='auth-wrap'>
          <form class='auth-card' id='loginForm' onsubmit='handleStudentLogin(event)'>
            <h2>Student Login</h2>
            <p>Use the username and password created during registration.</p>
            
            <div class='form-group' style='margin-bottom:1rem;'>
              <label>Username</label>
              <input autocomplete='username' id='loginUsername' placeholder='e.g. KAPE7882' required='required' type='text' />
            </div>
            
            <div class='form-group' style='margin-bottom:1.5rem;'>
              <label>Password</label>
              <input autocomplete='current-password' id='loginPassword' placeholder='Enter your password (or NIC)' required='required' type='password' />
            </div>
            
            <button class='cta primary full' type='submit'>Login</button>
            <button class='link-btn' onclick='showForgotPassword()' type='button'>Forgot password?</button>
            <button class='link-btn' onclick='switchView("registerView")' type='button'>New student? Register here</button>
          </form>
        </div>
      </section>

      <!-- View 4: Student Registration Page -->
      <section class='view' id='registerView'>
        <div class='feature-card' style='max-width:800px; margin:0 auto;'>
          <h2 style='font-family:"Space Grotesk", sans-serif; font-size:1.8rem; margin-bottom:0.5rem;'>New Student Registration</h2>
          <p style='color:#94a3b8; font-size:0.9rem; margin-bottom:1.5rem;'>All fields are mandatory. Enter your information carefully.</p>
          
          <form id='registerForm' onsubmit='handleStudentRegistration(event)'>
            <div class='form-grid'>
              <div class='form-group' id='grpFirstName'>
                <label>First Name (English)</label>
                <input id='regFirst' oninput='clearInvalidState("grpFirstName")' placeholder='e.g. Kasun' required='required' type='text' />
              </div>

              <div class='form-group' id='grpLastName'>
                <label>Last Name (English)</label>
                <input id='regLast' oninput='clearInvalidState("grpLastName")' placeholder='e.g. Perera' required='required' type='text' />
              </div>

              <div class='form-group' id='grpNIC'>
                <label>National ID (NIC) Number</label>
                <input id='regNIC' oninput='clearInvalidState("grpNIC")' placeholder='e.g. 200412345678' required='required' type='text' />
              </div>

              <div class='form-group' id='grpDistrict'>
                <label>District</label>
                <select id='regDistrict' onchange='clearInvalidState("grpDistrict")' required='required'>
                  <option value=''>-- Select District --</option>
                  <option value='Colombo'>Colombo</option>
                  <option value='Gampaha'>Gampaha</option>
                  <option value='Kalutara'>Kalutara</option>
                  <option value='Avissawella'>Avissawella</option>
                  <option value='Kandy'>Kandy</option>
                  <option value='Matale'>Matale</option>
                  <option value='Nuwara Eliya'>Nuwara Eliya</option>
                  <option value='Galle'>Galle</option>
                  <option value='Matara'>Matara</option>
                  <option value='Hambantota'>Hambantota</option>
                  <option value='Jaffna'>Jaffna</option>
                  <option value='Mannar'>Mannar</option>
                  <option value='Vavuniya'>Vavuniya</option>
                  <option value='Mullaitivu'>Mullaitivu</option>
                  <option value='Kilinochchi'>Kilinochchi</option>
                  <option value='Batticaloa'>Batticaloa</option>
                  <option value='Ampara'>Ampara</option>
                  <option value='Trincomalee'>Trincomalee</option>
                  <option value='Kurunegala'>Kurunegala</option>
                  <option value='Puttalam'>Puttalam</option>
                  <option value='Anuradhapura'>Anuradhapura</option>
                  <option value='Polonnaruwa'>Polonnaruwa</option>
                  <option value='Badulla'>Badulla</option>
                  <option value='Moneragala'>Moneragala</option>
                  <option value='Ratnapura'>Ratnapura</option>
                  <option value='Kegalle'>Kegalle</option>
                </select>
              </div>

              <div class='form-group' id='grpClassType' style='grid-column: span 2;'>
                <label style='margin-bottom:0.5rem;'>Class Type (Select one or more)</label>
                <div id='dynamicClassList' class='check-stack' style='display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px;'>
                  <span style='color: #94a3b8; font-size: 0.9rem;'>පන්ති ලැයිස්තුව ලබාගනිමින් පවතී...</span>
                </div>
              </div>
              <div class='form-group' id='grpWhatsApp'>
                <label>WhatsApp Number (10 digits starting with 0)</label>
                <input id='regWhatsApp' maxlength='10' oninput='clearInvalidState("grpWhatsApp")' placeholder='0711234567' required='required' type='text' />
              </div>

              <div class='form-group' id='grpMobile'>
                <label>Mobile Number (For Calling)</label>
                <input id='regMobile' maxlength='10' oninput='clearInvalidState("grpMobile")' placeholder='0711234567' required='required' type='text' />
              </div>

              <div class='form-group' id='grpPassword' style='grid-column: span 2;'>
                <label>Create Login Password</label>
                <input id='regPass' minlength='4' oninput='clearInvalidState("grpPassword")' placeholder='Type secure password' required='required' type='password' />
              </div>
            </div>

            <div class='form-actions'>
              <button class='cta primary font-semibold' id='btnRegSubmit' type='submit'>Confirm Registration &amp; Send Admin</button>
              <button class='cta secondary' type='reset'>Clear Form</button>
            </div>
          </form>
        </div>
      </section>

      <!-- View 5: Student Dashboard (Locked portal) -->
      <section class='view' id='dashboardView'>
        <div class='dashboard'>
          <!-- Left sidebar profile -->
          <aside class='profile-card'>
            <div class='profile-head'>
              <div class='avatar' id='studentAvatar' onclick='showStudentProfileDetails()'>TA</div>
              <div>
                <h2 id='studentDashName' style='font-family:"Space Grotesk", sans-serif; font-size:1.3rem; margin:0;'>Student Name</h2>
                <p id='studentDashTag' style='font-size:0.8rem; color:#94a3b8; margin:4px 0 0 0;'>Logged in Student</p>
              </div>
            </div>
            
            <div class='profile-details' id='studentSidebarDetails'>
              <!-- Display small information list -->
            </div>
            
            <button class='cta secondary full' onclick='handleStudentLogout()' style='margin-top:2rem;'>Logout</button>
          </aside>

          <!-- Core interactive content area -->
          <div class='dashboard-main'>
            <!-- Floating general public alerts -->
            <div id='dashboardPublicAlert' style='display:none;'></div>

            <!-- Welcoming active confirmation alert (Appears on first-time login only) -->
            <div class='payment-reminder' id='welcomeActiveNotice' style='display:none; background: linear-gradient(90deg, #10b981 0%, #059669 100%); color:white; margin-bottom:1rem;'>
              <div>
                <strong>✨ Welcome back!</strong>
                <p style='color:#e6fbf3; margin:4px 0 0 0;'>Your account is active and verified.</p>
              </div>
              <button class='close-x' onclick='closeWelcomeBanner()' style='color:white;'>×</button>
            </div>

            <!-- Optional recurring payment hold alert -->
            <div class='payment-reminder' id='paymentHoldBox' style='display:none; background: linear-gradient(90deg, #f59e0b 0%, #b45309 100%); color:white; margin-bottom:1rem;'>
              <div>
                <strong>⚠️ Next Month Payment Hold</strong>
                <p style='color:#fef3c7; margin:4px 0 0 0; font-size: 0.85rem;'>You are currently unpaid/expired. Please resolve your slips for full course contents.</p>
              </div>
            </div>

            <!-- Portal status indicators -->
            <div class='status-strip'>
              <div class='status-pill' id='pillStatus'>Access Active</div>
              <div class='status-pill soft' id='pillUsername'>Username: -</div>
              <div class='status-pill soft' id='pillClassType'>Physics Core</div>
            </div>

            <!-- Dynamic Buttons Row (Live / Papers / Recordings) -->
            <section class='premium-portal-row'>
              <div class='portal-link-btn btn-live' onclick='accessPortalUrl("live")'>
                <div class='portal-btn-sticker' id='badgeLive'>Active</div>
                <div class='portal-btn-icon'>🎥</div>
                <div class='portal-btn-title'>Live Classes</div>
                <div class='portal-btn-desc'>Join the active weekly stream</div>
              </div>

              <div class='portal-link-btn btn-papers' onclick='accessPortalUrl("papers")'>
                <div class='portal-btn-sticker' id='badgePaper'>Active</div>
                <div class='portal-btn-icon'>📁</div>
                <div class='portal-btn-title'>Tute &amp; Papers</div>
                <div class='portal-btn-desc'>Download notes and homework packs</div>
              </div>

              <div class='portal-link-btn btn-rec' onclick='accessPortalUrl("recording")'>
                <div class='portal-btn-sticker' id='badgeRec'>Active</div>
                <div class='portal-btn-icon'>📼</div>
                <div class='portal-btn-title'>Class Recordings</div>
                <div class='portal-btn-desc'>Catch up on past sessions</div>
              </div>
            </section>

            <!-- Interactive Calendar -->
            <section class='calendar-widget'>
              <div class='calendar-header'>
                <h3 style='font-family:"Space Grotesk", sans-serif; font-size:1.2rem; margin:0;'>📅 Physics Class Calender</h3>
                <span style='font-size:0.85rem; color:#64748b;' id='calMonthTitle'>May 2026</span>
              </div>
              
              <!-- Calendar grid -->
              <div class='calendar-grid' id='calendarGridContainer'>
                <!-- Standard days headers -->
                <div class='calendar-day-header'>S</div>
                <div class='calendar-day-header'>M</div>
                <div class='calendar-day-header'>T</div>
                <div class='calendar-day-header'>W</div>
                <div class='calendar-day-header'>T</div>
                <div class='calendar-day-header'>F</div>
                <div class='calendar-day-header'>S</div>
                <!-- Injected via Script -->
              </div>
            </section>

            <!-- Notifications / Private Inbox Section -->
            <section class='feature-card' style='background-color:rgba(15, 23, 42, 0.4);'>
              <div style='margin-bottom:1rem;'>
                <h3 style='font-family:"Space Grotesk", sans-serif; font-weight:600; margin:0;'>✉️ Private Notification Alerts</h3>
                <p style='color:#64748b; font-size:0.8rem; margin:2px 0 0 0;'>Any warnings or specific class alerts targeting your account appear here.</p>
              </div>
              <div id='studentPrivateNotificationsInbox'>
                <!-- Dynamic cards -->
                <p style='font-size:0.9rem; color:#64748b;'>No messages in your account inbox.</p>
              </div>
            </section>
          </div>
        </div>
      </section>

      <!-- View 6: Admin Cockpit Panel (Password Protected UI) -->
      <section class='view' id='adminView'>
        <div id='adminAuthBox'>
          <div class='auth-wrap' style='padding:1rem 0;'>
            <div class='auth-card' style='max-width:400px;'>
              <h2>Admin Cockpit Panel</h2>
              <p>Authentication required to manage class access.</p>
              <div class='form-group' style='margin-bottom:1.2rem;'>
                <label>Admin Access Password</label>
                <!-- Masked password input, no default text, correct placeholder -->
                <input id='adminPassInput' placeholder='Enter Admin Password' required='required' type='password' />
              </div>
              <button class='cta primary full' onclick='authenticateAdmin()' type='button'>Access Cockpit</button>
            </div>
          </div>
        </div>

        <!-- Authenticated Admin Space -->
        <div id='adminDashboardSpace' style='display:none;'>
          <div style='display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid var(--border); padding-bottom:1rem;'>
            <div>
              <h2 style='font-family:"Space Grotesk", sans-serif; font-size:1.8rem; margin:0;'>Student Data Manager &amp; Config</h2>
              <p style='color:#94a3b8; font-size:0.85rem; margin:4px 0 0 0;'>Manage registrations and calendar events</p>
            </div>
            <button class='cta secondary' onclick='deauthenticateAdmin()'>Lock Control</button>
          </div>

          <div style='display:grid; grid-template-columns:1fr 1fr; gap:2rem;'>
            <!-- Admin column left: Registered students list -->
            <div class='feature-card'>
              <h3>👥 Registered Students Portal</h3>
              <div style='max-height:450px; overflow-y:auto; margin-top:1rem;'>
                <table class='admin-tables' id='adminStudentsTable'>
                  <thead>
                    <tr>
                      <th>Student &amp; Username</th>
                      <th>Class Option</th>
                      <th>Access Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- Injected dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Admin column right: Quick Tools & Registration Key generator (Target Student Generation Config) -->
            <div class='feature-card'>
              <h3>⚙️ Manual Registration Code Creator</h3>
              <p style='color:#64748b; font-size:0.8rem; margin-bottom:1rem;'>Create student profiles with auto-generated credentials.</p>
              
              <div style='display:flex; flex-direction:column; gap:12px;'>
                <div style='display:grid; grid-template-columns:1fr 1fr; gap:10px;'>
                  <div class='form-group'>
                    <label>First Name</label>
                    <input id='manFirstName' placeholder='Kasun' type='text' />
                  </div>
                  <div class='form-group'>
                    <label>Last Name</label>
                    <input id='manLastName' placeholder='Perera' type='text' />
                  </div>
                </div>

                <div class='form-group'>
                  <label>NIC Number (Auto Password)</label>
                  <input id='manNIC' placeholder='e.g. 200412345678' type='text' />
                </div>

                <div class='form-group'>
                  <label>District Selection</label>
                  <select id='manDistrict'>
                    <option value='Colombo'>Colombo</option>
                    <option value='Gampaha'>Gampaha</option>
                    <option value='Kalutara'>Kalutara</option>
                    <option value='Avissawella'>Avissawella</option>
                    <option value='Kandy'>Kandy</option>
                    <option value='Matale'>Matale</option>
                    <option value='Nuwara Eliya'>Nuwara Eliya</option>
                    <option value='Galle'>Galle</option>
                    <option value='Matara'>Matara</option>
                    <option value='Hambantota'>Hambantota</option>
                    <option value='Jaffna'>Jaffna</option>
                    <option value='Mannar'>Mannar</option>
                    <option value='Vavuniya'>Vavuniya</option>
                    <option value='Mullaitivu'>Mullaitivu</option>
                    <option value='Kilinochchi'>Kilinochchi</option>
                    <option value='Batticaloa'>Batticaloa</option>
                    <option value='Ampara'>Ampara</option>
                    <option value='Trincomalee'>Trincomalee</option>
                    <option value='Kurunegala'>Kurunegala</option>
                    <option value='Puttalam'>Puttalam</option>
                    <option value='Anuradhapura'>Anuradhapura</option>
                    <option value='Polonnaruwa'>Polonnaruwa</option>
                    <option value='Badulla'>Badulla</option>
                    <option value='Moneragala'>Moneragala</option>
                    <option value='Ratnapura'>Ratnapura</option>
                    <option value='Kegalle'>Kegalle</option>
                  </select>
                </div>

                <div class='form-group'>
                  <label>Class Types (Select multiple if needed)</label>
                  <div style='display:grid; grid-template-columns: 1fr 1fr; gap: 5px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;'>
                    <label><input id='manClass1' type='checkbox' value='2027 Theory' /> 2027 Theory</label>
                    <label><input id='manClass2' type='checkbox' value='2027 Revision' /> 2027 Revision</label>
                    <label><input id='manClass3' type='checkbox' value='2027 Paper Class' /> 2027 Paper Class</label>
                    <label><input id='manClass4' type='checkbox' value='2028 Theory' /> 2028 Theory</label>
                    <label><input id='manClass5' type='checkbox' value='2028 Revision' /> 2028 Revision</label>
                    <label><input id='manClass6' type='checkbox' value='2028 Paper Class' /> 2028 Paper Class</label>
                  </div>
                </div>

                <div style='display:grid; grid-template-columns: 1fr 1fr; gap:10px;'>
                  <div class='form-group'>
                    <label>WhatsApp Number</label>
                    <input id='manWhatsApp' placeholder='0779152182' type='text' />
                  </div>
                  <div class='form-group'>
                    <label>Mobile Number</label>
                    <input id='manMobile' placeholder='0712345678' type='text' />
                  </div>
                </div>

                <button class='cta primary full' onclick='generateManualStudentCode()' type='button'>Generate Student Profile Code</button>

                <div id='manResultBox' style='display:none;'>
                  <label style='font-size:0.8rem; color:#94a3b8; font-weight:600;'>Generated Copy-Paste JSON Block</label>
                  <textarea id='manResultText' readonly='readonly' style='width: 100%; height: 110px; font-family: monospace; font-size: 0.75rem; padding: 10px; margin-top: 5px; outline: none; border-radius: 6px; resize: none;'></textarea>
                  <button class='cta secondary full' onclick='copyManualStudentText()' style='margin-top:5px; padding:0.4rem;' type='button'>📋 Copy to Clipboard</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Calendar & Announcement Editors -->
          <div style='display:grid; grid-template-columns: 1fr 1fr; gap:2rem; margin-top:2rem;'>
            <div class='feature-card'>
              <h3>📅 Class Calendar Planner</h3>
              <p style='color:#64748b; font-size:0.8rem;'>Highlight upcoming live classes or add cancellation notices.</p>
              
              <div style='display:flex; flex-direction:column; gap:10px; margin-top:1rem;'>
                <div class='form-group'>
                  <label>Class Date</label>
                  <input id='planDate' type='date' value='2026-05-28' />
                </div>
                <div class='form-group'>
                  <label>Session Title</label>
                  <input id='planTitle' placeholder='Mechanics Class - Core theory' type='text' />
                </div>
                <div class='form-group'>
                  <label>Status Mode</label>
                  <select id='planStatus' onchange='togglePlanWarningArea()'>
                    <option value='active'>Active (Upcoming Glowing Day)</option>
                    <option value='past'>Past (Disabled / Expired Status)</option>
                    <option value='cancelled'>Cancelled (Shows Red Alert Warning)</option>
                  </select>
                </div>
                <div class='form-group' id='planWarningArea' style='display:none;'>
                  <label>Warning Message / Cancellation Advice</label>
                  <input id='planWarning' placeholder='⚠️ Class Postponed due to festival holiday!' type='text' />
                </div>
                
                <button class='cta primary font-semibold' onclick='submitPlannedEvent()' type='button'>Schedule Class Event</button>
              </div>
            </div>

            <!-- Custom Notification Alerts Manager -->
            <div class='feature-card'>
              <h3>📢 Send Public &amp; Private Alert Notifications</h3>
              <p style='color:#64748b; font-size:0.8rem;'>Create temporary news feeds for specific students or everyone.</p>
              
              <div style='display:flex; flex-direction:column; gap:10px; margin-top:1rem;'>
                <div class='form-group'>
                  <label>Notification Mode</label>
                  <select id='notType' onchange='togglePrivateUserField()'>
                    <option value='public'>Public (For All Registrants &amp; Visitors)</option>
                    <option value='private'>Private (Under Specific Student ID - Red Alert)</option>
                  </select>
                </div>
                <div class='form-group' id='privateUserBlock' style='display:none;'>
                  <label>Target Student Username (ID)</label>
                  <input id='notUser' placeholder='e.g. KAPE7882' type='text' />
                </div>
                <div class='form-group'>
                  <label>Message Title</label>
                  <input id='notTitle' placeholder='New Theory Paper Uploaded' type='text' />
                </div>
                <div class='form-group'>
                  <label>Notice Content Details</label>
                  <textarea id='notContent' placeholder='Details concerning physics syllabus...' style='height: 80px; resize:none;'></textarea>
                </div>
                
                <button class='cta primary' onclick='submitAdAlert()' type='button'>Broadcast Notification</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Global Modal Dialog Layout -->
    <div class='modal-backdrop' id='modalBackdrop'>
      <div class='modal-card'>
        <div class='modal-head'>
          <h3 id='modalTitle' style='font-family:"Space Grotesk", sans-serif; margin:0; font-size:1.25rem;'>Modal Title</h3>
          <button class='close-x' onclick='closeGlobalModal()'>×</button>
        </div>
        <div id='modalContent' style='font-size:0.95rem; line-height:1.6; color:#e2e8f0;'>
          Modal text content injected.
        </div>
      </div>
    </div>

    <!-- Footer Category Navigation -->
    <footer>
      <div class='footer-nav'>
        <a class='footer-link' onclick='switchView("homeView")'>Home Page</a>
        <a class='footer-link' onclick='switchView("freeView")'>Free Notes</a>
      </div>
      <div class='footer-credits'>
        <p>© 2026 Taraka Amarasinghe Physics Online. All rights reserved.</p>
        <p style='font-size: 0.7rem; color: #334155; margin-top: 10px;'>Professional learning environment built with 100% XHTML SAX validation</p>
      </div>
    </footer>
  </div>

  <!-- Client State and Controller Javascript -->
  <script type='text/javascript'>
    //<![CDATA[
    
    // Core Seed Data Sets
    let students = [
      {
        username: "KAPE7882",
        firstName: "Kasun",
        lastName: "Perera",
        nic: "200412345678",
        classTypes: ["2027 Theory", "2027 Revision"],
        district: "Colombo",
        whatsapp: "0779152182",
        mobile: "0712345678",
        isPaid: true,
        activeMonths: ["2026-05", "2026-06"]
      },
      {
        username: "NIFE7072",
        firstName: "Nipun",
        lastName: "Fernando",
        nic: "200512345670",
        classTypes: ["2028 Theory"],
        district: "Gampaha",
        whatsapp: "0719152172",
        mobile: "0778765432",
        isPaid: false,
        activeMonths: []
      }
    ];

    let calendarEvents = [
      { id: "cal-1", date: "2026-05-24", title: "Mechanics Theory - Unit 2", description: "Discussion on Friction & Static Equilibrium.", status: "past" },
      { id: "cal-2", date: "2026-05-28", title: "Kinematics Advanced Seminar", description: "Comprehensive paper discussion and exam techniques.", status: "active" },
      { id: "cal-3", date: "2026-05-31", title: "Fluid Dynamics Introduction", description: "Postponed due to Wesak festival holiday. Replacement scheduled.", status: "cancelled", warningMessage: "⚠️ Class Postponed: This session has been rescheduled. Replacement date will be updated soon!" }
    ];

    let notifications = [
      { id: "not-1", title: "Special Live Seminar for New Students", content: "All registered students are welcome to join our Free introductory seminar on Physics Fundamentals next Saturday at 8:00 AM.", date: "2026-05-23", type: "public" },
      { id: "not-2", title: "Urgent: Paper Pack 03 Uploaded!", content: "Paid students can now download the PDF paper pack from the Tute & Papers sections.", date: "2026-05-25", type: "public" }
    ];

    let currentLoggedInUser = null;
    let isAdminAuthenticated = false;

    // Load persisted local storage representation if it exists
    function loadPersistedState() {
      const savedStudents = localStorage.getItem("physics_hub_students");
      if (savedStudents) {
        students = JSON.parse(savedStudents);
      } else {
        localStorage.setItem("physics_hub_students", JSON.stringify(students));
      }

      const savedCalendars = localStorage.getItem("physics_hub_calendars");
      if (savedCalendars) {
        calendarEvents = JSON.parse(savedCalendars);
      } else {
        localStorage.setItem("physics_hub_calendars", JSON.stringify(calendarEvents));
      }

      const savedNotifs = localStorage.getItem("physics_hub_notifs");
      if (savedNotifs) {
        notifications = JSON.parse(savedNotifs);
      } else {
        localStorage.setItem("physics_hub_notifs", JSON.stringify(notifications));
      }
      
      // Auto reconnect session for students
      const loggedUser = localStorage.getItem("physics_hub_current_student");
      if (loggedUser) {
        const found = students.find(s => s.username === loggedUser);
        if (found) {
          currentLoggedInUser = found;
          switchView("dashboardView");
          renderStudentDashboard();
        }
      }
    }

    function saveState() {
      localStorage.setItem("physics_hub_students", JSON.stringify(students));
      localStorage.setItem("physics_hub_calendars", JSON.stringify(calendarEvents));
      localStorage.setItem("physics_hub_notifs", JSON.stringify(notifications));
    }

    // Tab view switching controller
    function switchView(viewId) {
      document.querySelectorAll(".view").forEach(v => {
        v.classList.remove("active");
      });
      document.getElementById(viewId).classList.add("active");

      // Set active nav buttons
      document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      if (viewId === "homeView") document.getElementById("btnHome").classList.add("active");
      else if (viewId === "freeView") document.getElementById("btnFree").classList.add("active");
      else if (viewId === "loginView") document.getElementById("btnLogin").classList.add("active");
      else if (viewId === "registerView") document.getElementById("btnRegister").classList.add("active");
      else if (viewId === "dashboardView") {
        document.getElementById("btnLogin").classList.add("active");
        renderStudentDashboard();
      }

      // Scroll to top
      window.scrollTo(0, 0);
    }

    // Hero sliding backdrops
    let currentSlideIndex = 0;
    function runBackgroundSlideCycle() {
      const slider = document.getElementById("heroSlider");
      if (!slider) return;
      const slides = slider.querySelectorAll(".hero-bg-slide");
      if (slides.length === 0) return;

      slides.forEach(s => s.classList.remove("active"));
      slides[currentSlideIndex].classList.add("active");

      currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    }
    setInterval(runBackgroundSlideCycle, 5000);

    // Dynamic field inputs validations (No required="required" omissions)
    function clearInvalidState(groupId) {
      const element = document.getElementById(groupId);
      if (element) {
        element.classList.remove("invalid");
      }
      // Reactivate button as soon as they edit
      const btn = document.getElementById("btnRegSubmit");
      if (btn) btn.removeAttribute("disabled");
    }

    // Student Registration flow
    function handleStudentRegistration(e) {
      e.preventDefault();
      
      const first = document.getElementById("regFirst").value.trim();
      const last = document.getElementById("regLast").value.trim();
      const nic = document.getElementById("regNIC").value.trim();
      const dist = document.getElementById("regDistrict").value;
      const whatsapp = document.getElementById("regWhatsApp").value.trim();
      const mobile = document.getElementById("regMobile").value.trim();
      const pass = document.getElementById("regPass").value.trim();

      // Get multi-select checked classes
      const selectedClasses = [];
      document.querySelectorAll('input[name="classOption"]:checked').forEach(cb => {
        selectedClasses.push(cb.value);
      });

      let hasErrors = false;
      let firstErrorGroup = null;

      // Validate Fields
      if (!first) {
        document.getElementById("grpFirstName").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpFirstName";
        hasErrors = true;
      }
      if (!last) {
        document.getElementById("grpLastName").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpLastName";
        hasErrors = true;
      }
      if (!nic || nic.length < 9) {
        document.getElementById("grpNIC").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpNIC";
        hasErrors = true;
      }
      if (!dist) {
        document.getElementById("grpDistrict").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpDistrict";
        hasErrors = true;
      }
      if (selectedClasses.length === 0) {
        document.getElementById("grpClassType").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpClassType";
        hasErrors = true;
      }
      // Checks starting with 0 and exactly 10 digits
      const phoneRegex = /^0\d{9}$/;
      if (!phoneRegex.test(whatsapp)) {
        document.getElementById("grpWhatsApp").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpWhatsApp";
        hasErrors = true;
      }
      if (!phoneRegex.test(mobile)) {
        document.getElementById("grpMobile").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpMobile";
        hasErrors = true;
      }
      if (!pass || pass.length < 4) {
        document.getElementById("grpPassword").classList.add("invalid");
        if (!firstErrorGroup) firstErrorGroup = "grpPassword";
        hasErrors = true;
      }

      if (hasErrors) {
        const submitBtn = document.getElementById("btnRegSubmit");
        if (submitBtn) submitBtn.setAttribute("disabled", "disabled");

        if (firstErrorGroup) {
          const el = document.getElementById(firstErrorGroup);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        return false;
      }

      // Generate credentials
      // Username auto formulation
      const rawFirstPrefix = first.substring(0, 2).toUpperCase();
      const rawLastPrefix = last.substring(0, 2).toUpperCase();
      const nicSuffix = nic.substring(nic.length - 2);
      const whatsappSuffix = whatsapp.substring(whatsapp.length - 2);
      const generatedUsername = rawFirstPrefix + rawLastPrefix + nicSuffix + whatsappSuffix;

      const newStudent = {
        username: generatedUsername,
        firstName: first,
        lastName: last,
        nic: nic,
        classTypes: selectedClasses,
        district: dist,
        whatsapp: whatsapp,
        mobile: mobile,
        isPaid: false, // Default is unpaid until verified
        activeMonths: [],
        password: pass // Save for local auth lookup
      };

      // Store in client array
      students.push(newStudent);
      saveState();

      // Formulate beautifully stylized WhatsApp text
      const waMessage = "*New Student Registration - TA Physics Online Hub*\\n\\n" +
        "First Name: " + first + "\\n" +
        "Last Name: " + last + "\\n" +
        "NIC: " + nic + "\\n" +
        "District: " + dist + "\\n" +
        "Classes: " + selectedClasses.join(", ") + "\\n" +
        "WhatsApp: " + whatsapp + "\\n" +
        "Mobile: " + mobile + "\\n\\n" +
        "*Auto-Generated Credentials*:\\n" +
        "Username: *" + generatedUsername + "*\\n" +
        "Password: *" + nic + "*\\n\\n" +
        "Please approve and activate my physics student dashboard!";

      // Open WhatsApp Web/App Link
      const encText = encodeURIComponent(waMessage);
      const url = "https://wa.me/94719152128?text=" + encText;
      window.open(url, "_blank");

      // Notify user of next steps
      showGlobalModal("Registration Code Ready!", 
        "<p>Your profile has been created successfully (Username: <strong>" + generatedUsername + "</strong>, Password: <strong>" + nic + "</strong>).</p>" +
        "<p>We have formulated your registration payload and redirected you to your instructor's WhatsApp account (0719152128) to activate your paid features.</p>" +
        "<div style='margin-top:15px; text-align:center;'><button class='cta primary' onclick='switchView(\"loginView\"); closeGlobalModal();'>Go to Student Login</button></div>"
      );

      // Reset form
      document.getElementById("registerForm").reset();
      return true;
    }

    // Student Login flow
    function handleStudentLogin(e) {
      e.preventDefault();
      const userVal = document.getElementById("loginUsername").value.trim();
      const passVal = document.getElementById("loginPassword").value.trim();

      // Lookup student credentials
      const found = students.find(s => 
        s.username.toLowerCase() === userVal.toLowerCase() && 
        (s.password === passVal || s.nic === passVal)
      );

      if (found) {
        currentLoggedInUser = found;
        localStorage.setItem("physics_hub_current_student", found.username);
        
        // Handle Welcome Alert trigger flag (Only shown on first login)
        const closedOnce = localStorage.getItem("physics_hub_welcome_closed_" + found.username);
        if (!closedOnce) {
          localStorage.setItem("physics_hub_show_welcome_" + found.username, "true");
        }

        switchView("dashboardView");
        renderStudentDashboard();
      } else {
        alert("Invalid Username or Password! Please register or check details with admin WhatsApp +94719152128.");
      }
    }

    function handleStudentLogout() {
      currentLoggedInUser = null;
      localStorage.removeItem("physics_hub_current_student");
      switchView("homeView");
    }

    // Password recovery trigger to WhatsApp
    function showForgotPassword() {
      const usernamePrompt = prompt("Please enter your Student Username:");
      if (!usernamePrompt) return;
      
      const text = "Hello Admin, I forgot my physics portal login password. Please reset my password for Username: " + usernamePrompt;
      const enc = encodeURIComponent(text);
      window.open("https://wa.me/94719152128?text=" + enc, "_blank");
    }

    // Dashboard dynamic renderer
    function renderStudentDashboard() {
      if (!currentLoggedInUser) return;

      const student = currentLoggedInUser;

      // Update basic fields
      document.getElementById("studentDashName").textContent = student.firstName + " " + student.lastName;
      document.getElementById("studentDashTag").textContent = "Core Course Student | District: " + student.district;
      
      const avatarBox = document.getElementById("studentAvatar");
      avatarBox.textContent = student.firstName.substring(0,1).toUpperCase() + student.lastName.substring(0,1).toUpperCase();

      document.getElementById("pillUsername").textContent = "ID: " + student.username;
      
      const classesJoined = student.classTypes && student.classTypes.length > 0 ? student.classTypes.join(", ") : "Not Enrolled";
      document.getElementById("pillClassType").textContent = classesJoined;

      // Class Month selection indicator
      const activeState = student.isPaid ? "Access: Active (Paid)" : "Access: Hold (Unpaid)";
      const statusPill = document.getElementById("pillStatus");
      statusPill.textContent = activeState;
      if (student.isPaid) {
        statusPill.className = "status-pill";
        document.getElementById("welcomeActiveNotice").style.display = localStorage.getItem("physics_hub_show_welcome_" + student.username) === "true" ? "flex" : "none";
        document.getElementById("paymentHoldBox").style.display = "none";
      } else {
        statusPill.className = "status-pill last-month";
        statusPill.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
        statusPill.style.color = "var(--danger)";
        statusPill.style.borderColor = "rgba(239, 68, 68, 0.25)";
        document.getElementById("welcomeActiveNotice").style.display = "none";
        document.getElementById("paymentHoldBox").style.display = "flex";
      }

      // Sidebar details overview
      const detailsBox = document.getElementById("studentSidebarDetails");
      detailsBox.innerHTML = 
        "<div class='detail-item'><span class='detail-label'>District:</span><span class='detail-val'>" + student.district + "</span></div>" +
        "<div class='detail-item'><span class='detail-label'>NIC No:</span><span class='detail-val'>" + student.nic + "</span></div>" +
        "<div class='detail-item'><span class='detail-label'>WhatsApp:</span><span class='detail-val'>" + student.whatsapp + "</span></div>" +
        "<div class='detail-item'><span class='detail-label'>Mobile:</span><span class='detail-val'>" + student.mobile + "</span></div>" +
        "<div class='detail-item'><span class='detail-label'>Enrolled Class:</span><span class='detail-val'>" + (student.classTypes[0] || 'Physics') + "</span></div>";

      // Render Dynamic Interactive Calendar
      buildInteractiveCalendar();

      // Render account notices
      buildDashboardNotices();
    }

    // Profiles Modal popup on click (Excluding Password showing)
    function showStudentProfileDetails() {
      if (!currentLoggedInUser) return;
      const student = currentLoggedInUser;

      const profileHtml = 
        "<div style='background:rgba(255,255,255,0.02); padding:1.5rem; border-radius:10px; border:1px solid var(--border);'>" +
          "<div style='text-align:center; margin-bottom:1.5rem;'>" +
            "<div style='width:70px; height:70px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #ec4899); display:inline-flex; align-items:center; justify-content:center; font-weight:700; color:white; font-size:1.8rem; margin-bottom:0.5rem;'>" + student.firstName.substring(0,1) + "</div>" +
            "<h4>" + student.firstName + " " + student.lastName + "</h4>" +
            "<p style='color:#64748b; font-size:0.8rem; margin:0;'>Student registration details verified</p>" +
          "</div>" +
          "<div style='display:flex; flex-direction:column; gap:10px; font-size:0.9rem;'>" +
            "<div><strong>STUDENT ID (Username):</strong> <span style='color:var(--primary); font-family:monospace;'>" + student.username + "</span></div>" +
            "<div><strong>First Name:</strong> <span>" + student.firstName + "</span></div>" +
            "<div><strong>Last Name:</strong> <span>" + student.lastName + "</span></div>" +
            "<div><strong>National ID (NIC) Number:</strong> <span>" + student.nic + "</span></div>" +
            "<div><strong>Enrolled Course Plan:</strong> <span style='background:rgba(139,92,246,0.1); padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem; color:var(--primary);'>" + student.classTypes.join(", ") + "</span></div>" +
            "<div><strong>Home District:</strong> <span>" + student.district + "</span></div>" +
            "<div><strong>WhatsApp Contact:</strong> <span>" + student.whatsapp + "</span></div>" +
            "<div><strong>Mobile Voice:</strong> <span>" + student.mobile + "</span></div>" +
          "</div>" +
        "</div>";

      showGlobalModal("Verify Student Profile Data", profileHtml);
    }

    function closeWelcomeBanner() {
      if (currentLoggedInUser) {
        localStorage.setItem("physics_hub_welcome_closed_" + currentLoggedInUser.username, "true");
        localStorage.setItem("physics_hub_show_welcome_" + currentLoggedInUser.username, "false");
        document.getElementById("welcomeActiveNotice").style.display = "none";
      }
    }

    // Live link access logic
    function accessPortalUrl(dest) {
      if (!currentLoggedInUser) return;
      
      // Access locks for paid active accounts only
      if (!currentLoggedInUser.isPaid) {
        showGlobalModal("Hold: Payment Clearance Required", 
          "<p style='text-align:center; margin:1rem;'>🔒</p>" +
          "<p>Your subscription is currently on HOLD or expired for next month.</p>" +
          "<p>Please contact class supervisor at WhatsApp <strong>0719152128</strong> with your deposit receipt slip scanning payload to activate full website resources.</p>" +
          "<div style='text-align:center; margin-top:15px;'><a class='cta primary' href='https://wa.me/94719152128?text=Hello%20Admin%2C%20I%20have%20sent%20my%20month%20payment%20slips' target='_blank'>Contact Admin WhatsApp</a></div>"
        );
        return;
      }

      // Route paid student
      if (dest === "live") {
        window.open("https://taphysics.blogspot.com/p/live-classes.html", "_blank");
      } else if (dest === "papers") {
        window.open("https://taphysics.blogspot.com/p/pdf-papers.html", "_blank");
      } else if (dest === "recording") {
        window.open("https://taphysics.blogspot.com/p/recordings.html", "_blank");
      }
    }

    // Modal helpers
    function showGlobalModal(title, contentHtml) {
      document.getElementById("modalTitle").textContent = title;
      document.getElementById("modalContent").innerHTML = contentHtml;
      document.getElementById("modalBackdrop").style.display = "flex";
    }

    function closeGlobalModal() {
      document.getElementById("modalBackdrop").style.display = "none";
    }

    // Open public alert notifications easily
    function openPublicAlertsModal() {
      const publicAlerts = notifications.filter(n => n.type === 'public');
      let html = "";
      if (publicAlerts.length === 0) {
        html = "<p>No active public statements currently broadcasted.</p>";
      } else {
        publicAlerts.forEach(not => {
          html += 
            "<div style='background:rgba(255,255,255,0.03); border-left:3px solid var(--primary); padding:12px; margin-bottom:12px; border-radius:0 8px 8px 0;'>" +
              "<div style='font-weight:600; color:white;'>" + not.title + "</div>" +
              "<div style='font-size:0.75rem; color:#64748b; margin-top:2px;'>" + not.date + "</div>" +
              "<div style='color:#cbd5e1; font-size:0.85rem; margin-top:6px;'>" + not.content + "</div>" +
            "</div>";
        });
      }
      showGlobalModal("📢 Public Notifications & Announcements", html);
    }

    // Build the interactive student dashboard calendar
    function buildInteractiveCalendar() {
      const grid = document.getElementById("calendarGridContainer");
      if (!grid) return;

      // Reset to original headers first
      grid.innerHTML = 
        "<div class='calendar-day-header'>S</div>" +
        "<div class='calendar-day-header'>M</div>" +
        "<div class='calendar-day-header'>T</div>" +
        "<div class='calendar-day-header'>W</div>" +
        "<div class='calendar-day-header'>T</div>" +
        "<div class='calendar-day-header'>F</div>" +
        "<div class='calendar-day-header'>S</div>";

      // Display mock month calendar for May 2026 (Starts on dynamic offset setup)
      // May 1st 2026 was Friday. Leading offsets: 5 blank days. Entire month days: 31
      const totalDays = 31;
      const leadingOffset = 5;

      for (let i = 0; i < leadingOffset; i++) {
        const blank = document.createElement("div");
        blank.className = "calendar-cell inactive";
        grid.appendChild(blank);
      }

      for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
        const dateStr = "2026-05-" + (dayNum < 10 ? "0" + dayNum : dayNum);
        
        const cell = document.createElement("div");
        cell.className = "calendar-cell";
        cell.textContent = dayNum.toString();

        // Check if there is a matching class event mapped in config
        const event = calendarEvents.find(e => e.date === dateStr);
        if (event) {
          if (event.status === "active") {
            cell.classList.add("highlight-class");
            cell.setAttribute("title", event.title + " (Upcoming Live)");
            cell.onclick = () => showGlobalModal("📅 Next Class Scheduled Info", 
              "<h4>" + event.title + "</h4>" +
              "<p style='color:#64748b; font-size:0.8rem;'>" + event.date + "</p>" +
              "<p style='font-size:0.95rem; margin-top:10px;'>" + event.description + "</p>" +
              "<p style='color:var(--success); font-weight:600; font-size:0.85rem; margin-top:10px;'>💡 Unlocks automatically for registered paid attendees!</p>"
            );
            
            const dot = document.createElement("div");
            dot.className = "calendar-dot";
            cell.appendChild(dot);
          } else if (event.status === "past") {
            cell.classList.add("disabled-class");
            cell.setAttribute("title", event.title + " (Completed / Expired)");
          } else if (event.status === "cancelled") {
            cell.classList.add("cancelled-class");
            cell.setAttribute("title", "WARNING: Class Postponed!");
            cell.onclick = () => showGlobalModal("⚠️ Urgent: Session Postponed Announcement", 
              "<h4>" + event.title + "</h4>" +
              "<p style='color:var(--danger); font-size:0.8rem;'>" + event.date + " (POSTPONED)</p>" +
              "<div style='background-color:rgba(239, 68, 68, 0.08); padding:1rem; border:1px solid var(--danger); border-radius:6px; margin-top:12px;'>" +
                "<p style='color:#f87171; font-weight:500; font-size:0.9rem; margin:0;'>" + (event.warningMessage || "Class cancellation/postponement declared by admin.") + "</p>" +
              "</div>" +
              "<p style='font-size:0.85rem; color:#94a3b8; margin-top:12px;'>We regret any inconvenience caused. Please call our Mobile Support or check private alerts for reschedule timelines.</p>"
            );

            const dot = document.createElement("div");
            dot.className = "calendar-dot cancelled";
            cell.appendChild(dot);
          }
        }
        grid.appendChild(cell);
      }
    }

    // Build the private target notifications inside dashboard
    function buildDashboardNotices() {
      const parent = document.getElementById("studentPrivateNotificationsInbox");
      if (!parent) return;

      if (!currentLoggedInUser) return;
      
      const userNotifs = notifications.filter(n => n.type === 'private' && n.targetUser.toLowerCase() === currentLoggedInUser.username.toLowerCase());
      
      if (userNotifs.length === 0) {
        parent.innerHTML = "<p style='font-size:0.9rem; color:#64748b;'>No personalized announcements loaded for your account.</p>";
      } else {
        parent.innerHTML = "";
        userNotifs.forEach(not => {
          const div = document.createElement("div");
          // Private messages show in custom red alert styling
          div.className = "announcement-box private";
          div.innerHTML = 
            "<div class='announcement-title' style='color:var(--danger);'>⚠️ " + not.title + "</div>" +
            "<div class='announcement-meta'>" + not.date + " • Individual Account Notice</div>" +
            "<div class='announcement-content'>" + not.content + "</div>";
          parent.appendChild(div);
        });
      }

      // Render public notes lists
      const publicNoticeList = document.getElementById("listPublicNotices");
      if (publicNoticeList) {
        const pubs = notifications.filter(n => n.type === 'public');
        if (pubs.length === 0) {
          publicNoticeList.innerHTML = "<p style='color:#64748b;'>No announcements uploaded yet.</p>";
        } else {
          publicNoticeList.innerHTML = "";
          pubs.forEach(p => {
            const wrap = document.createElement("div");
            wrap.className = "announcement-box";
            wrap.innerHTML = 
              "<div class='announcement-title'>📢 " + p.title + "</div>" +
              "<div class='announcement-meta'>" + p.date + "</div>" +
              "<div class='announcement-content'>" + p.content + "</div>";
            publicNoticeList.appendChild(wrap);
          });
        }
      }
    }

    // Admin Access validation controller
    function toggleAdminView() {
      switchView("adminView");
    }

    function authenticateAdmin() {
      const enteredPass = document.getElementById("adminPassInput").value;
      // Protected admin password match
      if (enteredPass === "dsPHYSICSds*18223") {
        isAdminAuthenticated = true;
        document.getElementById("adminAuthBox").style.display = "none";
        document.getElementById("adminDashboardSpace").style.display = "block";
        renderAdminStudentsTable();
      } else {
        alert("Incorrect Admin Access Password!");
      }
    }

    function deauthenticateAdmin() {
      isAdminAuthenticated = false;
      document.getElementById("adminPassInput").value = "";
      document.getElementById("adminAuthBox").style.display = "block";
      document.getElementById("adminDashboardSpace").style.display = "none";
      switchView("homeView");
    }

    // Toggle planner warning text
    function togglePlanWarningArea() {
      const mode = document.getElementById("planStatus").value;
      const grp = document.getElementById("planWarningArea");
      if (mode === "cancelled") {
        grp.style.display = "flex";
      } else {
        grp.style.display = "none";
      }
    }

    function togglePrivateUserField() {
      const mode = document.getElementById("notType").value;
      const b = document.getElementById("privateUserBlock");
      if (mode === "private") {
        b.style.display = "flex";
      } else {
        b.style.display = "none";
      }
    }

    // Populate students list table for Admin
    function renderAdminStudentsTable() {
      const tbody = document.getElementById("adminStudentsTable").querySelector("tbody");
      if (!tbody) return;

      tbody.innerHTML = "";
      students.forEach((stu, index) => {
        const tr = document.createElement("tr");

        const detailsTd = document.createElement("td");
        detailsTd.innerHTML = "<strong>" + stu.firstName + " " + stu.lastName + "</strong><br/><span style='font-family:monospace; font-size:0.75rem; color:var(--primary);'>" + stu.username + "</span>";
        tr.appendChild(detailsTd);

        const classTd = document.createElement("td");
        classTd.textContent = stu.classTypes ? stu.classTypes.join(", ") : "None";
        tr.appendChild(classTd);

        const statusTd = document.createElement("td");
        const statusText = stu.isPaid ? "✅ Paid (Full Unlocked)" : "❌ Unpaid / Hold";
        statusTd.textContent = statusText;
        tr.appendChild(statusTd);

        const actionsTd = document.createElement("td");
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "mini-btn";
        toggleBtn.style.marginRight = "5px";
        toggleBtn.textContent = stu.isPaid ? "Set Unpaid" : "Grant Access";
        toggleBtn.onclick = () => {
          stu.isPaid = !stu.isPaid;
          saveState();
          renderAdminStudentsTable();
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "mini-btn";
        deleteBtn.style.backgroundColor = "rgba(239,68,68,0.15)";
        deleteBtn.style.color = "var(--danger)";
        deleteBtn.style.borderColor = "rgba(239, 68, 68, 0.25)";
        deleteBtn.textContent = "Remove";
        deleteBtn.onclick = () => {
          if (confirm("Delete " + stu.firstName + " profile registration record?")) {
            students.splice(index, 1);
            saveState();
            renderAdminStudentsTable();
          }
        };

        actionsTd.appendChild(toggleBtn);
        actionsTd.appendChild(deleteBtn);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
      });
    }

    // Manual profile code generator inside Admin section
    function generateManualStudentCode() {
      const first = document.getElementById("manFirstName").value.trim();
      const last = document.getElementById("manLastName").value.trim();
      const nic = document.getElementById("manNIC").value.trim();
      const dist = document.getElementById("manDistrict").value;
      const whatsapp = document.getElementById("manWhatsApp").value.trim();
      const mobile = document.getElementById("manMobile").value.trim();

      // Read checkboxes
      const selectedClasses = [];
      if (document.getElementById("manClass1").checked) selectedClasses.push("2027 Theory");
      if (document.getElementById("manClass2").checked) selectedClasses.push("2027 Revision");
      if (document.getElementById("manClass3").checked) selectedClasses.push("2027 Paper Class");
      if (document.getElementById("manClass4").checked) selectedClasses.push("2028 Theory");
      if (document.getElementById("manClass5").checked) selectedClasses.push("2028 Revision");
      if (document.getElementById("manClass6").checked) selectedClasses.push("2028 Paper Class");

      if (!first || !last || !nic || !whatsapp || selectedClasses.length === 0) {
        alert("Please complete the required fields to formulate the profile!");
        return;
      }

      // Username auto Formulation
      const rawFirstPrefix = first.substring(0, 2).toUpperCase();
      const rawLastPrefix = last.substring(0, 2).toUpperCase();
      const nicSuffix = nic.substring(nic.length - 2);
      const whatsappSuffix = whatsapp.substring(whatsapp.length - 2);
      const generatedUsername = rawFirstPrefix + rawLastPrefix + nicSuffix + whatsappSuffix;

      const obj = {
        username: generatedUsername,
        firstName: first,
        lastName: last,
        nic: nic,
        classTypes: selectedClasses,
        district: dist,
        whatsapp: whatsapp,
        mobile: mobile,
        isPaid: true,
        activeMonths: ["2026-05"],
        password: nic // Password defaults to NIC
      };

      // Add to main storage list
      students.push(obj);
      saveState();
      
      const jsonStr = JSON.stringify(obj, null, 2);
      document.getElementById("manResultText").value = jsonStr;
      document.getElementById("manResultBox").style.display = "block";
      
      renderAdminStudentsTable();
      alert("Manual credentials registered! Username is: " + generatedUsername + " with Password: " + nic);
    }

    function copyManualStudentText() {
      const copyText = document.getElementById("manResultText");
      copyText.select();
      copyText.setSelectionRange(0, 99999);
      document.execCommand("copy");
      alert("Registration JSON profile code copied!");
    }

    // Submit planned calendar event
    function submitPlannedEvent() {
      const date = document.getElementById("planDate").value;
      const title = document.getElementById("planTitle").value.trim();
      const status = document.getElementById("planStatus").value;
      const warning = document.getElementById("planWarning").value.trim();

      if (!date || !title) {
        alert("Fill date & session title details!");
        return;
      }

      const newEvent = {
        id: "plan-" + Date.now(),
        date: date,
        title: title,
        description: "Scheduled online physics session core course pack topic discussion.",
        status: status,
        warningMessage: status === "cancelled" ? (warning || "⚠️ Session Postponed by Admin Alert!") : ""
      };

      calendarEvents.push(newEvent);
      saveState();
      alert("Physics Calendar Plotted! Day active: " + date);
      
      // Reset Planner Fields
      document.getElementById("planTitle").value = "";
      document.getElementById("planWarning").value = "";
    }

    // Broadcaster Alert submit
    function submitAdAlert() {
      const type = document.getElementById("notType").value;
      const user = document.getElementById("notUser").value.trim();
      const title = document.getElementById("notTitle").value.trim();
      const content = document.getElementById("notContent").value.trim();

      if (!title || !content) {
        alert("Please complete notice headlines and body content details!");
        return;
      }

      const not = {
        id: "not-" + Date.now(),
        title: title,
        content: content,
        date: "2026-05-25", // Simulated live date
        type: type,
        targetUser: type === "private" ? user : ""
      };

      notifications.push(not);
      saveState();
      alert("Broadcasting payload complete! Notices saved.");
      
      // Reset inputs
      document.getElementById("notTitle").value = "";
      document.getElementById("notContent").value = "";
      document.getElementById("notUser").value = "";
    }

    // Initial load setup bootstrapper
    window.onload = function() {
      loadPersistedState();
      runBackgroundSlideCycle();
    };
    
    //]]>
  </script>
</body>
</html>
`;
