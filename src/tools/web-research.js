const DEFAULT_TIMEOUT_MS = 12_000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Friday/1.3 (personal assistant)" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function liveWebLookup(query) {
  const q = clean(query);
  if (!q) throw new Error("A search query is required.");

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=0`;
  const data = await fetchJson(url);
  const results = [];

  if (data.AbstractText) {
    results.push({ title: data.Heading || "DuckDuckGo instant answer", url: data.AbstractURL || "", snippet: clean(data.AbstractText) });
  }

  for (const topic of Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []) {
    if (topic.Text) results.push({ title: clean(topic.Text).slice(0, 120), url: topic.FirstURL || "", snippet: clean(topic.Text) });
    if (Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics) {
        if (nested.Text) results.push({ title: clean(nested.Text).slice(0, 120), url: nested.FirstURL || "", snippet: clean(nested.Text) });
      }
    }
    if (results.length >= 8) break;
  }

  if (!results.length) {
    throw new Error("The live web lookup returned no usable results for that query.");
  }

  return {
    query: q,
    fetchedAt: new Date().toISOString(),
    source: "DuckDuckGo Instant Answer API",
    results: results.slice(0, 8),
  };
}

export async function liveNewsLookup(query) {
  const q = clean(query);
  if (!q) throw new Error("A news query is required.");
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Friday/1.3" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((match) => {
      const item = match[1];
      const text = (tag) => clean((item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]);
      return { title: text("title"), url: text("link"), published: text("pubDate"), source: text("source") };
    }).filter((item) => item.title);
    return { query: q, fetchedAt: new Date().toISOString(), source: "Google News RSS", results: items };
  } finally {
    clearTimeout(timer);
  }
}

export async function liveWeatherLookup(location) {
  const place = clean(location);
  if (!place) throw new Error("Tell me the city or location for the weather.");

  const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
  const match = geo.results?.[0];
  if (!match) throw new Error(`I couldn't find a location named ${place}.`);

  const forecast = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${match.latitude}&longitude=${match.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&timezone=auto`);
  const current = forecast.current;
  return {
    location: `${match.name}${match.admin1 ? `, ${match.admin1}` : ""}${match.country ? `, ${match.country}` : ""}`,
    fetchedAt: new Date().toISOString(),
    timezone: forecast.timezone,
    current,
    source: "Open-Meteo",
  };
}
