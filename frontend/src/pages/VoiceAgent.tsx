import {Button} from "@/components/ui/button";

import {cn} from "@/lib/utils";
import {
  Check,
  FileText,
  Loader2,
  MessageSquare,
  Mic2,
  PlugZap,
  Radio,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  LiveKitRoom as LiveKitProvider,
  RoomAudioRenderer,
  StartAudio,
  useVoiceAssistant,
  useTranscriptions,
  useLocalParticipant,
} from "@livekit/components-react";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type {ApiErrorResponse, TokenResponse, UploadResponse} from "@/types/voice";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
const LIVEKIT_URL =
  import.meta.env.VITE_LIVEKIT_URL ??
  "wss://voice-agent-jdunj741.livekit.cloud";

const PROMPT_STORAGE_KEY = "voice-rag-agent-prompt";

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

// ─── Prompt API helpers ──────────────────────────────────────────────────────

const fetchPrompt = async (): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt`);
    if (response.ok) {
      const data = (await response.json()) as {prompt: string};
      return data.prompt;
    }
  } catch {
    /* fall through to localStorage */
  }
  return localStorage.getItem(PROMPT_STORAGE_KEY) ?? "";
};

const savePrompt = async (prompt: string): Promise<void> => {
  localStorage.setItem(PROMPT_STORAGE_KEY, prompt);
  await fetch(`${API_BASE_URL}/prompt`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({prompt}),
  });
};

// ─── Transcription Panel ─────────────────────────────────────────────────────

const TranscriptionPanel = () => {
  const transcriptions = useTranscriptions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  if (transcriptions.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-black/15 p-4">
        <div className="flex items-center gap-2 text-white/35">
          <MessageSquare size={14} strokeWidth={1.7} />
          <p className="text-xs">
            Transcription will appear here once the conversation starts…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-white/10 bg-black/15 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} strokeWidth={1.7} className="text-white/50" />
          <p className="text-[10px] font-medium tracking-widest text-white/30 uppercase">
            Conversation
          </p>
          <span className="flex size-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-medium text-blue-300">
            {transcriptions.length}
          </span>
        </div>
        <span className="text-[10px] text-white/25">
          {isExpanded ? "collapse" : "expand"}
        </span>
      </button>

      {/* Messages */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="no-scrollbar flex max-h-72 flex-col gap-2.5 overflow-y-auto px-4 pt-1 pb-4"
        >
          {transcriptions.map((segment) => {
            const isAgent = segment.participantInfo?.identity?.startsWith("agent");
            return (
              <div
                // eslint-disable-next-line react-hooks/purity
                key={segment.streamInfo?.id ?? Math.random()}
                className={cn(
                  "flex flex-col gap-0.5",
                  isAgent ? "items-start" : "items-end",
                )}
              >
                <p className="px-1 text-[10px] font-medium text-white/25">
                  {isAgent ? "Agent" : "You"}
                </p>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                    isAgent
                      ? "bg-white/8 text-white/75"
                      : "bg-blue-500/15 text-blue-100",
                  )}
                >
                  {segment.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Prompt Updater ──────────────────────────────────────────────────────────

const PromptUpdater = () => {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    const handlePromptUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      if (localParticipant) {
        const payload = JSON.stringify({
          type: "update_prompt",
          prompt: customEvent.detail.prompt,
        });
        const data = new TextEncoder().encode(payload);
        localParticipant.publishData(data, { reliable: true });
      }
    };
    window.addEventListener("prompt-updated", handlePromptUpdated);
    return () => window.removeEventListener("prompt-updated", handlePromptUpdated);
  }, [localParticipant]);

  return null;
};

// ─── Settings Panel ──────────────────────────────────────────────────────────

const SettingsPanel = ({onClose}: {onClose: () => void}) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPrompt().then((p) => {
      setPrompt(p);
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await savePrompt(prompt);
      setSaved(true);
      window.dispatchEvent(
        new CustomEvent("prompt-updated", { detail: { prompt } }),
      );
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [prompt]);

  const handleReset = useCallback(async () => {
    const defaultPrompt = await fetchPrompt();
    setPrompt(defaultPrompt);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 m-3 flex h-[calc(100vh-24px)] w-full max-w-md flex-col rounded-xl border border-white/10 bg-[#1a1620]/95 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-white/8">
              <Settings size={15} className="text-white/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/85">Agent Settings</p>
              <p className="text-[11px] text-white/30">
                Customize the agent's system prompt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <label
              htmlFor="agent-prompt"
              className="mb-2 block text-[10px] font-medium tracking-widest text-white/30 uppercase"
            >
              System Prompt
            </label>
            {loading ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-white/10 bg-black/20">
                <Loader2 size={18} className="animate-spin text-white/30" />
              </div>
            ) : (
              <textarea
                id="agent-prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setSaved(false);
                }}
                rows={10}
                className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3.5 py-3 text-xs leading-relaxed text-white/80 placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                placeholder="Enter a system prompt for the agent…"
              />
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-white/25">
              This prompt instructs the agent how to behave. Changes apply on the
              next connection.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-white/8 px-5 py-3.5">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={loading}
            className="h-8 gap-1.5 rounded-md px-3 text-[11px] text-white/40 hover:bg-white/8 hover:text-white/70"
          >
            <RotateCcw size={13} />
            Reload
          </Button>

          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400/80">
                <Check size={13} />
                Saved
              </span>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={loading || saving}
              className="h-8 gap-1.5 rounded-md bg-blue-600 px-4 text-[11px] text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {saving ? "Saving…" : "Save Prompt"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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

            {/* Real-time transcription */}
            <TranscriptionPanel />
            <PromptUpdater />
          </LiveKitProvider>
        )}
      </section>
    </div>
  );
};

// ─── Root Layout ──────────────────────────────────────────────────────────────

const AIChatLayout = () => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      id="main-layout"
      className="fixed w-full flex h-screen overflow-hidden"
    >
      {/* Top-right actions */}
      <div className={cn("absolute top-2 right-2 z-10 p-4")}>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg transition-colors",
            showSettings
              ? "bg-white/15 text-white/80"
              : "text-white/40 hover:bg-white/8 hover:text-white/70",
          )}
          aria-label="Toggle settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

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
