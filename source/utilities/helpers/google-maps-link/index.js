/**
 * Extracts lat/lng from a pasted Google Maps link. Handles both full links that
 * already contain coordinates and shortened links (maps.app.goo.gl, goo.gl/maps)
 * that need their redirect resolved first — browsers can't read cross-origin
 * redirect targets via fetch (CORS), so that resolution has to happen server-side.
 */

const COORD_PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,          // Google "place" data param — most precise pin
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,               // viewport center: /maps/@lat,lng,zoom
  /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,       // ?q=lat,lng
  /[?&]query=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,   // ?query=lat,lng
  /\/search\/(-?\d+\.\d+),\+?\s*(-?\d+\.\d+)/, // /maps/search/lat,+lng
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,         // ?ll=lat,lng
];

const isValidCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const extractLatLng = (url) => {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw url if it isn't validly percent-encoded */
  }
  for (const pattern of COORD_PATTERNS) {
    const m = decoded.match(pattern);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }
  return null;
};

const ALLOWED_HOST_PATTERN = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)g\.co$/i;

const isAllowedMapsHost = (url) => {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return ALLOWED_HOST_PATTERN.test(hostname);
  } catch {
    return false;
  }
};

const resolveGoogleMapsLink = async (rawUrl) => {
  const url = String(rawUrl || "").trim();
  if (!url) return null;

  // Fast path — coordinates already visible in the pasted URL, no network needed.
  const direct = extractLatLng(url);
  if (direct) return direct;

  // Only ever follow redirects for Google's own domains — this endpoint lets an
  // authenticated admin make the server fetch an arbitrary URL, so keep it scoped
  // to Maps hosts to avoid turning it into an open SSRF proxy.
  if (!isAllowedMapsHost(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    await res.text().catch(() => {}); // drain body so the connection closes cleanly
    return extractLatLng(res.url || "");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { resolveGoogleMapsLink, extractLatLng };
