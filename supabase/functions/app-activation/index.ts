import { withSupabase } from "npm:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

let cachedPrivateKeyPromise: Promise<CryptoKey> | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(str: string): string {
  const encoder = new TextEncoder();
  return bytesToBase64Url(encoder.encode(str));
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getPrivateKey(): Promise<CryptoKey> {
  if (!cachedPrivateKeyPromise) {
    cachedPrivateKeyPromise = (async () => {
      const b64Key = Deno.env.get("ACTIVATION_LEASE_PRIVATE_KEY_B64");
      if (!b64Key || b64Key.trim() === "") {
        throw new Error("Missing private key configuration");
      }
      const derBytes = base64ToUint8Array(b64Key);
      return await crypto.subtle.importKey(
        "pkcs8",
        derBytes.buffer,
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        },
        false,
        ["sign"]
      );
    })();
  }
  return cachedPrivateKeyPromise;
}

async function generateActivationLease(
  installationIdHash: string,
  activationTokenHash: string
): Promise<string> {
  const privateKey = await getPrivateKey();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 7 * 24 * 60 * 60; // 604800 seconds

  const payloadObj = {
    v: 1,
    installationIdHash: installationIdHash,
    activationTokenHash: activationTokenHash,
    issuedAt: issuedAt,
    expiresAt: expiresAt,
  };

  const payloadJson = JSON.stringify(payloadObj);
  const payloadPart = stringToBase64Url(payloadJson);

  const encoder = new TextEncoder();
  const dataToSign = encoder.encode(payloadPart);

  const signatureBuffer = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    dataToSign
  );

  const signaturePart = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadPart}.${signaturePart}`;
}

function generateRandomTokenHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBodyMax(req: Request, maxBytes: number): Promise<{ text: string; exceeded: boolean }> {
  if (!req.body) {
    return { text: "", exceeded: false };
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch (_e) {
          // ignore
        }
        return { text: "", exceeded: true };
      }
      chunks.push(value);
    }
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder("utf-8").decode(combined), exceeded: false };
}

const INSTALLATION_ID_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const CODE_REGEX = /^[A-Z0-9-]{12,64}$/;
const TOKEN_REGEX = /^[a-f0-9]{64}$/;

export default {
  fetch: withSupabase(
    { auth: "publishable:android_activation" },
    async (req: Request, ctx: any) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (req.method !== "POST") {
        return new Response(JSON.stringify({ ok: false }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const { text: bodyText, exceeded } = await readBodyMax(req, 4096);
        if (exceeded) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let jsonBody: any = {};
        try {
          jsonBody = JSON.parse(bodyText);
        } catch (_e) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { action, code, installationId, activationToken } = jsonBody;

        if (!action || typeof action !== "string" || !installationId || typeof installationId !== "string") {
          return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!INSTALLATION_ID_REGEX.test(installationId)) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const installationIdHash = await sha256Hex(installationId);

        if (action === "redeem") {
          if (!code || typeof code !== "string") {
            return new Response(JSON.stringify({ ok: false }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const normalizedCode = code.trim().replace(/\s+/g, "").toUpperCase();
          if (!CODE_REGEX.test(normalizedCode)) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const codeHash = await sha256Hex(normalizedCode);
          const newActivationToken = generateRandomTokenHex();
          const activationTokenHash = await sha256Hex(newActivationToken);

          const { data, error } = await ctx.supabaseAdmin.rpc("redeem_app_invite", {
            p_code_hash: codeHash,
            p_installation_id_hash: installationIdHash,
            p_activation_token_hash: activationTokenHash,
          });

          if (error || !Array.isArray(data) || data.length === 0) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const row = data[0];
          if (!row || (row.result !== "activated" && row.result !== "active")) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          let activationLease: string;
          try {
            activationLease = await generateActivationLease(installationIdHash, activationTokenHash);
          } catch (_e) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({
              ok: true,
              activationToken: newActivationToken,
              activationLease: activationLease,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else if (action === "verify") {
          if (!activationToken || typeof activationToken !== "string") {
            return new Response(JSON.stringify({ ok: false }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (!TOKEN_REGEX.test(activationToken)) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const activationTokenHash = await sha256Hex(activationToken);

          const { data, error } = await ctx.supabaseAdmin.rpc("verify_app_activation", {
            p_installation_id_hash: installationIdHash,
            p_activation_token_hash: activationTokenHash,
          });

          if (error || data !== true) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          let activationLease: string;
          try {
            activationLease = await generateActivationLease(installationIdHash, activationTokenHash);
          } catch (_e) {
            return new Response(JSON.stringify({ ok: false }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({
              ok: true,
              activationLease: activationLease,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else {
          return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (_e) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  ),
};
