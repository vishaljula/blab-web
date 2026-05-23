/**
 * Seed script — populates the listings table with 200+ realistic
 * Hyderabad properties. Also enables PostGIS and creates spatial indexes.
 *
 * Run: npx tsx src/db/seed.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "./schema";
import type { NewListing } from "./schema";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── Hyderabad neighborhoods with center coordinates ──────────────────────
const NEIGHBORHOODS: { name: string; lat: number; lng: number; premium: boolean }[] = [
  // ── Premium West (IT corridor) ──
  { name: "Gachibowli", lat: 17.4401, lng: 78.3489, premium: true },
  { name: "Jubilee Hills", lat: 17.4325, lng: 78.4073, premium: true },
  { name: "Banjara Hills", lat: 17.4156, lng: 78.4347, premium: true },
  { name: "Madhapur", lat: 17.4474, lng: 78.3762, premium: true },
  { name: "Hi-Tec City", lat: 17.4435, lng: 78.3772, premium: true },
  { name: "Financial District", lat: 17.4260, lng: 78.3340, premium: true },
  { name: "Raidurg", lat: 17.4294, lng: 78.3800, premium: true },
  { name: "Nallagandla", lat: 17.4614, lng: 78.3111, premium: true },
  { name: "Kokapet", lat: 17.4036, lng: 78.3350, premium: true },
  { name: "Narsingi", lat: 17.3895, lng: 78.3564, premium: true },

  // ── Central / North ──
  { name: "Kondapur", lat: 17.4637, lng: 78.3565, premium: false },
  { name: "Kukatpally", lat: 17.4849, lng: 78.3942, premium: false },
  { name: "Miyapur", lat: 17.4967, lng: 78.3506, premium: false },
  { name: "Begumpet", lat: 17.4469, lng: 78.4725, premium: false },
  { name: "Ameerpet", lat: 17.4374, lng: 78.4482, premium: false },
  { name: "Somajiguda", lat: 17.4280, lng: 78.4610, premium: false },
  { name: "Secunderabad", lat: 17.4399, lng: 78.4983, premium: false },
  { name: "Kompally", lat: 17.5374, lng: 78.4837, premium: false },
  { name: "Bolarum", lat: 17.5185, lng: 78.4333, premium: false },
  { name: "Alwal", lat: 17.5043, lng: 78.5023, premium: false },

  // ── East / North-East ──
  { name: "Sainikpuri", lat: 17.4978, lng: 78.5524, premium: false },
  { name: "AS Rao Nagar", lat: 17.4593, lng: 78.5372, premium: false },
  { name: "Uppal", lat: 17.3986, lng: 78.5592, premium: false },
  { name: "Malkajgiri", lat: 17.4564, lng: 78.5064, premium: false },
  { name: "Kapra", lat: 17.4782, lng: 78.5412, premium: false },
  { name: "Nacharam", lat: 17.4251, lng: 78.5472, premium: false },
  { name: "Habsiguda", lat: 17.4108, lng: 78.5315, premium: false },
  { name: "Tarnaka", lat: 17.4283, lng: 78.5238, premium: false },
  { name: "Boduppal", lat: 17.4125, lng: 78.5838, premium: false },
  { name: "Peerzadiguda", lat: 17.4238, lng: 78.5961, premium: false },
  { name: "Ghatkesar", lat: 17.4503, lng: 78.6198, premium: false },

  // ── Central-South ──
  { name: "Manikonda", lat: 17.4069, lng: 78.3891, premium: false },
  { name: "Himayatnagar", lat: 17.3987, lng: 78.4866, premium: false },
  { name: "Malakpet", lat: 17.3780, lng: 78.4965, premium: false },
  { name: "Toli Chowki", lat: 17.3962, lng: 78.4171, premium: false },
  { name: "Mehdipatnam", lat: 17.3942, lng: 78.4401, premium: false },
  { name: "Attapur", lat: 17.3766, lng: 78.4172, premium: false },
  { name: "Nampally", lat: 17.3896, lng: 78.4696, premium: false },
  { name: "Abids", lat: 17.3950, lng: 78.4760, premium: false },
  { name: "Koti", lat: 17.3876, lng: 78.4860, premium: false },

  // ── South (inside ORR) ──
  { name: "Dilsukhnagar", lat: 17.3616, lng: 78.5247, premium: false },
  { name: "LB Nagar", lat: 17.3488, lng: 78.5497, premium: false },
  { name: "Saidabad", lat: 17.3581, lng: 78.4952, premium: false },
  { name: "Santoshnagar", lat: 17.3629, lng: 78.4874, premium: false },
  { name: "Langar Houz", lat: 17.3687, lng: 78.4383, premium: false },
  { name: "Charminar", lat: 17.3616, lng: 78.4747, premium: false },
  { name: "Falaknuma", lat: 17.3432, lng: 78.4637, premium: false },
  { name: "Rajendranagar", lat: 17.3317, lng: 78.4135, premium: false },
  { name: "Upparpally", lat: 17.3560, lng: 78.4018, premium: false },
  { name: "Rethi Bowli", lat: 17.3936, lng: 78.4369, premium: false },

  // ── South (outside ORR) ──
  { name: "Shamshabad", lat: 17.2473, lng: 78.4297, premium: false },
  { name: "Gandipet", lat: 17.3709, lng: 78.3419, premium: false },
  { name: "Kothur", lat: 17.2072, lng: 78.3948, premium: false },
  { name: "Shadnagar", lat: 17.0722, lng: 78.1008, premium: false },
  { name: "Balapur", lat: 17.3222, lng: 78.4872, premium: false },
  { name: "Badangpet", lat: 17.3162, lng: 78.5261, premium: false },
  { name: "Meerpet", lat: 17.3321, lng: 78.5382, premium: false },
  { name: "Hayathnagar", lat: 17.3363, lng: 78.5637, premium: false },
  { name: "Pedda Amberpet", lat: 17.3096, lng: 78.5818, premium: false },

  // ── South-West (outside ORR) ──
  { name: "Mokila", lat: 17.3918, lng: 78.2642, premium: false },
  { name: "Kollur", lat: 17.4212, lng: 78.2793, premium: false },
  { name: "Tellapur", lat: 17.4487, lng: 78.2851, premium: false },
  { name: "Patancheru", lat: 17.5306, lng: 78.2644, premium: false },
  { name: "Bachupally", lat: 17.5367, lng: 78.3742, premium: false },

  // ── North (outside ORR) ──
  { name: "Medchal", lat: 17.6316, lng: 78.4883, premium: false },
  { name: "Shamirpet", lat: 17.5855, lng: 78.5638, premium: false },
  { name: "Keesara", lat: 17.5341, lng: 78.6039, premium: false },

  // ── East (outside ORR) ──
  { name: "Pocharam", lat: 17.4534, lng: 78.6456, premium: false },
  { name: "Aushapur", lat: 17.4073, lng: 78.6382, premium: false },
  { name: "Bibinagar", lat: 17.3946, lng: 78.7955, premium: false },
];

// ── Property configuration ───────────────────────────────────────────────
const PROPERTY_TYPES = ["apartment", "villa", "house", "plot", "commercial"];
const LISTING_TYPES: ("sale" | "rent")[] = ["sale", "rent"];
const LISTER_TYPES: ("owner" | "broker" | "developer")[] = ["owner", "broker", "developer"];

const FIRST_NAMES = [
  "Ravi", "Priya", "Suresh", "Anjali", "Vikram", "Deepa", "Rajesh", "Sunita",
  "Arun", "Kavitha", "Srinivas", "Lakshmi", "Venkat", "Padma", "Krishna",
  "Swathi", "Harish", "Divya", "Ramesh", "Anitha", "Prasad", "Madhavi",
  "Naresh", "Sravani", "Mahesh", "Bhavani", "Ganesh", "Jyothi", "Kiran", "Rani",
];

const LAST_NAMES = [
  "Reddy", "Rao", "Kumar", "Sharma", "Naidu", "Gupta", "Singh", "Patel",
  "Varma", "Chowdary", "Prasad", "Murthy", "Shetty", "Iyer", "Nair",
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(val: number, range: number) {
  return val + (Math.random() - 0.5) * 2 * range;
}

function generateListing(hood: typeof NEIGHBORHOODS[number], index: number): NewListing {
  const propertyType = weightedPick([
    ["apartment", 55],
    ["villa", 12],
    ["house", 15],
    ["plot", 10],
    ["commercial", 8],
  ]);

  const listingType = Math.random() < 0.75 ? "sale" : "rent";
  const listerType = weightedPick([
    ["owner", 40],
    ["broker", 40],
    ["developer", 20],
  ]) as "owner" | "broker" | "developer";

  const premiumMultiplier = hood.premium ? 1.8 : 1;

  let price: number;
  let bedrooms: number | undefined;
  let bathrooms: number | undefined;
  let builtUpArea: number | undefined;
  let plotArea: number | undefined;

  if (listingType === "rent") {
    switch (propertyType) {
      case "apartment":
        bedrooms = rand(1, 3);
        bathrooms = rand(1, bedrooms);
        builtUpArea = rand(600, 2000);
        price = Math.round(rand(12000, 60000) * premiumMultiplier / 500) * 500;
        break;
      case "villa":
        bedrooms = rand(3, 5);
        bathrooms = rand(3, 5);
        builtUpArea = rand(2500, 5000);
        price = Math.round(rand(50000, 150000) * premiumMultiplier / 1000) * 1000;
        break;
      case "house":
        bedrooms = rand(2, 4);
        bathrooms = rand(2, 3);
        builtUpArea = rand(1200, 3000);
        price = Math.round(rand(20000, 80000) * premiumMultiplier / 500) * 500;
        break;
      case "commercial":
        builtUpArea = rand(500, 5000);
        price = Math.round(rand(30000, 200000) * premiumMultiplier / 1000) * 1000;
        break;
      default: // plot — no rent for plots, make it an apartment
        bedrooms = rand(1, 2);
        bathrooms = 1;
        builtUpArea = rand(600, 1000);
        price = Math.round(rand(10000, 25000) * premiumMultiplier / 500) * 500;
        break;
    }
  } else {
    // Sale prices
    switch (propertyType) {
      case "apartment":
        bedrooms = rand(1, 4);
        bathrooms = rand(1, Math.min(bedrooms + 1, 4));
        builtUpArea = rand(600, 2500);
        price = Math.round(rand(2500000, 15000000) * premiumMultiplier / 100000) * 100000;
        break;
      case "villa":
        bedrooms = rand(3, 6);
        bathrooms = rand(3, 6);
        builtUpArea = rand(2500, 6000);
        price = Math.round(rand(15000000, 80000000) * premiumMultiplier / 500000) * 500000;
        break;
      case "house":
        bedrooms = rand(2, 4);
        bathrooms = rand(2, 4);
        builtUpArea = rand(1200, 3500);
        price = Math.round(rand(5000000, 25000000) * premiumMultiplier / 500000) * 500000;
        break;
      case "plot":
        plotArea = rand(1000, 5000);
        price = Math.round(rand(2000000, 20000000) * premiumMultiplier / 500000) * 500000;
        break;
      case "commercial":
        builtUpArea = rand(500, 10000);
        price = Math.round(rand(10000000, 100000000) * premiumMultiplier / 1000000) * 1000000;
        break;
    }
  }

  return {
    latitude: jitter(hood.lat, 0.018),   // ~2km spread around center
    longitude: jitter(hood.lng, 0.018),
    price: price!,
    propertyType,
    listingType,
    listerType,
    bedrooms: bedrooms ?? null,
    bathrooms: bathrooms ?? null,
    builtUpArea: builtUpArea ?? null,
    plotArea: plotArea ?? null,
    address: hood.name,
    city: "Hyderabad",
    imageUrl: null,
    contactName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  };
}

function weightedPick(options: [string, number][]): string {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r <= 0) return value;
  }
  return options[0][0];
}

async function seed() {
  console.log("🌱 Starting seed...\n");

  // Enable PostGIS extension
  console.log("📍 Enabling PostGIS...");
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;

  // Push schema first (tables + indexes)
  console.log("📋 Clearing existing listings...");
  await sql`DELETE FROM listings`;

  // Generate 200+ listings (6-8 per neighborhood)
  const allListings: NewListing[] = [];
  for (const hood of NEIGHBORHOODS) {
    const count = hood.premium ? rand(10, 15) : rand(6, 10);
    for (let i = 0; i < count; i++) {
      allListings.push(generateListing(hood, i));
    }
  }

  console.log(`📦 Inserting ${allListings.length} listings...`);

  // Insert in batches of 50
  for (let i = 0; i < allListings.length; i += 50) {
    const batch = allListings.slice(i, i + 50);
    await db.insert(listings).values(batch);
    console.log(`   Batch ${Math.floor(i / 50) + 1}: ${batch.length} listings`);
  }

  // Create PostGIS spatial index using raw SQL
  console.log("🗺️  Creating spatial index...");
  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_listings_spatial
    ON listings USING GiST (
      CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography)
    )
  `, []);

  console.log(`\n✅ Seeded ${allListings.length} listings across ${NEIGHBORHOODS.length} neighborhoods!`);

  // Print summary
  const saleCount = allListings.filter(l => l.listingType === "sale").length;
  const rentCount = allListings.filter(l => l.listingType === "rent").length;
  console.log(`   📊 ${saleCount} for sale, ${rentCount} for rent`);
  console.log(`   🏠 Property types: ${[...new Set(allListings.map(l => l.propertyType))].join(", ")}`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
