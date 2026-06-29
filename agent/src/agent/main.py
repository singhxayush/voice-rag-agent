"""
main.py — Voice RAG agent entrypoint.
STT/TTS via LiveKit Cloud Inference, LLM via Gemini 2.0 Flash, RAG via rag.py.
"""

import logging
from pathlib import Path

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
from livekit.plugins import google

# FIX: Relative import tells Python to look in the same directory for rag.py
from .rag import build_index, query as rag_query

logger = logging.getLogger("voice-rag-agent")
logger.setLevel(logging.INFO)

load_dotenv(".env.local")

DOC_PATH = Path(__file__).parent / "docs" / "resume.pdf"


def prewarm(proc: JobProcess) -> None:
    """Runs once per worker process, before any job — load heavy stuff here."""
    # FIX: Silero VAD removed here (LiveKit handles it natively now)
    proc.userdata["rag_collection"] = build_index(str(DOC_PATH))


class RagAgent(Agent):
    def __init__(self, rag_collection) -> None:
        self._rag_collection = rag_collection
        super().__init__(
            instructions=(
                "You are a helpful voice assistant who answers questions about "
                "the document loaded into your knowledge base (a resume). "
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
        Use this whenever the user asks something that might be answered
        by the loaded document.

        Args:
            query: A restatement of what the user wants to know, for search.
        """
        results = rag_query(self._rag_collection, query)
        if not results:
            return "No relevant information found in the knowledge base."

        return "\n\n".join(
            f"[Source: {r['source']}]\n{r['content']}" for r in results
        )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    session = AgentSession(
        # LiveKit Cloud STT (Built-in)
        stt=inference.STT("deepgram/nova-3", language="en"),

        # LiveKit Cloud LLM (Built-in, running Gemini) - THIS FIXES THE CRASH!
        llm=inference.LLM(model="google/gemini-2.5-flash"),

        # LiveKit Cloud TTS (Built-in)
        tts=inference.TTS("cartesia/sonic-3",
                          voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
    )

    await session.start(
        agent=RagAgent(ctx.proc.userdata["rag_collection"]),
        room=ctx.room,
    )

    await session.generate_reply(
        instructions=(
            "Greet the user briefly and let them know they can ask questions "
            "about the document you have loaded."
        )
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
