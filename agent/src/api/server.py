import json
import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel
from src.agent.rag import answer

load_dotenv(".env.local")

PROMPT_FILE = os.path.join(".", "tmp", "custom_prompt.txt")
DEFAULT_PROMPT = (
    "You are a helpful voice assistant who answers questions about "
    "the document loaded into your knowledge base. "
    "Always call the search_knowledge_base tool before answering "
    "any question about its content — never guess or make things up. "
    "Keep responses short and conversational, since this is spoken aloud. "
    "Do not use markdown, emojis, or special formatting."
)


def _read_prompt() -> str:
    """Read the custom prompt file, falling back to the default."""
    try:
        with open(PROMPT_FILE, "r") as f:
            content = f.read().strip()
            return content if content else DEFAULT_PROMPT
    except FileNotFoundError:
        return DEFAULT_PROMPT

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # 2. LAZY IMPORT: Import this here!
    # Your formatter won't move it, and it will only load after env vars are set.
    from src.agent.rag import build_index

    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400, detail="Only PDF files are supported")

    doc_id = str(uuid.uuid4())
    upload_dir = os.path.join(".", "tmp", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_location = os.path.join(upload_dir, file.filename)

    with open(file_location, "wb") as f:
        f.write(await file.read())

    build_index(file_location, doc_id)

    return {"message": "Upload successful", "doc_id": doc_id, "filename": file.filename}


@app.get("/token")
async def get_livekit_token(doc_id: str):
    room_name = f"chat-{doc_id}"
    participant_identity = f"user-{uuid.uuid4().hex[:8]}"
    grant = VideoGrants(room=room_name, room_join=True)

    # Include the current custom prompt as participant metadata so the agent can read it
    participant_metadata = json.dumps({"custom_prompt": _read_prompt()})

    token = AccessToken(
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    token.with_identity(participant_identity)
    token.with_metadata(participant_metadata)
    token.with_grants(grant)

    return {"token": token.to_jwt(), "room_name": room_name}


class PromptRequest(BaseModel):
    prompt: str


@app.get("/prompt")
async def get_prompt():
    return {"prompt": _read_prompt()}


@app.put("/prompt")
async def update_prompt(req: PromptRequest):
    os.makedirs(os.path.dirname(PROMPT_FILE), exist_ok=True)
    with open(PROMPT_FILE, "w") as f:
        f.write(req.prompt)
    return {"prompt": req.prompt}


class AskRequest(BaseModel):
    doc_id: str
    question: str


@app.post("/ask")
async def ask_document(req: AskRequest):
    response = answer(req.question, req.doc_id)

    return {
        "answer": response
    }
