// =============================================================================
// Evotti App Platform — shared auth + data helpers
// =============================================================================
// One Supabase client and the handful of helpers every page needs: who is
// signed in, their profile (with persona + dealer), the tiles their persona
// can see, and sign-out. Pages are gated with Evotti.gate(...).
// =============================================================================

(function () {
  "use strict";
  var cfg = window.EVOTTI_CONFIG || {};
  var client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  var E = { client: client };

  E.currentUser = function () {
    return client.auth.getSession().then(function (r) {
      return r.data.session ? r.data.session.user : null;
    });
  };

  E.accessToken = function () {
    return client.auth.getSession().then(function (r) {
      return r.data.session ? r.data.session.access_token : null;
    });
  };

  // The signed-in user's profile, with persona and dealer joined.
  E.loadProfile = function () {
    return E.currentUser().then(function (user) {
      if (!user) return null;
      return client.from("profiles").select(
        "id, full_name, email," +
        " persona:personas(id,key,name,is_dealer)," +
        " dealer:dealers(id,name,region,city,state)"
      ).eq("id", user.id).single().then(function (r) {
        if (r.error || !r.data) return { id: user.id, email: user.email, persona: null, dealer: null };
        return r.data;
      });
    });
  };

  // Tiles a persona may see, in sort order.
  E.tilesFor = function (personaId) {
    return client.from("persona_tiles")
      .select("tile:tiles(id,key,title,description,href,status,sort)")
      .eq("persona_id", personaId)
      .then(function (r) {
        return (r.data || []).map(function (x) { return x.tile; })
          .sort(function (a, b) { return a.sort - b.sort; });
      });
  };

  E.signOut = function () {
    return client.auth.signOut().then(function () { location.href = "/login.html"; });
  };

  // Gate a page. Returns the profile, or redirects. opts:
  //   requireLeadership: true  -> non-leadership bounced to their home
  //   requireDealer: true      -> non-dealer bounced to their home
  //   allowDealerHere: true    -> don't auto-forward dealers off this page
  E.gate = function (opts) {
    opts = opts || {};
    return E.loadProfile().then(function (profile) {
      if (!profile) { location.href = "/login.html"; return null; }
      var key = profile.persona && profile.persona.key;
      var isDealer = profile.persona && profile.persona.is_dealer;

      // Dealers live on the dealer home unless the page opts in.
      if (isDealer && !opts.allowDealerHere && !opts.requireDealer) {
        location.href = "/dealer/"; return null;
      }
      if (opts.requireLeadership && key !== "leadership") {
        location.href = "/"; return null;
      }
      if (opts.requireDealer && !isDealer) {
        location.href = "/"; return null;
      }
      return profile;
    });
  };

  // Header user menu: name, persona, sign out, and (Leadership) an Admin link.
  E.userMenu = function (profile) {
    var name = (profile && profile.full_name) || (profile && profile.email) || "Signed in";
    var persona = profile && profile.persona ? profile.persona.name : "No role";
    var admin = profile && profile.persona && profile.persona.key === "leadership"
      ? '<a class="um-link" href="/admin/">Admin</a>' : "";
    return '<div class="usermenu">' +
      '<div class="um-id"><span class="um-name">' + esc(name) + "</span>" +
      '<span class="um-role">' + esc(persona) + "</span></div>" +
      admin + '<button class="um-out" id="signout">Sign out</button></div>';
  };

  E.wireUserMenu = function () {
    var b = document.getElementById("signout");
    if (b) b.onclick = function () { E.signOut(); };
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  E.esc = esc;

  window.Evotti = E;
})();
