import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import { forwardRef, useCallback, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { GenerationSettingsPopover } from "./GenerationSettingsPopover";

type PromptBoxProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: "default" | "hero";
  className?: string;
};

export const PromptBox = forwardRef<HTMLTextAreaElement, PromptBoxProps>(
  function PromptBox(
    {
      onSubmit,
      disabled = false,
      placeholder = "Type a message...",
      variant = "default",
      className = "",
    },
    ref
  ) {
    const value = useStore((s) => s.draftMessage);
    const setDraftMessage = useStore((s) => s.setDraftMessage);
    const clearDraftMessage = useStore((s) => s.clearDraftMessage);
    // Track whether the textarea holds live interim voice text (not yet final)
    const isInterimRef = useRef(false);

    const isActive = value?.trim() && !disabled;

    const submitText = useCallback(
      (text: string) => {
        const trimmed = text.trim();
        if (trimmed && !disabled && onSubmit) {
          onSubmit(trimmed);
          clearDraftMessage();
        }
      },
      [disabled, onSubmit, clearDraftMessage]
    );

    const { state: voiceState, isSupported: voiceSupported, start: startVoice } =
      useVoiceInput({
        lang: "es-MX",
        onTranscript: (text, isFinal) => {
          setDraftMessage(text);
          isInterimRef.current = !isFinal;
        },
        onEnd: (finalText) => {
          isInterimRef.current = false;
          setDraftMessage(finalText);
          // Auto-submit for children — no extra button press needed
          submitText(finalText);
        },
      });

    const isListening = voiceState === "listening";

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isActive) {
        submitText(value);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isActive) {
          submitText(value);
        }
      }
    };

    return (
      <form
        onSubmit={handleSubmit}
        data-variant={variant}
        className={cn(
          "w-full flex flex-col",
          variant === "hero"
            ? [
                "relative rounded-3xl p-5 gap-8",
                "glass-panel-hero",
                "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
                "before:bg-gradient-to-b before:from-white/[0.35] before:via-white/[0.12] before:to-transparent before:opacity-80",
              ]
            : [
                "rounded-xl px-2 pt-3 pb-2 gap-3",
                "bg-black/40",
                "shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]",
                "border border-white/10",
                "focus-within:bg-black/50",
                "focus-within:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]",
              ],
          "transition-all duration-200",
          className
        )}
      >
        <TextareaAutosize
          ref={ref}
          value={value}
          onChange={(e) => {
            isInterimRef.current = false;
            setDraftMessage(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? "Escuchando... 🎙️"
              : placeholder
          }
          minRows={1}
          maxRows={5}
          className={cn(
            "w-full px-1 resize-none bg-transparent outline-none",
            variant === "hero"
              ? "text-foreground/90 placeholder:text-muted-foreground/80"
              : "text-white/90 placeholder:text-white/40",
            isListening && "placeholder:animate-pulse",
            "text-sm leading-relaxed",
            "font-text"
          )}
        />

        {/* Bottom row: settings on left, mic + submit on right */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <GenerationSettingsPopover variant={variant} />

          <div className="flex items-center gap-2 shrink-0">
            {/* Mic button — primary action for voice-first UX */}
            {voiceSupported && (
              <button
                type="button"
                onClick={startVoice}
                disabled={disabled}
                aria-label={isListening ? "Detener grabación" : "Hablar"}
                className={cn(
                  "relative flex items-center justify-center rounded-full transition-all duration-200",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  variant === "hero"
                    ? [
                        "w-12 h-12",
                        isListening
                          ? "bg-red-500 text-white shadow-lg shadow-red-500/40"
                          : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/30 hover:scale-105 active:scale-95",
                      ]
                    : [
                        "w-8 h-8",
                        isListening
                          ? "bg-red-500/80 text-white"
                          : "bg-emerald-600/70 hover:bg-emerald-500/80 text-white hover:scale-105 active:scale-95",
                      ]
                )}
              >
                {/* Pulse ring while listening */}
                {isListening && (
                  <span
                    className={cn(
                      "absolute inset-0 rounded-full animate-ping opacity-60",
                      "bg-red-400"
                    )}
                  />
                )}
                {isListening ? (
                  <MicOff size={variant === "hero" ? 20 : 15} strokeWidth={2} />
                ) : (
                  <Mic size={variant === "hero" ? 20 : 15} strokeWidth={2} />
                )}
              </button>
            )}

            {/* Send button */}
            <Button
              type="submit"
              disabled={!isActive}
              size="icon"
              className={cn(
                "shrink-0",
                "transition-all duration-200 transition-spring",
                "hover:scale-105",
                "active:scale-95"
              )}
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </form>
    );
  }
);
