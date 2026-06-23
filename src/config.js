// ─────────────────────────────────────────────────────────────────
//  TENSA BEAT — App Configuration
//  Edit this file on GitHub to update the app without coding.
//  Changes go live automatically after GitHub Actions deploys.
// ─────────────────────────────────────────────────────────────────

const CONFIG = {

  // ── Branding ──────────────────────────────────────────────────
  app: {
    title: "Tensa Beat",
    subtitle: "Postal Beat Manager",
    icon: "🏮",
    version: "2.1.0",
    primaryColor: "#4f6ef7",
    accentColor: "#f97316",
  },

  // ── Features (true = on, false = off) ────────────────────────
  features: {
    map: true,
    businesses: true,
    followups: true,
    reports: true,
    photoCapture: true,
    gpsCapture: true,
    csvExport: true,
    darkMode: true,
    search: true,
  },

  // ── Customer Status Types ─────────────────────────────────────
  // Each status: { label, color }
  statuses: [
    { id: "existing", label: "Existing",  color: "#22c55e" },
    { id: "prospect", label: "Prospect",  color: "#f59e0b" },
    { id: "new",      label: "New",       color: "#3b82f6" },
    { id: "closed",   label: "Closed",    color: "#6b7280" },
  ],

  // ── Marker Colors ─────────────────────────────────────────────
  markerColors: [
    { id: "blue",   hex: "#3b82f6" },
    { id: "green",  hex: "#22c55e" },
    { id: "red",    hex: "#ef4444" },
    { id: "yellow", hex: "#eab308" },
    { id: "purple", hex: "#a855f7" },
    { id: "orange", hex: "#f97316" },
  ],

  // ── Business Types ────────────────────────────────────────────
  businessTypes: [
    "shop", "contractor", "mining", "transport",
    "office", "school", "medical", "hotel", "other"
  ],

  // ── India Post Services ───────────────────────────────────────
  services: [
    "Speed Post",
    "Parcel",
    "Business Parcel",
    "Logistics",
    "Pickup Service",
    "Money Order",
    "PLI / RPLI",
  ],

  // ── Beat Areas ────────────────────────────────────────────────
  // lat/lng = default map position (drag to reposition inside app)
  areas: [
    { name: "Block A",                    lat: 22.0150, lng: 85.1950 },
    { name: "Block B",                    lat: 22.0160, lng: 85.1970 },
    { name: "Block C",                    lat: 22.0140, lng: 85.1930 },
    { name: "Block D",                    lat: 22.0130, lng: 85.1960 },
    { name: "Jagannath Mandir Area",      lat: 22.0170, lng: 85.1980 },
    { name: "Sarala Temple Area",         lat: 22.0180, lng: 85.1940 },
    { name: "Post Office Backside Area",  lat: 22.0145, lng: 85.1955 },
    { name: "GEL Church Area",            lat: 22.0165, lng: 85.1935 },
    { name: "Dhobitanki Area",            lat: 22.0155, lng: 85.1945 },
    { name: "BSNL Tower Area",            lat: 22.0175, lng: 85.1965 },
    { name: "Government Medical Area",    lat: 22.0135, lng: 85.1975 },
    { name: "Prospecting Camp Area",      lat: 22.0125, lng: 85.1985 },
    { name: "Bahamba Area",               lat: 22.0115, lng: 85.1925 },
    { name: "Tantra Area",                lat: 22.0105, lng: 85.1915 },
    { name: "Zero Point Area",            lat: 22.0195, lng: 85.1905 },
    { name: "CRPF Camp Quarters Area",    lat: 22.0185, lng: 85.1895 },
    { name: "SAIL & CRP Office Area",     lat: 22.0200, lng: 85.1885 },
    { name: "Jindal Plant Area",          lat: 22.0095, lng: 85.2010 },
    { name: "Geetarani Mines Area",       lat: 22.0085, lng: 85.2020 },
    { name: "Panchayat Office Area",      lat: 22.0210, lng: 85.1875 },
    { name: "Parking Area",               lat: 22.0220, lng: 85.1865 },
    { name: "Police Station Basti Area",  lat: 22.0230, lng: 85.1855 },
  ],

};

export default CONFIG;
