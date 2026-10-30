"""Repeatable external restaurant CSV -> SQLite and TheatreOS sample-only export."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import sqlite3

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data/analytics/raw/restaurant_sales.csv"
DEFAULT_DB = ROOT / "data/analytics/restaurant_analytics.sqlite"
DEFAULT_EXPORT = ROOT / "data/analytics/export/sample-records.json"
DEFAULT_REPORT = ROOT / "data/analytics/reports/quality.json"
REQUIRED = (
    "order_id", "date", "item_name", "item_type", "item_price", "quantity",
    "transaction_amount", "transaction_type", "received_by", "time_of_sale",
)
PERIODS = {"Morning", "Afternoon", "Evening", "Night", "Midnight"}


def parse_date(raw: str) -> str | None:
    """Observed source: slash dates have day > 12; ambiguous dashes use MM-DD-YYYY."""
    for fmt in ("%m/%d/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def decimal_value(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw)
        return value if value.is_finite() else None
    except (InvalidOperation, TypeError):
        return None


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def prepare_rows(csv_path: Path) -> tuple[list[dict], list[dict], dict]:
    frame = pd.read_csv(csv_path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    frame.columns = [str(column).strip().lower().replace(" ", "_") for column in frame.columns]
    missing = sorted(set(REQUIRED) - set(frame.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    if len(set(frame.columns)) != len(frame.columns):
        raise ValueError("Column names collide after normalization")
    frame = frame.loc[:, REQUIRED].fillna("").astype(str)
    for column in REQUIRED:
        frame[column] = frame[column].str.strip()
    frame["source_row_number"] = range(2, len(frame) + 2)
    duplicates = frame.duplicated(subset=list(REQUIRED), keep="first")
    valid, issues = [], []
    for index, row in frame.iterrows():
        reasons = []
        if bool(duplicates.iloc[index]):
            reasons.append("exact_duplicate")
        order_id, item_name, category = row["order_id"], row["item_name"], row["item_type"]
        if not order_id:
            reasons.append("missing_order_id")
        if not item_name:
            reasons.append("missing_item_name")
        if not category:
            reasons.append("missing_category")
        date = parse_date(row["date"])
        if date is None:
            reasons.append("invalid_date")
        price = decimal_value(row["item_price"])
        if price is None or price <= 0:
            reasons.append("invalid_item_price")
        quantity_number = decimal_value(row["quantity"])
        if quantity_number is None or quantity_number != quantity_number.to_integral_value():
            reasons.append("invalid_quantity")
        elif quantity_number <= 0:
            reasons.append("nonpositive_quantity_or_cancellation_like")
        amount = decimal_value(row["transaction_amount"])
        if amount is None or amount < 0:
            reasons.append("invalid_transaction_amount")
        if price is not None and price > 0 and quantity_number is not None and quantity_number > 0 and amount is not None and amount >= 0 and abs(price * quantity_number - amount) > Decimal("0.01"):
            reasons.append("amount_mismatch")
        period = row["time_of_sale"].title()
        if period not in PERIODS:
            reasons.append("invalid_time_of_sale")
        if reasons:
            issues.append({"rowNumber": int(row["source_row_number"]), "orderId": order_id or None, "reasons": reasons})
            continue
        valid.append({
            "rowNumber": int(row["source_row_number"]), "orderId": order_id,
            "date": date, "itemName": item_name, "category": category,
            "unitPrice": float(price), "quantity": int(quantity_number),
            "lineValue": float(amount), "transactionType": row["transaction_type"] or None,
            "timeOfSale": period,
        })
    # Keep a single, defensible category and order-level date/time per identifier.
    categories = defaultdict(Counter)
    for row in valid:
        categories[row["itemName"]][row["category"]] += 1
    expected_category = {name: counts.most_common(1)[0][0] for name, counts in categories.items()}
    order_metadata = defaultdict(set)
    for row in valid:
        order_metadata[row["orderId"]].add((row["date"], row["timeOfSale"], row["transactionType"]))
    conflicting_orders = {order_id for order_id, values in order_metadata.items() if len(values) > 1}
    clean = []
    for row in valid:
        reasons = []
        if row["category"] != expected_category[row["itemName"]]:
            reasons.append("inconsistent_item_category")
        if row["orderId"] in conflicting_orders:
            reasons.append("inconsistent_order_metadata")
        if reasons:
            issues.append({"rowNumber": row["rowNumber"], "orderId": row["orderId"], "reasons": reasons})
        else:
            clean.append(row)
    quality = {
        "sourceRows": len(frame), "validRows": len(clean), "rejectedRows": len(issues),
        "issueCounts": dict(sorted(Counter(reason for issue in issues for reason in issue["reasons"]).items())),
        "missingByColumn": {column: int((frame[column] == "").sum()) for column in REQUIRED},
        "missingTransactionTypeRows": int((frame["transaction_type"] == "").sum()),
        "dateMin": min((row["date"] for row in clean), default=None),
        "dateMax": max((row["date"] for row in clean), default=None),
        "dateFormatAssumption": "Both slash and hyphen dates parsed as month/day/year; hyphen dates are ambiguous in isolation.",
        "currency": "unspecified",
    }
    return clean, issues, quality


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS etl_runs (
  run_id INTEGER PRIMARY KEY, source_name TEXT NOT NULL, source_sha256 TEXT NOT NULL,
  completed_at TEXT NOT NULL, source_rows INTEGER NOT NULL, valid_rows INTEGER NOT NULL,
  rejected_rows INTEGER NOT NULL, date_min TEXT, date_max TEXT
);
CREATE TABLE IF NOT EXISTS external_products (
  product_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  UNIQUE(name, category)
);
CREATE TABLE IF NOT EXISTS external_orders (
  order_id TEXT PRIMARY KEY, order_date TEXT NOT NULL, time_of_sale TEXT NOT NULL,
  transaction_type TEXT
);
CREATE TABLE IF NOT EXISTS external_order_items (
  line_id INTEGER PRIMARY KEY, source_row_number INTEGER NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES external_orders(order_id),
  product_id TEXT NOT NULL REFERENCES external_products(product_id),
  unit_price REAL NOT NULL CHECK(unit_price > 0),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  line_value REAL NOT NULL CHECK(line_value >= 0)
);
CREATE TABLE IF NOT EXISTS data_quality_issues (
  issue_id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES etl_runs(run_id),
  source_row_number INTEGER NOT NULL, source_order_id TEXT, reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_orders_date ON external_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_external_items_order ON external_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_quality_run ON data_quality_issues(run_id);
"""


def run_pipeline(csv_path: Path = DEFAULT_CSV, db_path: Path = DEFAULT_DB,
                 export_path: Path = DEFAULT_EXPORT, report_path: Path = DEFAULT_REPORT) -> dict:
    csv_path, db_path = Path(csv_path), Path(db_path)
    export_path, report_path = Path(export_path), Path(report_path)
    if not csv_path.is_file():
        raise FileNotFoundError(f"Restaurant CSV not found: {csv_path}")
    records, issues, quality = prepare_rows(csv_path)
    source_hash = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.executescript(SCHEMA)
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            connection.execute("DELETE FROM external_order_items")
            connection.execute("DELETE FROM external_orders")
            connection.execute("DELETE FROM external_products")
            completed_at = datetime.now(timezone.utc).isoformat()
            cursor = connection.execute(
                "INSERT INTO etl_runs (source_name, source_sha256, completed_at, source_rows, valid_rows, rejected_rows, date_min, date_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (csv_path.name, source_hash, completed_at, quality["sourceRows"], quality["validRows"], quality["rejectedRows"], quality["dateMin"], quality["dateMax"]),
            )
            run_id = cursor.lastrowid
            for issue in issues:
                for reason in issue["reasons"]:
                    connection.execute("INSERT INTO data_quality_issues (run_id, source_row_number, source_order_id, reason) VALUES (?, ?, ?, ?)", (run_id, issue["rowNumber"], issue["orderId"], reason))
            products = {(row["itemName"], row["category"]) for row in records}
            for name, category in sorted(products):
                product_id = hashlib.sha256(f"{name}\0{category}".encode()).hexdigest()[:16]
                connection.execute("INSERT INTO external_products VALUES (?, ?, ?)", (product_id, name, category))
            orders = {}
            for row in records:
                orders[row["orderId"]] = (row["orderId"], row["date"], row["timeOfSale"], row["transactionType"])
            connection.executemany("INSERT INTO external_orders VALUES (?, ?, ?, ?)", orders.values())
            for row in records:
                product_id = hashlib.sha256(f"{row['itemName']}\0{row['category']}".encode()).hexdigest()[:16]
                connection.execute("INSERT INTO external_order_items (source_row_number, order_id, product_id, unit_price, quantity, line_value) VALUES (?, ?, ?, ?, ?, ?)", (row["rowNumber"], row["orderId"], product_id, row["unitPrice"], row["quantity"], row["lineValue"]))
    export_records = [{key: row[key] for key in ("orderId", "date", "itemName", "category", "unitPrice", "quantity", "lineValue", "timeOfSale")} for row in records]
    write_json(export_path, {"source": "external-restaurant-sample", "sourceSha256": source_hash, "records": export_records, "quality": quality})
    write_json(report_path, {"source": str(csv_path), "runId": run_id, **quality, "issues": issues})
    return {"runId": run_id, **quality, "sqlite": str(db_path), "export": str(export_path), "report": str(report_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    print(json.dumps(run_pipeline(args.csv, args.db, args.export, args.report), indent=2))


if __name__ == "__main__":
    main()
