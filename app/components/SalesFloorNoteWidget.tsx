/**
 * app/components/SalesFloorNoteWidget.tsx
 *
 * Inline note widget for Sales Floor feed cards.
 * Place ABOVE <CardActions> inside any feed card.
 *
 * Three states:
 *   no note, collapsed  → slim "+ NOTE" button only
 *   has note, collapsed → header (channel badge + author + time) with [+ NOTE] [ALL →]
 *                         + full multi-line body text below
 *   expanded            → inline compose form (channel selector + textarea + save/cancel)
 *
 * Props:
 *   orgId      — org UUID
 *   latestNote — most recent note from loader (null if none yet)
 *   from       — slug for ?from= back-button param (e.g. 'reorders', 'accounts', 'leads')
 *
 * Left-aligns with the account name column (~72px indent).
 * Body text constrained to max-width 560px for readable line lengths.
 */

import {useState, useEffect} from 'react';
import {useFetcher} from '@remix-run/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotePreview = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:           '#0A0A0A',
  surface:      '#141414',
  surfaceElev:  '#1A1A1A',
  border:       '#1F1F1F',
  borderStrong: '#2F2F2F',
  text:         '#F5F5F5',
  textMuted:    '#C8C8C8',
  textSubtle:   '#9C9C9C',
  textFaint:    '#6A6A6A',
  yellow:       '#FFD500',
  cyan:         '#00D4FF',
  green:        '#00E676',
  magenta:      '#FF3B7F',
};

const CH_COLORS: Record<string, string> = {
  CALL: T.green, TEXT: T.cyan, EMAIL: T.yellow, VISIT: T.magenta,
};

// Left indent to align with account name (4px rail + 56px logo col + 12px padding)
const LEFT_INDENT = 72;
// Max width of note content for comfortable reading
const NOTE_MAX_W  = 560;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNote(body: string): {channel: string | null; text: string} {
  const m = body.match(/^\[([A-Z]+)\]\s*/);
  if (m) return {channel: m[1], text: body.slice(m[0].length)};
  return {channel: null, text: body};
}

function relTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

// Small pencil icon
function PencilIco() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{display:'block',flexShrink:0}}>
      <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z"/>
    </svg>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function SalesFloorNoteWidget({
  orgId,
  latestNote,
  from = 'reorders',
}: {
  orgId: string;
  latestNote: NotePreview | null;
  from?: string;
}) {
  const fetcher  = useFetcher();
  const [expanded,  setExpanded]  = useState(false);
  const [channel,   setChannel]   = useState<string | null>(null);
  const [text,      setText]      = useState('');
  const [localNote, setLocalNote] = useState<NotePreview | null>(null);

  // On successful save: update local preview, collapse form
  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok && d?.note) {
      setLocalNote(d.note);
      setExpanded(false);
      setText('');
      setChannel(null);
    }
  }, [fetcher.data]);

  const saving  = fetcher.state !== 'idle';
  const canSave = text.trim().length > 0 && !saving;

  const submit = () => {
    if (!canSave) return;
    const body = channel ? `[${channel}] ${text.trim()}` : text.trim();
    const fd = new FormData();
    fd.set('org_id', orgId);
    fd.set('body', body);
    fetcher.submit(fd, {method: 'post', action: '/api/org-note-add'});
  };

  const cancel = () => { setExpanded(false); setText(''); setChannel(null); };

  const displayNote = localNote || latestNote;

  // ── Shared: inline compose form ─────────────────────────────────────────────
  const ComposeForm = (
    <div style={{
      paddingLeft: LEFT_INDENT, paddingRight: 24, paddingTop: 8, paddingBottom: 10,
      borderTop: `1px solid ${T.border}`,
    }}>
      <div style={{maxWidth: NOTE_MAX_W}}>
        {/* Channel selector */}
        <div style={{display:'flex', gap:4, marginBottom:7}}>
          {(['CALL','TEXT','EMAIL','VISIT'] as const).map(ch => {
            const active = channel === ch;
            return (
              <button key={ch} onClick={() => setChannel(active ? null : ch)}
                style={{
                  height: 22, padding: '0 8px',
                  border: `1px solid ${active ? CH_COLORS[ch] : T.borderStrong}`,
                  background: active ? `${CH_COLORS[ch]}18` : 'transparent',
                  color: active ? CH_COLORS[ch] : T.textFaint,
                  fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.16em',
                  cursor: 'pointer',
                }}>
                {ch}
              </button>
            );
          })}
        </div>

        {/* Textarea */}
        <textarea
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a note…"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          style={{
            width: '100%', height: 64, padding: '6px 8px', boxSizing: 'border-box',
            background: T.surfaceElev, border: `1px solid ${T.borderStrong}`,
            color: T.text, fontFamily: 'Inter,sans-serif', fontSize: 12,
            resize: 'none', outline: 'none', lineHeight: 1.55,
          }}
        />

        {/* Save / Cancel */}
        <div style={{display:'flex', gap:5, marginTop:6, justifyContent:'flex-end', alignItems:'center'}}>
          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:8.5, color:T.textFaint, letterSpacing:'0.06em', marginRight:'auto'}}>
            ⌘↵ to save
          </span>
          <button onClick={cancel}
            style={{height:24, padding:'0 10px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
            CANCEL
          </button>
          <button onClick={submit} disabled={!canSave}
            style={{height:24, padding:'0 12px', background:canSave?T.yellow:'#2a2a2a', border:'none', color:canSave?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, fontWeight:600, letterSpacing:'0.18em', cursor:canSave?'pointer':'not-allowed'}}>
            {saving ? '…' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Expanded: just show compose form ────────────────────────────────────────
  if (expanded) return ComposeForm;

  // ── No note: slim single-row "+ NOTE" button ─────────────────────────────────
  if (!displayNote) {
    return (
      <div style={{
        paddingLeft: LEFT_INDENT, paddingRight: 24,
        paddingTop: 7, paddingBottom: 7,
        borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
      }}>
        <button onClick={() => setExpanded(true)}
          style={{
            height: 22, padding: '0 8px',
            background: 'transparent', border: `1px solid ${T.borderStrong}`,
            color: T.textFaint, cursor: 'pointer',
            fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.16em',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
          <PencilIco /> + NOTE
        </button>
      </div>
    );
  }

  // ── Has note: header + full body + action buttons ────────────────────────────
  const {channel: noteChannel, text: noteText} = parseNote(displayNote.body);
  const noteDate = new Date(displayNote.created_at);
  const dateStr  = noteDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  const timeStr  = noteDate.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  const authorFirst = (displayNote.author_name || 'Unknown').split(' ')[0];

  return (
    <div style={{
      paddingLeft: LEFT_INDENT, paddingRight: 24,
      paddingTop: 9, paddingBottom: 10,
      borderTop: `1px solid ${T.border}`,
    }}>
      <div style={{maxWidth: NOTE_MAX_W}}>

        {/* Header row: channel badge + author + timestamp | [+ NOTE] [ALL →] */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5}}>
          <div style={{display:'flex', alignItems:'center', gap:7}}>
            {/* Channel badge */}
            {noteChannel && (
              <span style={{
                fontFamily:'JetBrains Mono,monospace', fontSize:8.5,
                letterSpacing:'0.14em', textTransform:'uppercase',
                padding:'1px 5px', lineHeight:1.6,
                border:`1px solid ${CH_COLORS[noteChannel] || T.borderStrong}`,
                color: CH_COLORS[noteChannel] || T.textSubtle,
                flexShrink: 0,
              }}>
                {noteChannel}
              </span>
            )}
            {/* Author + date/time */}
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textSubtle, letterSpacing:'0.06em', whiteSpace:'nowrap'}}>
              {authorFirst}
            </span>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.04em', whiteSpace:'nowrap'}}>
              · {dateStr} · {timeStr}
            </span>
          </div>

          {/* Action buttons — right side of header row */}
          <div style={{display:'flex', gap:4, flexShrink:0, marginLeft:12}}>
            <button onClick={() => setExpanded(true)}
              style={{
                height: 22, padding: '0 7px',
                background: 'transparent', border: `1px solid ${T.borderStrong}`,
                color: T.textSubtle, cursor: 'pointer',
                fontFamily: 'Teko,sans-serif', fontSize: 10, letterSpacing: '0.16em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              <PencilIco /> NOTE
            </button>
            <a href={`/sales-staging/account/${orgId}?from=${from}#notes`}
              style={{
                height: 22, padding: '0 7px',
                background: 'transparent', border: `1px solid ${T.borderStrong}`,
                color: T.textFaint, cursor: 'pointer',
                fontFamily: 'Teko,sans-serif', fontSize: 10, letterSpacing: '0.14em',
                textDecoration: 'none', display: 'flex', alignItems: 'center',
              }}>
              ALL →
            </a>
          </div>
        </div>

        {/* Full note body — multi-line, no truncation */}
        <div style={{
          fontFamily: 'Inter,sans-serif', fontSize: 12, color: T.textMuted,
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {noteText}
        </div>

      </div>
    </div>
  );
}
