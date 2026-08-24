CREATE TABLE provider_calls_new (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES analysis_jobs(id),
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

INSERT INTO provider_calls_new (
  id,
  job_id,
  provider_request_id,
  provider_response_id,
  stage,
  model,
  reasoning_effort,
  status,
  started_at,
  ended_at,
  wall_ms,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  incomplete_details,
  error_code
)
SELECT
  id,
  job_id,
  provider_request_id,
  provider_response_id,
  stage,
  model,
  reasoning_effort,
  status,
  started_at,
  ended_at,
  wall_ms,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  incomplete_details,
  error_code
FROM provider_calls;

DROP TABLE provider_calls;
ALTER TABLE provider_calls_new RENAME TO provider_calls;

CREATE INDEX provider_calls_job_id_idx ON provider_calls(job_id);
CREATE INDEX provider_calls_started_at_idx ON provider_calls(started_at);
