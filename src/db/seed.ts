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
const LISTER_TYPES: ("owner" | "realtor" | "developer")[] = ["owner", "realtor", "developer"];

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

// Professional portrait photos from randomuser.me — reliable, free, diverse
// We use a fixed pool so re-seeds are consistent.
// randomuser.me uses the same numeric range (1-35) for both genders.
// Kept as separate constants so the pools can diverge without a refactor.
const MALE_PHOTO_IDS   = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35];
const FEMALE_PHOTO_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35];

const MALE_FIRST_NAMES   = ["Ravi","Suresh","Vikram","Rajesh","Arun","Srinivas","Venkat","Krishna","Harish","Ramesh","Prasad","Naresh","Mahesh","Ganesh","Kiran"];
const FEMALE_FIRST_NAMES = ["Priya","Anjali","Deepa","Sunita","Kavitha","Lakshmi","Padma","Swathi","Divya","Anitha","Madhavi","Sravani","Bhavani","Jyothi","Rani"];

function pickContactPhoto(firstName: string, idx: number): string {
  const isFemale = FEMALE_FIRST_NAMES.includes(firstName);
  const pool = isFemale ? FEMALE_PHOTO_IDS : MALE_PHOTO_IDS;
  const photoId = pool[idx % pool.length];
  const gender = isFemale ? "women" : "men";
  return `https://randomuser.me/api/portraits/${gender}/${photoId}.jpg`;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(val: number, range: number) {
  return val + (Math.random() - 0.5) * 2 * range;
}

function generateFeaturesAndDescription(
  propertyType: string,
  hoodName: string,
  bedrooms: number | undefined,
  price: number,
  listingType: string
) {
  const yearBuilt = rand(2015, 2025);
  const maintenance = propertyType === "plot" ? 0 : Math.round(rand(1500, 8000) / 100) * 100;
  const marketEstimate = Math.round(price * (0.95 + Math.random() * 0.1));

  let description = "";
  let features: any = {};

  const appliances = ["Ceiling Fan(s)", "Exhaust Fan", "LED Lighting", "Chimney", "Water Heater", "Water Softener"];
  const selectedAppliances = appliances.filter(() => Math.random() > 0.4);

  const amenities = ["Gated Community", "24/7 Security", "Power Backup", "Gymnasium", "Swimming Pool", "Clubhouse", "Children's Play Area"];
  const selectedAmenities = amenities.filter(() => Math.random() > 0.4);

  if (propertyType === "apartment") {
    description = `Beautifully designed ${bedrooms || 3} BHK apartment located in the heart of ${hoodName}. This spacious property features excellent ventilation, modular kitchen, chimney, large balconies, and high-quality wardrobes. It offers easy connectivity to the IT corridor, schools, and shopping malls. Residents enjoy access to prime amenities including a gym, swimming pool, club house, and dedicated parking. Perfect for modern living.`;
    features = {
      interior: {
        flooring: "Vitrified Tiles",
        powerBackup: "100% DG Backup",
        security: "Intercom & CCTV, 24/7 Security",
      },
      appliances: selectedAppliances,
      amenities: selectedAmenities,
      hoa_maintenance: {
        maintenance_fee: maintenance,
      },
    };
  } else if (propertyType === "villa") {
    description = `Luxurious ${bedrooms || 4} BHK independent villa situated in a premium gated community at ${hoodName}. Crafted with exceptional detail, this villa boasts a double-height living room, private garden, modular kitchen with helper's quarters, high-end marble flooring, and spacious bedrooms with walk-in closets. Top-tier community with continuous water supply, solar water heaters, club amenities, and biometric security.`;
    features = {
      interior: {
        flooring: "Italian Marble",
        powerBackup: "100% DG Backup",
        security: "Biometric Access, CCTV, 24/7 Patrol",
      },
      appliances: [...selectedAppliances, "Modular Kitchen Hob & Chimney", "Dishwasher"],
      amenities: [...selectedAmenities, "Private Garden", "Tennis Court", "Mini Theatre"],
      hoa_maintenance: {
        maintenance_fee: maintenance,
      },
    };
  } else if (propertyType === "house") {
    description = `Cozy ${bedrooms || 3} BHK independent house in ${hoodName}. Features spacious layout spread across multiple floors, personal terrace, private car garage, and independent borewell. Located in a peaceful residential neighborhood close to supermarkets, top educational institutions, and public transit. Ideal for families seeking space and privacy.`;
    features = {
      interior: {
        flooring: "Granite",
        powerBackup: "Inverter Provision",
        security: "Independent Gate",
      },
      appliances: selectedAppliances,
      amenities: ["Terrace Garden", "Borewell Water", "Corporation Water Connection"],
      hoa_maintenance: {
        maintenance_fee: maintenance,
      },
    };
  } else if (propertyType === "plot") {
    description = `Excellent residential plot measuring ${bedrooms ? bedrooms + ' sq yards' : '300 sq yards'} in the fast-growing location of ${hoodName}. Clear title property, HMDA approved layout with wide internal roads, underground drainage, and electricity connection. Surrounded by upcoming premium residential villas. Excellent long-term investment opportunity.`;
    features = {
      interior: {},
      appliances: [],
      amenities: ["Water Pipeline Connection", "Street Lights", "Rainwater Harvesting Pit"],
      hoa_maintenance: {
        maintenance_fee: 0,
      },
    };
  } else {
    description = `Spacious commercial space suitable for retail showroom, corporate office, or IT firm in primary commercial hub of ${hoodName}. Equipped with centralized air conditioning provision, high-speed elevator, fire safety features, private restrooms, pantry space, and ample reserved parking for visitors and staff. Ready to occupy.`;
    features = {
      interior: {
        flooring: "Commercial Tile/Bare Shell",
        powerBackup: "100% DG Backup with Auto-Sync",
        security: "Fire Alarm, Sprinklers, 24/7 Security",
      },
      appliances: ["Fire Extinguishers", "CCTV Cameras"],
      amenities: ["Reserved Parking", "High Speed Elevator", "Pantry Area"],
      hoa_maintenance: {
        maintenance_fee: maintenance,
      },
    };
  }

  return { yearBuilt, maintenance, marketEstimate, description, features };
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
    ["realtor", 40],
    ["developer", 20],
  ]) as "owner" | "realtor" | "developer";

  // Pick a name consistent with gender pools so photo matches
  const isFemale = Math.random() < 0.4;
  const firstName = isFemale ? pick(FEMALE_FIRST_NAMES) : pick(MALE_FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const contactName = `${firstName} ${lastName}`;
  const contactPhotoUrl = pickContactPhoto(firstName, index);  // all types get a photo
  // Indian mobile: +91 followed by 9XXXXXXXXX (10-digit, starts with 9/8/7/6)
  const mobilePrefix = ["6", "7", "8", "9"][Math.floor(Math.random() * 4)];
  const mobileRest = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  const contactPhone = `+91${mobilePrefix}${mobileRest}`;

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

  const details = generateFeaturesAndDescription(propertyType, hood.name, bedrooms, price!, listingType);

  // Realistic listing status distribution for seed data:
  // 80% active (visible in search), 12% closed, 8% expired
  const statusRoll = Math.random();
  const status = statusRoll < 0.80 ? "active" : statusRoll < 0.92 ? "closed" : "expired";

  return {
    latitude: jitter(hood.lat, 0.018),
    longitude: jitter(hood.lng, 0.018),
    price: price!,
    propertyType,
    listingType,
    listerType,
    status: status as "active" | "closed" | "expired",
    bedrooms: bedrooms ?? null,
    bathrooms: bathrooms ?? null,
    builtUpArea: builtUpArea ?? null,
    plotArea: plotArea ?? null,
    address: hood.name,
    city: "Hyderabad",
    imageUrl: null,
    contactName,
    contactPhone,
    contactPhotoUrl,
    description: details.description,
    yearBuilt: details.yearBuilt,
    maintenance: details.maintenance,
    features: details.features,
    marketEstimate: details.marketEstimate,
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

  // ── Listings ─────────────────────────────────────────────────────────────
  console.log("📋 Clearing existing listings...");
  await sql`DELETE FROM listings`;

  const allListings: NewListing[] = [];
  for (const hood of NEIGHBORHOODS) {
    const count = hood.premium ? rand(10, 15) : rand(6, 10);
    for (let i = 0; i < count; i++) {
      allListings.push(generateListing(hood, i));
    }
  }

  console.log(`📦 Inserting ${allListings.length} listings...`);
  for (let i = 0; i < allListings.length; i += 50) {
    const batch = allListings.slice(i, i + 50);
    await db.insert(listings).values(batch);
    console.log(`   Batch ${Math.floor(i / 50) + 1}: ${batch.length} listings`);
  }

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_listings_spatial
    ON listings USING GiST (
      CAST(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geography)
    )
  `, []);

  console.log(`\n✅ Seeded ${allListings.length} listings across ${NEIGHBORHOODS.length} neighborhoods!`);

  // ── Realtors ──────────────────────────────────────────────────────────────
  // Programmatic generation — proportional to listings, spread across neighborhoods.
  //
  // Coverage strategy (intentional gaps = no-realtor path testing):
  //   Premium neighborhoods (10) : ALWAYS covered — 2–3 realtors each
  //   Non-premium neighborhoods  : 45% chance of coverage — 1–2 realtors each
  //   Remaining ~33 hoods        : 0 realtors (tests graceful empty-state handling)
  //
  // Tier distribution: 10% Pro+ | 22% Pro | 44% Trial | 24% SoftCap
  // Target: ~55 realtors for 633 listings → ~1:11 ratio (healthy market)
  console.log("\n👔 Seeding realtors...");

  const { encrypt, hashString } = await import("./../../src/lib/crypto");

  // ── Deterministic seeding helpers ───────────────────────────────────────
  // Use a simple LCG so each run produces the same realtors (reproducible).
  let _seed = 9001;
  function seededRand(): number {
    _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
    return ((_seed >>> 0) / 0xffffffff);
  }
  function seededChoice<T>(arr: readonly T[]): T {
    return arr[Math.floor(seededRand() * arr.length)];
  }
  function seededInt(min: number, max: number): number {
    return min + Math.floor(seededRand() * (max - min + 1));
  }

  const LANG_POOLS: Record<string, string[][]> = {
    west:    [["Telugu","English","Hindi"], ["Telugu","English"], ["Telugu","Kannada","English"]],
    central: [["Telugu","Urdu","English"],  ["Telugu","Hindi"],   ["Telugu","English"]],
    east:    [["Telugu","Urdu"],            ["Telugu","English"], ["Telugu","Tamil"]],
    south:   [["Telugu","Urdu"],            ["Telugu","Tamil"],   ["Telugu","Malayalam","English"]],
    north:   [["Telugu","Hindi","English"], ["Hindi","Telugu"],   ["Telugu","English"]],
    outer:   [["Telugu","English"],         ["Telugu","Hindi"],   ["Telugu"]],
  };

  const COMPANY_SUFFIXES = [
    "Properties", "Realty", "Homes", "Estates", "Real Estate",
    "Land & Homes", "Infra", "Ventures", "Realtors", "Associates",
  ];

  const BIO_TEMPLATES = [
    (hood: string, yrs: number) => `${yrs} years in ${hood} real estate. Specialised in apartments and villas.`,
    (hood: string, yrs: number) => `Helping families find their dream home in ${hood} since ${new Date().getFullYear() - yrs}.`,
    (hood: string, yrs: number) => `${hood} area expert. ${yrs} years experience across sale and rental markets.`,
    (hood: string, yrs: number) => `Trusted ${hood} realtor. ${yrs}+ years of market knowledge at your service.`,
    (hood: string, yrs: number) => `Your go-to agent for ${hood} and surrounding areas. ${yrs} years on the ground.`,
  ];

  function neighborhoodRegion(hood: { name: string; lat: number; lng: number }): string {
    if (hood.lng < 78.36) return "west";
    if (hood.lng > 78.55) return "east";
    if (hood.lat > 17.50) return "north";
    if (hood.lat < 17.37) return "south";
    if (hood.lng < 78.45) return "central";
    return "outer";
  }

  function pickTier(): "pro_plus" | "pro" | "free_trial" | "soft_cap" {
    const r = seededRand();
    if (r < 0.10) return "pro_plus";
    if (r < 0.32) return "pro";
    if (r < 0.76) return "free_trial";
    return "soft_cap";
  }

  function scoreForTier(tier: string) {
    if (tier === "pro_plus") {
      const resp  = seededInt(140, 200);
      const speed = seededInt(120, 200);
      const act   = seededInt(100, 200);
      const rev   = seededInt(80, 200);
      const prof  = seededInt(70, 100);
      const ten   = seededInt(50, 99);
      return { tierBase: 10000, resp, speed, act, rev, prof, ten,
               score: 10000 + resp + speed + act + rev + prof + ten,
               yearsExp: seededInt(7, 20), activeListings: seededInt(3, 8),
               maxCapacity: seededInt(11, 15) };
    }
    if (tier === "pro") {
      const resp  = seededInt(70, 140);
      const speed = seededInt(50, 140);
      const act   = seededInt(40, 130);
      const rev   = seededInt(20, 130);
      const prof  = seededInt(50, 90);
      const ten   = seededInt(20, 70);
      return { tierBase: 5000, resp, speed, act, rev, prof, ten,
               score: 5000 + resp + speed + act + rev + prof + ten,
               yearsExp: seededInt(3, 12), activeListings: seededInt(1, 4),
               maxCapacity: seededInt(5, 9) };
    }
    if (tier === "free_trial") {
      const resp  = seededInt(0, 40);
      const speed = seededInt(0, 30);
      const prof  = seededInt(20, 60);
      const ten   = seededInt(0, 15);
      return { tierBase: 1000, resp, speed, act: 0, rev: 0, prof, ten,
               score: 1000 + resp + speed + prof + ten,
               yearsExp: seededInt(1, 5), activeListings: seededInt(0, 1),
               maxCapacity: 2 };
    }
    // soft_cap
    const resp = seededInt(10, 40);
    return { tierBase: 0, resp, speed: seededInt(5, 25), act: 0, rev: 0,
             prof: seededInt(15, 40), ten: seededInt(3, 20),
             score: 0,
             yearsExp: seededInt(1, 4), activeListings: 0, maxCapacity: 1 };
  }

  // ── Build realtor list from neighborhood coverage rules ──────────────────
  type RealtorSpec = {
    name: string; phone: string; company: string; rera: string;
    tier: string; lat: number; lng: number;
    score: number; tierBase: number; responseRate: number; responseSpeed: number;
    listingActivity: number; reviews: number; profileScore: number; tenure: number;
    activeListings: number; maxCapacity: number;
    yearsExp: number; languages: string[]; areas: string[];
    bio: string; isMale: boolean; photoId: number;
  };

  const realtorSpecs: RealtorSpec[] = [];
  let realtorSeq = 1; // for phone numbers and RERA

  for (const hood of NEIGHBORHOODS) {
    const isPremium = hood.premium;
    // Decide how many realtors this neighborhood gets
    const rng = seededRand();
    let count = 0;
    if (isPremium) {
      count = seededRand() > 0.35 ? 3 : 2;           // 2–3
    } else if (rng < 0.45) {
      count = seededRand() > 0.6 ? 2 : 1;            // 1–2, 45% of non-premium hoods
    } else {
      count = 0;                                       // intentional gap ~55% of non-premium
    }

    for (let k = 0; k < count; k++) {
      const isMale  = seededRand() > 0.42;
      const firstName = isMale ? seededChoice(MALE_FIRST_NAMES) : seededChoice(FEMALE_FIRST_NAMES);
      const lastName  = seededChoice(LAST_NAMES);
      const name = `${firstName} ${lastName}`;
      const tier = pickTier();
      const scores = scoreForTier(tier);
      const region = neighborhoodRegion(hood);
      const langPool = LANG_POOLS[region] ?? LANG_POOLS.outer;
      const languages = seededChoice(langPool);
      const photoId = seededInt(1, 35);

      // Small coordinate jitter ±~400m so realtors aren't all stacked on the same point
      const latJitter = (seededRand() - 0.5) * 0.008;
      const lngJitter = (seededRand() - 0.5) * 0.008;

      const nearbyHoods = NEIGHBORHOODS
        .filter(n => Math.abs(n.lat - hood.lat) < 0.05 && Math.abs(n.lng - hood.lng) < 0.05)
        .slice(0, 3)
        .map(n => n.name);

      const company = (tier === "free_trial" || tier === "soft_cap")
        ? "Independent"
        : `${lastName} ${seededChoice(COMPANY_SUFFIXES)}`;

      const bioFn = seededChoice(BIO_TEMPLATES);
      const bio = bioFn(hood.name, scores.yearsExp);

      realtorSpecs.push({
        name, phone: `+9191${String(realtorSeq).padStart(8, "0")}`,
        company, rera: `TSRERA/AGT/${String(realtorSeq).padStart(5, "0")}`,
        tier, lat: hood.lat + latJitter, lng: hood.lng + lngJitter,
        score: scores.score, tierBase: scores.tierBase,
        responseRate: scores.resp, responseSpeed: scores.speed,
        listingActivity: scores.act, reviews: scores.rev,
        profileScore: scores.prof, tenure: scores.ten,
        activeListings: scores.activeListings, maxCapacity: scores.maxCapacity,
        yearsExp: scores.yearsExp, languages, areas: nearbyHoods,
        bio, isMale, photoId,
      });
      realtorSeq++;
    }
  }

  // ── Clear existing realtor seed data (cascade removes leads + viewings) ──
  await sql`DELETE FROM users WHERE role = 'realtor'`;
  console.log(`   🗑  Cleared existing realtors`);

  // ── INSERT all realtors ──────────────────────────────────────────────────
  let realtorsInserted = 0;
  const realtorIds: string[] = [];

  for (const r of realtorSpecs) {
    const phoneHash     = hashString(r.phone);
    const encryptedName  = encrypt(r.name);
    const encryptedPhone = encrypt(r.phone);
    const photoUrl = `https://randomuser.me/api/portraits/${r.isMale ? "men" : "women"}/${r.photoId}.jpg`;
    const trialDaysAgo   = seededInt(10, 90);
    const createdDaysAgo = seededInt(30, 365);
    const trialSale   = r.tier === "free_trial" ? seededInt(0, 2) : 3;
    const trialRental = r.tier === "free_trial" ? seededInt(0, 2) : 3;
    const softSale    = r.tier === "soft_cap" ? 1 : 0;
    const softRental  = r.tier === "soft_cap" ? 1 : 0;

    const [inserted] = await sql.query(`
      INSERT INTO users (
        role, phone_hash, encrypted_name, encrypted_phone,
        rera_number, company_name,
        photo_url, bio, years_experience, languages_spoken, areas_served,
        realtor_latitude, realtor_longitude,
        subscription_tier, trial_started_at,
        trial_sale_leads_used, trial_rental_leads_used,
        soft_cap_sale_leads_month, soft_cap_rental_leads_month,
        realtor_score, score_tier_base, score_response_rate,
        score_response_speed, score_listing_activity,
        score_reviews, score_profile, score_tenure,
        active_listing_count, max_listing_capacity,
        created_at, updated_at
      ) VALUES (
        'realtor', $1, $2, $3,
        $4, $5,
        $6, $7, $8,
        $9::jsonb, $10::jsonb,
        $11, $12,
        $13::subscription_tier,
        NOW() - ($14 || ' days')::interval,
        $15, $16,
        $17, $18,
        $19, $20, $21,
        $22, $23,
        $24, $25, $26,
        $27, $28,
        NOW() - ($29 || ' days')::interval,
        NOW()
      )
      RETURNING id
    `, [
      phoneHash, encryptedName, encryptedPhone,
      r.rera, r.company,
      photoUrl, r.bio, r.yearsExp,
      JSON.stringify(r.languages), JSON.stringify(r.areas),
      r.lat, r.lng,
      r.tier,
      String(trialDaysAgo),
      trialSale, trialRental,
      softSale, softRental,
      r.score, r.tierBase, r.responseRate,
      r.responseSpeed, r.listingActivity,
      r.reviews, r.profileScore, r.tenure,
      r.activeListings, r.maxCapacity,
      String(createdDaysAgo),
    ]);

    realtorIds.push(inserted.id);
    realtorsInserted++;
  }

  // Tier summary
  const tierCounts = realtorSpecs.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);
  console.log(`\n✅ Seeded ${realtorsInserted} realtors:`);
  console.log(`   Pro+: ${tierCounts.pro_plus ?? 0}  Pro: ${tierCounts.pro ?? 0}  Trial: ${tierCounts.free_trial ?? 0}  SoftCap: ${tierCounts.soft_cap ?? 0}`);
  console.log(`   Ratio: 1 realtor per ${Math.round(allListings.length / realtorsInserted)} listings`);

  const uncoveredHoods = NEIGHBORHOODS.length - new Set(realtorSpecs.map(r => {
    // map back to closest neighborhood name for coverage stats
    return NEIGHBORHOODS.reduce((best, h) =>
      Math.abs(h.lat - r.lat) + Math.abs(h.lng - r.lng) < Math.abs(best.lat - r.lat) + Math.abs(best.lng - r.lng) ? h : best
    ).name;
  })).size;
  console.log(`   Coverage: ~${NEIGHBORHOODS.length - uncoveredHoods}/${NEIGHBORHOODS.length} neighborhoods covered`);
  console.log(`   ~${uncoveredHoods} neighborhoods intentionally uncovered (no-realtor path test)`);

  // ── Sample Leads ──────────────────────────────────────────────────────────
  // 4 leads per realtor for the first 8 realtors (mix of all statuses).
  console.log("\n📬 Seeding sample leads...");

  const sampleListings = await sql`SELECT id FROM listings WHERE status = 'active' LIMIT 30`;

  const BUYER_NAMES  = ["Kiran Mehta","Rohan Gupta","Sneha Pillai","Aditya Joshi","Pooja Nair",
                        "Vikram Rao","Sunita Bose","Arjun Patel","Divya Thomas","Ravi Krishnan",
                        "Neha Shah","Siddharth Verma","Ananya Bose","Rahul Nair","Meena Reddy"];
  const BUYER_PHONES = ["+919200000001","+919200000002","+919200000003","+919200000004","+919200000005",
                        "+919200000006","+919200000007","+919200000008","+919200000009","+919200000010",
                        "+919200000011","+919200000012","+919200000013","+919200000014","+919200000015"];

  const leadsSeeded = realtorIds.slice(0, 8);
  let totalLeads = 0;
  for (let i = 0; i < leadsSeeded.length; i++) {
    const realtorId = leadsSeeded[i];
    for (let j = 0; j < 4; j++) {
      const daysAgo     = seededInt(0, 14);
      const hoursAgo    = seededInt(0, 47);
      const isResponded = seededRand() > 0.4;
      const isClosed    = isResponded && seededRand() > 0.65;
      const listing     = sampleListings[seededInt(0, sampleListings.length - 1)];
      const buyerIdx    = (i * 4 + j) % BUYER_NAMES.length;
      const channel     = seededRand() > 0.5 ? "whatsapp" : "call";
      const outcome     = seededRand() > 0.5 ? "converted" : "lost";
      const now         = Date.now();
      const createdAt   = new Date(now - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();
      const respondedAt = isResponded
        ? new Date(now - daysAgo * 86400000 - Math.floor(hoursAgo / 2) * 3600000).toISOString()
        : null;
      const closedAt    = isClosed
        ? new Date(now - Math.max(0, daysAgo - 1) * 86400000).toISOString()
        : null;

      await sql.query(`
        INSERT INTO leads (realtor_id, listing_id, requester_name, requester_phone,
          type, created_at, responded_at, response_channel, closed_at, outcome)
        VALUES ($1,$2,$3,$4,'buyer_enquiry',$5,$6,$7,$8,$9)
      `, [
        realtorId, listing?.id ?? null,
        BUYER_NAMES[buyerIdx], BUYER_PHONES[buyerIdx],
        createdAt, respondedAt, isResponded ? channel : null,
        closedAt, isClosed ? outcome : null,
      ]);
      totalLeads++;
    }
  }
  console.log(`   ✔ ${totalLeads} leads across ${leadsSeeded.length} realtors`);

  // ── Sample Viewings ───────────────────────────────────────────────────────
  console.log("\n🏠 Seeding sample viewings...");
  const sampleListings2 = await sql`SELECT id FROM listings WHERE status = 'active' LIMIT 15`;
  const viewingStatuses = ["pending", "confirmed", "confirmed"];
  const viewingRealtos  = realtorIds.slice(0, 6);
  let totalViewings = 0;
  for (let i = 0; i < viewingRealtos.length; i++) {
    const realtorId = viewingRealtos[i];
    for (let j = 0; j < 3; j++) {
      const daysFromNow = j + 1 + seededInt(0, 5);
      const hoursOffset = seededInt(9, 17);
      const listing     = sampleListings2[seededInt(0, sampleListings2.length - 1)];
      const status      = viewingStatuses[seededInt(0, viewingStatuses.length - 1)];
      const duration    = seededRand() > 0.5 ? 30 : 45;

      await sql.query(`
        INSERT INTO viewings (realtor_id, listing_id, scheduled_at, status, duration_mins)
        VALUES ($1,$2, NOW() + ($3 || ' days ' || $4 || ' hours')::interval, $5,$6)
      `, [realtorId, listing?.id ?? null, String(daysFromNow), String(hoursOffset), status, duration]);
      totalViewings++;
    }
  }
  console.log(`   ✔ ${totalViewings} viewings across ${viewingRealtos.length} realtors`);

  const saleCount = allListings.filter(l => l.listingType === "sale").length;
  const rentCount = allListings.filter(l => l.listingType === "rent").length;
  console.log(`\n📊 Final summary:`);
  console.log(`   Listings: ${allListings.length} (${saleCount} sale, ${rentCount} rent)`);
  console.log(`   Realtors: ${realtorsInserted} | Leads: ${totalLeads} | Viewings: ${totalViewings}`);
}


if (!process.argv.includes("--leads-only")) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}

// ── reseedLeads — run this standalone to fix leads/viewings without full reseed ─
// Usage: npx tsx src/db/seed.ts --leads-only  (detected below)
async function reseedLeads() {
  console.log("\n🔄 Reseeding leads and viewings with real listing IDs...");
  await sql`DELETE FROM viewings`;
  await sql`DELETE FROM leads`;
  console.log("   Cleared existing leads and viewings");

  const listings = await sql`
    SELECT id, address, city, listing_type, property_type, price, bedrooms, image_url
    FROM listings WHERE status = 'active' ORDER BY RANDOM() LIMIT 30
  `;
  if (!listings.length) { console.error("No active listings found — run full seed first"); return; }

  const realtors = await sql`SELECT id FROM users WHERE role = 'realtor' ORDER BY created_at ASC LIMIT 8`;
  const realtorIds = realtors.map((r: any) => r.id);

  const BUYER_NAMES  = ["Kiran Mehta","Rohan Gupta","Sneha Pillai","Aditya Joshi","Pooja Nair",
                        "Vikram Rao","Sunita Bose","Arjun Patel","Divya Thomas","Ravi Krishnan",
                        "Neha Shah","Siddharth Verma","Ananya Bose","Rahul Nair","Meena Reddy"];
  const BUYER_PHONES = ["+919200000001","+919200000002","+919200000003","+919200000004","+919200000005",
                        "+919200000006","+919200000007","+919200000008","+919200000009","+919200000010",
                        "+919200000011","+919200000012","+919200000013","+919200000014","+919200000015"];

  let totalLeads = 0;
  for (let i = 0; i < realtorIds.length; i++) {
    const realtorId = realtorIds[i];
    for (let j = 0; j < 4; j++) {
      const daysAgo     = Math.floor(Math.random() * 14);
      const hoursAgo    = Math.floor(Math.random() * 47);
      const isResponded = Math.random() > 0.4;
      const isClosed    = isResponded && Math.random() > 0.65;
      const listing     = listings[Math.floor(Math.random() * listings.length)];
      const buyerIdx    = (i * 4 + j) % BUYER_NAMES.length;
      const channel     = Math.random() > 0.5 ? "whatsapp" : "call";
      const outcome     = Math.random() > 0.5 ? "converted" : "lost";
      const now         = Date.now();
      const createdAt   = new Date(now - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();
      const respondedAt = isResponded ? new Date(now - daysAgo * 86400000 - Math.floor(hoursAgo / 2) * 3600000).toISOString() : null;
      const closedAt    = isClosed ? new Date(now - Math.max(0, daysAgo - 1) * 86400000).toISOString() : null;

      await sql.query(`
        INSERT INTO leads (realtor_id, listing_id, requester_name, requester_phone,
          type, created_at, responded_at, response_channel, closed_at, outcome)
        VALUES ($1,$2,$3,$4,'buyer_enquiry',$5,$6,$7,$8,$9)
      `, [realtorId, listing.id, BUYER_NAMES[buyerIdx], BUYER_PHONES[buyerIdx],
          createdAt, respondedAt, isResponded ? channel : null, closedAt, isClosed ? outcome : null]);
      totalLeads++;
    }
  }

  const viewingStatuses = ["pending", "confirmed", "confirmed"];
  let totalViewings = 0;
  for (let i = 0; i < Math.min(6, realtorIds.length); i++) {
    const realtorId = realtorIds[i];
    for (let j = 0; j < 3; j++) {
      const daysFromNow = j + 1 + Math.floor(Math.random() * 5);
      const hoursOffset = Math.floor(Math.random() * 8) + 9;
      const listing     = listings[Math.floor(Math.random() * listings.length)];
      const status      = viewingStatuses[Math.floor(Math.random() * viewingStatuses.length)];
      const duration    = Math.random() > 0.5 ? 30 : 45;
      const scheduledAt = new Date(Date.now() + daysFromNow * 86400000 + hoursOffset * 3600000).toISOString();
      await sql.query(
        `INSERT INTO viewings (realtor_id, listing_id, scheduled_at, status, duration_mins) VALUES ($1,$2,$3,$4,$5)`,
        [realtorId, listing.id, scheduledAt, status, duration]
      );
      totalViewings++;
    }
  }
  console.log(`   ✔ ${totalLeads} leads | ${totalViewings} viewings — all with real listing IDs`);
}

if (process.argv.includes("--leads-only")) {
  reseedLeads().catch((err) => { console.error("❌ reseedLeads failed:", err); process.exit(1); });
}
