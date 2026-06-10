#!/usr/bin/env python3
"""
FMCK Nominal Roll — Data Preparation Script
============================================
Converts NORMINAL_ROLL_FOR_FMC_KUMO_AS_AT_APRIL_2026.xlsx
into a clean CSV ready for import into the FMCK Nominal Roll
Management System.

Usage:
  python3 prepare_import.py

Outputs:
  fmck_nominal_roll_import_ready.csv  — import this into the app
  fmck_import_report.txt              — data quality report

Author: FMCK Department of Administration
"""

import pandas as pd
import re
import csv
from datetime import datetime
from pathlib import Path

# ── CONFIG ─────────────────────────────────────────────────────────────────
INPUT_FILE  = "NORMINAL_ROLL_FOR_FMC_KUMO_AS_AT_APRIL_2026.xlsx"
OUTPUT_CSV  = "fmck_nominal_roll_import_ready.csv"
REPORT_FILE = "fmck_import_report.txt"
SHEET_NAME  = "Sheet2"
DEFAULT_STATUS   = "Active"
DEFAULT_LOCATION = "KUMO"

# ── COLUMN MAPPING: source → app schema ────────────────────────────────────
COLUMN_MAP = {
    "FIRST NAME"               : "FirstName",
    "SURNAME"                  : "Surname",
    "OTHER"                    : "OtherName",
    "GENDER"                   : "Gender",
    "PERMANENT ADDRESS "       : "PermanentAddress",
    "PERMANENT ADDRESS"        : "PermanentAddress",
    "DOB"                      : "DateOfBirth",
    "STATE"                    : "StateOfOrigin",
    "LGC"                      : "LGA",
    "GEOPOLITICAL ZONE"        : "GeopoliticalZone",
    "QUALIFICATION "           : "Qualification",
    "QUALIFICATION"            : "Qualification",
    "FOLDER NO./FILE_NO"       : "FolderNumber",
    "IPPIS_NUMBER"             : "IPPISNo",
    "PREVIOUS CONMESS/CONHESS" : "PreviousSalaryGrade",
    "ABSORBED CONMESS/CONHESS" : "AbsorbedSalaryGrade",
    "RANK"                     : "Rank",
    "1ST APPT."                : "DateOfFirstAppt",
    "CORNFIRM OF APPT."        : "DateOfConfirmation",
    "PRESENT APPT."            : "DateOfPresentAppt",
    "PHONE NUMBER"             : "Phone",
    "E-MAIL "                  : "Email",
    "E-MAIL"                   : "Email",
    "LOCATION"                 : "Location",
    "REMARK"                   : "Remarks",
}

# Output column order (matches app schema)
OUTPUT_COLUMNS = [
    "FolderNumber", "IPPISNo", "Surname", "FirstName", "OtherName",
    "Gender", "DateOfBirth", "PermanentAddress", "StateOfOrigin",
    "LGA", "GeopoliticalZone", "Qualification",
    "PreviousSalaryGrade", "AbsorbedSalaryGrade", "Rank",
    "Department", "Unit",
    "DateOfFirstAppt", "DateOfConfirmation", "DateOfPresentAppt",
    "Phone", "Email", "Location", "Status", "Remarks",
]

# ── RANK NORMALISATION ─────────────────────────────────────────────────────
# Auto-apply: high-confidence corrections
RANK_FIXES = {
    # Casing variants
    "Admin OFFICER II"                              : "ADMIN OFFICER II",
    "Admin Officer II"                              : "ADMIN OFFICER II",
    "CHIEF Med LAB sc"                              : "CHIEF MED LAB SC",
    "DENTAL SURGERY Technician"                     : "DENTAL SURGERY TECHNICIAN",
    "MEDICAL LABORATORY Scientist"                  : "MEDICAL LABORATORY SCIENTIST",
    "Dental Surgery Technician"                     : "DENTAL SURGERY TECHNICIAN",
    # Abbreviations & typos
    "ADMIN OFFICER 11"                              : "ADMIN OFFICER II",
    "SCIENTIFIC OFFICE I"                           : "SCIENTIFIC OFFICER I",
    "SCIENTIFIC OFFICE II"                          : "SCIENTIFIC OFFICER II",
    "SCIENTIFIC OFFICERS II"                        : "SCIENTIFIC OFFICER II",
    "SCIENTIFIC OFFICERII"                          : "SCIENTIFIC OFFICER II",
    "COMMUNITY HEALTHTECHNICIAN"                    : "COMMUNITY HEALTH TECHNICIAN",
    "ACCOUNTANT 1"                                  : "ACCOUNTANT I",
    "MED. LAB. TECH."                               : "MEDICAL LABORATORY TECHNICIAN",
    "PHARMACY TECH"                                 : "PHARMACY TECHNICIAN",
    "PRICIPAL NURSING OFFICER"                      : "PRINCIPAL NURSING OFFICER",
    "PRIN NURSING OFFICER"                          : "PRINCIPAL NURSING OFFICER",
    "PRIN PHYSOTHERAPIST"                           : "PRINCIPAL PHYSIOTHERAPY",
    "PRIN MEDICAL LABORATORY TECHNICIAN"            : "PRINCIPAL MEDICAL LABORATORY TECHNICIAN",
    "PRIN. HEALTH INFORMATION MANAGEMENT TECHNICIAN": "PRINCIPAL HEALTH INFORMATION MANAGEMENT TECHNICIAN",
    "ASSISTANT EXECUTIVE OFFICE ADMIN"              : "ASSISTANT EXECUTIVE OFFICER ADMIN",
    "ASSIT. EXECUTIVE OFFICER ADMIN"                : "ASSISTANT EXECUTIVE OFFICER ADMIN",
    "ASST EXECUTIVE OFFICER ADMIN"                  : "ASSISTANT EXECUTIVE OFFICER ADMIN",
    "ASST CHIEF DENTAL OFFICER"                     : "ASSISTANT CHIEF DENTAL OFFICER",
    "ASST CHIEF RADIOGRAPHER"                       : "ASSISTANT CHIEF RADIOGRAPHER",
    "ASST.CHIEF MED. LAB SC"                        : "ASSISTANT CHIEF MEDICAL LABORATORY SCIENTIST",
    "ASSISTANT EXECUTIVE OFFICER (GEN DUTY)"        : "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES",
    "ASSISTANT EXECUTIVE OFFICER GD"                : "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES",
    "ASSISTANT EXECUTIVE OFFICER GENERAL DUTY"      : "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES",
    "ASSISTANT EXECUTIVE OFFICER GEN DUTY"          : "ASSISTANT EXECUTIVE OFFICER GENERAL DUTIES",
    "ASSISTANT EXECUTIVE OFFICE ADMIN"              : "ASSISTANT EXECUTIVE OFFICER ADMIN",
    "HIGHER ASSIST. EXECUTIVE OFFICER"              : "HIGHER ASSISTANT EXECUTIVE OFFICER",
    "HIGHER EXECUTIVE OFFCER ACCOUNTS"              : "HIGHER EXECUTIVE OFFICER ACCOUNTS",
    "HIGHER EXECUTIVE OFFICERACCOUNTS"              : "HIGHER EXECUTIVE OFFICER ACCOUNTS",
    "HIGHER EXECUTIVE OFFICER ACCOUNT"              : "HIGHER EXECUTIVE OFFICER ACCOUNTS",
    "HIGHER INFORMATION MANAGEMENT OFFICER"         : "HIGHER HEALTH INFORMATION MANAGEMENT OFFICER",
    "HIGHER INFORMATION MANAGEMENT TECHNICIAN"      : "HIGHER HEALTH INFORMATION MANAGEMENT TECHNICIAN",
    "HIGHER XRAY TECHNICIAN"                        : "HIGHER X-RAY TECHNICIAN",
    "X-RAY TECHNICIAN"                              : "XRAY TECHNICIAN",
    "SCIENCE LAB TECH."                             : "SCIENCE LABORATORY TECHNICIAN",
    "SCIENTIFIC OFFICER"                            : "SCIENTIFIC OFFICER II",  # only 1 record
    "COMMUNITY HEALTH OFFICER II"                   : "COMMUNITY HEALTH OFFICER",
    "ENVIRONMENTAL HEALTH TECH"                     : "ENVIRONMENTAL HEALTH TECHNICIAN",
    "ENVIRONMENTAL OFFICER I"                       : "ENVIRONMENTAL OFFICER",
    "STAT OFFICER II"                               : "STATISTICAL OFFICER II",
    "NURSING OFFICER"                               : "NURSING OFFICER II",  # 1 record, check
    "NURSE"                                         : "STAFF NURSE",
    "COMMUNITY NURSE"                               : "STAFF NURSE",
    "SEN. MEDICAL LABORATORY TECHNOLOGIST"          : "SENIOR MEDICAL LABORATORY TECHNOLOGIST",
    "PRIN PHYSOTHERAPIST"                           : "PRINCIPAL PHYSIOTHERAPIST",
    "CATERING OFFICER ASSISTANT"                    : "ASSISTANT CATERING OFFICER",
    "CATERING OFFICER I"                            : "CATERING OFFICER",
    "PLANT OPERATION"                               : "PLANT OPERATOR",
    "CRAFTMAN CARPENTRY"                            : "CRAFTSMAN CARPENTRY",
    "CRAFTMAN PLANT OPERATOR"                       : "CRAFTSMAN PLANT OPERATOR",
    "DRIVER MOTOR MECHANIC I"                       : "MOTOR DRIVER MECHANIC I",
    "HEALTH INFORMATION MANAGEMENT"                 : "HEALTH INFORMATION MANAGEMENT OFFICER",
    "PRICIPAL NURSING OFFICER"                      : "PRINCIPAL NURSING OFFICER",
    "ASST. EXECUTIVE OFFICER ADMIN"                 : "ASSISTANT EXECUTIVE OFFICER ADMIN",
    "ASSISTANT EXECUTIVE OFFICER ACCOUNTS"          : "ASSISTANT EXECUTIVE OFFICER ACCOUNT",
    "POPULATION PROGRAM OFFICER"                    : "POPULATION PROGRAMME OFFICER",
    "POPULATION PROGRAM OFFICER I"                  : "POPULATION PROGRAMME OFFICER I",
    "POPULATION OFFICER II"                         : "POPULATION PROGRAMME OFFICER II",
    "PLANNING OFFICER"                              : "PLANNING OFFICER II",
    "PLANNING OFFICER I"                            : "PLANNING OFFICER",
    "MEDICAL SOCIAL WORKER"                         : "SOCIAL WELFARE OFFICER",
    "SENIOR WORKS SUPERINTENDENT"                   : "SENIOR WORKS SUPERINTENDENT",
}

# Flags for manual review — imported as-is but flagged in report
RANK_REVIEW = {
    "B. TECH SLT"           : "Cadre unclear — verify correct designation",
    "Building Technologist" : "Verify: intended as 'TECHNICAL OFFICER BUILDING'?",
    "HEALTH RECORD TECHNICIAN": "Verify: same as 'HEALTH INFORMATION MANAGEMENT TECHNICIAN'?",
    "CIVIL ENGINEER"        : "Verify: same as 'CIVIL ENGINEER I'?",
    "PSYCHOLOGIST"          : "Verify: same as 'PSYCHOLOGIST I'?",
    "DENTAL THERAPIST TECHNOLOGIST": "Verify cadre distinction from DENTAL SURGERY TECHNOLOGIST",
}

# ── DATE PARSER ─────────────────────────────────────────────────────────────
def parse_date(val):
    """Convert any date value to ISO YYYY-MM-DD string, or '' if unparseable."""
    if val is None:
        return ""
    s = str(val).strip()
    if not s or s.upper() in ("NULL", "NAN", "NONE", "N/A", "NA", "-"):
        return ""
    # Already a Python datetime (from openpyxl / pandas)
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    # Try common string formats
    fmts = [
        "%d/%m/%Y", "%d/%m/%y",
        "%d-%m-%Y", "%d-%m-%y",
        "%Y-%m-%d",
        "%-d/%-m/%Y", "%d/%m/%Y",
    ]
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    # Partial formats like "13/5/2024" — zero-pad then retry
    try:
        parts = re.split(r"[/\-]", s)
        if len(parts) == 3:
            d, m, y = parts
            return datetime(int(y), int(m), int(d)).strftime("%Y-%m-%d")
    except Exception:
        pass
    return s  # Return original if we can't parse

# ── CLEAN SCALAR ─────────────────────────────────────────────────────────────
def clean(val):
    """Strip whitespace and convert NULL-ish values to empty string."""
    if val is None:
        return ""
    s = str(val).strip()
    if s.upper() in ("NULL", "NAN", "NONE", "N/A"):
        return ""
    if s == "nan":
        return ""
    return s


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════
def main():
    print(f"\nReading {INPUT_FILE} ...")
    df = pd.read_excel(INPUT_FILE, sheet_name=SHEET_NAME)
    total_source = len(df)
    print(f"Source rows: {total_source}  |  Columns: {len(df.columns)}")

    # Rename columns via map (strip trailing spaces from source headers)
    rename = {}
    for col in df.columns:
        stripped = col.strip()
        if stripped in COLUMN_MAP:
            rename[col] = COLUMN_MAP[stripped]
        elif col in COLUMN_MAP:
            rename[col] = COLUMN_MAP[col]
    df.rename(columns=rename, inplace=True)

    records        = []
    skipped_blank  = []
    skipped_garbage= []
    rank_fixed     = {}
    rank_review    = {}
    missing_folder = []
    missing_ippis  = []
    dept_blank     = 0

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed, header is row 1

        # Skip completely blank rows
        surname   = clean(row.get("Surname",   ""))
        firstname = clean(row.get("FirstName", ""))
        if not surname and not firstname:
            skipped_blank.append(row_num)
            continue

        # Skip garbage rows (IPPIS looks like a date)
        ippis_raw = row.get("IPPISNo", "")
        ippis_str = clean(ippis_raw)
        if isinstance(ippis_raw, datetime):
            skipped_garbage.append({
                "row": row_num,
                "name": f"{surname} {firstname}",
                "reason": f"IPPIS field contains a date value: {ippis_raw}",
            })
            continue

        # Build record
        rec = {}
        for col in OUTPUT_COLUMNS:
            rec[col] = ""

        # Scalar fields
        for app_field in [
            "Surname","FirstName","OtherName","Gender","PermanentAddress",
            "StateOfOrigin","LGA","GeopoliticalZone","Qualification",
            "FolderNumber","IPPISNo","PreviousSalaryGrade","AbsorbedSalaryGrade",
            "Rank","Phone","Email","Location","Remarks",
        ]:
            rec[app_field] = clean(row.get(app_field, ""))

        # Date fields
        for app_field in ["DateOfBirth","DateOfFirstAppt","DateOfConfirmation","DateOfPresentAppt"]:
            rec[app_field] = parse_date(row.get(app_field))

        # Defaults
        rec["Department"] = ""
        rec["Unit"]       = ""
        rec["Status"]     = DEFAULT_STATUS
        if not rec["Location"]:
            rec["Location"] = DEFAULT_LOCATION

        # Normalize IPPIS (remove .0 from numeric)
        if rec["IPPISNo"]:
            try:
                rec["IPPISNo"] = str(int(float(rec["IPPISNo"])))
            except (ValueError, OverflowError):
                pass

        # RANK normalisation
        original_rank = rec["Rank"]
        if original_rank in RANK_FIXES:
            rec["Rank"] = RANK_FIXES[original_rank]
            rank_fixed[original_rank] = rec["Rank"]
        if original_rank in RANK_REVIEW:
            rank_review.setdefault(original_rank, []).append(
                f"Row {row_num}: {surname} {firstname} [{rec['FolderNumber']}]"
            )

        # Track missing fields
        if not rec["FolderNumber"]:
            missing_folder.append(f"Row {row_num}: {surname} {firstname} | IPPIS: {rec['IPPISNo']} | Rank: {rec['Rank']}")
        if not rec["IPPISNo"]:
            missing_ippis.append(f"Row {row_num}: {surname} {firstname} | Folder: {rec['FolderNumber']} | Rank: {rec['Rank']}")
        if not rec["Department"]:
            dept_blank += 1

        records.append(rec)

    # ── WRITE CSV ────────────────────────────────────────────────────────────
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(records)

    # ── WRITE REPORT ─────────────────────────────────────────────────────────
    report_lines = []
    def r(line=""): report_lines.append(line)

    r("=" * 70)
    r("FMCK NOMINAL ROLL — DATA PREPARATION REPORT")
    r(f"Generated: {datetime.now().strftime('%d %B %Y, %H:%M')}")
    r("=" * 70)
    r()
    r("SUMMARY")
    r("-" * 40)
    r(f"  Source rows (including header): {total_source + 1}")
    r(f"  Blank rows skipped:             {len(skipped_blank)}")
    r(f"  Garbage rows skipped:           {len(skipped_garbage)}")
    r(f"  Records exported to CSV:        {len(records)}")
    r(f"  Records missing Folder No.:     {len(missing_folder)}")
    r(f"  Records missing IPPIS No.:      {len(missing_ippis)}")
    r(f"  Records with blank Department:  {dept_blank}  ← assign in-app after import")
    r(f"  RANK variants auto-corrected:   {len(set(rank_fixed.keys()))}")
    r(f"  RANK values flagged for review: {len(rank_review)}")
    r()

    if skipped_garbage:
        r("GARBAGE ROWS SKIPPED (not imported)")
        r("-" * 40)
        for g in skipped_garbage:
            r(f"  Row {g['row']}: {g['name']}")
            r(f"    Reason: {g['reason']}")
        r()

    if missing_folder:
        r("RECORDS WITH NO FOLDER NUMBER")
        r("-" * 40)
        r("  These records were imported. Assign folder numbers in-app.")
        for m in missing_folder:
            r(f"  {m}")
        r()

    if missing_ippis:
        r("RECORDS WITH NO IPPIS NUMBER")
        r("-" * 40)
        r("  These records were imported. Verify IPPIS with IPPIS portal.")
        for m in missing_ippis:
            r(f"  {m}")
        r()

    if rank_fixed:
        r("RANK VARIANTS AUTO-CORRECTED")
        r("-" * 40)
        for orig, fixed in sorted(rank_fixed.items()):
            r(f"  '{orig}'  →  '{fixed}'")
        r()

    if rank_review:
        r("RANK VALUES FLAGGED FOR MANUAL REVIEW (imported as-is)")
        r("-" * 40)
        for rank_val, records_list in rank_review.items():
            r(f"  '{rank_val}' — {RANK_REVIEW.get(rank_val,'')}")
            for entry in records_list:
                r(f"    {entry}")
        r()

    r("DEPARTMENT/UNIT — ACTION REQUIRED")
    r("-" * 40)
    r("  The source spreadsheet does not contain a Department or Unit column.")
    r(f"  All {dept_blank} records have been imported with blank Department/Unit.")
    r("  After import, use the Nominal Roll tab to assign each staff member")
    r("  to their correct department and unit.")
    r()
    r("=" * 70)
    r(f"Output file: {OUTPUT_CSV}")
    r("Ready to import into FMCK Nominal Roll Management System.")
    r("=" * 70)

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    # Print report to console too
    print("\n".join(report_lines))


if __name__ == "__main__":
    main()
