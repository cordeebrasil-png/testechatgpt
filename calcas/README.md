# Cordee — kit com duas calças

Separate funnel: `/calcas/` → `/calcas/checkout/` → `/calcas/pagamento/` → `/calcas/obrigado/`.
The uploaded sales page is retained; its Cartpanda destination now passes both exact color labels, size and campaign parameters to the Cordee checkout.

Checkout, Pix copy/QR and verified thank-you use the original Maré Azul templates and payment logic, with Cordee branding. Browser order/intent keys are scoped to `cordee.calcas.*` so the boxes flow cannot reuse these sessions.

Offer confirmed by merchant: product `iexqbvgequ`, offer `1gcfvqrjeb`, kit price BRL 94.91, free shipping. Optional server overrides: `CALCAS_PRODUCT_HASH`, `CALCAS_OFFER_HASH`, `CALCAS_AMOUNT_CENTS`. Invalid explicit overrides disable order creation; no other product is substituted. The existing IronPay API token and D1 binding remain in use. Never commit credentials.

The server owns pricing and stores both colors, size, product and total in the existing receipt JSON. No database migration is needed. Existing orders and the boxes storefront remain unchanged. Tests use intercepted payment responses; no real charge/payment was used to validate the new flow.

Build after editing Cordee source: `node scripts/build-calcas.mjs`. This regenerates only the three Cordee page bundles. The existing boxes TikTok campaign remains scoped to its original routes; the Cordee funnel does not send conversions to that campaign.

Checks: `node --test tests/calcas.test.js tests/calcas.browser.cjs`. Set `CHROMIUM_PATH` if using a system Chromium install.
