// Weather for a job's address, for the morning brief: rain and wind at the
// visit's hour. Free, no API keys - postcodes.io turns a UK postcode into a
// location and Open-Meteo gives the hourly forecast. Anything that fails
// just means no weather line; the brief never waits on it for long.

export type HourlyForecast = { time: string[]; precipitation_probability: number[]; wind_gusts_10m: number[] };

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** "12 High St, Guildford GU1 3AA" -> "GU1 3AA", or null. */
export function extractPostcode(text: string | null): string | null {
  const m = POSTCODE.exec(text ?? "");
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null;
}

export const RAIN_WARN = 60; // % chance
export const GUST_WARN = 35; // mph

/** The forecast at the visit's hour (UK time), or null if the forecast doesn't cover it. */
export function atVisit(f: HourlyForecast, visitIso: string): { rain: number; gust: number } | null {
  const hour = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(visitIso))
    .replace(" ", "T")
    .slice(0, 13);
  const i = f.time.findIndex((t) => t.startsWith(hour));
  if (i < 0) return null;
  return { rain: Math.round(f.precipitation_probability[i] ?? 0), gust: Math.round(f.wind_gusts_10m[i] ?? 0) };
}

/** A short line for the brief, e.g. "70% chance of rain, gusts 40 mph", with whether it's bad enough to flag. */
export function weatherLine(w: { rain: number; gust: number }): { text: string; bad: boolean } {
  const bad = w.rain >= RAIN_WARN || w.gust >= GUST_WARN;
  const parts = [`${w.rain}% chance of rain`];
  if (w.gust >= 20) parts.push(`gusts ${w.gust} mph`);
  return { text: parts.join(", "), bad };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** The forecast for a job's location text (needs a UK postcode in it), or null. */
export async function forecastFor(location: string | null): Promise<HourlyForecast | null> {
  const postcode = extractPostcode(location);
  if (!postcode) return null;
  try {
    const pc = (await getJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)) as { result?: { latitude?: number; longitude?: number } };
    const { latitude, longitude } = pc.result ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    const f = (await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation_probability,wind_gusts_10m&wind_speed_unit=mph&timezone=Europe%2FLondon&forecast_days=3`
    )) as { hourly?: HourlyForecast };
    return f.hourly && Array.isArray(f.hourly.time) ? f.hourly : null;
  } catch {
    return null;
  }
}
