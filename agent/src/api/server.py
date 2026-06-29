"""
server.py — FastAPI backend for uploading PDFs and generating LiveKit tokens.
"""
from src.agent.rag import build_index
import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import AccessToken, VideoGrants
from dotenv import load_dotenv

# FIX: Load environment variables BEFORE importing our RAG logic
load_dotenv(".env.local")


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400, detail="Only PDF files are supported")

    doc_id = str(uuid.uuid4())

    os.makedirs("/tmp/uploads", exist_ok=True)
    file_location = f"/tmp/uploads/{file.filename}"
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
