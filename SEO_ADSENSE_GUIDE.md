# SEO, Google AdSense & Search Console — Copy-Paste Reference Guide

This guide contains all code snippets for SEO optimization, Google AdSense monetization, and Google Search Console verification. Use this to replicate the setup in new projects.

---

## 📁 File Locations Summary

| Feature | File | Section |
|---------|------|---------|
| SEO Meta Tags | `index.html` | Inside `<head>` |
| Google AdSense Auto-Ads | `index.html` | Inside `<head>` |
| JSON-LD Structured Data | `index.html` | Inside `<head>` |
| Search Console Verification | `public/google65b680a9351df918.html` | Entire file |
| Sitemap | `public/sitemap.xml` | Entire file |
| Robots.txt | `public/robots.txt` | Entire file |
| Ad Banner Component | `src/components/AdBanner.tsx` | Entire file |
| Ad Placements | `src/pages/Tool.tsx` | Search for `<AdBanner` |

---

## 1. SEO Meta Tags (index.html)

**Paste inside `<head>` tag, after `<meta charset>` and `<meta viewport>`:**

```html
<!-- Primary SEO -->
<title>YOUR PAGE TITLE | Your Brand</title>
<meta name="description" content="Your page description (max 160 chars)" />
<meta name="keywords" content="keyword1, keyword2, keyword3" />
<meta name="author" content="Your Name or Brand" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="https://yourdomain.com/" />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://yourdomain.com/" />
<meta property="og:title" content="Your OG Title" />
<meta property="og:description" content="Your OG description" />
<meta property="og:image" content="https://yourdomain.com/og-image.jpg" />
<meta property="og:site_name" content="Your Site Name" />
<meta property="og:locale" content="en_IN" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@YourTwitterHandle" />
<meta name="twitter:title" content="Your Twitter Title" />
<meta name="twitter:description" content="Your Twitter description" />
<meta name="twitter:image" content="https://yourdomain.com/twitter-image.jpg" />

<!-- Additional SEO signals -->
<meta name="theme-color" content="#1E3A5F" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Your App Name" />
<link rel="icon" href="/favicon.ico" />
```

---

## 2. Google AdSense Auto-Ads Script (index.html)

**Paste inside `<head>` tag (anywhere):**

```html
<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_PUBLISHER_ID" crossorigin="anonymous"></script>
```

**Your Publisher ID:** `ca-pub-4027922299691229`

---

## 3. JSON-LD Structured Data (index.html)

**Paste inside `<head>` tag, typically at the end before `</head>`:**

### WebApplication Schema
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Your App Name",
  "alternateName": "Alternate Name",
  "description": "Your app description",
  "url": "https://yourdomain.com",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web Browser",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "INR",
    "description": "Free tier description"
  },
  "creator": {
    "@type": "Organization",
    "name": "Your Company",
    "email": "your@email.com",
    "url": "https://yourdomain.com"
  },
  "featureList": [
    "Feature 1",
    "Feature 2",
    "Feature 3"
  ],
  "screenshot": "https://yourdomain.com/screenshot.jpg"
}
</script>
```

### FAQ Schema (for Google rich snippets)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Your question here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Your answer here."
      }
    },
    {
      "@type": "Question",
      "name": "Another question?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Another answer."
      }
    }
  ]
}
</script>
```

---

## 4. Google Search Console Verification File

**Create file:** `public/google65b680a9351df918.html`

**Content (replace with your verification code from Search Console):**
```
google-site-verification: google65b680a9351df918.html
```

---

## 5. Sitemap (public/sitemap.xml)

**Create file:** `public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yourdomain.com/</loc>
    <lastmod>2026-03-08</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://yourdomain.com/about</loc>
    <lastmod>2026-03-08</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
```

---

## 6. Robots.txt (public/robots.txt)

**Create file:** `public/robots.txt`

```
User-agent: Googlebot
Allow: /
Disallow: /admin

User-agent: Bingbot
Allow: /
Disallow: /admin

User-agent: *
Allow: /
Disallow: /admin

Sitemap: https://yourdomain.com/sitemap.xml
```

---

## 7. AdBanner React Component (src/components/AdBanner.tsx)

**Create file:** `src/components/AdBanner.tsx`

```tsx
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'rectangle';
  className?: string;
}

const AdBanner = ({ slot, format = 'auto', className = '' }: AdBannerProps) => {
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch (e) {
      // AdSense not loaded yet
    }
  }, []);

  return (
    <div className={`ad-banner w-full flex justify-center ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-YOUR_PUBLISHER_ID"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default AdBanner;
```

---

## 8. Using AdBanner in Pages

**Import and use in any page component:**

```tsx
import AdBanner from '@/components/AdBanner';

// In your JSX:
<AdBanner slot="YOUR_AD_SLOT_ID" className="my-4" />
```

**Get slot IDs from:** Google AdSense Dashboard → Ads → By ad unit → Create new or copy existing

---

## 🔑 Your Current IDs

| Service | ID |
|---------|-----|
| AdSense Publisher ID | `ca-pub-4027922299691229` |
| Search Console Verification | `google65b680a9351df918.html` |
| Ad Slot IDs | Get from AdSense dashboard after approval |

---

## ✅ Checklist for New Projects

1. [ ] Add SEO meta tags to `index.html`
2. [ ] Add AdSense script to `index.html`
3. [ ] Add JSON-LD schemas to `index.html`
4. [ ] Create `public/sitemap.xml`
5. [ ] Create `public/robots.txt`
6. [ ] Add Search Console verification file
7. [ ] Create `AdBanner.tsx` component
8. [ ] Place `<AdBanner />` components where needed
9. [ ] Submit sitemap to Google Search Console
10. [ ] Verify site in AdSense dashboard
