| Key | Type | Epic | Summary |
|-----|------|------|---------|
| SCRUM-5 | Epic | — | Product & UX Foundation |
| SCRUM-6 | Story | SCRUM-5 | Setup Next.js 15 project with App Router and TypeScript |
| SCRUM-7 | Story | SCRUM-5 | Install and configure shadcn/ui component library with Radix primitives |
| SCRUM-8 | Story | SCRUM-5 | Define design tokens: colors (oxblood, warm white), typography (Inter + DM Sans), spacing |
| SCRUM-9 | Story | SCRUM-5 | Build responsive layout shell: header, control bar, main content area |
| SCRUM-10 | Story | SCRUM-5 | Configure Framer Motion for page transitions and micro-animations |
| SCRUM-11 | Story | SCRUM-5 | Setup Lucide React icon library and Sonner toast notifications |
| SCRUM-12 | Epic | — | Map Search Experience |
| SCRUM-13 | Story | SCRUM-12 | Integrate react-map-gl with Mapbox GL JS v3 (streets style, India-centered) |
| SCRUM-14 | Story | SCRUM-12 | Build viewport-based listing fetch: debounced API call on map moveend |
| SCRUM-15 | Story | SCRUM-12 | Create custom oxblood price marker components for map |
| SCRUM-16 | Story | SCRUM-12 | Implement client-side marker clustering with Supercluster |
| SCRUM-17 | Story | SCRUM-12 | Build city search: Mapbox Geocoding API → fitBounds to city boundaries |
| SCRUM-18 | Story | SCRUM-12 | Implement draw-on-map polygon search using @mapbox/mapbox-gl-draw |
| SCRUM-19 | Story | SCRUM-12 | Build polygon search API: ST_Within query against drawn boundary |
| SCRUM-20 | Story | SCRUM-12 | Add Remove Boundary button to clear polygon or city bounds |
| SCRUM-21 | Story | SCRUM-12 | Build Map/List view toggle with floating action button |
| SCRUM-22 | Story | SCRUM-12 | Build list view: scrollable property cards for current viewport/polygon |
| SCRUM-23 | Story | SCRUM-12 | Add current location button with browser Geolocation API |
| SCRUM-24 | Story | SCRUM-12 | Implement For Sale / For Rent dropdown toggle in control bar |
| SCRUM-25 | Epic | — | Listing Creation Flow |
| SCRUM-26 | Story | SCRUM-25 | Build 4-step listing wizard shell with progress indicator (react-hook-form + zod) |
| SCRUM-27 | Story | SCRUM-25 | Step 1: Map-based location picker — drop pin to set exact location |
| SCRUM-28 | Story | SCRUM-25 | Step 2: Property details form — type, listing type, price, area, dimensions, BHK |
| SCRUM-29 | Story | SCRUM-25 | Step 3: Photo upload — frontage required, property images, drag-to-reorder |
| SCRUM-30 | Story | SCRUM-25 | Step 4: Contact info — name, phone, lister type (owner/broker/developer) |
| SCRUM-31 | Story | SCRUM-25 | Implement form validation for all mandatory listing fields |
| SCRUM-32 | Story | SCRUM-25 | Build listing preview screen before final submission |
| SCRUM-33 | Story | SCRUM-25 | Build listing success confirmation screen |
| SCRUM-34 | Epic | — | Property Details Experience |
| SCRUM-35 | Story | SCRUM-34 | Build property detail page layout with full-width hero gallery |
| SCRUM-36 | Story | SCRUM-34 | Implement swipeable photo gallery with image counter and fullscreen mode |
| SCRUM-37 | Story | SCRUM-34 | Display property specs: price, area, BHK, bathrooms, facing, dimensions |
| SCRUM-38 | Story | SCRUM-34 | Embed mini-map showing exact property location |
| SCRUM-39 | Story | SCRUM-34 | Build Contact Owner button — reveal phone on tap (auth-gated, rate-limited) |
| SCRUM-40 | Story | SCRUM-34 | Add save/favorite toggle on detail page |
| SCRUM-41 | Story | SCRUM-34 | Add share listing button (copy link, native share on mobile) |
| SCRUM-42 | Epic | — | Image Upload & Media Pipeline |
| SCRUM-43 | Story | SCRUM-42 | Setup Cloudflare R2 bucket for property image storage |
| SCRUM-44 | Story | SCRUM-42 | Build pre-signed URL generation API for direct R2 uploads |
| SCRUM-45 | Story | SCRUM-42 | Implement client-side image compression with browser-image-compression |
| SCRUM-46 | Story | SCRUM-42 | Build drag-and-drop upload UI with react-dropzone and progress indicators |
| SCRUM-47 | Story | SCRUM-42 | Setup Cloudflare Images for on-the-fly resizing and WebP/AVIF conversion |
| SCRUM-48 | Story | SCRUM-42 | Implement image reordering and primary (frontage) photo selection |
| SCRUM-49 | Story | SCRUM-42 | Enforce max 10 photos per listing with file size validation (max 5MB each) |
| SCRUM-50 | Epic | — | Authentication & User Accounts |
| SCRUM-51 | Story | SCRUM-50 | Implement phone OTP login flow with MSG91 (India-first auth) |
| SCRUM-52 | Story | SCRUM-50 | Build OTP input UI with auto-focus and countdown timer |
| SCRUM-53 | Story | SCRUM-50 | Setup Auth.js v5 with custom credentials provider for phone OTP |
| SCRUM-54 | Story | SCRUM-50 | Implement session management with secure HTTP-only cookies |
| SCRUM-55 | Story | SCRUM-50 | Build user profile page: name, phone, edit profile |
| SCRUM-56 | Story | SCRUM-50 | Build My Listings page showing user's posted properties |
| SCRUM-57 | Story | SCRUM-50 | Build Saved/Favorites page with listing cards |
| SCRUM-58 | Epic | — | Backend API & Database Foundation |
| SCRUM-59 | Story | SCRUM-58 | Provision Neon PostgreSQL (Singapore region) with PostGIS extension |
| SCRUM-60 | Story | SCRUM-58 | Setup Drizzle ORM with PostGIS geography type support |
| SCRUM-61 | Story | SCRUM-58 | Create database schema: users, listings, listing_images, favorites, reports |
| SCRUM-62 | Story | SCRUM-58 | Build GET /api/listings/viewport — spatial bounding box query with GiST index |
| SCRUM-63 | Story | SCRUM-58 | Build POST /api/listings/polygon — ST_Within polygon search query |
| SCRUM-64 | Story | SCRUM-58 | Build GET /api/listings/:id — full listing detail with images |
| SCRUM-65 | Story | SCRUM-58 | Build POST /api/listings — create listing with validation |
| SCRUM-66 | Story | SCRUM-58 | Build GET /api/listings/:id/contact — auth-gated contact reveal with rate limit |
| SCRUM-67 | Story | SCRUM-58 | Build POST /api/favorites/:id — toggle favorite |
| SCRUM-68 | Story | SCRUM-58 | Build POST /api/reports — report listing |
| SCRUM-69 | Story | SCRUM-58 | Build GET /api/geo/city/:name — city bounding box via Mapbox Geocoding |
| SCRUM-70 | Story | SCRUM-58 | Setup Upstash Redis (Singapore) for viewport query caching |
| SCRUM-71 | Epic | — | Report Listing & Basic Trust |
| SCRUM-72 | Story | SCRUM-71 | Build Report Listing UI with reason categories (fake photos, wrong location, spam) |
| SCRUM-73 | Story | SCRUM-71 | Implement report submission API with auth requirement |
| SCRUM-74 | Story | SCRUM-71 | Add report count tracking on listings |
| SCRUM-75 | Story | SCRUM-71 | Implement 90-day listing auto-expiry |
| SCRUM-76 | Story | SCRUM-71 | Display lister type badge on listings (Owner / Broker / Developer) |
| SCRUM-77 | Epic | — | SEO & Performance |
| SCRUM-78 | Story | SCRUM-77 | Add SEO meta tags and Open Graph for all pages |
| SCRUM-79 | Story | SCRUM-77 | Implement JSON-LD structured data for property listings |
| SCRUM-80 | Story | SCRUM-77 | Generate dynamic sitemap for active listings |
| SCRUM-81 | Story | SCRUM-77 | Optimize Core Web Vitals: lazy loading images, code splitting |
| SCRUM-82 | Story | SCRUM-77 | Setup PWA manifest with app icons and theme colors |
| SCRUM-83 | Epic | — | Infrastructure & Deployment |
| SCRUM-84 | Story | SCRUM-83 | Setup Vercel project with preview and production environments |
| SCRUM-85 | Story | SCRUM-83 | Configure Cloudflare CDN, WAF, and rate limiting |
| SCRUM-86 | Story | SCRUM-83 | Setup environment variables and secrets management |
| SCRUM-87 | Story | SCRUM-83 | Implement CI/CD with GitHub Actions (lint, type-check, build) |
| SCRUM-88 | Story | SCRUM-83 | Setup error monitoring with Sentry |
| SCRUM-89 | Story | SCRUM-83 | Seed Hyderabad test listings for launch |
