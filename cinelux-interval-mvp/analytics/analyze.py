"""Read-only SQLite/Pandas EDA and Power BI CSV exports for the restaurant sample."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3

import pandas as pd

from etl import DEFAULT_DB, ROOT, write_json

DEFAULT_OUTPUT = ROOT / "data/analytics/powerbi"
QUERIES = {
    "daily_orders": """
      SELECT o.order_date AS date, COUNT(DISTINCT o.order_id) AS orders,
             COUNT(i.line_id) AS item_rows, SUM(i.quantity) AS units,
             ROUND(SUM(i.line_value), 2) AS recorded_value
      FROM external_orders o JOIN external_order_items i ON i.order_id = o.order_id
      GROUP BY o.order_date ORDER BY o.order_date
    """,
    "monthly_orders": """
      SELECT substr(o.order_date, 1, 7) AS month, COUNT(DISTINCT o.order_id) AS orders,
             SUM(i.quantity) AS units, ROUND(SUM(i.line_value), 2) AS recorded_value
      FROM external_orders o JOIN external_order_items i ON i.order_id = o.order_id
      GROUP BY substr(o.order_date, 1, 7) ORDER BY month
    """,
    "products": """
      SELECT p.name AS product, p.category, COUNT(DISTINCT o.order_id) AS orders,
             SUM(i.quantity) AS units, ROUND(SUM(i.line_value), 2) AS recorded_value
      FROM external_order_items i JOIN external_orders o ON o.order_id = i.order_id
      JOIN external_products p ON p.product_id = i.product_id
      GROUP BY p.product_id ORDER BY units DESC, product
    """,
    "time_of_sale": """
      SELECT o.time_of_sale, COUNT(DISTINCT o.order_id) AS orders,
             SUM(i.quantity) AS units, ROUND(SUM(i.line_value), 2) AS recorded_value
      FROM external_orders o JOIN external_order_items i ON i.order_id = o.order_id
      GROUP BY o.time_of_sale ORDER BY orders DESC
    """,
}


def analyze_database(db_path: Path = DEFAULT_DB, output: Path = DEFAULT_OUTPUT) -> dict:
    db_path, output = Path(db_path), Path(output)
    if not db_path.is_file():
        raise FileNotFoundError(f"Analytics SQLite database not found: {db_path}")
    output.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
        tables = {name: pd.read_sql_query(query, connection) for name, query in QUERIES.items()}
        order_values = pd.read_sql_query("SELECT o.order_id, SUM(i.line_value) AS value FROM external_orders o JOIN external_order_items i ON i.order_id = o.order_id GROUP BY o.order_id", connection)
        latest_run = connection.execute("SELECT source_rows, valid_rows, rejected_rows, date_min, date_max FROM etl_runs ORDER BY run_id DESC LIMIT 1").fetchone()
    for name, frame in tables.items():
        frame.to_csv(output / f"{name}.csv", index=False)
    summary = {
        "source": "external-restaurant-sample",
        "sourceRows": latest_run[0] if latest_run else None,
        "validRows": latest_run[1] if latest_run else None,
        "rejectedRows": latest_run[2] if latest_run else None,
        "dateMin": latest_run[3] if latest_run else None,
        "dateMax": latest_run[4] if latest_run else None,
        "orders": int(len(order_values)),
        "recordedValue": round(float(order_values["value"].sum()), 2) if not order_values.empty else 0,
        "orderValueMean": round(float(order_values["value"].mean()), 2) if not order_values.empty else None,
        "orderValueMedian": round(float(order_values["value"].median()), 2) if not order_values.empty else None,
        "orderValueStandardDeviation": round(float(order_values["value"].std()), 2) if len(order_values) > 1 else None,
        "currency": "unspecified",
        "note": "Educational external restaurant sample, not TheatreOS or verified cinema transactions.",
    }
    write_json(output / "eda-summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(analyze_database(args.db, args.output), indent=2))


if __name__ == "__main__":
    main()
