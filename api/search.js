// api/search.js — CommonJS. Food/parks/play + multi-source review aggregation.
// Sources: Google Places (primary) + Reddit (free JSON) + web search snippets (free).
// No paid APIs. Google key stays server-side.

const PRICE_MAP = {
  PRICE_LEVEL_FREE:1, PRICE_LEVEL_INEXPENSIVE:1,
  PRICE_LEVEL_MODERATE:2, PRICE_LEVEL_EXPENSIVE:3, PRICE_LEVEL_VERY_EXPENSIVE:4,
};
const MEAL_HINT = {
  Breakfast:"breakfast spot", Lunch:"lunch restaurant", Dinner:"dinner restaurant",
  Cafe:"cafe coffee shop", Matcha:"matcha cafe",
};
const PARK_HINT = {
  Any:"park", Hiking:"hiking trail park", "Dog Park":"dog park", Playground:"playground",
  Sports:"sports complex field", Garden:"botanical garden park", Beach:"beach", "Nature Reserve":"nature reserve",
};
const PLAY_HINT = {
  Any:"entertainment activities", Arcade:"arcade game center", Bowling:"bowling alley",
  Movies:"movie theater cinema", "Mini Golf":"mini golf course", "Escape Room":"escape room",
  "Live Music":"live music venue", "Laser Tag":"laser tag center", "Go-Kart":"go kart racing",
  Comedy:"comedy club", Trampoline:"trampoline park", Karaoke:"karaoke bar",
};

// ---- Reddit (free, no key) ----
async function redditBuzz(query, location) {
  try {
    const q = encodeURIComponent((query + " " + location).trim());
    const url = `https://www.reddit.com/search.json?q=${q}&sort=relevance&limit=12&t=year`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Forage/2.0 personal finder" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.data?.children || [])
      .filter(p => p.data.score > 1 && p.data.title.length > 10)
      .map(p => ({
        title: p.data.title,
        score: p.data.score,
        comments: p.data.num_comments,
        url: "https://reddit.com" + p.data.permalink,
        body: (p.data.selftext || "").slice(0, 400),
        sub: p.data.subreddit,
      }));
  } catch { return []; }
}

// ---- Per-place Reddit sentiment (free) ----
async function redditForPlace(name, city) {
  try {
    const q = encodeURIComponent(`"${name}" ${city}`);
    const url = `https://www.reddit.com/search.json?q=${q}&sort=relevance&limit=4&t=all`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Forage/2.0" },
      signal: AbortSignal.timeout(4500),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.data?.children || [])
      .filter(p => {
        const t = (p.data.title + " " + (p.data.selftext||"")).toLowerCase();
        return t.includes(name.toLowerCase().split(" ")[0]);
      })
      .slice(0, 3)
      .map(p => ({
        source: "Reddit",
        sub: p.data.subreddit,
        title: p.data.title,
        score: p.data.score,
        snippet: (p.data.selftext || p.data.title).slice(0, 240),
        url: "https://reddit.com" + p.data.permalink,
      }));
  } catch { return []; }
}

// ---- Nominatim reverse geocode (free) ----
async function cityFromCoords(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "User-Agent": "Forage/2.0" }, signal: AbortSignal.timeout(4000) }
    );
    const d = await r.json();
    return d?.address?.city || d?.address?.town || d?.address?.suburb || d?.address?.county || "";
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
      meal = "Dinner", cuisine = "Any", dietary = [], dish = "",
      parkType = "Any", playCategory = "Any",
      prices = [], radiusMiles = 5, openNow = false,
    } = body;

    let locText = placeText.trim();
    if (!locText && typeof lat === "number" && typeof lng === "number") {
      locText = await cityFromCoords(lat, lng);
    }

    let textQuery = "", redditQ = "";
    if (mode === "food") {
      const parts = [];
      if (dish) {
        // Dish search: keep the query tight and dish-led so Google ranks by the dish
        // itself instead of padding with category-adjacent places.
        const dq = ["best", dish];
        if (dietary.length) dq.push(dietary.join(" "));
        if (placeText) dq.push("in " + placeText);
        textQuery = dq.join(" ").trim();
        redditQ = "best " + dish + " near me";
      } else {
        if (dietary.length) parts.push(dietary.join(" "));
        if (cuisine !== "Any") parts.push(cuisine);
        parts.push(MEAL_HINT[meal] || "restaurant");
        if (placeText) parts.push("in " + placeText);
        textQuery = parts.join(" ").trim();
        redditQ = (cuisine !== "Any" ? cuisine : "") + " restaurant best";
      }
    } else if (mode === "parks") {
      textQuery = (PARK_HINT[parkType] || "park") + (placeText ? " in " + placeText : "");
      redditQ = (PARK_HINT[parkType] || "park") + " best";
    } else {
      textQuery = (PLAY_HINT[playCategory] || "entertainment") + (placeText ? " in " + placeText : "");
      redditQ = (PLAY_HINT[playCategory] || "entertainment") + " best worth it";
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

    let places = (gData.places || []).map(p => {
      // Pick the review most relevant to the dish, if a dish was searched
      let chosenReview = null, allReviews = [];
      if (p.reviews && p.reviews.length) {
        allReviews = p.reviews.map(r => ({
          text: r.text?.text || "",
          rating: r.rating || null,
          author: r.authorAttribution?.displayName || "Google user",
        })).filter(r => r.text);
        if (dish) {
          const hit = allReviews.find(r => r.text.toLowerCase().includes(dish.toLowerCase()));
          chosenReview = hit || allReviews[0] || null;
        } else {
          chosenReview = allReviews[0] || null;
        }
      }
      return {
        id: p.id,
        name: p.displayName?.text || "Unknown",
        type: p.primaryTypeDisplayName?.text || (mode==="parks"?"Park":mode==="play"?"Entertainment":"Restaurant"),
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
        topReview: chosenReview ? chosenReview.text : null,
        googleReviews: allReviews.slice(0, 3),
        mode,
      };
    });

    if (prices.length && mode !== "parks") {
      places = places.filter(p => p.priceLevel == null || prices.includes(p.priceLevel));
    }
    places = places.filter(p => p.rating != null);

    // Dish relevance: when a dish is searched, score how clearly each place
    // matches the dish (name > type > summary > reviews), then prefer matches.
    if (dish && mode === "food") {
      const dl = dish.toLowerCase().trim();
      // also try a singular/plural-insensitive token (burger ~ burgers)
      const dlBase = dl.replace(/s$/, "");
      const scoreDish = (p) => {
        const inName = (p.name || "").toLowerCase();
        const inType = (p.type || "").toLowerCase();
        const inSummary = (p.summary || "").toLowerCase();
        const inReviews = (p.googleReviews || []).map(r => r.text.toLowerCase()).join(" ");
        let s = 0;
        if (inName.includes(dl) || inName.includes(dlBase)) s += 5;
        if (inType.includes(dl) || inType.includes(dlBase)) s += 4;
        if (inSummary.includes(dl) || inSummary.includes(dlBase)) s += 2;
        if (inReviews.includes(dl) || inReviews.includes(dlBase)) s += 1;
        return s;
      };
      places.forEach(p => { p._dishScore = scoreDish(p); });
      const anyMatch = places.some(p => p._dishScore > 0);
      // If we found real dish matches, drop the zero-score noise (the BBQ-when-you-searched-burger problem).
      if (anyMatch) places = places.filter(p => p._dishScore > 0);
      // Rank by dish relevance first, then by quality.
      places.sort((a, b) =>
        (b._dishScore - a._dishScore) ||
        ((b.rating||0) * Math.log10((b.reviewCount||0)+10) - (a.rating||0) * Math.log10((a.reviewCount||0)+10))
      );
    } else {
      places.sort((a, b) =>
        (b.rating||0) * Math.log10((b.reviewCount||0)+10) -
        (a.rating||0) * Math.log10((a.reviewCount||0)+10)
      );
    }

    const top = places.slice(0, 12);

    // Enrich the top 5 with per-place Reddit sentiment (parallel, capped, non-blocking)
    const city = locText || "";
    const enrichCount = Math.min(5, top.length);
    const enrichments = await Promise.all(
      top.slice(0, enrichCount).map(p => redditForPlace(p.name, city).catch(() => []))
    );
    enrichments.forEach((revs, i) => { top[i].externalReviews = revs; });
    for (let i = enrichCount; i < top.length; i++) top[i].externalReviews = [];

    return res.status(200).json({ results: top, buzz, locationName: locText });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
};
