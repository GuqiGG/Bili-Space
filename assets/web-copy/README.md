# Original Bilibili website resources

These are unmodified HTTP response bodies captured from public Bilibili pages and their CDN resources, not replacement page templates. `manifest.json` records the original URLs, MIME types, byte counts and SHA-256 hashes. The source pages are homepage, dynamic feed and history. Rights and trademarks remain with Bilibili and the respective resource authors; the application license does not apply to these copies.

`scripts/cache_official_pages.py` captures an isolated guest browser session. `scripts/prepare_web_cache.py` creates separate `.webkit.css` variants that only resolve resource URLs for the native WebKit resource scheme; original bytes remain intact.

Bundled guest HTML is retained as source provenance. It is not substituted for an authenticated user's first visit. The native hosts cache that user's actual official HTML in the private account/browser profile for up to 24 hours. API responses, account cookies and video streams are not included here. Unknown or updated resources continue to load from the official network.
