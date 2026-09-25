CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'BASIC' CHECK (subscription_plan IN ('BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (subscription_status IN ('ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS user_workspaces (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS neighborhood_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_audit (
  id UUID PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  before_access JSONB NOT NULL,
  after_access JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_requests (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_plan TEXT NOT NULL CHECK (requested_plan IN ('PRO', 'BUSINESS', 'ENTERPRISE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  business_type TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  area TEXT,
  category TEXT,
  rating NUMERIC,
  ratings_count INTEGER,
  coordinates JSONB,
  source_name TEXT,
  source_url TEXT,
  source_updated_at TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY,
  city TEXT NOT NULL,
  business_type TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  business_name TEXT NOT NULL,
  area TEXT NOT NULL,
  category TEXT,
  source_name TEXT,
  source_url TEXT,
  source_updated_at TEXT,
  confidence TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE prices ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE prices ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'PUBLIC_URL';
ALTER TABLE prices ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE prices ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE prices ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  city TEXT NOT NULL,
  business_type TEXT NOT NULL,
  budget NUMERIC NOT NULL,
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'LEGACY';

CREATE TABLE IF NOT EXISTS cached_requests (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  request JSONB NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  recommendation JSONB NOT NULL,
  probability JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS city_economic_indicators (
  id UUID PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  city TEXT NOT NULL,
  business_type TEXT NOT NULL,
  budget NUMERIC NOT NULL,
  composite_score NUMERIC NOT NULL,
  label TEXT,
  indicator JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planned_businesses (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  address TEXT NOT NULL,
  district_id TEXT,
  budget NUMERIC,
  business_format TEXT,
  property_id UUID,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'VERIFIED', 'OPEN', 'CANCELLED')),
  source TEXT NOT NULL DEFAULT 'user_confirmed_plan',
  market_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS commercial_properties (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('RENT', 'SALE')),
  price NUMERIC NOT NULL CHECK (price >= 0),
  price_per_sqm NUMERIC CHECK (price_per_sqm >= 0),
  currency TEXT NOT NULL DEFAULT 'KZT',
  area_sqm NUMERIC NOT NULL CHECK (area_sqm > 0),
  city TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  address TEXT NOT NULL,
  district_id TEXT,
  floor INTEGER,
  total_floors INTEGER,
  parking BOOLEAN,
  entrance_type TEXT,
  condition TEXT,
  utilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_phone TEXT,
  contact_email TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'ACTIVE', 'INACTIVE', 'RENTED', 'SOLD', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS education_listings (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category = 'education'),
  subtype TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'REJECTED')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_listings (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category = 'jobs'),
  subtype TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'REJECTED')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE planned_businesses ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES commercial_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_user_created ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitors_city_type ON competitors(city, business_type);
CREATE INDEX IF NOT EXISTS idx_prices_city_type ON prices(city, business_type);
CREATE INDEX IF NOT EXISTS idx_prices_verified_city_type ON prices(verification_status, city, business_type);
CREATE INDEX IF NOT EXISTS idx_prices_submitted_by ON prices(submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_city_indicators_city_created ON city_economic_indicators(city, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_user_created ON planned_businesses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_latitude ON planned_businesses(latitude);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_longitude ON planned_businesses(longitude);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_category ON planned_businesses(category);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_district ON planned_businesses(district_id);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_status ON planned_businesses(status);
CREATE INDEX IF NOT EXISTS idx_planned_businesses_property ON planned_businesses(property_id);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_city_status ON commercial_properties(city, status);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_transaction ON commercial_properties(transaction_type);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_type ON commercial_properties(property_type);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_latitude ON commercial_properties(latitude);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_longitude ON commercial_properties(longitude);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_district ON commercial_properties(district_id);
CREATE INDEX IF NOT EXISTS idx_education_listings_city_status ON education_listings(city, status);
CREATE INDEX IF NOT EXISTS idx_education_listings_owner_created ON education_listings(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_listings_city_status ON job_listings(city, status);
CREATE INDEX IF NOT EXISTS idx_job_listings_owner_created ON job_listings(owner_id, created_at DESC);
