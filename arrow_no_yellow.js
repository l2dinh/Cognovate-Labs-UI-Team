import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import "./App.css";

// ---------- Helpers ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const safe = (v) => (Number.isFinite(v) ? v : 0);
const safeText = (v) => (Number.isFinite(v) ? v.toFixed(2) : "--");
const finite = (n) => Number.isFinite(n);

function subjectMinMax(rows, key) {
  const vals = (rows || []).map((r) => r?.[key]).filter(finite);
  if (vals.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...vals);
  let max = Math.max(...vals);

  if (min === max) {
    const eps = Math.max(0.001, Math.abs(min) * 0.05);
    min -= eps;
    max += eps;
  }
  return { min, max };
}

// ---------- Stroke severity ----------
function computeStrokeSeverity(values) {
  const alpha = Number(values?.alpha) || 0;
  const theta = Number(values?.theta) || 0;
  const delta = Number(values?.delta) || 0;

  const alphaLowTH = 9;
  const thetaHighTH = 5.5;
  const deltaHighTH = 3.5;

  const alphaLow = clamp((alphaLowTH - alpha) / alphaLowTH, 0, 1);
  const thetaHigh = clamp((theta - thetaHighTH) / thetaHighTH, 0, 1);
  const deltaHigh = clamp((delta - deltaHighTH) / deltaHighTH, 0, 1);

  const safeAlpha = Math.max(alpha, 0.1);
  const tar = theta / safeAlpha;
  const dar = delta / safeAlpha;

  const tarNorm = clamp((tar - 0.4) / 1.2, 0, 1);
  const darNorm = clamp((dar - 0.2) / 1.0, 0, 1);

  let severity =
    0.15 * alphaLow +
    0.3 * thetaHigh +
    0.3 * deltaHigh +
    0.15 * tarNorm +
    0.1 * darNorm;

  if (alpha < theta && alpha < delta) severity += 0.2;
  return clamp(severity * 1.4, 0, 1);
}

// ---------- Circular EEG Chart ----------
function CircularEEGChart({ values, size = 520, segments = 6 }) {
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 28;
  const outerR = size / 2 - 14;

  const labels = ["Alpha", "Beta", "Theta", "Delta"];
  const n = labels.length;

  const gapDeg = 12;
  const sweepDeg = 360 / n - gapDeg;
  const segGap = 3;
  const ringTh = (outerR - innerR) / (segments + 0.25);
  const deg2rad = (d) => (d * Math.PI) / 180;
  const gridRings = 5;

  const segmentPath = (wi, r0, r1) => {
    const base = -90 + wi * (360 / n);
    const a0 = deg2rad(base + gapDeg / 2);
    const a1 = deg2rad(base + gapDeg / 2 + sweepDeg);

    const x0 = cx + r0 * Math.cos(a0);
    const y0 = cy + r0 * Math.sin(a0);
    const x1 = cx + r1 * Math.cos(a0);
    const y1 = cy + r1 * Math.sin(a0);
    const x2 = cx + r1 * Math.cos(a1);
    const y2 = cy + r1 * Math.sin(a1);
    const x3 = cx + r0 * Math.cos(a1);
    const y3 = cy + r0 * Math.sin(a1);

    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${x0} ${y0} L ${x1} ${y1} A ${r1} ${r1} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r0} ${r0} 0 ${large} 0 ${x0} ${y0} Z`;
  };

  const radialColor = (frac) => {
    if (frac < 1 / 3) return "#2E7D32";
    if (frac < 2 / 3) return "#FBC02D";
    return "#D32F2F";
  };

  const glowId = "wedgeGlow";
  const severityRaw = computeStrokeSeverity(values);
  const severity01 = clamp(Math.pow(severityRaw, 0.7) * 1.1, 0, 1);
  const activeRings = Math.round(severity01 * segments);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", background: "#0f1422", borderRadius: 12 }}
    >
      <defs>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx={cx}
        cy={cy}
        r={outerR}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.25"
      />

      {Array.from({ length: gridRings }).map((_, k) => {
        const rr =
          innerR + ((k + 1) / (gridRings + 1)) * (outerR - innerR);
        return (
          <circle
            key={`grid-${k}`}
            cx={cx}
            cy={cy}
            r={rr}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
          />
        );
      })}

      {labels.map((_, wi) => {
        const base = -90 + wi * (360 / n);
        const a = deg2rad(base);
        const x0 = cx + innerR * Math.cos(a);
        const y0 = cy + innerR * Math.sin(a);
        const x1 = cx + outerR * Math.cos(a);
        const y1 = cy + outerR * Math.sin(a);
        return (
          <line
            key={`spoke-${wi}`}
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />
        );
      })}

      {labels.map((key, wi) => (
        <g key={`w-${key}`}>
          {Array.from({ length: segments }).map((_, si) => {
            const r0 = innerR + si * ringTh + si * (segGap / 2);
            const r1 = r0 + ringTh - segGap / 2;
            const filled = si < activeRings;

            const frac = (si + 0.5) / segments;
            const segColor = radialColor(frac);

            return (
              <path
                key={`seg-${wi}-${si}`}
                d={segmentPath(wi, r0, r1)}
                fill={filled ? segColor : "rgba(255,255,255,0.10)"}
                style={
                  filled
                    ? { filter: `url(#${glowId})`, transition: "fill 450ms ease-in-out" }
                    : { transition: "fill 300ms ease-in-out" }
                }
                opacity={filled ? 0.9 : 1}
              />
            );
          })}
        </g>
      ))}

      {labels.map((txt, wi) => {
        const ang =
          (-90 + wi * (360 / n) + sweepDeg / 2) * (Math.PI / 180);
        const r = outerR + 22;
        const x = cx + r * Math.cos(ang);
        const y = cy + r * Math.sin(ang);
        return (
          <text
            key={`lbl-${wi}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d8e1ff"
            fontSize="14"
          >
            {txt}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- Gauge (ARROW needle; NO YELLOW) ----------
function RatioGauge({ title, value, min, max, invertNeedle = false }) {
  const W = 320;
  const H = 180;
  const pad = 16;
  const cx = W / 2;
  const cy = 130;
  const r = 90;
  const strokeW = 14;

  const toRad = (d) => (d * Math.PI) / 180;

  const arcPathTop = (a0, a1) => {
    const x0 = cx + r * Math.cos(toRad(a0));
    const y0 = cy - r * Math.sin(toRad(a0));
    const x1 = cx + r * Math.cos(toRad(a1));
    const y1 = cy - r * Math.sin(toRad(a1));
    return `M ${x0} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y1}`;
  };

  const valueNum = Number(value);
  const denom = (max - min) || 1;

  const raw01 = clamp((valueNum - min) / denom, 0, 1);
  const base01 = invertNeedle ? 1 - raw01 : raw01;

  // exaggerate motion a bit
  const GAMMA = 0.55;
  const pos01 = clamp(Math.pow(base01, GAMMA), 0, 1);

  // 0 => green (left, 180°), 1 => red (right, 0°)
  const needleA = 180 - pos01 * 180;
  const nx = cx + (r - 18) * Math.cos(toRad(needleA));
  const ny = cy - (r - 18) * Math.sin(toRad(needleA));

  const bucketColor = pos01 <= 0.5 ? "#2E7D32" : "#D32F2F";
  const valueDisplay = Number.isFinite(valueNum) ? valueNum.toFixed(2) : "--";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, color: "#d8e1ff", fontSize: 16 }}>{title}</div>

        <div
          style={{
            fontVariantNumeric: "tabular-nums",
            color: bucketColor,
            fontWeight: 900,
            fontSize: 26,
            lineHeight: 1,
          }}
        >
          {valueDisplay}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", marginTop: 6 }}
      >
        <defs>
          <marker
            id={`arrow-${title}`}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#d8e1ff" />
          </marker>
        </defs>

        {/* NO YELLOW: just red + green */}
        <path d={arcPathTop(0, 90)} stroke="#D32F2F" strokeWidth={strokeW} fill="none" strokeLinecap="round" />
        <path d={arcPathTop(90, 180)} stroke="#2E7D32" strokeWidth={strokeW} fill="none" strokeLinecap="round" />

        <path d={arcPathTop(0, 180)} stroke="rgba(255,255,255,0.12)" strokeWidth="2" fill="none" />

        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="#d8e1ff"
          strokeWidth="4"
          strokeLinecap="round"
          markerEnd={`url(#arrow-${title})`}
        />
        <circle cx={cx} cy={cy} r="7" fill="#0b0f1a" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />

        <text x={pad} y={H - 12} fill="rgba(216,225,255,0.85)" fontSize="12" textAnchor="start">
          Good
        </text>
        <text x={W - pad} y={H - 12} fill="rgba(216,225,255,0.85)" fontSize="12" textAnchor="end">
          Bad
        </text>
      </svg>

      <div style={{ color: "rgba(216,225,255,0.65)", fontSize: 12, marginTop: 2 }}>
        Range: {Number.isFinite(min) ? min.toFixed(2) : "--"}–{Number.isFinite(max) ? max.toFixed(2) : "--"}
      </div>
    </div>
  );
}

// ---------- Main ----------
export default function App() {
  const [subjects, setSubjects] = useState([]);
  const [stats, setStats] = useState({ adrMin: 0, adrMax: 1, tarMin: 0, tarMax: 1 });
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  const tRef = useRef(0);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);

  const msPerStep = 1200;
  const step = 1;

  useEffect(() => {
    Papa.parse("/feature_analysis_data.csv", {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data
          .filter((r) => r["trial_number"] != null && r["subject_number"] != null)
          .map((r) => {
            const alpha = Number(r["Alpha"]);
            const theta = Number(r["Theta"]);
            const delta = Number(r["Delta"]);
            const ADR = alpha / Math.max(delta, 0.1);
            const TAR = theta / Math.max(alpha, 0.1);
            return {
              subject: String(r["subject_number"]),
              t: Number(r["trial_number"]),
              alpha,
              beta: Number(r["Beta"]),
              theta,
              delta,
              ADR,
              TAR,
            };
          })
          .filter((r) => Number.isFinite(r.t));

        const adrs = rows.map((r) => r.ADR).filter(Number.isFinite);
        const tars = rows.map((r) => r.TAR).filter(Number.isFinite);

        const adrMin = Math.min(...adrs, 0);
        const adrMax = Math.max(...adrs, 1);
        const tarMin = Math.min(...tars, 0);
        const tarMax = Math.max(...tars, 1);

        setStats({ adrMin, adrMax, tarMin, tarMax });

        const grouped = Object.values(
          rows.reduce((a, r) => {
            a[r.subject] = a[r.subject] || [];
            a[r.subject].push(r);
            return a;
          }, {})
        ).map((g) => g.sort((a, b) => a.t - b.t));

        setSubjects(grouped);
        setSubjectIndex(0);
        setI(0);
        tRef.current = 0;
        lastTsRef.current = 0;
      },
    });
  }, []);

  const current = subjects[subjectIndex] || [];
  const adrRange = subjectMinMax(current, "ADR");
  const tarRange = subjectMinMax(current, "TAR");

  useEffect(() => {
    if (current.length === 0) return;

    const tick = (ts) => {
      if (!playing) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      tRef.current = Math.min(1, tRef.current + dt / msPerStep);

      if (tRef.current >= 1) {
        const lastIndex = current.length - 1;
        if (i < lastIndex) {
          setI((prev) => Math.min(prev + step, lastIndex));
          tRef.current = 0;
        } else {
          if (subjectIndex < subjects.length - 1) {
            setSubjectIndex((prev) => prev + 1);
            setI(0);
            tRef.current = 0;
            lastTsRef.current = 0;
          } else {
            setPlaying(false);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, current, i, subjectIndex, subjects.length]);

  if (current.length === 0) return <p style={{ color: "#fff" }}>Loading EEG Data…</p>;

  const target = Math.min(i + step, current.length - 1);
  const A = current[i];
  const B = current[target];
  const tt = tRef.current;

  const alpha = safe(lerp(A.alpha, B.alpha, tt));
  const beta = safe(lerp(A.beta, B.beta, tt));
  const theta = safe(lerp(A.theta, B.theta, tt));
  const delta = safe(lerp(A.delta, B.delta, tt));
  const time = safe(lerp(A.t, B.t, tt));

  const ADR = alpha / Math.max(delta, 0.1);
  const TAR = theta / Math.max(alpha, 0.1);

  return (
    <div className="App">
      <div className="app-header">
        <h2 style={{ margin: 0 }}>Subject: {current[0].subject}</h2>
        <h3 style={{ margin: "6px 0 0 0" }}>Time: {safeText(time)}</h3>

        <div className="controls">
          <button
            onClick={() => {
              setPlaying((p) => !p);
              lastTsRef.current = 0;
            }}
          >
            {playing ? "⏸ Pause" : "▶️ Play"}
          </button>

          <button
            onClick={() => {
              setI(0);
              tRef.current = 0;
              lastTsRef.current = 0;
              setPlaying(true);
            }}
          >
            🔁 Reset
          </button>

          <button
            onClick={() => {
              setSubjectIndex((subjectIndex - 1 + subjects.length) % subjects.length);
              setI(0);
              tRef.current = 0;
              lastTsRef.current = 0;
              setPlaying(true);
            }}
          >
            ⬅️ Prev
          </button>

          <button
            onClick={() => {
              setSubjectIndex((subjectIndex + 1) % subjects.length);
              setI(0);
              tRef.current = 0;
              lastTsRef.current = 0;
              setPlaying(true);
            }}
          >
            ➡️ Next
          </button>
        </div>
      </div>

      <div className="chart-container">
        <div className="gridWrap">
          <div className="card">
            <div className="cardBody">
              <div style={{ width: "100%", height: "100%", maxWidth: 560, aspectRatio: "1 / 1" }}>
                <CircularEEGChart values={{ alpha, beta, theta, delta }} size={520} segments={6} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="gaugeStack">
              <RatioGauge title="ADR" value={ADR} min={adrRange.min} max={adrRange.max} invertNeedle />
              <RatioGauge title="TAR" value={TAR} min={tarRange.min} max={tarRange.max} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}