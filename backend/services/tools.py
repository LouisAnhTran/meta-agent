import re
from langchain_core.tools import tool

TOOL_CATALOG = {
    "search_knowledge_base": {
        "name": "search_knowledge_base",
        "description": "Search the agent's knowledge base for answers to customer questions",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"}
            },
            "required": ["query"],
        },
        "always_enabled": True,
    },
    "get_application_status": {
        "name": "get_application_status",
        "description": "Look up a customer's card application status",
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The customer's user ID"}
            },
            "required": ["user_id"],
        },
    },
    "get_transaction_status": {
        "name": "get_transaction_status",
        "description": (
            "Look up the status of a card transaction. "
            "You MUST have a transaction ID before calling this — "
            "if the customer has not provided one, ask them for it first."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "transaction_id": {"type": "string", "description": "The transaction ID"}
            },
            "required": ["transaction_id"],
        },
    },
    "get_user_account": {
        "name": "get_user_account",
        "description": "Retrieve customer account details",
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The customer's user ID"}
            },
            "required": ["user_id"],
        },
    },
    "escalate_to_human": {
        "name": "escalate_to_human",
        "description": "Escalate the conversation to a human support agent",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for escalation"}
            },
            "required": ["reason"],
        },
    },
    "lookup_pricing": {
        "name": "lookup_pricing",
        "description": (
            "Look up pricing for a product. Valid products: 'Atome Card', "
            "'Premium Plan', 'VIP Plan'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string", "description": "Name of the product"}
            },
            "required": ["product_name"],
        },
    },
}


# --- Mock implementations ---

def mock_get_application_status(user_id: str) -> dict:
    statuses = ["approved", "pending_review", "documents_required", "rejected"]
    status = statuses[hash(user_id) % len(statuses)]
    return {
        "user_id": user_id,
        "status": status,
        "application_date": "2025-03-15",
        "last_updated": "2025-04-10",
        "notes": f"Application is currently {status}.",
    }


def mock_get_transaction_status(transaction_id: str) -> dict:
    if not re.match(r"^[A-Z0-9\-]{6,}$", transaction_id):
        return {
            "error": "invalid_transaction_id",
            "message": "Transaction ID format looks wrong. Please double-check it.",
        }
    outcomes = [
        {"status": "failed", "reason": "insufficient_balance"},
        {"status": "failed", "reason": "merchant_declined"},
        {"status": "pending", "reason": "awaiting_settlement"},
        {"status": "completed", "reason": None},
    ]
    result = outcomes[hash(transaction_id) % len(outcomes)]
    return {
        "transaction_id": transaction_id,
        **result,
        "amount": 1500.00,
        "currency": "PHP",
        "date": "2025-04-12",
    }


def mock_get_user_account(user_id: str) -> dict:
    tiers = ["standard", "premium", "vip"]
    return {
        "user_id": user_id,
        "name": f"Customer {user_id[-4:]}",
        "email": f"user{user_id[-4:]}@example.com",
        "tier": tiers[hash(user_id) % len(tiers)],
        "account_status": "active",
        "member_since": "2023-01-10",
    }


def mock_escalate_to_human(reason: str) -> dict:
    return {
        "escalated": True,
        "ticket_id": f"TKT-{abs(hash(reason)) % 100000:05d}",
        "message": "A human agent will contact you shortly.",
        "reason": reason,
    }


def mock_lookup_pricing(product_name: str) -> dict:
    prices = {
        "atome card": {"price": 0, "currency": "PHP", "notes": "Free to apply"},
        "premium plan": {"price": 299, "currency": "PHP", "notes": "Per month"},
        "vip plan": {"price": 999, "currency": "PHP", "notes": "Per month"},
    }
    key = product_name.lower()
    if key in prices:
        return {"product": product_name, **prices[key]}
    return {
        "product": product_name,
        "price": None,
        "message": f"No pricing found for '{product_name}'. Please contact support.",
    }


# --- LangChain tool wrappers ---

@tool
def get_application_status(user_id: str) -> dict:
    """Look up a customer's card application status."""
    return mock_get_application_status(user_id)


@tool
def get_transaction_status(transaction_id: str) -> dict:
    """Look up the status of a card transaction. You MUST have a transaction ID
    before calling this — if the customer has not provided one, ask them for it first."""
    return mock_get_transaction_status(transaction_id)


@tool
def get_user_account(user_id: str) -> dict:
    """Retrieve customer account details."""
    return mock_get_user_account(user_id)


@tool
def escalate_to_human(reason: str) -> dict:
    """Escalate the conversation to a human support agent."""
    return mock_escalate_to_human(reason)


@tool
def lookup_pricing(product_name: str) -> dict:
    """Look up pricing information for a product or service.

    Valid product_name values are: 'Atome Card', 'Premium Plan', 'VIP Plan'.
    Do not call this tool for any other product — instead, tell the customer
    we do not offer that product.
    """
    return mock_lookup_pricing(product_name)


LANGCHAIN_TOOL_REGISTRY = {
    "get_application_status": get_application_status,
    "get_transaction_status": get_transaction_status,
    "get_user_account": get_user_account,
    "escalate_to_human": escalate_to_human,
    "lookup_pricing": lookup_pricing,
    # search_knowledge_base is built per-request (binds agent_id) — see Step 4
}
