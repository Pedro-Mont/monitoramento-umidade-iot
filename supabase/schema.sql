CREATE TABLE IF NOT EXISTS public.readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  humidity DOUBLE PRECISION NOT NULL CHECK (humidity >= 0 AND humidity <= 100),
  temperature DOUBLE PRECISION,
  alert_status TEXT NOT NULL CHECK (alert_status IN ('BAIXA', 'NORMAL', 'ALTA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT readings_device_message_unique UNIQUE (device_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_readings_device_created
  ON public.readings (device_id, created_at DESC);

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura publica de readings"
  ON public.readings
  FOR SELECT
  TO anon
  USING (true);

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.readings TO anon, authenticated;
GRANT ALL ON TABLE public.readings TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;