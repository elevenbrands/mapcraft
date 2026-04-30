/**
 * useVoiceInput — Web Speech API hook for voice-first input
 * Target audience: Spanish-speaking children, so default lang = es-MX
 */

import { useCallback, useEffect, useRef, useState } from "react";

type VoiceState = "idle" | "listening";

type UseVoiceInputOptions = {
  lang?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onEnd?: (finalText: string) => void;
};

type UseVoiceInputReturn = {
  state: VoiceState;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
};

// Extend Window type for vendor-prefixed SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function useVoiceInput({
  lang = "es-MX",
  onTranscript,
  onEnd,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef<string>("");
  const onTranscriptRef = useRef(onTranscript);
  const onEndRef = useRef(onEnd);

  // Keep refs in sync with latest callbacks (avoids stale closures)
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!isSupported) return;
    if (state === "listening") {
      stop();
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    accumulatedRef.current = "";

    recognition.onstart = () => {
      setState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + final.trim();
        onTranscriptRef.current?.(accumulatedRef.current, true);
      } else if (interim) {
        const preview = accumulatedRef.current
          ? accumulatedRef.current + " " + interim
          : interim;
        onTranscriptRef.current?.(preview, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are normal — don't treat as errors
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[useVoiceInput] error:", event.error);
      }
      setState("idle");
    };

    recognition.onend = () => {
      setState("idle");
      const finalText = accumulatedRef.current.trim();
      if (finalText) {
        onEndRef.current?.(finalText);
      }
      accumulatedRef.current = "";
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, lang, state, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { state, isSupported, start, stop };
}
