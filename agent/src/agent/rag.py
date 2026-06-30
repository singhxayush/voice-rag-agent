"""
rag.py — Document loading, chunking, embedding, and retrieval.
Uses Qdrant (Docker) + Google's text-embedding-004 model.
"""

import os
import uuid
import logging
from pathlib import Path
from typing import List

import pypdf
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from google import genai
from dotenv import load_dotenv

# FIX: Load env vars directly in this file BEFORE initializing any clients.
# This makes it completely immune to import-order bugs in other files.
load_dotenv(".env.local")

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150

COLLECTION_NAME = "knowledge_base"
TOP_K = 4

# Connect to local Qdrant instance
qdrant = QdrantClient(url="http://localhost:6333")

# This will now successfully find the GOOGLE_API_KEY
ai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def _init_collection():
    """Ensure Qdrant collection exists."""
    if not qdrant.collection_exists(COLLECTION_NAME):
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=3072,
                distance=Distance.COSINE,
            ))


def _get_embeddings(texts: List[str]) -> List[List[float]]:
    response = ai_client.models.embed_content(
        model="gemini-embedding-001",
        contents=texts,
    )

    return [embedding.values for embedding in response.embeddings]


def _load_pdf(path: Path) -> str:
    """Extract text from a PDF file."""
    reader = pypdf.PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def _chunk_text(text: str) -> List[str]:
    """Sliding window chunker."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def build_index(doc_path: str, doc_id: str) -> None:
    _init_collection()

    path = Path(doc_path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {doc_path}")

    text = _load_pdf(path)
    chunks = _chunk_text(text)

    logger.info(f"Split into {len(chunks)} chunks for doc_id: {doc_id}")

    if not chunks:
        logger.warning(f"No text extracted from {path.name}")
        return

    vectors = _get_embeddings(chunks)

    if len(vectors) != len(chunks):
        raise RuntimeError(
            f"Expected {len(chunks)} embeddings, got {len(vectors)}"
        )

    points = []

    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "doc_id": doc_id,
                    "source": path.name,
                    "chunk_index": i,
                    "content": chunk,
                },
            )
        )

    qdrant.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
    )

    logger.info(
        f"Indexed {len(points)} chunks into Qdrant for doc_id {doc_id}"
    )


def query(text: str, doc_id: str) -> List[dict]:
    _init_collection()

    vector = _get_embeddings([text])[0]

    search_result = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        query_filter=Filter(
            must=[
                FieldCondition(
                    key="doc_id",
                    match=MatchValue(value=doc_id),
                )
            ]
        ),
        limit=TOP_K,
    ).points

    chunks = []

    for hit in search_result:
        payload = hit.payload or {}

        chunks.append({
            "content": payload.get("content", ""),
            "source": payload.get("source", "unknown"),
        })

    return chunks


def answer(question: str, doc_id: str) -> str:
    """
    Retrieve relevant chunks and generate an answer using Gemini.
    """

    chunks = query(question, doc_id)

    if not chunks:
        return "I couldn't find any relevant information in the document."

    context = "\n\n".join(
        chunk["content"] for chunk in chunks
    )

    prompt = f"""
You are a helpful assistant that answers questions ONLY using the provided context.

If the answer cannot be found in the context, say:
"I couldn't find that information in the document."

Do not make up information.

Context:
{context}

Question:
{question}

Answer:
"""

    response = ai_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    return response.text
