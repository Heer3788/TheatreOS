# TheatreOS Business Insights analytics

Business Insights is a manager-only tab in the existing TheatreOS app. The live view reads the existing app state and calculates order, product, demand, pantry and fulfilment measures without writing to it. The separate restaurant sample view demonstrates a Python/Pandas ETL and a SQLite analytical model. It never becomes TheatreOS operational data.

## Data flow

`restaurant_sales.csv` → Pandas validation and cleaning → normalized SQLite tables + quality issues → sample-only JSON export → manager insights API → Business Insights tab.

The SQLite file is an **academic analytical store**, not a replacement for TheatreOS JSON or PostgreSQL persistence. The Node app reads the generated sample JSON; it does not need Pandas or SQLite at runtime. If the file is absent, the sample tab shows an import instruction. The Sites build can embed a generated sample export when one is available at build time.

The raw CSV and generated SQLite, report and export files are ignored by Git. The current source and its observed schema/date range are recorded in [SOURCE.md](SOURCE.md); formulae and inclusion rules are in [METRICS.md](METRICS.md).

## Run the ETL from the repository root

```sh
python3 -m venv .analytics-venv
.analytics-venv/bin/python -m pip install -r analytics/requirements.txt
mkdir -p data/analytics/raw
# Download the source CSV or copy a locally supplied file to this path:
# data/analytics/raw/restaurant_sales.csv
.analytics-venv/bin/python analytics/etl.py
.analytics-venv/bin/python analytics/analyze.py
```

The default paths can be changed with `--csv`, `--db`, `--export`, and `--report`. `SAMPLE_INSIGHTS_FILE` changes the Node server's sample export path. The ETL prints source, valid and rejected row counts; `data/analytics/reports/quality.json` contains row-level rejection reasons. It rejects exact duplicates, missing required identifiers, invalid dates, nonpositive or noninteger quantities, invalid prices or amounts, arithmetic mismatches, inconsistent item categories, inconsistent order-level metadata and unknown time-of-sale periods. Missing `transaction_type` values remain null. Hyphenated dates are parsed as month/day/year, an explicit source-specific assumption.

SQLite tables are `external_orders`, `external_order_items`, `external_products`, `etl_runs`, and `data_quality_issues`. Order ID is unique in `external_orders`; each valid CSV item row becomes one item row. Rerunning replaces the current external analytical records in one transaction and logs a new ETL run, so orders and items do not duplicate. Source row numbers and reasons remain available for audit. The export contains no seat identifiers, customer data, staff gender or payment-method values.

## Run and verify

Use the usual TheatreOS `npm start` command with its configured manager/employee PINs and session secret. Sign in as manager and choose **Business Insights**. The default is TheatreOS Live Data. Choose **Sample Restaurant Data** to see the separate imported sample. Dates filter order creation dates (UTC) for live records and source transaction dates for sample records. Refresh reloads the selected source. Missing or short history, invalid dates and an unavailable sample have explicit states.

```sh
npm test
.analytics-venv/bin/python -m unittest discover -s analytics -p 'test_*.py'
npm run build
```

The manager UI uses accessible HTML/CSS bars, existing TheatreOS colours and navigation, and no charting framework. It shows the data source, date basis, coverage and caveats. The Python tests use small fixtures; the full downloaded CSV is not needed to run them. `analytics/analyze.py` uses read-only SQL queries plus Pandas descriptive statistics, then writes daily, monthly, product and time-of-sale CSVs to the ignored `data/analytics/powerbi/` directory for a Power BI coursework view. Keep these restaurant sample visuals separate from TheatreOS order values.

## Limits and future work

The current TheatreOS seed is one-day demo data and checkout records no payment. Historical unit prices, inventory movements, restock events, wastage, and verified POS or ticketing transactions are absent. The restaurant source is educational and its currency is unspecified. Its file has period labels rather than exact times. Real cinema decisions need real F&B records, stock reconciliation, and more days of observations. No machine learning, ticket analysis, profit claim, or promotional-uplift claim is made here.
