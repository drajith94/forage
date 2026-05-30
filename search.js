// api/search.js
// Vercel serverless function. Holds your Google API key SECRETLY (server-side)
// and calls the Google Places API (New) Text Search endpoint.
// The browser never sees your key.

const PRICE_MAP = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const MEAL_HINT = {
  Breakfast: "breakfast",
  Lunch: "lunch restaurants",
  Dinner: "dinner restaurants",
  Cafe: "cafe coffee shop",
  Matcha: "matcha cafe",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const KEY = process.env.GOOGLE_PLACES_KEY;
  if (!KEY) {
    return res.status(500).json({
      error: "Server is missing GOOGLE_PLACES_KEY. Add it in your Vercel project settings.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const {
      lat, lng, meal = "Dinner", cuisine = "Any", radiusMiles = 3,
      prices = [], dietary = [], openNow = false, placeText = "",
    } = body;

    const parts = [];
    if (dietary.length) parts.push(dietary.join(" "));
    if (cuisine && cuisine !== "Any") parts.push(cuisine);
    parts.push(MEAL_HINT[meal] || "restaurants");
    if (placeText) parts.push("in " + placeText);
    const textQuery = parts.join(" ").trim();

    const radiusMeters = Math.min(50000, Math.max(500, Math.round(radiusMiles * 1609.34)));

    const payload = { textQuery, maxResultCount: 20, ...(openNow ? { openNow: true } : {}) };
    if (typeof lat === "number" && typeof lng === "number") {
      payload.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
      };
    }

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.currentOpeningHours.openNow",
      "places.currentOpeningHours.weekdayDescriptions",
      "places.nationalPhoneNumber",
      "places.googleMapsUri",
      "places.websiteUri",
      "places.editorialSummary",
      "places.primaryTypeDisplayName",
      "places.reviews",
    ].join(",");

    const gRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(payload),
    });

    const data = await gRes.json();
    if (!gRes.ok) {
      return res.status(gRes.status).json({
        error: data?.error?.message || "Google Places request failed.",
      });
    }

    let places = (data.places || []).map((p) => ({
      id: p.id,
      name: p.displayName?.text || "Unknown",
      cuisine: p.primaryTypeDisplayName?.text || "Restaurant",
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
      topReview:
        p.reviews && p.reviews[0] && p.reviews[0].text ? p.reviews[0].text.text : null,
    }));

    if (prices.length) {
      places = places.filter((p) => p.priceLevel == null || prices.includes(p.priceLevel));
    }
    places = places.filter((p) => p.rating != null);

    places.sort(
      (a, b) =>
        (b.rating || 0) * Math.log10((b.reviewCount || 0) + 10) -
        (a.rating || 0) * Math.log10((a.reviewCount || 0) + 10)
    );

    return res.status(200).json({ results: places.slice(0, 12) });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
}
