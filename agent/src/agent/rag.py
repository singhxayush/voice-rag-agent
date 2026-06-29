"""
rag.py — Document loading, chunking, embedding, and retrieval.
Uses ChromaDB (in-memory) + Google's gemini-embedding-001 model.
"""

import os
import logging
from pathlib import Path
from typing import List

import pypdf
import chromadb
from chromadb.utils import embedding_functions

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500      # characters
CHUNK_OVERLAP = 50    # characters
COLLECTION_NAME = "knowledge_base"
TOP_K = 4


def _load_pdf(path: Path) -> str:
    """Extract text from a PDF file."""
    reader = pypdf.PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages)
    logger.info(
        f"Loaded PDF '{path.name}' — {len(reader.pages)} pages, {len(text)} chars")
    return text


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


def build_index(doc_path: str) -> chromadb.Collection:
    """
    Load a PDF, chunk it, embed it, store in an in-memory ChromaDB collection.
    Returns the collection ready for querying.
    """
    path = Path(doc_path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {doc_path}")

    text = _load_pdf(path)
    chunks = _chunk_text(text)
    logger.info(f"Split into {len(chunks)} chunks")

    # GoogleGeminiEmbeddingFunction reads GEMINI_API_KEY by default — your
    # Google AI Studio key works for both GOOGLE_API_KEY and GEMINI_API_KEY,
    # so we just mirror it into the env var Chroma expects.
    os.environ.setdefault(
        "GEMINI_API_KEY", os.environ.get("GOOGLE_API_KEY", ""))

    embedding_fn = embedding_functions.GoogleGeminiEmbeddingFunction(
        model_name="gemini-embedding-001",
        task_type="RETRIEVAL_DOCUMENT",
    )

    client = chromadb.Client()  # in-memory, no persistence needed for phase 1
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
    )

    ids = [f"chunk_{i}" for i in range(len(chunks))]
    metadatas = [{"source": path.name, "chunk_index": i}
                 for i in range(len(chunks))]

    collection.add(documents=chunks, ids=ids, metadatas=metadatas)
    logger.info(f"Indexed {len(chunks)} chunks into ChromaDB")

    return collection


def query(collection: chromadb.Collection, text: str) -> List[dict]:
    """
    Query the collection for chunks relevant to `text`.
    Returns list of dicts with 'content' and 'source'.
    """
    if collection.count() == 0:
        return []

    results = collection.query(
        query_texts=[text],
        n_results=min(TOP_K, collection.count()),
        include=["documents", "metadatas"],
    )

    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        chunks.append({
            "content": doc,
            "source": meta.get("source", "unknown"),
        })

    return chunks
