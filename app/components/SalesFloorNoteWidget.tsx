/**
 * app/components/SalesFloorNoteWidget.tsx
 *
 * Inline note widget for Sales Floor feed cards (Reorders, Accounts, Leads, Onboarding).
 *
 * Collapsed (default):
 *   - Most recent note preview: [CHANNEL badge] truncated text — Author · 3d ago
 *   - "+ NOTE" button expands inline form
 *   - "ALL →" link opens account detail scrolled to #notes
 *
 * Expanded:
 *   - Channel selector: CALL / TEXT / EMAIL / VISIT (optional, toggleable)
 *   - Textarea with Cmd/Ctrl+Enter to submit
 *   - SAVE / CANCEL buttons
 *   - On success: collapses and optimistically shows new note as preview
 *
 * Props:
 *   orgId      — org UUID
 *   latestNote — most recent note from loader (null if none)
 *   from       — slug for ?from= back-button param (default 'reorders')
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
  return new Date(dateStr).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

// Pencil / note icon
function NoteIco() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{display:'block',flexShrink:0}}>
      <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z"/>
      <path d="M2 14h12"/>
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
  const fetcher = useFetcher();
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

  const saving = fetcher.state !== 'idle';
  const canSave = text.trim().length > 0 && !saving;

  const submit = () => {
    if (!canSave) return;
    const body = channel ? `[${channel}] ${text.trim()}` : text.trim();
    const fd = new FormData();
    fd.set('org_id', orgId);
    fd.set('body', body);
    fetcher.submit(fd, {method: 'post', action: '/api/org-note-add'});
  };

  const cancel = () => {
    setExpanded(false);
    setText('');
    setChannel(null);
  };

  const displayNote = localNote || latestNote;
  const {channel: noteChannel, text: noteText} = displayNote
    ? parseNote(displayNote.body)
    : {channel: null, text: ''};

  return (
    <div style={{borderTop: `1px solid ${T.border}`, padding: '8px 14px 10px', background: T.surface}}>

      {/* ── Collapsed: preview + action buttons ──────────────────────────── */}
      {!expanded && (
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>

          {/* Note preview */}
          <div style={{flex: 1, minWidth: 0}}>
            {displayNote ? (
              <div style={{display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap'}}>
                {/* Channel badge */}
                {noteChannel && (
                  <span style={{
                    fontFamily: 'JetBrains Mono,monospace', fontSize: 8.5,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '1px 5px', border: `1px solid ${CH_COLORS[noteChannel] || T.borderStrong}`,
                    color: CH_COLORS[noteChannel] || T.textSubtle, flexShrink: 0,
                    lineHeight: 1.5,
                  }}>
                    {noteChannel}
                  </span>
                )}
                {/* Truncated text */}
                <span style={{
                  fontFamily: 'Inter,sans-serif', fontSize: 11, color: T.textMuted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, minWidth: 0,
                }}>
                  {noteText}
                </span>
                {/* Author + time */}
                <span style={{
                  fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: T.textFaint,
                  letterSpacing: '0.06em', flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {displayNote.author_name?.split(' ')[0] || '—'} · {relTime(displayNote.created_at)}
                </span>
              </div>
            ) : (
              <span style={{
                fontFamily: 'JetBrains Mono,monospace', fontSize: 9.5,
                color: T.textFaint, letterSpacing: '0.10em',
              }}>
                no notes
              </span>
            )}
          </div>

          {/* Buttons */}
          <div style={{display: 'flex', gap: 5, flexShrink: 0}}>
            <button
              onClick={() => setExpanded(true)}
              title="Add a note"
              style={{
                height: 24, padding: '0 8px',
                background: 'transparent', border: `1px solid ${T.borderStrong}`,
                color: T.textSubtle, cursor: 'pointer',
                fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.16em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <NoteIco /> NOTE
            </button>
            <a
              href={`/sales-staging/account/${orgId}?from=${from}#notes`}
              style={{
                height: 24, padding: '0 8px',
                background: 'transparent', border: `1px solid ${T.borderStrong}`,
                color: T.textFaint, cursor: 'pointer',
                fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.14em',
                textDecoration: 'none', display: 'flex', alignItems: 'center',
              }}
            >
              ALL →
            </a>
          </div>
        </div>
      )}

      {/* ── Expanded: quick compose form ─────────────────────────────────── */}
      {expanded && (
        <div>
          {/* Channel selector */}
          <div style={{display: 'flex', gap: 4, marginBottom: 7}}>
            {(['CALL','TEXT','EMAIL','VISIT'] as const).map(ch => {
              const active = channel === ch;
              return (
                <button
                  key={ch}
                  onClick={() => setChannel(active ? null : ch)}
                  style={{
                    height: 22, padding: '0 8px',
                    border: `1px solid ${active ? CH_COLORS[ch] : T.borderStrong}`,
                    background: active ? `${CH_COLORS[ch]}18` : 'transparent',
                    color: active ? CH_COLORS[ch] : T.textFaint,
                    fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.16em',
                    cursor: 'pointer',
                  }}
                >
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
              width: '100%', height: 60,
              padding: '6px 8px', boxSizing: 'border-box',
              background: T.surfaceElev, border: `1px solid ${T.borderStrong}`,
              color: T.text, fontFamily: 'Inter,sans-serif', fontSize: 12,
              resize: 'none', outline: 'none',
              lineHeight: 1.5,
            }}
          />

          {/* Save / Cancel */}
          <div style={{display: 'flex', gap: 5, marginTop: 6, justifyContent: 'flex-end', alignItems: 'center'}}>
            <span style={{
              fontFamily: 'JetBrains Mono,monospace', fontSize: 8.5, color: T.textFaint,
              letterSpacing: '0.06em', marginRight: 'auto',
            }}>
              ⌘↵ to save
            </span>
            <button
              onClick={cancel}
              style={{
                height: 24, padding: '0 10px',
                background: 'transparent', border: `1px solid ${T.borderStrong}`,
                color: T.textFaint, fontFamily: 'Teko,sans-serif',
                fontSize: 11, letterSpacing: '0.14em', cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={submit}
              disabled={!canSave}
              style={{
                height: 24, padding: '0 12px',
                background: canSave ? T.yellow : '#2a2a2a',
                border: 'none',
                color: canSave ? '#000' : T.textFaint,
                fontFamily: 'Teko,sans-serif', fontSize: 11,
                fontWeight: 600, letterSpacing: '0.18em',
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? '…' : 'SAVE'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
