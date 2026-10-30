# TheatreOS MVP

TheatreOS is a three-view cinema food and beverage demo. It is branded as the founder's product; “Demo Cinema” is placeholder venue data.

## What works

- Guest: seat link (`/guest?seat=F7`), menu with ingredients/allergens, item-level delivery estimates, combo and best-seller sections, basket, immediate or interval pre-order, one-use direct-booking demo coupon.
- Language: English/ગુજરાતી switch on the entry and dashboard screens. It translates the demo interface and menu in the browser, remembers the choice on that device, and accepts `?lang=gu` for Gujarati QR links. Order IDs, coupon codes, prices and API records stay unchanged.
- Employee: server-validated PIN sign-in, orders prioritised by required preparation start time, status progression through kitchen and delivery, pantry levels and logged refills.
- Manager: separate PIN, order and timing metrics, item sales and estimated ingredient margin, offer issuance and redemption, pantry alerts, a transparent runner-capacity estimate, and a manager-only Business Insights tab with live TheatreOS analysis and a separate external restaurant sample view.
- Shared API: orders reserve ingredient stock and appear on the staff dashboard. Staff and manager screens poll every seven seconds.

Every seeded film, order, price, ingredient cost and operational metric is sample data. Checkout does not collect payment. The manager's coupon issuance button simulates a verified ticket purchase; it is not linked to a cinema website or BookMyShow.

## Run locally

Use Node.js 20 or newer:

```sh
npm install
MANAGER_PIN=123456 EMPLOYEE_PIN=654321 SESSION_SECRET=replace-with-a-random-secret-of-at-least-32-characters npm start
```

Open `http://localhost:3000`. These example PINs are for local development only. The app listens on `PORT` when set.

With no `DATABASE_URL`, state is stored in `data/state.json`. This is convenient for local testing and one server process. The file is ignored by Git.

## Business Insights and Data Science ETL

The Business Insights tab defaults to TheatreOS order data. It distinguishes created and delivered order value, labels demo records, shows product and time-of-day counts, current pantry alerts, fulfilment timing coverage and evidence-backed actions. These values are not verified payment revenue. The optional **Sample Restaurant Data** view never combines its records or value with TheatreOS records.

The external restaurant CSV was inspected and imported locally for this implementation, but its raw file and generated analytics database are ignored by Git. To reproduce or supply the dataset on another machine, see [analytics/README.md](analytics/README.md) for setup, ETL commands, source attribution, SQLite schema, metric definitions and test instructions. The Node app itself does not require Python to serve the live view.

## Deploy on Replit

1. Import or upload this project folder as a Replit Node.js app. `.replit` runs `npm start` and exposes port 3000.
2. Add three Replit Secrets: `MANAGER_PIN` and `EMPLOYEE_PIN` (different six-digit values), plus a random `SESSION_SECRET` of at least 32 characters. Do not put real values in source files.
3. Add a Replit SQL Database for persistent shared orders and inventory. Replit supplies `DATABASE_URL`; TheatreOS creates its one-row JSONB table at startup. Use a production database when publishing.
4. Run the app. Replit installs the `pg` dependency and opens the preview. Publish it as a web app when ready.
5. Create a QR code pointing to `https://YOUR-REPLIT-URL/guest?seat=F7` for the demo seat. Replace `F7` for each seat.

Without a database, a published deployment may lose file-backed demo data when its filesystem is replaced. Configure `DATABASE_URL` before a real multi-device trial. The demo still requires a proper payment gateway, ticketing/POS integration, inventory reconciliation, staff accounts and operational security review before accepting real orders.

## Validate

```sh
npm test
npm run build
```

`npm run build` packages the same browser app as a Sites Worker. The hosted Sites copy uses in-memory demo state, which can reset; the Replit version uses PostgreSQL when `DATABASE_URL` is present.

## Product assumptions to validate with the cinema

1. Staff actually need a deadline-sorted queue. The current rule sorts by target delivery time minus the longest item's preparation time; live kitchen capacity and station routing are not yet modelled.
2. Ingredient stock counts are manually entered and reduced on order creation. Real stock should reconcile with POS sales, waste and returns.
3. “Review” item labels use demo sales and estimated ingredient costs. A real removal decision needs a longer sales period, gross margin, kitchen effort, customer preference and substitutions.
4. The runner estimate uses six minutes per delivery and a fifteen-minute interval. Measure actual trips and seats served per run before staffing changes.
5. Direct-booking coupon performance currently measures issuance and redemption. It does not establish incremental profit or prove that a discount caused extra sales.

## Research behind the MVP

Seat QR ordering, kitchen displays, interval pre-orders and per-screen sales reporting are already advertised by [TableTop](https://www.tabletop.co.in/theatre). [Vista's cinema F&B platform](https://www.vista.co/food-and-beverage) describes kitchen routing, stock control, order priority, preparation timing and seat delivery. These references support showing an integrated workflow in the demo; they do not prove that TheatreOS has a unique feature or that a local operator needs it.

[BookMyShow says it levies a convenience fee](https://support.bookmyshow.com/support/solutions/articles/4000188319-internet-handling-fee). A [Competition Commission of India order](https://cci.gov.in/images/antitrustorder/en/order1655369918.pdf) reports that BookMyShow's commercial terms with cinemas are negotiated. A direct cinema booking can improve the cinema's ability to issue ticket-linked food offers, but net profit depends on contract terms, demand brought by each channel, acquisition costs, payment costs, offer cost and resulting food sales. Do not hard-code a universal “BookMyShow commission saving.”
