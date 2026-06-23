import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export const isOnline = () => navigator.onLine;

const handle = async (query) => {
  const { data, error } = await query;

  if (error) {
    console.error(error);
    return null;
  }

  return data;
};

export const db = {
  // =========================
  // USERS
  // =========================

  getUsers: async () =>
    handle(
      supabase
        .from("users")
        .select("*")
        .order("name")
    ),

  getUser: async (id) =>
    handle(
      supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single()
    ),

  createUser: async (user) =>
    handle(
      supabase
        .from("users")
        .insert([user])
        .select()
        .single()
    ),

  updateUser: async (id, updates) =>
    handle(
      supabase
        .from("users")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteUser: async (id) =>
    handle(
      supabase
        .from("users")
        .delete()
        .eq("id", id)
    ),

  // =========================
  // AREAS
  // =========================

  getAreas: async () =>
    handle(
      supabase
        .from("areas")
        .select("*")
        .order("name")
    ),

  getArea: async (id) =>
    handle(
      supabase
        .from("areas")
        .select("*")
        .eq("id", id)
        .single()
    ),

  getAreasByUser: async (userId) =>
    handle(
      supabase
        .from("areas")
        .select("*")
        .eq("assigned_to", userId)
        .order("name")
    ),

  createArea: async (area) =>
    handle(
      supabase
        .from("areas")
        .insert([area])
        .select()
        .single()
    ),

  updateArea: async (id, updates) =>
    handle(
      supabase
        .from("areas")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteArea: async (id) =>
    handle(
      supabase
        .from("areas")
        .delete()
        .eq("id", id)
    ),

  // =========================
  // HOUSES
  // =========================

  getHouses: async () =>
    handle(
      supabase
        .from("houses")
        .select("*")
        .order("created_at", { ascending: false })
    ),

  getHouse: async (id) =>
    handle(
      supabase
        .from("houses")
        .select("*")
        .eq("id", id)
        .single()
    ),

  getHousesByUser: async (userId) =>
    handle(
      supabase
        .from("houses")
        .select("*")
        .eq("assigned_to", userId)
        .order("created_at", { ascending: false })
    ),

  getHousesByArea: async (areaId) =>
    handle(
      supabase
        .from("houses")
        .select("*")
        .eq("area_id", areaId)
        .order("house_number")
    ),

  createHouse: async (house) =>
    handle(
      supabase
        .from("houses")
        .insert([house])
        .select()
        .single()
    ),

  updateHouse: async (id, updates) =>
    handle(
      supabase
        .from("houses")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteHouse: async (id) =>
    handle(
      supabase
        .from("houses")
        .delete()
        .eq("id", id)
    ),

  // =========================
  // BUSINESSES
  // =========================

  getBusinesses: async () =>
    handle(
      supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
    ),

  getBusiness: async (id) =>
    handle(
      supabase
        .from("businesses")
        .select("*")
        .eq("id", id)
        .single()
    ),

  getBusinessesByUser: async (userId) =>
    handle(
      supabase
        .from("businesses")
        .select("*")
        .eq("assigned_to", userId)
        .order("created_at", { ascending: false })
    ),

  getBusinessesByArea: async (areaId) =>
    handle(
      supabase
        .from("businesses")
        .select("*")
        .eq("area_id", areaId)
        .order("business_name")
    ),

  createBusiness: async (business) =>
    handle(
      supabase
        .from("businesses")
        .insert([business])
        .select()
        .single()
    ),

  updateBusiness: async (id, updates) =>
    handle(
      supabase
        .from("businesses")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteBusiness: async (id) =>
    handle(
      supabase
        .from("businesses")
        .delete()
        .eq("id", id)
    ),

  // =========================
  // FOLLOWUPS
  // =========================

  getFollowups: async () =>
    handle(
      supabase
        .from("followups")
        .select("*")
        .order("due_date")
    ),

  createFollowup: async (followup) =>
    handle(
      supabase
        .from("followups")
        .insert([followup])
        .select()
        .single()
    ),

  updateFollowup: async (id, updates) =>
    handle(
      supabase
        .from("followups")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteFollowup: async (id) =>
    handle(
      supabase
        .from("followups")
        .delete()
        .eq("id", id)
    ),

  // =========================
  // DELIVERIES
  // =========================

  getDeliveries: async () =>
    handle(
      supabase
        .from("deliveries")
        .select("*")
        .order("created_at", { ascending: false })
    ),

  createDelivery: async (delivery) =>
    handle(
      supabase
        .from("deliveries")
        .insert([delivery])
        .select()
        .single()
    ),

  updateDelivery: async (id, updates) =>
    handle(
      supabase
        .from("deliveries")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
    ),

  deleteDelivery: async (id) =>
    handle(
      supabase
        .from("deliveries")
        .delete()
        .eq("id", id)
    ),
};

export default db;