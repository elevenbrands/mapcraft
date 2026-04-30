"""
Stripe payment endpoints for MapCraft

Flow:
  1. Frontend calls POST /api/sessions/{id}/checkout
     → backend creates a Stripe Checkout Session ($2.99)
     → returns {checkout_url}
  2. User completes payment on Stripe-hosted page
     → Stripe redirects to /session/{id}?paid=success
  3. Stripe fires POST /api/stripe/webhook (async, verified by signature)
     → on checkout.session.completed → writes paid.json marker to session dir

The export endpoint (/api/sessions/{id}/export/mcpack) reads paid.json
before allowing the download.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import stripe
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.file_ops import get_file_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Price: $2.99 USD — expressed in cents for Stripe
MAP_PRICE_CENTS = 299
MAP_CURRENCY = "usd"

PAID_FNAME = "paid.json"


def _storage_root() -> Path:
    return Path(settings.storage_path)


def _get_stripe():
    """Return configured Stripe module, raising 503 if not configured."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Payments are not configured on this server.",
        )
    stripe.api_key = settings.stripe_secret_key
    return stripe


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def is_session_paid(session_id: str) -> bool:
    """Return True if the session has a valid paid.json marker."""
    fs = get_file_service()
    paid_path = _storage_root() / session_id / PAID_FNAME
    return await fs.exists(paid_path)


async def mark_session_paid(session_id: str, stripe_session_id: str) -> None:
    """Write paid.json marker to the session directory."""
    fs = get_file_service()
    session_dir = _storage_root() / session_id
    paid_path = session_dir / PAID_FNAME
    await fs.write_text(
        paid_path,
        json.dumps(
            {
                "paid": True,
                "session_id": session_id,
                "stripe_session_id": stripe_session_id,
            },
            indent=2,
        ),
    )
    logger.info("Session %s marked as paid (stripe: %s)", session_id, stripe_session_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/checkout")
async def create_checkout_session(session_id: str):
    """
    Create a Stripe Checkout Session for downloading a map.

    Returns ``{checkout_url}`` — the frontend should redirect the user there.
    """
    _stripe = _get_stripe()

    # Verify session exists
    fs = get_file_service()
    session_dir = _storage_root() / session_id
    if not await fs.exists(session_dir):
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # If already paid, skip payment — return a direct download URL
    if await is_session_paid(session_id):
        return JSONResponse(
            content={
                "already_paid": True,
                "download_url": f"/api/sessions/{session_id}/export/mcpack",
            }
        )

    base = settings.public_url.rstrip("/")
    try:
        session = _stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": MAP_CURRENCY,
                        "product_data": {
                            "name": "🗺️ Mapa de Minecraft",
                            "description": (
                                "Tu mundo de Minecraft personalizado, "
                                "listo para descargar en tu tablet."
                            ),
                        },
                        "unit_amount": MAP_PRICE_CENTS,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{base}/session/{session_id}?paid=success",
            cancel_url=f"{base}/session/{session_id}?paid=cancelled",
            metadata={"session_id": session_id},
        )
    except stripe.StripeError as exc:
        logger.error("Stripe error creating checkout: %s", exc)
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc.user_message}") from exc

    return JSONResponse(content={"checkout_url": session.url})


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook endpoint.

    Verifies the signature and, on ``checkout.session.completed``,
    writes a ``paid.json`` marker to the session directory so the
    export endpoint will allow the download.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret:
        logger.warning("Stripe webhook received but STRIPE_WEBHOOK_SECRET not set — skipping.")
        return JSONResponse(content={"status": "ignored"})

    _get_stripe()
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError as exc:
        logger.warning("Invalid Stripe webhook signature: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    except Exception as exc:
        logger.error("Error constructing Stripe event: %s", exc)
        raise HTTPException(status_code=400, detail="Malformed event") from exc

    if event["type"] == "checkout.session.completed":
        checkout_session = event["data"]["object"]
        session_id: str | None = (checkout_session.get("metadata") or {}).get("session_id")
        stripe_session_id: str = checkout_session.get("id", "")

        if not session_id:
            logger.error("Webhook: checkout.session.completed missing session_id metadata")
            return JSONResponse(content={"status": "error", "detail": "missing session_id"})

        await mark_session_paid(session_id, stripe_session_id)

    return JSONResponse(content={"status": "ok"})


@router.get("/sessions/{session_id}/payment-status")
async def get_payment_status(session_id: str):
    """
    Check whether a session has been paid for.

    Returns ``{paid: bool}``.
    """
    paid = await is_session_paid(session_id)
    return JSONResponse(content={"paid": paid, "session_id": session_id})
