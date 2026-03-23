from __future__ import annotations

import re
from datetime import date, datetime
from io import BytesIO
from typing import Any

from openpyxl import load_workbook

from app.models.schemas import CompanyImportRow, TrackerSummary


EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URL_PATTERN = re.compile(
    r"(?<!@)\b(?:https?://)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s]*)?"
)


class ExcelSponsorTrackerParser:
    def parse(self, file_bytes: bytes) -> tuple[list[CompanyImportRow], TrackerSummary | None]:
        workbook = load_workbook(BytesIO(file_bytes), data_only=True)
        sheet = workbook[workbook.sheetnames[0]]
        header_row_index, headers = self._locate_headers(sheet)
        rows: list[CompanyImportRow] = []

        for excel_row_index in range(header_row_index + 1, sheet.max_row + 1):
            row_values = [sheet.cell(row=excel_row_index, column=idx + 1).value for idx in range(len(headers))]
            normalized = {headers[idx]: self._stringify(value) for idx, value in enumerate(row_values)}
            company_name = normalized.get("company")
            if not company_name:
                continue
            if company_name.lower().startswith("status key"):
                continue

            contact_details = normalized.get("contact / email")
            contact_email = self._extract_email(contact_details)
            website = self._extract_website(contact_details, normalized.get("notes"))

            rows.append(
                CompanyImportRow(
                    name=company_name,
                    website=website,
                    industry=normalized.get("category"),
                    tier=normalized.get("tier"),
                    contact_email=contact_email,
                    contact_details=contact_details,
                    phone_or_address=normalized.get("phone / address"),
                    reach_channel=normalized.get("how to reach"),
                    notes=normalized.get("notes"),
                    status=normalized.get("status"),
                    source_row=excel_row_index,
                    metadata={
                        "date_sent": normalized.get("date sent"),
                        "follow_up_date": normalized.get("follow-up date"),
                        "index": normalized.get("#"),
                    },
                )
            )

        return rows, self._parse_summary_sheet(workbook)

    def _locate_headers(self, sheet: Any) -> tuple[int, list[str]]:
        for excel_row_index in range(1, min(sheet.max_row, 12) + 1):
            row_values = [self._stringify(cell.value) for cell in sheet[excel_row_index]]
            normalized_headers = [value.lower() if value else "" for value in row_values]
            if "company" in normalized_headers and "status" in normalized_headers:
                return excel_row_index, normalized_headers
        raise ValueError("Could not locate sponsor tracker headers.")

    def _parse_summary_sheet(self, workbook: Any) -> TrackerSummary | None:
        if len(workbook.sheetnames) < 2:
            return None

        sheet = workbook[workbook.sheetnames[1]]
        instructions: list[str] = []
        banner = self._stringify(sheet["A1"].value)
        tier_guide: str | None = None
        ieee_angle: str | None = None
        for row_index in range(2, sheet.max_row + 1):
            label = self._stringify(sheet.cell(row=row_index, column=1).value)
            detail = self._stringify(sheet.cell(row=row_index, column=2).value)
            if not label and not detail:
                continue
            if label and label.startswith("STEP") and detail:
                instructions.append(detail)
            if label == "TIER GUIDE":
                tier_guide = detail
            if label == "IEEE ANGLE":
                ieee_angle = detail

        return TrackerSummary(
            banner=banner,
            context_line=self._stringify(sheet["B2"].value),
            instructions=instructions,
            tier_guide=tier_guide,
            ieee_angle=ieee_angle,
        )

    def _extract_email(self, raw_value: str | None) -> str | None:
        if not raw_value:
            return None
        match = EMAIL_PATTERN.search(raw_value)
        return match.group(0).lower() if match else None

    def _extract_website(self, *values: str | None) -> str | None:
        for value in values:
            if not value:
                continue
            for match in URL_PATTERN.findall(value):
                candidate = match.strip(" /.,")
                if "@" in candidate:
                    continue
                if not candidate.startswith(("http://", "https://")):
                    candidate = f"https://{candidate}"
                return candidate

            email = self._extract_email(value)
            if email:
                return f"https://{email.split('@', maxsplit=1)[1]}"
        return None

    def _stringify(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        text = str(value).strip()
        return text or None
