CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL,
  stage_message TEXT NOT NULL,
  options_json TEXT NOT NULL,
  model_id TEXT REFERENCES candidate_models(id) ON DELETE SET NULL,
  critic_verdict TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE candidate_models (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE REFERENCES analysis_jobs(id),
  canonical_json TEXT NOT NULL,
  ui_json TEXT NOT NULL,
  critic_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE provider_calls (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
  provider_request_id TEXT,
  provider_response_id TEXT,
  stage TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  wall_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  incomplete_details TEXT,
  error_code TEXT
);

CREATE INDEX transcripts_candidate_id_idx ON transcripts(candidate_id);
CREATE INDEX transcripts_created_at_idx ON transcripts(created_at);
CREATE INDEX analysis_jobs_candidate_id_idx ON analysis_jobs(candidate_id);
CREATE INDEX analysis_jobs_status_idx ON analysis_jobs(status);
CREATE INDEX analysis_jobs_created_at_idx ON analysis_jobs(created_at);
CREATE UNIQUE INDEX analysis_jobs_idempotency_key_idx
  ON analysis_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX candidate_models_candidate_id_idx
  ON candidate_models(candidate_id);
CREATE INDEX candidate_models_created_at_idx ON candidate_models(created_at);
CREATE INDEX provider_calls_job_id_idx ON provider_calls(job_id);
CREATE INDEX provider_calls_started_at_idx ON provider_calls(started_at);
