// =============================================================================
// Evotti App Platform — user admin (Netlify Function, service role)
// =============================================================================
// Creating auth users requires the Supabase service-role key, which must never
// reach the browser. This function holds it server-side, verifies the caller is
// a Leadership user, then creates / updates / deletes users on their behalf.
//
// Netlify env vars required:
//   SUPABASE_URL                (defaults to the project URL below)
//   SUPABASE_SERVICE_ROLE_KEY   (Supabase dashboard → Settings → API)
// =============================================================================

const URL = process.env.SUPABASE_URL || "https://otwsxsftqbtwdqfofswk.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const JSON_H = { "Content-Type": "application/json" };

function reply(code, obj) {
  return { statusCode: code, headers: JSON_H, body: JSON.stringify(obj) };
}

// Service-role REST helper.
function rest(path, opts) {
  opts = opts || {};
  return fetch(URL + path, {
    method: opts.method || "GET",
    headers: Object.assign({
      apikey: SERVICE,
      Authorization: "Bearer " + SERVICE,
      "Content-Type": "application/json"
    }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
}

// Confirm the bearer token belongs to a Leadership user.
async function verifyLeadership(token) {
  const ur = await fetch(URL + "/auth/v1/user", {
    headers: { apikey: SERVICE, Authorization: "Bearer " + token }
  });
  if (!ur.ok) return { ok: false, status: 401, error: "invalid session" };
  const user = await ur.json();

  const pr = await rest("/rest/v1/profiles?select=persona:personas(key)&id=eq." + user.id);
  const rows = pr.ok ? await pr.json() : [];
  const key = rows[0] && rows[0].persona && rows[0].persona.key;
  if (key !== "leadership") return { ok: false, status: 403, error: "not authorized" };
  return { ok: true, user: user };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });
  if (!SERVICE) return reply(500, { error: "SUPABASE_SERVICE_ROLE_KEY is not set in Netlify" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return reply(400, { error: "bad json" }); }

  if (!body.token) return reply(401, { error: "no session token" });
  const auth = await verifyLeadership(body.token);
  if (!auth.ok) return reply(auth.status, { error: auth.error });

  try {
    if (body.action === "create") return await createUser(body);
    if (body.action === "update") return await updateUser(body);
    if (body.action === "delete") return await deleteUser(body, auth.user.id);
    return reply(400, { error: "unknown action" });
  } catch (err) {
    return reply(500, { error: String((err && err.message) || err) });
  }
};

async function createUser(body) {
  if (!body.email || !body.password) return reply(400, { error: "email and password required" });

  // 1. Create the auth user (auto-confirmed). A trigger creates the profile row.
  const cr = await fetch(URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name || "" }
    })
  });
  const created = await cr.json();
  if (!cr.ok) return reply(cr.status, { error: created.msg || created.error_description || created.error || "could not create user" });

  // 2. Set persona / dealer on the profile.
  await rest("/rest/v1/profiles?id=eq." + created.id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      full_name: body.full_name || "",
      email: body.email,
      persona_id: body.persona_id || null,
      dealer_id: body.dealer_id || null
    }
  });
  return reply(200, { ok: true, id: created.id });
}

async function updateUser(body) {
  if (!body.id) return reply(400, { error: "id required" });
  await rest("/rest/v1/profiles?id=eq." + body.id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { persona_id: body.persona_id || null, dealer_id: body.dealer_id || null }
  });
  return reply(200, { ok: true });
}

async function deleteUser(body, callerId) {
  if (!body.id) return reply(400, { error: "id required" });
  if (body.id === callerId) return reply(400, { error: "you can't delete your own account" });
  const dr = await fetch(URL + "/auth/v1/admin/users/" + body.id, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE }
  });
  if (!dr.ok) return reply(dr.status, { error: "could not delete user" });
  return reply(200, { ok: true });
}
