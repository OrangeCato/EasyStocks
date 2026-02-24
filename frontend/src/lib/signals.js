function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function abs(n) {
  return Math.abs(Number(n ?? 0));
}

export function buildRankingsFromListings(listings) {
  if (!Array.isArray(listings)) return [];

  return listings.map((coin) => {
    const quote = coin?.quote?.USD || {};

    const change = Number(quote.percent_change_24h ?? 0);
    const marketCap = Number(quote.market_cap ?? 0);
    const volume = Number(quote.volume_24h ?? 0);

    // Volatility classification
    let volatility = "low";
    if (Math.abs(change) > 8) volatility = "high";
    else if (Math.abs(change) > 3) volatility = "medium";

    // Score model (simple but meaningful)
    let score = 0;

    // momentum weight
    score += Math.abs(change) * 2;

    // liquidity weight
    score += Math.log10(volume + 1);

    // size stability bonus
    score += Math.log10(marketCap + 1) * 0.5;

    score = Math.min(Math.round(score), 100);

    let reason = "Stable";
    if (Math.abs(change) > 8) reason = "Strong momentum";
    else if (Math.abs(change) > 3) reason = "Breakout watch";

    return {
      symbol: coin.symbol,
      score,
      volatility,
      change_24h: change,
      reason,
    };
  })
    // sort descending
    .sort((a, b) => b.score - a.score);
}

export function buildAlertsFromRankings(rankings) {
  // MVP alerts: top 3 “high” volatility
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  return rankings
    .filter((r) => r.volatility === "high")
    .slice(0, 3)
    .map((r) => ({
      time,
      symbol: r.symbol,
      type: "volatility",
      message: `High 24h move — score ${r.score}, ${r.change_24h}`,
    }));
}