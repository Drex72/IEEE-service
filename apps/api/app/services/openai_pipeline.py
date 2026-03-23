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
EM_DASH_PATTERN = re.compile(r"\s*[—]\s*")


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
                "The message must feel human, specific, and commercially credible. "
                "Do not use placeholders, cliches, exaggerated flattery, or em dashes. "
                "Use commas or periods instead of em dashes."
            ),
            user_prompt=(
                "Write one personalized outreach email using this context.\n\n"
                f"{json.dumps({'company': company_payload, 'context': unified_context.model_dump(mode='json'), 'program_context': program_context}, indent=2)}\n\n"
                "Requirements:\n"
                "- Professional but warm tone\n"
                "- Reference the company's mission, products, or public themes naturally\n"
                "- Explain why the program and the company align\n"
                "- Include a concrete sponsorship or partnership ask\n"
                "- Keep the subject line crisp and non-generic\n"
                "- Never use em dashes; use commas or periods instead\n"
                "- Return both markdown and simple HTML"
            ),
        )
        return self._normalize_email_style(generated_email)

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
        generated_email = self.write_email(
            company,
            effective_program_context,
            unified_context,
        )

        generated_context = {
            "program_context": effective_program_context,
            "user_campaign_brief": normalized_campaign_context or None,
            "company_research": company_research.model_dump(mode="json"),
            "leadership_research": leadership_research.model_dump(mode="json"),
            "unified_context": unified_context.model_dump(mode="json"),
        }
        return generated_email, generated_context

    def _normalize_email_style(self, generated_email: GeneratedEmail) -> GeneratedEmail:
        def clean(text: str) -> str:
            without_em_dashes = EM_DASH_PATTERN.sub(", ", text)
            return re.sub(r"\s{2,}", " ", without_em_dashes).strip()

        return generated_email.model_copy(
            update={
                "subject": clean(generated_email.subject),
                "preview_line": clean(generated_email.preview_line),
                "body_markdown": clean(generated_email.body_markdown),
                "body_html": clean(generated_email.body_html),
                "personalization_highlights": [
                    clean(item) for item in generated_email.personalization_highlights
                ],
            }
        )
