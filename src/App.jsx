import { useState, useEffect, useCallback, useRef } from "react";

// ─── IndexedDB Layer ────────────────────────────────────────────────────────
const DB_NAME = "tensa-postal-beat";
const DB_VERSION = 2;
const AREAS = [
  "Block A","Block B","Block C","Block D",
  "Jagannath Mandir Area","Sarala Temple Area","Post Office Backside Area",
  "GEL Church Area","Dhobitanki Area","BSNL Tower Area",
  "Government Medical Area","Prospecting Camp Area","Bahamba Area",
  "Tantra Area","Zero Point Area","CRPF Camp Quarters Area",
  "SAIL & CRP Office Area","Jindal Plant Area","Geetarani Mines Area",
  "Panchayat Office Area","Parking Area","Police Station Basti Area"
];

// Tensa approximate center coords for each area (lat, lng)
const AREA_DEFAULT_COORDS = {
  "Block A": [22.0150, 85.1950],
  "Block B": [22.0160, 85.1970],
  "Block C": [22.0140, 85.1930],
  "Block D": [22.0130, 85.1960],
  "Jagannath Mandir Area": [22.0170, 85.1980],
  "Sarala Temple Area": [22.0180, 85.1940],
  "Post Office Backside Area": [22.0145, 85.1955],
  "GEL Church Area": [22.0165, 85.1935],
  "Dhobitanki Area": [22.0155, 85.1945],
  "BSNL Tower Area": [22.0175, 85.1965],
  "Government Medical Area": [22.0135, 85.1975],
  "Prospecting Camp Area": [22.0125, 85.1985],
  "Bahamba Area": [22.0115, 85.1925],
  "Tantra Area": [22.0105, 85.1915],
  "Zero Point Area": [22.0195, 85.1905],
  "CRPF Camp Quarters Area": [22.0185, 85.1895],
  "SAIL & CRP Office Area": [22.0200, 85.1885],
  "Jindal Plant Area": [22.0095, 85.2010],
  "Geetarani Mines Area": [22.0085, 85.2020],
  "Panchayat Office Area": [22.0210, 85.1875],
  "Parking Area": [22.0220, 85.1865],
  "Police Station Basti Area": [22.0230, 85.1855],
};

let _db = null;
async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("areas")) db.createObjectStore("areas", { keyPath: "id" });
      if (!db.objectStoreNames.contains("houses")) {
        const s = db.createObjectStore("houses", { keyPath: "id" });
        s.createIndex("by-area", "areaId");
      }
      if (!db.objectStoreNames.contains("businesses")) {
        const s = db.createObjectStore("businesses", { keyPath: "id" });
        s.createIndex("by-area", "areaId");
      }
      if (!db.objectStoreNames.contains("followups")) {
        const s = db.createObjectStore("followups", { keyPath: "id" });
        s.createIndex("by-date", "followUpDate");
      }
      if (!db.objectStoreNames.contains("areacoords")) {
        db.createObjectStore("areacoords", { keyPath: "areaId" });
      }
    };
    req.onsuccess = async (e) => {
      _db = e.target.result;
      const tx = _db.transaction("areas", "readwrite");
      const store = tx.objectStore("areas");
      const count = await new Promise(r => { const c = store.count(); c.onsuccess = () => r(c.result); });
      if (count === 0) {
        AREAS.forEach(name => store.add({ id: crypto.randomUUID(), name, totalHouses:0, surveyedHouses:0, businesses:0, institutions:0, notes:"" }));
      }
      await new Promise(r => { tx.oncomplete = r; });
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}
async function dbGetAll(store) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbGet(store, id) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(id);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbPut(store, obj) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readwrite").objectStore(store).put(obj);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbDelete(store, id) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readwrite").objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
async function dbExport() {
  const [areas, houses, businesses, followups] = await Promise.all([
    dbGetAll("areas"), dbGetAll("houses"), dbGetAll("businesses"), dbGetAll("followups")
  ]);
  return JSON.stringify({ areas, houses, businesses, followups }, null, 2);
}
async function dbImport(json) {
  const data = JSON.parse(json);
  const db = await getDB();
  const stores = ["areas","houses","businesses","followups"];
  const tx = db.transaction(stores, "readwrite");
  for (const s of stores) {
    tx.objectStore(s).clear();
    for (const item of (data[s] || [])) tx.objectStore(s).put(item);
  }
  return new Promise((res,rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

const COLOR_MAP = { green:"#22c55e", yellow:"#eab308", red:"#ef4444", blue:"#3b82f6", purple:"#a855f7" };
const STATUS_COLOR = { existing:"#22c55e", prospect:"#f59e0b", new:"#3b82f6", closed:"#6b7280" };

function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type="info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return { toasts, toast };
}

// ─── Leaflet Map Component ────────────────────────────────────────────────────
function LeafletMap({ areas, houses, onAreaClick, onHouseClick, onAreaMoved, focusAreaId, editMode, theme }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css"; link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
    if (!window.L) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else { initMap(); }
  }, []);

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([22.015, 85.196], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control.attribution({ prefix: "© OpenStreetMap" }).addTo(map);
    mapInstanceRef.current = map;
    renderMarkers();
  }

  useEffect(() => {
    if (window.L && mapInstanceRef.current) renderMarkers();
  }, [areas, houses, focusAreaId, editMode]);

  function renderMarkers() {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (focusAreaId) {
      // ── House view ──
      const areaHouses = houses.filter(h => h.areaId === focusAreaId && h.gpsLat && h.gpsLng);
      const area = areas.find(a => a.id === focusAreaId);
      if (areaHouses.length > 0) {
        const bounds = [];
        areaHouses.forEach(h => {
          const color = COLOR_MAP[h.colorMarker] || "#3b82f6";
          const icon = L.divIcon({
            html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>`,
            iconSize: [28,28], iconAnchor: [14,28], className:""
          });
          const marker = L.marker([h.gpsLat, h.gpsLng], { icon });
          marker.on("click", () => onHouseClick && onHouseClick(h));
          marker.bindPopup(`
            <div style="min-width:180px;font-family:system-ui;padding:4px 0">
              <div style="font-weight:800;font-size:14px;margin-bottom:4px">${h.ownerName || "Unknown"}</div>
              <div style="font-size:12px;color:#64748b;margin-bottom:6px">House ${h.houseNumber || ""}</div>
              <div style="margin-bottom:8px"><span style="background:${STATUS_COLOR[h.customerStatus]||"#888"}22;color:${STATUS_COLOR[h.customerStatus]||"#888"};padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;text-transform:capitalize">${h.customerStatus}</span></div>
              ${h.mobileNumber ? `<a href="tel:${h.mobileNumber}" style="display:block;background:#4f6ef7;color:#fff;text-align:center;padding:7px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">📞 ${h.mobileNumber}</a>` : ""}
            </div>
          `, { maxWidth: 220 });
          marker.addTo(map);
          markersRef.current.push(marker);
          bounds.push([h.gpsLat, h.gpsLng]);
        });
        if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        const saved = area?._lat && area?._lng ? [area._lat, area._lng] : (AREA_DEFAULT_COORDS[area?.name] || [22.015, 85.196]);
        map.setView(saved, 16);
        const icon = L.divIcon({
          html: `<div style="background:#f97316;color:#fff;padding:6px 12px;border-radius:20px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)">📍 ${area?.name||"Area"}<br><span style="font-size:10px;font-weight:400">No GPS data yet</span></div>`,
          className: "", iconAnchor: [0, 0]
        });
        const m = L.marker(saved, { icon }).addTo(map);
        markersRef.current.push(m);
      }
    } else {
      // ── Area overview ──
      areas.forEach(area => {
        const areaHouses = houses.filter(h => h.areaId === area.id);
        const gpsHouses = areaHouses.filter(h => h.gpsLat && h.gpsLng);
        let lat, lng;
        // Priority: saved custom position > auto-center from GPS houses > default
        if (area._lat && area._lng) {
          lat = area._lat; lng = area._lng;
        } else if (gpsHouses.length > 0) {
          lat = gpsHouses.reduce((s,h) => s+h.gpsLat, 0) / gpsHouses.length;
          lng = gpsHouses.reduce((s,h) => s+h.gpsLng, 0) / gpsHouses.length;
        } else {
          const def = AREA_DEFAULT_COORDS[area.name];
          if (!def) return;
          [lat, lng] = def;
        }
        const count = areaHouses.length;
        const isDraggable = !!editMode;
        const icon = L.divIcon({
          html: `<div style="background:${isDraggable?"#f97316":"#4f6ef7"};color:#fff;border-radius:20px;padding:6px 10px;font-weight:800;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;border:2px solid ${isDraggable?"#fff4":"#fff"};cursor:${isDraggable?"grab":"pointer"}">${isDraggable?"✥ ":""}${area.name.replace(" Area","")}<br><span style="font-size:10px;font-weight:400;opacity:.85">${isDraggable?"drag to move":`${count} ${count===1?"house":"houses"}`}</span></div>`,
          className: "", iconAnchor: [0, 0]
        });
        const marker = L.marker([lat, lng], { icon, draggable: isDraggable });
        if (isDraggable) {
          marker.on("dragend", (e) => {
            const { lat, lng } = e.target.getLatLng();
            onAreaMoved && onAreaMoved(area.id, lat, lng);
          });
        } else {
          marker.on("click", () => onAreaClick && onAreaClick(area));
        }
        marker.addTo(map);
        markersRef.current.push(marker);
      });
    }
  }

  return <div ref={mapRef} style={{ width:"100%", height:"100%", background:"#e8f0fe" }} />;
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [pageParams, setPageParams] = useState({});
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const { toasts, toast } = useToast();
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(() => setRefresh(r => r+1), []);

  const nav = (p, params={}) => { setPage(p); setPageParams(params); };

  const theme = {
    bg: dark ? "#0f1117" : "#f4f6f9",
    card: dark ? "#1a1f2e" : "#ffffff",
    border: dark ? "#2a3045" : "#e2e8f0",
    text: dark ? "#e8ecf5" : "#1a202c",
    muted: dark ? "#8892aa" : "#64748b",
    primary: "#4f6ef7",
    accent: "#f97316",
    success: "#22c55e",
    danger: "#ef4444",
  };

  const pages = {
    dashboard: <Dashboard nav={nav} theme={theme} refresh={refresh} toast={toast} />,
    map: <MapPage nav={nav} theme={theme} refresh={refresh} />,
    add: <AddEntry nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} />,
    areas: <AreasPage nav={nav} theme={theme} refresh={refresh} />,
    search: <SearchPage nav={nav} theme={theme} refresh={refresh} />,
    reports: <ReportsPage nav={nav} theme={theme} refresh={refresh} toast={toast} />,
    followups: <FollowUpsPage nav={nav} theme={theme} refresh={refresh} toast={toast} bump={bump} />,
    settings: <SettingsPage nav={nav} theme={theme} dark={dark} setDark={setDark} toast={toast} bump={bump} />,
    "house-detail": <HouseDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} />,
    "biz-detail": <BizDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} />,
  };

  const navItems = [
    { id:"dashboard", icon:"🏠", label:"Home" },
    { id:"map", icon:"🗺️", label:"Map" },
    { id:"add", icon:"➕", label:"Add" },
    { id:"search", icon:"🔍", label:"Search" },
    { id:"reports", icon:"📊", label:"Reports" },
  ];

  const fullscreen = ["add","house-detail","biz-detail","followups","settings","map"].includes(page);

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight:"100vh", fontFamily:"system-ui,-apple-system,sans-serif", maxWidth:480, margin:"0 auto", position:"relative", display:"flex", flexDirection:"column" }}>
      <div style={{ flex:1, overflowY: page==="map" ? "hidden" : "auto", paddingBottom: fullscreen ? 0 : 72, height: page==="map" ? "100vh" : "auto" }}>
        {pages[page] || pages.dashboard}
      </div>

      {!["add","house-detail","biz-detail","followups","settings"].includes(page) && (
        <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background: theme.card, borderTop:`1px solid ${theme.border}`, display:"flex", zIndex:100 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => nav(item.id)} style={{ flex:1, padding:"10px 0 8px", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color: page===item.id ? theme.primary : theme.muted, fontSize:10, fontWeight: page===item.id ? 700 : 400, transition:"color .15s" }}>
              <span style={{ fontSize:20 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div style={{ position:"fixed", top:12, left:"50%", transform:"translateX(-50%)", zIndex:999, display:"flex", flexDirection:"column", gap:8, width:"90%", maxWidth:420, pointerEvents:"none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type==="error"? theme.danger : theme.primary, color:"#fff", padding:"10px 16px", borderRadius:10, fontSize:13, fontWeight:600, boxShadow:"0 4px 16px rgba(0,0,0,.2)", animation:"slideIn .2s ease" }}>
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}} .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 4px 20px rgba(0,0,0,.15)!important} .leaflet-popup-tip{display:none}`}</style>
    </div>
  );
}

// ─── Map Page ────────────────────────────────────────────────────────────────
function MapPage({ nav, theme, refresh }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [focusArea, setFocusArea] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    Promise.all([dbGetAll("areas"), dbGetAll("houses")])
      .then(([a, h]) => { setAreas(a); setHouses(h); });
  }, [refresh]);

  const handleAreaClick = (area) => { if (!editMode) setFocusArea(area); };
  const handleHouseClick = (house) => nav("house-detail", { id: house.id });

  const handleAreaMoved = async (areaId, lat, lng) => {
    const area = areas.find(a => a.id === areaId);
    if (!area) return;
    const updated = { ...area, _lat: lat, _lng: lng };
    await dbPut("areas", updated);
    setAreas(prev => prev.map(a => a.id === areaId ? updated : a));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh" }}>
      {/* Header */}
      <div style={{ background: theme.card, borderBottom:`1px solid ${theme.border}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:10, flexShrink:0, zIndex:10 }}>
        {focusArea ? (
          <>
            <button onClick={() => setFocusArea(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:15, color:theme.text }}>{focusArea.name}</div>
              <div style={{ fontSize:11, color:theme.muted }}>{houses.filter(h=>h.areaId===focusArea.id).length} houses • tap pin for details</div>
            </div>
            <button onClick={() => nav("add", { type:"house" })} style={{ background:theme.primary, color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Add</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:20 }}>🗺️</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:15, color:theme.text }}>Beat Map</div>
              <div style={{ fontSize:11, color:theme.muted }}>{editMode ? "Drag markers to correct position" : "Tap an area to see houses"}</div>
            </div>
            <button onClick={() => setEditMode(e => !e)} style={{ background: editMode ? theme.accent : theme.bg, color: editMode ? "#fff" : theme.muted, border:`1px solid ${editMode ? theme.accent : theme.border}`, borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {editMode ? "✓ Done" : "✥ Move"}
            </button>
          </>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && !focusArea && (
        <div style={{ background:"#f97316", color:"#fff", padding:"8px 16px", fontSize:12, fontWeight:600, textAlign:"center", flexShrink:0 }}>
          {savedMsg ? "✓ Position saved!" : "Drag any area marker to reposition it — saved automatically"}
        </div>
      )}

      {/* Legend */}
      {focusArea && (
        <div style={{ background:theme.card, borderBottom:`1px solid ${theme.border}`, padding:"8px 16px", display:"flex", gap:12, flexShrink:0, overflowX:"auto" }}>
          {Object.entries(COLOR_MAP).map(([name, hex]) => (
            <div key={name} style={{ display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:hex }} />
              <span style={{ fontSize:10, color:theme.muted, textTransform:"capitalize" }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Map */}
      <div style={{ flex:1, position:"relative" }}>
        <LeafletMap
          areas={areas}
          houses={houses}
          focusAreaId={focusArea?.id || null}
          onAreaClick={handleAreaClick}
          onHouseClick={handleHouseClick}
          onAreaMoved={handleAreaMoved}
          editMode={editMode}
          theme={theme}
        />
        {focusArea && houses.filter(h=>h.areaId===focusArea.id && h.gpsLat).length === 0 && (
          <div style={{ position:"absolute", bottom:80, left:"50%", transform:"translateX(-50%)", background: theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:"12px 16px", zIndex:500, textAlign:"center", boxShadow:"0 4px 16px rgba(0,0,0,.15)", width:"80%", maxWidth:280 }}>
            <div style={{ fontSize:20, marginBottom:4 }}>📍</div>
            <div style={{ fontSize:13, fontWeight:700, color:theme.text, marginBottom:2 }}>No GPS data yet</div>
            <div style={{ fontSize:11, color:theme.muted }}>Add houses with GPS to see them here</div>
          </div>
        )}
      </div>

      <div style={{ height:64, flexShrink:0, background:theme.card }} />
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ nav, theme, refresh, toast }) {
  const [data, setData] = useState({ houses:[], businesses:[], areas:[] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dbGetAll("houses"), dbGetAll("businesses"), dbGetAll("areas")])
      .then(([houses, businesses, areas]) => { setData({ houses, businesses, areas }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refresh]);

  const { houses, businesses, areas } = data;
  const today = new Date().toISOString().split("T")[0];
  const stats = [
    { label:"Houses", value: houses.length, icon:"🏘️" },
    { label:"Businesses", value: businesses.length, icon:"🏪" },
    { label:"Prospects", value: houses.filter(h=>h.customerStatus==="prospect").length, icon:"🎯" },
    { label:"Active", value: houses.filter(h=>h.customerStatus==="existing").length, icon:"✅" },
    { label:"Areas Active", value: `${new Set([...houses.map(h=>h.areaId),...businesses.map(b=>b.areaId)]).size} / ${areas.length}`, icon:"🗺️" },
    { label:"Today's Surveys", value: houses.filter(h=>h.createdAt?.startsWith(today)).length + businesses.filter(b=>b.createdAt?.startsWith(today)).length, icon:"📝" },
  ];

  const recent = [...houses.sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||"")).slice(0,3),
                   ...businesses.sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||"")).slice(0,2)];

  return (
    <div style={{ padding:"16px 16px 8px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:24, fontWeight:800, color:theme.primary, letterSpacing:-0.5 }}>🏮 Tensa Beat</div>
          <div style={{ fontSize:12, color:theme.muted, marginTop:2 }}>Postal Beat Manager</div>
        </div>
        <button onClick={() => nav("settings")} style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:10, width:40, height:40, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>⚙️</button>
      </div>

      <div style={{ marginBottom:20 }}>
        <SectionLabel theme={theme}>Quick Actions</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <QuickBtn theme={theme} color={theme.primary} icon="🏠" label="Add House" onClick={() => nav("add", { type:"house" })} />
          <QuickBtn theme={theme} color={theme.accent} icon="🏪" label="Add Business" onClick={() => nav("add", { type:"business" })} />
          <QuickBtn theme={theme} color="#8b5cf6" icon="📅" label="Follow-ups" onClick={() => nav("followups")} outline />
          <QuickBtn theme={theme} color="#10b981" icon="🗺️" label="Beat Map" onClick={() => nav("map")} outline />
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <SectionLabel theme={theme}>Overview</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background:theme.card, borderRadius:12, padding:"14px 14px", border:`1px solid ${theme.border}` }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:800, color:theme.text }}>{loading ? "—" : s.value}</div>
              <div style={{ fontSize:11, color:theme.muted, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:8 }}>
        <SectionLabel theme={theme}>Recent Entries</SectionLabel>
        <div style={{ background:theme.card, borderRadius:12, border:`1px solid ${theme.border}`, overflow:"hidden" }}>
          {loading ? <div style={{ padding:20, color:theme.muted, textAlign:"center", fontSize:13 }}>Loading…</div>
          : recent.length === 0 ? <div style={{ padding:24, color:theme.muted, textAlign:"center", fontSize:13 }}>No entries yet. Tap + to add one.</div>
          : recent.slice(0,5).map((item, i) => {
            const isHouse = "houseNumber" in item;
            return (
              <div key={item.id} onClick={() => nav(isHouse ? "house-detail" : "biz-detail", { id: item.id })}
                style={{ padding:"12px 14px", borderBottom: i<recent.slice(0,5).length-1 ? `1px solid ${theme.border}` : "none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:18 }}>{isHouse ? "🏠" : "🏪"}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{isHouse ? (item.ownerName || "Unknown") : item.businessName}</div>
                    <div style={{ fontSize:11, color:theme.muted }}>{isHouse ? `House ${item.houseNumber}` : item.businessType}</div>
                  </div>
                </div>
                {isHouse && <StatusBadge status={item.customerStatus} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Entry ────────────────────────────────────────────────────────────────
function AddEntry({ nav, theme, params, toast, bump }) {
  const [tab, setTab] = useState(params.type || "house");
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const editId = params.editId;
  const editType = params.editType;

  const [houseForm, setHouseForm] = useState({
    areaId:"", subArea:"", houseNumber:"", ownerName:"", mobileNumber:"", alternateNumber:"",
    familySize:1, addressNotes:"", deliveryNotes:"", customerStatus:"new", colorMarker:"blue",
    gpsLat:null, gpsLng:null, photoUrl:null
  });
  const [bizForm, setBizForm] = useState({
    areaId:"", businessName:"", ownerName:"", mobileNumber:"",
    businessType:"shop", interestedServices:[], followUpDate:"", remarks:""
  });

  useEffect(() => {
    dbGetAll("areas").then(setAreas);
    if (editId) {
      if (editType === "house") { dbGet("houses", editId).then(h => h && setHouseForm(h)); setTab("house"); }
      else { dbGet("businesses", editId).then(b => b && setBizForm({ ...b, followUpDate: b.followUpDate || "" })); setTab("business"); }
    }
  }, [editId, editType]);

  const hf = (k) => (e) => setHouseForm(f => ({ ...f, [k]: e.target.value }));
  const bf = (k) => (e) => setBizForm(f => ({ ...f, [k]: e.target.value }));

  const captureGPS = () => {
    if (!navigator.geolocation) { toast("Geolocation not supported","error"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setHouseForm(f=>({...f, gpsLat:pos.coords.latitude, gpsLng:pos.coords.longitude})); toast("GPS captured!"); setGpsLoading(false); },
      err => { toast("GPS error: "+err.message,"error"); setGpsLoading(false); },
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setHouseForm(f=>({...f, photoUrl:reader.result})); toast("Photo captured!"); };
    reader.readAsDataURL(file);
  };

  const saveHouse = async () => {
    if (!houseForm.areaId) { toast("Please select an area","error"); return; }
    if (!houseForm.houseNumber) { toast("House number is required","error"); return; }
    if (!houseForm.ownerName) { toast("Owner name is required","error"); return; }
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await dbPut("houses", { ...houseForm, id: editId || crypto.randomUUID(), createdAt: houseForm.createdAt || now, updatedAt: now });
      toast(editId ? "House updated!" : "House added!"); bump();
      nav(editId ? "house-detail" : "dashboard", editId ? { id: editId } : {});
    } catch { toast("Error saving","error"); }
    setSaving(false);
  };

  const saveBiz = async () => {
    if (!bizForm.areaId) { toast("Please select an area","error"); return; }
    if (!bizForm.businessName) { toast("Business name is required","error"); return; }
    if (!bizForm.ownerName) { toast("Owner name is required","error"); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const id = editId || crypto.randomUUID();
    try {
      await dbPut("businesses", { ...bizForm, id, createdAt: bizForm.createdAt || now, updatedAt: now });
      if (bizForm.followUpDate) {
        await dbPut("followups", { id: crypto.randomUUID(), entityType:"business", entityId:id, entityName:bizForm.businessName, followUpDate:bizForm.followUpDate, notes:bizForm.remarks||"", completed:false, createdAt:now });
      }
      toast(editId ? "Business updated!" : "Business added!"); bump();
      nav(editId ? "biz-detail" : "dashboard", editId ? { id: editId } : {});
    } catch { toast("Error saving","error"); }
    setSaving(false);
  };

  const services = ["Speed Post","Parcel","Business Parcel","Logistics","Pickup Service"];
  const toggleService = (s) => setBizForm(f => ({ ...f, interestedServices: f.interestedServices.includes(s) ? f.interestedServices.filter(x=>x!==s) : [...f.interestedServices, s] }));

  return (
    <div>
      <PageHeader title={editId ? "Edit Entry" : "Add Entry"} onBack={() => editId ? nav(editType==="house"?"house-detail":"biz-detail",{id:editId}) : nav("dashboard")} theme={theme} />
      <div style={{ padding:"0 16px 100px" }}>
        {!editId && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
            {["house","business"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding:"12px", borderRadius:10, border:`2px solid ${tab===t?(t==="house"?theme.primary:theme.accent):theme.border}`, background: tab===t?(t==="house"?theme.primary+"18":theme.accent+"18"):theme.card, color: tab===t?(t==="house"?theme.primary:theme.accent):theme.muted, fontWeight:700, fontSize:14, cursor:"pointer", textTransform:"capitalize" }}>
                {t==="house"?"🏠 House":"🏪 Business"}
              </button>
            ))}
          </div>
        )}

        {tab === "house" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <FormSelect label="Area *" value={houseForm.areaId} onChange={hf("areaId")} theme={theme} options={areas.map(a=>({value:a.id,label:a.name}))} placeholder="Select area..." />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormInput label="House No. *" value={houseForm.houseNumber} onChange={hf("houseNumber")} theme={theme} />
              <FormInput label="Sub Area" value={houseForm.subArea} onChange={hf("subArea")} theme={theme} />
            </div>
            <FormInput label="Owner Name *" value={houseForm.ownerName} onChange={hf("ownerName")} theme={theme} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormInput label="Mobile" value={houseForm.mobileNumber} onChange={hf("mobileNumber")} theme={theme} type="tel" />
              <FormInput label="Alt Mobile" value={houseForm.alternateNumber} onChange={hf("alternateNumber")} theme={theme} type="tel" />
            </div>
            <FormInput label="Family Size" value={houseForm.familySize} onChange={e=>setHouseForm(f=>({...f,familySize:+e.target.value||1}))} theme={theme} type="number" min={1} />
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:theme.muted, marginBottom:10 }}>CUSTOMER STATUS</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {["existing","prospect","new","closed"].map(s => (
                  <button key={s} onClick={()=>setHouseForm(f=>({...f,customerStatus:s}))} style={{ padding:"10px 8px", borderRadius:8, border:`2px solid ${houseForm.customerStatus===s?STATUS_COLOR[s]:theme.border}`, background:houseForm.customerStatus===s?STATUS_COLOR[s]+"20":"transparent", color:houseForm.customerStatus===s?STATUS_COLOR[s]:theme.muted, fontWeight:600, fontSize:13, cursor:"pointer", textTransform:"capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:theme.muted, marginBottom:10 }}>MAP MARKER COLOR</div>
              <div style={{ display:"flex", gap:12 }}>
                {Object.entries(COLOR_MAP).map(([name,hex]) => (
                  <button key={name} onClick={()=>setHouseForm(f=>({...f,colorMarker:name}))} style={{ width:34, height:34, borderRadius:"50%", background:hex, border:`3px solid ${houseForm.colorMarker===name?"#fff":"transparent"}`, outline:houseForm.colorMarker===name?`2px solid ${hex}`:"none", cursor:"pointer" }} title={name} />
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <button onClick={captureGPS} style={{ padding:"16px 8px", borderRadius:12, border:`1px solid ${houseForm.gpsLat?theme.success:theme.border}`, background:theme.card, color:houseForm.gpsLat?theme.success:theme.muted, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                {gpsLoading ? <span style={{ fontSize:20 }}>⏳</span> : <span style={{ fontSize:20 }}>📍</span>}
                {houseForm.gpsLat ? "GPS Set ✓" : "Capture GPS"}
              </button>
              <label style={{ padding:"16px 8px", borderRadius:12, border:`1px solid ${houseForm.photoUrl?theme.success:theme.border}`, background:theme.card, color:houseForm.photoUrl?theme.success:theme.muted, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, fontSize:12, fontWeight:600 }}>
                <span style={{ fontSize:20 }}>📷</span>
                {houseForm.photoUrl ? "Photo ✓" : "Take Photo"}
                <input type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handlePhoto} />
              </label>
            </div>
            <FormTextarea label="Address Notes" value={houseForm.addressNotes} onChange={hf("addressNotes")} theme={theme} />
            <FormTextarea label="Delivery Notes" value={houseForm.deliveryNotes} onChange={hf("deliveryNotes")} theme={theme} />
            <SaveBtn label="Save House" color={theme.primary} onClick={saveHouse} saving={saving} />
          </div>
        )}

        {tab === "business" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <FormSelect label="Area *" value={bizForm.areaId} onChange={bf("areaId")} theme={theme} options={areas.map(a=>({value:a.id,label:a.name}))} placeholder="Select area..." />
            <FormInput label="Business Name *" value={bizForm.businessName} onChange={bf("businessName")} theme={theme} />
            <FormInput label="Owner / Contact Name *" value={bizForm.ownerName} onChange={bf("ownerName")} theme={theme} />
            <FormInput label="Mobile Number" value={bizForm.mobileNumber} onChange={bf("mobileNumber")} theme={theme} type="tel" />
            <FormSelect label="Business Type" value={bizForm.businessType} onChange={bf("businessType")} theme={theme}
              options={["shop","contractor","mining","transport","office","school","medical","other"].map(t=>({value:t,label:t.charAt(0).toUpperCase()+t.slice(1)}))} />
            <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:theme.muted, marginBottom:10 }}>INTERESTED SERVICES</div>
              {services.map(s => (
                <label key={s} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", cursor:"pointer", borderBottom:`1px solid ${theme.border}` }}>
                  <input type="checkbox" checked={bizForm.interestedServices.includes(s)} onChange={()=>toggleService(s)} style={{ width:18, height:18, accentColor:theme.accent }} />
                  <span style={{ fontSize:14, color:theme.text }}>{s}</span>
                </label>
              ))}
            </div>
            <FormInput label="Follow-up Date" value={bizForm.followUpDate} onChange={bf("followUpDate")} theme={theme} type="date" />
            <FormTextarea label="Remarks / Notes" value={bizForm.remarks} onChange={bf("remarks")} theme={theme} />
            <SaveBtn label="Save Business" color={theme.accent} onClick={saveBiz} saving={saving} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Areas Page ───────────────────────────────────────────────────────────────
function AreasPage({ nav, theme, refresh }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([dbGetAll("areas"), dbGetAll("houses"), dbGetAll("businesses")])
      .then(([a,h,b]) => { setAreas(a); setHouses(h); setBusinesses(b); });
  }, [refresh]);

  const filtered = areas.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding:"16px" }}>
      <div style={{ fontSize:22, fontWeight:800, color:theme.primary, marginBottom:4 }}>Beat Areas</div>
      <div style={{ fontSize:12, color:theme.muted, marginBottom:16 }}>Manage your delivery zones</div>
      <SearchBar value={search} onChange={e=>setSearch(e.target.value)} theme={theme} placeholder="Search areas..." />
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:14 }}>
        {filtered.map(area => {
          const hCount = houses.filter(h=>h.areaId===area.id).length;
          const bCount = businesses.filter(b=>b.areaId===area.id).length;
          const total = hCount + bCount;
          const pct = Math.min(100, total > 0 ? Math.round((total / Math.max(10, total+3)) * 100) : 0);
          return (
            <div key={area.id} style={{ background:theme.card, borderRadius:12, padding:14, border:`1px solid ${theme.border}` }}>
              <div style={{ fontWeight:700, fontSize:14, color:theme.text, marginBottom:8 }}>{area.name}</div>
              <div style={{ display:"flex", gap:16, marginBottom:10 }}>
                <span style={{ fontSize:12, color:theme.muted }}>🏠 {hCount} houses</span>
                <span style={{ fontSize:12, color:theme.muted }}>🏪 {bCount} businesses</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:11, color:theme.muted }}>Survey Progress</span>
                <span style={{ fontSize:11, fontWeight:700, color:theme.primary }}>{pct}%</span>
              </div>
              <div style={{ background:theme.border, borderRadius:99, height:6, overflow:"hidden" }}>
                <div style={{ width:`${pct}%`, height:"100%", background:theme.primary, borderRadius:99, transition:"width .4s" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search Page ──────────────────────────────────────────────────────────────
function SearchPage({ nav, theme, refresh }) {
  const [query, setQuery] = useState("");
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    Promise.all([dbGetAll("houses"), dbGetAll("businesses")]).then(([h,b]) => { setHouses(h); setBusinesses(b); });
  }, [refresh]);

  const q = query.toLowerCase();
  const fh = query ? houses.filter(h => h.ownerName?.toLowerCase().includes(q) || h.houseNumber?.toLowerCase().includes(q) || h.mobileNumber?.includes(q)) : [];
  const fb = query ? businesses.filter(b => b.businessName?.toLowerCase().includes(q) || b.ownerName?.toLowerCase().includes(q) || b.mobileNumber?.includes(q)) : [];

  return (
    <div style={{ padding:16 }}>
      <div style={{ fontSize:22, fontWeight:800, color:theme.primary, marginBottom:16 }}>Search</div>
      <SearchBar value={query} onChange={e=>setQuery(e.target.value)} theme={theme} placeholder="Name, phone, house number…" autoFocus />
      <div style={{ marginTop:16 }}>
        {query && fh.length===0 && fb.length===0 && <div style={{ textAlign:"center", color:theme.muted, marginTop:40, fontSize:14 }}>No results for "{query}"</div>}
        {fh.length>0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:8 }}>🏠 HOUSES</div>
            {fh.map(h => (
              <div key={h.id} onClick={() => nav("house-detail",{id:h.id})} style={{ background:theme.card, borderRadius:10, padding:"12px 14px", marginBottom:8, border:`1px solid ${theme.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:theme.text }}>{h.ownerName||"Unknown"}</div>
                  <div style={{ fontSize:11, color:theme.muted }}>House {h.houseNumber} • {h.mobileNumber}</div>
                </div>
                <StatusBadge status={h.customerStatus} />
              </div>
            ))}
          </div>
        )}
        {fb.length>0 && (
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:8 }}>🏪 BUSINESSES</div>
            {fb.map(b => (
              <div key={b.id} onClick={() => nav("biz-detail",{id:b.id})} style={{ background:theme.card, borderRadius:10, padding:"12px 14px", marginBottom:8, border:`1px solid ${theme.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:theme.text }}>{b.businessName}</div>
                  <div style={{ fontSize:11, color:theme.muted }}>{b.ownerName} • {b.mobileNumber}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:600, background:theme.accent+"22", color:theme.accent, padding:"3px 8px", borderRadius:6 }}>{b.businessType}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
function ReportsPage({ nav, theme, refresh, toast }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    Promise.all([dbGetAll("areas"), dbGetAll("houses"), dbGetAll("businesses")])
      .then(([a,h,b]) => { setAreas(a); setHouses(h); setBusinesses(b); });
  }, [refresh]);

  const exportCSV = () => {
    let csv = "HOUSES\nID,Area,House No,Owner,Mobile,Status\n";
    houses.forEach(h => {
      const area = areas.find(a=>a.id===h.areaId)?.name||"Unknown";
      csv += `${h.id},${area},${h.houseNumber},${h.ownerName},${h.mobileNumber},${h.customerStatus}\n`;
    });
    csv += "\nBUSINESSES\nID,Area,Business Name,Owner,Mobile,Type\n";
    businesses.forEach(b => {
      const area = areas.find(a=>a.id===b.areaId)?.name||"Unknown";
      csv += `${b.id},${area},${b.businessName},${b.ownerName},${b.mobileNumber},${b.businessType}\n`;
    });
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tensa-beat-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast("CSV exported!");
  };

  const activeAreas = areas.filter(a => houses.some(h=>h.areaId===a.id) || businesses.some(b=>b.areaId===a.id));

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:theme.primary, marginBottom:4 }}>Reports</div>
          <div style={{ fontSize:12, color:theme.muted }}>Area & business statistics</div>
        </div>
        <button onClick={exportCSV} style={{ background:theme.card, border:`1px solid ${theme.border}`, padding:"8px 14px", borderRadius:10, fontSize:13, fontWeight:700, color:theme.primary, cursor:"pointer" }}>⬇ CSV</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
        {[{ label:"Houses", value:houses.length, icon:"🏠" },{ label:"Businesses", value:businesses.length, icon:"🏪" },{ label:"Prospects", value:houses.filter(h=>h.customerStatus==="prospect").length, icon:"🎯" }].map(s => (
          <div key={s.label} style={{ background:theme.card, borderRadius:12, padding:"12px 10px", border:`1px solid ${theme.border}`, textAlign:"center" }}>
            <div style={{ fontSize:22 }}>{s.icon}</div>
            <div style={{ fontSize:20, fontWeight:800, color:theme.text }}>{s.value}</div>
            <div style={{ fontSize:10, color:theme.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background:theme.card, borderRadius:12, border:`1px solid ${theme.border}`, marginBottom:14, overflow:"hidden" }}>
        <div style={{ padding:"12px 14px", borderBottom:`1px solid ${theme.border}`, fontWeight:700, fontSize:13 }}>📊 Status Breakdown</div>
        {["existing","prospect","new","closed"].map(s => {
          const count = houses.filter(h=>h.customerStatus===s).length;
          const pct = houses.length ? Math.round((count/houses.length)*100) : 0;
          return (
            <div key={s} style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${theme.border}` }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:STATUS_COLOR[s] }} />
              <span style={{ fontSize:13, textTransform:"capitalize", flex:1, color:theme.text }}>{s}</span>
              <span style={{ fontSize:13, fontWeight:700, color:theme.text }}>{count}</span>
              <span style={{ fontSize:11, color:theme.muted }}>{pct}%</span>
            </div>
          );
        })}
      </div>
      {activeAreas.length > 0 && (
        <div style={{ background:theme.card, borderRadius:12, border:`1px solid ${theme.border}`, overflow:"hidden" }}>
          <div style={{ padding:"12px 14px", borderBottom:`1px solid ${theme.border}`, fontWeight:700, fontSize:13 }}>🗺️ Area-wise Report</div>
          {activeAreas.map(a => {
            const h = houses.filter(x=>x.areaId===a.id).length;
            const b = businesses.filter(x=>x.areaId===a.id).length;
            return (
              <div key={a.id} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", padding:"9px 14px", borderBottom:`1px solid ${theme.border}` }}>
                <span style={{ fontSize:12, color:theme.text }}>{a.name}</span>
                <span style={{ fontSize:12, fontWeight:700, textAlign:"right", minWidth:30, color:theme.primary }}>{h}</span>
                <span style={{ fontSize:12, fontWeight:700, textAlign:"right", minWidth:30, color:theme.accent }}>{b}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Follow-ups Page ──────────────────────────────────────────────────────────
function FollowUpsPage({ nav, theme, refresh, toast, bump }) {
  const [followups, setFollowups] = useState([]);
  useEffect(() => { dbGetAll("followups").then(setFollowups); }, [refresh]);
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate()+7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];
  const pending = followups.filter(f=>!f.completed);
  const markDone = async (f) => { await dbPut("followups", {...f, completed:true}); toast("Marked complete!"); bump(); };
  const Sec = ({title, items, color}) => (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:13, fontWeight:700, color, marginBottom:10 }}>{title} ({items.length})</div>
      {items.length===0 ? <div style={{ padding:"16px", textAlign:"center", fontSize:13, color:theme.muted, border:`1px dashed ${theme.border}`, borderRadius:10 }}>All clear ✓</div>
      : items.map(f => (
        <div key={f.id} style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, display:"flex", gap:10, alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13, color:theme.text, cursor:"pointer" }} onClick={()=>nav(f.entityType==="house"?"house-detail":"biz-detail",{id:f.entityId})}>{f.entityName}</div>
            <div style={{ fontSize:11, color:theme.muted, margin:"2px 0" }}>📅 {f.followUpDate}</div>
            {f.notes && <div style={{ fontSize:12, color:theme.muted }}>{f.notes}</div>}
          </div>
          <button onClick={()=>markDone(f)} style={{ background:"#22c55e22", border:"none", borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>✅</button>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <PageHeader title="Follow-ups" onBack={() => nav("dashboard")} theme={theme} />
      <div style={{ padding:"0 16px 80px" }}>
        <Sec title="⚠️ Overdue" items={pending.filter(f=>f.followUpDate<today)} color={theme.danger} />
        <Sec title="📅 Today" items={pending.filter(f=>f.followUpDate===today)} color={theme.primary} />
        <Sec title="📆 This Week" items={pending.filter(f=>f.followUpDate>today&&f.followUpDate<=nextWeekStr)} color={theme.muted} />
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
function SettingsPage({ nav, theme, dark, setDark, toast, bump }) {
  const fileRef = useRef();
  const doExport = async () => {
    const json = await dbExport();
    const blob = new Blob([json],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`tensa-beat-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click(); URL.revokeObjectURL(url); toast("Backup exported!");
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    try { const text = await file.text(); await dbImport(text); toast("Database restored!"); bump(); setTimeout(()=>window.location.reload(),800); }
    catch { toast("Invalid backup file","error"); }
  };
  return (
    <div>
      <PageHeader title="Settings" onBack={() => nav("dashboard")} theme={theme} />
      <div style={{ padding:"0 16px 80px", display:"flex", flexDirection:"column", gap:20 }}>
        <Sec title="APPEARANCE" theme={theme}>
          <SettingRow icon="🌙" label="Dark Mode" theme={theme}><Toggle checked={dark} onChange={setDark} theme={theme} /></SettingRow>
        </Sec>
        <Sec title="DATA MANAGEMENT" theme={theme}>
          <SettingRow icon="⬇️" label="Export Backup (JSON)" sub="Save full database" theme={theme} onClick={doExport} />
          <SettingRow icon="⬆️" label="Restore from Backup" sub="Load from JSON file" theme={theme} onClick={()=>fileRef.current?.click()} border={false} />
          <input type="file" accept=".json" ref={fileRef} style={{display:"none"}} onChange={doImport} />
        </Sec>
        <Sec title="ABOUT" theme={theme}>
          <SettingRow icon="ℹ️" label="Version" theme={theme}><span style={{fontSize:13,color:theme.muted}}>2.0.0</span></SettingRow>
          <SettingRow icon="🗺️" label="Map" theme={theme}><span style={{fontSize:13,color:theme.muted}}>OpenStreetMap</span></SettingRow>
          <SettingRow icon="🌐" label="Network" border={false} theme={theme}><span style={{fontSize:13,color:navigator.onLine?"#22c55e":"#f97316"}}>{navigator.onLine?"Online":"Offline"}</span></SettingRow>
        </Sec>
      </div>
    </div>
  );
}

// ─── House Detail ─────────────────────────────────────────────────────────────
function HouseDetail({ nav, theme, params, toast, bump }) {
  const [house, setHouse] = useState(null);
  const [area, setArea] = useState(null);
  useEffect(() => {
    if (!params.id) return;
    dbGet("houses", params.id).then(h => { setHouse(h); if (h) dbGet("areas", h.areaId).then(setArea); });
  }, [params.id]);
  const del = async () => {
    if (!confirm("Delete this house record?")) return;
    await dbDelete("houses", house.id); toast("House deleted"); bump(); nav("dashboard");
  };
  if (!house) return <div style={{ padding:40, textAlign:"center", color:"#888" }}>Loading…</div>;
  return (
    <div>
      <div style={{ background:theme.card, borderBottom:`1px solid ${theme.border}`, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50 }}>
        <button onClick={() => nav("dashboard")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
        <div style={{ flex:1, fontSize:17, fontWeight:800, color:theme.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{house.ownerName||"Unknown"}</div>
        <button onClick={() => nav("add",{editId:house.id, editType:"house", type:"house"})} style={{ background:"none", border:`1px solid ${theme.border}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:13, color:theme.primary, fontWeight:700 }}>Edit</button>
        <button onClick={del} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20 }}>🗑️</button>
      </div>
      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <StatusBadge status={house.customerStatus} />
          <div style={{ width:14, height:14, borderRadius:"50%", background:COLOR_MAP[house.colorMarker]||"#888", border:"2px solid #fff", boxShadow:"0 1px 3px rgba(0,0,0,.3)" }} />
          <span style={{ fontSize:12, color:theme.muted, textTransform:"capitalize" }}>{house.colorMarker} marker</span>
        </div>
        <InfoCard theme={theme}>
          <InfoRow label="Area" value={area?.name||"—"} theme={theme} />
          <InfoRow label="House No." value={house.houseNumber} theme={theme} />
          <InfoRow label="Sub Area" value={house.subArea||"—"} theme={theme} />
          <InfoRow label="Family Size" value={house.familySize} theme={theme} />
        </InfoCard>
        {(house.mobileNumber||house.alternateNumber) && (
          <InfoCard theme={theme}>
            {house.mobileNumber && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${theme.border}` }}>
                <div><div style={{ fontSize:11, color:theme.muted }}>MOBILE</div><div style={{ fontSize:14, fontWeight:700, color:theme.text }}>{house.mobileNumber}</div></div>
                <a href={`tel:${house.mobileNumber}`} style={{ background:theme.primary, color:"#fff", padding:"8px 14px", borderRadius:8, textDecoration:"none", fontSize:13, fontWeight:700 }}>📞 Call</a>
              </div>
            )}
            {house.alternateNumber && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0" }}>
                <div><div style={{ fontSize:11, color:theme.muted }}>ALT MOBILE</div><div style={{ fontSize:14, fontWeight:700, color:theme.text }}>{house.alternateNumber}</div></div>
                <a href={`tel:${house.alternateNumber}`} style={{ background:theme.primary+"22", color:theme.primary, padding:"8px 14px", borderRadius:8, textDecoration:"none", fontSize:13, fontWeight:700 }}>📞 Call</a>
              </div>
            )}
          </InfoCard>
        )}
        {(house.addressNotes||house.deliveryNotes) && (
          <InfoCard theme={theme}>
            {house.addressNotes && <InfoRow label="Address Notes" value={house.addressNotes} theme={theme} />}
            {house.deliveryNotes && <InfoRow label="Delivery Notes" value={house.deliveryNotes} theme={theme} border={false} />}
          </InfoCard>
        )}
        {(house.gpsLat&&house.gpsLng) && (
          <a href={`https://maps.google.com?q=${house.gpsLat},${house.gpsLng}`} target="_blank" rel="noreferrer"
            style={{ background:theme.primary+"15", border:`1px solid ${theme.primary}44`, borderRadius:12, padding:14, display:"flex", alignItems:"center", gap:10, textDecoration:"none", color:theme.primary, fontWeight:700, fontSize:14 }}>
            📍 View on Google Maps
            <span style={{ fontSize:11, color:theme.muted, fontWeight:400 }}>{house.gpsLat.toFixed(5)}, {house.gpsLng.toFixed(5)}</span>
          </a>
        )}
        {house.photoUrl && <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${theme.border}` }}><img src={house.photoUrl} alt="House" style={{ width:"100%", display:"block" }} /></div>}
        <div style={{ fontSize:11, color:theme.muted, textAlign:"center", paddingTop:4 }}>Added {new Date(house.createdAt).toLocaleDateString()} • Updated {new Date(house.updatedAt).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

// ─── Business Detail ──────────────────────────────────────────────────────────
function BizDetail({ nav, theme, params, toast, bump }) {
  const [biz, setBiz] = useState(null);
  const [area, setArea] = useState(null);
  useEffect(() => {
    if (!params.id) return;
    dbGet("businesses", params.id).then(b => { setBiz(b); if (b) dbGet("areas", b.areaId).then(setArea); });
  }, [params.id]);
  const del = async () => {
    if (!confirm("Delete this business?")) return;
    await dbDelete("businesses", biz.id); toast("Business deleted"); bump(); nav("dashboard");
  };
  if (!biz) return <div style={{ padding:40, textAlign:"center", color:"#888" }}>Loading…</div>;
  return (
    <div>
      <div style={{ background:theme.card, borderBottom:`1px solid ${theme.border}`, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50 }}>
        <button onClick={() => nav("dashboard")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
        <div style={{ flex:1, fontSize:17, fontWeight:800, color:theme.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{biz.businessName}</div>
        <button onClick={() => nav("add",{editId:biz.id, editType:"business", type:"business"})} style={{ background:"none", border:`1px solid ${theme.border}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:13, color:theme.accent, fontWeight:700 }}>Edit</button>
        <button onClick={del} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20 }}>🗑️</button>
      </div>
      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
        <span style={{ background:theme.accent+"22", color:theme.accent, padding:"4px 12px", borderRadius:8, fontSize:12, fontWeight:700, textTransform:"capitalize", alignSelf:"flex-start" }}>{biz.businessType}</span>
        <InfoCard theme={theme}>
          <InfoRow label="Area" value={area?.name||"—"} theme={theme} />
          <InfoRow label="Owner / Contact" value={biz.ownerName} theme={theme} border={false} />
        </InfoCard>
        {biz.mobileNumber && (
          <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div><div style={{ fontSize:11, color:theme.muted }}>MOBILE</div><div style={{ fontSize:16, fontWeight:800, color:theme.text }}>{biz.mobileNumber}</div></div>
            <a href={`tel:${biz.mobileNumber}`} style={{ background:theme.accent, color:"#fff", padding:"10px 16px", borderRadius:10, textDecoration:"none", fontSize:14, fontWeight:700 }}>📞 Call</a>
          </div>
        )}
        {biz.interestedServices?.length > 0 && (
          <InfoCard theme={theme}>
            <div style={{ fontSize:11, color:theme.muted, marginBottom:8 }}>INTERESTED SERVICES</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {biz.interestedServices.map(s => <span key={s} style={{ background:theme.primary+"18", color:theme.primary, padding:"4px 10px", borderRadius:6, fontSize:12, fontWeight:600 }}>{s}</span>)}
            </div>
          </InfoCard>
        )}
        {biz.followUpDate && (
          <div style={{ background:"#f59e0b22", border:"1px solid #f59e0b44", borderRadius:12, padding:14, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>📅</span>
            <div><div style={{ fontSize:11, color:theme.muted }}>FOLLOW-UP DATE</div><div style={{ fontSize:14, fontWeight:700, color:"#f59e0b" }}>{biz.followUpDate}</div></div>
          </div>
        )}
        {biz.remarks && <InfoCard theme={theme}><InfoRow label="Remarks" value={biz.remarks} theme={theme} border={false} /></InfoCard>}
        <div style={{ fontSize:11, color:theme.muted, textAlign:"center" }}>Added {new Date(biz.createdAt).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function PageHeader({ title, onBack, theme }) {
  return (
    <div style={{ background:theme.card, borderBottom:`1px solid ${theme.border}`, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50 }}>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22 }}>←</button>
      <div style={{ fontSize:18, fontWeight:800, color:theme.text }}>{title}</div>
    </div>
  );
}
function SectionLabel({ theme, children }) { return <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:10, letterSpacing:.5 }}>{children}</div>; }
function QuickBtn({ theme, color, icon, label, onClick, outline }) {
  return <button onClick={onClick} style={{ padding:"16px 12px", borderRadius:14, border:`2px solid ${outline?color+"44":color}`, background:outline?color+"10":color, color:outline?color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}><span style={{ fontSize:20 }}>{icon}</span> {label}</button>;
}
function StatusBadge({ status }) {
  const c = STATUS_COLOR[status]||"#888";
  return <span style={{ background:c+"22", color:c, padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:700, textTransform:"capitalize" }}>{status}</span>;
}
function SearchBar({ value, onChange, theme, placeholder, autoFocus }) {
  return (
    <div style={{ position:"relative" }}>
      <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:18 }}>🔍</span>
      <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} style={{ width:"100%", padding:"12px 12px 12px 42px", borderRadius:12, border:`1px solid ${theme.border}`, background:theme.card, color:theme.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
    </div>
  );
}
function FormInput({ label, value, onChange, theme, type="text", min }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:5 }}>{label}</div>
      <input value={value||""} onChange={onChange} type={type} min={min} style={{ width:"100%", padding:"12px", borderRadius:10, border:`1px solid ${theme.border}`, background:theme.card, color:theme.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
    </div>
  );
}
function FormTextarea({ label, value, onChange, theme }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:5 }}>{label}</div>
      <textarea value={value||""} onChange={onChange} rows={3} style={{ width:"100%", padding:"12px", borderRadius:10, border:`1px solid ${theme.border}`, background:theme.card, color:theme.text, fontSize:14, outline:"none", boxSizing:"border-box", resize:"vertical" }} />
    </div>
  );
}
function FormSelect({ label, value, onChange, theme, options, placeholder }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:700, color:theme.muted, marginBottom:5 }}>{label}</div>
      <select value={value||""} onChange={onChange} style={{ width:"100%", padding:"12px", borderRadius:10, border:`1px solid ${theme.border}`, background:theme.card, color:value?theme.text:theme.muted, fontSize:14, outline:"none", boxSizing:"border-box" }}>
        <option value="">{placeholder||"Select…"}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function SaveBtn({ label, color, onClick, saving }) {
  return <button onClick={onClick} disabled={saving} style={{ width:"100%", padding:"16px", borderRadius:14, background:color, color:"#fff", border:"none", fontSize:16, fontWeight:800, cursor:saving?"not-allowed":"pointer", opacity:saving?.7:1, marginTop:8 }}>{saving ? "Saving…" : label}</button>;
}
function InfoCard({ theme, children }) { return <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, padding:"4px 14px", overflow:"hidden" }}>{children}</div>; }
function InfoRow({ label, value, theme, border=true }) {
  return (
    <div style={{ padding:"10px 0", borderBottom:border?`1px solid ${theme.border}`:"none" }}>
      <div style={{ fontSize:11, color:theme.muted, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:600, color:theme.text }}>{value||"—"}</div>
    </div>
  );
}
function Sec({ title, theme, children }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:theme.muted, marginBottom:8, letterSpacing:.8 }}>{title}</div>
      <div style={{ background:theme.card, border:`1px solid ${theme.border}`, borderRadius:12, overflow:"hidden" }}>{children}</div>
    </div>
  );
}
function SettingRow({ icon, label, sub, children, theme, onClick, border=true }) {
  return (
    <div onClick={onClick} style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:12, borderBottom:border?`1px solid ${theme.border}`:"none", cursor:onClick?"pointer":"default" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:600, color:theme.text }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:theme.muted }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}
function Toggle({ checked, onChange, theme }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ width:48, height:26, borderRadius:13, background:checked?theme.primary:theme.border, cursor:"pointer", position:"relative", transition:"background .2s" }}>
      <div style={{ position:"absolute", top:3, left:checked?22:3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)" }} />
    </div>
  );
}
