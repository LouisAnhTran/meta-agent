import db

# Full implementation in Step 4.
# Stub marks the agent ready immediately so CRUD flow works end-to-end.

async def run_indexing_pipeline(agent_id: str):
    await db.execute(
        "UPDATE agents SET status = 'ready', error_message = NULL WHERE id = $1",
        agent_id,
    )
