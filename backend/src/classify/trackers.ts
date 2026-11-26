import type { Tracker } from '../scans/model.ts';

// Layer 2: the tracker intelligence library. A request or cookie matches an entry when its hostname
// equals one of the entry's domains or is a subdomain of it.
// shortcut: kept in code, not in the database; move it to a table when the "Tracker library" screen
// lets people classify unknown domains.
export const TRACKERS: Tracker[] = [
  // Analytics
  { id: 'ga4', name: 'Google Analytics 4', provider: 'Google', category: 'Analytics', description: 'Measures visits and behaviour. Sends page views and events to Google.', domains: ['google-analytics.com', 'analytics.google.com'] },
  { id: 'hotjar', name: 'Hotjar', provider: 'Hotjar', category: 'Analytics', description: 'Session recording and heatmaps. Can capture clicks, scrolling and form interaction.', domains: ['hotjar.com', 'hotjar.io'] },
  { id: 'clarity', name: 'Microsoft Clarity', provider: 'Microsoft', category: 'Analytics', description: 'Session recording and heatmaps.', domains: ['clarity.ms'] },
  { id: 'segment', name: 'Segment', provider: 'Twilio', category: 'Analytics', description: 'Collects events and forwards them to other analytics and marketing tools.', domains: ['segment.com', 'segment.io'] },
  { id: 'mixpanel', name: 'Mixpanel', provider: 'Mixpanel', category: 'Analytics', description: 'Product analytics: tracks events and user journeys.', domains: ['mixpanel.com'] },
  { id: 'amplitude', name: 'Amplitude', provider: 'Amplitude', category: 'Analytics', description: 'Product analytics: tracks events and user journeys.', domains: ['amplitude.com'] },
  { id: 'matomo-cloud', name: 'Matomo Cloud', provider: 'InnoCraft', category: 'Analytics', description: 'Web analytics, hosted by Matomo.', domains: ['matomo.cloud'] },
  { id: 'plausible', name: 'Plausible', provider: 'Plausible Insights', category: 'Analytics', description: 'Cookieless web analytics. Still sends each page view to a third party.', domains: ['plausible.io'] },
  { id: 'comscore', name: 'Comscore', provider: 'Comscore', category: 'Analytics', description: 'Audience measurement across sites.', domains: ['scorecardresearch.com'] },
  // Advertising
  { id: 'doubleclick', name: 'DoubleClick', provider: 'Google', category: 'Advertising', description: 'Ad serving, conversion and retargeting for Google advertising.', domains: ['doubleclick.net'] },
  { id: 'google-ads', name: 'Google Ads', provider: 'Google', category: 'Advertising', description: 'Ad conversion tracking and remarketing.', domains: ['googleadservices.com', 'googlesyndication.com'] },
  { id: 'microsoft-ads', name: 'Microsoft Advertising', provider: 'Microsoft', category: 'Advertising', description: 'Conversion tracking and remarketing for Bing ads.', domains: ['bat.bing.com'] },
  { id: 'tiktok', name: 'TikTok Pixel', provider: 'TikTok', category: 'Advertising', description: 'Reports visits and conversions to TikTok for ad measurement.', domains: ['analytics.tiktok.com'] },
  { id: 'linkedin', name: 'LinkedIn Insight', provider: 'LinkedIn', category: 'Advertising', description: 'Conversion tracking and audience building for LinkedIn ads.', domains: ['snap.licdn.com', 'px.ads.linkedin.com'] },
  { id: 'x-ads', name: 'X (Twitter) Pixel', provider: 'X Corp', category: 'Advertising', description: 'Conversion tracking for X ads.', domains: ['static.ads-twitter.com', 'analytics.twitter.com'] },
  { id: 'pinterest', name: 'Pinterest Tag', provider: 'Pinterest', category: 'Advertising', description: 'Conversion tracking for Pinterest ads.', domains: ['ct.pinterest.com'] },
  { id: 'criteo', name: 'Criteo', provider: 'Criteo', category: 'Advertising', description: 'Retargeting ads based on products viewed.', domains: ['criteo.com', 'criteo.net'] },
  { id: 'taboola', name: 'Taboola', provider: 'Taboola', category: 'Advertising', description: 'Sponsored content recommendations.', domains: ['taboola.com'] },
  { id: 'outbrain', name: 'Outbrain', provider: 'Outbrain', category: 'Advertising', description: 'Sponsored content recommendations.', domains: ['outbrain.com'] },
  { id: 'xandr', name: 'Xandr', provider: 'Microsoft', category: 'Advertising', description: 'Programmatic ad exchange.', domains: ['adnxs.com'] },
  { id: 'amazon-ads', name: 'Amazon Ads', provider: 'Amazon', category: 'Advertising', description: 'Ad serving and measurement.', domains: ['amazon-adsystem.com'] },
  // Social
  { id: 'metapixel', name: 'Meta Pixel', provider: 'Meta', category: 'Social', description: 'Reports visits and conversions to Meta for ad targeting and measurement.', domains: ['facebook.net', 'facebook.com'] },
  // Functional
  { id: 'gtm', name: 'Google Tag Manager', provider: 'Google', category: 'Functional', description: 'Loads other tags. Not a tracker itself, but often what loads the trackers.', domains: ['googletagmanager.com'] },
  { id: 'gfonts', name: 'Google Fonts', provider: 'Google', category: 'Functional', description: 'Web fonts served by Google. Each request shares the visitor’s IP address with Google.', domains: ['fonts.googleapis.com', 'fonts.gstatic.com'] },
  { id: 'jsdelivr', name: 'jsDelivr', provider: 'jsDelivr', category: 'Functional', description: 'Public code delivery network for scripts.', domains: ['jsdelivr.net'] },
  { id: 'cdnjs', name: 'cdnjs', provider: 'Cloudflare', category: 'Functional', description: 'Public code delivery network for scripts.', domains: ['cdnjs.cloudflare.com'] },
  { id: 'unpkg', name: 'unpkg', provider: 'unpkg', category: 'Functional', description: 'Public code delivery network for scripts.', domains: ['unpkg.com'] },
  { id: 'mapbox', name: 'Mapbox', provider: 'Mapbox', category: 'Functional', description: 'Maps and map tiles.', domains: ['mapbox.com'] },
  { id: 'sentry', name: 'Sentry', provider: 'Sentry', category: 'Functional', description: 'Error monitoring. Sends error reports, which can include page details.', domains: ['sentry.io', 'sentry-cdn.com'] },
  // Essential: consent banners and payments
  { id: 'cookiebot', name: 'Cookiebot', provider: 'Usercentrics', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['cookiebot.com', 'cookiebot.eu'] },
  { id: 'onetrust', name: 'OneTrust', provider: 'OneTrust', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['cookielaw.org', 'onetrust.com'] },
  { id: 'usercentrics', name: 'Usercentrics', provider: 'Usercentrics', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['usercentrics.eu'] },
  { id: 'didomi', name: 'Didomi', provider: 'Didomi', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['didomi.io'] },
  { id: 'cookieyes', name: 'CookieYes', provider: 'CookieYes', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['cookieyes.com'] },
  { id: 'iubenda', name: 'iubenda', provider: 'iubenda', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['iubenda.com'] },
  { id: 'consentmanager', name: 'consentmanager', provider: 'consentmanager', category: 'Essential', description: 'Consent banner. Stores the visitor’s choice.', domains: ['consentmanager.net'] },
  { id: 'stripe', name: 'Stripe', provider: 'Stripe', category: 'Essential', description: 'Payment library.', domains: ['stripe.com', 'stripe.network'] },
];

/** Cookie names that identify a tracker even when set on the site's own domain (first-party tracking cookies). */
export const COOKIE_PATTERNS: [RegExp, string][] = [
  [/^_ga(_|$)|^_gid$|^_gat/, 'ga4'],
  [/^_gcl_/, 'google-ads'],
  [/^_fbp$|^_fbc$/, 'metapixel'],
  [/^_hj/, 'hotjar'],
  [/^_clck$|^_clsk$/, 'clarity'],
  [/^_uet/, 'microsoft-ads'],
  [/^_ttp$|^_tt_/, 'tiktok'],
  [/^_pin_unauth$/, 'pinterest'],
  [/^li_(fat_id|sugr)$/, 'linkedin'],
];

/** Cookies that only store the consent choice itself. */
export const CONSENT_COOKIE = /^(CookieConsent|OptanonConsent|OptanonAlertBoxClosed|euconsent(-v2)?|cookieyes-consent|didomi_token|uc_settings|cmplz_.*|borlabs-cookie|_iub_cs-.*)$/;
