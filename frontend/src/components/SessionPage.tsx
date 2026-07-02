import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useStore } from "@/store";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BlockAnimation } from "./BlockAnimation";
import { ChatPanel } from "./ChatPanel";
import { MinecraftViewer } from "./MinecraftViewer";
import { ViewerToolbar } from "./ViewerToolbar";
import { Download, Loader2 } from "lucide-react";
/**
 * Session page - displays chat panel and 3D viewer for a specific session
 */

// Example of extracting the session ID from the URL:
// http://localhost:5173/session/09b9a328-2354-415e-a48a-ea6541a90e65
const useSessionIdFromUrl = () => {
  // Matches the "/session/:sessionId" route
  const { sessionId } = useParams<{ sessionId: string }>();
  return sessionId;
};

export function SessionPage() {
  const navigate = useNavigate();
  const activeSessionId = useStore((s) => s.activeSessionId);
  const { isLoading, restoreSession, clearActiveSession } = useSession();
  const urlSessionId = useSessionIdFromUrl();
  const [searchParams, setSearchParams] = useSearchParams();
  const paidParam = searchParams.get("paid"); // "success" | "cancelled" | null

  const [chatExpanded, setChatExpanded] = useState(true);
  const [chatWidth, setChatWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const sessions = useStore((s) => s.sessions);

  // Declared before the effects below: their dependency arrays read
  // activeSession?.is_paid at render time, so a later declaration is a TDZ crash
  const activeSession = useMemo(() => {
    return activeSessionId ? sessions[activeSessionId] : null;
  }, [activeSessionId, sessions]);

  const structureData = useMemo(() => {
    return activeSession?.structure || null;
  }, [activeSession]);

  // FPS counter
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef(0);

  useEffect(() => {
    let animationId: number;
    const measureFps = (now: number) => {
      frameTimesRef.current.push(now);
      if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();
      if (now - lastFpsUpdateRef.current > 500 && frameTimesRef.current.length > 1) {
        const times = frameTimesRef.current;
        const elapsed = times[times.length - 1] - times[0];
        setFps(Math.round((times.length - 1) / (elapsed / 1000)));
        lastFpsUpdateRef.current = now;
      }
      animationId = requestAnimationFrame(measureFps);
    };
    animationId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // Restore session from URL param on mount or when URL changes
  useEffect(() => {
    if (urlSessionId && urlSessionId !== activeSessionId) {
      restoreSession(urlSessionId);
    }
  }, [urlSessionId, activeSessionId, restoreSession]);

  // When returning from Stripe with ?paid=success, poll until paid.json marker
  // is confirmed (webhook fires async, may be a few seconds behind the redirect)
  useEffect(() => {
    if (paidParam !== "success" || !activeSessionId) return;
    if (activeSession?.is_paid) return; // already confirmed

    let attempts = 0;
    const maxAttempts = 12; // ~24 seconds total
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/sessions/${activeSessionId}/payment-status`);
        if (res.ok) {
          const data = await res.json();
          if (data.paid) {
            restoreSession(activeSessionId); // refresh full session → sets is_paid
            clearInterval(interval);
            return;
          }
        }
      } catch (_) { /* ignore */ }
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 2000);

    return () => clearInterval(interval);
  }, [paidParam, activeSessionId, activeSession?.is_paid, restoreSession]);

  // Strip ?paid param from URL once payment is confirmed in store
  useEffect(() => {
    if (paidParam && activeSession?.is_paid) {
      setSearchParams({}, { replace: true });
    }
  }, [paidParam, activeSession?.is_paid, setSearchParams]);

  const handleCheckout = useCallback(async () => {
    if (!activeSessionId) return;
    setIsCheckingOut(true);
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/checkout`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Checkout error: ${res.status}`);
      const data = await res.json();
      if (data.already_paid) {
        // Webhook already fired — refresh session to update is_paid in store
        await restoreSession(activeSessionId);
      } else if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err) {
      console.error("Checkout failed:", err);
    } finally {
      setIsCheckingOut(false);
    }
  }, [activeSessionId, restoreSession]);

  const handleBackToProjects = () => {
    clearActiveSession();
    navigate("/app");
  };
  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* 3D Viewer - Full screen background, extended left to center content accounting for chat panel */}
      <div className="absolute inset-y-0 right-0" style={{ left: "-320px" }}>
        {structureData ? (
          <MinecraftViewer />
        ) : (
          <div className="flex items-center justify-center h-full text-center text-white/70 p-6 bg-gradient-to-b from-zinc-700 to-zinc-900">
            <div className="max-w-xs">
              <div className="flex justify-center mb-4">
                <BlockAnimation size={32} className="text-white/90" />
              </div>
              <h2 className="text-xl font-semibold text-white/90 mb-3">
                MinecraftLM
              </h2>
              <p className="mb-6 text-sm text-white/60">
                {isLoading
                  ? "Loading session..."
                  : activeSessionId
                  ? "Rendering your structure..."
                  : "Initializing..."}
              </p>
              <div className="bg-white/10 rounded-xl text-xs leading-relaxed p-4 text-white/70">
                <p className="font-medium text-white/80 mb-2">Controls</p>
                <div className="flex flex-col items gap-1 text-center">
                  <p>Mouse drag: Rotate view</p>
                  <p>Scroll: Zoom in/out</p>
                  <p>Shift/Space: Move up/down</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FPS counter - bottom left */}
      <div className="absolute bottom-4 left-4 z-20 px-2 py-1 bg-black/25 backdrop-blur-sm rounded-md text-xs font-mono text-white/70 border border-white/10">
        {fps} <span className="opacity-50">fps</span>
      </div>

      {/* Floating back button - dark glass treatment */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBackToProjects}
          className="bg-black/40 border-white/15 text-white/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-xl hover:bg-black/50 hover:text-white py-1 px-2"
        >
          ← Projects
        </Button>

        {/* Download / Checkout — only visible when structure exists */}
        {structureData && activeSessionId && (
          <>
            {activeSession?.is_paid ? (
              /* Already paid → direct download */
              <a
                href={`/api/sessions/${activeSessionId}/export/mcpack`}
                download
                title="Descargar para tablet (Minecraft Bedrock)"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-emerald-600/80 border-emerald-400/30 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-xl hover:bg-emerald-500/90 hover:text-white py-1 px-2 gap-1.5"
                >
                  <Download className="size-3.5" />
                  Descargar para tablet
                </Button>
              </a>
            ) : paidParam === "success" ? (
              /* Returned from Stripe — webhook may still be in-flight */
              <Button
                variant="outline"
                size="sm"
                disabled
                className="bg-emerald-600/60 border-emerald-400/30 text-white/80 py-1 px-2 gap-1.5 backdrop-blur-xl"
              >
                <Loader2 className="size-3.5 animate-spin" />
                Activando descarga…
              </Button>
            ) : (
              /* Not paid → show checkout button */
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                  className="bg-emerald-600/80 border-emerald-400/30 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-xl hover:bg-emerald-500/90 hover:text-white py-1 px-2 gap-1.5"
                  title="Descargar para tablet (Minecraft Bedrock) — $2.99"
                >
                  {isCheckingOut ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {isCheckingOut ? "Redirigiendo…" : "Descargar · $2.99"}
                </Button>
                {paidParam === "cancelled" && (
                  <span className="text-xs text-amber-300/90 bg-black/30 backdrop-blur-sm rounded px-2 py-0.5">
                    Pago cancelado
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Centered viewer toolbar - only show when structure exists */}
      {structureData && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <ViewerToolbar />
        </div>
      )}

      {/* Floating Chat Panel - glass overlay, collapses vertically */}
      <div
        className={`absolute top-4 right-4 z-10 ${
          !isResizing ? "transition-all duration-300 ease-in-out" : ""
        }`}
        style={{
          width: chatWidth,
          height: chatExpanded ? "calc(100% - 32px)" : 48,
        }}
      >
        <ChatPanel
          expanded={chatExpanded}
          setExpanded={setChatExpanded}
          width={chatWidth}
          onWidthChange={setChatWidth}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => setIsResizing(false)}
        />
      </div>
    </div>
  );
}
