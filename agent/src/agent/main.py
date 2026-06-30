"""
main.py — Voice RAG agent entrypoint.
STT/TTS/LLM via LiveKit Cloud Inference, RAG via Qdrant in rag.py.
"""

import logging
from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    inference,
)
# FIX: Removed the broken turn_detector import

from .rag import query as rag_query

logger = logging.getLogger("voice-rag-agent")
logger.setLevel(logging.INFO)

load_dotenv(".env.local")


def prewarm(proc: JobProcess) -> None:
    pass


class RagAgent(Agent):
    def __init__(self, doc_id: str) -> None:
        self._doc_id = doc_id
        super().__init__(
            instructions=(
                "You are a helpful voice assistant who answers questions about "
                "the document loaded into your knowledge base. "
                "Always call the search_knowledge_base tool before answering "
                "any question about its content — never guess or make things up. "
                "Keep responses short and conversational, since this is spoken aloud. "
                "Do not use markdown, emojis, or special formatting."
            )
        )

    @function_tool
    async def search_knowledge_base(self, context: RunContext, query: str) -> str:
        """
        Search the knowledge base for information relevant to the query.
        """

        logger.info(f"doc_id = {self._doc_id}")

        results = rag_query(query, self._doc_id)
        logger.info(results)
        if not results:
            return "No relevant information found in the knowledge base."

        return "\n\n".join(
            f"[Source: {r['source']}]\n{r['content']}" for r in results
        )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    room_name = ctx.room.name

    if not room_name.startswith("chat-"):
        raise RuntimeError(
            f"Invalid room name '{room_name}'. Expected chat-<doc_id>"
        )

    doc_id = room_name.removeprefix("chat-")

    logger.info(
        f"Connecting to room: {room_name} | Filtering by doc_id: {doc_id}")

    session = AgentSession(
        stt=inference.STT("deepgram/nova-3", language="en"),
        llm=inference.LLM(model="google/gemini-2.5-flash"),
        tts=inference.TTS("cartesia/sonic-3",
                          voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
        # FIX: Removed turn_detector argument, using default VAD
    )

    await session.start(
        agent=RagAgent(doc_id=doc_id),
        room=ctx.room,
    )

    await session.generate_reply(
        instructions="Greet the user and let them know you are ready to answer questions about their uploaded document."
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
