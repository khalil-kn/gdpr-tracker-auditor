// Schema history, applied in order by migrate.ts. Never edit a migration that has shipped; add a new one.
// Kept as TypeScript strings so `tsc` copies them into dist/ with the rest of the code.

export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_init',
    sql: `
      CREATE TABLE scans (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        url                 text NOT NULL,
        host                text NOT NULL,
        status              text NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
        consent_states      text[] NOT NULL,
        observation_seconds int  NOT NULL CHECK (observation_seconds BETWEEN 1 AND 60),
        viewport            text NOT NULL CHECK (viewport IN ('desktop', 'phone')),
        created_at          timestamptz NOT NULL DEFAULT now(),
        started_at          timestamptz,
        completed_at        timestamptz,
        failure_reason      text,
        score               int,
        score_breakdown     jsonb,
        states              jsonb NOT NULL DEFAULT '[]'
      );
      -- The worker's queue: it only ever looks for the oldest PENDING scan.
      CREATE INDEX scans_pending_idx ON scans (created_at) WHERE status = 'PENDING';

      -- Layer 1, observations. Every row carries the consent state it was seen in.
      CREATE TABLE network_requests (
        id                 bigserial PRIMARY KEY,
        scan_id            uuid NOT NULL REFERENCES scans ON DELETE CASCADE,
        consent_state      text NOT NULL,
        url                text NOT NULL,
        hostname           text NOT NULL,
        registrable_domain text NOT NULL,
        method             text NOT NULL,
        resource_type      text NOT NULL,
        third_party        boolean NOT NULL,
        time_ms            int NOT NULL,
        tracker_id         text
      );
      CREATE INDEX network_requests_scan_idx ON network_requests (scan_id);

      CREATE TABLE cookies (
        id            bigserial PRIMARY KEY,
        scan_id       uuid NOT NULL REFERENCES scans ON DELETE CASCADE,
        consent_state text NOT NULL,
        name          text NOT NULL,
        domain        text NOT NULL,
        path          text NOT NULL,
        expires       double precision NOT NULL,
        secure        boolean NOT NULL,
        http_only     boolean NOT NULL,
        same_site     text,
        third_party   boolean NOT NULL,
        category      text NOT NULL,
        tracker_id    text
      );
      CREATE INDEX cookies_scan_idx ON cookies (scan_id);

      -- Layer 3, assessments.
      CREATE TABLE findings (
        id            bigserial PRIMARY KEY,
        scan_id       uuid NOT NULL REFERENCES scans ON DELETE CASCADE,
        severity      text NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
        title         text NOT NULL,
        description   text NOT NULL,
        consent_state text,
        evidence      text[] NOT NULL
      );
      CREATE INDEX findings_scan_idx ON findings (scan_id);
    `,
  },
];
