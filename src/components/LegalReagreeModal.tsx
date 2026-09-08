import { useEffect, useState } from "react";

export default function LegalReagreeModal() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const r = await fetch("/api/legal/status", { credentials: "include" });
        const d = await r.json();
        if (gone) return;
        setVersion(d.version || null);
        if (d.gate && !d.accepted) setOpen(true);
      } catch {}
    })();
    return () => {
      gone = true;
    };
  }, []);

  if (!open) return null;

  async function accept() {
    if (busy || !agreed) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/legal/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accepted: true, version }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Could not save. Try again.");
        setBusy(false);
        return;
      }
      setOpen(false);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="pz-legal-reagree" role="dialog" aria-modal="true" aria-labelledby="pz-legal-reagree-title">
      <style>{`
        .pz-legal-reagree {
          position: fixed;
          inset: 0;
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 18px;
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, hsla(213, 55%, 28%, 0.28), transparent 55%),
            hsla(220, 40%, 4%, 0.78);
          backdrop-filter: blur(14px) saturate(1.1);
          -webkit-backdrop-filter: blur(14px) saturate(1.1);
          font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: hsl(0 0% 98%);
          -webkit-font-smoothing: antialiased;
        }
        .pz-legal-reagree .card {
          position: relative;
          width: 100%;
          max-width: 440px;
          border-radius: 18px;
          border: 1px solid hsl(213 40% 32% / 0.55);
          background:
            linear-gradient(165deg, hsl(216 28% 12% / 0.96), hsl(220 32% 8% / 0.98));
          box-shadow:
            0 28px 80px rgba(0,0,0,0.55),
            inset 0 1px 0 hsla(0,0%,100%,0.06);
          padding: 26px 24px 20px;
          overflow: hidden;
        }
        .pz-legal-reagree .card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, hsl(213 70% 58% / 0.45), transparent);
          pointer-events: none;
        }
        .pz-legal-reagree .icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          margin-bottom: 16px;
          display: grid;
          place-items: center;
          background: hsl(216 30% 10%);
          border: 1px solid hsl(213 40% 32%);
          color: hsl(213 80% 80%);
        }
        .pz-legal-reagree .eyebrow {
          margin: 0 0 8px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: hsl(213 75% 68%);
        }
        .pz-legal-reagree h2 {
          margin: 0 0 10px;
          font-size: clamp(1.35rem, 3.5vw, 1.55rem);
          font-weight: 750;
          letter-spacing: -0.03em;
          line-height: 1.2;
        }
        .pz-legal-reagree .sub {
          margin: 0 0 18px;
          font-size: 0.9rem;
          line-height: 1.55;
          color: hsl(216 15% 72%);
        }
        .pz-legal-reagree .version {
          display: block;
          margin-top: 8px;
          font-size: 11px;
          color: hsl(216 15% 52%);
        }
        .pz-legal-reagree .agree {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          text-align: left;
          margin: 0 0 16px;
          cursor: pointer;
          user-select: none;
        }
        .pz-legal-reagree .agree input {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }
        .pz-legal-reagree .tick {
          width: 18px;
          height: 18px;
          margin-top: 1px;
          flex-shrink: 0;
          border-radius: 5px;
          border: 1px solid hsl(213 40% 34%);
          background: hsl(216 30% 10%);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .pz-legal-reagree .tick svg {
          width: 11px;
          height: 11px;
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 0.12s, transform 0.12s;
          color: #fff;
        }
        .pz-legal-reagree .agree input:checked + .tick {
          background: hsl(213 55% 32%);
          border-color: hsl(213 45% 42%);
        }
        .pz-legal-reagree .agree input:checked + .tick svg {
          opacity: 1;
          transform: scale(1);
        }
        .pz-legal-reagree .agree input:focus-visible + .tick {
          outline: 2px solid hsla(213, 70%, 58%, 0.55);
          outline-offset: 2px;
        }
        .pz-legal-reagree .agree-text {
          font-size: 0.78rem;
          line-height: 1.45;
          color: hsl(216 15% 68%);
        }
        .pz-legal-reagree .agree-text a {
          color: hsl(213 75% 68%);
          text-decoration: none;
        }
        .pz-legal-reagree .agree-text a:hover {
          text-decoration: underline;
        }
        .pz-legal-reagree .error {
          margin: 0 0 12px;
          font-size: 12px;
          color: #f0a0a8;
        }
        .pz-legal-reagree .continue {
          appearance: none;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 28px;
          border-radius: 12px;
          border: 1px solid hsl(213 45% 42%);
          background: hsl(213 55% 32%);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s, filter 0.15s;
        }
        .pz-legal-reagree .continue:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .pz-legal-reagree .continue:not(:disabled):hover {
          filter: brightness(1.08);
        }
      `}</style>
      <div className="card">
        <div className="icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="eyebrow">Policy update</p>
        <h2 id="pz-legal-reagree-title">Our policies changed</h2>
        <p className="sub">
          You&apos;re still verified — no captcha needed. Please review and re-agree to continue.
          {version ? <span className="version">Document version {version}</span> : null}
        </p>
        <label className="agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span className="tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="agree-text">
            I agree to the updated{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>
            ,{" "}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            , and{" "}
            <a href="/dmca" target="_blank" rel="noopener noreferrer">
              DMCA Policy
            </a>
            .
          </span>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="continue" disabled={!agreed || busy} onClick={() => void accept()}>
          {busy ? "Saving…" : "Agree and continue"}
        </button>
      </div>
    </div>
  );
}
