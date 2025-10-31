#!/usr/bin/env python3
"""
Simple Excel -> sqlite importer for AIIC_management
Features:
- dry-run by default (no DB commit)
- mapping file or automatic column matching
- transactional inserts with optional truncation
- automatic DB backup before committing
- optional date column conversion to unix seconds

Usage examples (PowerShell):
python .\scripts\import_excel.py --excel .\data.xlsx --sheet Sheet1 --table clients --db .\db.sqlite --commit
python .\scripts\import_excel.py --excel .\data.xlsx --sheet Sheet1 --table repay --mapping .\scripts\mapping.json --dry-run

Mapping JSON example (optional):
{
  "columns": {
    "Excel Column A": "client_number",
    "Excel Column B": "name",
    "Excel Column C": "phone"
  }
}

The script tries to match excel columns to DB columns case-insensitively when no mapping is provided.
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime

try:
    import pandas as pd
except Exception:
    print('Missing dependency: pandas (and openpyxl). Please run: pip install pandas openpyxl')
    raise


def read_mapping(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_table_columns(conn, table):
    cur = conn.execute(f"PRAGMA table_info('{table}')")
    cols = [row[1] for row in cur.fetchall()]
    return cols


def backup_db(db_path):
    if not os.path.exists(db_path):
        return None
    t = datetime.now().strftime('%Y%m%d_%H%M%S')
    bak = f"{db_path}.bak.{t}"
    shutil.copy2(db_path, bak)
    return bak


def to_unix_seconds(series):
    # convert pandas series to unix seconds (int), NaT -> None
    s = pd.to_datetime(series, errors='coerce')
    # floor to seconds
    s = s.dt.floor('s')
    # convert to int seconds, handle NaT
    return s.apply(lambda x: int(x.timestamp()) if pd.notnull(x) else None)


def main():
    p = argparse.ArgumentParser(description='Import Excel (.xlsx) to sqlite (AIIC_management)')
    p.add_argument('--excel', required=True, help='Path to excel file (.xlsx)')
    p.add_argument('--sheet', default=0, help='Sheet name or index (default: first sheet)')
    p.add_argument('--table', help='Target sqlite table name (required if no mapping file specifying table)')
    p.add_argument('--db', default='db.sqlite', help='Path to sqlite DB file (default: db.sqlite)')
    p.add_argument('--mapping', help='Optional JSON file that maps Excel columns to DB columns')
    p.add_argument('--commit', action='store_true', help='Actually write to DB; default is dry-run')
    p.add_argument('--truncate', action='store_true', help='If set and --commit, DELETE FROM target table before insert')
    p.add_argument('--date-cols', help='Comma-separated Excel column names to convert to unix seconds (e.g. "Due Date,Created")')
    p.add_argument('--batch', type=int, default=500, help='Batch size for executemany (default 500)')
    p.add_argument('--skip-errors', action='store_true', help='Skip rows that cause insert errors (non-atomic)')
    args = p.parse_args()

    excel_path = args.excel
    sheet = args.sheet
    table = args.table
    db_path = args.db
    mapping_path = args.mapping
    commit = args.commit
    truncate = args.truncate
    batch = args.batch
    skip_errors = args.skip_errors
    date_cols = [c.strip() for c in args.date_cols.split(',')] if args.date_cols else []

    if not os.path.exists(excel_path):
        print(f'Excel file not found: {excel_path}')
        sys.exit(2)

    print('Reading Excel...', excel_path)
    try:
        df = pd.read_excel(excel_path, sheet_name=sheet, engine='openpyxl')
    except Exception as e:
        print('Failed to read excel:', e)
        raise

    print('Columns in Excel:', list(df.columns))
    if df.empty:
        print('No rows found in the excel sheet. Exiting.')
        sys.exit(0)

    # optional mapping
    mapping = None
    if mapping_path:
        if not os.path.exists(mapping_path):
            print('Mapping file not found:', mapping_path)
            sys.exit(2)
        mapping = read_mapping(mapping_path)
        # mapping may contain a 'table' key
        if mapping.get('table') and not table:
            table = mapping.get('table')

    if not table:
        print('Target --table is required when mapping does not specify table.')
        sys.exit(2)

    # normalize column mapping: excel_col -> db_col
    col_map = {}
    if mapping and 'columns' in mapping:
        col_map = mapping['columns']
    else:
        # try auto-match: case-insensitive match of excel column names to table columns
        # will fetch table schema below to decide
        col_map = None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        db_cols = get_table_columns(conn, table)
    except Exception as e:
        print('Failed to get table columns for', table, e)
        conn.close()
        sys.exit(2)

    print('DB table columns:', db_cols)

    if col_map is None:
        # build mapping by case-insensitive matching
        excel_cols = list(df.columns)
        lowered = {c.lower(): c for c in excel_cols}
        col_map = {}
        for dbcol in db_cols:
            if dbcol.lower() in lowered:
                col_map[lowered[dbcol.lower()]] = dbcol
        if not col_map:
            print('No automatic matches found between excel columns and table columns. Provide --mapping to map columns.')
            conn.close()
            sys.exit(2)

    print('Column mapping (Excel -> DB):')
    for k, v in col_map.items():
        print(f'  "{k}" -> "{v}"')

    # subset dataframe to mapped columns and rename
    use_cols = [c for c in df.columns if c in col_map]
    if not use_cols:
        print('No Excel columns matched for import. Exiting.')
        conn.close()
        sys.exit(2)

    df2 = df[use_cols].rename(columns=col_map)

    # date columns conversion
    for dc in date_cols:
        if dc in df2.columns:
            print('Converting date column to unix seconds:', dc)
            df2[dc] = to_unix_seconds(df2[dc])

    # prepare rows: convert NaN to None
    df2 = df2.where(pd.notnull(df2), None)

    rows = df2.to_dict(orient='records')
    print(f'Prepared {len(rows)} rows for table "{table}" (dry-run={not commit})')
    print('Sample row:', rows[0] if rows else None)

    if not commit:
        print('\nDRY-RUN: no DB changes will be made. Use --commit to write to DB.')
        conn.close()
        sys.exit(0)

    # backup DB
    bak = backup_db(db_path)
    if bak:
        print('DB backup created at', bak)

    try:
        # start transaction
        cur.execute('BEGIN')
        if truncate:
            print('Truncating table', table)
            cur.execute(f'DELETE FROM "{table}"')

        # prepare insert
        insert_cols = [c for c in df2.columns if c in db_cols]
        if not insert_cols:
            raise RuntimeError('No insertable columns after intersecting with DB table columns.')
        placeholders = ','.join(['?'] * len(insert_cols))
        col_list_sql = ','.join([f'"{c}"' for c in insert_cols])
        sql = f'INSERT INTO "{table}" ({col_list_sql}) VALUES ({placeholders})'

        print('Insert SQL:', sql)

        # insert in batches
        batch_vals = []
        count = 0
        for r in rows:
            vals = [r.get(c) for c in insert_cols]
            batch_vals.append(vals)
            if len(batch_vals) >= batch:
                try:
                    cur.executemany(sql, batch_vals)
                    count += len(batch_vals)
                    batch_vals = []
                except Exception as e:
                    if skip_errors:
                        print('Batch insert error, skipping batch:', e)
                        batch_vals = []
                    else:
                        raise
        if batch_vals:
            cur.executemany(sql, batch_vals)
            count += len(batch_vals)

        conn.commit()
        print(f'Inserted {count} rows into {table}.')
    except Exception as e:
        conn.rollback()
        print('Error during insert, rolled back. Error:', e)
        if bak:
            print('DB backup retained at', bak)
        conn.close()
        sys.exit(3)

    conn.close()
    print('Done.')


if __name__ == '__main__':
    main()
