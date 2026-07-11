# TrustTicker Overlay (Chrome)

Load unpacked from this folder in `chrome://extensions`.

## Features
- Popup: detects chart ticker from TradingView URL/title, opens TrustTicker ticker/scanner/wins
- Popup sympathy chips via `/api/sympathy`
- Content script: floating `TT SYMBOL` chip on TradingView charts
- `bookmarklet.js`: paste into a bookmark for non-Chrome browsers

## Local vs prod
Popup/content use `http://localhost:3000` when the extension page host is localhost; otherwise `https://www.trustticker.com`.
