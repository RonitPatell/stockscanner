/**
 * Lightweight content script — injects a floating TrustTicker chip on TradingView.
 * Click opens the ticker page for the chart symbol.
 */
(function () {
  const APP =
    location.hostname.includes("localhost")
      ? "http://localhost:3000"
      : "https://www.trustticker.com";

  function detect() {
    const blob = `${location.href} ${document.title}`;
    const m =
      blob.match(/(?:NASDAQ|NYSE|AMEX|CBOE):([A-Z]{1,5})/i) ||
      location.href.match(/[?&]symbol=([A-Z.]{1,8})/i);
    return m ? m[1].replace(/\..*$/, "").toUpperCase() : null;
  }

  function ensureChip() {
    const sym = detect();
    let el = document.getElementById("tt-overlay-chip");
    if (!sym) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("a");
      el.id = "tt-overlay-chip";
      el.target = "_blank";
      el.rel = "noopener";
      Object.assign(el.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: "2147483646",
        padding: "8px 12px",
        borderRadius: "10px",
        background: "rgba(5,46,31,0.92)",
        border: "1px solid #059669",
        color: "#34d399",
        fontFamily: "ui-monospace, monospace",
        fontSize: "12px",
        fontWeight: "700",
        textDecoration: "none",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        cursor: "pointer",
      });
      document.documentElement.appendChild(el);
    }
    el.href = `${APP}/ticker/${encodeURIComponent(sym)}`;
    el.textContent = `TT ${sym}`;
  }

  ensureChip();
  setInterval(ensureChip, 2500);
})();
