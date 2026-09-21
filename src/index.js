// ============================================================
//  سیستم لایسنس افزونه وردپرس روی Cloudflare Worker
//  نسخه: 1.0.0
// ============================================================

// --------------------- توابع کمکی ---------------------

// پاسخ JSON استاندارد
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// تولید کلید لایسنس یکبارمصرف (20 کاراکتر)
function generateLicenseKey() {
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
  // نمونه خروجی: A1B2-C3D4-E5F6-7890
}

// تولید توکن فعال‌سازی (32 کاراکتر hex)
function generateActivationToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// هش کردن دامنه (برای ذخیره امن در دیتابیس)
async function hashDomain(domain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(domain.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// بررسی هدر احراز هویت ادمین
function isAdmin(request, env) {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.ADMIN_SECRET}`;
}

// --------------------- روتر اصلی ---------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS برای درخواست‌های cross-origin
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
      // ============ مسیرهای ادمین (نیاز به ADMIN_SECRET) ============

      // 1. تولید کلید لایسنس یکبارمصرف
      if (path === '/admin/generate' && method === 'POST') {
        if (!isAdmin(request, env)) {
          return json({ error: 'Unauthorized' }, 401);
        }
        return await handleGenerateLicense(request, env);
      }

      // 2. مشاهده اطلاعات یک لایسنس
      if (path === '/admin/license-info' && method === 'GET') {
        if (!isAdmin(request, env)) {
          return json({ error: 'Unauthorized' }, 401);
        }
        const licenseKey = url.searchParams.get('key');
        return await handleLicenseInfo(licenseKey, env);
      }

      // 3. ابطال لایسنس
      if (path === '/admin/revoke' && method === 'POST') {
        if (!isAdmin(request, env)) {
          return json({ error: 'Unauthorized' }, 401);
        }
        return await handleRevokeLicense(request, env);
      }

      // ============ مسیرهای عمومی (برای افزونه وردپرس) ============

      // 4. فعال‌سازی لایسنس روی دامنه
      if (path === '/activate' && method === 'POST') {
        return await handleActivate(request, env);
      }

      // 5. اعتبارسنجی دوره‌ای
      if (path === '/validate' && method === 'POST') {
        return await handleValidate(request, env);
      }

      // 6. آزادسازی دامنه (انتقال به سایت دیگر)
      if (path === '/deactivate' && method === 'POST') {
        return await handleDeactivate(request, env);
      }

      // ============ صفحه تست سلامت سرویس ============
      if (path === '/' && method === 'GET') {
        return json({
          status: 'ok',
          service: 'License Server',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        });
      }

      return json({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('Worker Error:', err);
      return json({ error: 'Internal Server Error', message: err.message }, 500);
    }
  },
};

// ============================================================
//  HANDLER ها
// ============================================================

// --------------------- تولید کلید لایسنس (ادمین) ---------------------
async function handleGenerateLicense(request, env) {
  const body = await request.json();
  const { email, product_slug, expires_at } = body;

  if (!email || !product_slug) {
    return json({ error: 'email و product_slug الزامی هستند' }, 400);
  }

  const licenseKey = generateLicenseKey();

  // ذخیره لایسنس در D1
  await env.DB.prepare(
    `INSERT INTO licenses (license_key, customer_email, product_slug, status, expires_at)
     VALUES (?, ?, ?, 'active', ?)`
  )
    .bind(licenseKey, email, product_slug, expires_at || null)
    .run();

  // ذخیره در KV با TTL 24 ساعته برای فعال‌سازی سریع
  await env.LICENSE_KV.put(
    `otp:${licenseKey}`,
    JSON.stringify({ email, product_slug, created_at: Date.now() }),
    { expirationTtl: 86400 } // 24 ساعت
  );

  return json({
    success: true,
    license_key: licenseKey,
    email,
    product_slug,
    message: 'کلید لایسنس تولید شد. ظرف ۲۴ ساعت فعال‌سازی کنید.',
  });
}

// --------------------- فعال‌سازی لایسنس (افزونه) ---------------------
async function handleActivate(request, env) {
  const body = await request.json();
  const { license_key, domain, product_slug } = body;

  if (!license_key || !domain || !product_slug) {
    return json({ error: 'license_key، domain و product_slug الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);
  const now = Date.now();

  // 1. بررسی وجود لایسنس در D1
  const license = await env.DB.prepare(
    `SELECT * FROM licenses WHERE license_key = ? AND product_slug = ? AND status = 'active'`
  )
    .bind(license_key, product_slug)
    .first();

  if (!license) {
    return json({ error: 'لایسنس نامعتبر یا منقضی شده است' }, 400);
  }

  // 2. بررسی انقضا
  if (license.expires_at && new Date(license.expires_at).getTime() < now) {
    return json({ error: 'لایسنس منقضی شده است' }, 400);
  }

  // 3. بررسی اینکه آیا قبلاً روی دامنه دیگری فعال شده؟
  if (license.domain && license.domain !== domainHash) {
    return json({
      error: 'این لایسنس قبلاً روی دامنه دیگری فعال شده است. ابتدا آن را آزاد کنید.',
      current_domain: license.domain,
    }, 400);
  }

  // 4. بررسی توکن یکبارمصرف در KV
  const otp = await env.LICENSE_KV.get(`otp:${license_key}`);
  if (!otp) {
    // اگر توکن یکبارمصرف منقضی شده، ولی لایسنس در D1 فعال است
    // (برای فعال‌سازی مجدد روی همان دامنه)
    if (license.domain === domainHash && license.activation_token) {
      return json({
        success: true,
        activation_token: license.activation_token,
        domain,
        message: 'لایسنس قبلاً روی این دامنه فعال شده است.',
      });
    }
    return json({ error: 'کلید فعال‌سازی منقضی شده است. لطفاً کلید جدیدی دریافت کنید.' }, 400);
  }

  // 5. تولید توکن فعال‌سازی پایدار
  const activationToken = generateActivationToken();

  // 6. به‌روزرسانی D1
  await env.DB.prepare(
    `UPDATE licenses
     SET domain = ?, activation_token = ?, last_validated_at = ?
     WHERE license_key = ?`
  )
    .bind(domainHash, activationToken, now, license_key)
    .run();

  // 7. حذف توکن یکبارمصرف از KV (مهم: یکبارمصرف است)
  await env.LICENSE_KV.delete(`otp:${license_key}`);

  // 8. ذخیره توکن فعال‌سازی در KV برای اعتبارسنجی سریع (TTL: ۷ روز)
  await env.LICENSE_KV.put(
    `token:${activationToken}`,
    JSON.stringify({
      license_key,
      domain_hash: domainHash,
      product_slug,
      activated_at: now,
    }),
    { expirationTtl: 604800 } // ۷ روز
  );

  return json({
    success: true,
    activation_token: activationToken,
    domain,
    message: 'لایسنس با موفقیت فعال شد.',
  });
}

// --------------------- اعتبارسنجی دوره‌ای (افزونه) ---------------------
async function handleValidate(request, env) {
  const body = await request.json();
  const { activation_token, domain, product_slug } = body;

  if (!activation_token || !domain) {
    return json({ error: 'activation_token و domain الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);

  // 1. بررسی کش KV (برای کاهش بار روی D1)
  const cacheKey = `validate:${activation_token}:${domainHash}`;
  const cached = await env.LICENSE_KV.get(cacheKey);
  if (cached) {
    const cachedData = JSON.parse(cached);
    if (Date.now() - cachedData.timestamp < 60000) {
      // 60 ثانیه کش
      return json(cachedData.data);
    }
  }

  // 2. بررسی در D1
  const license = await env.DB.prepare(
    `SELECT * FROM licenses
     WHERE activation_token = ? AND domain = ? AND status = 'active'`
  )
    .bind(activation_token, domainHash)
    .first();

  if (!license) {
    return json({ valid: false, error: 'لایسنس نامعتبر یا غیرفعال شده است' }, 400);
  }

  // 3. بررسی انقضا
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return json({ valid: false, error: 'لایسنس منقضی شده است' }, 400);
  }

  // 4. به‌روزرسانی زمان آخرین اعتبارسنجی
  await env.DB.prepare(
    `UPDATE licenses SET last_validated_at = ? WHERE id = ?`
  )
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

  // 5. ذخیره در KV برای کش ۶۰ ثانیه‌ای
  await env.LICENSE_KV.put(
    cacheKey,
    JSON.stringify({ timestamp: Date.now(), data: result }),
    { expirationTtl: 60 }
  );

  return json(result);
}

// --------------------- آزادسازی دامنه (افزونه) ---------------------
async function handleDeactivate(request, env) {
  const body = await request.json();
  const { activation_token, domain } = body;

  if (!activation_token || !domain) {
    return json({ error: 'activation_token و domain الزامی هستند' }, 400);
  }

  const domainHash = await hashDomain(domain);

  // حذف توکن فعال‌سازی و آزادسازی دامنه
  const result = await env.DB.prepare(
    `UPDATE licenses
     SET domain = NULL, activation_token = NULL
     WHERE activation_token = ? AND domain = ?`
  )
    .bind(activation_token, domainHash)
    .run();

  if (result.changes === 0) {
    return json({ error: 'لایسنس فعال روی این دامنه یافت نشد' }, 400);
  }

  // حذف از KV
  await env.LICENSE_KV.delete(`token:${activation_token}`);

  return json({ success: true, message: 'دامنه با موفقیت آزاد شد.' });
}

// --------------------- مشاهده اطلاعات لایسنس (ادمین) ---------------------
async function handleLicenseInfo(licenseKey, env) {
  if (!licenseKey) {
    return json({ error: 'key الزامی است' }, 400);
  }

  const license = await env.DB.prepare(
    `SELECT * FROM licenses WHERE license_key = ?`
  )
    .bind(licenseKey)
    .first();

  if (!license) {
    return json({ error: 'لایسنس یافت نشد' }, 404);
  }

  return json({ success: true, license });
}

// --------------------- ابطال لایسنس (ادمین) ---------------------
async function handleRevokeLicense(request, env) {
  const body = await request.json();
  const { license_key } = body;

  if (!license_key) {
    return json({ error: 'license_key الزامی است' }, 400);
  }

  await env.DB.prepare(
    `UPDATE licenses SET status = 'revoked', domain = NULL, activation_token = NULL
     WHERE license_key = ?`
  )
    .bind(license_key)
    .run();

  await env.LICENSE_KV.delete(`otp:${license_key}`);

  return json({ success: true, message: 'لایسنس ابطال شد.' });
              }
