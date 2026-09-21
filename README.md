# Cloudflare License Server

سیستم لایسنس افزونه وردپرس روی Cloudflare Workers + D1 + KV.

## امکانات
- تولید کلید لایسنس یکبارمصرف
- فعال‌سازی روی یک دامنه (Site-Locked)
- اعتبارسنجی دوره‌ای با کش KV
- آزادسازی دامنه برای انتقال
- ابطال لایسنس توسط ادمین

## دیپلوی سریع

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ramtinahmadi1020-create/wp-license)

## متغیرهای محیطی مورد نیاز
- `ADMIN_SECRET`: کلید مخفی برای مسیرهای ادمین
