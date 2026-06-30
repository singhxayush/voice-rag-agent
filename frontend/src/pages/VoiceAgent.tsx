import {Button} from "@/components/ui/button";

import {cn} from "@/lib/utils";
import {
  Settings,
  FileText,
  Loader2,
  Mic2,
  PlugZap,
  Radio,
  RefreshCcw,
  Upload,
  Volume2,
} from "lucide-react";
import {
  LiveKitRoom as LiveKitProvider,
  RoomAudioRenderer,
  StartAudio,
  useVoiceAssistant,
} from "@livekit/components-react";
import {useState, type ChangeEvent, type FormEvent} from "react";
import type { ApiErrorResponse, TokenResponse, UploadResponse } from "@/types/voice";



const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const LIVEKIT_URL =
  import.meta.env.VITE_LIVEKIT_URL ??
  "wss://voice-agent-jdunj741.livekit.cloud";

const readErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    return data.detail ?? data.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
};

const uploadDocument = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as UploadResponse;
};

const getLiveKitToken = async (docId: string): Promise<TokenResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/token?doc_id=${encodeURIComponent(docId)}`,
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as TokenResponse;
};

const formatAgentState = (state: string) =>
  state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");

// ─── Voice RAG Session ───────────────────────────────────────────────────────

const AgentStatus = () => {
  const {state} = useVoiceAssistant();
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";

  return (
    <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-full border border-white/10",
          isListening && "bg-emerald-500/15 text-emerald-300",
          isSpeaking && "bg-blue-500/15 text-blue-300",
          !isListening && !isSpeaking && "bg-white/5 text-white/60",
        )}
      >
        <Radio size={15} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-white/80">
          Agent {formatAgentState(state)}
        </p>
        <p className="text-[11px] text-white/35">
          {isListening
            ? "Listening for your question"
            : isSpeaking
              ? "Answering through LiveKit"
              : "Waiting for the voice agent"}
        </p>
      </div>
    </div>
  );
};

const VoiceRagSession = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docId, setDocId] = useState<string>();
  const [token, setToken] = useState<string>();
  const [roomName, setRoomName] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [connectRoom, setConnectRoom] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRoom = Boolean(token && roomName);
  const isConnecting = Boolean(token && connectRoom && !connected);
  const statusLabel = connected
    ? "Connected"
    : isConnecting
      ? "Connecting"
      : isUploading
        ? "Uploading"
        : docId
          ? "Ready"
          : selectedFile
            ? "PDF selected"
            : "Waiting for PDF";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Choose a PDF first.");
      return;
    }

    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Only PDF files are supported.");
      return;
    }

    setIsUploading(true);
    setConnectRoom(false);
    setConnected(false);
    setToken(undefined);
    setRoomName(undefined);
    setDocId(undefined);
    setError(null);

    try {
      const uploadResult = await uploadDocument(selectedFile);
      const tokenResult = await getLiveKitToken(uploadResult.doc_id);

      setDocId(uploadResult.doc_id);
      setToken(tokenResult.token);
      setRoomName(tokenResult.room_name);
      setConnectRoom(true);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setConnectRoom(false);
    setConnected(false);
    setToken(undefined);
    setRoomName(undefined);
    setDocId(undefined);
    setError(null);
  };

  return (
    <div className="flex min-h-full w-full flex-col items-center px-4 py-6">
      <div className="h-8 shrink-0" />

      <section className="flex w-full max-w-2xl flex-1 flex-col justify-center gap-4">
        <div>
          <p className="text-2xl font-medium text-white/85">Talk to your PDF</p>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/35">
            Upload a document, join the LiveKit room, then ask the agent by
            voice.
          </p>
        </div>

        <form
          onSubmit={handleUpload}
          className="rounded-md border border-white/10 bg-white/4 p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="pdf-upload"
              className="flex min-h-14 flex-1 cursor-pointer items-center gap-3 rounded-md border border-dashed border-white/15 bg-black/15 px-3 py-2 transition-colors hover:border-white/30 hover:bg-white/6"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/70">
                <FileText size={18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/80">
                  {selectedFile?.name ?? "Choose a PDF"}
                </p>
                <p className="text-[11px] text-white/35">
                  {selectedFile
                    ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                    : "The backend will index it before connecting"}
                </p>
              </div>
              <input
                id="pdf-upload"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>

            <Button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="h-11 rounded-md bg-blue-600 px-4 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              {isUploading ? "Uploading" : "Upload"}
            </Button>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </form>

        <div className="grid gap-3 rounded-md border border-white/10 bg-black/15 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium tracking-widest text-white/30 uppercase">
              Status
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
              <span
                className={cn(
                  "size-2 rounded-full",
                  connected
                    ? "bg-emerald-400"
                    : isConnecting
                      ? "bg-blue-400"
                      : "bg-white/25",
                )}
              />
              {statusLabel}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-widest text-white/30 uppercase">
              Document
            </p>
            <p className="mt-2 truncate text-sm text-white/80">
              {selectedFile?.name ?? "No document selected"}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-widest text-white/30 uppercase">
              Doc ID
            </p>
            <p className="mt-2 truncate text-xs text-white/55">
              {docId ?? "Pending upload"}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-widest text-white/30 uppercase">
              Room
            </p>
            <p className="mt-2 truncate text-xs text-white/55">
              {roomName ?? "Pending token"}
            </p>
          </div>
        </div>

        {hasRoom && (
          <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/4 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  connected
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/8 text-white/50",
                )}
              >
                {connected ? <Mic2 size={16} /> : <PlugZap size={16} />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white/80">
                  {connected ? "Microphone live" : "Voice room prepared"}
                </p>
                <p className="truncate text-[11px] text-white/35">
                  {connected
                    ? "Ask your question out loud"
                    : "Reconnect when you are ready"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConnectRoom((current) => !current)}
                className="h-9 rounded-md border border-white/10 px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                {connectRoom ? <PlugZap size={14} /> : <Volume2 size={14} />}
                {connectRoom ? "Disconnect" : "Reconnect"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                className="h-9 rounded-md border border-white/10 px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              >
                <RefreshCcw size={14} />
                Reset
              </Button>
            </div>
          </div>
        )}

        {hasRoom && (
          <LiveKitProvider
            token={token}
            serverUrl={LIVEKIT_URL}
            connect={connectRoom}
            audio
            video={false}
            onConnected={() => {
              setConnected(true);
              setError(null);
            }}
            onDisconnected={() => setConnected(false)}
            onError={(roomError) => {
              setConnected(false);
              setError(roomError.message);
            }}
            onMediaDeviceFailure={(_failure, kind) => {
              setError(
                kind
                  ? `Could not access your ${kind} device.`
                  : "Could not access your microphone.",
              );
            }}
            className="contents"
          >
            <RoomAudioRenderer />
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <AgentStatus />
              <StartAudio
                label="Enable speaker"
                className="flex h-full min-h-12 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/10 px-4 text-xs font-medium text-white/80 transition-colors hover:bg-white/15"
              />
            </div>
          </LiveKitProvider>
        )}
      </section>
    </div>
  );
};

// ─── Root Layout ──────────────────────────────────────────────────────────────

const AIChatLayout = () => {
  return (
    <div
      id="main-layout"
      className="fixed w-full flex h-screen overflow-hidden"
    >
      {/* Top-right actions */}
      <div className={cn("absolute top-2 right-2 z-10 p-4")}>
        <Settings size={20} />
      </div>

      {/* Main content area */}
      <div className="flex h-screen w-full flex-col bg-[#221E27]">
        {/* Scrollable chat area — Outlet renders the current route here */}
        <div className="no-scrollbar flex min-h-0  flex-col overflow-y-scroll">
          <VoiceRagSession />
        </div>
      </div>
    </div>
  );
};

export default AIChatLayout;
