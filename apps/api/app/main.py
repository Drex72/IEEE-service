from __future__ import annotations

import re

import httpx
from openai import APIError as OpenAIAPIError
from openai import BadRequestError as OpenAIBadRequestError
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

from app.api.deps import get_app_settings, get_outreach_pipeline, get_repository
from app.api.routes import companies, gmail, templates
from app.services.generation_worker import GenerationWorker


settings = get_app_settings()
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(APIError)
async def handle_supabase_api_error(_: Request, exc: APIError) -> JSONResponse:
    if exc.code == "PGRST205" or "Could not find the table" in (exc.message or ""):
        table_match = re.search(r"table 'public\.([^']+)'", exc.message or "")
        table_name = table_match.group(1) if table_match else "required tables"
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": (
                    "Supabase schema is not initialized. "
                    f"Missing table: {table_name}. "
                    "Apply every SQL file in /Users/apple/Documents/IEEE/supabase/migrations "
                    "to your Supabase project, then retry."
                )
            },
        )

    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": exc.message or "Supabase request failed."},
    )


@app.exception_handler(OpenAIBadRequestError)
async def handle_openai_bad_request(_: Request, exc: OpenAIBadRequestError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": f"OpenAI request failed: {exc.message}"},
    )


@app.exception_handler(OpenAIAPIError)
async def handle_openai_api_error(_: Request, exc: OpenAIAPIError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": f"OpenAI request failed: {exc}"},
    )


@app.exception_handler(httpx.TransportError)
async def handle_transport_error(_: Request, exc: httpx.TransportError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": (
                "A temporary network error occurred while talking to an external service. "
                f"Please retry. ({exc})"
            )
        },
    )


app.include_router(companies.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(gmail.router, prefix="/api")


@app.on_event("startup")
async def start_generation_worker() -> None:
    if not settings.has_supabase or not settings.has_openai:
        return
    worker = GenerationWorker(
        repo=get_repository(),
        pipeline=get_outreach_pipeline(),
    )
    app.state.generation_worker = worker
    await worker.start()


@app.on_event("shutdown")
async def stop_generation_worker() -> None:
    worker = getattr(app.state, "generation_worker", None)
    if worker is None:
        return
    await worker.stop()
