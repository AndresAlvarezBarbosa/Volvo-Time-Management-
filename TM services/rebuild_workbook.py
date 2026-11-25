#!/usr/bin/env python3
# Rebuild the Excel workbook the TM app originally ingested.
# Source: TM/WebApp/data.json (a snapshot of the parsed data).
# Output: TM-Workbook.xlsx with three sheets named exactly as the Swift
# ingest engine looks for: "Actuals", "Employee Loggs", "WBS Records".

import json
import sys
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "TM" / "WebApp" / "data.json"
OUT = ROOT / "TM-Workbook.xlsx"


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def write_header(ws, headers):
    bold = Font(bold=True)
    fill = PatternFill("solid", fgColor="DDDDDD")
    for col, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = bold
        cell.fill = fill


def build_actuals(ws, records):
    headers = ["PN", "Date", "Hours", "Activity Type", "WBS Element", "Short ID", "Name"]
    write_header(ws, headers)
    for i, r in enumerate(records, start=2):
        ws.cell(row=i, column=1, value=r.get("pn", ""))
        d = parse_iso(r.get("date"))
        c = ws.cell(row=i, column=2, value=d)
        if d:
            c.number_format = "mm/dd/yyyy"
        ws.cell(row=i, column=3, value=r.get("hours", 0))
        ws.cell(row=i, column=4, value=r.get("activity", ""))
        ws.cell(row=i, column=5, value=r.get("wbs", ""))
        ws.cell(row=i, column=6, value=r.get("shortId", ""))
        ws.cell(row=i, column=7, value=r.get("name", ""))


def build_employees(ws, employees):
    headers = ["PN", "Name", "Brand", "Function", "Manager", "Status", "Type", "Last Logged"]
    write_header(ws, headers)
    for i, e in enumerate(employees, start=2):
        ws.cell(row=i, column=1, value=e.get("pn", ""))
        ws.cell(row=i, column=2, value=e.get("name", ""))
        ws.cell(row=i, column=3, value=e.get("brand", ""))
        ws.cell(row=i, column=4, value=e.get("func", ""))
        ws.cell(row=i, column=5, value=e.get("manager", ""))
        ws.cell(row=i, column=6, value=e.get("status", "Active"))
        ws.cell(row=i, column=7, value=e.get("type", "Employee"))
        d = parse_iso(e.get("lastLogged"))
        c = ws.cell(row=i, column=8, value=d)
        if d:
            c.number_format = "mm/dd/yyyy"


def build_wbs(ws, wbs_rows):
    headers = ["WBS Element", "Short ID", "Activity Type", "Last Record",
               "Hours Total", "Type", "Status", "Project", "Project Type"]
    write_header(ws, headers)
    for i, w in enumerate(wbs_rows, start=2):
        ws.cell(row=i, column=1, value=w.get("wbs", ""))
        ws.cell(row=i, column=2, value=w.get("shortId", ""))
        ws.cell(row=i, column=3, value=w.get("activity", ""))
        d = parse_iso(w.get("lastRecord"))
        c = ws.cell(row=i, column=4, value=d)
        if d:
            c.number_format = "mm/dd/yyyy"
        ws.cell(row=i, column=5, value=w.get("hoursTotal", 0))
        ws.cell(row=i, column=6, value=w.get("type", "Unknown"))
        ws.cell(row=i, column=7, value=w.get("status", "Active"))
        ws.cell(row=i, column=8, value=w.get("project", ""))
        ws.cell(row=i, column=9, value=w.get("projectType", ""))


def main():
    if not DATA.exists():
        print(f"data.json not found at {DATA}", file=sys.stderr)
        sys.exit(1)

    with DATA.open() as f:
        data = json.load(f)

    records = data.get("records", [])
    employees = data.get("employees", [])
    wbs_rows = data.get("wbs", [])

    wb = Workbook()
    actuals_ws = wb.active
    actuals_ws.title = "Actuals"
    build_actuals(actuals_ws, records)

    emp_ws = wb.create_sheet("Employee Loggs")
    build_employees(emp_ws, employees)

    wbs_ws = wb.create_sheet("WBS Records")
    build_wbs(wbs_ws, wbs_rows)

    wb.save(OUT)
    print(f"Wrote {OUT}")
    print(f"  Actuals:        {len(records):>6} rows")
    print(f"  Employee Loggs: {len(employees):>6} rows")
    print(f"  WBS Records:    {len(wbs_rows):>6} rows")


if __name__ == "__main__":
    main()
