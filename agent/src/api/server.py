import os
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel
from src.agent.rag import answer

# 1. Load env vars right away. The formatter will put this below the imports above.
load_dotenv(".env.local")

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

    token = AccessToken(
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET")
    )
    token.with_identity(participant_identity)
    token.with_grants(grant)

    return {"token": token.to_jwt(), "room_name": room_name}


class AskRequest(BaseModel):
    doc_id: str
    question: str


@app.post("/ask")
async def ask_document(req: AskRequest):
    response = answer(req.question, req.doc_id)

    return {
        "answer": response
    }
