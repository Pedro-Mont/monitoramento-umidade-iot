import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const expectedKey = Deno.env.get("INGEST_KEY");
  const receivedKey = req.headers.get("x-ingest-key");

  if (!expectedKey || receivedKey !== expectedKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const topic = body?.topic;
  const reading = body?.reading;

  const deviceId = reading?.device_id;
  const messageId = reading?.message_id;
  const humidity = reading?.humidity;
  const temperature = reading?.temperature ?? null;

  const isValidString = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const isValidHumidity = typeof humidity === "number" && Number.isFinite(humidity) && humidity >= 0 && humidity <= 100;
  const isValidTemp = temperature === null || (typeof temperature === "number" && Number.isFinite(temperature));

  if (!isValidString(topic) || !isValidString(deviceId) || !isValidString(messageId) || !isValidHumidity || !isValidTemp) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_contract" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let alertStatus: "BAIXA" | "NORMAL" | "ALTA" = "NORMAL";
  if (humidity < 40) {
    alertStatus = "BAIXA";
  } else if (humidity > 90) {
    alertStatus = "ALTA";
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from("readings").insert({
    device_id: deviceId.trim(),
    message_id: messageId.trim(),
    topic: topic.trim(),
    humidity,
    temperature,
    alert_status: alertStatus,
  });

  if (error) {
    if (error.code === "23505") {
      return new Response(
        JSON.stringify({ ok: true, inserted: false, message_id: messageId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "db_error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      inserted: true,
      message_id: messageId,
      alert_status: alertStatus,
    }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});