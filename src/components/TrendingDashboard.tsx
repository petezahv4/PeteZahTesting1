import { useEffect, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Flame,
  Music2,
  Film,
  Gamepad2,
  Monitor,
  Bot,
  AppWindow,
  User,
  MessageCircle,
  Sparkles,
  Disc3,
  Clapperboard,
} from "lucide-react";
import VantaBackground from "@/components/VantaBackground";
import ObfuscatedText from "@/components/ObfuscatedText";
import { CoverImg } from "@/lib/mediaCover";
import { hrefs, marks } from "@/lib/uiMarks";
import { generateGameId } from "@/lib/gameId";

type Props = {
  variant?: "overlay" | "page";
  onClose?: () => void;
  onNavigate: (url: string) => void;
};

type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
};

type CatalogItem = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
};

type Game = {
  id: string;
  label: string;
  url: string;
  imageUrl: string;
};

const TMDB = "https://image.tmdb.org/t/p/w342";

const C = {
  surface: "hsla(220, 28%, 12%, 0.42)",
  elevated: "hsla(220, 24%, 16%, 0.5)",
  border: "hsla(210, 30%, 80%, 0.12)",
  borderFocus: "hsla(210, 40%, 70%, 0.28)",
  accent: "hsla(0, 0%, 96%, 0.92)",
  accentDim: "hsla(210, 40%, 55%, 0.16)",
  text: "hsla(210, 20%, 96%, 0.95)",
  textSub: "hsla(210, 14%, 70%, 0.78)",
  textMuted: "hsla(210, 12%, 55%, 0.55)",
};

const ease = [0.22, 1, 0.36, 1] as const;

function safeImg(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (u.startsWith("/") || u.startsWith("https://") || u.startsWith("http://")) return u;
  return "";
}

function yearOf(item: CatalogItem) {
  const d = item.release_date || item.first_air_date || "";
  return d.slice(0, 4);
}

function SectionLabel({ icon: Icon, label }: { icon: typeof Flame; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={12} style={{ color: C.accent }} />
      <span
        className="text-[10px] font-semibold tracking-[0.08em] uppercase"
        style={{ color: C.textMuted }}
      >
        <ObfuscatedText as="span">{label}</ObfuscatedText>
      </span>
    </div>
  );
}

async function readJson(res: Response | null) {
  if (!res?.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function catalogList(data: any): CatalogItem[] {
  const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return list.filter((m: any) => m?.id && (m.poster_path || m.title || m.name));
}

export default function TrendingDashboard({
  variant = "overlay",
  onClose,
  onNavigate,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [watch, setWatch] = useState<CatalogItem[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;

    (async () => {
      try {
        const [
          musicRes,
          movieTrend,
          tvTrend,
          moviePop,
          tvPop,
          collectionRes,
          playsRes,
        ] = await Promise.all([
          fetch("/api/music/trending", { signal }).catch(() => null),
          fetch("/api/tmdb/movie/trending", { signal }).catch(() => null),
          fetch("/api/tmdb/tv/trending", { signal }).catch(() => null),
          fetch("/api/tmdb/movie/popular", { signal }).catch(() => null),
          fetch("/api/tmdb/tv/popular", { signal }).catch(() => null),
          fetch("/storage/data/collection.json", { signal }).catch(() => null),
          fetch(hrefs.apiPlays(), { signal }).catch(() => null),
        ]);

        const musicData = await readJson(musicRes);
        if (Array.isArray(musicData?.tracks)) {
          setTracks(
            musicData.tracks
              .filter((t: any) => t && typeof t.title === "string")
              .slice(0, 8)
              .map((t: any) => ({
                id: String(t.id || ""),
                title: String(t.title || "Track"),
                artist: String(t.artist || "Artist"),
                artwork: typeof t.artwork === "string" ? t.artwork : null,
              }))
          );
        }

        const movies = catalogList(await readJson(movieTrend)).map((m) => ({
          ...m,
          media_type: "movie" as const,
        }));
        const shows = catalogList(await readJson(tvTrend)).map((m) => ({
          ...m,
          media_type: "tv" as const,
        }));
        let merged = [...movies, ...shows];
        if (merged.length < 8) {
          const popM = catalogList(await readJson(moviePop)).map((m) => ({
            ...m,
            media_type: "movie" as const,
          }));
          const popT = catalogList(await readJson(tvPop)).map((m) => ({
            ...m,
            media_type: "tv" as const,
          }));
          const seen = new Set(merged.map((m) => `${m.media_type}-${m.id}`));
          for (const item of [...popM, ...popT]) {
            const key = `${item.media_type}-${item.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
        }
        setWatch(merged.filter((m) => m.poster_path).slice(0, 12));

        let collection: Game[] = [];
        const raw = await readJson(collectionRes);
        if (raw) {
          const arr = Array.isArray(raw?.[hrefs.kindG()]) ? raw[hrefs.kindG()] : Array.isArray(raw) ? raw : [];
          collection = arr
            .filter((g: any) => g && (g.label || g.name) && (g.url || g.link))
            .map((g: any) => {
              const label = String(g.label || g.name || hrefs.wordG());
              const url = String(g.url || g.link || "");
              const id =
                typeof g.id === "string" && g.id
                  ? g.id
                  : generateGameId({ label, url });
              return {
                id,
                label,
                url,
                imageUrl: String(g.imageUrl || g.image || ""),
              };
            })
            .filter((g: Game) => !/request\s*games/i.test(g.label));
        }

        let counts: Record<string, number> = {};
        const playsData = await readJson(playsRes);
        if (playsData?.counts && typeof playsData.counts === "object") {
          counts = playsData.counts;
        }

        const ranked = [...collection]
          .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
          .slice(0, 12);
        setGames(ranked.length ? ranked : collection.slice(0, 12));
      } catch {
      } finally {
        if (!signal.aborted) setReady(true);
      }
    })();

    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (variant !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  const go = (url: string) => {
    onNavigate(url);
    if (variant === "overlay") onClose?.();
  };

  const goMusic = (id?: string) => {
    go(id ? `${hrefs.mu()}?track=${encodeURIComponent(id)}` : hrefs.mu());
  };

  const goWatch = () => go(hrefs.mo());

  const goGame = (game: Game) => {
    go(
      `${hrefs.gv()}?url=${encodeURIComponent(game.url)}&title=${encodeURIComponent(game.label)}&gid=${encodeURIComponent(game.id)}`
    );
  };

  const quick = [
    { label: marks.music(), icon: Music2, url: hrefs.mu() },
    { label: marks.a(), icon: Gamepad2, url: hrefs.g() },
    { label: marks.movies(), icon: Film, url: hrefs.mo() },
    { label: "Apps", icon: AppWindow, url: "petezah://apps" },
    { label: "AI", icon: Bot, url: "petezah://ai" },
    { label: "VM", icon: Monitor, url: "petezah://vm" },
    { label: "Chat", icon: MessageCircle, url: "petezah://chat" },
    { label: "Account", icon: User, url: "petezah://account" },
  ];

  const glass: CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    backdropFilter: "blur(14px)",
  };

  const shell = (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden"
      style={{
        color: C.text,
        fontFamily: "plusjakartasans-obf, ui-sans-serif, system-ui, sans-serif",
        background: "transparent",
      }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <VantaBackground contained />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, hsla(220, 20%, 20%, 0.25), transparent 60%), linear-gradient(180deg, hsla(220, 30%, 6%, 0.35), hsla(220, 28%, 5%, 0.72))",
          }}
        />
      </div>

      <motion.div
        className="relative z-[1] flex-shrink-0 px-4 py-2.5 flex items-center justify-between gap-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        style={{
          borderBottom: `1px solid ${C.border}`,
          background: "hsla(220, 28%, 8%, 0.28)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <Flame size={13} style={{ color: C.accent, flexShrink: 0 }} />
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight truncate leading-tight" style={{ color: C.text }}>
              Trending
            </h1>
            <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: C.textMuted }}>
              <ObfuscatedText as="span">{marks.watchLine()}</ObfuscatedText>
            </p>
          </div>
        </div>
        {variant === "overlay" && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              color: C.textSub,
            }}
            aria-label="Close"
          >
            <X size={13} />
          </motion.button>
        )}
      </motion.div>

      <div className="relative z-[1] flex-1 min-h-0 overflow-hidden px-3.5 py-3 flex flex-col gap-3">
        <motion.div
          className="rounded-2xl p-3 flex-shrink-0"
          style={glass}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.04, ease }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <SectionLabel icon={Clapperboard} label="Watch now" />
            <button
              type="button"
              onClick={goWatch}
              className="text-[10px] font-semibold cursor-pointer border-0 bg-transparent px-0"
              style={{ color: C.textSub }}
            >
              Open movies
            </button>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {(watch.length ? watch : Array.from({ length: 10 })).slice(0, 10).map((item, i) => {
              const entry = watch[i];
              if (!entry) {
                return (
                  <div
                    key={`w-${i}`}
                    className="w-full aspect-[2/3] rounded-lg animate-pulse"
                    style={{ background: C.elevated }}
                  />
                );
              }
              const poster = entry.poster_path ? `${TMDB}${entry.poster_path}` : "";
              const title = entry.title || entry.name || "Title";
              return (
                <button
                  key={`${entry.media_type}-${entry.id}`}
                  type="button"
                  title={title}
                  onClick={goWatch}
                  className="group relative w-full aspect-[2/3] rounded-lg overflow-hidden cursor-pointer border-0 p-0"
                  style={{ background: C.elevated, border: `1px solid ${C.border}` }}
                >
                  {poster ? (
                    <CoverImg
                      src={poster}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : null}
                  <div
                    className="absolute inset-x-0 bottom-0 p-1.5 pt-5"
                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.88))" }}
                  >
                    <div className="text-[8px] font-semibold leading-tight line-clamp-2 text-left">{title}</div>
                    {yearOf(entry) ? (
                      <div className="text-[7px] mt-0.5" style={{ color: C.textSub }}>
                        {entry.media_type === "tv" ? "Series" : "Film"} · {yearOf(entry)}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
          <motion.div
            className="rounded-2xl p-3 min-h-0 flex flex-col overflow-hidden"
            style={glass}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <SectionLabel icon={Music2} label={marks.trendMusic()} />
              <button
                type="button"
                onClick={() => goMusic()}
                className="text-[10px] font-semibold cursor-pointer border-0 bg-transparent px-0"
                style={{ color: C.textSub }}
              >
                Open
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 pr-0.5">
              {(tracks.length ? tracks : Array.from({ length: 6 })).slice(0, 7).map((_, i) => {
                const track = tracks[i];
                if (!track) {
                  return (
                    <div
                      key={`ms-${i}`}
                      className="h-10 rounded-xl animate-pulse flex-shrink-0"
                      style={{ background: C.elevated }}
                    />
                  );
                }
                const art = safeImg(track.artwork);
                return (
                  <button
                    key={track.id || i}
                    type="button"
                    onClick={() => goMusic(track.id)}
                    className="flex items-center gap-2 px-1.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors w-full border-0 flex-shrink-0"
                    style={{ background: "transparent", color: C.text }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = C.accentDim;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span className="w-4 text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: C.textMuted }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div
                      className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                      style={{ background: C.elevated, border: `1px solid ${C.border}` }}
                    >
                      {art ? (
                        <CoverImg src={art} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc3 size={12} style={{ color: C.textMuted }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold truncate">{track.title}</div>
                      <div className="text-[10px] truncate text-right flex-shrink-0 max-w-[42%]" style={{ color: C.textSub }}>
                        {track.artist}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl p-3 min-h-0 flex flex-col overflow-hidden"
            style={glass}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12, ease }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <SectionLabel icon={Gamepad2} label={marks.f()} />
              <button
                type="button"
                onClick={() => go(hrefs.g())}
                className="text-[10px] font-semibold cursor-pointer border-0 bg-transparent px-0"
                style={{ color: C.textSub }}
              >
                Open
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 content-start">
                {(games.length ? games : Array.from({ length: 10 })).slice(0, 10).map((_, i) => {
                  const g = games[i];
                  if (!g) {
                    return (
                      <div
                        key={`g-${i}`}
                        className="aspect-square rounded-lg animate-pulse"
                        style={{ background: C.elevated }}
                      />
                    );
                  }
                  const img = safeImg(g.imageUrl);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      title={g.label}
                      onClick={() => goGame(g)}
                      className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-0 p-0"
                      style={{ background: C.elevated, border: `1px solid ${C.border}` }}
                    >
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Gamepad2 size={14} style={{ color: C.textMuted }} />
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 px-1 py-0.5"
                        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.82))" }}
                      >
                        <div className="text-[8px] font-semibold truncate text-left">{g.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="rounded-2xl p-3 flex-shrink-0"
          style={glass}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease }}
        >
          <SectionLabel icon={Sparkles} label="Launch pad" />
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {quick.map((q) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => go(q.url)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl cursor-pointer transition-colors border-0"
                  style={{ background: C.elevated, color: C.text, border: `1px solid ${C.border}` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.accentDim;
                    e.currentTarget.style.borderColor = C.borderFocus;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = C.elevated;
                    e.currentTarget.style.borderColor = C.border;
                  }}
                >
                  <Icon size={14} style={{ color: C.accent }} />
                  <span className="text-[9px] font-medium">
                    <ObfuscatedText as="span">{q.label}</ObfuscatedText>
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {!ready && (
          <p className="text-center text-[10px]" style={{ color: C.textMuted }}>
            Syncing…
          </p>
        )}
      </div>
    </div>
  );

  if (variant === "page") {
    return <div className="absolute inset-0">{shell}</div>;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1200] flex items-stretch justify-stretch p-3 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        style={{ background: "hsla(220, 40%, 4%, 0.45)", backdropFilter: "blur(10px)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <motion.div
          className="relative w-full h-full rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.99 }}
          transition={{ duration: 0.32, ease }}
          style={{
            border: `1px solid ${C.border}`,
            boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
            background: "hsla(220, 30%, 6%, 0.55)",
          }}
        >
          {shell}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
