export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_gbp INTEGER NOT NULL,
  monthly_credits INTEGER NOT NULL,
  stripe_price_id TEXT,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS credit_balances (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  generation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS brand_kits (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#C45C26',
  secondary_color TEXT NOT NULL DEFAULT '#F4EFE8',
  font TEXT NOT NULL DEFAULT 'Fraunces',
  tone_of_voice TEXT NOT NULL DEFAULT 'Warm, confident, cinematic',
  website TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  vertical TEXT NOT NULL DEFAULT '',
  tone_note TEXT NOT NULL DEFAULT '',
  vertical_note TEXT NOT NULL DEFAULT '',
  learned_summary_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_intent TEXT NOT NULL DEFAULT '',
  use_brand INTEGER NOT NULL DEFAULT 1,
  invite_json TEXT,
  status TEXT NOT NULL,
  current_step TEXT NOT NULL,
  idea_json TEXT,
  script_json TEXT,
  visuals_json TEXT,
  voice_json TEXT,
  captions_json TEXT,
  audio_url TEXT NOT NULL DEFAULT '',
  output_url TEXT,
  credits_used INTEGER NOT NULL DEFAULT 0,
  preview_token TEXT,
  preview_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  actual_cost_gbp REAL NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL,
  status TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
`;
