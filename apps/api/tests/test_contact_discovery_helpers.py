from __future__ import annotations

from types import SimpleNamespace

from app.core.config import Settings
from app.models.schemas import (
    CompanyContactImport,
    CompanyContactRecord,
    CompanyImportRow,
    ContactDiscoveryResult,
    DiscoveredContact,
    ResearchSource,
)
from app.services.generation_worker import GenerationWorker
from app.services.supabase import SupabaseRepository


def make_contact(
    *,
    contact_id: str,
    full_name: str | None = None,
    role_title: str | None = None,
    email: str | None = None,
    raw_contact: str | None = None,
    linkedin_url: str | None = None,
    is_primary: bool = False,
) -> CompanyContactRecord:
    return CompanyContactRecord(
        id=contact_id,
        owner_key="owner",
        company_id="company",
        external_key=contact_id,
        full_name=full_name,
        role_title=role_title,
        email=email,
        raw_contact=raw_contact,
        linkedin_url=linkedin_url,
        is_primary=is_primary,
    )


def test_contact_coverage_requires_official_and_person_routes() -> None:
    repo = SupabaseRepository(Settings())

    generic_only = [
        make_contact(
            contact_id="official",
            email="info@example.com",
            raw_contact="Company Team",
            is_primary=True,
        )
    ]
    coverage = repo._contact_coverage(generic_only)

    assert coverage.has_official_company_contact is True
    assert coverage.has_individual_contact is False
    assert coverage.needs_discovery is True

    complete_roster = [
        *generic_only,
        make_contact(
            contact_id="person",
            full_name="Jane Doe",
            role_title="Partnerships Lead",
            email="jane.doe@example.com",
        ),
    ]
    complete_coverage = repo._contact_coverage(complete_roster)

    assert complete_coverage.has_official_company_contact is True
    assert complete_coverage.has_individual_contact is True
    assert complete_coverage.needs_discovery is False


def test_contact_coverage_ignores_invalid_email_values() -> None:
    repo = SupabaseRepository(Settings())

    invalid_official = [
        make_contact(
            contact_id="official",
            email="use linkedin or call office directly",
            raw_contact="General route",
            is_primary=True,
        ),
        make_contact(
            contact_id="person",
            full_name="Jane Doe",
            role_title="Innovation Lead",
            linkedin_url="https://www.linkedin.com/in/janedoe",
        ),
    ]

    coverage = repo._contact_coverage(invalid_official)

    assert repo._is_valid_email("use linkedin or call office directly") is False
    assert coverage.has_official_company_contact is False
    assert coverage.has_individual_contact is True
    assert coverage.needs_discovery is True


def test_contact_discovery_jobs_use_contact_specific_steps() -> None:
    repo = SupabaseRepository(Settings())

    steps = repo._steps_for_trigger("contact-discovery")

    assert [step.key for step in steps] == [
        "queue",
        "contact_gap_review",
        "official_contact_search",
        "decision_maker_search",
        "contact_save",
    ]


def test_worker_builds_discovered_contact_imports() -> None:
    worker = GenerationWorker(repo=None, pipeline=None)  # type: ignore[arg-type]
    discovery = ContactDiscoveryResult(
        company_name="Acme Power",
        search_summary="Found both target contacts.",
        official_company_contact=DiscoveredContact(
            email="partnerships@acmepower.com",
            reach_channel="Official partnerships inbox",
            rationale="Listed on the company's contact page.",
            sources=[
                ResearchSource(
                    title="Acme contact page",
                    url="https://acmepower.com/contact",
                )
            ],
        ),
        recommended_person_contact=DiscoveredContact(
            full_name="Ife Adebayo",
            role_title="Head of Brand Partnerships",
            email="ife.adebayo@acmepower.com",
            linkedin_url="https://www.linkedin.com/in/ife-adebayo",
            rationale="Owns external partnership programs that align with the campaign brief.",
        ),
    )
    company = SimpleNamespace(name="Acme Power", source_row=12)

    imports = worker._build_discovered_contacts(company, discovery)

    assert len(imports) == 2
    official, person = imports
    assert isinstance(official, CompanyContactImport)
    assert official.email == "partnerships@acmepower.com"
    assert official.is_primary is True
    assert person.full_name == "Ife Adebayo"
    assert person.role_title == "Head of Brand Partnerships"
    assert person.email == "ife.adebayo@acmepower.com"


def test_duplicate_company_rows_are_merged_before_upsert() -> None:
    repo = SupabaseRepository(Settings())
    first = CompanyImportRow(
        name="Acme Power",
        website="https://acmepower.com",
        contacts=[
            CompanyContactImport(
                external_key="contact-1",
                email="info@acmepower.com",
                is_primary=True,
            )
        ],
    )
    second = CompanyImportRow(
        name="  Acme   Power ",
        industry="Energy",
        notes="Second row note",
        contacts=[
            CompanyContactImport(
                external_key="contact-2",
                full_name="Jane Doe",
                role_title="Partnerships Lead",
                email="jane.doe@acmepower.com",
            )
        ],
    )

    merged = repo._dedupe_company_rows_for_upsert([first, second])

    assert len(merged) == 1
    assert merged[0].name == "Acme Power"
    assert merged[0].website == "https://acmepower.com"
    assert merged[0].industry == "Energy"
    assert len(merged[0].contacts) == 2
