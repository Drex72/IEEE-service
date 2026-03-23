from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.core.config import Settings
from app.core.hackathon import HACKATHON_CONTEXT
from app.models.schemas import (
    CompanyRecord,
    CompanyResearch,
    GeneratedEmail,
    LeadershipResearch,
    UnifiedContext,
)


SchemaModel = TypeVar("SchemaModel", bound=BaseModel)
EM_DASH_PATTERN = re.compile(r"[ \t]*—[ \t]*")
MULTISPACE_PATTERN = re.compile(r"[ \t]{2,}")
EXCESSIVE_BLANK_LINES_PATTERN = re.compile(r"\n{3,}")


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
        self.context_agent = OpenAIJSONAgent(
            client=client,
            model=settings.openai_generation_model,
            use_web_search=False,
        )
        self.email_agent = OpenAIJSONAgent(
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

    def write_email(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
        unified_context: UnifiedContext,
    ) -> GeneratedEmail:
        company_payload = company.model_dump(mode="json")
        generated_email = self.email_agent.run(
            schema_model=GeneratedEmail,
            schema_name="generated_email",
            system_prompt=(
                "You write tailored sponsorship outreach emails for an engineering-focused sponsorship program. "
                "This is cold outreach, so the email must earn attention quickly. "
                "Open with a strong, company-specific hook in the first sentence. "
                "Keep the message human, specific, commercially credible, and concise. "
                "Do not use placeholders, cliches, exaggerated flattery, or em dashes. "
                "Use commas or periods instead of em dashes."
            ),
            user_prompt=(
                "Write one personalized outreach email using this context.\n\n"
                f"{json.dumps({'company': company_payload, 'context': unified_context.model_dump(mode='json'), 'program_context': program_context}, indent=2)}\n\n"
                "Requirements:\n"
                "- This is a cold email, so the first sentence must hook quickly with a concrete, credible company-specific angle\n"
                "- Professional but warm tone\n"
                "- Reference the company's mission, products, or public themes naturally\n"
                "- Explain the fit in as few words as possible\n"
                "- Include one concrete sponsorship or partnership ask\n"
                "- Surface the ask by the second paragraph at the latest\n"
                "- Keep the subject line crisp, non-generic, and ideally under 7 words\n"
                "- Keep the body short, ideally 110 to 150 words, and never exceed 170 words\n"
                "- Use at most 3 short paragraphs\n"
                "- Avoid throat-clearing, generic event exposition, and long scene-setting\n"
                "- Never use em dashes; use commas or periods instead\n"
                "- Return both markdown and simple HTML"
            ),
        )
        return self._normalize_email_style(generated_email)

    def humanize_email(
        self,
        company: CompanyRecord,
        program_context: dict[str, Any],
        unified_context: UnifiedContext,
        draft_email: GeneratedEmail,
    ) -> GeneratedEmail:
        company_payload = company.model_dump(mode="json")
        humanized_email = self.humanizer_agent.run(
            schema_model=GeneratedEmail,
            schema_name="humanized_email",
            system_prompt=(
                "You are the humanizer agent in a sponsorship outreach pipeline. "
                "Rewrite the provided draft so it sounds like a thoughtful human organizer wrote it. "
                "Keep the same verified facts, company references, sponsorship intent, and core ask. "
                "Do not invent claims, names, numbers, quotes, partnerships, or outcomes. "
                "Remove obvious AI writing tells such as over-polished transitions, generic flattery, "
                "balanced list-like cadence, and stiff phrasing. "
                "Aim for natural professional writing that feels specific, direct, and credible. "
                "Make the opening hook sharper if needed, but keep it factual and company-specific. "
                "Tighten the draft aggressively for cold outreach, so it reads fast. "
                "Keep the draft roughly the same length or slightly shorter. "
                "Do not use placeholders, cliches, or em dashes. Use commas or periods instead."
            ),
            user_prompt=(
                "Humanize this sponsorship outreach email while preserving its factual content.\n\n"
                f"{json.dumps({'company': company_payload, 'context': unified_context.model_dump(mode='json'), 'program_context': program_context, 'draft_email': draft_email.model_dump(mode='json')}, indent=2)}\n\n"
                "Requirements:\n"
                "- Keep the email specific to the company and the program\n"
                "- Preserve the concrete sponsorship ask\n"
                "- Strengthen the opening hook if it feels soft or generic\n"
                "- Sound like a real human operator, not a model polishing copy\n"
                "- Keep the tone warm, confident, and commercially grounded\n"
                "- Surface the ask by the second paragraph at the latest\n"
                "- Keep the body short, ideally 110 to 150 words, and never exceed 170 words\n"
                "- Use at most 3 short paragraphs\n"
                "- Never use em dashes\n"
                "- Return both markdown and simple HTML"
            ),
        )
        return self._normalize_email_style(humanized_email)

    def generate_outreach(
        self,
        company: CompanyRecord,
        campaign_context: str | None = None,
    ) -> tuple[GeneratedEmail, dict[str, Any]]:
        normalized_campaign_context = campaign_context.strip() if campaign_context else ""
        effective_program_context = self.build_program_context(normalized_campaign_context)
        company_research = self.research_company(company, effective_program_context)
        leadership_research = self.research_leadership(company, effective_program_context)
        unified_context = self.synthesize_context(
            company,
            effective_program_context,
            company_research,
            leadership_research,
        )
        draft_email = self.write_email(
            company,
            effective_program_context,
            unified_context,
        )
        generated_email = self.humanize_email(
            company,
            effective_program_context,
            unified_context,
            draft_email,
        )

        generated_context = {
            "program_context": effective_program_context,
            "user_campaign_brief": normalized_campaign_context or None,
            "company_research": company_research.model_dump(mode="json"),
            "leadership_research": leadership_research.model_dump(mode="json"),
            "unified_context": unified_context.model_dump(mode="json"),
            "draft_email": draft_email.model_dump(mode="json"),
            "final_email": generated_email.model_dump(mode="json"),
        }
        return generated_email, generated_context

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
