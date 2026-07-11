const APP =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://www.trustticker.com";

function detectSymbol(url, title) {
  const blob = `${url} ${title}`;
  const fromExchange = blob.match(/(?:NASDAQ|NYSE|AMEX|CBOE|TSX):([A-Z]{1,5})/i);
  if (fromExchange) return fromExchange[1].toUpperCase();
  const fromQuery = url.match(/[?&]symbol=([A-Z.]{1,8})/i);
  if (fromQuery) return fromQuery[1].replace(/\..*$/, "").toUpperCase();
  const fromPath = url.match(/\/symbols?\/(?:NASDAQ|NYSE|AMEX)--([A-Z]{1,5})/i);
  if (fromPath) return fromPath[1].toUpperCase();
  return null;
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const sym = detectSymbol(tab?.url || "", tab?.title || "") || "SPY";
  document.getElementById("sym").textContent = sym;

  document.getElementById("openDash").onclick = () => {
    chrome.tabs.create({ url: `${APP}/ticker/${sym}` });
  };
  document.getElementById("openWins").onclick = () => {
    chrome.tabs.create({ url: `${APP}/wins` });
  };
  document.getElementById("openDemo").onclick = () => {
    chrome.tabs.create({ url: `${APP}/dashboard` });
  };

  try {
    const res = await fetch(`${APP}/api/sympathy?symbol=${encodeURIComponent(sym)}&limit=5`);
    if (!res.ok) return;
    const data = await res.json();
    const box = document.getElementById("sympathy");
    if (!box || !data.nodes?.length) return;
    box.innerHTML =
      `<div style="font-size:10px;color:#a1a1aa;margin-top:8px">Sympathy</div>` +
      data.nodes
        .slice(0, 5)
        .map(
          (n) =>
            `<a href="${APP}/ticker/${n.symbol}" target="_blank" style="display:inline-block;margin:2px;padding:2px 6px;border:1px solid #3f3f46;border-radius:6px;color:#e4e4e7;text-decoration:none;font-size:10px;font-family:monospace">${n.symbol}</a>`
        )
        .join("");
  } catch {
    /* offline */
  }
}

main().catch(console.error);
