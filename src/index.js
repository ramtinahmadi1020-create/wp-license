// ============================================================
//  سیستم لایسنس افزونه وردپرس روی Cloudflare Worker
//  نسخه: 2.0.0
//  شامل: صفحه فرود، خرید، دریافت لایسنس، کپی، فعال‌سازی
// ============================================================

// --------------------- توابع کمکی ---------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function generateLicenseKey() {
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
}

function generateActivationToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashDomain(domain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(domain.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isAdmin(request, env) {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.ADMIN_SECRET}`;
}

// --------------------- قالب پایه HTML ---------------------

function baseStyles() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #4F46E5;
      --primary-dark: #4338CA;
      --primary-light: #EEF2FF;
      --text: #111827;
      --text-muted: #6B7280;
      --bg: #F9FAFB;
      --white: #FFFFFF;
      --border: #E5E7EB;
      --success: #10B981;
      --success-light: #ECFDF5;
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    }
    body {
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .navbar {
      background: rgba(255,255,255,0.95);
      border-bottom: 1px solid var(--border);
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(10px);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 17px;
      color: var(--text);
      text-decoration: none;
    }
    .logo svg { color: var(--primary); }
    .nav-links { display: flex; gap: 20px; align-items: center; }
    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--primary); }
    .btn-login {
      background: var(--primary-light);
      color: var(--primary) !important;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      width: 100%;
    }
    .footer {
      background: #111827;
      color: #9CA3AF;
      padding: 24px;
      text-align: center;
      font-size: 12px;
      margin-top: auto;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
      padding: 14px 28px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: var(--shadow);
      font-family: inherit;
    }
    .btn-primary:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
      box-shadow: var(--shadow-lg);
    }
    .btn-secondary {
      background: var(--white);
      color: var(--text);
      padding: 14px 28px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .btn-secondary:hover { background: var(--bg); border-color: #D1D5DB; }
    @media (max-width: 700px) {
      .navbar { padding: 14px 16px; }
      .nav-links a:not(.btn-login) { display: none; }
    }
  `;
}

// --------------------- صفحه فرود ---------------------

function renderLandingPage() {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>سیستم لایسنس‌گذاری | افزونه امنیتی</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${baseStyles()}
.hero { flex: 1; display: flex; align-items: center; justify-content: center; padding: 60px 24px 40px; }
.hero-container { max-width: 1100px; width: 100%; display: grid; grid-template-columns: 1.1fr 1fr; gap: 60px; align-items: center; }
.hero-content h1 { font-size: 42px; font-weight: 800; line-height: 1.3; margin-bottom: 20px; letter-spacing: -0.02em; }
.hero-content h1 span { background: linear-gradient(135deg, var(--primary) 0%, #7C3AED 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-content p { font-size: 16px; color: var(--text-muted); margin-bottom: 30px; max-width: 500px; }
.hero-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.hero-visual { display: flex; justify-content: center; align-items: center; }
.shield-card { background: var(--white); border-radius: 24px; padding: 36px; box-shadow: var(--shadow-lg); border: 1px solid var(--border); width: 100%; max-width: 400px; position: relative; overflow: hidden; }
.shield-card::before { content: ''; position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(79,70,229,0.08) 0%, transparent 70%); pointer-events: none; }
.shield-icon-wrapper { width: 72px; height: 72px; background: var(--primary-light); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: var(--primary); position: relative; }
.shield-card h3 { font-size: 19px; font-weight: 700; margin-bottom: 10px; }
.shield-card p { color: var(--text-muted); font-size: 14px; margin-bottom: 20px; }
.status-row { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; color: var(--success); font-size: 13px; font-weight: 500; }
.status-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.features { background: var(--white); padding: 70px 24px; border-top: 1px solid var(--border); }
.features-container { max-width: 1100px; margin: 0 auto; }
.section-header { text-align: center; margin-bottom: 50px; }
.section-header h2 { font-size: 30px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.02em; }
.section-header p { color: var(--text-muted); font-size: 15px; max-width: 600px; margin: 0 auto; }
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.feature-card { background: var(--white); border: 1px solid var(--border); border-radius: 14px; padding: 24px; transition: all 0.25s; }
.feature-card:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.feature-icon { width: 44px; height: 44px; background: var(--primary-light); border-radius: 11px; display: flex; align-items: center; justify-content: center; color: var(--primary); margin-bottom: 16px; }
.feature-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.feature-card p { color: var(--text-muted); font-size: 13px; line-height: 1.7; }
.cta { padding: 70px 24px; text-align: center; background: linear-gradient(135deg, #F9FAFB 0%, #EEF2FF 100%); }
.cta h2 { font-size: 28px; font-weight: 800; margin-bottom: 12px; }
.cta p { color: var(--text-muted); margin-bottom: 26px; font-size: 15px; }
@media (max-width: 900px) {
  .hero-container { grid-template-columns: 1fr; gap: 40px; }
  .hero-content h1 { font-size: 30px; }
  .features-grid { grid-template-columns: 1fr; }
  .hero { padding: 40px 20px; }
}
</style>
</head>
<body>

<nav class="navbar">
  <a href="/" class="logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    سیستم لایسنس
  </a>
  <div class="nav-links">
    <a href="#features">امکانات</a>
    <a href="/buy" class="btn-login">دریافت لایسنس</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-container">
    <div class="hero-content">
      <h1>سیستم <span>لایسنس‌گذاری</span> حرفه‌ای برای افزونه وردپرس</h1>
      <p>با یک کلیک، لایسنس اختصاصی برای افزونه خود بسازید. سیستم محافظت پیشرفته، قفل دامنه، و اعتبارسنجی خودکار از راه دور.</p>
      <div class="hero-buttons">
        <a href="/buy" class="btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          دریافت لایسنس
        </a>
        <a href="#features" class="btn-secondary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          اطلاعات بیشتر
        </a>
      </div>
    </div>

    <div class="hero-visual">
      <div class="shield-card">
        <div class="shield-icon-wrapper">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <h3>محافظت پیشرفته</h3>
        <p>سیستم چندلایه امنیتی با قفل دامنه، بررسی یکپارچگی فایل، و اعتبارسنجی از راه دور.</p>
        <div class="status-row">
          <span class="status-dot"></span>
          <span>سرور فعال و آماده سرویس‌دهی</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="features" id="features">
  <div class="features-container">
    <div class="section-header">
      <h2>چرا سیستم لایسنس ما؟</h2>
      <p>ترکیبی از امنیت، سرعت، و سادگی برای محافظت از محصول شما</p>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3>قفل دامنه</h3>
        <p>هر لایسنس فقط روی یک دامنه کار می‌کند. کپی فایل‌ها روی سایت دیگر بی‌فایده است.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h3>محافظت چندلایه</h3>
        <p>ترکیب بررسی‌های پراکنده، یکپارچگی فایل، و اعتبارسنجی خودکار ضدکرک.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <h3>سرعت بالا</h3>
        <p>اجرا روی شبکه جهانی Cloudflare با پاسخ‌دهی زیر ۵۰ میلی‌ثانیه در سراسر جهان.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h3>اعتبارسنجی خودکار</h3>
        <p>بررسی خودکار لایسنس هر ۱۲ ساعت با مکانیزم Fail-Graceful برای پایداری.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <h3>مستندات کامل</h3>
        <p>راهنمای نصب و راه‌اندازی گام‌به‌گام برای اتصال افزونه به سیستم لایسنس.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h3>پشتیبانی</h3>
        <p>پشتیبانی فنی برای راه‌اندازی و رفع اشکال در تمام مراحل.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta">
  <h2>آماده شروع هستید؟</h2>
  <p>همین حالا لایسنس خود را دریافت کنید و از محافظت کامل بهره‌مند شوید</p>
  <a href="/buy" class="btn-primary">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    دریافت لایسنس
  </a>
</section>

<footer class="footer">
  <p>© 2026 سیستم لایسنس‌گذاری | تمام حقوق محفوظ است</p>
</footer>

</body>
</html>`;
}

// --------------------- صفحه خرید (فرم ایمیل) ---------------------

function renderBuyPage() {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>دریافت لایسنس | سیستم لایسنس</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${baseStyles()}
.main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 50px 20px; }
.card { background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 44px; max-width: 480px; width: 100%; box-shadow: var(--shadow-lg); }
.card-icon { width: 64px; height: 64px; background: var(--primary-light); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--primary); margin: 0 auto 24px; }
.card h1 { font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 8px; }
.card .subtitle { text-align: center; color: var(--text-muted); font-size: 14px; margin-bottom: 32px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text); }
.form-group input { width: 100%; padding: 13px 16px; border: 1px solid var(--border); border-radius: 10px; font-size: 15px; font-family: inherit; background: var(--white); transition: all 0.2s; direction: ltr; text-align: left; }
.form-group input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79,70,229,0.1); }
.form-group input::placeholder { color: #9CA3AF; }
.notice { background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #92400E; margin-bottom: 24px; line-height: 1.7; display: flex; gap: 10px; align-items: flex-start; }
.notice svg { flex-shrink: 0; margin-top: 2px; }
.submit-btn { width: 100%; padding: 15px; font-size: 15px; }
.terms { text-align: center; font-size: 12px; color: var(--text-muted); margin-top: 20px; }
</style>
</head>
<body>

<nav class="navbar">
  <a href="/" class="logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    سیستم لایسنس
  </a>
  <div class="nav-links">
    <a href="/">صفحه اصلی</a>
    <a href="/buy" class="btn-login">دریافت لایسنس</a>
  </div>
</nav>

<div class="main">
  <div class="card">
    <div class="card-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <h1>دریافت لایسنس</h1>
    <p class="subtitle">ایمیل خود را وارد کنید تا کلید فعال‌سازی برایتان صادر شود</p>

    <div class="notice">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>این لایسنس به ایمیل شما اختصاص داده می‌شود و فقط روی یک دامنه قابل فعال‌سازی است.</span>
    </div>

    <form method="POST" action="/buy">
      <div class="form-group">
        <label for="email">آدرس ایمیل</label>
        <input type="email" id="email" name="email" placeholder="your@email.com" required autofocus>
      </div>
      <button type="submit" class="btn-primary submit-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        دریافت کلید لایسنس
      </button>
    </form>

    <p class="terms">با دریافت لایسنس، قوانین و شرایط استفاده را می‌پذیرید.</p>
  </div>
</div>

<footer class="footer">
  <p>© 2026 سیستم لایسنس‌گذاری | تمام حقوق محفوظ است</p>
</footer>

</body>
</html>`;
}

// --------------------- صفحه نمایش لایسنس (با دکمه کپی) ---------------------

function renderSuccessPage(licenseKey, email) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لایسنس شما صادر شد | سیستم لایسنس</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${baseStyles()}
.main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 50px 20px; }
.card { background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 44px; max-width: 560px; width: 100%; box-shadow: var(--shadow-lg); }
.success-icon { width: 72px; height: 72px; background: var(--success-light); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--success); margin: 0 auto 20px; }
.card h1 { font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 8px; }
.card .subtitle { text-align: center; color: var(--text-muted); font-size: 14px; margin-bottom: 32px; }
.key-box { background: #F9FAFB; border: 2px dashed var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.key-label { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; text-align: center; letter-spacing: 0.05em; text-transform: uppercase; }
.key-value { font-family: 'Courier New', monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: var(--text); text-align: center; direction: ltr; word-break: break-all; padding: 8px 0; }
.copy-btn { width: 100%; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
.copy-btn:hover { background: var(--primary-dark); }
.copy-btn.copied { background: var(--success); }
.email-info { background: var(--primary-light); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: var(--primary-dark); margin-bottom: 24px; text-align: center; }
.steps { background: #F9FAFB; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
.steps-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; color: var(--text); }
.step { display: flex; gap: 12px; margin-bottom: 12px; font-size: 13px; color: var(--text-muted); line-height: 1.7; }
.step:last-child { margin-bottom: 0; }
.step-num { width: 22px; height: 22px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.actions { display: flex; gap: 10px; }
.actions a { flex: 1; padding: 13px; font-size: 14px; }
</style>
</head>
<body>

<nav class="navbar">
  <a href="/" class="logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    سیستم لایسنس
  </a>
</nav>

<div class="main">
  <div class="card">
    <div class="success-icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h1>لایسنس شما صادر شد</h1>
    <p class="subtitle">اکنون می‌توانید کلید زیر را کپی کرده و در افزونه وارد کنید</p>

    <div class="email-info">
      این لایسنس به ایمیل <strong>${email}</strong> اختصاص یافته است
    </div>

    <div class="key-box">
      <div class="key-label">کلید لایسنس شما</div>
      <div class="key-value" id="licenseKey">${licenseKey}</div>
    </div>

    <button class="copy-btn" id="copyBtn" onclick="copyKey()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
      </svg>
      <span id="copyText">کپی کلید لایسنس</span>
    </button>

    <div class="steps" style="margin-top: 24px;">
      <div class="steps-title">مراحل فعال‌سازی:</div>
      <div class="step">
        <div class="step-num">۱</div>
        <div>وارد پیشخوان وردپرس خود شوید</div>
      </div>
      <div class="step">
        <div class="step-num">۲</div>
        <div>از منوی سمت راست، گزینه «فعال‌سازی افزونه» را انتخاب کنید</div>
      </div>
      <div class="step">
        <div class="step-num">۳</div>
        <div>کلید لایسنس را در فیلد مربوطه پیست کرده و دکمه فعال‌سازی را بزنید</div>
      </div>
    </div>

    <div class="actions">
      <a href="/" class="btn-secondary">صفحه اصلی</a>
      <a href="/buy" class="btn-primary">دریافت لایسنس جدید</a>
    </div>
  </div>
</div>

<footer class="footer">
  <p>© 2026 سیستم لایسنس‌گذاری | تمام حقوق محفوظ است</p>
</footer>

<script>
async function copyKey() {
  const key = document.getElementById('licenseKey').innerText;
  const btn = document.getElementById('copyBtn');
  const text = document.getElementById('copyText');
  
  try {
    await navigator.clipboard.writeText(key);
  } catch (err) {
    // فالبک برای مرورگرهای قدیمی
    const range = document.createRange();
    range.selectNode(document.getElementById('licenseKey'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
  }
  
  btn.classList.add('copied');
  text.innerText = 'کپی شد!';
  
  setTimeout(() => {
    btn.classList.remove('copied');
    text.innerText = 'کپی کلید لایسنس';
  }, 2000);
}
</script>

</body>
</html>`;
}

// --------------------- صفحه خطا ---------------------

function renderErrorPage(title, message) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>خطا | سیستم لایسنس</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
${baseStyles()}
.main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 50px 20px; }
.card { background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 44px; max-width: 460px; width: 100%; box-shadow: var(--shadow-lg); text-align: center; }
.error-icon { width: 72px; height: 72px; background: #FEF2F2; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #EF4444; margin: 0 auto 20px; }
.card h1 { font-size: 22px; font-weight: 800; margin-bottom: 10px; }
.card p { color: var(--text-muted); font-size: 14px; margin-bottom: 28px; line-height: 1.7; }
</style>
</head>
<body>

<nav class="navbar">
  <a href="/" class="logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    سیستم لایسنس
  </a>
</nav>

<div class="main">
  <div class="card">
    <div class="error-icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/buy" class="btn-primary">تلاش مجدد</a>
  </div>
</div>

<footer class="footer">
  <p>© 2026 سیستم لایسنس‌گذاری | تمام حقوق محفوظ است</p>
</footer>

</body>
</html>`;
}

// ============================================================
//  Worker Router
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      // ============ صفحات کاربری ============

      // صفحه فرود
      if (path === '/' && method === 'GET') {
        return html(renderLandingPage());
      }

      // صفحه خرید (فرم ایمیل) - GET
      if (path === '/buy' && method === 'GET') {
        return html(renderBuyPage());
      }

      // صفحه خرید - POST (پردازش ایمیل و صدور لایسنس)
      if (path === '/buy' && method === 'POST') {
        return await handleBuy(request, env);
      }

      // ============ API برای افزونه وردپرس ============

      if (path === '/activate' && method === 'POST') {
        return await handleActivate(request, env);
      }

      if (path === '/validate' && method === 'POST') {
        return await handleValidate(request, env);
      }

      if (path === '/deactivate' && method === 'POST') {
        return await handleDeactivate(request, env);
      }

      // ============ مسیرهای ادمین ============

      if (path === '/admin/generate' && method === 'POST') {
        if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleGenerateLicense(request, env);
      }

      if (path === '/admin/license-info' && method === 'GET') {
        if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const licenseKey = url.searchParams.get('key');
        return await handleLicenseInfo(licenseKey, env);
      }

      if (path === '/admin/revoke' && method === 'POST') {
        if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleRevokeLicense(request, env);
      }

      // صفحه سلامت سرویس
      if (path === '/health' && method === 'GET') {
        return json({ status: 'ok', service: 'License Server', version: '2.0.0' });
      }

      return html(renderErrorPage('صفحه یافت نشد', 'آدرسی که وارد کرده‌اید در سرور ما وجود ندارد.'), 404);
    } catch (err) {
      console.error('Worker Error:', err);
      return html(renderErrorPage('خطای داخلی سرور', 'مشکلی در پردازش درخواست رخ داد. لطفاً دوباره تلاش کنید.'), 500);
    }
  },
};

// ============================================================
//  HANDLERS
// ============================================================

// --------------------- خرید (صدور لایسنس از سایت) ---------------------
async function handleBuy(request, env) {
  let email;

  // پشتیبانی از form-urlencoded (مرورگر) و JSON
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    email = body.email;
  } else {
    const formData = await request.formData();
    email = formData.get('email');
  }

  if (!email || !email.includes('@')) {
    return html(renderErrorPage('ایمیل نامعتبر', 'لطفاً یک آدرس ایمیل صحیح وارد کنید.'), 400);
  }

  email = email.trim().toLowerCase();

  // بررسی اینکه این ایمیل قبلاً لایسنس فعال دارد یا نه
  const existing = await env.DB.prepare(
    `SELECT license_key, domain FROM licenses WHERE customer_email = ? AND status = 'active' LIMIT 1`
  )
    .bind(email)
    .first();

  let licenseKey;

  if (existing) {
    // اگر کاربر قبلاً لایسنس دارد، همان را برگردان
    licenseKey = existing.license_key;
  } else {
    // تولید لایسنس جدید
    licenseKey = generateLicenseKey();

    await env.DB.prepare(
      `INSERT INTO licenses (license_key, customer_email, product_slug, status)
       VALUES (?, ?, 'wp-security', 'active')`
    )
      .bind(licenseKey, email)
      .run();
  }

  // ذخیره در KV برای فعال‌سازی سریع (TTL 24 ساعته)
  await env.LICENSE_KV.put(
    `otp:${licenseKey}`,
    JSON.stringify({ email, product_slug: 'wp-security', created_at: Date.now() }),
    { expirationTtl: 86400 }
  );

  return html(renderSuccessPage(licenseKey, email));
}

// --------------------- فعال‌سازی لایسنس ---------------------
async function handleActivate(request, env) {
  const body = await request.json();
  const { license_key, domain, product_slug } = body;

  if (!license_key || !domain || !product_slug) {
    return json({ error: 'license_key، domain و product_slug الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);
  const now = Date.now();

  const license = await env.DB.prepare(
    `SELECT * FROM licenses WHERE license_key = ? AND product_slug = ? AND status = 'active'`
  )
    .bind(license_key, product_slug)
    .first();

  if (!license) {
    return json({ error: 'لایسنس نامعتبر یا منقضی شده است' }, 400);
  }

  if (license.expires_at && new Date(license.expires_at).getTime() < now) {
    return json({ error: 'لایسنس منقضی شده است' }, 400);
  }

  if (license.domain && license.domain !== domainHash) {
    return json({
      error: 'این لایسنس قبلاً روی دامنه دیگری فعال شده است. ابتدا آن را آزاد کنید.',
    }, 400);
  }

  // اگر روی همین دامنه قبلاً فعال شده، همان توکن را برگردان
  if (license.domain === domainHash && license.activation_token) {
    return json({
      success: true,
      activation_token: license.activation_token,
      domain,
      message: 'لایسنس قبلاً روی این دامنه فعال شده است.',
    });
  }

  // بررسی توکن یکبارمصرف در KV
  const otp = await env.LICENSE_KV.get(`otp:${license_key}`);
  if (!otp) {
    return json({ error: 'کلید فعال‌سازی منقضی شده است. لطفاً کلید جدیدی دریافت کنید.' }, 400);
  }

  const activationToken = generateActivationToken();

  await env.DB.prepare(
    `UPDATE licenses SET domain = ?, activation_token = ?, last_validated_at = ?
     WHERE license_key = ?`
  )
    .bind(domainHash, activationToken, now, license_key)
    .run();

  await env.LICENSE_KV.delete(`otp:${license_key}`);

  await env.LICENSE_KV.put(
    `token:${activationToken}`,
    JSON.stringify({ license_key, domain_hash: domainHash, product_slug, activated_at: now }),
    { expirationTtl: 604800 }
  );

  return json({
    success: true,
    activation_token: activationToken,
    domain,
    message: 'لایسنس با موفقیت فعال شد.',
  });
}

// --------------------- اعتبارسنجی ---------------------
async function handleValidate(request, env) {
  const body = await request.json();
  const { activation_token, domain, product_slug } = body;

  if (!activation_token || !domain) {
    return json({ error: 'activation_token و domain الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);

  const cacheKey = `validate:${activation_token}:${domainHash}`;
  const cached = await env.LICENSE_KV.get(cacheKey);
  if (cached) {
    const cachedData = JSON.parse(cached);
    if (Date.now() - cachedData.timestamp < 60000) {
      return json(cachedData.data);
    }
  }

  const license = await env.DB.prepare(
    `SELECT * FROM licenses WHERE activation_token = ? AND domain = ? AND status = 'active'`
  )
    .bind(activation_token, domainHash)
    .first();

  if (!license) {
    return json({ valid: false, error: 'لایسنس نامعتبر یا غیرفعال شده است' }, 400);
  }

  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return json({ valid: false, error: 'لایسنس منقضی شده است' }, 400);
  }

  await env.DB.prepare(`UPDATE licenses SET last_validated_at = ? WHERE id = ?`)
    .bind(Date.now(), license.id)
    .run();

  const result = {
    valid: true,
    license_key: license.license_key,
    product_slug: license.product_slug,
    expires_at: license.expires_at,
    domain,
    validated_at: new Date().toISOString(),
  };

  await env.LICENSE_KV.put(
    cacheKey,
    JSON.stringify({ timestamp: Date.now(), data: result }),
    { expirationTtl: 60 }
  );

  return json(result);
}

// --------------------- آزادسازی ---------------------
async function handleDeactivate(request, env) {
  const body = await request.json();
  const { activation_token, domain } = body;

  if (!activation_token || !domain) {
    return json({ error: 'activation_token و domain الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);

  const result = await env.DB.prepare(
    `UPDATE licenses SET domain = NULL, activation_token = NULL
     WHERE activation_token = ? AND domain = ?`
  )
    .bind(activation_token, domainHash)
    .run();

  if (result.changes === 0) {
    return json({ error: 'لایسنس فعال روی این دامنه یافت نشد' }, 400);
  }

  await env.LICENSE_KV.delete(`token:${activation_token}`);
  return json({ success: true, message: 'دامنه با موفقیت آزاد شد.' });
}

// --------------------- ادمین: تولید لایسنس ---------------------
async function handleGenerateLicense(request, env) {
  const body = await request.json();
  const { email, product_slug, expires_at } = body;

  if (!email || !product_slug) {
    return json({ error: 'email و product_slug الزامی هستند' }, 400);
  }

  const licenseKey = generateLicenseKey();

  await env.DB.prepare(
    `INSERT INTO licenses (license_key, customer_email, product_slug, status, expires_at)
     VALUES (?, ?, ?, 'active', ?)`
  )
    .bind(licenseKey, email, product_slug, expires_at || null)
    .run();

  await env.LICENSE_KV.put(
    `otp:${licenseKey}`,
    JSON.stringify({ email, product_slug, created_at: Date.now() }),
    { expirationTtl: 86400 }
  );

  return json({
    success: true,
    license_key: licenseKey,
    email,
    product_slug,
    message: 'کلید لایسنس تولید شد. ظرف ۲۴ ساعت فعال‌سازی کنید.',
  });
}

// --------------------- ادمین: اطلاعات لایسنس ---------------------
async function handleLicenseInfo(licenseKey, env) {
  if (!licenseKey) return json({ error: 'key الزامی است' }, 400);

  const license = await env.DB.prepare(
    `SELECT * FROM licenses WHERE license_key = ?`
  )
    .bind(licenseKey)
    .first();

  if (!license) return json({ error: 'لایسنس یافت نشد' }, 404);
  return json({ success: true, license });
}

// --------------------- ادمین: ابطال لایسنس ---------------------
async function handleRevokeLicense(request, env) {
  const body = await request.json();
  const { license_key } = body;

  if (!license_key) return json({ error: 'license_key الزامی است' }, 400);

  await env.DB.prepare(
    `UPDATE licenses SET status = 'revoked', domain = NULL, activation_token = NULL
     WHERE license_key = ?`
  )
    .bind(license_key)
    .run();

  await env.LICENSE_KV.delete(`otp:${license_key}`);
  return json({ success: true, message: 'لایسنس ابطال شد.' });
}
