/**
 * Bookmarklet source — minify and wrap as javascript: URL for traders.
 * Opens TrustTicker ticker page for the symbol in the current page title/URL.
 */
(function () {
  var text = (location.href + " " + document.title).toUpperCase();
  var m = text.match(/(?:NASDAQ|NYSE|AMEX):([A-Z]{1,5})/) || text.match(/\b([A-Z]{2,5})\b/);
  var sym = m ? m[1] : prompt("Ticker symbol?");
  if (!sym) return;
  window.open("https://www.trustticker.com/ticker/" + encodeURIComponent(sym), "_blank");
})();
