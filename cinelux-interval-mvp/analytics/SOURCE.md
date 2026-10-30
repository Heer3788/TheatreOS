# External dataset attribution and inspection

- **Dataset:** Balaji Fast Food Sales (1).csv
- **Source:** [Restaurant Sales report EDA and Analysis](https://github.com/VIJAYARAJAN2828/Restaurant-Sales-report-EDA-and-Analysis) by VIJAYARAJAN2828
- **Original filename:** `Balaji Fast Food Sales (1).csv`
- **Downloaded for this implementation:** 28 October 2026, from the repository's raw CSV URL
- **Source description:** Educational analysis of restaurant sales; the README reports 1,000 rows and ten columns and says `transaction_amount = item_price × quantity`. The repository does not establish independent payment verification or a currency.
- **Observed CSV:** 1,000 data rows and columns `order_id`, `date`, `item_name`, `item_type`, `item_price`, `quantity`, `transaction_amount`, `transaction_type`, `received_by`, `time_of_sale`.
- **Observed date range after parsing:** 2022-04-01 through 2023-03-30. There are 597 slash dates with an unambiguous month/day pattern (day > 12), and 403 hyphenated dates that are individually ambiguous. The ETL consistently interprets both as month/day/year and records this assumption in every quality report.
- **Observed quality:** 1,000 accepted rows, zero rejected rows under the documented checks; 107 missing `transaction_type` values retained as missing. All 1,000 source order IDs are unique in this file, although the ETL supports multiple item rows per order.
- **Source limitations:** Restaurant data, not cinema data; no verified provenance beyond the repository description; no independently verified payments, currency, exact sale hour, item cost, inventory, or fulfilment timestamps. No license file was present in the source repository listing inspected for this implementation; check redistribution terms before sharing the raw file.
- **Attribution:** Link to the source repository and author when showing sample-derived results. Never identify these values as TheatreOS or cinema sales.

The raw CSV is kept in the ignored `data/analytics/raw/restaurant_sales.csv` path. The ETL trims text, normalizes column headers, validates values, parses dates, checks amount arithmetic and category consistency, and loads valid rows into SQLite. It preserves rejected row numbers and reasons in the quality report and SQLite issue table. It excludes `received_by` and payment method from the TheatreOS UI export because neither is needed for the sample charts.
