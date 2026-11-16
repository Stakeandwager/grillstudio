/* A drawn storyboard frame for a shot — free, instant, offline.
   Figures scale with shot size, the horizon moves with camera angle,
   the palette follows time of day, and arrows show camera movement. */
import { SHOT_SIZES } from "../engine/index.js";

const SKY = (tod = "") =>
  /NIGHT|MIDNIGHT|EVENING/.test(tod)
    ? ["#0d1426", "#1b2440"]
    : /DAWN|SUNRISE|SUNSET|DUSK|MAGIC/.test(tod)
      ? ["#3b2236", "#c46a3a"]
      : ["#7c93a8", "#c9d3da"];

function Figure({ x, base, h, label, dark }) {
  const head = h * 0.14;
  const body = { w: h * 0.32, h: h * 0.62 };
  const fill = dark ? "#f0d9c4" : "#2a211b";
  return (
    <g>
      <rect x={x - body.w / 2} y={base - body.h} width={body.w} height={body.h + h} rx={body.w * 0.35} fill={fill} opacity="0.92" />
      <circle cx={x} cy={base - body.h - head * 1.05} r={head} fill={fill} />
      {label && h < 70 && (
        <text x={x} y={Math.min(86, base + 6)} textAnchor="middle" fontSize="4.5" fill={dark ? "#f0d9c4" : "#2a211b"} fontFamily="monospace">
          {label}
        </text>
      )}
    </g>
  );
}

function MoveArrow({ movement, stroke }) {
  const a = { stroke, strokeWidth: 1.4, fill: "none", markerEnd: "url(#arr)" };
  switch (movement) {
    case "slow push-in":
    case "dolly":
      return (
        <g {...a}>
          <path d="M6 6 L18 14" /> <path d="M154 6 L142 14" /> <path d="M6 84 L18 76" /> <path d="M154 84 L142 76" />
        </g>
      );
    case "pull-out":
      return (
        <g {...a}>
          <path d="M18 14 L6 6" /> <path d="M142 14 L154 6" /> <path d="M18 76 L6 84" /> <path d="M142 76 L154 84" />
        </g>
      );
    case "pan":
    case "tracking":
      return <path {...a} d="M40 10 L120 10" />;
    case "crane up":
      return <path {...a} d="M150 70 L150 18" />;
    case "handheld":
      return <path stroke={stroke} strokeWidth="1.2" fill="none" d="M8 8 q4 -4 8 0 t8 0 t8 0" />;
    default:
      return null;
  }
}

export default function StoryboardSketch({ shot, scene, title }) {
  const [top, bottom] = SKY(scene?.timeOfDay);
  const dark = /NIGHT|MIDNIGHT|EVENING/.test(scene?.timeOfDay || "");
  const horizon = shot.angle === "high angle" || shot.angle === "overhead" ? 26 : shot.angle === "low angle" ? 72 : 52;
  const size = SHOT_SIZES[shot.size] || SHOT_SIZES.MS;
  const names = (scene?.present || []).filter((n) => String(shot.subject || "").toUpperCase().includes(n));
  const people = names.length ? names : shot.size === "INSERT" ? [] : (scene?.present || []).slice(0, 1);
  const h = 40 * size.figure;
  const base = shot.size === "EWS" || shot.size === "WS" || shot.size === "FS" ? horizon + h * 0.55 + 6 : 14 + h * 0.91; // close shots: head top sits just under the frame edge
  const xs =
    people.length === 1
      ? [shot.size === "EWS" || shot.size === "WS" ? 160 / 3 : 160 / 2.6]
      : people.length === 2
        ? shot.size === "CU" || shot.size === "MCU"
          ? [160 / 3]
          : [56, 104]
        : people.map((_, i) => 40 + i * (80 / Math.max(1, people.length - 1)));
  const shown = shot.angle === "over-the-shoulder" ? people.slice(0, 1) : people.slice(0, xs.length);
  const stroke = dark ? "#ffb15a" : "#ff6a1a";

  return (
    <svg viewBox="0 0 160 90" className="sb-frame" role="img" aria-label={title || `${size.label} sketch`}>
      <defs>
        <linearGradient id={`sky-${shot.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill={stroke} />
        </marker>
      </defs>
      <g transform={shot.angle === "dutch" ? "rotate(-8 80 45)" : undefined}>
        <rect x="-10" y="-10" width="180" height="110" fill={`url(#sky-${shot.id})`} />
        <rect x="-10" y={horizon} width="180" height={100 - horizon} fill={dark ? "#0a0d16" : "#5b5246"} opacity="0.55" />
        <line x1="-10" x2="170" y1={horizon} y2={horizon} stroke={dark ? "#2c3550" : "#3d342b"} strokeWidth="0.6" />
        {shot.size === "INSERT" ? (
          <g>
            <rect x="58" y="28" width="44" height="34" rx="5" fill={dark ? "#2a2f45" : "#efe6da"} stroke={stroke} strokeWidth="1" />
            <text x="80" y="48" textAnchor="middle" fontSize="6" fill={dark ? "#f0d9c4" : "#2a211b"} fontFamily="monospace">
              {String(shot.subject || "detail").slice(0, 14)}
            </text>
          </g>
        ) : (
          shown.map((n, i) => <Figure key={n + i} x={xs[i]} base={base} h={h} label={n} dark={dark} />)
        )}
        {shot.angle === "over-the-shoulder" && <ellipse cx="140" cy="88" rx="34" ry="30" fill={dark ? "#05070d" : "#1a1410"} opacity="0.9" />}
      </g>
      <line x1="53.3" x2="53.3" y1="0" y2="90" stroke="#fff" strokeOpacity="0.07" />
      <line x1="106.7" x2="106.7" y1="0" y2="90" stroke="#fff" strokeOpacity="0.07" />
      <MoveArrow movement={shot.movement} stroke={stroke} />
      <text x="4" y="86" fontSize="5.5" fill="#fff" fontFamily="monospace" opacity="0.85">
        {shot.size} · {shot.movement}
      </text>
    </svg>
  );
}
