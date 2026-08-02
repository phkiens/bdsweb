import { withSupabase } from "npm:@supabase/server@^1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, x-activation-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

async function sha256Bytes(text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = await sha256Bytes(text);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function constantTimeTokenMatches(providedToken: string | null, expectedToken: string | null): Promise<boolean> {
  const tokenA = providedToken ?? "";
  const tokenB = expectedToken ?? "";

  const hashA = await sha256Bytes(tokenA);
  const hashB = await sha256Bytes(tokenB);

  let xorResult = 0;
  for (let i = 0; i < 32; i++) {
    xorResult |= hashA[i] ^ hashB[i];
  }

  const isValidInput = Boolean(providedToken) && Boolean(expectedToken);
  return xorResult === 0 && isValidInput;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getRandomChar(): string {
  const buf = new Uint8Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const val = buf[0];
    if (val < 224) { // 32 * 7 = 224 for uniform distribution
      return ALPHABET[val % 32];
    }
  }
}

function generateGroup(): string {
  let res = "";
  for (let i = 0; i < 4; i++) {
    res += getRandomChar();
  }
  return res;
}

function generateInviteCode(): string {
  return `BDS-${generateGroup()}-${generateGroup()}-${generateGroup()}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

async function readBodyMax(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch (_e) {
    return null;
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export default {
  fetch: withSupabase(
    { auth: "publishable:android_activation" },
    async (req, ctx) => {
      // 1. CORS Preflight
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      if (req.method !== "POST") {
        return jsonResponse(405, { ok: false });
      }

      // 2. Admin Auth Gate (CRITICAL: Runs BEFORE body parsing or DB calls)
      const adminToken = req.headers.get("x-activation-admin-token");
      const expectedToken = Deno.env.get("ACTIVATION_ADMIN_TOKEN") ?? null;

      const isAuthenticated = await constantTimeTokenMatches(adminToken, expectedToken);
      if (!isAuthenticated) {
        return jsonResponse(401, { ok: false });
      }

      // 3. Body Limits
      const rawBody = await readBodyMax(req, 4096);
      if (!rawBody) {
        return jsonResponse(400, { ok: false });
      }

      let payload: any;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
        payload = JSON.parse(text);
      } catch (_e) {
        return jsonResponse(400, { ok: false });
      }

      if (!payload || typeof payload !== "object" || typeof payload.action !== "string") {
        return jsonResponse(400, { ok: false });
      }

      const action = payload.action;

      try {
        switch (action) {
          case "listInvites": {
            // Select ONLY required fields (NO code_hash)
            const invitesRes = await ctx.supabaseAdmin
              .from("app_invite_codes")
              .select("id, label, max_activations, expires_at, is_active, created_at")
              .order("created_at", { ascending: false });

            if (invitesRes.error) {
              return jsonResponse(500, { ok: false });
            }

            // Select ONLY required fields (NO installation_id_hash or activation_token_hash)
            const activationsRes = await ctx.supabaseAdmin
              .from("app_activations")
              .select("id, invite_id, activated_at, last_verified_at, revoked_at");

            if (activationsRes.error) {
              return jsonResponse(500, { ok: false });
            }

            const invitesData = invitesRes.data || [];
            const activationsData = activationsRes.data || [];

            const nowMillis = Date.now();

            const invites = invitesData.map((inv: any) => {
              const invActivations = activationsData.filter((a: any) => a.invite_id === inv.id);
              const totalActivations = invActivations.length;
              const activeDevices = invActivations.filter((a: any) => !a.revoked_at).length;

              const expiresAtMillis = Date.parse(inv.expires_at);
              const isExpired = !Number.isFinite(expiresAtMillis) || expiresAtMillis <= nowMillis;

              let status = "AVAILABLE";
              if (!inv.is_active) {
                status = "REVOKED";
              } else if (isExpired) {
                status = "EXPIRED";
              } else if (totalActivations >= inv.max_activations) {
                status = "FULL";
              }

              let lastVerifiedAt: string | null = null;
              for (const act of invActivations) {
                if (act.last_verified_at) {
                  if (!lastVerifiedAt || act.last_verified_at > lastVerifiedAt) {
                    lastVerifiedAt = act.last_verified_at;
                  }
                }
              }

              return {
                id: inv.id,
                label: inv.label,
                status,
                totalActivations,
                activeDevices,
                maxActivations: inv.max_activations,
                expiresAt: inv.expires_at,
                lastVerifiedAt,
                createdAt: inv.created_at,
              };
            });

            return jsonResponse(200, { ok: true, invites });
          }

          case "createInvite": {
            const rawLabel = payload.label;
            if (typeof rawLabel !== "string") {
              return jsonResponse(400, { ok: false });
            }
            const label = rawLabel.trim();
            if (label.length < 1 || label.length > 64) {
              return jsonResponse(400, { ok: false });
            }

            const maxActivations = payload.maxActivations;
            if (!Number.isInteger(maxActivations) || maxActivations < 1 || maxActivations > 100) {
              return jsonResponse(400, { ok: false });
            }

            const expiresInDays = payload.expiresInDays;
            if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
              return jsonResponse(400, { ok: false });
            }

            const expiresAtDate = new Date(Date.now() + expiresInDays * 86400 * 1000);
            const expiresAt = expiresAtDate.toISOString();

            let createdRow: any = null;
            let generatedCode = "";

            // Retry up to 3 times ONLY on unique constraint collision (code 23505)
            for (let attempt = 0; attempt < 3; attempt++) {
              const code = generateInviteCode();
              const codeHash = await sha256Hex(code);

              const insertRes = await ctx.supabaseAdmin
                .from("app_invite_codes")
                .insert({
                  code_hash: codeHash,
                  label,
                  max_activations: maxActivations,
                  expires_at: expiresAt,
                  is_active: true,
                })
                .select("id, label, max_activations, expires_at, is_active, created_at")
                .single();

              if (!insertRes.error && insertRes.data) {
                createdRow = insertRes.data;
                generatedCode = code;
                break;
              }

              if (insertRes.error?.code !== "23505") {
                return jsonResponse(500, { ok: false });
              }
            }

            if (!createdRow) {
              return jsonResponse(500, { ok: false });
            }

            return jsonResponse(200, {
              ok: true,
              code: generatedCode,
              invite: {
                id: createdRow.id,
                label: createdRow.label,
                maxActivations: createdRow.max_activations,
                expiresAt: createdRow.expires_at,
                isActive: createdRow.is_active,
                createdAt: createdRow.created_at,
              },
            });
          }

          case "revokeInvite": {
            const inviteId = payload.inviteId;
            if (!validateUuid(inviteId)) {
              return jsonResponse(400, { ok: false });
            }

            const updateRes = await ctx.supabaseAdmin
              .from("app_invite_codes")
              .update({ is_active: false })
              .eq("id", inviteId)
              .select("id, label, max_activations, expires_at, is_active, created_at")
              .single();

            if (updateRes.error || !updateRes.data) {
              return jsonResponse(500, { ok: false });
            }

            const row = updateRes.data;
            return jsonResponse(200, {
              ok: true,
              invite: {
                id: row.id,
                label: row.label,
                maxActivations: row.max_activations,
                expiresAt: row.expires_at,
                isActive: row.is_active,
                createdAt: row.created_at,
              },
            });
          }

          case "listDevices": {
            const inviteId = payload.inviteId;
            if (!validateUuid(inviteId)) {
              return jsonResponse(400, { ok: false });
            }

            const devicesRes = await ctx.supabaseAdmin
              .from("app_activations")
              .select("id, invite_id, activated_at, last_verified_at, revoked_at")
              .eq("invite_id", inviteId)
              .order("activated_at", { ascending: false });

            if (devicesRes.error) {
              return jsonResponse(500, { ok: false });
            }

            const devicesData = devicesRes.data || [];
            const devices = devicesData.map((d: any) => ({
              id: d.id,
              inviteId: d.invite_id,
              activatedAt: d.activated_at,
              lastVerifiedAt: d.last_verified_at,
              revokedAt: d.revoked_at,
              status: d.revoked_at ? "REVOKED" : "ACTIVE",
            }));

            return jsonResponse(200, { ok: true, devices });
          }

          case "revokeDevice": {
            const activationId = payload.activationId;
            if (!validateUuid(activationId)) {
              return jsonResponse(400, { ok: false });
            }

            const nowIso = new Date().toISOString();

            const updateRes = await ctx.supabaseAdmin
              .from("app_activations")
              .update({ revoked_at: nowIso })
              .eq("id", activationId)
              .is("revoked_at", null)
              .select("id, invite_id, activated_at, last_verified_at, revoked_at")
              .single();

            if (updateRes.error || !updateRes.data) {
              return jsonResponse(500, { ok: false });
            }

            const row = updateRes.data;
            return jsonResponse(200, {
              ok: true,
              device: {
                id: row.id,
                inviteId: row.invite_id,
                activatedAt: row.activated_at,
                lastVerifiedAt: row.last_verified_at,
                revokedAt: row.revoked_at,
                status: "REVOKED",
              },
            });
          }

          default:
            return jsonResponse(400, { ok: false });
        }
      } catch (_e) {
        return jsonResponse(500, { ok: false });
      }
    }
  ),
};
