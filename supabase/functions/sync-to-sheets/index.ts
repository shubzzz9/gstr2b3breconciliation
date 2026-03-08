import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const sa = JSON.parse(serviceAccountKey);
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const unsignedToken = `${header}.${claim}`;

  // Import private key
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${claim.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData: GoogleTokenResponse = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function ensureSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
) {
  // Get existing sheets
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const exists = data.sheets?.some(
    (s: any) => s.properties?.title === sheetTitle
  );

  if (!exists) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: sheetTitle } } }],
        }),
      }
    );
  }
}

async function writeToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  values: string[][]
) {
  const range = `${sheetTitle}!A1`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");

    // Handle potential double-encoding of the JSON secret
    let serviceAccountKey = serviceAccountKeyRaw;
    // If the string starts with a quote, it may be double-JSON-encoded
    if (serviceAccountKey.startsWith('"') || serviceAccountKey.startsWith("'")) {
      try {
        serviceAccountKey = JSON.parse(serviceAccountKey);
      } catch {
        // not double encoded, use as-is
      }
    }

    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const accessToken = await getAccessToken(serviceAccountKey);

    // Fetch profiles (signups)
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesErr) throw profilesErr;

    // Fetch export logs
    const { data: exportLogs, error: logsErr } = await supabase
      .from("export_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (logsErr) throw logsErr;

    // Ensure tabs exist
    await ensureSheet(accessToken, sheetId, "User Signups");
    await ensureSheet(accessToken, sheetId, "Export Logs");

    // Write signups
    const signupRows: string[][] = [
      ["User ID", "Full Name", "Phone", "Is Blocked", "Max Exports", "Created At", "Updated At"],
      ...(profiles || []).map((p: any) => [
        p.user_id,
        p.full_name || "",
        p.phone || "",
        String(p.is_blocked),
        String(p.max_exports),
        p.created_at,
        p.updated_at,
      ]),
    ];
    await writeToSheet(accessToken, sheetId, "User Signups", signupRows);

    // Write export logs
    const logRows: string[][] = [
      ["ID", "User ID", "Export Type", "Device Fingerprint", "IP Address", "Created At"],
      ...(exportLogs || []).map((l: any) => [
        l.id,
        l.user_id,
        l.export_type,
        l.device_fingerprint || "",
        l.ip_address || "",
        l.created_at,
      ]),
    ];
    await writeToSheet(accessToken, sheetId, "Export Logs", logRows);

    return new Response(
      JSON.stringify({
        success: true,
        synced: {
          signups: (profiles || []).length,
          exports: (exportLogs || []).length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
