// v2: Sync data to Google Sheets using separate secrets
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

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const cleanKey = privateKey.replace(/\\n/g, '\n');
  console.log("Client email:", clientEmail);
  console.log("Private key length:", cleanKey.length);
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimB64 = toBase64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const unsignedToken = `${headerB64}.${claimB64}`;

  // Import private key
  const pemContents = cleanKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "")
    .trim();

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

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${headerB64}.${claimB64}.${signatureB64}`;

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
  if (!res.ok) {
    console.error("ensureSheet - get spreadsheet failed:", JSON.stringify(data));
    throw new Error(`Failed to get spreadsheet: ${JSON.stringify(data)}`);
  }
  console.log("Existing sheets:", data.sheets?.map((s: any) => s.properties?.title));
  const exists = data.sheets?.some(
    (s: any) => s.properties?.title === sheetTitle
  );

  if (!exists) {
    const addRes = await fetch(
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
    const addData = await addRes.json();
    if (!addRes.ok) {
      console.error("ensureSheet - add sheet failed:", JSON.stringify(addData));
      throw new Error(`Failed to add sheet: ${JSON.stringify(addData)}`);
    }
    console.log("Created sheet:", sheetTitle);
  }
}

async function writeToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  values: string[][]
) {
  const range = `${sheetTitle}!A1`;
  const writeRes = await fetch(
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
  const writeData = await writeRes.json();
  if (!writeRes.ok) {
    console.error("writeToSheet failed:", JSON.stringify(writeData));
    throw new Error(`Failed to write to sheet ${sheetTitle}: ${JSON.stringify(writeData)}`);
  }
  console.log(`Wrote ${values.length} rows to ${sheetTitle}:`, JSON.stringify(writeData));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

   try {
    const clientEmail = Deno.env.get("GOOGLE_CLIENT_EMAIL");
    if (!clientEmail) throw new Error("GOOGLE_CLIENT_EMAIL not set");

    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY not set");

    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const accessToken = await getAccessToken(clientEmail, privateKey);

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
