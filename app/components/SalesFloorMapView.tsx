/**
 * app/components/SalesFloorMapView.tsx
 *
 * Generic Google Maps JavaScript API map view for Sales Floor pages.
 * Used by Accounts, Reorders Due, and Leads — each page passes its own
 * pin config and info-window HTML via callbacks.
 *
 * Props:
 *   orgs           — array of objects with lat/lng (any other fields)
 *   googleMapsKey  — Maps JavaScript API key
 *   stateFilter    — current state tab ('ALL' | 'NJ' | ...)
 *   getPinConfig   — (org) => {color, label} — pin fill + letter
 *   getInfoHtml    — (org) => HTML string for the info window
 *   legendItems    — [{color, label}] shown top-right
 */

import {useState, useEffect, useRef, useMemo} from 'react';

// ─── Map constants ────────────────────────────────────────────────────────────

export const STATE_MAP_CENTER: Record<string,{lat:number;lng:number;zoom:number}> = {
  ALL: {lat:39.8, lng:-79.0, zoom:6},
  NJ:  {lat:40.1, lng:-74.5, zoom:9},
  MA:  {lat:42.2, lng:-71.8, zoom:9},
  NY:  {lat:40.9, lng:-75.5, zoom:8},
  RI:  {lat:41.7, lng:-71.5, zoom:10},
  MO:  {lat:38.5, lng:-92.5, zoom:7},
};

export const DARK_MAP_STYLE = [
  {elementType:'geometry',stylers:[{color:'#1a1a1a'}]},
  {elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#757575'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#1a1a1a'}]},
  {featureType:'administrative',elementType:'geometry',stylers:[{color:'#3a3a3a'}]},
  {featureType:'administrative.locality',elementType:'labels.text.fill',stylers:[{color:'#aaaaaa'}]},
  {featureType:'poi',stylers:[{visibility:'off'}]},
  {featureType:'road',elementType:'geometry.fill',stylers:[{color:'#2c2c2c'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#212121'}]},
  {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#757575'}]},
  {featureType:'road.arterial',elementType:'geometry',stylers:[{color:'#373737'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#3c3c3c'}]},
  {featureType:'transit',stylers:[{visibility:'off'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#000000'}]},
];

export function makePinSvg(fill:string, letter:string):string {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.268 0 0 6.268 0 14c0 7.732 14 22 14 22s14-14.268 14-22C28 6.268 21.732 0 14 0z" fill="${fill}"/><circle cx="14" cy="13" r="6" fill="rgba(0,0,0,0.22)"/><text x="14" y="13" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#000">${letter||'·'}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ─── LIST/MAP toggle (shared across pages) ────────────────────────────────────

const T_TOGGLE = {
  borderStrong: '#2F2F2F', yellow: '#FFD500', textSubtle: '#9C9C9C', surfaceElev: '#1A1A1A',
};

export function MapViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: 'list' | 'map';
  setViewMode: (m: 'list' | 'map') => void;
}) {
  return (
    <div style={{display:'flex',border:`1px solid ${T_TOGGLE.borderStrong}`,height:30,overflow:'hidden'}}>
      <button onClick={()=>setViewMode('list')} title="List view"
        style={{width:38,display:'flex',alignItems:'center',justifyContent:'center',gap:5,border:'none',borderRight:`1px solid ${T_TOGGLE.borderStrong}`,background:viewMode==='list'?`rgba(255,213,0,0.10)`:'transparent',color:viewMode==='list'?T_TOGGLE.yellow:T_TOGGLE.textSubtle,cursor:'pointer',padding:0}}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="5" y1="4" x2="14" y2="4"/><line x1="5" y1="8" x2="14" y2="8"/><line x1="5" y1="12" x2="14" y2="12"/>
          <circle cx="2" cy="4" r="0.8" fill="currentColor" stroke="none"/><circle cx="2" cy="8" r="0.8" fill="currentColor" stroke="none"/><circle cx="2" cy="12" r="0.8" fill="currentColor" stroke="none"/>
        </svg>
        <span style={{fontFamily:'Teko,sans-serif',fontSize:12,letterSpacing:'0.14em'}}>LIST</span>
      </button>
      <button onClick={()=>setViewMode('map')} title="Map view"
        style={{width:38,display:'flex',alignItems:'center',justifyContent:'center',gap:5,border:'none',background:viewMode==='map'?`rgba(255,213,0,0.10)`:'transparent',color:viewMode==='map'?T_TOGGLE.yellow:T_TOGGLE.textSubtle,cursor:'pointer',padding:0}}>
        <svg width="11" height="13" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 1C3.79 1 2 2.79 2 5c0 3.25 4 9 4 9s4-5.75 4-9c0-2.21-1.79-4-4-4z"/><circle cx="6" cy="5" r="1.2"/>
        </svg>
        <span style={{fontFamily:'Teko,sans-serif',fontSize:12,letterSpacing:'0.14em'}}>MAP</span>
      </button>
    </div>
  );
}

// ─── Map View ─────────────────────────────────────────────────────────────────

const T = {
  bg:'#0A0A0A', border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textSubtle:'#9C9C9C', redSystems:'#FF3355', textFaint:'#6A6A6A',
};

export function SalesFloorMapView({
  orgs,
  googleMapsKey,
  stateFilter,
  getPinConfig,
  getInfoHtml,
  legendItems,
}: {
  orgs: any[];
  googleMapsKey: string;
  stateFilter: string;
  getPinConfig: (org: any) => {color: string; label: string};
  getInfoHtml: (org: any) => string;
  legendItems: {color: string; label: string}[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<any[]>([]);
  const infoWinRef   = useRef<any>(null);
  const initStateRef = useRef(stateFilter);

  const [mapReady, setMapReady] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [mapError, setMapError] = useState<string|null>(null);

  const geocodedOrgs = useMemo(
    () => orgs.filter(o => o.lat != null && o.lng != null),
    [orgs],
  );

  // ── Rebuild markers whenever map is ready OR visible orgs change ─────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const g   = (window as any).google.maps;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (infoWinRef.current) infoWinRef.current.close();

    const iw = new g.InfoWindow({maxWidth: 300});
    infoWinRef.current = iw;
    const bounds = new g.LatLngBounds();
    let hasAny = false;

    geocodedOrgs.forEach(org => {
      const {color, label} = getPinConfig(org);
      const marker = new g.Marker({
        position: {lat: org.lat as number, lng: org.lng as number},
        map,
        title: org.name,
        icon: {
          url: makePinSvg(color, label),
          scaledSize: new g.Size(28, 36),
          anchor: new g.Point(14, 36),
        },
      });

      marker.addListener('click', () => {
        iw.setContent(getInfoHtml(org));
        iw.open(map, marker);
      });

      markersRef.current.push(marker);
      bounds.extend({lat: org.lat, lng: org.lng});
      hasAny = true;
    });

    if (hasAny) {
      if (geocodedOrgs.length === 1) {
        map.setCenter({lat: geocodedOrgs[0].lat, lng: geocodedOrgs[0].lng});
        map.setZoom(13);
      } else {
        map.fitBounds(bounds, {top:60, bottom:60, left:60, right:60});
      }
    }
  }, [mapReady, geocodedOrgs, getPinConfig, getInfoHtml]);

  // ── Init map once ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !googleMapsKey) return;

    (window as any).gm_authFailure = () => {
      setLoading(false);
      setMapError('Maps JavaScript API is not enabled for this key. In GCP Console → Credentials → your API key → API restrictions, add "Maps JavaScript API".');
    };

    const doInit = () => {
      const c = STATE_MAP_CENTER[initStateRef.current] || STATE_MAP_CENTER['ALL'];
      const map = new (window as any).google.maps.Map(containerRef.current, {
        center: {lat: c.lat, lng: c.lng}, zoom: c.zoom,
        styles: DARK_MAP_STYLE,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        zoomControlOptions: {position: (window as any).google.maps.ControlPosition.RIGHT_CENTER},
      });
      mapRef.current = map;
      setLoading(false);
      setMapReady(true);
    };

    if ((window as any).google?.maps) {
      doInit();
    } else {
      const cb = `__initHSSFMap_${Date.now()}`;
      (window as any)[cb] = () => { doInit(); delete (window as any)[cb]; };
      if (!document.querySelector('script[data-hs-maps]')) {
        const s = document.createElement('script');
        s.setAttribute('data-hs-maps', '1');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&callback=${cb}`;
        s.async = true;
        document.head.appendChild(s);
      } else {
        const existing = document.querySelector('script[data-hs-maps]');
        if (existing) existing.addEventListener('load', doInit);
      }
    }

    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      if (infoWinRef.current) infoWinRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{flex:1, position:'relative', minHeight:0, display:'flex', flexDirection:'column'}}>
      {mapError && (
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:T.bg,zIndex:3,padding:32}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:20,letterSpacing:'0.20em',color:T.redSystems,textTransform:'uppercase',marginBottom:12}}>MAP UNAVAILABLE</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textSubtle,letterSpacing:'0.08em',maxWidth:520,textAlign:'center',lineHeight:1.7}}>{mapError}</div>
        </div>
      )}
      {!mapError && loading && (
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,zIndex:2}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.24em',color:T.textFaint,textTransform:'uppercase'}}>LOADING MAP…</div>
        </div>
      )}
      <div ref={containerRef} style={{flex:1, width:'100%', minHeight:500}}/>
      {/* Bottom stats */}
      <div style={{position:'absolute',bottom:24,left:12,background:'rgba(10,10,10,0.85)',border:`1px solid ${T.borderStrong}`,padding:'5px 12px',pointerEvents:'none'}}>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.12em'}}>
          {geocodedOrgs.length} MAPPED · {orgs.length - geocodedOrgs.length} NO COORDS
        </span>
      </div>
      {/* Legend */}
      {legendItems.length > 0 && (
        <div style={{position:'absolute',top:12,right:12,background:'rgba(10,10,10,0.85)',border:`1px solid ${T.borderStrong}`,padding:'10px 14px'}}>
          {legendItems.map((item, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:i<legendItems.length-1?5:0}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:item.color,flexShrink:0}}/>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.10em'}}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
