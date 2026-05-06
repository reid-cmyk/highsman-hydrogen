/**
 * app/components/SalesFloorCardActions.tsx
 *
 * Shared card action row used by both:
 *   - /sales-staging (AccountCard in _index.tsx)
 *   - /sales-staging/reorders (ReorderCard in reorders.tsx)
 *
 * Props:
 *   phone, email         — contact info (disables CALL/TEXT/EMAIL when null)
 *   isFlagged            — current Pete flag state
 *   isUntargeted         — shows PROSPECT chip instead of actions
 *   zohoId               — for Training/SendMenu/NewProduct API calls
 *   orgId                — org UUID
 *   onBrief/onProspect/onFlag/onTraining/onSendMenu/onNewProduct
 *                        — action callbacks (same as before)
 *   onSuppress           — optional: shows SUPPRESS button (with confirmation)
 *   onChurn              — optional: shows CHURN button (with confirmation)
 */

import {useState, useEffect, useRef} from 'react';

const T = {
  bg: '#0A0A0A', surface: '#141414', surfaceElev: '#1A1A1A',
  border: '#1F1F1F', borderStrong: '#2F2F2F',
  text: '#F5F5F5', textMuted: '#C8C8C8', textSubtle: '#9C9C9C',
  textFaint: '#6A6A6A', yellow: '#FFD500', cyan: '#00D4FF',
  green: '#00E676', magenta: '#FF3B7F', redSystems: '#FF3355',
  statusWarn: '#FFB300',
};

// ─── Inline icons ─────────────────────────────────────────────────────────────
const Ico = ({d, size=11}: {d:string; size?:number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" style={{display:'block',flexShrink:0}}><path d={d}/></svg>
);
export const PhoneI  = ({s=11}:{s?:number}) => <Ico size={s} d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>;
export const TextI   = ({s=11}:{s?:number}) => <Ico size={s} d="M3 5h18v12h-8l-5 4v-4H3z"/>;
export const MailI   = ({s=11}:{s?:number}) => <Ico size={s} d="M3 6h18v12H3zM3 6l9 7 9-7"/>;
export const FlagI   = ({s=11}:{s?:number}) => <Ico size={s} d="M5 3v18M5 4h12l-2 4 2 4H5"/>;
export const BookI   = ({s=11}:{s?:number}) => <Ico size={s} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4a1 1 0 0 1 1-1h15v18H6.5A2.5 2.5 0 0 1 4 19.5z"/>;
export const StarI   = ({s=11}:{s?:number}) => <Ico size={s} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>;
export const SendI   = ({s=11}:{s?:number}) => <Ico size={s} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>;
export const BoxI    = ({s=11}:{s?:number}) => <Ico size={s} d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>;
const BlockI = ({s=11}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>;
const ChurnI = ({s=11}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;

// ─── CardBtn ──────────────────────────────────────────────────────────────────
export function CardBtn({href, onClick, color, label, icon, disabled, filled}: {
  href?: string; onClick?: () => void; color: string; label: string;
  icon: React.ReactNode; disabled?: boolean; filled?: boolean;
}) {
  const style: React.CSSProperties = {
    height: 30, padding: '0 10px', flexShrink: 0,
    background: filled ? `${color}18` : 'transparent',
    border: `1px solid ${disabled ? T.borderStrong : filled ? color : color + '88'}`,
    color: disabled ? T.borderStrong : color,
    fontFamily: 'Teko,sans-serif', fontSize: 12, letterSpacing: '0.16em',
    textTransform: 'uppercase' as const, textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  };
  if (href && !disabled) return <a href={href} onClick={e => e.stopPropagation()} style={style}>{icon}{label}</a>;
  return <button type="button" onClick={e => { e.stopPropagation(); if (!disabled) onClick?.(); }} style={style}>{icon}{label}</button>;
}

// ─── CardActions ──────────────────────────────────────────────────────────────
export function CardActions({
  phone, email, isFlagged, isUntargeted, zohoId, orgId,
  onBrief, onEmail, onProspect, onFlag, onTraining, onSendMenu, onNewProduct,
  onSuppress, onChurn,
}: {
  phone?: string | null;
  email?: string | null;
  isFlagged?: boolean;
  isUntargeted?: boolean;
  zohoId?: string;
  orgId: string;
  onBrief?: () => void;
  onEmail?: () => void;
  onProspect?: () => void;
  onFlag?: () => void;
  onTraining?: () => void;
  onSendMenu?: () => void;
  onNewProduct?: () => void;
  onSuppress?: () => void;
  onChurn?: () => void;
}) {
  const [moreOpen, setMoreOpen]           = useState(false);
  const [menuPos, setMenuPos]             = useState({top: 0, left: 0});
  const [suppressConfirm, setSuppressConfirm] = useState(false);
  const [churnConfirm, setChurnConfirm]   = useState(false);
  const [peteConfirm,   setPeteConfirm]   = useState(false);
  const [menuConfirm,   setMenuConfirm]   = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({top: r.top - 4, left: r.right});
    }
    const h = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreOpen]);

  return (
    <div style={{padding:'6px 16px 8px 70px', display:'flex', alignItems:'center', gap:6, borderTop:`1px solid ${T.border}`, flexWrap:'nowrap', overflowX:'auto'}}>

      {/* PROSPECT chip for untargeted */}
      {isUntargeted && onProspect && (
        <button type="button" onClick={e => { e.stopPropagation(); onProspect(); }}
          style={{height:28, padding:'0 10px', background:'rgba(0,212,255,0.08)', border:`1px solid ${T.cyan}`, color:T.cyan, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5}}>
          <BoxI s={11}/> PROSPECT
        </button>
      )}

      {/* Primary actions */}
      <CardBtn href={phone ? `tel:${phone}` : undefined}   color={phone ? T.yellow    : T.borderStrong} label="CALL"  icon={<PhoneI/>} disabled={!phone}/>
      <CardBtn href={phone ? `sms:${phone}` : undefined}   color={phone ? T.textMuted : T.borderStrong} label="TEXT"  icon={<TextI/>}  disabled={!phone}/>
      {/* EMAIL: if onEmail callback provided use it; otherwise fall back to mailto */}
      {onEmail
        ? <CardBtn onClick={onEmail} color={email ? T.textMuted : T.borderStrong} label="EMAIL" icon={<MailI/>} disabled={!email}/>
        : <CardBtn href={email ? `mailto:${email}` : undefined} color={email ? T.textMuted : T.borderStrong} label="EMAIL" icon={<MailI/>} disabled={!email}/>
      }
      {onBrief && <CardBtn onClick={onBrief} color={T.cyan} label="BRIEF" icon={<BookI/>}/>}

      {/* Flag Pete — with inline confirmation */}
      {onFlag && (
        peteConfirm ? (
          <div style={{display:'inline-flex', alignItems:'center', gap:6}}>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.10em', whiteSpace:'nowrap'}}>
              {isFlagged ? 'Unflag Pete?' : 'Flag for Pete?'}
            </span>
            <button type="button" onClick={e => { e.stopPropagation(); onFlag(); setPeteConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'rgba(255,51,85,0.15)', border:`1px solid ${T.redSystems}`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              {isFlagged ? 'UNFLAG' : 'CONFIRM'}
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); setPeteConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              CANCEL
            </button>
          </div>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); setPeteConfirm(true); }} title={isFlagged ? 'Flagged for Pete — click to unflag' : 'Flag for Pete'}
            style={{height:30, padding:'0 9px', background:isFlagged ? 'rgba(255,51,85,0.15)' : 'transparent', border:`1px solid ${T.redSystems}`, color:T.redSystems, display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer', flexShrink:0, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', textTransform:'uppercase'}}>
            <FlagI/> {isFlagged ? '✓ PETE' : 'FLAG PETE'}
          </button>
        )
      )}

      {/* ··· More menu */}
      {(onTraining || onSendMenu || onNewProduct) && (
        <div style={{position:'relative', display:'inline-block'}}>
          <button ref={btnRef} type="button" onClick={e => { e.stopPropagation(); setMoreOpen(o => !o); }}
            style={{height:30, padding:'0 10px', background:moreOpen?T.surfaceElev:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.10em', cursor:'pointer'}}>
            ···
          </button>
          {moreOpen && (
            <div ref={moreRef} style={{position:'fixed', top:menuPos.top, left:menuPos.left, transform:'translate(-100%,-100%)', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, zIndex:9999, minWidth:170, boxShadow:'0 -8px 32px rgba(0,0,0,0.7)'}}
              onClick={e => e.stopPropagation()}>
              {/* Training */}
              {onTraining && (
                <button type="button" onClick={() => { onTraining(); setMoreOpen(false); }}
                  style={{display:'flex', alignItems:'center', gap:8, width:'100%', padding:'11px 16px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer', textAlign:'left'}}
                  onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <StarI/> TRAINING
                </button>
              )}
              {/* Send Menu — with confirmation */}
              {onSendMenu && (
                menuConfirm ? (
                  <div style={{padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:T.bg}}>
                    <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textSubtle, letterSpacing:'0.08em', marginBottom:8}}>
                      Send NJ menu to buyer?
                    </div>
                    <div style={{display:'flex', gap:6}}>
                      <button type="button" onClick={() => { onSendMenu(); setMenuConfirm(false); setMoreOpen(false); }}
                        style={{flex:1, height:26, background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.16em', cursor:'pointer'}}>
                        SEND
                      </button>
                      <button type="button" onClick={() => setMenuConfirm(false)}
                        style={{flex:1, height:26, background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setMenuConfirm(true)}
                    style={{display:'flex', alignItems:'center', gap:8, width:'100%', padding:'11px 16px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer', textAlign:'left'}}
                    onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <SendI/> SEND MENU
                  </button>
                )
              )}
              {/* New Product */}
              {onNewProduct && (
                <button type="button" onClick={() => { onNewProduct(); setMoreOpen(false); }}
                  style={{display:'flex', alignItems:'center', gap:8, width:'100%', padding:'11px 16px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer', textAlign:'left'}}
                  onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <BoxI/> NEW PRODUCT
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suppress — with inline confirmation */}
      {onSuppress && (
        suppressConfirm ? (
          <div style={{display:'inline-flex', alignItems:'center', gap:6, marginLeft:'auto'}}>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.statusWarn, letterSpacing:'0.12em'}}>Suppress until next order?</span>
            <button type="button" onClick={e => { e.stopPropagation(); onSuppress(); setSuppressConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'rgba(255,179,0,0.15)', border:`1px solid ${T.statusWarn}`, color:T.statusWarn, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              CONFIRM
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); setSuppressConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              CANCEL
            </button>
          </div>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); setSuppressConfirm(true); }}
            style={{display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 9px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer', marginLeft:onChurn?0:'auto'}}>
            <BlockI/> SUPPRESS
          </button>
        )
      )}

      {/* Churn — with inline confirmation */}
      {onChurn && (
        churnConfirm ? (
          <div style={{display:'inline-flex', alignItems:'center', gap:6, marginLeft:onSuppress?0:'auto'}}>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.12em'}}>Mark as churned?</span>
            <button type="button" onClick={e => { e.stopPropagation(); onChurn(); setChurnConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'rgba(255,51,85,0.15)', border:`1px solid ${T.redSystems}`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              CONFIRM
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); setChurnConfirm(false); }}
              style={{height:28, padding:'0 9px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer'}}>
              CANCEL
            </button>
          </div>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); setChurnConfirm(true); }}
            style={{display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 9px', background:'transparent', border:`1px solid ${T.redSystems}88`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer', marginLeft:'auto'}}>
            <ChurnI/> CHURN
          </button>
        )
      )}
    </div>
  );
}
