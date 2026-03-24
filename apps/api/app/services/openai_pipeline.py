from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.core.config import Settings
from app.core.hackathon import HACKATHON_CONTEXT
from app.models.schemas import (
    CompanyContactRecord,
    CompanyRecord,
    CompanyResearch,
    ContactDiscoveryResult,
    GeneratedEmail,
    GeneratedLinkedInMessage,
    LeadershipInsight,
    LeadershipResearch,
    UnifiedContext,
)


SchemaModel = TypeVar("SchemaModel", bound=BaseModel)
EM_DASH_PATTERN = re.compile(r"[ \t]*—[ \t]*")
MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
EXCESSIVE_BLANK_LINES_PATTERN = re.compile(r"\n{3,}")
WHITESPACE_PATTERN = re.compile(r"\s+")


class GeneratedOutreachBundle(BaseModel):
    email: GeneratedEmail
    linkedin_message: GeneratedLinkedInMessage


class OpenAIJSONAgent:
    def __init__(self, client: OpenAI, model: str, use_web_search: bool = False) -> None:
        self.client = client
        self.model = model
        self.use_web_search = use_web_search

    def run(
        self,
        *,
        schema_model: type[SchemaModel],
        schema_name: str,
        system_prompt: str,
        user_prompt: str,
    ) -> SchemaModel:
        payload: dict[str, Any] = {
            "model": self.model,
            "instructions": system_prompt,
            "input": user_prompt,
            "text_format": schema_model,
        }
        if self.use_web_search:
            payload["tools"] = [{"type": "web_search_preview"}]

        response = self.client.responses.parse(**payload)
        if response.output_parsed is None:
            output_text = self._extract_output_text(response)
            raise RuntimeError(
                f"OpenAI response did not include parsed output for {schema_name}. "
                f"Raw output: {output_text}"
            )
        return response.output_parsed

    def _extract_output_text(self, response: Any) -> str:
        text = getattr(response, "output_text", None)
        if text:
            return text

        chunks: list[str] = []
        for item in getattr(response, "output", []):
            for content in getattr(item, "content", []):
                value = getattr(content, "text", None)
                if value:
                    chunks.append(value)
        if not chunks:
            raise RuntimeError("OpenAI response did not include any text output.")
        return "\n".join(chunks)


class OutreachPipeline:
    def __init__(self, settings: Settings) -> None:
        if not settings.has_openai:
            raise RuntimeError("OpenAI is not configured. Set OPENAI_API_KEY to generate templates.")

        client = OpenAI(api_key=settings.openai_api_key)
        self.company_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_research_model,
            use_web_search=True,
        )
        self.leadership_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_research_model,
            use_web_search=True,
        )
        self.contact_discovery_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_research_model,
            use_web_search=True,
        )
        self.context_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_generation_model,
            use_web_search=False,
        )
        self.outreach_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_generation_model,
            use_web_search=False,
        )
        self.humanizer_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_generation_model,
            use_web_search=False,
        )

    def build_program_context(self, campaign_context: str | None = None) -> dict[str, Any]:
        normalized_campaign_context = campaign_context.strip() if campaign_context else ""
        return {
            "default_program_context": HACKATHON_CONTEXT,
            "user_campaign_brief": normalized_campaign_context or None,
        }

    def research_company(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
    ) -> CompanyResearch:
        return self.company_agent.run(
            schema_model=CompanyResearch,
            schema_name="company_research",
            system_prompt=(
                "You are a company research agent. Research only public information. "
                "Prefer official websites, reputable news, and directly attributable material. "
                "If something is unknown, leave the field empty instead of guessing. "
                "Use the provided sponsorship program brief to decide which company details matter most."
            ),
            user_prompt=(
                f"Research this company for sponsorship outreach.\n\n"
                f"Company name: {company.name}\n"
                f"Website hint: {company.website or 'unknown'}\n"
                f"Industry hint: {company.industry or 'unknown'}\n"
                f"Internal notes: {company.notes or 'none'}\n\n"
                "Sponsorship program brief:\n"
                f"{json.dumps(program_context, indent=2)}\n\n"
                "Return the company's mission, values, products/services, recent news, "
                "partnerships, positioning, and why it fits this sponsorship program."
            ),
        )

    def research_leadership(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
    ) -> LeadershipResearch:
        return self.leadership_agent.run(
            schema_model=LeadershipResearch,
            schema_name="leadership_research",
            system_prompt=(
                "You are a leadership research agent. Research public executives, founders, or relevant partnership leaders. "
                "Pull only attributable quotes or themes from public sources. "
                "If you cannot confirm a person or quote, omit it. "
                "Prioritize leaders or teams most relevant to sponsorship, partnerships, engineering, CSR, education, or recruiting."
            ),
            user_prompt=(
                f"Find leadership and public messaging themes for {company.name}.\n"
                f"Website hint: {company.website or 'unknown'}\n"
                f"Industry hint: {company.industry or 'unknown'}\n\n"
                "Sponsorship program brief:\n"
                f"{json.dumps(program_context, indent=2)}\n\n"
                "Return likely decision makers, their tone, public messaging themes, and any trustworthy quote snippets."
            ),
        )

    def synthesize_context(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
        company_research: CompanyResearch,
        leadership_research: LeadershipResearch,
    ) -> UnifiedContext:
        company_payload = company.model_dump(mode="json")
        context_payload = {
            "company": company_payload,
            "program_context": program_context,
            "company_research": company_research.model_dump(mode="json"),
            "leadership_research": leadership_research.model_dump(mode="json"),
        }
        return self.context_agent.run(
            schema_model=UnifiedContext,
            schema_name="unified_context",
            system_prompt=(
                "You synthesize research into a concise sponsorship context memo. "
                "Prioritize factual alignment between the company and the sponsorship program."
            ),
            user_prompt=(
                "Create a sponsorship context memo using the JSON below.\n\n"
                f"{json.dumps(context_payload, indent=2)}"
            ),
        )

    def discover_missing_contacts(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
        existing_contacts: list[CompanyContactRecord],
    ) -> ContactDiscoveryResult:
        existing_contact_summary = [
            {
                "full_name": contact.full_name,
                "role_title": contact.role_title,
                "email": contact.email,
                "linkedin_url": contact.linkedin_url,
                "reach_channel": contact.reach_channel,
                "raw_contact": contact.raw_contact,
                "is_primary": contact.is_primary,
            }
            for contact in existing_contacts
        ]
        return self.contact_discovery_agent.run(
            schema_model=ContactDiscoveryResult,
            schema_name="contact_discovery_result",
            system_prompt=(
                "You are a contact discovery agent for IEEE IES UNILAG sponsorship outreach. "
                "Use public information and web search to find the best outreach routes for a company.\n\n"
                "Your goals are:\n"
                "- Find one official company contact route, preferably a public company email on the official domain.\n"
                "- Find one individual who is relevant to sponsorship, partnerships, CSR, innovation, engineering, talent, university engagement, or brand/community programs.\n"
                "- Choose the individual whose remit best matches the campaign brief.\n\n"
                "Rules:\n"
                "- Use only public, attributable information.\n"
                "- Prefer official company websites, official staff pages, and credible public profiles.\n"
                "- Never invent or guess private email addresses.\n"
                "- If an individual email is not publicly verifiable, provide their LinkedIn URL or another public route instead.\n"
                "- If the company inbox is not public but there is an official contact page or form, return that as the reach channel.\n"
                "- Avoid duplicates of contacts already present unless you can clearly improve the quality of the record.\n"
                "- Explain briefly why the selected individual fits this specific campaign brief."
            ),
            user_prompt=(
                "Find the missing outreach contacts for this sponsor.\n\n"
                f"Company name: {company.name}\n"
                f"Website hint: {company.website or 'unknown'}\n"
                f"Industry hint: {company.industry or 'unknown'}\n"
                f"Internal notes: {company.notes or 'none'}\n\n"
                "Campaign brief:\n"
                f"{json.dumps(program_context, indent=2)}\n\n"
                "Existing imported contacts:\n"
                f"{json.dumps(existing_contact_summary, indent=2)}\n\n"
                "Return one official company contact and one recommended individual contact."
            ),
        )

    def write_contact_outreach(
        self,
        company: CompanyRecord,
        contact: CompanyContactRecord,
        program_context: dict[str, Any],
        unified_context: UnifiedContext,
        leadership_research: LeadershipResearch,
    ) -> GeneratedOutreachBundle:
        prompt_payload = self._build_outreach_prompt_payload(
            company,
            contact,
            program_context,
            unified_context,
            leadership_research,
        )
        bundle = self.outreach_agent.run(
            schema_model=GeneratedOutreachBundle,
            schema_name="generated_outreach_bundle",
            system_prompt=(
                "You write highly personalized sponsorship outreach for IEEE IES UNILAG. "
                "Your goal is to make the company feel like the message was written specifically for them, "
                "not like a template with the company name swapped in.\n\n"
                "Use this hook technique:\n"
                "- Study the company's public identity, including its tagline, mission, recent campaigns, and what it says it stands for.\n"
                "- Find one specific tension, contradiction, or dependency in that positioning that this engineering program helps solve.\n"
                "- Open with a sharp real-world problem, not with generic flattery.\n"
                "- Bridge that problem back to why it matters to this company or this person specifically.\n"
                "- Never write phrases like 'as a leading company in X'. Show the fit instead.\n\n"
                "Email requirements:\n"
                "- This is cold outreach, so the email must earn attention quickly.\n"
                "- Use 2 or 3 short paragraphs plus a short bullet list.\n"
                "- Keep it tight, ideally 130 to 170 words.\n"
                "- Surface the sponsorship ask by paragraph two.\n"
                "- Include what the sponsorship enables as outcome-focused bullets.\n"
                "- End with a soft, confident invitation to talk.\n"
                "- If the recipient is an individual, address only that person. Never write '[name] and team'.\n"
                "- If the recipient is a team or generic inbox, write to the team or company.\n\n"
                "LinkedIn requirements:\n"
                "- Write a separate LinkedIn message for the same recipient.\n"
                "- Keep it much shorter, ideally 45 to 80 words.\n"
                "- One compact note is better than multiple long paragraphs.\n"
                "- Preserve specificity and the company/person hook.\n\n"
                "Tone requirements:\n"
                "- Direct and confident, not desperate.\n"
                "- Warm but not over-polished.\n"
                "- Thoughtful, precise, and commercially credible.\n"
                "- No placeholders, no cliches, no exaggerated flattery, and no em dashes."
            ),
            user_prompt=(
                "Create one email draft and one LinkedIn message draft using this JSON context.\n\n"
                f"{json.dumps(prompt_payload, indent=2)}"
            ),
        )
        return self._normalize_outreach_bundle(bundle)

    def humanize_contact_outreach(
        self,
        company: CompanyRecord,
        contact: CompanyContactRecord,
        program_context: dict[str, Any],
        unified_context: UnifiedContext,
        leadership_research: LeadershipResearch,
        draft_bundle: GeneratedOutreachBundle,
    ) -> GeneratedOutreachBundle:
        prompt_payload = self._build_outreach_prompt_payload(
            company,
            contact,
            program_context,
            unified_context,
            leadership_research,
        )
        humanized = self.humanizer_agent.run(
            schema_model=GeneratedOutreachBundle,
            schema_name="humanized_outreach_bundle",
            system_prompt=(
                "You are the humanizer agent in a sponsorship outreach pipeline. "
                "Rewrite the provided drafts so they sound like a thoughtful human organizer wrote them. "
                "Keep the verified facts, company references, sponsorship intent, and core ask. "
                "Do not invent claims, names, numbers, quotes, partnerships, or outcomes.\n\n"
                "Your job is to remove AI writing tells such as generic praise, overly balanced sentence rhythm, "
                "stiff transitions, and vague abstraction. Keep the hook sharp and specific.\n\n"
                "Rules:\n"
                "- The email is cold outreach, so keep it lean and easy to scan.\n"
                "- Preserve the strongest company- or person-specific angle.\n"
                "- If the recipient is an individual, keep the note clearly personal. Do not add 'and team'.\n"
                "- Keep the email within roughly 130 to 170 words.\n"
                "- Keep the LinkedIn message concise and conversational.\n"
                "- Use commas or periods instead of em dashes.\n"
                "- Do not sound like marketing automation."
            ),
            user_prompt=(
                "Humanize these drafts while preserving their facts and intent.\n\n"
                f"{json.dumps({'context': prompt_payload, 'drafts': draft_bundle.model_dump(mode='json')}, indent=2)}"
            ),
        )
        return self._normalize_outreach_bundle(humanized)

    def _build_outreach_prompt_payload(
        self,
        company: CompanyRecord,
        contact: CompanyContactRecord,
        program_context: dict[str, Any],
        unified_context: UnifiedContext,
        leadership_research: LeadershipResearch,
    ) -> dict[str, Any]:
        matched_insight = self._match_contact_to_leadership(contact, leadership_research)
        contact_profile = {
            "display_name": self._contact_display_name(contact),
            "recipient_type": "individual" if self._is_individual_contact(contact) else "team",
            "full_name": contact.full_name,
            "role_title": contact.role_title,
            "email": contact.email,
            "linkedin_url": contact.linkedin_url,
            "raw_contact": contact.raw_contact,
            "reach_channel": contact.reach_channel,
            "notes": contact.notes,
            "matched_public_signal": matched_insight.model_dump(mode="json")
            if matched_insight
            else None,
        }
        return {
            "company": company.model_dump(mode="json"),
            "contact": contact_profile,
            "program_context": program_context,
            "unified_context": unified_context.model_dump(mode="json"),
            "leadership_themes": leadership_research.model_dump(mode="json"),
        }

    def _match_contact_to_leadership(
        self,
        contact: CompanyContactRecord,
        leadership_research: LeadershipResearch,
    ) -> LeadershipInsight | None:
        best_score = 0
        best_match: LeadershipInsight | None = None
        contact_name = self._normalize_match_text(contact.full_name)
        contact_role = self._normalize_match_text(contact.role_title)
        for insight in leadership_research.decision_makers:
            score = 0
            insight_name = self._normalize_match_text(insight.name)
            insight_role = self._normalize_match_text(insight.role)
            if contact_name and insight_name:
                shared_name_tokens = set(contact_name.split()) & set(insight_name.split())
                score += len(shared_name_tokens) * 3
                if contact_name == insight_name:
                    score += 4
            if contact_role and insight_role:
                shared_role_tokens = set(contact_role.split()) & set(insight_role.split())
                score += len(shared_role_tokens)
            if score > best_score:
                best_score = score
                best_match = insight
        return best_match if best_score > 0 else None

    def _normalize_match_text(self, value: str | None) -> str:
        if not value:
            return ""
        cleaned = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
        return WHITESPACE_PATTERN.sub(" ", cleaned).strip()

    def _is_individual_contact(self, contact: CompanyContactRecord) -> bool:
        if contact.full_name:
            lowered = contact.full_name.lower()
            if any(
                token in lowered
                for token in (
                    "team",
                    "desk",
                    "office",
                    "foundation",
                    "support",
                    "partnerships",
                    "partnership",
                    "communications",
                    "marketing",
                    "careers",
                    "hr",
                    "admin",
                )
            ):
                return False
            return True
        raw_contact = (contact.raw_contact or "").lower()
        if any(token in raw_contact for token in ("mr ", "mrs ", "ms ", "dr ", "prof ")):
            return True
        return False

    def _contact_display_name(self, contact: CompanyContactRecord) -> str:
        if self._is_individual_contact(contact) and contact.full_name:
            return contact.full_name
        if contact.raw_contact:
            return contact.raw_contact
        if contact.email:
            return contact.email
        return "the sponsorship team"

    def _normalize_outreach_bundle(
        self,
        bundle: GeneratedOutreachBundle,
    ) -> GeneratedOutreachBundle:
        return bundle.model_copy(
            update={
                "email": self._normalize_email_style(bundle.email),
                "linkedin_message": self._normalize_linkedin_style(bundle.linkedin_message),
            }
        )

    def _normalize_email_style(self, generated_email: GeneratedEmail) -> GeneratedEmail:
        def clean_inline(text: str) -> str:
            without_em_dashes = EM_DASH_PATTERN.sub(", ", text)
            return MULTISPACE_PATTERN.sub(" ", without_em_dashes).strip()

        def clean_markdown(text: str) -> str:
            normalized = text.replace("\r\n", "\n").replace("\r", "\n")
            normalized = EM_DASH_PATTERN.sub(", ", normalized)
            normalized = MULTISPACE_PATTERN.sub(" ", normalized)
            normalized = re.sub(r"[ \t]+\n", "\n", normalized)
            normalized = EXCESSIVE_BLANK_LINES_PATTERN.sub("\n\n", normalized)
            return normalized.strip()

        def clean_html(text: str) -> str:
            normalized = text.replace("\r\n", "\n").replace("\r", "\n")
            normalized = EM_DASH_PATTERN.sub(", ", normalized)
            normalized = MULTISPACE_PATTERN.sub(" ", normalized)
            normalized = EXCESSIVE_BLANK_LINES_PATTERN.sub("\n\n", normalized)
            return normalized.strip()

        return generated_email.model_copy(
            update={
                "subject": clean_inline(generated_email.subject),
                "preview_line": clean_inline(generated_email.preview_line),
                "body_markdown": clean_markdown(generated_email.body_markdown),
                "body_html": clean_html(generated_email.body_html),
                "personalization_highlights": [
                    clean_inline(item) for item in generated_email.personalization_highlights
                ],
            }
        )

    def _normalize_linkedin_style(
        self,
        message: GeneratedLinkedInMessage,
    ) -> GeneratedLinkedInMessage:
        def clean_text(text: str) -> str:
            normalized = text.replace("\r\n", "\n").replace("\r", "\n")
            normalized = EM_DASH_PATTERN.sub(", ", normalized)
            normalized = MULTISPACE_PATTERN.sub(" ", normalized)
            normalized = re.sub(r"[ \t]+\n", "\n", normalized)
            normalized = EXCESSIVE_BLANK_LINES_PATTERN.sub("\n\n", normalized)
            return normalized.strip()

        return message.model_copy(
            update={
                "body_markdown": clean_text(message.body_markdown),
                "body_html": clean_text(message.body_html) if message.body_html else None,
                "personalization_highlights": [
                    WHITESPACE_PATTERN.sub(" ", EM_DASH_PATTERN.sub(", ", item)).strip()
                    for item in message.personalization_highlights
                ],
            }
        )
