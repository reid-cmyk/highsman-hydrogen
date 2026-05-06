/**
 * app/components/SalesFloorBriefModal.tsx
 *
 * AI pre-call brief modal for Sales Floor staging.
 * Uses direct fetch (not useFetcher) to avoid Remix infinite-loop issues
 * with object reference instability in deps arrays.
 *
 * Sections: Last Contact · Sky's Play · Talking Points · Objections · Opener · History
 */

import {useState, useEffect, useRef} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BriefData {
  mode: string;
  lastContact?: {channel: string; when: string; summary: string};
  skysPlay?: string;
  talkingPoints?: string[];
  likelyObjections?: {objection: string; response: string}[];
  suggestedOpener?: string;
  history?: {channel: string; when: string; direction: string; summary: string}[];
}

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
  redSystems:   '#FF3355',
};

const CH_COLOR: Record<string,string> = {
  call: T.green, CALL: T.green,
  sms: T.cyan,   SMS: T.cyan,
  email: T.yellow, EMAIL: T.yellow,
};

// ─── Small components ─────────────────────────────────────────────────────────

function Section({title, color, children}: {title:string; color?:string; children:React.ReactNode}) {
  return (
    <div>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.28em', color:color||T.textFaint, textTransform:'uppercase', marginBottom:10}}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ChBadge({ch}: {ch:string}) {
  const c = CH_COLOR[ch] || T.textSubtle;
  return (
    <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', padding:'2px 6px', border:`1px solid ${c}`, color:c, flexShrink:0}}>
      {ch.toUpperCase()}
    </span>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SalesFloorBriefModal({
  orgName,
  contactPhone,
  contactEmail,
  contactName,
  contactFirstName,
  orgWebsite,
  zohoAccountId,
  lifecycleStage,
  onClose,
}: {
  orgName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactFirstName?: string | null;
  orgWebsite?: string | null;
  zohoAccountId?: string | null;
  lifecycleStage?: string | null;
  onClose: () => void;
}) {
  const [brief,    setBrief]    = useState<BriefData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const didFetch = useRef(false);

  const fetchBrief = () => {
    didFetch.current = true;
    setLoading(true);
    setError(null);
    setBrief(null);

    const firstName = contactFirstName || (contactName?.split(' ')[0]) || '';
    const lastName  = contactFirstName && contactName
      ? contactName.replace(contactFirstName, '').trim()
      : (contactName?.split(' ').slice(1).join(' ') || '');

    fetch('/api/brief', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        lead: {
          First_Name: firstName,
          Last_Name:  lastName,
          _fullName:  contactName || orgName,
          Company:    orgName,
          Phone:      contactPhone  || '',
          Email:      contactEmail  || '',
          _status:    lifecycleStage || 'active',
          Website:    orgWebsite    || '',
          _zohoModule: 'Accounts',
          _zohoId:    zohoAccountId || '',
        },
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.brief) {
          setBrief(data.brief);
        } else {
          setError(data.error || 'Brief generation failed');
        }
      })
      .catch(() => setError('Network error — check connection'))
      .finally(() => setLoading(false));
  };

  // Fetch once on mount
  useEffect(() => {
    if (!didFetch.current) fetchBrief();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modeColor = brief?.mode === 'warm' ? T.green : T.textFaint;

  return (
    <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface, border:`1px solid ${T.borderStrong}`, width:'100%', maxWidth:640, maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden'}}>

        {/* Sticky header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:22, letterSpacing:'0.14em', color:T.text, textTransform:'uppercase'}}>
              BRIEF — {orgName}
            </div>
            {/* Mode badge only shown when brief is loaded */}
            {brief && (
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, letterSpacing:'0.14em', padding:'2px 8px', border:`1px solid ${modeColor}44`, color:modeColor, background:`${modeColor}10`}}>
                {(brief.mode || 'cold').toUpperCase()}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:20, padding:'4px 8px', lineHeight:1}}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{overflowY:'auto', flex:1, padding:'24px'}}>

          {/* Loading */}
          {loading && (
            <div style={{textAlign:'center', padding:'48px 20px'}}>
              <style>{`@keyframes hs-spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{display:'inline-block', width:28, height:28, border:`2px solid ${T.borderStrong}`, borderTopColor:T.yellow, borderRadius:'50%', animation:'hs-spin 1s linear infinite', marginBottom:16}}/>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.20em', color:T.textSubtle, textTransform:'uppercase'}}>Building brief…</div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.08em', marginTop:8}}>Pulling call · text · email history + AI analysis</div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{textAlign:'center', padding:'40px 20px'}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.16em', color:T.redSystems, textTransform:'uppercase', marginBottom:8}}>Brief Unavailable</div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textSubtle, letterSpacing:'0.06em', marginBottom:20}}>{error}</div>
              <button onClick={fetchBrief}
                style={{height:32, padding:'0 18px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
                TRY AGAIN
              </button>
            </div>
          )}

          {/* Brief content */}
          {!loading && brief && (
            <div style={{display:'flex', flexDirection:'column', gap:24}}>

              {/* Last Contact */}
              {brief.lastContact && (
                <Section title="Last Contact">
                  <div style={{background:T.surfaceElev, border:`1px solid ${T.border}`, padding:14, display:'flex', alignItems:'flex-start', gap:12}}>
                    <ChBadge ch={brief.lastContact.channel}/>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.08em', marginBottom:5}}>{brief.lastContact.when}</div>
                      <div style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, lineHeight:1.55}}>{brief.lastContact.summary}</div>
                    </div>
                  </div>
                </Section>
              )}

              {/* Sky's Play */}
              {brief.skysPlay && (
                <Section title="Sky's Play" color={T.yellow}>
                  <div style={{background:`${T.yellow}0c`, border:`1px solid ${T.yellow}33`, padding:'14px 16px', fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, lineHeight:1.6}}>
                    {brief.skysPlay}
                  </div>
                </Section>
              )}

              {/* Talking Points */}
              {brief.talkingPoints && brief.talkingPoints.length > 0 && (
                <Section title="Talking Points">
                  <div style={{display:'flex', flexDirection:'column', gap:6}}>
                    {brief.talkingPoints.map((pt, i) => (
                      <div key={i} style={{display:'flex', gap:10, padding:'10px 14px', background:T.surfaceElev, border:`1px solid ${T.border}`}}>
                        <span style={{fontFamily:'Teko,sans-serif', fontSize:14, color:T.yellow, flexShrink:0, lineHeight:1.4}}>{i+1}.</span>
                        <span style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, lineHeight:1.5}}>{pt}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Likely Objections */}
              {brief.likelyObjections && brief.likelyObjections.length > 0 && (
                <Section title="Likely Objections">
                  <div style={{display:'flex', flexDirection:'column', gap:8}}>
                    {brief.likelyObjections.map((obj, i) => (
                      <div key={i} style={{padding:'12px 14px', background:T.surfaceElev, border:`1px solid ${T.border}`}}>
                        <div style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, marginBottom:6}}>"{obj.objection}"</div>
                        <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.cyan, lineHeight:1.5}}>→ {obj.response}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Suggested Opener */}
              {brief.suggestedOpener && (
                <Section title="Suggested Opener" color={T.cyan}>
                  <div style={{background:`${T.cyan}0c`, border:`1px solid ${T.cyan}44`, padding:'16px', fontFamily:'Inter,sans-serif', fontSize:14, color:T.text, lineHeight:1.6, fontStyle:'italic'}}>
                    "{brief.suggestedOpener}"
                  </div>
                </Section>
              )}

              {/* History — collapsible */}
              {brief.history && brief.history.length > 0 && (
                <Section title={`History (${brief.history.length})`}>
                  <button onClick={() => setShowHistory(h => !h)}
                    style={{height:28, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer', marginBottom:showHistory?10:0}}>
                    {showHistory ? 'HIDE HISTORY' : 'SHOW HISTORY'}
                  </button>
                  {showHistory && (
                    <div style={{display:'flex', flexDirection:'column', gap:6}}>
                      {brief.history.map((h, i) => (
                        <div key={i} style={{display:'flex', gap:10, padding:'10px 14px', background:T.surfaceElev, border:`1px solid ${T.border}`}}>
                          <ChBadge ch={h.channel}/>
                          <div style={{flex:1}}>
                            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.06em', marginBottom:4}}>
                              {h.direction?.toUpperCase()} · {h.when}
                            </div>
                            <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textMuted, lineHeight:1.5}}>{h.summary}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
