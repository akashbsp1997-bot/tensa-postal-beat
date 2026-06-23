// ─── Supabase Client ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://shbeodccicserfvwcphw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoYmVvZGNjaWNzZXJmdndjcGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDkwMTcsImV4cCI6MjA5NzcyNTAxN30.ubVpiyTpCnc7nVYFNyBwQEeZny5AS7RpataVDaRTUAw";

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation",
};

async function sb(method, table, { body, query = "" } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Supabase error:", err);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error("Network error:", e);
    return null;
  }
}

export const db = {
  // Users
  getUsers: () => sb("GET", "users", { query: "?order=name" }),
  getUsersByRole: (role) => sb("GET", "users", { query: `?role=eq.${role}&order=name` }),
  createUser: (data) => sb("POST", "users", { body: data }),
  updateUser: (id, data) => sb("PATCH", "users", { body: data, query: `?id=eq.${id}` }),
  deleteUser: (id) => sb("DELETE", "users", { query: `?id=eq.${id}` }),

  // Areas
  getAreas: () => sb("GET", "areas", { query: "?order=name" }),
  getAreasByUser: (userId) => sb("GET", "areas", { query: `?assigned_to=eq.${userId}&order=name` }),
  createArea: (data) => sb("POST", "areas", { body: data }),
  updateArea: (id, data) => sb("PATCH", "areas", { body: data, query: `?id=eq.${id}` }),
  deleteArea: (id) => sb("DELETE", "areas", { query: `?id=eq.${id}` }),

  // Houses
  getHouses: () => sb("GET", "houses", { query: "?order=created_at.desc" }),
  getHousesByArea: (areaId) => sb("GET", "houses", { query: `?area_id=eq.${areaId}&order=created_at.desc` }),
  getHousesByUser: (userId) => sb("GET", "houses", { query: `?assigned_to=eq.${userId}&order=created_at.desc` }),
  createHouse: (data) => sb("POST", "houses", { body: data }),
  updateHouse: (id, data) => sb("PATCH", "houses", { body: data, query: `?id=eq.${id}` }),
  deleteHouse: (id) => sb("DELETE", "houses", { query: `?id=eq.${id}` }),

  // Businesses
  getBusinesses: () => sb("GET", "businesses", { query: "?order=created_at.desc" }),
  getBusinessesByArea: (areaId) => sb("GET", "businesses", { query: `?area_id=eq.${areaId}&order=created_at.desc` }),
  getBusinessesByUser: (userId) => sb("GET", "businesses", { query: `?assigned_to=eq.${userId}&order=created_at.desc` }),
  createBusiness: (data) => sb("POST", "businesses", { body: data }),
  updateBusiness: (id, data) => sb("PATCH", "businesses", { body: data, query: `?id=eq.${id}` }),
  deleteBusiness: (id) => sb("DELETE", "businesses", { query: `?id=eq.${id}` }),

  // Followups
  getFollowups: (userId) => sb("GET", "followups", { query: `?assigned_to=eq.${userId}&completed=eq.false&order=follow_up_date` }),
  getAllFollowups: () => sb("GET", "followups", { query: "?completed=eq.false&order=follow_up_date" }),
  createFollowup: (data) => sb("POST", "followups", { body: data }),
  updateFollowup: (id, data) => sb("PATCH", "followups", { body: data, query: `?id=eq.${id}` }),

  // Deliveries
  getDeliveries: (userId) => sb("GET", "deliveries", { query: `?postman_id=eq.${userId}&order=created_at.desc` }),
  createDelivery: (data) => sb("POST", "deliveries", { body: data }),
  updateDelivery: (id, data) => sb("PATCH", "deliveries", { body: data, query: `?id=eq.${id}` }),

  // Articles
  getArticles: () => sb("GET", "articles", { query: "?order=created_at.desc" }),
  getArticlesByArea: (areaId) => sb("GET", "articles", { query: `?area_id=eq.${areaId}&status=eq.scanned&order=created_at.desc` }),
  getArticlesByDateRange: (startDate, endDate) => sb("GET", "articles", { query: `?created_at=gte.${startDate}&created_at=lt.${endDate}&status=eq.scanned&order=created_at.desc` }),
  getArticleByBarcode: (barcode) => sb("GET", "articles", { query: `?barcode=eq.${barcode}` }),
  createArticle: (data) => sb("POST", "articles", { body: data }),
  updateArticle: (id, data) => sb("PATCH", "articles", { body: data, query: `?id=eq.${id}` }),
  deleteArticle: (id) => sb("DELETE", "articles", { query: `?id=eq.${id}` }),

  // Delivery Proofs
  createDeliveryProof: (data) => sb("POST", "delivery_proofs", { body: data }),
  getDeliveryProofs: (articleId) => sb("GET", "delivery_proofs", { query: `?article_id=eq.${articleId}` }),
};


export const isOnline = () => navigator.onLine;
