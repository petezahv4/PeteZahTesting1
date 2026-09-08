import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Link2, Music2, Play, Calendar, Shield, Lock } from "lucide-react";
import { BadgeRow, type BadgeInfo } from "./BadgeChip";
import { CoverImg } from "@/lib/mediaCover";
import { hrefs } from "@/lib/uiMarks";

interface FavTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  duration?: number;
  permalink_url?: string | null;
}

interface PublicUser {
  id: string;
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string | null;
  status?: string;
  location?: string;
  website?: string;
  profile_color?: string;
  banner_url?: string | null;
  favorite_music?: FavTrack[];
  profile_public?: boolean;
  is_admin?: number;
  created_at?: number;
  badges?: BadgeInfo[];
}

const S = {
  bg: "hsl(216 32% 6%)",
  surface: "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border: "hsl(216 20% 16%)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 48%)",
  textMuted: "hsl(216 12% 32%)",
};

function normalizeHandle(raw: string) {
  let h = raw.trim();
  if (h.startsWith("@")) h = h.slice(1);
  return h;
}

function isValidPublicHandle(handle: string) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(handle) && !/^[0-9]+$/.test(handle);
}

export default function ProfilePage({
  username,
  onNavigate,
  embedded,
}: {
  username: string;
  onNavigate?: (url: string) => void;
  embedded?: boolean;
}) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const handle = normalizeHandle(username);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      if (!isValidPublicHandle(handle)) {
        if (!cancelled) {
          setUser(null);
          setError("Invalid username");
          setLoading(false);
        }
        return;
      }
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(handle)}`, { credentials: "include" });
        const text = await r.text();
        let d: any = null;
        try {
          d = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(r.ok ? "Invalid response" : "User not found");
        }
        if (!r.ok) throw new Error(d?.error || "Not found");
        if (!cancelled) setUser(d.user);
      } catch (e: any) {
        if (!cancelled) {
          setUser(null);
          setError(e?.message || "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const u = detail?.username ? String(detail.username) : "";
      if (u && normalizeHandle(u) === handle) {
        setUser((prev) => ({ ...(prev || {}), ...detail }));
        setError("");
        setLoading(false);
      } else {
        load();
      }
    };
    window.addEventListener("petezah-profile-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("petezah-profile-updated", onUpdated);
    };
  }, [handle]);

  const accent = user?.profile_color || "#4d8dff";
  const display = user?.display_name || user?.username || handle;

  const playTrack = (track: FavTrack) => {
    if (onNavigate) onNavigate(`${hrefs.mu()}?t=${track.id}`);
    else window.location.href = `/?m=${encodeURIComponent(`${hrefs.mu()}?t=${track.id}`)}`;
  };

  if (loading) {
    return (
      <div className="profile-page" style={{ ...shell(embedded), display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted, fontSize: 13 }}>
        Loading profile…
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="profile-page" style={{ ...shell(embedded), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Lock size={28} style={{ color: S.textMuted }} />
        <p style={{ color: S.text, fontSize: 15, fontWeight: 650, margin: 0 }}>{error || "User not found"}</p>
        <p style={{ color: S.textMuted, fontSize: 12, margin: 0 }}>@{handle}</p>
      </div>
    );
  }

  return (
    <div className="profile-page" style={shell(embedded)}>
      <div className="profile-banner" style={{ position: "relative", height: embedded ? 160 : 220, background: S.elevated, overflow: "hidden" }}>
        {user.banner_url ? (
          <img src={user.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: `linear-gradient(135deg, ${accent}55 0%, hsl(216 32% 8%) 55%, hsl(250 30% 12%) 100%)`,
          }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, hsl(216 32% 6%) 0%, transparent 55%)" }} />
      </div>

      <div className="profile-body" style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 48px", position: "relative" }}>
        <div className="profile-identity" style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: -48 }}>
          <div
            className="profile-avatar"
            style={{
              width: 96, height: 96, borderRadius: 24, overflow: "hidden",
              border: `3px solid ${S.bg}`, background: S.surface, flexShrink: 0,
              boxShadow: `0 0 0 2px ${accent}66`,
            }}
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{
                width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, fontWeight: 700, color: accent, background: S.elevated,
              }}>
                {(display[0] || "?").toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 className="profile-name" style={{ fontSize: 24, fontWeight: 750, color: S.text, margin: 0 }}>{display}</h1>
              {(user.is_admin || 0) > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: `${accent}22`, color: accent, display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <Shield size={10} /> Staff
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <p style={{ fontSize: 13, color: S.textSub, margin: 0 }}>@{user.username || handle}</p>
              {!!user.badges?.length && (
                <BadgeRow badges={user.badges} max={8} size={12} subtle />
              )}
            </div>
          </div>
        </div>

        {user.status && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 16, padding: "10px 14px", borderRadius: 10,
              background: `${accent}14`, border: `1px solid ${accent}33`,
              color: S.text, fontSize: 13, fontStyle: "italic",
            }}
          >
            {user.status}
          </motion.p>
        )}

        {user.bio != null && String(user.bio).trim() !== "" && (
          <p style={{ marginTop: 14, color: S.textSub, fontSize: 14, lineHeight: 1.55, marginBottom: 0, whiteSpace: "pre-wrap" }}>
            {user.bio}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, color: S.textMuted, fontSize: 12 }}>
          {user.location && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <MapPin size={12} /> {user.location}
            </span>
          )}
          {user.website && (
            <a href={user.website} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: accent, textDecoration: "none" }}>
              <Link2 size={12} /> {user.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {user.created_at && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Calendar size={12} /> Joined {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Music2 size={14} style={{ color: accent }} />
            <h2 style={{ fontSize: 13, fontWeight: 700, color: S.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Favorite music
            </h2>
          </div>

          {(!user.favorite_music || user.favorite_music.length === 0) && (
            <p style={{ color: S.textMuted, fontSize: 12 }}>No favorite tracks yet.</p>
          )}

          <div className="profile-music-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {(user.favorite_music || []).map((track) => (
              <button
                key={track.id}
                onClick={() => playTrack(track)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12,
                  background: S.surface, border: `1px solid ${S.border}`, cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 9, overflow: "hidden", background: S.elevated, flexShrink: 0, position: "relative" }}>
                  {track.artwork ? (
                    <CoverImg src={track.artwork} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                      <Music2 size={16} />
                    </div>
                  )}
                  <div style={{
                    position: "absolute", inset: 0, background: "hsl(216 32% 6% / 0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center", opacity: 0,
                  }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0"; }}
                  >
                    <Play size={14} fill="#fff" color="#fff" />
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.title}
                  </p>
                  <p style={{ fontSize: 10, color: S.textMuted, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.artist}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function shell(embedded?: boolean): React.CSSProperties {
  return {
    position: embedded ? "absolute" : "relative",
    inset: embedded ? 0 : undefined,
    minHeight: embedded ? undefined : "100vh",
    height: embedded ? "100%" : undefined,
    overflow: "auto",
    background: S.bg,
    color: S.text,
  };
}
