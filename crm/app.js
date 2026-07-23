/* =============================================================================
   Evotti CRM
   Three objects — companies, persons, activities — with full CRUD over
   Supabase, hash routing, and a poll loop so records written by the
   post-meeting agent appear on screen without anyone touching the page.
   ============================================================================= */

const cfg = window.EVOTTI_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

const POLL_MS = 5000;

const state = {
  companies: [],
  persons: [],
  activities: [],
  // Ids present on the previous render. Anything new gets the arrival
  // animation, which is how the agent's writes announce themselves.
  seen: new Set(),
  primed: false,
};

/* ------------------------------------------------------------------ utils - */

const $ = (sel) => document.querySelector(sel);

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initials(person) {
  return ((person.first_name || '')[0] || '' ) + ((person.last_name || '')[0] || '');
}

function fullName(person) {
  return `${person.first_name || ''} ${person.last_name || ''}`.trim();
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Date -> value a datetime-local input accepts, in the viewer's own zone. */
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3200);
}

function companyById(id) { return state.companies.find((c) => c.id === id); }
function personById(id) { return state.persons.find((p) => p.id === id); }

function agentBadge(record) {
  return record.source === 'agent'
    ? '<span class="badge agent">Added by agent</span>'
    : '';
}

/* ------------------------------------------------------------------- data - */

async function loadAll() {
  const sync = $('#sync');
  sync.classList.add('busy');
  try {
    const [companies, persons, activities] = await Promise.all([
      sb.from('companies').select('*').order('name'),
      sb.from('persons').select('*').order('last_name'),
      sb.from('activities').select('*').order('occurred_at', { ascending: false }),
    ]);

    const failed = [companies, persons, activities].find((r) => r.error);
    if (failed) throw failed.error;

    state.companies = companies.data || [];
    state.persons = persons.data || [];
    state.activities = activities.data || [];
    $('#sync-label').textContent = 'Live';
    return true;
  } catch (err) {
    console.error(err);
    $('#sync-label').textContent = 'Offline';
    toast(`Could not reach Supabase: ${err.message || err}`, true);
    return false;
  } finally {
    sync.classList.remove('busy');
  }
}

/** Cheap change detector so polling only repaints when something moved. */
function signature() {
  const stamp = (rows) => rows.map((r) => `${r.id}:${r.updated_at}`).join(',');
  return stamp(state.companies) + '|' + stamp(state.persons) + '|' + stamp(state.activities);
}

async function save(table, values, id) {
  const query = id
    ? sb.from(table).update(values).eq('id', id)
    : sb.from(table).insert(values);
  const { error } = await query;
  if (error) { toast(error.message, true); return false; }
  await refresh(true);
  toast(id ? 'Saved' : 'Created');
  return true;
}

async function remove(table, id, label) {
  if (!confirm(`Delete ${label}?\n\nThis cannot be undone.`)) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { toast(error.message, true); return; }
  await refresh(true);
  toast('Deleted');
}

/* ----------------------------------------------------------------- router - */

function route() {
  const hash = location.hash.replace(/^#/, '') || '/activity';
  const parts = hash.split('/').filter(Boolean);
  return { section: parts[0] || 'activity', id: parts[1] || null };
}

function render() {
  const { section, id } = route();

  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === section);
  });

  const view = $('#view');
  if (section === 'companies') view.innerHTML = id ? companyDetail(id) : companiesList();
  else if (section === 'people') view.innerHTML = id ? personDetail(id) : peopleList();
  else view.innerHTML = activityFeed();

  markArrivals();
}

/** Flag anything whose id wasn't present last time we painted. */
function markArrivals() {
  const ids = [...state.companies, ...state.persons, ...state.activities].map((r) => r.id);
  if (state.primed) {
    ids.filter((id) => !state.seen.has(id)).forEach((id) => {
      document.querySelectorAll(`[data-id="${id}"]`).forEach((el) => {
        el.classList.add('arrived');
      });
    });
  }
  state.seen = new Set(ids);
  state.primed = true;
}

/* ------------------------------------------------------------------ views - */

function activityFeed() {
  const rows = state.activities;
  return `
    <div class="page-head">
      <h1>Activity</h1>
      <span class="count">${rows.length} record${rows.length === 1 ? '' : 's'}</span>
      <div class="spacer"></div>
      <button class="btn primary" data-act="new-activity">Log activity</button>
    </div>
    ${rows.length
      ? `<div class="timeline">${rows.map(eventCard).join('')}</div>`
      : emptyState('No activity yet.', 'Log activity', 'new-activity')}
  `;
}

function eventCard(activity, opts = {}) {
  const person = personById(activity.person_id);
  const company = companyById(activity.company_id);

  const who = [];
  if (person && !opts.hidePerson) {
    who.push(`<a href="#/people/${person.id}">${esc(fullName(person))}</a>`);
  }
  if (company && !opts.hideCompany) {
    who.push(`<a href="#/companies/${company.id}">${esc(company.name)}</a>`);
  }

  return `
    <article class="event ${activity.source === 'agent' ? 'agent' : ''}" data-id="${activity.id}">
      <div class="event-head">
        <span class="badge type">${esc(activity.type)}</span>
        <span class="event-title">${esc(activity.subject)}</span>
        ${agentBadge(activity)}
        <span class="event-meta">${esc(fmtDate(activity.occurred_at))}</span>
      </div>
      ${activity.body ? `<p class="event-body">${esc(activity.body)}</p>` : ''}
      ${who.length ? `<div class="event-who">${who.join(' &middot; ')}</div>` : ''}
      <div class="event-actions">
        <button class="btn sm ghost" data-act="edit-activity" data-id="${activity.id}">Edit</button>
        <button class="btn sm ghost danger" data-act="del-activity" data-id="${activity.id}">Delete</button>
      </div>
    </article>
  `;
}

function companiesList() {
  const rows = state.companies;
  return `
    <div class="page-head">
      <h1>Companies</h1>
      <span class="count">${rows.length}</span>
      <div class="spacer"></div>
      <button class="btn primary" data-act="new-company">New company</button>
    </div>
    ${rows.length ? `<div class="card"><div class="rows">${rows.map((c) => {
      const people = state.persons.filter((p) => p.company_id === c.id).length;
      return `
        <a class="row" href="#/companies/${c.id}" data-id="${c.id}">
          <div class="grow">
            <div class="primary-text">${esc(c.name)}</div>
            <div class="secondary-text truncate">
              ${esc([c.city, c.state].filter(Boolean).join(', ') || c.domain || '')}
            </div>
          </div>
          <div class="right">
            ${agentBadge(c)}
            <span class="secondary-text">${people} ${people === 1 ? 'person' : 'people'}</span>
          </div>
        </a>`;
    }).join('')}</div></div>`
      : emptyState('No companies yet.', 'New company', 'new-company')}
  `;
}

function companyDetail(id) {
  const company = companyById(id);
  if (!company) return notFound('company');

  const people = state.persons.filter((p) => p.company_id === id);
  const acts = state.activities.filter((a) => a.company_id === id);

  return `
    <a class="crumb" href="#/companies">&larr; Companies</a>
    <div class="page-head">
      <h1>${esc(company.name)}</h1>
      ${agentBadge(company)}
      <div class="spacer"></div>
      <button class="btn" data-act="edit-company" data-id="${id}">Edit</button>
      <button class="btn danger" data-act="del-company" data-id="${id}">Delete</button>
    </div>

    <div class="split">
      <div>
        <div class="card">
          <h2>Details</h2>
          <div class="fields">
            ${field('Domain', company.domain)}
            ${field('Location', [company.city, company.state].filter(Boolean).join(', '))}
            ${field('Notes', company.notes)}
          </div>
        </div>

        <div class="card">
          <h2>People &middot; ${people.length}</h2>
          ${people.length ? `<div class="rows">${people.map(personRow).join('')}</div>` : '<div class="field-value empty">No contacts yet.</div>'}
          <div class="form-actions">
            <button class="btn sm" data-act="new-person" data-company="${id}">Add person</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Activity &middot; ${acts.length}</h2>
        ${acts.length
          ? `<div class="timeline">${acts.map((a) => eventCard(a, { hideCompany: true })).join('')}</div>`
          : '<div class="field-value empty">Nothing logged yet.</div>'}
        <div class="form-actions">
          <button class="btn sm primary" data-act="new-activity" data-company="${id}">Log activity</button>
        </div>
      </div>
    </div>
  `;
}

function personRow(person) {
  return `
    <a class="row" href="#/people/${person.id}" data-id="${person.id}">
      <div class="avatar">${esc(initials(person).toUpperCase())}</div>
      <div class="grow">
        <div class="primary-text">${esc(fullName(person))}</div>
        <div class="secondary-text truncate">${esc(person.title || '')}</div>
      </div>
      <div class="right">${agentBadge(person)}</div>
    </a>
  `;
}

function peopleList() {
  const rows = state.persons;
  return `
    <div class="page-head">
      <h1>People</h1>
      <span class="count">${rows.length}</span>
      <div class="spacer"></div>
      <button class="btn primary" data-act="new-person">New person</button>
    </div>
    ${rows.length ? `<div class="card"><div class="rows">${rows.map((p) => {
      const company = companyById(p.company_id);
      return `
        <a class="row" href="#/people/${p.id}" data-id="${p.id}">
          <div class="avatar">${esc(initials(p).toUpperCase())}</div>
          <div class="grow">
            <div class="primary-text">${esc(fullName(p))}</div>
            <div class="secondary-text truncate">
              ${esc([p.title, company && company.name].filter(Boolean).join(' &middot; ').replace('&middot;', '·'))}
            </div>
          </div>
          <div class="right">${agentBadge(p)}</div>
        </a>`;
    }).join('')}</div></div>`
      : emptyState('No people yet.', 'New person', 'new-person')}
  `;
}

function personDetail(id) {
  const person = personById(id);
  if (!person) return notFound('person');

  const company = companyById(person.company_id);
  const acts = state.activities.filter((a) => a.person_id === id);

  return `
    <a class="crumb" href="#/people">&larr; People</a>
    <div class="page-head">
      <h1>${esc(fullName(person))}</h1>
      ${agentBadge(person)}
      <div class="spacer"></div>
      <button class="btn" data-act="edit-person" data-id="${id}">Edit</button>
      <button class="btn danger" data-act="del-person" data-id="${id}">Delete</button>
    </div>

    <div class="split">
      <div class="card">
        <h2>Details</h2>
        <div class="fields">
          ${field('Title', person.title)}
          ${field('Company', company
            ? `<a href="#/companies/${company.id}" style="color:var(--accent);text-decoration:none">${esc(company.name)}</a>`
            : '', true)}
          ${field('Email', person.email
            ? `<a href="mailto:${esc(person.email)}" style="color:var(--accent);text-decoration:none">${esc(person.email)}</a>`
            : '', true)}
          ${field('Phone', person.phone)}
          ${field('Notes', person.notes)}
        </div>
      </div>

      <div class="card">
        <h2>Activity &middot; ${acts.length}</h2>
        ${acts.length
          ? `<div class="timeline">${acts.map((a) => eventCard(a, { hidePerson: true })).join('')}</div>`
          : '<div class="field-value empty">Nothing logged yet.</div>'}
        <div class="form-actions">
          <button class="btn sm primary" data-act="new-activity" data-person="${id}">Log activity</button>
        </div>
      </div>
    </div>
  `;
}

function field(label, value, isHtml = false) {
  const empty = value === null || value === undefined || value === '';
  return `
    <div>
      <div class="field-label">${esc(label)}</div>
      <div class="field-value ${empty ? 'empty' : ''}">
        ${empty ? 'Not set' : (isHtml ? value : esc(value))}
      </div>
    </div>
  `;
}

function emptyState(message, buttonLabel, action) {
  return `
    <div class="card empty-state">
      <p>${esc(message)}</p>
      <button class="btn primary" data-act="${action}">${esc(buttonLabel)}</button>
    </div>
  `;
}

function notFound(kind) {
  return `<div class="card empty-state"><p>That ${esc(kind)} no longer exists.</p></div>`;
}

/* ------------------------------------------------------------------ forms - */

function openModal(title, innerHtml, onSubmit) {
  $('#modal-title').textContent = title;
  const form = $('#modal-form');
  form.innerHTML = innerHtml;
  $('#modal-backdrop').hidden = false;

  const first = form.querySelector('input, select, textarea');
  if (first) first.focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });
    const ok = await onSubmit(data);
    if (ok !== false) closeModal();
  };
}

function closeModal() {
  $('#modal-backdrop').hidden = true;
  $('#modal-form').innerHTML = '';
}

function actions(extraLeft = '') {
  return `
    <div class="form-actions">
      ${extraLeft}
      <button type="button" class="btn ghost" data-act="cancel">Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  `;
}

function companyForm(company) {
  openModal(company ? 'Edit company' : 'New company', `
    <div class="form-grid">
      <label>Name<input name="name" required value="${esc(company?.name)}"></label>
      <label>Domain<input name="domain" placeholder="example.com" value="${esc(company?.domain)}"></label>
      <div class="form-grid two">
        <label>City<input name="city" value="${esc(company?.city)}"></label>
        <label>State<input name="state" value="${esc(company?.state)}"></label>
      </div>
      <label>Notes<textarea name="notes">${esc(company?.notes)}</textarea></label>
    </div>
    ${actions()}
  `, (data) => save('companies', data, company?.id));
}

function personForm(person, presetCompanyId) {
  const options = state.companies.map((c) =>
    `<option value="${c.id}" ${(person?.company_id || presetCompanyId) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');

  openModal(person ? 'Edit person' : 'New person', `
    <div class="form-grid">
      <div class="form-grid two">
        <label>First name<input name="first_name" required value="${esc(person?.first_name)}"></label>
        <label>Last name<input name="last_name" required value="${esc(person?.last_name)}"></label>
      </div>
      <label>Title<input name="title" value="${esc(person?.title)}"></label>
      <label>Company<select name="company_id"><option value="">—</option>${options}</select></label>
      <div class="form-grid two">
        <label>Email<input name="email" type="email" value="${esc(person?.email)}"></label>
        <label>Phone<input name="phone" value="${esc(person?.phone)}"></label>
      </div>
      <label>Notes<textarea name="notes">${esc(person?.notes)}</textarea></label>
    </div>
    ${actions()}
  `, (data) => save('persons', data, person?.id));
}

function activityForm(activity, preset = {}) {
  const selectedPerson = activity?.person_id || preset.personId || '';
  const presetPerson = personById(selectedPerson);
  const selectedCompany = activity?.company_id || preset.companyId
    || (presetPerson && presetPerson.company_id) || '';

  const personOptions = state.persons.map((p) =>
    `<option value="${p.id}" ${selectedPerson === p.id ? 'selected' : ''}>${esc(fullName(p))}</option>`
  ).join('');

  const companyOptions = state.companies.map((c) =>
    `<option value="${c.id}" ${selectedCompany === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');

  const types = ['meeting', 'call', 'email', 'note'].map((t) =>
    `<option value="${t}" ${(activity?.type || 'meeting') === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`
  ).join('');

  openModal(activity ? 'Edit activity' : 'Log activity', `
    <div class="form-grid">
      <div class="form-grid two">
        <label>Type<select name="type">${types}</select></label>
        <label>When<input name="occurred_at" type="datetime-local"
               value="${toLocalInput(activity?.occurred_at)}"></label>
      </div>
      <label>Subject<input name="subject" required value="${esc(activity?.subject)}"></label>
      <label>Notes<textarea name="body">${esc(activity?.body)}</textarea></label>
      <div class="form-grid two">
        <label>Person<select name="person_id"><option value="">—</option>${personOptions}</select></label>
        <label>Company<select name="company_id"><option value="">—</option>${companyOptions}</select></label>
      </div>
    </div>
    ${actions()}
  `, (data) => {
    data.occurred_at = data.occurred_at
      ? new Date(data.occurred_at).toISOString()
      : new Date().toISOString();
    // Keep the company consistent with the person when one was chosen.
    if (!data.company_id && data.person_id) {
      const p = personById(data.person_id);
      if (p) data.company_id = p.company_id;
    }
    return save('activities', data, activity?.id);
  });
}

/* ---------------------------------------------------------------- actions - */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    // Click on the backdrop itself closes the modal.
    if (e.target.id === 'modal-backdrop') closeModal();
    return;
  }

  const { act, id, company, person } = el.dataset;

  switch (act) {
    case 'cancel':        closeModal(); break;

    case 'new-company':   companyForm(null); break;
    case 'edit-company':  companyForm(companyById(id)); break;
    case 'del-company': {
      const c = companyById(id);
      remove('companies', id, `${c.name} — along with its people and activity`)
        .then(() => { if (location.hash.includes(id)) location.hash = '#/companies'; });
      break;
    }

    case 'new-person':    personForm(null, company); break;
    case 'edit-person':   personForm(personById(id)); break;
    case 'del-person': {
      const p = personById(id);
      remove('persons', id, `${fullName(p)} — along with their activity`)
        .then(() => { if (location.hash.includes(id)) location.hash = '#/people'; });
      break;
    }

    case 'new-activity':  activityForm(null, { companyId: company, personId: person }); break;
    case 'edit-activity': activityForm(state.activities.find((a) => a.id === id)); break;
    case 'del-activity':  remove('activities', id, 'this activity'); break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal();
});

/* ------------------------------------------------------------------- boot - */

let lastSignature = '';

async function refresh(force = false) {
  const ok = await loadAll();
  if (!ok) return;
  const sig = signature();
  if (force || sig !== lastSignature) {
    lastSignature = sig;
    render();
  }
}

window.addEventListener('hashchange', render);

(async function boot() {
  await loadAll();
  lastSignature = signature();
  render();
  // Poll so the agent's post-meeting writes surface on their own. Paused while
  // a form is open so the page cannot repaint out from under someone typing.
  setInterval(() => {
    if ($('#modal-backdrop').hidden) refresh();
  }, POLL_MS);
})();
