-- ══════════════════════════════════════════════════════════
--  POKER TRACKER — Complete Schema
--  Supabase SQL Editor mein ek baar run karo
-- ══════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════
--  TABLES
-- ══════════════════════════════════════════════════════════

-- Players pool (admin manages this)
CREATE TABLE IF NOT EXISTS poker_players (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  phone       TEXT        NOT NULL UNIQUE CHECK (phone ~ '^\d{10}$'),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  is_admin    BOOLEAN     NOT NULL DEFAULT false,
  device_id   TEXT,                          -- currently logged-in device
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  deleted_by  TEXT
);

-- Sessions (each poker game)
CREATE TABLE IF NOT EXISTS poker_sessions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  played_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  buying_rate  INTEGER     NOT NULL DEFAULT 100 CHECK (buying_rate > 0),
  saved_by     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  deleted_by   TEXT
);

-- Entries per session per player
CREATE TABLE IF NOT EXISTS poker_entries (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID        NOT NULL REFERENCES poker_sessions(id) ON DELETE CASCADE,
  player_name  TEXT        NOT NULL,
  buyings      INTEGER     NOT NULL DEFAULT 1 CHECK (buyings >= 0 AND buyings <= 100),
  result       INTEGER     NOT NULL DEFAULT 0 CHECK (result BETWEEN -9999999 AND 9999999),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity log (auto-deleted after 7 days)
CREATE TABLE IF NOT EXISTS poker_activity (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      TEXT        NOT NULL,
  done_by     TEXT        NOT NULL DEFAULT 'System',
  detail      TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
--  INDEXES
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_entries_session   ON poker_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_player    ON poker_entries(player_name);
CREATE INDEX IF NOT EXISTS idx_sessions_date     ON poker_sessions(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created  ON poker_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_phone     ON poker_players(phone);

-- ══════════════════════════════════════════════════════════
--  VIEWS
-- ══════════════════════════════════════════════════════════

-- Player stats cache (excludes soft-deleted)
CREATE OR REPLACE VIEW player_stats_cache AS
SELECT
  p.name,
  p.phone,
  p.is_admin,
  p.is_active,
  COUNT(DISTINCT e.session_id)                                  AS total_sessions,
  COALESCE(SUM(e.buyings), 0)                                   AS total_buyings,
  COALESCE(SUM(e.result), 0)                                    AS net_profit,
  COALESCE(AVG(e.result), 0)                                    AS avg_per_session,
  COUNT(CASE WHEN e.result > 0 THEN 1 END)                      AS wins,
  COUNT(CASE WHEN e.result < 0 THEN 1 END)                      AS losses,
  COALESCE(MAX(e.result), 0)                                    AS best_session,
  COALESCE(MIN(e.result), 0)                                    AS worst_session
FROM poker_players p
LEFT JOIN poker_entries  e ON e.player_name  = p.name
LEFT JOIN poker_sessions s ON s.id           = e.session_id
                           AND s.deleted_at  IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.name, p.phone, p.is_admin, p.is_active;

-- ══════════════════════════════════════════════════════════
--  RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════

-- Save session atomically (session + entries in one transaction)
CREATE OR REPLACE FUNCTION save_session(
  p_buying_rate  INTEGER,
  p_entries      JSONB,
  p_saved_by     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
  v_entry      JSONB;
BEGIN
  -- Insert session
  INSERT INTO poker_sessions (buying_rate, saved_by)
  VALUES (p_buying_rate, p_saved_by)
  RETURNING id INTO v_session_id;

  -- Insert entries
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO poker_entries (session_id, player_name, buyings, result)
    VALUES (
      v_session_id,
      v_entry->>'player_name',
      (v_entry->>'buyings')::INTEGER,
      (v_entry->>'result')::INTEGER
    );
  END LOOP;

  RETURN v_session_id;
END;
$$;

-- Login: verify phone, check device conflict
CREATE OR REPLACE FUNCTION player_login(
  p_phone      TEXT,
  p_device_id  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player poker_players%ROWTYPE;
BEGIN
  -- Find active player with this phone
  SELECT * INTO v_player
  FROM poker_players
  WHERE phone = p_phone
    AND deleted_at IS NULL
    AND is_active  = true;

  -- Not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- Already logged in on another device
  IF v_player.device_id IS NOT NULL
     AND v_player.device_id <> p_device_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_logged_in');
  END IF;

  -- Update device_id and last_login
  UPDATE poker_players
  SET device_id  = p_device_id,
      last_login = NOW()
  WHERE id = v_player.id;

  RETURN jsonb_build_object(
    'success',   true,
    'id',        v_player.id,
    'name',      v_player.name,
    'is_admin',  v_player.is_admin,
    'is_active', v_player.is_active
  );
END;
$$;

-- Logout: clear device_id
CREATE OR REPLACE FUNCTION player_logout(p_phone TEXT, p_device_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE poker_players
  SET device_id = NULL
  WHERE phone     = p_phone
    AND device_id = p_device_id;
END;
$$;

-- Toggle player active status
CREATE OR REPLACE FUNCTION toggle_player_active(
  p_player_id  UUID,
  p_is_active  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE poker_players
  SET is_active = p_is_active
  WHERE id = p_player_id;
END;
$$;

-- Cleanup old activity logs (7 days)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM poker_activity
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ══════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════
ALTER TABLE poker_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_activity ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key se)
CREATE POLICY "public_read_players"   ON poker_players  FOR SELECT USING (true);
CREATE POLICY "public_read_sessions"  ON poker_sessions FOR SELECT USING (true);
CREATE POLICY "public_read_entries"   ON poker_entries  FOR SELECT USING (true);
CREATE POLICY "public_read_activity"  ON poker_activity FOR SELECT USING (true);

-- Write via RPC functions only (SECURITY DEFINER handles auth)
CREATE POLICY "rpc_write_players"     ON poker_players  FOR ALL USING (true);
CREATE POLICY "rpc_write_sessions"    ON poker_sessions FOR ALL USING (true);
CREATE POLICY "rpc_write_entries"     ON poker_entries  FOR ALL USING (true);
CREATE POLICY "rpc_write_activity"    ON poker_activity FOR ALL USING (true);

-- ══════════════════════════════════════════════════════════
--  SEED — Admin player (apna number aur naam yahan daalo)
-- ══════════════════════════════════════════════════════════
INSERT INTO poker_players (name, phone, is_admin)
VALUES ('Admin', '9999999999', true)   -- ← APNA NAAM AUR NUMBER YAHAN BADLO
ON CONFLICT (phone) DO NOTHING;

-- ══════════════════════════════════════════════════════════
--  DONE
-- ══════════════════════════════════════════════════════════
