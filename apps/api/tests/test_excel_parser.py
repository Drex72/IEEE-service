from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook

from app.services.excel import ExcelSponsorTrackerParser


def build_workbook() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sponsor Outreach Tracker"
    sheet["A1"] = "IES UNILAG 2026"
    headers = [
        "#",
        "Company",
        "Category",
        "Tier",
        "Contact / Email",
        "Phone / Address",
        "How to Reach",
        "Date Sent",
        "Status",
        "Follow-Up Date",
        "Notes",
    ]
    for col, value in enumerate(headers, start=1):
        sheet.cell(row=4, column=col, value=value)
    sheet.cell(row=6, column=1, value=1)
    sheet.cell(row=6, column=2, value="Arnergy Solar Ltd")
    sheet.cell(row=6, column=3, value="Energy / IoT Solar")
    sheet.cell(row=6, column=4, value="Gold")
    sheet.cell(row=6, column=5, value="info@arnergy.com")
    sheet.cell(row=6, column=7, value="Email partnerships")
    sheet.cell(row=6, column=9, value="📧 Not Sent")
    sheet.cell(
        row=6,
        column=11,
        value="IoT-enabled solar company with strong energy alignment.",
    )

    summary = workbook.create_sheet("Summary & Instructions")
    summary["A1"] = "HOW TO USE THIS TRACKER"
    summary["A2"] = "STEP 1"
    summary["B2"] = "Start with high-fit companies."
    summary["A9"] = "TIER GUIDE"
    summary["B9"] = "Gold, Silver, Bronze"
    summary["A10"] = "IEEE ANGLE"
    summary["B10"] = "Lead with IEEE credibility."

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_parser_extracts_company_rows() -> None:
    parser = ExcelSponsorTrackerParser()
    companies, summary = parser.parse(build_workbook())

    assert len(companies) == 1
    assert companies[0].name == "Arnergy Solar Ltd"
    assert companies[0].contact_email == "info@arnergy.com"
    assert companies[0].website == "https://arnergy.com"
    assert summary is not None
    assert summary.ieee_angle == "Lead with IEEE credibility."

