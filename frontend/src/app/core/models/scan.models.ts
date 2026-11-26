// API contract between Angular and the Express backend.
// Layer 1 (observation): NetworkRequest, ScanCookie. Layer 2 (classification): Tracker, category.
// Layer 3 (assessment): Finding, PrivacyScore. Keep them separate: an observation never says "illegal".

export type ScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/** Each state runs in a fresh, isolated browser context. */
export type ConsentState = 'BEFORE_INTERACTION' | 'REJECTED' | 'ACCEPTED';
export const CONSENT_STATES: ConsentState[] = ['BEFORE_INTERACTION', 'REJECTED', 'ACCEPTED'];

export type Category = 'Analytics' | 'Advertising' | 'Social' | 'Functional' | 'Essential' | 'Unknown';
/** Categories that count as tracking. Functional and Essential services are reported, not counted. */
export const TRACKING_CATEGORIES: ReadonlySet<Category> = new Set(['Analytics', 'Advertising', 'Social']);

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Viewport = 'desktop' | 'phone';

/** POST /api/scans */
export interface CreateScanRequest {
  url: string;
  consentStates: ConsentState[]; // always includes BEFORE_INTERACTION
  observationSeconds: number;
  viewport: Viewport;
}

/** GET /api/scans (list) and the head of GET /api/scans/:id */
export interface ScanSummary {
  id: string;
  url: string;
  host: string;
  status: ScanStatus;
  consentStates: ConsentState[];
  observationSeconds: number;
  viewport: Viewport;
  createdAt: string; // ISO 8601
  completedAt: string | null;
  failureReason: string | null; // safe, user-facing text; never a stack trace
  score: number | null; // Privacy Exposure Score, 0-100, higher = more exposed
  findingCount: number | null;
}

/** One HTTP request observed by Playwright. */
export interface NetworkRequest {
  consentState: ConsentState;
  url: string;
  hostname: string;
  registrableDomain: string; // eTLD+1 from the Public Suffix List
  method: string;
  resourceType: string; // Playwright's request.resourceType()
  thirdParty: boolean;
  timeMs: number; // since navigation started
  trackerId: string | null;
}

/** One cookie as Playwright reports it. The value is deliberately not stored. */
export interface ScanCookie {
  consentState: ConsentState;
  name: string;
  domain: string;
  path: string;
  expires: number; // unix seconds, -1 = session cookie (Playwright convention)
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null; // null = attribute absent
  thirdParty: boolean;
  category: Category;
  trackerId: string | null;
}

/** An entry of the tracker intelligence database that matched this scan. */
export interface Tracker {
  id: string;
  name: string;
  provider: string;
  category: Category;
  description: string;
  domains: string[];
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string; // "Tracking request observed before consent", never "GDPR violation"
  description: string;
  consentState: ConsentState | null;
  evidence: string[];
}

/** Every point of the score is explained by one entry. */
export interface ScorePoints {
  points: number;
  reason: string;
  detail: string;
}

export interface PrivacyScore {
  value: number;
  breakdown: ScorePoints[];
}

export interface StateRun {
  consentState: ConsentState;
  bannerFound: boolean;
  bannerClickedAtMs: number | null;
}

/** GET /api/scans/:id once COMPLETED. Arrays are empty while the scan runs. */
export interface ScanReport extends ScanSummary {
  states: StateRun[];
  requests: NetworkRequest[];
  cookies: ScanCookie[];
  trackers: Tracker[];
  findings: Finding[];
  privacyScore: PrivacyScore | null;
}

/** GET /api/auth/me, POST /api/auth/login and /register */
export interface User {
  id: string;
  email: string;
}

/** GET /api/auth/config */
export interface AuthConfig {
  registration: boolean;
  passwordMin: number;
}

/** GET /api/trackers: an entry of the tracker library, with the cookie-name patterns that identify it. */
export interface LibraryTracker extends Tracker {
  cookiePatterns: string[];
}
