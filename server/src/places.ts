import { usageLog } from './usage.js';
import type { Org, Place, SearchResult } from './types.js';

/**
 * Local businesses from Google Maps, through SerpAPI's google_maps engine:
 * "hotels" in "Miami, FL" comes back as the places Maps lists, with their
 * category, address, rating, phone and website. For clients who sell to
 * hotels, restaurants, clinics or dealers, which the research database has
 * thin coverage of. Twenty places a page; no total, so pages are walked.
 */

export interface MapsCtx { slug: string; key: string; ctx: string; cost?: number }

export class MapsError extends Error {}

export const PLACES_PER_PAGE = 20;

const US_STATES: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico' };

/**
 * City, state and country out of a Maps address line. US addresses end in
 * "City, ST 12345"; most others in "…, City, Country". Unknown parts stay
 * empty rather than guessed.
 */
export function parseAddress(address: string, fallbackWhere = ''): { city: string; state: string; country: string } {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const out = { city: '', state: '', country: '' };
  if (!parts.length) return out;
  const last = parts[parts.length - 1];
  const us = /^([A-Z]{2})\s*(\d{5})?(-\d{4})?$/.exec(last);
  if (us && US_STATES[us[1]]) {
    out.state = US_STATES[us[1]];
    out.country = 'United States';
    out.city = parts.length >= 2 ? parts[parts.length - 2] : '';
  } else if (last === 'United States' || last === 'USA') {
    out.country = 'United States';
    const st = parts.length >= 2 ? /^([A-Z]{2})\s*\d{5}/.exec(parts[parts.length - 2]) : null;
    if (st && US_STATES[st[1]]) { out.state = US_STATES[st[1]]; out.city = parts.length >= 3 ? parts[parts.length - 3] : ''; }
    else out.city = parts.length >= 2 ? parts[parts.length - 2].replace(/\s*\d{5}.*$/, '') : '';
  } else if (parts.length >= 2 && !/\d/.test(last)) {
    out.country = last;
    // "Toronto, ON M5H 2M9, Canada": a region code plus postal code sits before the country, the city before that.
    const region = parts.length >= 3 ? /^([A-Z]{2,3})\s+[A-Z0-9][A-Z0-9 -]*$/.exec(parts[parts.length - 2]) : null;
    if (region) { out.state = region[1]; out.city = parts[parts.length - 3]; }
    else out.city = parts[parts.length - 2].replace(/^\d{4,}\s+/, '').replace(/\s+\d{4,}$/, '');
  } else if (parts.length >= 2) {
    out.city = last.replace(/\s*\d{4,}.*$/, '');
  }
  if (!out.city && fallbackWhere) out.city = fallbackWhere.split(',')[0].trim();
  return out;
}

export function domainOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** One SerpAPI local result in ProspectIQ's own shape. */
export function placeShape(r: Record<string, any>, where = ''): Place {
  const address = String(r.address || '');
  const a = parseAddress(address, where);
  const website = String(r.website || '');
  const g = r.gps_coordinates || {};
  const types: string[] = Array.isArray(r.types) ? r.types.map(String) : r.type ? [String(r.type)] : [];
  return {
    id: String(r.place_id || r.data_id || r.data_cid || `${r.title}|${address}`),
    name: String(r.title || ''),
    category: types[0] || '',
    types,
    address,
    city: a.city,
    state: a.state,
    country: a.country,
    phone: String(r.phone || ''),
    website,
    domain: domainOf(website),
    rating: typeof r.rating === 'number' ? r.rating : null,
    reviews: Number(r.reviews || 0),
    price: String(r.price || ''),
    lat: typeof g.latitude === 'number' ? g.latitude : null,
    lng: typeof g.longitude === 'number' ? g.longitude : null,
    open_state: String(r.open_state || ''),
    description: String(r.description || ''),
    thumbnail: String(r.thumbnail || ''),
    maps_url: r.place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(String(r.place_id))}` : '',
  };
}

/** A place as a company for the push: Launchpad gets a business record with the Maps facts in its description. */
export function placeToOrg(p: Place): Org {
  const facts = [p.category, p.rating != null ? `${p.rating.toFixed(1)} stars from ${p.reviews.toLocaleString('en-US')} reviews` : '', p.price].filter(Boolean).join(' · ');
  return {
    id: p.id,
    name: p.name,
    domain: p.domain,
    website: p.website,
    industry: p.category,
    industries: p.types,
    employees: 0,
    city: p.city,
    state: p.state,
    country: p.country,
    phone: p.phone,
    linkedin: '',
    logo: '',
    founded: 0,
    revenue: '',
    revenue_n: 0,
    growth12: null,
    sic: [],
    naics: [],
    description: [p.description, p.address ? `Address: ${p.address}` : '', facts ? `Google Maps: ${facts}` : '', p.maps_url].filter(Boolean).join('\n'),
    keywords: p.types,
    enriched: false,
  };
}

/** One page of places. SerpAPI pages by `start` in steps of 20 and says whether there is a next page. */
export async function searchPlaces(m: MapsCtx, what: string, where: string, page = 1): Promise<SearchResult<Place> & { more: boolean }> {
  const q = where ? `${what} in ${where}` : what;
  const params = new URLSearchParams({ engine: 'google_maps', type: 'search', q, hl: 'en', api_key: m.key });
  if (page > 1) params.set('start', String((page - 1) * PLACES_PER_PAGE));
  const t0 = Date.now();
  let json: Record<string, any>;
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
    json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || json.error) {
      const msg = String(json.error || `HTTP ${res.status}`);
      usageLog(m.slug, m.ctx, { p: 'serpapi', ok: 0, ms: Date.now() - t0, ep: 'google_maps', err: msg.slice(0, 200), cost: m.cost || 0 });
      throw new MapsError(/Google hasn't returned any results/i.test(msg) ? 'Nothing found. Try a broader "what" or a bigger area.' : `Google Maps search failed: ${msg}`);
    }
  } catch (e) {
    if (e instanceof MapsError) throw e;
    usageLog(m.slug, m.ctx, { p: 'serpapi', ok: 0, ms: Date.now() - t0, ep: 'google_maps', err: String((e as Error).message).slice(0, 200), cost: m.cost || 0 });
    throw new MapsError(`Google Maps search failed: ${(e as Error).message}`);
  }
  // A query that names one place comes back as a single `place_results` object.
  const list: Record<string, any>[] = Array.isArray(json.local_results) ? json.local_results : json.place_results ? [json.place_results] : [];
  const rows = list.map((r) => placeShape(r, where)).filter((p) => p.name);
  const more = !!json.serpapi_pagination?.next && rows.length >= PLACES_PER_PAGE;
  usageLog(m.slug, m.ctx, { p: 'serpapi', ok: 1, ms: Date.now() - t0, ep: 'google_maps', n: rows.length, cost: m.cost || 0 });
  const total = (page - 1) * PLACES_PER_PAGE + rows.length;
  return { rows, total, page, per_page: PLACES_PER_PAGE, pages: more ? page + 1 : page, more };
}

/* ---- sample mode: deterministic places for demos and tests ---- */

const ADJ = ['Harbor View', 'Palmetto', 'Bayside', 'Grand Oak', 'Sunset', 'Coral Reef', 'Riverside', 'Magnolia', 'Blue Heron', 'Seabreeze', 'Lighthouse', 'Pelican Point', 'Royal Palm', 'Marina Bay', 'Golden Sands', 'Cypress', 'Ocean Drive', 'Orchid', 'Tidewater', 'Sandpiper'];
const STREETS = ['Collins Ave', 'Ocean Dr', 'Biscayne Blvd', 'Brickell Ave', 'Flagler St', 'Coral Way', 'Alton Rd', 'Washington Ave'];

function seedOf(s: string): number { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function samplePlaces(what: string, where: string, page = 1): SearchResult<Place> & { more: boolean } {
  const kind = (what.trim() || 'business').replace(/s$/i, '');
  const Kind = kind.replace(/\b\w/g, (c) => c.toUpperCase());
  const city = (where.split(',')[0].trim() || 'Miami');
  const state = /,\s*([A-Z]{2})\b/.exec(where)?.[1] || 'FL';
  const pages = 3;
  const seed = seedOf(`${what}|${where}`);
  const rows: Place[] = [];
  for (let i = (page - 1) * PLACES_PER_PAGE; i < Math.min(pages * PLACES_PER_PAGE, page * PLACES_PER_PAGE); i++) {
    const r = rng(seed + i);
    const name = `${ADJ[i % ADJ.length]} ${Kind}${i >= ADJ.length ? ' ' + String.fromCharCode(65 + Math.floor(i / ADJ.length)) : ''}`;
    const dom = name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.example.com';
    const hasSite = r() < 0.8;
    const address = `${100 + Math.floor(r() * 8900)} ${STREETS[Math.floor(r() * STREETS.length)]}, ${city}, ${state} ${33100 + Math.floor(r() * 99)}`;
    rows.push(placeShape({ place_id: `sample-${seed}-${i}`, title: name, type: Kind, types: [Kind], address, phone: `+1 305-555-0${100 + Math.floor(r() * 99)}`, website: hasSite ? `https://${dom}` : '', rating: Math.round((3.6 + r() * 1.4) * 10) / 10, reviews: 20 + Math.floor(r() * 1800), price: ['$', '$$', '$$$'][Math.floor(r() * 3)], gps_coordinates: { latitude: 25.76 + r() * 0.2, longitude: -80.19 - r() * 0.2 }, open_state: r() < 0.7 ? 'Open' : 'Closed', description: '' }, where));
  }
  const more = page < pages;
  return { rows, total: more ? page * PLACES_PER_PAGE : (page - 1) * PLACES_PER_PAGE + rows.length, page, per_page: PLACES_PER_PAGE, pages, more };
}

/* ---- Google's own Places API (New), the preferred provider ---- */

/**
 * Text Search on the Places API (New): the same "what in where" query, twenty
 * places a page, paged by a token rather than an offset. The field mask is
 * the whole bill: phone, website, rating and price level are "Enterprise"
 * fields, which is the tier this tab needs, so nothing dearer is asked for.
 */
const GOOGLE_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.priceLevel,places.types,places.primaryType,places.primaryTypeDisplayName,places.location,places.currentOpeningHours,places.googleMapsUri,nextPageToken';

const PRICE: Record<string, string> = { PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };

const humanType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** One Places API result in ProspectIQ's shape. City, state and country come from the address components, else the address line. */
export function googlePlaceShape(p: Record<string, any>, where = ''): Place {
  const comps: Record<string, any>[] = Array.isArray(p.addressComponents) ? p.addressComponents : [];
  const comp = (...kinds: string[]) => { for (const k of kinds) { const c = comps.find((x) => Array.isArray(x.types) && x.types.includes(k)); if (c) return String(c.longText || c.shortText || ''); } return ''; };
  const address = String(p.formattedAddress || '');
  const parsed = parseAddress(address, where);
  const website = String(p.websiteUri || '');
  const types: string[] = Array.isArray(p.types) ? p.types.map(String) : [];
  const category = String(p.primaryTypeDisplayName?.text || '') || (p.primaryType ? humanType(String(p.primaryType)) : '') || (types[0] ? humanType(types[0]) : '');
  const open = p.currentOpeningHours?.openNow;
  return {
    id: String(p.id || `${p.displayName?.text || ''}|${address}`),
    name: String(p.displayName?.text || ''),
    category,
    types: types.map(humanType),
    address,
    city: comp('locality', 'postal_town', 'sublocality', 'administrative_area_level_2') || parsed.city,
    state: comp('administrative_area_level_1') || parsed.state,
    country: comp('country') || parsed.country,
    phone: String(p.nationalPhoneNumber || p.internationalPhoneNumber || ''),
    website,
    domain: domainOf(website),
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: Number(p.userRatingCount || 0),
    price: PRICE[String(p.priceLevel || '')] || '',
    lat: typeof p.location?.latitude === 'number' ? p.location.latitude : null,
    lng: typeof p.location?.longitude === 'number' ? p.location.longitude : null,
    open_state: open === true ? 'Open' : open === false ? 'Closed' : '',
    description: '',
    thumbnail: '',
    maps_url: String(p.googleMapsUri || (p.id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(String(p.id))}` : '')),
  };
}

/** Why Google refused, in words that say what to fix. */
function googleErrorText(status: number, json: Record<string, any>): string {
  const msg = String(json.error?.message || json.error?.status || `HTTP ${status}`);
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'Google says the key is not valid. Check it in Google Cloud under APIs & Services, Credentials.';
  if (/has not been used in project|is disabled|PERMISSION_DENIED|not authorized/i.test(msg)) return 'Google refused the request. Enable "Places API (New)" for the project the key belongs to, and check the key has no API restriction that leaves it out.';
  if (/billing/i.test(msg)) return 'Google says billing is not enabled on the project. The Places API needs a billing account, even inside the free allowance.';
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Google says the quota for the key is used up for now. Try again later or raise the quota in Google Cloud.';
  return `Google Places search failed: ${msg}`;
}

/** One page of places from Google. Pass the previous page's `next_token` to get the next one. */
export async function searchPlacesGoogle(m: MapsCtx, what: string, where: string, pageToken = '', page = 1): Promise<SearchResult<Place> & { more: boolean; next_token: string }> {
  const q = where ? `${what} in ${where}` : what;
  const body: Record<string, unknown> = { textQuery: q, pageSize: PLACES_PER_PAGE, languageCode: 'en' };
  if (pageToken) body.pageToken = pageToken;
  const t0 = Date.now();
  let json: Record<string, any>;
  let status = 0;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': m.key, 'X-Goog-FieldMask': GOOGLE_FIELDS }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    status = res.status;
    json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || json.error) {
      const text = googleErrorText(status, json);
      usageLog(m.slug, m.ctx, { p: 'gmaps', ok: 0, ms: Date.now() - t0, ep: 'places:searchText', err: String(json.error?.message || text).slice(0, 200), cost: m.cost || 0 });
      throw new MapsError(text);
    }
  } catch (e) {
    if (e instanceof MapsError) throw e;
    usageLog(m.slug, m.ctx, { p: 'gmaps', ok: 0, ms: Date.now() - t0, ep: 'places:searchText', err: String((e as Error).message).slice(0, 200), cost: m.cost || 0 });
    throw new MapsError(`Google Places search failed: ${(e as Error).message}`);
  }
  const list: Record<string, any>[] = Array.isArray(json.places) ? json.places : [];
  const rows = list.map((p) => googlePlaceShape(p, where)).filter((p) => p.name);
  const next = String(json.nextPageToken || '');
  usageLog(m.slug, m.ctx, { p: 'gmaps', ok: 1, ms: Date.now() - t0, ep: 'places:searchText', n: rows.length, cost: m.cost || 0 });
  const total = (page - 1) * PLACES_PER_PAGE + rows.length;
  return { rows, total, page, per_page: PLACES_PER_PAGE, pages: next ? page + 1 : page, more: !!next, next_token: next };
}
