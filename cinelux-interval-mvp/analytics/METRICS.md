# Business Insights metric definitions

The manager-only `GET /api/insights` endpoint accepts `source=live` (default) or `source=sample`, plus inclusive `from` and `to` dates in `YYYY-MM-DD`. The two responses never combine records or values.

## TheatreOS Live Data

All date filters use the UTC date of `orders[].createdAt`. The filter selects an order-creation cohort; delivered metrics describe which orders in that cohort are currently delivered. This is not a delivery-date series.

| Metric | Formula and source | Inclusion and limitation |
| --- | --- | --- |
| Orders created | Count unique `orders[]` selected by `createdAt` | All current statuses, including cancelled if such a record appears. No cancelled route exists today. |
| Delivered orders | Count selected orders with `status=delivered` | Status is the current state, not an event ledger. |
| Open orders | Selected orders excluding `delivered` and `cancelled` | Current state only. |
| Created order value | Sum `total` for selected non-cancelled orders | Includes open orders. No payment record exists, so this is **not paid revenue**. |
| Delivered order value | Sum `total` for selected delivered orders | Does not include open orders. Still not verified payment. |
| Average created order value | Created order value / selected non-cancelled order count | Null when denominator is zero. |
| Product ordered units | Sum `items[].qty` by menu item ID | Includes open orders. Unknown product IDs and invalid quantities are excluded. |
| Product order count | Unique selected orders containing a given product | An order with multiple lines of the same product counts once. |
| Category units | Product units grouped by current `menu[].category` | Category history is not stored. |
| Estimated current-menu item value | Product units × current `menu[].price` | Before discounts; historical line prices are not stored. Never present as exact net sales. |
| Orders by date/hour | Count selected orders by UTC creation date and hour | Observed orders only. With fewer than seven distinct dates, no recurring demand-pattern claim is made. |
| Pantry alert | Current `pantry[].onHand <= reorderAt`; refill-to-target = max(0, `target - onHand`) | Snapshot independent of date filter. Counts are manually maintained, not reconciled physical inventory. |
| Preparation duration | `readyAt - startedAt` in minutes | Delivered orders with both valid, ordered timestamps within 24 hours; count and denominator shown. |
| Ready-to-delivery duration | `deliveredAt - readyAt` | Same inclusion rule. |
| Order-to-delivery duration | `deliveredAt - createdAt` | Same inclusion rule. |

The live view labels a selected cohort **demo** only if every selected order explicitly has `demo: true`. Missing or mixed flags are labelled mixed/unknown. It does not infer a real order from the absence of a flag. Coupon records are not used as evidence of promotion uplift. Recipe demand, measured inventory consumption, ticket sales, profit and staffing recommendations are outside this feature's first version.

## External Sample Restaurant Data

The sample view reads only valid rows exported from the Python ETL's SQLite dataset. Its date filter uses the parsed source `date`; `time_of_sale` is a named period, not a clock hour. The source does not establish a currency.

| Metric | Formula and source | Inclusion and limitation |
| --- | --- | --- |
| Orders | Distinct `order_id` among selected valid rows | One order may have several item rows. |
| Item rows | Number of selected valid CSV rows | Separate from order count. |
| Recorded transaction value | Sum source `transaction_amount` | ETL verifies it equals `item_price × quantity` within 0.01. It is not independently verified payment. |
| Average recorded order value | Recorded transaction value / distinct orders | Null when there are no orders. |
| Product/category units | Sum valid `quantity` | Restaurant product names and categories only. |
| Product line value | Sum valid `transaction_amount` by product | Recorded source arithmetic, currency unspecified. |
| Orders by date/period | Unique orders by parsed date and source `time_of_sale` period | No exact hour field; period labels are not clock times. |

No pantry or fulfilment metrics are shown for the restaurant sample because the CSV has no such records. No sample amounts are added to TheatreOS order values. Recommendations in both views are deterministic descriptions of the selected records, with evidence and caveats.
