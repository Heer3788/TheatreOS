import csv
from pathlib import Path
import sqlite3
import tempfile
import unittest

from etl import REQUIRED, prepare_rows, run_pipeline
from analyze import analyze_database


class ETLTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.csv = self.root / "source.csv"
        self.db = self.root / "analytics.sqlite"
        self.export = self.root / "export.json"
        self.report = self.root / "report.json"

    def write_rows(self, rows, columns=REQUIRED):
        with self.csv.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)

    def row(self, **overrides):
        value = dict(order_id="R1", date="4/13/2022", item_name="Coffee", item_type="Beverages", item_price="20", quantity="2", transaction_amount="40", transaction_type="Cash", received_by="Mr.", time_of_sale="Morning")
        value.update(overrides)
        return value

    def test_valid_multi_item_order_and_idempotence(self):
        self.write_rows([self.row(), self.row(item_name="Snack", item_type="Fastfood", item_price="10", quantity="1", transaction_amount="10")])
        first = run_pipeline(self.csv, self.db, self.export, self.report)
        self.assertEqual((first["sourceRows"], first["validRows"], first["rejectedRows"]), (2, 2, 0))
        second = run_pipeline(self.csv, self.db, self.export, self.report)
        self.assertEqual(second["validRows"], 2)
        with sqlite3.connect(self.db) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM external_orders").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM external_order_items").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM etl_runs").fetchone()[0], 2)
        summary = analyze_database(self.db, self.root / "powerbi")
        self.assertEqual(summary["orders"], 1)
        self.assertEqual(summary["recordedValue"], 50)
        self.assertTrue((self.root / "powerbi/daily_orders.csv").is_file())

    def test_missing_columns(self):
        self.write_rows([], columns=REQUIRED[:-1])
        with self.assertRaisesRegex(ValueError, "Missing required columns: time_of_sale"):
            prepare_rows(self.csv)

    def test_invalid_dates_numbers_duplicates_and_negative_quantity(self):
        valid = self.row()
        self.write_rows([valid, valid, self.row(order_id="R2", date="13-13-2022"), self.row(order_id="R3", item_price="oops"), self.row(order_id="R4", quantity="-2", transaction_amount="-40"), self.row(order_id="R5", transaction_amount="41")])
        records, issues, quality = prepare_rows(self.csv)
        self.assertEqual(len(records), 1)
        self.assertEqual(quality["rejectedRows"], 5)
        reasons = {reason for issue in issues for reason in issue["reasons"]}
        self.assertTrue({"exact_duplicate", "invalid_date", "invalid_item_price", "nonpositive_quantity_or_cancellation_like", "invalid_transaction_amount", "amount_mismatch"}.issubset(reasons))

    def test_empty_data_and_inconsistent_category_or_period(self):
        self.write_rows([])
        result = run_pipeline(self.csv, self.db, self.export, self.report)
        self.assertEqual(result["validRows"], 0)
        self.assertIsNone(result["dateMin"])
        self.write_rows([self.row(), self.row(order_id="R2", item_type="Fastfood"), self.row(order_id="R3", time_of_sale="Unknown")])
        _, _, quality = prepare_rows(self.csv)
        self.assertEqual(quality["validRows"], 1)
        self.assertEqual(quality["issueCounts"]["inconsistent_item_category"], 1)
        self.assertEqual(quality["issueCounts"]["invalid_time_of_sale"], 1)


if __name__ == "__main__":
    unittest.main()
