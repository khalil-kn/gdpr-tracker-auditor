// API shapes. Keep in sync with frontend/src/app/core/models/scan.models.ts (the contract).

export type ScanStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ConsentState = 'BEFORE_INTERACTION' | 'REJECTED' | 'ACCEPTED';
export const CONSENT_STATES: ConsentState[] = ['BEFORE_INTERACTION', 'REJECTED', 'ACCEPTED'];

export type Category = 'Analytics' | 'Advertising' | 'Social' | 'Functional' | 'Essential' | 'Unknown';
export const TRACKING_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['Analytics', 'Advertising', 'Social']);

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Viewport = 'desktop' | 'phone';
export type SameSite = 'Strict' | 'Lax' | 'None';

export interface CreateScanRequest {
  url: string;
  consentStates: ConsentState[];
  observationSeconds: number;
  viewport: Viewport;
}

export interface ScanSummary {
  id: string;
  url: string;
  host: string;
  status: ScanStatus;
  consentStates: ConsentState[];
  observationSeconds: number;
  viewport: Viewport;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
  score: number | null;
  findingCount: number | null;
}

export interface NetworkRequest {
  consentState: ConsentState;
  url: string;
  hostname: string;
  registrableDomain: string;
  method: string;
  resourceType: string;
  thirdParty: boolean;
  timeMs: number;
  trackerId: string | null;
}

export interface ScanCookie {
  consentState: ConsentState;
  name: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite | null;
  thirdParty: boolean;
  category: Category;
  trackerId: string | null;
}

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
  title: string;
  description: string;
  consentState: ConsentState | null;
  evidence: string[];
}

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

export interface ScanReport extends ScanSummary {
  states: StateRun[];
  requests: NetworkRequest[];
  cookies: ScanCookie[];
  trackers: Tracker[];
  findings: Finding[];
  privacyScore: PrivacyScore | null;
}
