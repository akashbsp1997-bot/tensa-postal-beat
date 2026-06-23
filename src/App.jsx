import { useState, useEffect, useCallback, useRef } from "react";
import { db, isOnline } from "./supabase.js";

// ─── Local IndexedDB for offline ─────────────────────────────────────────────
const IDB_NAME = "tensa-beat-v4";
let _idb = null;
async function getIDB() {
  if (_idb) return _idb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      ["users","areas","houses","businesses","followups","deliveries","session"].forEach(s => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
      });
    };
    req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(store, obj) {
  const d = await getIDB();
  return new Promise((res,rej) => { const r = d.transaction(store,"readwrite").objectStore(store).put(obj); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}
async function idbGet(store, id) {
  const d = await getIDB();
  return new Promise((res,rej) => { const r = d.transaction(store,"readonly").objectStore(store).get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
async function idbGetAll(store) {
  const d = await getIDB();
  return new Promise((res,rej) => { const r = d.transaction(store,"readonly").objectStore(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
async function idbDelete(store, id) {
  const d = await getIDB();
  return new Promise((res,rej) => { const r = d.transaction(store,"readwrite").objectStore(store).delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}

// ─── Session helpers ──────────────────────────────────────────────────────────
async function saveSession(user) { await idbPut("session", { id: "current", ...user }); }
async function loadSession() { return await idbGet("session", "current"); }
async function clearSession() { await idbDelete("session", "current"); }

// ─── Colors & constants ───────────────────────────────────────────────────────
const COLOR_MAP = { blue:"#3b82f6", green:"#22c55e", red:"#ef4444", yellow:"#eab308", purple:"#a855f7", orange:"#f97316" };
const STATUS_COLOR = { existing:"#22c55e", prospect:"#f59e0b", new:"#3b82f6", closed:"#6b7280" };
const ROLES = { admin:"Admin", inspector:"Inspector/SPM", postman:"Postman" };

function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type="info") => {
    const id = Date.now();
    setToasts(t => [...t, {id,msg,type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id!==id)), 3000);
  }, []);
  return { toasts, toast };
}

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
function LeafletMap({ areas, houses, onAreaClick, onHouseClick, onAreaMoved, focusAreaId, editMode }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id="leaflet-css"; link.rel="stylesheet";
      link.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
    const init = () => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl:true, attributionControl:false }).setView([22.015,85.196],14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
      L.control.attribution({prefix:"© OpenStreetMap"}).addTo(map);
      mapInstanceRef.current = map;
      renderMarkers();
    };
    if (!window.L) { const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload=init; document.head.appendChild(s); }
    else init();
  }, []);

  useEffect(() => { if (window.L && mapInstanceRef.current) renderMarkers(); }, [areas, houses, focusAreaId, editMode]);

  function renderMarkers() {
    const L = window.L; const map = mapInstanceRef.current;
    if (!L || !map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (focusAreaId) {
      const areaHouses = houses.filter(h => (h.area_id||h.areaId)===focusAreaId && h.gps_lat && h.gps_lng);
      const area = areas.find(a => a.id===focusAreaId);
      if (areaHouses.length > 0) {
        const bounds = [];
        areaHouses.forEach(h => {
          const color = COLOR_MAP[h.color_marker||h.colorMarker]||"#3b82f6";
          const icon = L.divIcon({ html:`<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>`, iconSize:[28,28], iconAnchor:[14,28], className:"" });
          const marker = L.marker([h.gps_lat, h.gps_lng], {icon});
          marker.on("click", () => onHouseClick && onHouseClick(h));
          marker.bindPopup(`<div style="min-width:180px;font-family:system-ui;padding:4px 0"><div style="font-weight:800;font-size:14px;margin-bottom:4px">${h.owner_name||"Unknown"}</div><div style="font-size:12px;color:#64748b;margin-bottom:6px">House ${h.house_number||""}</div><div style="margin-bottom:8px"><span style="background:${STATUS_COLOR[h.customer_status]||"#888"}22;color:${STATUS_COLOR[h.customer_status]||"#888"};padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;text-transform:capitalize">${h.customer_status||"new"}</span></div>${h.mobile_number?`<a href="tel:${h.mobile_number}" style="display:block;background:#4f6ef7;color:#fff;text-align:center;padding:7px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">📞 ${h.mobile_number}</a>`:""}</div>`,{maxWidth:220});
          marker.addTo(map); markersRef.current.push(marker); bounds.push([h.gps_lat, h.gps_lng]);
        });
        if (bounds.length>0) map.fitBounds(bounds,{padding:[40,40]});
      } else {
        const pos = area?.lat && area?.lng ? [area.lat, area.lng] : [22.015,85.196];
        map.setView(pos, 16);
        const icon = L.divIcon({ html:`<div style="background:#f97316;color:#fff;padding:6px 12px;border-radius:20px;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)">📍 ${area?.name||"Area"}<br><span style="font-size:10px;font-weight:400">No GPS data yet</span></div>`, className:"", iconAnchor:[0,0] });
        const m = L.marker(pos,{icon}).addTo(map); markersRef.current.push(m);
      }
    } else {
      areas.forEach(area => {
        const areaHouses = houses.filter(h => (h.area_id||h.areaId)===area.id);
        const gpsHouses = areaHouses.filter(h => h.gps_lat && h.gps_lng);
        let lat = area.lat, lng = area.lng;
        if (gpsHouses.length>0 && !area.lat) {
          lat = gpsHouses.reduce((s,h)=>s+h.gps_lat,0)/gpsHouses.length;
          lng = gpsHouses.reduce((s,h)=>s+h.gps_lng,0)/gpsHouses.length;
        }
        if (!lat) return;
        const count = areaHouses.length;
        const drag = !!editMode;
        const icon = L.divIcon({ html:`<div style="background:${drag?"#f97316":"#4f6ef7"};color:#fff;border-radius:20px;padding:6px 10px;font-weight:800;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.35);white-space:nowrap;border:2px solid #fff;cursor:${drag?"grab":"pointer"}">${drag?"✥ ":""}${area.name.replace(" Area","")}<br><span style="font-size:10px;font-weight:400;opacity:.85">${drag?"drag to move":`${count} houses`}</span></div>`, className:"", iconAnchor:[0,0] });
        const marker = L.marker([lat,lng],{icon,draggable:drag});
        if (drag) marker.on("dragend",e=>{ const {lat,lng}=e.target.getLatLng(); onAreaMoved&&onAreaMoved(area.id,lat,lng); });
        else marker.on("click",()=>onAreaClick&&onAreaClick(area));
        marker.addTo(map); markersRef.current.push(marker);
      });
    }
  }
  return <div ref={mapRef} style={{width:"100%",height:"100%",background:"#e8f0fe"}} />;
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(()=>window.matchMedia("(prefers-color-scheme: dark)").matches);
  const { toasts, toast } = useToast();

  const theme = {
    bg: dark?"#0f1117":"#f4f6f9",
    card: dark?"#1a1f2e":"#ffffff",
    border: dark?"#2a3045":"#e2e8f0",
    text: dark?"#e8ecf5":"#1a202c",
    muted: dark?"#8892aa":"#64748b",
    primary:"#4f6ef7", accent:"#f97316", success:"#22c55e", danger:"#ef4444",
  };

  useEffect(() => {
    loadSession().then(s => { if (s) setUser(s); setLoading(false); });
  }, []);

  const login = async (u) => { await saveSession(u); setUser(u); };
  const logout = async () => { await clearSession(); setUser(null); };

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg,color:theme.muted,fontSize:14}}>Loading…</div>;

  return (
    <div style={{background:theme.bg,color:theme.text,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif",maxWidth:480,margin:"0 auto",position:"relative"}}>
      {!user
        ? <LoginScreen theme={theme} onLogin={login} toast={toast} />
        : user.role === "admin" || user.role === "inspector"
          ? <AdminApp user={user} theme={theme} onLogout={logout} toast={toast} dark={dark} setDark={setDark} />
          : <PostmanApp user={user} theme={theme} onLogout={logout} toast={toast} dark={dark} setDark={setDark} />
      }
      <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:999,display:"flex",flexDirection:"column",gap:8,width:"90%",maxWidth:420,pointerEvents:"none"}}>
        {toasts.map(t=>(
          <div key={t.id} style={{background:t.type==="error"?theme.danger:theme.primary,color:"#fff",padding:"10px 16px",borderRadius:10,fontSize:13,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,.2)",animation:"slideIn .2s ease"}}>{t.msg}</div>
        ))}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}} .leaflet-popup-content-wrapper{border-radius:12px!important;box-shadow:0 4px 20px rgba(0,0,0,.15)!important} .leaflet-popup-tip{display:none}`}</style>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ theme, onLogin, toast }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("select"); // select | pin

  useEffect(() => {
    const load = async () => {
      if (isOnline()) {
        const data = await db.getUsers();
        if (data) { setUsers(data); data.forEach(u => idbPut("users", u)); }
      } else {
        const data = await idbGetAll("users");
        setUsers(data);
      }
      setLoading(false);
    };
    load();
  }, []);

  const selectUser = (u) => { setSelected(u); setPin(""); setStep("pin"); };

  const tryLogin = async () => {
    if (pin === selected.pin) {
      toast(`Welcome, ${selected.name}!`);
      onLogin(selected);
    } else {
      toast("Wrong PIN. Try again.", "error");
      setPin("");
    }
  };

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:theme.muted}}>Loading users…</div>;

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:24}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🏮</div>
        <div style={{fontSize:24,fontWeight:800,color:theme.primary}}>Tensa Beat</div>
        <div style={{fontSize:13,color:theme.muted,marginTop:4}}>Postal Beat Manager</div>
        <div style={{fontSize:11,color:isOnline()?"#22c55e":"#f97316",marginTop:6,fontWeight:600}}>{isOnline()?"● Online":"● Offline"}</div>
      </div>

      {step === "select" && (
        <div style={{width:"100%",maxWidth:360}}>
          <div style={{fontSize:13,fontWeight:700,color:theme.muted,marginBottom:12,textAlign:"center"}}>Select your name</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {users.length === 0
              ? <div style={{textAlign:"center",color:theme.muted,fontSize:13,padding:20}}>No users found. Check connection.</div>
              : users.map(u => (
                <button key={u.id} onClick={() => selectUser(u)} style={{padding:"14px 16px",background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:u.role==="admin"?theme.primary:u.role==="inspector"?"#8b5cf6":theme.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:16,flexShrink:0}}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:theme.text}}>{u.name}</div>
                    <div style={{fontSize:11,color:theme.muted}}>{ROLES[u.role]} • {u.employee_id}</div>
                  </div>
                </button>
              ))
            }
          </div>
        </div>
      )}

      {step === "pin" && selected && (
        <div style={{width:"100%",maxWidth:300,textAlign:"center"}}>
          <button onClick={()=>setStep("select")} style={{background:"none",border:"none",color:theme.muted,fontSize:13,cursor:"pointer",marginBottom:16}}>← Back</button>
          <div style={{width:64,height:64,borderRadius:"50%",background:selected.role==="admin"?theme.primary:selected.role==="inspector"?"#8b5cf6":theme.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:28,margin:"0 auto 12px"}}>
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <div style={{fontSize:18,fontWeight:800,color:theme.text,marginBottom:4}}>{selected.name}</div>
          <div style={{fontSize:12,color:theme.muted,marginBottom:24}}>{ROLES[selected.role]}</div>
          <div style={{fontSize:13,fontWeight:600,color:theme.muted,marginBottom:12}}>Enter PIN</div>
          <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:24}}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{width:16,height:16,borderRadius:"50%",background:pin.length>i?theme.primary:theme.border,transition:"background .15s"}} />
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,maxWidth:240,margin:"0 auto"}}>
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i) => (
              <button key={i} onClick={()=>{
                if(k==="⌫") setPin(p=>p.slice(0,-1));
                else if(k!==""&&pin.length<4) { const np=pin+k; setPin(np); if(np.length===4) setTimeout(()=>{
                  if(np===selected.pin){toast(`Welcome, ${selected.name}!`);onLogin(selected);}
                  else{toast("Wrong PIN","error");setPin("");}
                },200); }
              }} style={{padding:"16px",borderRadius:12,border:`1px solid ${theme.border}`,background:k===""?"transparent":theme.card,color:theme.text,fontSize:20,fontWeight:700,cursor:k===""?"default":"pointer"}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin / Inspector App ────────────────────────────────────────────────────
function AdminApp({ user, theme, onLogout, toast, dark, setDark }) {
  const [page, setPage] = useState("dashboard");
  const [pageParams, setPageParams] = useState({});
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(()=>setRefresh(r=>r+1),[]);
  const nav = (p,params={})=>{ setPage(p); setPageParams(params); };
  const canEdit = user.role === "admin";

  const pages = {
    dashboard: <AdminDashboard nav={nav} theme={theme} user={user} refresh={refresh} />,
    users:     <UsersPage nav={nav} theme={theme} user={user} toast={toast} bump={bump} refresh={refresh} canEdit={canEdit} />,
    areas:     <AreasPage nav={nav} theme={theme} user={user} toast={toast} bump={bump} refresh={refresh} canEdit={canEdit} />,
    map:       <MapPage nav={nav} theme={theme} refresh={refresh} user={user} toast={toast} bump={bump} />,
    reports:   <ReportsPage nav={nav} theme={theme} refresh={refresh} user={user} />,
    settings:  <SettingsPage nav={nav} theme={theme} user={user} onLogout={onLogout} dark={dark} setDark={setDark} toast={toast} />,
    "house-detail": <HouseDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    "biz-detail":   <BizDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    "add-house":    <AddHouse nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    "add-biz":      <AddBusiness nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
  };

  const navItems = [
    {id:"dashboard",icon:"🏠",label:"Home"},
    {id:"map",icon:"🗺️",label:"Map"},
    {id:"users",icon:"👥",label:"Users"},
    {id:"areas",icon:"📍",label:"Areas"},
    {id:"reports",icon:"📊",label:"Reports"},
  ];

  const hideNav = ["house-detail","biz-detail","add-house","add-biz","settings","map"].includes(page);

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      <div style={{flex:1,overflowY:page==="map"?"hidden":"auto",paddingBottom:hideNav?0:72,height:page==="map"?"100vh":"auto"}}>
        {pages[page]||pages.dashboard}
      </div>
      {!hideNav && (
        <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:theme.card,borderTop:`1px solid ${theme.border}`,display:"flex",zIndex:100}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>nav(item.id)} style={{flex:1,padding:"10px 0 8px",border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:page===item.id?theme.primary:theme.muted,fontSize:10,fontWeight:page===item.id?700:400}}>
              <span style={{fontSize:20}}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── Postman App ──────────────────────────────────────────────────────────────
function PostmanApp({ user, theme, onLogout, toast, dark, setDark }) {
  const [page, setPage] = useState("dashboard");
  const [pageParams, setPageParams] = useState({});
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(()=>setRefresh(r=>r+1),[]);
  const nav = (p,params={})=>{ setPage(p); setPageParams(params); };

  const pages = {
    dashboard: <PostmanDashboard nav={nav} theme={theme} user={user} refresh={refresh} />,
    map:       <MapPage nav={nav} theme={theme} refresh={refresh} user={user} toast={toast} bump={bump} />,
    "add-house":  <AddHouse nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    "add-biz":    <AddBusiness nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    search:    <SearchPage nav={nav} theme={theme} refresh={refresh} user={user} />,
    settings:  <SettingsPage nav={nav} theme={theme} user={user} onLogout={onLogout} dark={dark} setDark={setDark} toast={toast} />,
    "house-detail": <HouseDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
    "biz-detail":   <BizDetail nav={nav} theme={theme} params={pageParams} toast={toast} bump={bump} user={user} />,
  };

  const navItems = [
    {id:"dashboard",icon:"🏠",label:"Home"},
    {id:"map",icon:"🗺️",label:"Map"},
    {id:"add-house",icon:"➕",label:"Add"},
    {id:"search",icon:"🔍",label:"Search"},
    {id:"settings",icon:"⚙️",label:"Settings"},
  ];

  const hideNav = ["add-house","add-biz","house-detail","biz-detail","map"].includes(page);

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      <div style={{flex:1,overflowY:page==="map"?"hidden":"auto",paddingBottom:hideNav?0:72,height:page==="map"?"100vh":"auto"}}>
        {pages[page]||pages.dashboard}
      </div>
      {!hideNav && (
        <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:theme.card,borderTop:`1px solid ${theme.border}`,display:"flex",zIndex:100}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>nav(item.id)} style={{flex:1,padding:"10px 0 8px",border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:page===item.id?theme.primary:theme.muted,fontSize:10,fontWeight:page===item.id?700:400}}>
              <span style={{fontSize:20}}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ nav, theme, user, refresh }) {
  const [stats, setStats] = useState({ users:0, areas:0, houses:0, businesses:0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [users, areas, houses, businesses] = await Promise.all([
        db.getUsers(), db.getAreas(), db.getHouses(), db.getBusinesses()
      ]);
      setStats({ users: users?.length||0, areas: areas?.length||0, houses: houses?.length||0, businesses: businesses?.length||0 });
      const allRecent = [...(houses||[]).slice(0,3), ...(businesses||[]).slice(0,2)];
      setRecent(allRecent);
      setLoading(false);
    };
    load();
  }, [refresh]);

  return (
    <div style={{padding:"16px 16px 8px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:theme.primary}}>🏮 Tensa Beat</div>
          <div style={{fontSize:12,color:theme.muted}}>{ROLES[user.role]} — {user.office_name||"Tensa Post Office"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{fontSize:10,color:isOnline()?"#22c55e":"#f97316",fontWeight:600}}>{isOnline()?"● Online":"● Offline"}</div>
          <button onClick={()=>nav("settings")} style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙️</button>
        </div>
      </div>

      <div style={{marginBottom:20}}>
        <SectionLabel theme={theme}>Overview</SectionLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{label:"Postmen",value:stats.users,icon:"👷",page:"users"},{label:"Areas",value:stats.areas,icon:"📍",page:"areas"},{label:"Houses",value:stats.houses,icon:"🏘️"},{label:"Businesses",value:stats.businesses,icon:"🏪"}].map(s=>(
            <div key={s.label} onClick={()=>s.page&&nav(s.page)} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`,cursor:s.page?"pointer":"default"}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:22,fontWeight:800,color:theme.text}}>{loading?"—":s.value}</div>
              <div style={{fontSize:11,color:theme.muted}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {user.role==="admin" && (
        <div style={{marginBottom:20}}>
          <SectionLabel theme={theme}>Quick Actions</SectionLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <QuickBtn theme={theme} color={theme.primary} icon="👤" label="Add Postman" onClick={()=>nav("users")} />
            <QuickBtn theme={theme} color={theme.accent} icon="📍" label="Add Area" onClick={()=>nav("areas")} />
            <QuickBtn theme={theme} color="#10b981" icon="🗺️" label="View Map" onClick={()=>nav("map")} outline />
            <QuickBtn theme={theme} color="#8b5cf6" icon="📊" label="Reports" onClick={()=>nav("reports")} outline />
          </div>
        </div>
      )}

      <div style={{marginBottom:8}}>
        <SectionLabel theme={theme}>Recent Activity</SectionLabel>
        <div style={{background:theme.card,borderRadius:12,border:`1px solid ${theme.border}`,overflow:"hidden"}}>
          {loading ? <div style={{padding:20,color:theme.muted,textAlign:"center",fontSize:13}}>Loading…</div>
          : recent.length===0 ? <div style={{padding:24,color:theme.muted,textAlign:"center",fontSize:13}}>No entries yet.</div>
          : recent.map((item,i)=>{
            const isHouse = "house_number" in item;
            return (
              <div key={item.id} onClick={()=>nav(isHouse?"house-detail":"biz-detail",{id:item.id})} style={{padding:"12px 14px",borderBottom:i<recent.length-1?`1px solid ${theme.border}`:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>{isHouse?"🏠":"🏪"}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:theme.text}}>{isHouse?(item.owner_name||"Unknown"):item.business_name}</div>
                    <div style={{fontSize:11,color:theme.muted}}>{isHouse?`House ${item.house_number}`:item.business_type}</div>
                  </div>
                </div>
                {isHouse&&<StatusBadge status={item.customer_status}/>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Postman Dashboard ────────────────────────────────────────────────────────
function PostmanDashboard({ nav, theme, user, refresh }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [a, h, b] = await Promise.all([
        db.getAreasByUser(user.id),
        db.getHousesByUser(user.id),
        db.getBusinessesByUser(user.id),
      ]);
      setAreas(a||[]); setHouses(h||[]); setBusinesses(b||[]);
      setLoading(false);
    };
    load();
  }, [refresh]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{padding:"16px 16px 8px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:theme.primary}}>🏮 {user.name}</div>
          <div style={{fontSize:12,color:theme.muted}}>Postman • {user.employee_id}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{fontSize:10,color:isOnline()?"#22c55e":"#f97316",fontWeight:600}}>{isOnline()?"● Online":"● Offline"}</div>
          <button onClick={()=>nav("settings")} style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙️</button>
        </div>
      </div>

      <div style={{marginBottom:20}}>
        <SectionLabel theme={theme}>My Beat</SectionLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"My Areas",value:areas.length,icon:"📍"},
            {label:"My Houses",value:houses.length,icon:"🏘️"},
            {label:"Businesses",value:businesses.length,icon:"🏪"},
            {label:"Today",value:houses.filter(h=>h.created_at?.startsWith(today)).length,icon:"📝"},
          ].map(s=>(
            <div key={s.label} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:22,fontWeight:800,color:theme.text}}>{loading?"—":s.value}</div>
              <div style={{fontSize:11,color:theme.muted}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{marginBottom:20}}>
        <SectionLabel theme={theme}>Quick Actions</SectionLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <QuickBtn theme={theme} color={theme.primary} icon="🏠" label="Add House" onClick={()=>nav("add-house")} />
          <QuickBtn theme={theme} color={theme.accent} icon="🏪" label="Add Business" onClick={()=>nav("add-biz")} />
          <QuickBtn theme={theme} color="#10b981" icon="🗺️" label="My Map" onClick={()=>nav("map")} outline />
          <QuickBtn theme={theme} color="#8b5cf6" icon="🔍" label="Search" onClick={()=>nav("search")} outline />
        </div>
      </div>

      <div style={{marginBottom:8}}>
        <SectionLabel theme={theme}>My Areas</SectionLabel>
        {loading ? <div style={{color:theme.muted,fontSize:13,textAlign:"center",padding:20}}>Loading…</div>
        : areas.length===0 ? <div style={{color:theme.muted,fontSize:13,textAlign:"center",padding:20,background:theme.card,borderRadius:12,border:`1px solid ${theme.border}`}}>No areas assigned yet. Contact your admin.</div>
        : areas.map(area=>{
          const hCount = houses.filter(h=>h.area_id===area.id).length;
          return (
            <div key={area.id} onClick={()=>nav("map")} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:theme.text}}>{area.name}</div>
                <div style={{fontSize:12,color:theme.muted,marginTop:2}}>🏠 {hCount} houses surveyed</div>
              </div>
              <span style={{fontSize:20}}>→</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Users Management Page ────────────────────────────────────────────────────
function UsersPage({ nav, theme, user, toast, bump, refresh, canEdit }) {
  const [users, setUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", employee_id:"", role:"postman", pin:"1234", office_name: user.office_name||"Tensa Post Office" });
  const [saving, setSaving] = useState(false);
  const [assignModal, setAssignModal] = useState(null); // userId
  const [selectedAreas, setSelectedAreas] = useState([]);

  useEffect(() => {
    Promise.all([db.getUsers(), db.getAreas()]).then(([u,a])=>{ setUsers(u||[]); setAreas(a||[]); setLoading(false); });
  }, [refresh]);

  const addUser = async () => {
    if (!form.name||!form.employee_id) { toast("Name and Employee ID required","error"); return; }
    setSaving(true);
    const res = await db.createUser(form);
    if (res) { toast("User created!"); bump(); setShowAdd(false); setForm({name:"",employee_id:"",role:"postman",pin:"1234",office_name:user.office_name||""}); }
    else toast("Error creating user","error");
    setSaving(false);
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete ${u.name}?`)) return;
    await db.deleteUser(u.id); toast("User deleted"); bump();
  };

  const openAssign = (u) => {
    setAssignModal(u);
    const assigned = areas.filter(a=>a.assigned_to===u.id).map(a=>a.id);
    setSelectedAreas(assigned);
  };

  const saveAssign = async () => {
    // Update all areas - assign selected ones to this user, unassign others if they were assigned to this user
    for (const area of areas) {
      if (selectedAreas.includes(area.id)) {
        await db.updateArea(area.id, { assigned_to: assignModal.id });
      } else if (area.assigned_to === assignModal.id) {
        await db.updateArea(area.id, { assigned_to: null });
      }
    }
    toast("Areas assigned!"); bump(); setAssignModal(null);
  };

  const f = k => e => setForm(p=>({...p,[k]:e.target.value}));

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:theme.primary}}>👥 Users</div>
          <div style={{fontSize:12,color:theme.muted}}>Manage postmen & staff</div>
        </div>
        {canEdit && <button onClick={()=>setShowAdd(s=>!s)} style={{background:theme.primary,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add</button>}
      </div>

      {showAdd && canEdit && (
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:14,padding:16,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:theme.text,marginBottom:14}}>New User</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <FormInput label="Full Name *" value={form.name} onChange={f("name")} theme={theme} />
            <FormInput label="Employee ID *" value={form.employee_id} onChange={f("employee_id")} theme={theme} />
            <FormInput label="PIN (4 digits)" value={form.pin} onChange={f("pin")} theme={theme} type="number" />
            <div>
              <div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:5}}>ROLE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {["admin","inspector","postman"].map(r=>(
                  <button key={r} onClick={()=>setForm(p=>({...p,role:r}))} style={{padding:"10px 4px",borderRadius:8,border:`2px solid ${form.role===r?theme.primary:theme.border}`,background:form.role===r?theme.primary+"18":"transparent",color:form.role===r?theme.primary:theme.muted,fontWeight:600,fontSize:12,cursor:"pointer",textTransform:"capitalize"}}>{ROLES[r]}</button>
                ))}
              </div>
            </div>
            <FormInput label="Office Name" value={form.office_name} onChange={f("office_name")} theme={theme} />
            <SaveBtn label="Create User" color={theme.primary} onClick={addUser} saving={saving} />
          </div>
        </div>
      )}

      {loading ? <div style={{textAlign:"center",color:theme.muted,padding:40}}>Loading…</div>
      : users.map(u=>{
        const assignedAreas = areas.filter(a=>a.assigned_to===u.id);
        return (
          <div key={u.id} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`,marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:u.role==="admin"?theme.primary:u.role==="inspector"?"#8b5cf6":theme.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:18,flexShrink:0}}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:theme.text}}>{u.name}</div>
                <div style={{fontSize:11,color:theme.muted}}>{ROLES[u.role]} • ID: {u.employee_id} • PIN: {u.pin}</div>
              </div>
              {canEdit && u.id!==user.id && (
                <button onClick={()=>deleteUser(u)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:theme.danger}}>🗑️</button>
              )}
            </div>
            <div style={{fontSize:12,color:theme.muted,marginBottom:canEdit?8:0}}>
              📍 {assignedAreas.length>0 ? assignedAreas.map(a=>a.name).join(", ") : "No areas assigned"}
            </div>
            {canEdit && u.role==="postman" && (
              <button onClick={()=>openAssign(u)} style={{background:theme.bg,border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:theme.primary,cursor:"pointer"}}>
                Assign Areas
              </button>
            )}
          </div>
        );
      })}

      {/* Assign Modal */}
      {assignModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:theme.card,borderRadius:"20px 20px 0 0",padding:20,width:"100%",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:16,color:theme.text,marginBottom:4}}>Assign Areas</div>
            <div style={{fontSize:13,color:theme.muted,marginBottom:16}}>to {assignModal.name}</div>
            {areas.map(a=>(
              <label key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${theme.border}`,cursor:"pointer"}}>
                <input type="checkbox" checked={selectedAreas.includes(a.id)} onChange={()=>setSelectedAreas(prev=>prev.includes(a.id)?prev.filter(x=>x!==a.id):[...prev,a.id])} style={{width:20,height:20,accentColor:theme.primary}} />
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:theme.text}}>{a.name}</div>
                  {a.assigned_to && a.assigned_to!==assignModal.id && <div style={{fontSize:11,color:theme.danger}}>⚠ Assigned to another postman</div>}
                </div>
              </label>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:16}}>
              <button onClick={()=>setAssignModal(null)} style={{padding:14,borderRadius:12,border:`1px solid ${theme.border}`,background:"transparent",color:theme.muted,fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveAssign} style={{padding:14,borderRadius:12,border:"none",background:theme.primary,color:"#fff",fontWeight:700,cursor:"pointer"}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Areas Page ───────────────────────────────────────────────────────────────
function AreasPage({ nav, theme, user, toast, bump, refresh, canEdit }) {
  const [areas, setAreas] = useState([]);
  const [users, setUsers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", office_name: user.office_name||"" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    Promise.all([db.getAreas(), db.getUsers(), db.getHouses()]).then(([a,u,h])=>{ setAreas(a||[]); setUsers(u||[]); setHouses(h||[]); });
  }, [refresh]);

  const addArea = async () => {
    if (!form.name) { toast("Area name required","error"); return; }
    setSaving(true);
    // Create with map center coords so pin appears immediately
    const res = await db.createArea({ ...form, lat: 22.015, lng: 85.196 });
    if (res) {
      toast("Area created! Go to Map → ✥ Move to position it.");
      bump(); setShowAdd(false); setForm({name:"",office_name:user.office_name||""});
    } else toast("Error","error");
    setSaving(false);
  };

  const saveEditName = async (area) => {
    if (!editName.trim()) { toast("Name cannot be empty","error"); return; }
    await db.updateArea(area.id, { name: editName.trim() });
    toast("Area renamed!"); bump(); setEditingId(null);
  };

  const filtered = areas.filter(a=>a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:theme.primary}}>📍 Areas</div>
          <div style={{fontSize:12,color:theme.muted}}>Beat zones & assignments</div>
        </div>
        {canEdit && <button onClick={()=>setShowAdd(s=>!s)} style={{background:theme.primary,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add</button>}
      </div>

      {showAdd && canEdit && (
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:14,padding:16,marginBottom:16}}>
          <FormInput label="Area Name *" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} theme={theme} />
          <div style={{fontSize:11,color:theme.muted,marginTop:8,marginBottom:4}}>💡 After creating, go to Map → ✥ Move to drag the pin to the correct location.</div>
          <div style={{marginTop:8}}>
            <SaveBtn label="Create Area" color={theme.primary} onClick={addArea} saving={saving} />
          </div>
        </div>
      )}

      <SearchBar value={search} onChange={e=>setSearch(e.target.value)} theme={theme} placeholder="Search areas..." />

      <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(area=>{
          const assignedUser = users.find(u=>u.id===area.assigned_to);
          const hCount = houses.filter(h=>h.area_id===area.id).length;
          const isEditing = editingId === area.id;
          return (
            <div key={area.id} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:8}}>
                {isEditing ? (
                  <div style={{flex:1,display:"flex",gap:8}}>
                    <input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus
                      style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1px solid ${theme.primary}`,background:theme.bg,color:theme.text,fontSize:14,outline:"none"}} />
                    <button onClick={()=>saveEditName(area)} style={{background:theme.primary,color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
                    <button onClick={()=>setEditingId(null)} style={{background:"none",border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 10px",fontSize:12,color:theme.muted,cursor:"pointer"}}>✕</button>
                  </div>
                ) : (
                  <div style={{fontWeight:700,fontSize:14,color:theme.text,flex:1}}>{area.name}</div>
                )}
                {canEdit && !isEditing && (
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setEditingId(area.id);setEditName(area.name);}} style={{background:"none",border:`1px solid ${theme.border}`,borderRadius:8,padding:"4px 8px",fontSize:12,color:theme.primary,cursor:"pointer"}}>✏️</button>
                    <button onClick={async()=>{ if(confirm("Delete area?")) { await db.deleteArea(area.id); bump(); }}} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:theme.danger}}>🗑️</button>
                  </div>
                )}
              </div>
              <div style={{fontSize:12,color:theme.muted,marginBottom:4}}>🏠 {hCount} houses surveyed</div>
              <div style={{fontSize:12,color:assignedUser?theme.primary:theme.muted}}>
                👷 {assignedUser ? assignedUser.name : "Unassigned"}
              </div>
              {area.lat ? (
                <div style={{fontSize:11,color:"#22c55e",marginTop:4}}>📍 Map position set</div>
              ) : (
                <div style={{fontSize:11,color:theme.accent,marginTop:4}}>⚠ No map position — go to Map → ✥ Move</div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !showAdd && (
          <div style={{textAlign:"center",color:theme.muted,fontSize:13,padding:32,background:theme.card,borderRadius:12,border:`1px solid ${theme.border}`}}>
            No areas yet. Tap + to create your first beat area.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Map Page ─────────────────────────────────────────────────────────────────
function MapPage({ nav, theme, refresh, user, toast, bump }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [focusArea, setFocusArea] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const isAdmin = user.role==="admin"||user.role==="inspector";

  useEffect(() => {
    const load = async () => {
      const [a,h] = isAdmin
        ? await Promise.all([db.getAreas(), db.getHouses()])
        : await Promise.all([db.getAreasByUser(user.id), db.getHousesByUser(user.id)]);
      setAreas(a||[]); setHouses(h||[]);
    };
    load();
  }, [refresh]);

  const handleAreaMoved = async (areaId,lat,lng) => {
    await db.updateArea(areaId, { lat, lng });
    setAreas(prev=>prev.map(a=>a.id===areaId?{...a,lat,lng}:a));
    setSavedMsg(true); setTimeout(()=>setSavedMsg(false),2000);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
      <div style={{background:theme.card,borderBottom:`1px solid ${theme.border}`,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0,zIndex:10}}>
        {focusArea ? (
          <>
            <button onClick={()=>setFocusArea(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,color:theme.text}}>{focusArea.name}</div>
              <div style={{fontSize:11,color:theme.muted}}>{houses.filter(h=>h.area_id===focusArea.id).length} houses • tap pin for details</div>
            </div>
            <button onClick={()=>nav("add-house",{areaId:focusArea.id})} style={{background:theme.primary,color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add</button>
          </>
        ) : (
          <>
            <button onClick={()=>nav("dashboard")} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,padding:"0 4px"}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,color:theme.text}}>Beat Map</div>
              <div style={{fontSize:11,color:theme.muted}}>{editMode?"Drag to reposition":"Tap area to see houses"}</div>
            </div>
            {isAdmin && <button onClick={()=>setEditMode(e=>!e)} style={{background:editMode?theme.accent:theme.bg,color:editMode?"#fff":theme.muted,border:`1px solid ${editMode?theme.accent:theme.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{editMode?"✓ Done":"✥ Move"}</button>}
          </>
        )}
      </div>
      {editMode&&!focusArea&&<div style={{background:"#f97316",color:"#fff",padding:"8px 16px",fontSize:12,fontWeight:600,textAlign:"center",flexShrink:0}}>{savedMsg?"✓ Saved!":"Drag markers to reposition — auto-saves"}</div>}
      {focusArea&&(
        <div style={{background:theme.card,borderBottom:`1px solid ${theme.border}`,padding:"8px 16px",display:"flex",gap:12,flexShrink:0,overflowX:"auto"}}>
          {Object.entries(COLOR_MAP).map(([name,hex])=>(
            <div key={name} style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:hex}}/><span style={{fontSize:10,color:theme.muted,textTransform:"capitalize"}}>{name}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{flex:1,position:"relative"}}>
        <LeafletMap areas={areas} houses={houses} focusAreaId={focusArea?.id||null} onAreaClick={a=>{if(!editMode)setFocusArea(a);}} onHouseClick={h=>nav("house-detail",{id:h.id})} onAreaMoved={handleAreaMoved} editMode={editMode} />
        {focusArea&&houses.filter(h=>h.area_id===focusArea.id&&h.gps_lat).length===0&&(
          <div style={{position:"absolute",bottom:80,left:"50%",transform:"translateX(-50%)",background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:"12px 16px",zIndex:500,textAlign:"center",boxShadow:"0 4px 16px rgba(0,0,0,.15)",width:"80%",maxWidth:280}}>
            <div style={{fontSize:20,marginBottom:4}}>📍</div>
            <div style={{fontSize:13,fontWeight:700,color:theme.text,marginBottom:2}}>No GPS data yet</div>
            <div style={{fontSize:11,color:theme.muted}}>Add houses with GPS to see them here</div>
          </div>
        )}
      </div>
     
  );
}

// ─── Add House ────────────────────────────────────────────────────────────────
function AddHouse({ nav, theme, params, toast, bump, user }) {
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const isAdmin = user.role==="admin"||user.role==="inspector";
  const [form, setForm] = useState({
    area_id: params.areaId||"", sub_area:"", house_number:"", owner_name:"",
    mobile_number:"", alternate_number:"", family_size:1,
    address_notes:"", delivery_notes:"", customer_status:"new",
    color_marker:"blue", gps_lat:null, gps_lng:null, photo_url:null,
    assigned_to: user.id,
  });

  useEffect(() => {
    const load = async () => {
      const a = isAdmin ? await db.getAreas() : await db.getAreasByUser(user.id);
      setAreas(a||[]);
    };
    load();
    if (params.editId) {
      db.getHouses().then(all=>{ const h=all?.find(x=>x.id===params.editId); if(h) setForm(h); });
    }
  }, []);

  const captureGPS = () => {
    if (!navigator.geolocation) { toast("GPS not supported","error"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{setForm(f=>({...f,gps_lat:pos.coords.latitude,gps_lng:pos.coords.longitude}));toast("GPS captured!");setGpsLoading(false);},
      err=>{toast("GPS error: "+err.message,"error");setGpsLoading(false);},
      {enableHighAccuracy:true,timeout:10000}
    );
  };

  const handlePhoto = e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader(); r.onloadend=()=>{setForm(f=>({...f,photo_url:r.result}));toast("Photo captured!");}; r.readAsDataURL(file);
  };

  const save = async () => {
    if(!form.area_id){toast("Select an area","error");return;}
    if(!form.house_number){toast("House number required","error");return;}
    if(!form.owner_name){toast("Owner name required","error");return;}
    setSaving(true);
    const now = new Date().toISOString();
    const data = {...form, updated_at:now};
    if(!params.editId) data.created_at = now;
    const res = params.editId ? await db.updateHouse(params.editId, data) : await db.createHouse(data);
    if(res) { toast(params.editId?"Updated!":"House added!"); bump(); nav(params.editId?"house-detail":"dashboard",params.editId?{id:params.editId}:{}); }
    else toast("Error saving","error");
    setSaving(false);
  };

  const f=k=>e=>setForm(p=>({...p,[k]:e.target.value}));

  return (
    <div>
      <PageHeader title={params.editId?"Edit House":"Add House"} onBack={()=>nav("dashboard")} theme={theme}/>
      <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:14}}>
        <FormSelect label="Area *" value={form.area_id} onChange={f("area_id")} theme={theme} options={areas.map(a=>({value:a.id,label:a.name}))} placeholder="Select area..."/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FormInput label="House No. *" value={form.house_number} onChange={f("house_number")} theme={theme}/>
          <FormInput label="Sub Area" value={form.sub_area} onChange={f("sub_area")} theme={theme}/>
        </div>
        <FormInput label="Owner Name *" value={form.owner_name} onChange={f("owner_name")} theme={theme}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FormInput label="Mobile" value={form.mobile_number} onChange={f("mobile_number")} theme={theme} type="tel"/>
          <FormInput label="Alt Mobile" value={form.alternate_number} onChange={f("alternate_number")} theme={theme} type="tel"/>
        </div>
        <FormInput label="Family Size" value={form.family_size} onChange={e=>setForm(p=>({...p,family_size:+e.target.value||1}))} theme={theme} type="number" min={1}/>
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:theme.muted,marginBottom:10}}>CUSTOMER STATUS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Object.entries(STATUS_COLOR).map(([s,c])=>(
              <button key={s} onClick={()=>setForm(p=>({...p,customer_status:s}))} style={{padding:"10px 8px",borderRadius:8,border:`2px solid ${form.customer_status===s?c:theme.border}`,background:form.customer_status===s?c+"20":"transparent",color:form.customer_status===s?c:theme.muted,fontWeight:600,fontSize:13,cursor:"pointer",textTransform:"capitalize"}}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:theme.muted,marginBottom:10}}>MARKER COLOR</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {Object.entries(COLOR_MAP).map(([name,hex])=>(
              <button key={name} onClick={()=>setForm(p=>({...p,color_marker:name}))} style={{width:34,height:34,borderRadius:"50%",background:hex,border:`3px solid ${form.color_marker===name?"#fff":"transparent"}`,outline:form.color_marker===name?`2px solid ${hex}`:"none",cursor:"pointer"}} title={name}/>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={captureGPS} style={{padding:"16px 8px",borderRadius:12,border:`1px solid ${form.gps_lat?"#22c55e":theme.border}`,background:theme.card,color:form.gps_lat?"#22c55e":theme.muted,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontSize:12,fontWeight:600}}>
            {gpsLoading?<span style={{fontSize:20}}>⏳</span>:<span style={{fontSize:20}}>📍</span>}
            {form.gps_lat?"GPS Set ✓":"Capture GPS"}
          </button>
          <label style={{padding:"16px 8px",borderRadius:12,border:`1px solid ${form.photo_url?"#22c55e":theme.border}`,background:theme.card,color:form.photo_url?"#22c55e":theme.muted,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontSize:12,fontWeight:600}}>
            <span style={{fontSize:20}}>📷</span>{form.photo_url?"Photo ✓":"Take Photo"}
            <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhoto}/>
          </label>
        </div>
        <FormTextarea label="Address Notes" value={form.address_notes} onChange={f("address_notes")} theme={theme}/>
        <FormTextarea label="Delivery Notes" value={form.delivery_notes} onChange={f("delivery_notes")} theme={theme}/>
        <SaveBtn label="Save House" color={theme.primary} onClick={save} saving={saving}/>
      </div>
    </div>
  );
}

// ─── Add Business ─────────────────────────────────────────────────────────────
function AddBusiness({ nav, theme, params, toast, bump, user }) {
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);
  const isAdmin = user.role==="admin"||user.role==="inspector";
  const [form, setForm] = useState({
    area_id: params.areaId||"", business_name:"", owner_name:"",
    mobile_number:"", business_type:"shop", interested_services:[],
    follow_up_date:"", remarks:"", assigned_to: user.id,
  });

  useEffect(() => {
    const load = async () => {
      const a = isAdmin ? await db.getAreas() : await db.getAreasByUser(user.id);
      setAreas(a||[]);
    };
    load();
  }, []);

  const services = ["Speed Post","Parcel","Business Parcel","Logistics","Pickup Service","Money Order","PLI / RPLI"];
  const toggleService = s => setForm(f=>({...f,interested_services:f.interested_services.includes(s)?f.interested_services.filter(x=>x!==s):[...f.interested_services,s]}));

  const save = async () => {
    if(!form.area_id){toast("Select an area","error");return;}
    if(!form.business_name){toast("Business name required","error");return;}
    if(!form.owner_name){toast("Owner name required","error");return;}
    setSaving(true);
    const now = new Date().toISOString();
    const res = await db.createBusiness({...form, created_at:now, updated_at:now});
    if(res) { toast("Business added!"); bump(); nav("dashboard"); }
    else toast("Error saving","error");
    setSaving(false);
  };

  const f=k=>e=>setForm(p=>({...p,[k]:e.target.value}));

  return (
    <div>
      <PageHeader title="Add Business" onBack={()=>nav("dashboard")} theme={theme}/>
      <div style={{padding:"0 16px 100px",display:"flex",flexDirection:"column",gap:14}}>
        <FormSelect label="Area *" value={form.area_id} onChange={f("area_id")} theme={theme} options={areas.map(a=>({value:a.id,label:a.name}))} placeholder="Select area..."/>
        <FormInput label="Business Name *" value={form.business_name} onChange={f("business_name")} theme={theme}/>
        <FormInput label="Owner / Contact *" value={form.owner_name} onChange={f("owner_name")} theme={theme}/>
        <FormInput label="Mobile Number" value={form.mobile_number} onChange={f("mobile_number")} theme={theme} type="tel"/>
        <FormSelect label="Business Type" value={form.business_type} onChange={f("business_type")} theme={theme}
          options={["shop","contractor","mining","transport","office","school","medical","hotel","other"].map(t=>({value:t,label:t.charAt(0).toUpperCase()+t.slice(1)}))}/>
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:14}}>
          <div style={{fontSize:12,fontWeight:600,color:theme.muted,marginBottom:10}}>INTERESTED SERVICES</div>
          {services.map(s=>(
            <label key={s} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",cursor:"pointer",borderBottom:`1px solid ${theme.border}`}}>
              <input type="checkbox" checked={form.interested_services.includes(s)} onChange={()=>toggleService(s)} style={{width:18,height:18,accentColor:theme.accent}}/>
              <span style={{fontSize:14,color:theme.text}}>{s}</span>
            </label>
          ))}
        </div>
        <FormInput label="Follow-up Date" value={form.follow_up_date} onChange={f("follow_up_date")} theme={theme} type="date"/>
        <FormTextarea label="Remarks / Notes" value={form.remarks} onChange={f("remarks")} theme={theme}/>
        <SaveBtn label="Save Business" color={theme.accent} onClick={save} saving={saving}/>
      </div>
    </div>
  );
}

// ─── Search Page ──────────────────────────────────────────────────────────────
function SearchPage({ nav, theme, refresh, user }) {
  const [query, setQuery] = useState("");
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const isAdmin = user.role==="admin"||user.role==="inspector";

  useEffect(() => {
    const load = async () => {
      const [h,b] = isAdmin
        ? await Promise.all([db.getHouses(), db.getBusinesses()])
        : await Promise.all([db.getHousesByUser(user.id), db.getBusinessesByUser(user.id)]);
      setHouses(h||[]); setBusinesses(b||[]);
    };
    load();
  }, [refresh]);

  const q = query.toLowerCase();
  const fh = query ? houses.filter(h=>h.owner_name?.toLowerCase().includes(q)||h.house_number?.toLowerCase().includes(q)||h.mobile_number?.includes(q)) : [];
  const fb = query ? businesses.filter(b=>b.business_name?.toLowerCase().includes(q)||b.owner_name?.toLowerCase().includes(q)||b.mobile_number?.includes(q)) : [];

  return (
    <div style={{padding:16}}>
      <div style={{fontSize:22,fontWeight:800,color:theme.primary,marginBottom:16}}>Search</div>
      <SearchBar value={query} onChange={e=>setQuery(e.target.value)} theme={theme} placeholder="Name, phone, house number…" autoFocus/>
      <div style={{marginTop:16}}>
        {query&&fh.length===0&&fb.length===0&&<div style={{textAlign:"center",color:theme.muted,marginTop:40,fontSize:14}}>No results for "{query}"</div>}
        {fh.length>0&&(<div style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:8}}>🏠 HOUSES</div>
          {fh.map(h=>(
            <div key={h.id} onClick={()=>nav("house-detail",{id:h.id})} style={{background:theme.card,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${theme.border}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:600,fontSize:13,color:theme.text}}>{h.owner_name||"Unknown"}</div><div style={{fontSize:11,color:theme.muted}}>House {h.house_number} • {h.mobile_number}</div></div>
              <StatusBadge status={h.customer_status}/>
            </div>
          ))}
        </div>)}
        {fb.length>0&&(<div>
          <div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:8}}>🏪 BUSINESSES</div>
          {fb.map(b=>(
            <div key={b.id} onClick={()=>nav("biz-detail",{id:b.id})} style={{background:theme.card,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${theme.border}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontWeight:600,fontSize:13,color:theme.text}}>{b.business_name}</div><div style={{fontSize:11,color:theme.muted}}>{b.owner_name} • {b.mobile_number}</div></div>
              <span style={{fontSize:11,fontWeight:600,background:theme.accent+"22",color:theme.accent,padding:"3px 8px",borderRadius:6}}>{b.business_type}</span>
            </div>
          ))}
        </div>)}
      </div>
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
function ReportsPage({ nav, theme, refresh, user }) {
  const [areas, setAreas] = useState([]);
  const [houses, setHouses] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    Promise.all([db.getAreas(), db.getHouses(), db.getBusinesses(), db.getUsers()])
      .then(([a,h,b,u])=>{ setAreas(a||[]); setHouses(h||[]); setBusinesses(b||[]); setUsers(u||[]); });
  }, [refresh]);

  const postmen = users.filter(u=>u.role==="postman");

  return (
    <div style={{padding:16}}>
      <div style={{fontSize:22,fontWeight:800,color:theme.primary,marginBottom:4}}>📊 Reports</div>
      <div style={{fontSize:12,color:theme.muted,marginBottom:16}}>Office-wide statistics</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[{label:"Total Houses",value:houses.length,icon:"🏘️"},{label:"Businesses",value:businesses.length,icon:"🏪"},{label:"Areas",value:areas.length,icon:"📍"},{label:"Postmen",value:postmen.length,icon:"👷"}].map(s=>(
          <div key={s.label} style={{background:theme.card,borderRadius:12,padding:14,border:`1px solid ${theme.border}`}}>
            <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
            <div style={{fontSize:22,fontWeight:800,color:theme.text}}>{s.value}</div>
            <div style={{fontSize:11,color:theme.muted}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{background:theme.card,borderRadius:12,border:`1px solid ${theme.border}`,marginBottom:14,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${theme.border}`,fontWeight:700,fontSize:13}}>👷 Postman-wise Summary</div>
        {postmen.length===0
          ? <div style={{padding:20,textAlign:"center",color:theme.muted,fontSize:13}}>No postmen yet</div>
          : postmen.map(p=>{
            const ph=houses.filter(h=>h.assigned_to===p.id).length;
            const pb=businesses.filter(b=>b.assigned_to===p.id).length;
            const pa=areas.filter(a=>a.assigned_to===p.id).length;
            return (
              <div key={p.id} style={{padding:"10px 14px",borderBottom:`1px solid ${theme.border}`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:theme.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14,flexShrink:0}}>{p.name.charAt(0)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:theme.text}}>{p.name}</div>
                  <div style={{fontSize:11,color:theme.muted}}>{pa} areas • {ph} houses • {pb} businesses</div>
                </div>
              </div>
            );
          })
        }
      </div>

      <div style={{background:theme.card,borderRadius:12,border:`1px solid ${theme.border}`,overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${theme.border}`,fontWeight:700,fontSize:13}}>📊 Status Breakdown</div>
        {Object.entries(STATUS_COLOR).map(([s,c])=>{
          const count=houses.filter(h=>h.customer_status===s).length;
          const pct=houses.length?Math.round((count/houses.length)*100):0;
          return (
            <div key={s} style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${theme.border}`}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c}}/><span style={{fontSize:13,flex:1,textTransform:"capitalize",color:theme.text}}>{s}</span>
              <span style={{fontSize:13,fontWeight:700,color:theme.text}}>{count}</span><span style={{fontSize:11,color:theme.muted}}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── House Detail ─────────────────────────────────────────────────────────────
function HouseDetail({ nav, theme, params, toast, bump, user }) {
  const [house, setHouse] = useState(null);
  const [area, setArea] = useState(null);

  useEffect(() => {
    if(!params.id) return;
    db.getHouses().then(all=>{ const h=all?.find(x=>x.id===params.id); setHouse(h||null); if(h) db.getAreas().then(areas=>setArea(areas?.find(a=>a.id===h.area_id))); });
  }, [params.id]);

  const del = async () => {
    if(!confirm("Delete this house?")) return;
    await db.deleteHouse(house.id); toast("Deleted"); bump(); nav("dashboard");
  };

  if(!house) return <div style={{padding:40,textAlign:"center",color:"#888"}}>Loading…</div>;

  return (
    <div>
      <div style={{background:theme.card,borderBottom:`1px solid ${theme.border}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}>
        <button onClick={()=>nav("dashboard")} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <div style={{flex:1,fontSize:17,fontWeight:800,color:theme.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{house.owner_name||"Unknown"}</div>
        <button onClick={()=>nav("add-house",{editId:house.id})} style={{background:"none",border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,color:theme.primary,fontWeight:700}}>Edit</button>
        <button onClick={del} style={{background:"none",border:"none",cursor:"pointer",fontSize:20}}>🗑️</button>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <StatusBadge status={house.customer_status}/>
          <div style={{width:14,height:14,borderRadius:"50%",background:COLOR_MAP[house.color_marker]||"#888",border:"2px solid #fff",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
          <span style={{fontSize:12,color:theme.muted,textTransform:"capitalize"}}>{house.color_marker}</span>
        </div>
        <InfoCard theme={theme}>
          <InfoRow label="Area" value={area?.name||"—"} theme={theme}/>
          <InfoRow label="House No." value={house.house_number} theme={theme}/>
          <InfoRow label="Sub Area" value={house.sub_area||"—"} theme={theme}/>
          <InfoRow label="Family Size" value={house.family_size} theme={theme}/>
        </InfoCard>
        {(house.mobile_number||house.alternate_number)&&(
          <InfoCard theme={theme}>
            {house.mobile_number&&(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${theme.border}`}}>
              <div><div style={{fontSize:11,color:theme.muted}}>MOBILE</div><div style={{fontSize:14,fontWeight:700,color:theme.text}}>{house.mobile_number}</div></div>
              <a href={`tel:${house.mobile_number}`} style={{background:theme.primary,color:"#fff",padding:"8px 14px",borderRadius:8,textDecoration:"none",fontSize:13,fontWeight:700}}>📞 Call</a>
            </div>)}
            {house.alternate_number&&(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
              <div><div style={{fontSize:11,color:theme.muted}}>ALT MOBILE</div><div style={{fontSize:14,fontWeight:700,color:theme.text}}>{house.alternate_number}</div></div>
              <a href={`tel:${house.alternate_number}`} style={{background:theme.primary+"22",color:theme.primary,padding:"8px 14px",borderRadius:8,textDecoration:"none",fontSize:13,fontWeight:700}}>📞 Call</a>
            </div>)}
          </InfoCard>
        )}
        {(house.address_notes||house.delivery_notes)&&(
          <InfoCard theme={theme}>
            {house.address_notes&&<InfoRow label="Address Notes" value={house.address_notes} theme={theme}/>}
            {house.delivery_notes&&<InfoRow label="Delivery Notes" value={house.delivery_notes} theme={theme} border={false}/>}
          </InfoCard>
        )}
        {house.gps_lat&&house.gps_lng&&(
          <a href={`https://maps.google.com?q=${house.gps_lat},${house.gps_lng}`} target="_blank" rel="noreferrer" style={{background:theme.primary+"15",border:`1px solid ${theme.primary}44`,borderRadius:12,padding:14,display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:theme.primary,fontWeight:700,fontSize:14}}>
            📍 View on Google Maps <span style={{fontSize:11,color:theme.muted,fontWeight:400}}>{house.gps_lat?.toFixed(5)}, {house.gps_lng?.toFixed(5)}</span>
          </a>
        )}
        {house.photo_url&&<div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${theme.border}`}}><img src={house.photo_url} alt="House" style={{width:"100%",display:"block"}}/></div>}
        <div style={{fontSize:11,color:theme.muted,textAlign:"center"}}>Added {new Date(house.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

// ─── Biz Detail ───────────────────────────────────────────────────────────────
function BizDetail({ nav, theme, params, toast, bump, user }) {
  const [biz, setBiz] = useState(null);
  const [area, setArea] = useState(null);

  useEffect(() => {
    if(!params.id) return;
    db.getBusinesses().then(all=>{ const b=all?.find(x=>x.id===params.id); setBiz(b||null); if(b) db.getAreas().then(areas=>setArea(areas?.find(a=>a.id===b.area_id))); });
  }, [params.id]);

  const del = async () => {
    if(!confirm("Delete this business?")) return;
    await db.deleteBusiness(biz.id); toast("Deleted"); bump(); nav("dashboard");
  };

  if(!biz) return <div style={{padding:40,textAlign:"center",color:"#888"}}>Loading…</div>;

  return (
    <div>
      <div style={{background:theme.card,borderBottom:`1px solid ${theme.border}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}>
        <button onClick={()=>nav("dashboard")} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button>
        <div style={{flex:1,fontSize:17,fontWeight:800,color:theme.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{biz.business_name}</div>
        <button onClick={del} style={{background:"none",border:"none",cursor:"pointer",fontSize:20}}>🗑️</button>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
        <span style={{background:theme.accent+"22",color:theme.accent,padding:"4px 12px",borderRadius:8,fontSize:12,fontWeight:700,textTransform:"capitalize",alignSelf:"flex-start"}}>{biz.business_type}</span>
        <InfoCard theme={theme}><InfoRow label="Area" value={area?.name||"—"} theme={theme}/><InfoRow label="Owner" value={biz.owner_name} theme={theme} border={false}/></InfoCard>
        {biz.mobile_number&&(<div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:11,color:theme.muted}}>MOBILE</div><div style={{fontSize:16,fontWeight:800,color:theme.text}}>{biz.mobile_number}</div></div>
          <a href={`tel:${biz.mobile_number}`} style={{background:theme.accent,color:"#fff",padding:"10px 16px",borderRadius:10,textDecoration:"none",fontSize:14,fontWeight:700}}>📞 Call</a>
        </div>)}
        {biz.interested_services?.length>0&&(<InfoCard theme={theme}>
          <div style={{fontSize:11,color:theme.muted,marginBottom:8}}>INTERESTED SERVICES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{biz.interested_services.map(s=><span key={s} style={{background:theme.primary+"18",color:theme.primary,padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:600}}>{s}</span>)}</div>
        </InfoCard>)}
        {biz.follow_up_date&&(<div style={{background:"#f59e0b22",border:"1px solid #f59e0b44",borderRadius:12,padding:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📅</span><div><div style={{fontSize:11,color:theme.muted}}>FOLLOW-UP</div><div style={{fontSize:14,fontWeight:700,color:"#f59e0b"}}>{biz.follow_up_date}</div></div>
        </div>)}
        {biz.remarks&&<InfoCard theme={theme}><InfoRow label="Remarks" value={biz.remarks} theme={theme} border={false}/></InfoCard>}
        <div style={{fontSize:11,color:theme.muted,textAlign:"center"}}>Added {new Date(biz.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
function SettingsPage({ nav, theme, user, onLogout, dark, setDark, toast }) {
  return (
    <div>
      <PageHeader title="Settings" onBack={()=>nav("dashboard")} theme={theme}/>
      <div style={{padding:"0 16px 80px",display:"flex",flexDirection:"column",gap:20}}>
        <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:16,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:user.role==="admin"?theme.primary:user.role==="inspector"?"#8b5cf6":theme.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:22}}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:theme.text}}>{user.name}</div>
            <div style={{fontSize:12,color:theme.muted}}>{ROLES[user.role]} • {user.employee_id}</div>
            <div style={{fontSize:11,color:theme.muted}}>{user.office_name}</div>
          </div>
        </div>

        <Sec title="APPEARANCE" theme={theme}>
          <SettingRow icon="🌙" label="Dark Mode" theme={theme}><Toggle checked={dark} onChange={setDark} theme={theme}/></SettingRow>
        </Sec>

        <Sec title="SYNC" theme={theme}>
          <SettingRow icon="🌐" label="Network Status" theme={theme} border={false}>
            <span style={{fontSize:13,color:isOnline()?"#22c55e":"#f97316",fontWeight:600}}>{isOnline()?"Online":"Offline"}</span>
          </SettingRow>
        </Sec>

        <Sec title="ACCOUNT" theme={theme}>
          <SettingRow icon="ℹ️" label="Version" theme={theme}><span style={{fontSize:13,color:theme.muted}}>3.0.0</span></SettingRow>
          <SettingRow icon="🚪" label="Sign Out" theme={theme} onClick={onLogout} border={false}/>
        </Sec>
      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function PageHeader({title,onBack,theme}){return(<div style={{background:theme.card,borderBottom:`1px solid ${theme.border}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}><button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:22}}>←</button><div style={{fontSize:18,fontWeight:800,color:theme.text}}>{title}</div></div>);}
function SectionLabel({theme,children}){return <div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:10,letterSpacing:.5}}>{children}</div>;}
function QuickBtn({theme,color,icon,label,onClick,outline}){return <button onClick={onClick} style={{padding:"16px 12px",borderRadius:14,border:`2px solid ${outline?color+"44":color}`,background:outline?color+"10":color,color:outline?color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{fontSize:20}}>{icon}</span>{label}</button>;}
function StatusBadge({status}){const c=STATUS_COLOR[status]||"#888";return <span style={{background:c+"22",color:c,padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:700,textTransform:"capitalize"}}>{status||"new"}</span>;}
function SearchBar({value,onChange,theme,placeholder,autoFocus}){return(<div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:18}}>🔍</span><input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} style={{width:"100%",padding:"12px 12px 12px 42px",borderRadius:12,border:`1px solid ${theme.border}`,background:theme.card,color:theme.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/></div>);}
function FormInput({label,value,onChange,theme,type="text",min}){return(<div><div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:5}}>{label}</div><input value={value||""} onChange={onChange} type={type} min={min} style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${theme.border}`,background:theme.card,color:theme.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/></div>);}
function FormTextarea({label,value,onChange,theme}){return(<div><div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:5}}>{label}</div><textarea value={value||""} onChange={onChange} rows={3} style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${theme.border}`,background:theme.card,color:theme.text,fontSize:14,outline:"none",boxSizing:"border-box",resize:"vertical"}}/></div>);}
function FormSelect({label,value,onChange,theme,options,placeholder}){return(<div><div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:5}}>{label}</div><select value={value||""} onChange={onChange} style={{width:"100%",padding:"12px",borderRadius:10,border:`1px solid ${theme.border}`,background:theme.card,color:value?theme.text:theme.muted,fontSize:14,outline:"none",boxSizing:"border-box"}}><option value="">{placeholder||"Select…"}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>);}
function SaveBtn({label,color,onClick,saving}){return <button onClick={onClick} disabled={saving} style={{width:"100%",padding:"16px",borderRadius:14,background:color,color:"#fff",border:"none",fontSize:16,fontWeight:800,cursor:saving?"not-allowed":"pointer",opacity:saving?.7:1,marginTop:8}}>{saving?"Saving…":label}</button>;}
function InfoCard({theme,children}){return <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,padding:"4px 14px",overflow:"hidden"}}>{children}</div>;}
function InfoRow({label,value,theme,border=true}){return(<div style={{padding:"10px 0",borderBottom:border?`1px solid ${theme.border}`:"none"}}><div style={{fontSize:11,color:theme.muted,marginBottom:2}}>{label}</div><div style={{fontSize:14,fontWeight:600,color:theme.text}}>{value||"—"}</div></div>);}
function Sec({title,theme,children}){return(<div><div style={{fontSize:11,fontWeight:700,color:theme.muted,marginBottom:8,letterSpacing:.8}}>{title}</div><div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:12,overflow:"hidden"}}>{children}</div></div>);}
function SettingRow({icon,label,sub,children,theme,onClick,border=true}){return(<div onClick={onClick} style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:border?`1px solid ${theme.border}`:"none",cursor:onClick?"pointer":"default"}}><span style={{fontSize:20}}>{icon}</span><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:theme.text}}>{label}</div>{sub&&<div style={{fontSize:11,color:theme.muted}}>{sub}</div>}</div>{children}</div>);}
function Toggle({checked,onChange,theme}){return(<div onClick={()=>onChange(!checked)} style={{width:48,height:26,borderRadius:13,background:checked?theme.primary:theme.border,cursor:"pointer",position:"relative",transition:"background .2s"}}><div style={{position:"absolute",top:3,left:checked?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/></div>);}

