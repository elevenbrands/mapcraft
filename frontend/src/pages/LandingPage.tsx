import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlockAnimation } from "@/components/BlockAnimation";

const DEMO_MAPS = [
  {
    slug: "aldea_medieval",
    label: "Aldea Medieval",
    description: "Casas de madera, mercado y torre de vigilancia",
    sessionId: "9fa8e2b3-0408-47d0-a3f6-1a09fcf36c66",
    emoji: "🏰",
  },
  {
    slug: "castillo_hielo",
    label: "Castillo de Hielo",
    description: "Torres de cristal y nieve con puente levadizo",
    sessionId: "3d3792ee-4fd0-47e7-84db-09162939ad3f",
    emoji: "❄️",
  },
  {
    slug: "ciudad_futurista",
    label: "Ciudad Futurista",
    description: "Rascacielos de cuarzo y vidrio con luces de neón",
    sessionId: "bf0090bb-e50b-4c79-924d-2d61d47e3ba5",
    emoji: "🚀",
  },
];

function DemoCard({
  map,
  onOpen,
}: {
  map: (typeof DEMO_MAPS)[number];
  onOpen: (sessionId: string) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={() => onOpen(map.sessionId)}
      className={cn(
        "group relative overflow-hidden rounded-3xl aspect-square",
        "shadow-xl shadow-black/30 hover:shadow-2xl hover:shadow-black/50",
        "transition-all duration-500",
        "hover:scale-[1.03] active:scale-[0.98]",
        "cursor-pointer text-left"
      )}
    >
      {/* Thumbnail or fallback */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900">
        {!imgError ? (
          <img
            src={`/api/sessions/${map.sessionId}/thumbnail`}
            alt={map.label}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl">{map.emoji}</span>
          </div>
        )}
      </div>

      {/* Gradient overlay for readability */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />

      {/* "Ver en 3D" hover badge */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex justify-center pt-4",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        )}
      >
        <span className="text-xs font-medium text-white/90 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
          Ver en 3D →
        </span>
      </div>

      {/* Text */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="text-sm font-semibold text-white leading-tight">
          {map.label}
        </div>
        <div className="text-xs text-white/60 mt-0.5 line-clamp-1">
          {map.description}
        </div>
      </div>

      {/* Subtle ring */}
      <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none" />
    </button>
  );
}

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-spatial font-text flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <BlockAnimation size={20} className="text-emerald-400" />
          <span className="font-display font-semibold text-foreground/90 tracking-tight">
            MapCraft
          </span>
        </div>
        <button
          onClick={() => navigate("/app")}
          className={cn(
            "text-sm font-medium px-4 py-2 rounded-xl",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-white/5",
            "transition-colors duration-200"
          )}
        >
          Crear mi mapa →
        </button>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 -mt-8">
        <div className="w-full max-w-3xl flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Funciona con Gemini AI · Gratis para probar
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl font-display font-semibold text-foreground/95 mb-5 tracking-tight leading-[1.1]">
            Crea mundos de{" "}
            <span className="text-emerald-400">Minecraft</span>{" "}
            con una frase
          </h1>

          <p className="text-xl text-muted-foreground/80 mb-3 max-w-xl leading-relaxed">
            Tu hijo describe el mundo que quiere.
            La IA lo construye en segundos.
            Lo descargas en su tablet.
          </p>

          <p className="text-sm text-muted-foreground/50 mb-10">
            Compatible con Minecraft Bedrock (Android, iPad, iPhone)
          </p>

          {/* CTA */}
          <button
            onClick={() => navigate("/app")}
            className={cn(
              "group px-8 py-4 rounded-2xl text-lg font-semibold",
              "bg-emerald-500 hover:bg-emerald-400 text-black",
              "shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-400/30",
              "transition-all duration-300",
              "hover:scale-[1.03] active:scale-[0.98]"
            )}
          >
            Crear mi mapa gratis
            <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </button>

          <p className="mt-4 text-xs text-muted-foreground/40">
            Sin registro · Sin tarjeta · Listo en 30 segundos
          </p>
        </div>

        {/* Demo maps */}
        <div className="w-full max-w-3xl mt-20">
          <p className="text-center text-sm font-medium text-muted-foreground/60 uppercase tracking-widest mb-8">
            Ejemplos generados con IA
          </p>

          <div className="grid grid-cols-3 gap-4">
            {DEMO_MAPS.map((map) => (
              <DemoCard
                key={map.slug}
                map={map}
                onOpen={(id) => navigate(`/session/${id}`)}
              />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground/40 mt-6">
            Haz clic en cualquier mapa para verlo en 3D
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-muted-foreground/30">
        MapCraft · Powered by Gemini AI
      </footer>
    </div>
  );
}
