// api/search.js  –– CommonJS (module.exports) so Vercel loads it correctly
// Handles food / parks / play modes + free Reddit buzz enrichment

const PRICE_MAP = {
  PRICE_LEVEL_FREE:1, PRICE_LEVEL_INEXPENSIVE:1,
  PRICE_LEVEL_MODERATE:2, PRICE_LEVEL_EXPENSIVE:3, PRICE_LEVEL_VERY_EXPENSIVE:4,
};
const MEAL_HINT = {
  Breakfast:"breakfast spot", Lunch:"lunch restaurant", Dinner:"dinner restaurant",
  Cafe:"cafe coffee shop", Matcha:"matcha cafe",
};
const PARK_HINT = {
  Any:"park", Hiking:"hiking trail park", "Dog Park":"dog park",
  Playground:"playground", Sports:"sports complex field", Garden:"botanical garden park",
  Beach:"beach", "Nature Reserve":"nature reserve",
};
const PLAY_HINT = {
  Any:"entertainment activities", Arcade:"arcade game center",
  Bowling:"bowling alley", Movies:"movie theater cinema", "Mini Golf":"mini golf course",
  "Escape Room":"escape room", "Live Music":"live music venue", "Laser Tag":"laser tag center",
  "Go-Kart":"go kart racing", Comedy:"comedy club", Trampoline:"trampoline park", Karaoke:"karaoke bar",
};

// Free Reddit JSON API — no key needed, runs server-side so no CORS issues
async function redditBuzz(query, location) {
  try {
    const q = encodeURIComponent((query + " " + location + " hidden gem recommend").trim());
    const url = `https://www.reddit.com/search.json?q=${q}&sort=relevance&limit=10&t=year`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Forage/1.0 personal activity finder (self-hosted)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.data?.children || [])
      .filter(p => p.data.score > 1 && p.data.title.length > 10)
      .map(p => ({
        title: p.data.title,
        score: p.data.score,
        url: "https://reddit.com" + p.data.permalink,
        body: (p.data.selftext || "").slice(0, 280),
        sub: p.data.subreddit,
      }));
  } catch { return []; }
}

// Free Nominatim reverse-geocode: coords → city name for Reddit query
async function cityFromCoords(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "User-Agent": "Forage/1.0" }, signal: AbortSignal.timeout(4000) }
    );
    const d = await r.json();
    return d?.address?.city || d?.address?.town || d?.address?.suburb || "";
  } catch { return ""; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) return res.status(500).json({ error: "Server is missing GOOGLE_PLACES_KEY." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const {
      lat, lng, mode = "food", placeText = "",
      // food
      meal = "Dinner", cuisine = "Any", dietary = [],
      // parks
      parkType = "Any",
      // play
      playCategory = "Any",
      // shared
      prices = [], radiusMiles = 5, openNow = false,
    } = body;

    // Resolve location text
    let locText = placeText.trim();
    if (!locText && typeof lat === "number" && typeof lng === "number") {
      locText = await cityFromCoords(lat, lng);
    }

    // Build query
    let textQuery = "", redditQ = "";
    if (mode === "food") {
      const parts = [];
      if (dietary.length) parts.push(dietary.join(" "));
      if (cuisine !== "Any") parts.push(cuisine);
      parts.push(MEAL_HINT[meal] || "restaurant");
      if (placeText) parts.push("in " + placeText);
      textQuery = parts.join(" ").trim();
      redditQ = `new ${cuisine !== "Any" ? cuisine : ""} restaurant underrated`;
    } else if (mode === "parks") {
      textQuery = (PARK_HINT[parkType] || "park") + (placeText ? " in " + placeText : "");
      redditQ = `${PARK_HINT[parkType] || "park"} underrated`;
    } else {
      textQuery = (PLAY_HINT[playCategory] || "entertainment") + (placeText ? " in " + placeText : "");
      redditQ = `${PLAY_HINT[playCategory] || "entertainment"} worth it`;
    }

    const radiusMeters = Math.min(50000, Math.max(500, Math.round(radiusMiles * 1609.34)));
    const payload = { textQuery, maxResultCount: 20, ...(openNow ? { openNow: true } : {}) };
    if (typeof lat === "number" && typeof lng === "number") {
      payload.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } };
    }

    const FIELDS = [
      "places.id","places.displayName","places.formattedAddress","places.location",
      "places.rating","places.userRatingCount","places.priceLevel",
      "places.currentOpeningHours.openNow","places.currentOpeningHours.weekdayDescriptions",
      "places.nationalPhoneNumber","places.googleMapsUri","places.websiteUri",
      "places.editorialSummary","places.primaryTypeDisplayName","places.reviews",
    ].join(",");

    // Places API + Reddit run in parallel – Reddit failure never breaks the main results
    const [gRes, buzz] = await Promise.all([
      fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type":"application/json", "X-Goog-Api-Key":KEY, "X-Goog-FieldMask":FIELDS },
        body: JSON.stringify(payload),
      }),
      redditBuzz(redditQ, locText),
    ]);

    const gData = await gRes.json();
    if (!gRes.ok) return res.status(gRes.status).json({ error: gData?.error?.message || "Google Places failed." });

    let places = (gData.places || []).map(p => ({
      id: p.id,
      name: p.displayName?.text || "Unknown",
      type: p.primaryTypeDisplayName?.text || (mode === "parks" ? "Park" : mode === "play" ? "Entertainment" : "Restaurant"),
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      priceLevel: PRICE_MAP[p.priceLevel] || null,
      address: p.formattedAddress || "",
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      hours: p.currentOpeningHours?.weekdayDescriptions || null,
      phone: p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      mapsUri: p.googleMapsUri || null,
      summary: p.editorialSummary?.text || null,
      topReview: p.reviews?.[0]?.text?.text || null,
      mode,
    }));

    if (prices.length && mode !== "parks") {
      places = places.filter(p => p.priceLevel == null || prices.includes(p.priceLevel));
    }
    places = places.filter(p => p.rating != null);
    places.sort((a, b) =>
      (b.rating||0) * Math.log10((b.reviewCount||0)+10) -
      (a.rating||0) * Math.log10((a.reviewCount||0)+10)
    );

    return res.status(200).json({ results: places.slice(0, 15), buzz });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
