// ─────────────────────────────────────────────────────────────────────────────
// /vibes/lead-visit — Sampling drop-in form for prospect dispensaries
// ─────────────────────────────────────────────────────────────────────────────
// When a Vibes rep is dropping into a Lead (prospect store) for a sampling
// touch — no SKU audit, no merchandising check, no live training. Just a
// short 5-question check-in:
//
//   1. Interest level           (Cold / Warm / Hot / Red Hot)
//   2. Who she talked to         (name + role, flag if buyer)
//   3. Samples left              (free text)
//   4. Discussion / takeaways    (free text)
//   5. Sales handoff             (free text)
//
// Data targets Zoho LEADS, not Accounts. If the dispensary isn't in Leads
// yet, the rep can add it inline with a compact create form.
// ─────────────────────────────────────────────────────────────────────────────

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';
import {useEffect, useRef, useState} from 'react';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

type VibesRep = {
  id: string;
  full_name: string;
};

type LeadHit = {
  id: string;
  company: string;
  city?: string | null;
  state?: string | null;
  contactName?: string | null;
  title?: string | null;
};

type InterestLevel = 'cold' | 'warm' | 'hot' | 'red_hot';

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  let reps: VibesRep[] = [];
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/vibes_reps?active=eq.true&select=id,full_name&order=start_date.asc`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (res.ok) reps = await res.json();
    } catch (err) {
      console.warn('[vibes/lead-visit] Supabase fetch failed', err);
    }
  }
  return json({reps});
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Sampling Drop-in · Vibes · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─── Brand ──────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  hot: '#FF5722',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

const INTEREST_OPTIONS: Array<{
  value: InterestLevel;
  label: string;
  color: string;
  blurb: string;
}> = [
  {value: 'cold', label: 'Cold', color: '#4FC3F7', blurb: 'Barely engaged. No follow-up needed.'},
  {value: 'warm', label: 'Warm', color: '#FFB300', blurb: 'Took samples, listened. Worth a rotation.'},
  {value: 'hot', label: 'Hot', color: '#FF8A00', blurb: 'Asked pricing / case size. Send sales.'},
  {value: 'red_hot', label: 'Red Hot', color: '#FF3B30', blurb: 'Ready to order. Sales this week.'},
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function LeadVisitPage() {
  const {reps} = useLoaderData<typeof loader>();

  useEffect(() => {
    if (document.getElementById('lv-font-link')) return;
    const l = document.createElement('link');
    l.id = 'lv-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'klv-lv';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  // Rep selector
  const [rep, setRep] = useState<VibesRep | null>(reps[0] || null);

  // Lead search / select / create
  const [leadId, setLeadId] = useState<string>('');
  const [leadCompany, setLeadCompany] = useState<string>('');
  const [leadCity, setLeadCity] = useState<string>('');
  const [leadState, setLeadState] = useState<string>('NJ');
  const [leadQuery, setLeadQuery] = useState<string>('');
  const [leadHits, setLeadHits] = useState<LeadHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [createdNewLead, setCreatedNewLead] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  // Inline "create new lead" form toggle
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLead, setNewLead] = useState({
    company: '',
    contactName: '',
    title: '',
    phone: '',
    email: '',
    street: '',
    city: '',
    state: 'NJ',
    zip: '',
    description: '',
  });
  const [creatingLead, setCreatingLead] = useState(false);
  const [createLeadError, setCreateLeadError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadQuery || leadQuery.length < 3) {
      setLeadHits([]);
      return;
    }
    const t = setTimeout(async () => {
      if (searchAbort.current) searchAbort.current.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/leads?q=${encodeURIComponent(leadQuery)}`,
          {signal: ctrl.signal},
        );
        const data: {leads?: LeadHit[]} = await res.json();
        setLeadHits(data.leads || []);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setLeadHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [leadQuery]);

  function selectLead(l: LeadHit) {
    setLeadId(l.id);
    setLeadCompany(l.company);
    setLeadCity(l.city || '');
    setLeadState((l.state || 'NJ').toUpperCase());
    setLeadQuery('');
    setLeadHits([]);
    setCreatedNewLead(false);
    setShowCreateForm(false);
  }

  function clearLead() {
    setLeadId('');
    setLeadCompany('');
    setLeadCity('');
    setLeadState('NJ');
    setCreatedNewLead(false);
  }

  async function submitNewLead() {
    if (!newLead.company.trim()) {
      setCreateLeadError('Dispensary name is required.');
      return;
    }
    setCreatingLead(true);
    setCreateLeadError(null);
    try {
      const fd = new FormData();
      fd.set('company', newLead.company.trim());
      if (newLead.contactName.trim()) fd.set('contactName', newLead.contactName.trim());
      if (newLead.title.trim()) fd.set('title', newLead.title.trim());
      if (newLead.phone.trim()) fd.set('phone', newLead.phone.trim());
      if (newLead.email.trim()) fd.set('email', newLead.email.trim());
      if (newLead.street.trim()) fd.set('street', newLead.street.trim());
      if (newLead.city.trim()) fd.set('city', newLead.city.trim());
      fd.set('state', newLead.state);
      if (newLead.zip.trim()) fd.set('zip', newLead.zip.trim());
      if (newLead.description.trim()) fd.set('description', newLead.description.trim());

      const res = await fetch('/api/leads', {method: 'POST', body: fd});
      const data: {ok?: boolean; lead?: any; error?: string} = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        setCreateLeadError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.lead) {
        setLeadId(data.lead.id);
        setLeadCompany(data.lead.company);
        setLeadCity(data.lead.city || newLead.city);
        setLeadState(data.lead.state || newLead.state);
        setCreatedNewLead(true);
        setShowCreateForm(false);
        // Pre-fill the contact in the top-level contact field for the visit
        if (newLead.contactName && !contactName) {
          setContactName(newLead.contactName);
        }
        if (newLead.title && !contactRole) {
          setContactRole(newLead.title);
        }
      }
    } catch (e: any) {
      setCreateLeadError(e?.message || 'Network error');
    } finally {
      setCreatingLead(false);
    }
  }

  // The 5 questions
  const [interestLevel, setInterestLevel] = useState<InterestLevel | ''>('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactIsBuyer, setContactIsBuyer] = useState(false);
  const [samplesLeft, setSamplesLeft] = useState('');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [salesHandoff, setSalesHandoff] = useState('');

  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filedVisits, setFiledVisits] = useState<
    Array<{
      id: string;
      leadCompany: string;
      interestLevel: InterestLevel;
      contactName: string;
      status: 'sending' | 'filed' | 'filed_no_note' | 'error';
      message?: string;
    }>
  >([]);

  const canFile =
    !sending &&
    !!leadCompany.trim() &&
    !!interestLevel;

  async function fileVisit() {
    if (!canFile || !interestLevel) return;
    setSending(true);
    setErrorMsg(null);
    const tempId = `lv_${Date.now()}`;
    const snapshot = {
      id: tempId,
      leadCompany,
      interestLevel: interestLevel as InterestLevel,
      contactName,
      status: 'sending' as const,
    };
    setFiledVisits([snapshot, ...filedVisits]);

    try {
      const fd = new FormData();
      if (rep) {
        fd.set('repId', rep.id);
        fd.set('repName', rep.full_name);
      }
      if (leadId) fd.set('zohoLeadId', leadId);
      fd.set('leadCompany', leadCompany);
      if (leadCity) fd.set('leadCity', leadCity);
      if (leadState) fd.set('leadState', leadState);
      fd.set('interestLevel', interestLevel);
      if (contactName.trim()) fd.set('contactName', contactName.trim());
      if (contactRole.trim()) fd.set('contactRole', contactRole.trim());
      fd.set('contactIsBuyer', contactIsBuyer ? 'true' : 'false');
      if (samplesLeft.trim()) fd.set('samplesLeft', samplesLeft.trim());
      if (discussionNotes.trim()) fd.set('discussionNotes', discussionNotes.trim());
      if (salesHandoff.trim()) fd.set('salesHandoff', salesHandoff.trim());
      fd.set('createdNewLead', createdNewLead ? 'true' : 'false');

      const res = await fetch('/api/lead-visit-submit', {method: 'POST', body: fd});
      const data: {
        ok?: boolean;
        zohoNoteAttached?: boolean;
        zohoNoteError?: string;
        message?: string;
      } = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        setFiledVisits((prev) =>
          prev.map((v) =>
            v.id === tempId
              ? {...v, status: 'error', message: data.message || `HTTP ${res.status}`}
              : v,
          ),
        );
        setErrorMsg(data.message || `Submit failed (HTTP ${res.status})`);
        return;
      }

      const nextStatus: 'filed' | 'filed_no_note' = data.zohoNoteAttached
        ? 'filed'
        : 'filed_no_note';
      setFiledVisits((prev) =>
        prev.map((v) =>
          v.id === tempId
            ? {...v, status: nextStatus, message: data.zohoNoteError || undefined}
            : v,
        ),
      );

      // Reset the 5-question part — keep the lead so she can stack multiple notes
      setInterestLevel('');
      setContactName('');
      setContactRole('');
      setContactIsBuyer(false);
      setSamplesLeft('');
      setDiscussionNotes('');
      setSalesHandoff('');
    } catch (e: any) {
      setFiledVisits((prev) =>
        prev.map((v) =>
          v.id === tempId
            ? {...v, status: 'error', message: e?.message || 'Network error'}
            : v,
        ),
      );
      setErrorMsg(e?.message || 'Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
        padding: '16px 16px 40px',
      }}
    >
      <div style={{maxWidth: 520, margin: '0 auto'}}>
        {/* ─── Header ───────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Link
            to="/vibes"
            style={{
              color: BRAND.gray,
              textDecoration: 'none',
              fontFamily: TEKO,
              fontSize: 14,
              letterSpacing: '0.12em',
            }}
          >
            ← VIBES
          </Link>
          <img src={LOGO_WHITE} alt="Highsman" style={{height: 18}} />
        </div>

        <div
          style={{
            fontFamily: TEKO,
            fontSize: 32,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: BRAND.white,
          }}
        >
          Sampling drop-in
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 4,
            marginBottom: 18,
          }}
        >
          Quick 5-question check-in for a prospect dispensary. Goes to Zoho
          Leads + queues any sales hand-offs.
        </div>

        {/* ─── Rep ──────────────────────────────────────────────────────── */}
        {reps.length > 1 ? (
          <div style={{marginBottom: 14}}>
            <Label>Rep</Label>
            <select
              value={rep?.id || ''}
              onChange={(e) =>
                setRep(reps.find((r) => r.id === e.target.value) || null)
              }
              style={inputStyle()}
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : rep ? (
          <div style={{marginBottom: 14}}>
            <Label>Rep</Label>
            <div
              style={{
                padding: '10px 12px',
                background: BRAND.chip,
                border: `1px solid ${BRAND.line}`,
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              {rep.full_name}
            </div>
          </div>
        ) : null}

        {/* ─── Lead selector / create ──────────────────────────────────── */}
        <div style={{marginBottom: 18}}>
          <Label>Dispensary (Lead)</Label>
          {leadCompany ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: 'rgba(255,138,0,0.12)',
                border: `1px solid ${BRAND.orange}`,
                borderRadius: 6,
              }}
            >
              <div>
                <div style={{color: BRAND.white, fontSize: 14}}>
                  {leadCompany}
                  {createdNewLead ? (
                    <span
                      style={{
                        color: BRAND.green,
                        fontFamily: TEKO,
                        fontSize: 11,
                        letterSpacing: '0.14em',
                        marginLeft: 8,
                      }}
                    >
                      · NEW LEAD
                    </span>
                  ) : null}
                </div>
                <div style={{color: BRAND.gray, fontSize: 11}}>
                  {[leadCity, leadState].filter(Boolean).join(', ') || '—'}
                  {leadId ? ` · ${leadId.slice(-6)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={clearLead}
                style={{
                  background: 'transparent',
                  color: BRAND.gray,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: TEKO,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                CHANGE
              </button>
            </div>
          ) : showCreateForm ? (
            <div
              style={{
                padding: 12,
                background: BRAND.chip,
                border: `1px solid ${BRAND.line}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: BRAND.gold,
                  marginBottom: 10,
                }}
              >
                New lead
              </div>
              <div style={{marginBottom: 10}}>
                <Label>Dispensary name *</Label>
                <input
                  type="text"
                  value={newLead.company}
                  onChange={(e) =>
                    setNewLead({...newLead, company: e.target.value})
                  }
                  placeholder="Garfield Greens"
                  style={inputStyle()}
                />
              </div>
              <div style={{display: 'flex', gap: 8, marginBottom: 10}}>
                <div style={{flex: 1}}>
                  <Label>Contact name</Label>
                  <input
                    type="text"
                    value={newLead.contactName}
                    onChange={(e) =>
                      setNewLead({...newLead, contactName: e.target.value})
                    }
                    placeholder="Jane Doe"
                    style={inputStyle()}
                  />
                </div>
                <div style={{flex: 1}}>
                  <Label>Role</Label>
                  <input
                    type="text"
                    value={newLead.title}
                    onChange={(e) =>
                      setNewLead({...newLead, title: e.target.value})
                    }
                    placeholder="Buyer, GM…"
                    style={inputStyle()}
                  />
                </div>
              </div>
              <div style={{display: 'flex', gap: 8, marginBottom: 10}}>
                <div style={{flex: 1}}>
                  <Label>Phone</Label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={(e) =>
                      setNewLead({...newLead, phone: e.target.value})
                    }
                    style={inputStyle()}
                  />
                </div>
                <div style={{flex: 1}}>
                  <Label>Email</Label>
                  <input
                    type="email"
                    value={newLead.email}
                    onChange={(e) =>
                      setNewLead({...newLead, email: e.target.value})
                    }
                    style={inputStyle()}
                  />
                </div>
              </div>
              <div style={{marginBottom: 10}}>
                <Label>Street</Label>
                <input
                  type="text"
                  value={newLead.street}
                  onChange={(e) =>
                    setNewLead({...newLead, street: e.target.value})
                  }
                  style={inputStyle()}
                />
              </div>
              <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
                <div style={{flex: 2}}>
                  <Label>City</Label>
                  <input
                    type="text"
                    value={newLead.city}
                    onChange={(e) =>
                      setNewLead({...newLead, city: e.target.value})
                    }
                    style={inputStyle()}
                  />
                </div>
                <div style={{width: 70}}>
                  <Label>State</Label>
                  <input
                    type="text"
                    value={newLead.state}
                    onChange={(e) =>
                      setNewLead({
                        ...newLead,
                        state: e.target.value.toUpperCase().slice(0, 2),
                      })
                    }
                    style={inputStyle()}
                  />
                </div>
                <div style={{flex: 1}}>
                  <Label>Zip</Label>
                  <input
                    type="text"
                    value={newLead.zip}
                    onChange={(e) =>
                      setNewLead({...newLead, zip: e.target.value})
                    }
                    style={inputStyle()}
                  />
                </div>
              </div>

              {createLeadError ? (
                <div
                  style={{
                    color: BRAND.red,
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  {createLeadError}
                </div>
              ) : null}

              <div style={{display: 'flex', gap: 8}}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateLeadError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: 'transparent',
                    color: BRAND.gray,
                    border: `1px solid ${BRAND.line}`,
                    borderRadius: 6,
                    fontFamily: TEKO,
                    fontSize: 14,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitNewLead}
                  disabled={creatingLead || !newLead.company.trim()}
                  style={{
                    flex: 2,
                    padding: '10px 12px',
                    background: newLead.company.trim()
                      ? BRAND.gold
                      : BRAND.line,
                    color: newLead.company.trim() ? BRAND.black : BRAND.gray,
                    border: 'none',
                    borderRadius: 6,
                    fontFamily: TEKO,
                    fontSize: 14,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: newLead.company.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  {creatingLead ? 'Creating…' : 'Create lead'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder="Search Zoho Leads…"
                style={inputStyle()}
              />
              {searching ? (
                <div style={{color: BRAND.gray, fontSize: 11, marginTop: 4}}>
                  Searching…
                </div>
              ) : null}
              {leadHits.length > 0 ? (
                <div
                  style={{
                    marginTop: 4,
                    border: `1px solid ${BRAND.line}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  {leadHits.slice(0, 6).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => selectLead(l)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: BRAND.chip,
                        border: 'none',
                        borderBottom: `1px solid ${BRAND.line}`,
                        color: BRAND.white,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{fontSize: 13}}>{l.company}</div>
                      <div style={{color: BRAND.gray, fontSize: 11}}>
                        {[l.city, l.state].filter(Boolean).join(', ')}
                        {l.contactName
                          ? ` · ${l.contactName}${l.title ? ` (${l.title})` : ''}`
                          : ''}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(true);
                  setCreateLeadError(null);
                  // Seed company from the search query so rep doesn't retype
                  if (leadQuery.trim() && !newLead.company) {
                    setNewLead((n) => ({...n, company: leadQuery.trim()}));
                  }
                }}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '10px 12px',
                  background: 'transparent',
                  color: BRAND.gold,
                  border: `1px dashed ${BRAND.gold}`,
                  borderRadius: 6,
                  fontFamily: TEKO,
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                + Add new lead
              </button>
            </div>
          )}
        </div>

        {leadCompany ? (
          <>
            {/* ─── Q1. Interest level ─────────────────────────────────── */}
            <div style={{marginBottom: 18}}>
              <Label>1. Interest level</Label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                }}
              >
                {INTEREST_OPTIONS.map((opt) => {
                  const selected = interestLevel === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setInterestLevel(opt.value)}
                      style={{
                        padding: '10px 4px',
                        background: selected ? opt.color : BRAND.chip,
                        color: selected ? BRAND.black : BRAND.white,
                        border: `1px solid ${selected ? opt.color : BRAND.line}`,
                        borderRadius: 6,
                        fontFamily: TEKO,
                        fontSize: 14,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {interestLevel ? (
                <div
                  style={{
                    color: BRAND.gray,
                    fontSize: 11,
                    marginTop: 6,
                    fontStyle: 'italic',
                  }}
                >
                  {
                    INTEREST_OPTIONS.find((o) => o.value === interestLevel)
                      ?.blurb
                  }
                </div>
              ) : null}
            </div>

            {/* ─── Q2. Contact ─────────────────────────────────────────── */}
            <div style={{marginBottom: 14}}>
              <Label>2. Who did you talk to?</Label>
              <div style={{display: 'flex', gap: 8}}>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Name"
                  style={{...inputStyle(), flex: 2}}
                />
                <input
                  type="text"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="Role (Buyer, GM, Bud…)"
                  style={{...inputStyle(), flex: 2}}
                />
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={contactIsBuyer}
                  onChange={(e) => setContactIsBuyer(e.target.checked)}
                  style={{accentColor: BRAND.orange}}
                />
                <span style={{color: BRAND.white, fontSize: 13}}>
                  🎯 This is the <strong>buyer</strong> / decision-maker (flag
                  for sales)
                </span>
              </label>
            </div>

            {/* ─── Q3. Samples left ────────────────────────────────────── */}
            <div style={{marginBottom: 14}}>
              <Label>3. Samples left</Label>
              <textarea
                value={samplesLeft}
                onChange={(e) => setSamplesLeft(e.target.value)}
                placeholder="e.g. 2x Triple Threat, 1x Hit Stick Gelato, Ground Game Blue Dream…"
                rows={3}
                style={{...inputStyle(), resize: 'vertical'}}
              />
            </div>

            {/* ─── Q4. Discussion ──────────────────────────────────────── */}
            <div style={{marginBottom: 14}}>
              <Label>4. Discussion / key takeaways</Label>
              <textarea
                value={discussionNotes}
                onChange={(e) => setDiscussionNotes(e.target.value)}
                placeholder="What came up — pricing questions, brand interest, store priorities, objections…"
                rows={3}
                style={{...inputStyle(), resize: 'vertical'}}
              />
            </div>

            {/* ─── Q5. Sales handoff ───────────────────────────────────── */}
            <div style={{marginBottom: 18}}>
              <Label>5. Sales handoff (what should the salesperson know?)</Label>
              <textarea
                value={salesHandoff}
                onChange={(e) => setSalesHandoff(e.target.value)}
                placeholder="e.g. Ready to order a case of Hit Stick. Call Jane Wed afternoon."
                rows={3}
                style={{...inputStyle(), resize: 'vertical'}}
              />
            </div>

            <button
              type="button"
              onClick={fileVisit}
              disabled={!canFile}
              style={{
                width: '100%',
                padding: '14px 14px',
                background: canFile ? BRAND.orange : BRAND.line,
                color: canFile ? BRAND.black : BRAND.gray,
                border: 'none',
                borderRadius: 6,
                fontFamily: TEKO,
                fontSize: 20,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: canFile ? 'pointer' : 'not-allowed',
              }}
            >
              {sending ? 'Logging visit…' : 'Log visit → Zoho Lead'}
            </button>

            {errorMsg ? (
              <div style={{color: BRAND.red, fontSize: 12, marginTop: 8}}>
                {errorMsg}
              </div>
            ) : null}
          </>
        ) : null}

        {/* ─── Filed list ─────────────────────────────────────────────── */}
        {filedVisits.length > 0 ? (
          <div style={{marginTop: 24}}>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 18,
                color: BRAND.white,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Logged this session ({filedVisits.length})
            </div>
            <div style={{display: 'grid', gap: 6}}>
              {filedVisits.map((v) => {
                const {color, label} = visitStatusPresentation(v.status);
                const interest = INTEREST_OPTIONS.find(
                  (o) => o.value === v.interestLevel,
                );
                return (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: BRAND.chip,
                      border: `1px solid ${BRAND.line}`,
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div style={{color: BRAND.white, fontSize: 13}}>
                        {v.leadCompany}
                        {interest ? (
                          <span
                            style={{
                              color: interest.color,
                              fontFamily: TEKO,
                              fontSize: 11,
                              letterSpacing: '0.12em',
                              marginLeft: 8,
                            }}
                          >
                            · {interest.label.toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                      {v.contactName ? (
                        <div style={{color: BRAND.gray, fontSize: 11}}>
                          {v.contactName}
                        </div>
                      ) : null}
                      {v.message ? (
                        <div style={{color: BRAND.red, fontSize: 10}}>
                          {v.message}
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontFamily: TEKO,
                        fontSize: 11,
                        color,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Presentational helpers ────────────────────────────────────────────────
function Label({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        color: BRAND.gray,
        fontFamily: TEKO,
        fontSize: 12,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    background: BRAND.chip,
    color: BRAND.white,
    border: `1px solid ${BRAND.line}`,
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    fontFamily: BODY,
  };
}

function visitStatusPresentation(status: string): {
  color: string;
  label: string;
} {
  switch (status) {
    case 'filed':
      return {color: BRAND.green, label: '✓ Logged'};
    case 'filed_no_note':
      return {color: BRAND.gold, label: '✓ Saved · note retry'};
    case 'error':
      return {color: BRAND.red, label: '! Error'};
    case 'sending':
    default:
      return {color: BRAND.gray, label: 'Sending…'};
  }
}
