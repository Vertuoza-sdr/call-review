import { useState, useRef, useEffect } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, deleteDoc, doc, getDocs,
} from "firebase/firestore";

// ── Palette Vertuoza (sans dégradé) ──────────────────────────────────────────
const V = {
  darkBlue: "#08104D", blue: "#003FDA", neon: "#00FFFB",
  orange: "#FF4217", s1: "#001957", s2: "#00206E", s3: "#0032AE",
  s4: "#525882", s5: "#99B2F0", bg1: "#E5ECFB", white: "#FFFFFF",
  card: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.09)",
};

// ── Critères ──────────────────────────────────────────────────────────────────
const CRITERIA = [
  { section: "OUVERTURE & POSTURE", color: V.orange, icon: "🎯", items: [
    { id: "tone",    label: "Ton assuré et professionnel dès le début", tip: "Voix posée, rythme maîtrisé, pas de 'euh' excessifs — posture d'expert crédible." },
    { id: "rapport", label: "Création d'un rapport humain rapide", tip: "Utilise le prénom, connaît le secteur, évite le ton trop corporate." },
    { id: "rhythm",  label: "Rythme adapté au prospect", tip: "Ni trop rapide, ni trop lent. Adapté à un entrepreneur du bâtiment occupé." },
    { id: "opening", label: "Ouverture claire, engageante et différenciante", tip: "Accroche ancrée dans une vraie douleur terrain : devis, chantier, facturation..." },
  ]},
  { section: "DISCOVERY & QUALIFICATION", color: V.blue, icon: "🔍", items: [
    { id: "flow",      label: "Enchaînement fluide des étapes", tip: "Intro → découverte → qualification → pitch → next step. Pas de rupture." },
    { id: "talkratio", label: "Ratio de parole maîtrisé (40/60)", tip: "40% SDR / 60% prospect. Trop parler = monologue. Trop peu = call sans direction." },
    { id: "structure", label: "Identification de la structure entreprise", tip: "Taille, nb employés, volume chantiers, organisation interne." },
    { id: "tools",     label: "Compréhension des outils & irritants", tip: "Excel, papier, WhatsApp, ERP concurrent ? Quels irritants quotidiens ?" },
    { id: "decision",  label: "Identification du décisionnaire", tip: "Patron, associé, conjoint, admin ? Qui signe ? Qui bloque ?" },
    { id: "timing",    label: "Qualification du timing et déclencheur", tip: "Croissance, problème facturation, perte chantier, nouvel associé…" },
    { id: "quantify",  label: "Quantification chiffrée du problème", tip: "Heures perdues, devis ratés, argent laissé sur la table. Le prospect doit SENTIR le coût." },
  ]},
  { section: "PITCH & OBJECTIONS", color: "#8B5CF6", icon: "💬", items: [
    { id: "objections", label: "Gestion des objections sans se déstabiliser", tip: "Prix, 'pas le moment', 'on a déjà un outil'… Rebondir avec calme et méthode." },
    { id: "sector",     label: "Réponses ancrées dans le bâtiment", tip: "Cite des clients similaires. Pas de pitch générique SaaS." },
    { id: "trade",      label: "Discours adapté au métier précis", tip: "Électricien ≠ plombier ≠ maçon. Les douleurs changent selon le corps de métier." },
    { id: "vocab",      label: "Vocabulaire métier BTP maîtrisé", tip: "Devis, situation de travaux, avenant, sous-traitants, CCTP, attachement..." },
    { id: "cases",      label: "Vertuoza ancré dans des cas terrain concrets", tip: "'Sur chantier', 'le soir', 'technicien qui pointe', 'devis signé en 10 min'..." },
    { id: "benefits",   label: "Bénéfices mis en avant (pas features)", tip: "Temps récupéré, argent gagné, stress en moins. PAS 'on a un module de facturation'." },
  ]},
  { section: "CLOSING & ÉNERGIE", color: "#10B981", icon: "🚀", items: [
    { id: "control",    label: "Contrôle du call de bout en bout", tip: "Le SDR guide, pose les questions, fixe le rythme. Il ne subit pas." },
    { id: "commitment", label: "Engagement concret obtenu", tip: "Date démo, email reçu, décisionnaire impliqué. Prochaine étape claire." },
    { id: "energy",     label: "Conviction et énergie projetées", tip: "Le prospect doit sentir un expert passionné — pas quelqu'un qui récite un script." },
  ]},
];

const ALL_IDS = CRITERIA.flatMap(s => s.items.map(i => i.id));
const SCORES = [
  { value: 0, label: "—",         color: V.s4 },
  { value: 1, label: "Manquant",  color: "#EF4444" },
  { value: 2, label: "Partiel",   color: "#F59E0B" },
  { value: 3, label: "Bon",       color: "#10B981" },
  { value: 4, label: "Excellent", color: V.blue },
];

// Médailles gamification
const getMedal = (pct) => {
  if (pct >= 85) return { icon: "🏆", label: "Gold",   color: "#FFD700", stars: 5 };
  if (pct >= 70) return { icon: "🥈", label: "Silver", color: "#C0C0C0", stars: 4 };
  if (pct >= 55) return { icon: "🥉", label: "Bronze", color: "#CD7F32", stars: 3 };
  if (pct >= 40) return { icon: "⭐", label: "Rookie",  color: V.s5,     stars: 2 };
  return { icon: "🎯", label: "Débutant", color: V.s4, stars: 1 };
};

const getGrade = (pct) => {
  if (pct >= 85) return { label: "Elite",       color: V.neon };
  if (pct >= 70) return { label: "Solide",       color: "#10B981" };
  if (pct >= 55) return { label: "À améliorer",  color: "#F59E0B" };
  return                 { label: "À travailler", color: "#EF4444" };
};

const calcPct = (scores) => {
  const items = ALL_IDS.filter(id => (scores[id] ?? 0) > 0);
  if (!items.length) return 0;
  return Math.round(items.reduce((a, id) => a + scores[id], 0) / (items.length * 4) * 100);
};
const sectionPct = (section, scores) => {
  const items = section.items.filter(c => (scores[c.id] ?? 0) > 0);
  if (!items.length) return 0;
  return Math.round(items.reduce((a, c) => a + scores[c.id], 0) / (items.length * 4) * 100);
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const DAILY_GOAL = 3;

// ── Stars display ─────────────────────────────────────────────────────────────
function Stars({ count, color }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: 12, color: i <= count ? color : "rgba(255,255,255,0.15)" }}>★</span>
      ))}
    </div>
  );
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 160, height = 48 }) {
  if (!values || values.length < 2) return <div style={{ color: V.s4, fontSize: 11 }}>Pas assez de données</div>;
  const pad = 6;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 10;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = last > prev ? "↗" : last < prev ? "↘" : "→";
  const trendColor = last > prev ? "#10B981" : last < prev ? "#EF4444" : V.s5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.8}/>
        {values.map((v, i) => {
          const x = pad + (i / (values.length - 1)) * (width - pad * 2);
          const y = height - pad - ((v - min) / range) * (height - pad * 2);
          return <circle key={i} cx={x} cy={y} r={i === values.length - 1 ? 4 : 2.5} fill={i === values.length - 1 ? color : `${color}80`}/>;
        })}
      </svg>
      <span style={{ fontSize: 18, color: trendColor }}>{trend}</span>
    </div>
  );
}

// ── Daily counter ─────────────────────────────────────────────────────────────
function DailyCounter({ count }) {
  const pct = Math.min(count / DAILY_GOAL, 1);
  const done = count >= DAILY_GOAL;
  return (
    <div style={{ background: V.card, border: `1px solid ${done ? "#10B98140" : V.border}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
        <svg width={52} height={52} viewBox="0 0 52 52">
          <circle cx={26} cy={26} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
          <circle cx={26} cy={26} r={22} fill="none" stroke={done ? "#10B981" : V.orange} strokeWidth={5}
            strokeDasharray={`${pct * 138.2} 138.2`} strokeLinecap="round"
            transform="rotate(-90 26 26)" style={{ transition: "stroke-dasharray .5s ease" }}/>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {done ? "✅" : "🎯"}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: V.white, marginBottom: 3 }}>
          {done ? "Objectif du jour atteint ! 🎉" : `Encore ${DAILY_GOAL - count} call${DAILY_GOAL - count > 1 ? "s" : ""} à analyser`}
        </div>
        <div style={{ fontSize: 11, color: V.s5 }}>{count} / {DAILY_GOAL} calls analysés aujourd'hui</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {Array.from({ length: DAILY_GOAL }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < count ? (done ? "#10B981" : V.orange) : "rgba(255,255,255,0.1)", transition: "background .3s" }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GaugeArc ──────────────────────────────────────────────────────────────────
function GaugeArc({ pct, color, size = 110 }) {
  const r = size / 2 - 10, circ = Math.PI * r, dash = (pct / 100) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
      <path d={`M 10 ${cy} A ${r} ${r} 0 0 1 ${size-10} ${cy}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} strokeLinecap="round"/>
      <path d={`M 10 ${cy} A ${r} ${r} 0 0 1 ${size-10} ${cy}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}/>
      <text x={cx} y={cy+6} textAnchor="middle" fill={color} fontSize={size*0.2} fontWeight="800" fontFamily="'Gantari',sans-serif">{pct}%</text>
    </svg>
  );
}

function SectionBar({ label, pct, color, icon }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: V.s5 }}>{icon} {label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 10, transition: "width .8s ease" }}/>
      </div>
    </div>
  );
}

// ── AutoTextarea ──────────────────────────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, readOnly }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [value]);
  return (
    <textarea ref={ref} value={value || ""} onChange={onChange} placeholder={placeholder} readOnly={readOnly} rows={2}
      style={{ width: "100%", background: readOnly ? "transparent" : "rgba(255,255,255,0.05)", border: `1px solid ${readOnly ? "transparent" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: V.bg1, fontSize: 13, padding: "10px 12px", fontFamily: "'Gantari',sans-serif", outline: "none", boxSizing: "border-box", resize: "none", lineHeight: 1.7, overflow: "hidden", minHeight: 60 }}/>
  );
}

function ScoreChip({ value, selected, onClick }) {
  const s = SCORES.find(s => s.value === value);
  return (
    <button onClick={() => onClick(value)} style={{ background: selected ? s.color : "rgba(255,255,255,0.06)", border: `1.5px solid ${selected ? s.color : "rgba(255,255,255,0.12)"}`, color: selected ? "#fff" : V.s5, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontFamily: "'Gantari',sans-serif", cursor: "pointer", fontWeight: selected ? 700 : 400, transition: "all .2s", whiteSpace: "nowrap" }}>
      {s.label}
    </button>
  );
}

// ── CriterionRow ──────────────────────────────────────────────────────────────
function CriterionRow({ criterion, scores, justifications, expertScripts, levelUp, onChange, onJustify, sectionColor, readOnly }) {
  const score = scores[criterion.id] ?? 0;
  const [open, setOpen] = useState(false);
  const sc = SCORES.find(s => s.value === score);
  const expert = expertScripts?.[criterion.id];
  const up = levelUp?.[criterion.id];
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(!open)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sectionColor, flexShrink: 0 }}/>
            <span style={{ color: V.white, fontSize: 13.5, fontWeight: 600 }}>{criterion.label}</span>
            <span style={{ color: V.s4, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
          </div>
          {open && <div style={{ marginTop: 6, marginLeft: 14, color: V.s5, fontSize: 12, fontStyle: "italic", lineHeight: 1.6 }}>💡 {criterion.tip}</div>}
        </div>
        {!readOnly ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {SCORES.map(s => <ScoreChip key={s.value} value={s.value} selected={score === s.value} onClick={v => onChange(criterion.id, v)}/>)}
          </div>
        ) : (
          <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, background: `${sc?.color}20`, color: sc?.color, fontWeight: 700, border: `1px solid ${sc?.color}40`, whiteSpace: "nowrap" }}>{sc?.label}</span>
        )}
      </div>
      <div style={{ marginLeft: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>📋 Analyse & Recommandation</div>
          <AutoTextarea value={justifications[criterion.id]} onChange={e => onJustify && onJustify(criterion.id, e.target.value)} placeholder="Observation précise + recommandation concrète..." readOnly={readOnly}/>
        </div>
        {expert && (
          <div style={{ background: "rgba(0,63,218,0.12)", border: "1px solid rgba(0,255,251,0.2)", borderLeft: `3px solid ${V.neon}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🎙️ Ce que le SDR expert aurait dit</div>
            <div style={{ color: V.bg1, fontSize: 13, lineHeight: 1.75, fontStyle: "italic" }}>"{expert}"</div>
          </div>
        )}
        {up && (
          <div style={{ background: "rgba(255,66,23,0.1)", border: "1px solid rgba(255,66,23,0.25)", borderLeft: `3px solid ${V.orange}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Pour passer au niveau supérieur</div>
            {up.tip && <div style={{ color: V.bg1, fontSize: 12.5, lineHeight: 1.7, marginBottom: 8 }}>{up.tip}</div>}
            {up.scripts?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {up.scripts.map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: V.s5, fontStyle: "italic", lineHeight: 1.6 }}>
                    <span style={{ color: V.orange, fontWeight: 700, fontStyle: "normal" }}>#{i+1} </span>"{s}"
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── API ────────────────────────────────────────────────────────────────────────
async function callAPI(system, content, maxT = 4000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: maxT, system, messages: [{ role: "user", content }] })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const txt = data.content?.map(b => b.text || "").join("") || "";
  return JSON.parse(txt.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim());
}

// ── FIFA Card ─────────────────────────────────────────────────────────────────
function FifaCard({ name, avg, medal, reviews }) {
  const [photoUrl, setPhotoUrl] = useState(() => localStorage.getItem("vertuoza_photo") || "");
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(photoUrl);
  const [imgError, setImgError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const savePhoto = () => {
    setPhotoUrl(inputVal); localStorage.setItem("vertuoza_photo", inputVal);
    setEditing(false); setImgError(false);
  };

  const themes = {
    "Gold":     { bg: "linear-gradient(160deg,#C8960C,#FFE066,#C8960C,#A87800)", cardBg: "#8B6914", border: "#FFD700", text: "#fff", accent: "#FFF5A0", glow: "#FFD70060" },
    "Silver":   { bg: "linear-gradient(160deg,#7A8FA0,#C8DFF0,#7A8FA0,#5A7080)", cardBg: "#4A6070", border: "#A8C8E0", text: "#fff", accent: "#E0F0FF", glow: "#7EB8E060" },
    "Bronze":   { bg: "linear-gradient(160deg,#8B4500,#E8943A,#8B4500,#6B3000)", cardBg: "#5B2A00", border: "#E8943A", text: "#fff", accent: "#FFD0A0", glow: "#E8943A60" },
    "Rookie":   { bg: "linear-gradient(160deg,#001060,#003FDA,#001060,#000840)", cardBg: "#001060", border: "#00FFFB", text: "#fff", accent: "#80FFFD", glow: "#00FFFB60" },
    "Débutant": { bg: "linear-gradient(160deg,#1A1A2E,#2A2A4E,#1A1A2E,#0A0A1E)", cardBg: "#0A0A28", border: "#525882", text: "#BDD0FF", accent: "#99B2F0", glow: "#52588260" },
  };
  const T = themes[medal.label] || themes["Débutant"];

  const getStat = (sIdx) => {
    if (!reviews.length) return 0;
    const section = CRITERIA[sIdx];
    return Math.round(reviews.reduce((acc, r) => acc + sectionPct(section, r.scores || {}), 0) / reviews.length);
  };

  const stats = [
    { key: "OUV", val: getStat(0) }, { key: "DIS", val: getStat(1) },
    { key: "PIT", val: getStat(2) }, { key: "CLO", val: getStat(3) },
    { key: "CAL", val: Math.min(99, reviews.length > 0 ? reviews.length * 5 + 40 : 0) },
    { key: "CON", val: (() => { const days = {}; reviews.forEach(r => { if (!r.createdAt) return; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); days[d.toISOString().slice(0,10)] = 1; }); return Math.min(99, Object.keys(days).length * 10); })() },
  ];

  const totalCalls = reviews.length;
  const bestCall = reviews.length ? Math.max(...reviews.map(r => r.globalPct || 0)) : 0;
  const trend = reviews.length >= 2 ? (reviews[0].globalPct || 0) - (reviews[1].globalPct || 0) : 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        {/* ── Carte FIFA style Mbappé ── */}
        <div
          onClick={() => !editing && setShowModal(true)}
          style={{
            width: 240, height: 340, position: "relative",
            background: T.bg, borderRadius: 16,
            border: `2px solid ${T.border}`,
            boxShadow: `0 8px 40px ${T.glow}, 0 2px 8px rgba(0,0,0,0.6)`,
            cursor: editing ? "default" : "pointer",
            fontFamily: "'Gantari',sans-serif", overflow: "hidden",
            transition: "transform .2s, box-shadow .2s",
          }}
          onMouseEnter={e => { if (!editing) { e.currentTarget.style.transform = "translateY(-6px) rotate(-1deg)"; e.currentTarget.style.boxShadow = `0 24px 60px ${T.glow}, 0 4px 16px rgba(0,0,0,0.7)`; }}}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 8px 40px ${T.glow}, 0 2px 8px rgba(0,0,0,0.6)`; }}
        >
          {/* Motif losanges FIFA en fond */}
          <svg style={{ position: "absolute", inset: 0, opacity: 0.07, pointerEvents: "none" }} width={240} height={340}>
            {Array.from({length:14}).map((_,r) => Array.from({length:9}).map((_,c) => (
              <text key={`${r}-${c}`} x={c*30-5} y={r*26+18} fill={T.accent} fontSize={13} fontFamily="Arial">✦</text>
            )))}
          </svg>

          {/* Reflet diagonal */}
          <div style={{ position: "absolute", top: 0, left: "-20%", width: "50%", height: "100%", background: `linear-gradient(105deg,transparent 40%,${T.accent}12 50%,transparent 60%)`, pointerEvents: "none", zIndex: 2 }}/>

          {/* Score + position (haut gauche) — comme FIFA */}
          <div style={{ position: "absolute", top: 12, left: 14, zIndex: 4 }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: T.text, lineHeight: 1, textShadow: "0 2px 6px rgba(0,0,0,0.6)", letterSpacing: "-2px" }}>{avg || 0}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: "1.5px", textAlign: "center", marginTop: 1 }}>SDR</div>
            <div style={{ fontSize: 18, marginTop: 6, textAlign: "center" }}>🇧🇪</div>
            <div style={{ marginTop: 5, width: 24, height: 24, borderRadius: 5, background: `rgba(0,0,0,0.3)`, border: `1px solid ${T.accent}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.accent }}>V</div>
          </div>

          {/* Médaille haut droite */}
          <div style={{ position: "absolute", top: 10, right: 12, zIndex: 4, textAlign: "right" }}>
            <div style={{ fontSize: 24 }}>{medal.icon}</div>
            <Stars count={medal.stars} color={T.accent}/>
          </div>

          {/* PHOTO — zone centrale, comme Mbappé */}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0, width: 190, height: 240, zIndex: 3, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
            {photoUrl && !imgError ? (
              <img src={photoUrl} alt={name} onError={() => setImgError(true)}
                onClick={e => { e.stopPropagation(); setInputVal(photoUrl); setEditing(true); }}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", cursor: "pointer", display: "block" }}/>
            ) : (
              <div onClick={e => { e.stopPropagation(); setInputVal(photoUrl); setEditing(true); }}
                style={{ width: 110, height: 110, borderRadius: "50%", background: `rgba(0,0,0,0.3)`, border: `3px dashed ${T.border}60`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 24 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: T.text }}>{name.slice(0,2).toUpperCase()}</div>
                <div style={{ fontSize: 9, color: T.accent, marginTop: 4 }}>📷 photo</div>
              </div>
            )}
          </div>

          {/* ZONE BAS — nom + stats, fond semi-opaque comme FIFA */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 4 }}>
            {/* Nom */}
            <div style={{ background: `${T.cardBg}F0`, borderTop: `1px solid ${T.border}50`, padding: "6px 10px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "3px", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                {name.length > 10 ? name.slice(0,10).toUpperCase() : name.toUpperCase()}
              </div>
            </div>

            {/* Ligne séparatrice */}
            <div style={{ height: 1, background: `${T.border}40` }}/>

            {/* Stats 3x2 FIFA */}
            <div style={{ background: `${T.cardBg}F5`, padding: "7px 12px 9px", display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {stats.slice(0,3).map(s => (
                  <div key={s.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: T.accent, minWidth: 26, textAlign: "right", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>{s.val}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text, opacity: 0.9, letterSpacing: "0.5px" }}>{s.key}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: `${T.border}40`, margin: "0 4px" }}/>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {stats.slice(3,6).map(s => (
                  <div key={s.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: T.accent, minWidth: 26, textAlign: "right", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>{s.val}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text, opacity: 0.9, letterSpacing: "0.5px" }}>{s.key}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bouton photo */}
        {editing ? (
          <div style={{ width: 240, background: "rgba(255,255,255,0.05)", border: `1px solid ${V.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10, color: V.s5, marginBottom: 6, textTransform: "uppercase", letterSpacing: "1px" }}>URL de ta photo</div>
            <input type="text" placeholder="https://... (LinkedIn, Slack...)" value={inputVal}
              onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && savePhoto()} autoFocus
              style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: V.white, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}/>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={savePhoto} style={{ flex: 1, background: V.blue, border: "none", borderRadius: 8, color: V.white, fontSize: 12, fontWeight: 700, padding: "7px", cursor: "pointer", fontFamily: "inherit" }}>✅ Appliquer</button>
              <button onClick={() => setEditing(false)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: V.s5, fontSize: 12, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setInputVal(photoUrl); setEditing(true); }} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, fontSize: 11, padding: "6px 18px", cursor: "pointer", fontFamily: "inherit" }}>
            📷 {photoUrl ? "Changer la photo" : "Ajouter ta photo"}
          </button>
        )}
      </div>

      {/* ── Modal détails ── */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: V.s1, border: `1px solid ${V.border}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Gantari',sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, border: `2px solid ${T.border}`, overflow: "hidden", background: `${T.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {photoUrl && !imgError ? <img src={photoUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}/> : <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{name.slice(0,2).toUpperCase()}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: V.white, textTransform: "uppercase" }}>{name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 18 }}>{medal.icon}</span>
                  <span style={{ fontSize: 13, color: T.border, fontWeight: 700 }}>{medal.label}</span>
                  <Stars count={medal.stars} color={T.border}/>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: T.border }}>{avg || 0}%</div>
                <div style={{ fontSize: 10, color: V.s5 }}>moyenne réelle</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: V.s5, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total calls", value: totalCalls, icon: "🎙️" },
                { label: "Meilleur", value: bestCall + "%", icon: "⭐" },
                { label: "Tendance", value: trend > 0 ? `+${trend}%` : trend === 0 ? "=" : `${trend}%`, icon: trend > 0 ? "↗" : trend < 0 ? "↘" : "→" },
                { label: "Médaille", value: medal.label, icon: medal.icon },
              ].map(k => (
                <div key={k.label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${V.border}`, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{k.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: V.white }}>{k.value}</div>
                  <div style={{ fontSize: 9, color: V.s5, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>Performance par section</div>
              {[{label:"Ouverture & Posture",sIdx:0,icon:"🎯"},{label:"Discovery & Qualification",sIdx:1,icon:"🔍"},{label:"Pitch & Objections",sIdx:2,icon:"💬"},{label:"Closing & Énergie",sIdx:3,icon:"🚀"}].map(s => {
                const val = getStat(s.sIdx); const m = getMedal(val);
                return (
                  <div key={s.sIdx} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: V.white }}>{s.icon} {s.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Stars count={m.stars} color={m.color}/>
                        <span style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{val}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${val}%`, background: CRITERIA[s.sIdx].color, borderRadius: 4, transition: "width .6s ease" }}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {reviews.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Derniers calls</div>
                {reviews.slice(0,5).map((r,i) => {
                  const m = getMedal(r.globalPct || 0);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: V.white }}>{r.prospectName || "Prospect"}</div>
                        <div style={{ fontSize: 10, color: V.s5 }}>{r.callDate || "—"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{r.globalPct || 0}%</div>
                        <Stars count={m.stars} color={m.color}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}


// ── App principale ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(""); const [authBusy, setAuthBusy] = useState(false);

  const [page, setPage] = useState("dashboard");
  const [reviews, setReviews] = useState([]);
  const [allReviews, setAllReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [reviewTab, setReviewTab] = useState("review");

  const [transcript, setTranscript] = useState("");
  const [scores, setScores] = useState({});
  const [justifications, setJustifications] = useState({});
  const [expertScripts, setExpertScripts] = useState({});
  const [levelUp, setLevelUp] = useState({});
  const [globalComment, setGlobalComment] = useState("");
  const [globalStrengths, setGlobalStrengths] = useState([]);
  const [globalImprovements, setGlobalImprovements] = useState([]);
  const [meta, setMeta] = useState({ prospect: "", date: "" });
  const [loading, setLoading] = useState(false);
  const txtRef = useRef();

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  // My reviews
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  // All reviews (leaderboard)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setAllReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  const handleAuth = async () => {
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      const msgs = { "auth/invalid-credential": "Email ou mot de passe incorrect.", "auth/email-already-in-use": "Email déjà utilisé.", "auth/weak-password": "6 caractères minimum.", "auth/invalid-email": "Email invalide." };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthBusy(false);
  };

  // Save automatique après analyse
  const autoSave = async (r1, r2, r3, pct) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "reviews"), {
        userId: user.uid, userEmail: user.email,
        sdrName: user.email.split("@")[0],
        prospectName: meta.prospect, callDate: meta.date,
        scores: r1.scores || {}, justifications: r1.justifications || {},
        expertScripts: r2 || {}, levelUp: r3 || {},
        globalComment: r1.globalComment || "",
        globalStrengths: r1.globalStrengths || [],
        globalImprovements: r1.globalImprovements || [],
        globalPct: pct, createdAt: new Date(),
      });
    } catch (e) { console.error("Autosave error", e); }
  };

  const deleteReview = async (id) => {
    const r = reviews.find(r => r.id === id);
    if (!r || r.userId !== user?.uid) return;
    await deleteDoc(doc(db, "reviews", id));
    if (page === "detail") setPage("history");
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setPage("review"); setReviewTab("review");
    setScores({}); setJustifications({}); setExpertScripts({}); setLevelUp({}); setGlobalComment("");

    const p1 = `Tu es un directeur commercial senior spécialisé SaaS BTP. Tu analyses des calls SDR pour Vertuoza — logiciel tout-en-un pour le bâtiment (devis, facturation, planning, chantier, RH).
Retourne UNIQUEMENT du JSON valide sans markdown :
{"scores":{"tone":2,"rapport":2,"rhythm":2,"opening":2,"flow":2,"talkratio":2,"structure":2,"tools":2,"decision":2,"timing":2,"quantify":2,"objections":2,"sector":2,"trade":2,"vocab":2,"cases":2,"benefits":2,"control":2,"commitment":2,"energy":2},"justifications":{"tone":"analyse précise + recommandation actionnnable","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."},"globalComment":"Verdict global 4-5 phrases : profil SDR, forces, angles morts, verdict.","globalStrengths":["Force 1 avec exemple concret","Force 2","Force 3"],"globalImprovements":["Axe 1 prioritaire","Axe 2","Axe 3"]}
Scores : 1=manquant, 2=partiel, 3=bon, 4=excellent. Sois précis, direct, exigeant. Cite des éléments réels.`;

    const p2 = `Tu es un top SDR Vertuoza 5 ans BTP. Pour chaque critère, écris la formulation exacte que tu aurais dite dans CE call.
Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":"...","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."}
1-3 phrases max, naturel, ancré dans le contexte du call.`;

    const p3 = `Tu es un coach commercial expert BTP. Pour chaque critère, donne ce qu'il faut faire pour progresser + 2-3 phrases types réutilisables dans n'importe quel call Vertuoza.
Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":{"tip":"ce qu'il faut changer","scripts":["phrase type 1","phrase type 2"]},"rapport":{"tip":"...","scripts":["...","..."]},"rhythm":{"tip":"...","scripts":["...","..."]},"opening":{"tip":"...","scripts":["...","...","..."]},"flow":{"tip":"...","scripts":["...","..."]},"talkratio":{"tip":"...","scripts":["...","..."]},"structure":{"tip":"...","scripts":["...","...","..."]},"tools":{"tip":"...","scripts":["...","...","..."]},"decision":{"tip":"...","scripts":["...","..."]},"timing":{"tip":"...","scripts":["...","...","..."]},"quantify":{"tip":"...","scripts":["...","...","..."]},"objections":{"tip":"...","scripts":["...","...","..."]},"sector":{"tip":"...","scripts":["...","..."]},"trade":{"tip":"...","scripts":["...","..."]},"vocab":{"tip":"...","scripts":["...","..."]},"cases":{"tip":"...","scripts":["...","...","..."]},"benefits":{"tip":"...","scripts":["...","...","..."]},"control":{"tip":"...","scripts":["...","..."]},"commitment":{"tip":"...","scripts":["...","...","..."]},"energy":{"tip":"...","scripts":["...","..."]}}`;

    try {
      const [r1, r2, r3] = await Promise.all([
        callAPI(p1, `Transcript :\n\n${transcript}`, 5000),
        callAPI(p2, `Transcript :\n\n${transcript}`, 4000),
        callAPI(p3, `Transcript :\n\n${transcript}`, 5000),
      ]);
      const pct = calcPct(r1.scores || {});
      setScores(r1.scores || {}); setJustifications(r1.justifications || {});
      setGlobalComment(r1.globalComment || "");
      setGlobalStrengths(r1.globalStrengths || []);
      setGlobalImprovements(r1.globalImprovements || []);
      setExpertScripts(r2 || {}); setLevelUp(r3 || {});
      await autoSave(r1, r2, r3, pct);
      setSaveStatus("saved");
    } catch (e) { setGlobalComment("❌ Erreur : " + e.message); }
    setLoading(false);
  };

  // Stats
  const globalPct = calcPct(scores);
  const grade = getGrade(globalPct);
  const medal = getMedal(globalPct);
  const myAvg = reviews.length ? Math.round(reviews.reduce((a, r) => a + (r.globalPct || 0), 0) / reviews.length) : 0;
  const myMedal = getMedal(myAvg);
  const todayReviews = reviews.filter(r => {
    if (!r.createdAt) return false;
    const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
    return d.toISOString().slice(0, 10) === todayKey();
  }).length;
  const sparklineValues = reviews.slice(0, 10).reverse().map(r => r.globalPct || 0);

  // Leaderboard
  const leaderboard = Object.values(
    allReviews.reduce((acc, r) => {
      const name = r.sdrName || r.userEmail?.split("@")[0] || "Inconnu";
      if (!acc[name]) acc[name] = { name, total: 0, count: 0, scores: [] };
      acc[name].total += r.globalPct || 0; acc[name].count += 1;
      acc[name].scores.push(r.globalPct || 0);
      return acc;
    }, {})
  ).map(s => ({ ...s, avg: Math.round(s.total / s.count) })).sort((a, b) => b.avg - a.avg);

  // Styles
  const card = (extra = {}) => ({ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 20, marginBottom: 16, ...extra });
  const inputStyle = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: V.white, fontSize: 13, padding: "10px 14px", fontFamily: "'Gantari',sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };
  const sLabel = { fontSize: 10, fontWeight: 700, color: V.s5, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 8, display: "block" };

  const gStyles = `
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
    @keyframes slideIn{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
    *{scrollbar-width:thin;scrollbar-color:${V.s3} transparent}
    body{margin:0;background:${V.darkBlue}}
  `;

  // ── AUTH ────────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: V.darkBlue, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{gStyles}</style>
      <div style={{ width: 40, height: 40, border: `3px solid ${V.neon}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
    </div>
  );

  if (!user) return (
    <div style={{ minHeight: "100vh", background: V.darkBlue, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Gantari',sans-serif", padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Gantari:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{gStyles}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: V.blue, border: `2px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: V.neon, margin: "0 auto 16px" }}>V</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: V.white, letterSpacing: "-0.5px" }}>Vertuoza <span style={{ color: V.neon }}>Call Review</span></div>
          <div style={{ fontSize: 13, color: V.s5, marginTop: 4 }}>SDR Performance Platform</div>
        </div>
        <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 20, padding: 32 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
            {[["login","Connexion"],["signup","Créer un compte"]].map(([m,l]) => (
              <button key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, padding: "9px", background: authMode === m ? V.blue : "transparent", border: "none", borderRadius: 8, color: authMode === m ? V.white : V.s5, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{l}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={sLabel}>Email</span>
            <input type="email" placeholder="julie@vertuoza.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle}/>
          </div>
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Mot de passe</span>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} style={inputStyle}/>
          </div>
          {authError && <div style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 10, padding: "10px 14px", color: "#EF4444", fontSize: 12, marginBottom: 16 }}>{authError}</div>}
          <button onClick={handleAuth} disabled={authBusy} style={{ width: "100%", background: V.blue, border: "none", borderRadius: 12, color: V.white, fontSize: 14, fontWeight: 700, padding: "13px", cursor: authBusy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: authBusy ? 0.7 : 1 }}>
            {authBusy ? "⏳" : authMode === "login" ? "Se connecter →" : "Créer mon compte →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── MAIN APP ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: V.darkBlue, fontFamily: "'Gantari',sans-serif", color: V.white }}>
      <link href="https://fonts.googleapis.com/css2?family=Gantari:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{gStyles}</style>

      {/* Topbar */}
      <div style={{ background: V.s1, borderBottom: `1px solid ${V.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: V.blue, border: `1.5px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: V.neon }}>V</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Vertuoza <span style={{ color: V.neon }}>Call Review</span></div>
            <div style={{ fontSize: 10, color: V.s5, letterSpacing: "1px", textTransform: "uppercase" }}>SDR Performance</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Daily counter compact */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${todayReviews >= DAILY_GOAL ? "#10B98140" : V.border}`, borderRadius: 20, padding: "6px 14px" }}>
            <span style={{ fontSize: 12 }}>{todayReviews >= DAILY_GOAL ? "✅" : "🎯"}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: todayReviews >= DAILY_GOAL ? "#10B981" : V.s5 }}>{todayReviews}/{DAILY_GOAL} aujourd'hui</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{myMedal.icon}</span>
            <span style={{ fontSize: 12, color: V.s5 }}>{user.email.split("@")[0]}</span>
          </div>
          <button onClick={() => signOut(auth)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Déconnexion</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${V.border}`, display: "flex", padding: "0 24px", background: V.s1 }}>
        {[["dashboard","📊","Dashboard"],["new","✍️","Analyser un call"],["history","📋","Mes calls"]].map(([id,icon,lbl]) => (
          <button key={id} onClick={() => setPage(id)} style={{ background: "none", border: "none", borderBottom: page === id ? `2px solid ${V.neon}` : "2px solid transparent", color: page === id ? V.neon : V.s5, fontSize: 13, fontWeight: 600, padding: "12px 18px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" }}>{icon} {lbl}</button>
        ))}
        {(page === "review" || page === "detail") && (
          <button style={{ background: "none", border: "none", borderBottom: `2px solid ${V.orange}`, color: V.orange, fontSize: 13, fontWeight: 600, padding: "12px 18px", fontFamily: "inherit" }}>
            {page === "review" ? "🎯 Analyse" : "🔍 Détail"}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px", boxSizing: "border-box" }}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════════ */}
        {page === "dashboard" && (<>

          {/* Daily goal */}
          <DailyCounter count={todayReviews}/>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Calls analysés", value: reviews.length, icon: "🎙️", color: V.neon },
              { label: "Score moyen", value: myAvg ? myAvg + "%" : "—", icon: myMedal.icon, color: myMedal.color },
              { label: "Cette semaine", value: reviews.filter(r => { if (!r.createdAt) return false; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); const now = new Date(); return (now - d) < 7 * 86400000; }).length, icon: "📅", color: V.orange },
              { label: "Objectifs/jour atteints", value: (() => { const days = {}; reviews.forEach(r => { if (!r.createdAt) return; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); const k = d.toISOString().slice(0,10); days[k] = (days[k]||0)+1; }); return Object.values(days).filter(v => v >= DAILY_GOAL).length + "j"; })(), icon: "🏆", color: "#10B981" },
            ].map(k => (
              <div key={k.label} style={{ ...card(), marginBottom: 0, textAlign: "center", padding: "20px 12px" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{k.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: V.s5, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Carte FIFA */}
            <div style={card()}>
              <span style={sLabel}>Ma carte SDR</span>
              <FifaCard
                name={user.email.split("@")[0]}
                avg={myAvg}
                medal={myMedal}
                reviews={reviews}
              />
            </div>

            {/* Leaderboard */}
            <div style={card()}>
              <span style={sLabel}>🏆 Classement équipe</span>
              {leaderboard.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>Aucun call analysé pour l'instant.</div>}
              {leaderboard.map((s, i) => {
                const m = getMedal(s.avg);
                const isMe = s.name === (user.email.split("@")[0]);
                return (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 6, background: isMe ? `${V.blue}20` : "rgba(255,255,255,0.03)", border: `1px solid ${isMe ? `${V.blue}40` : "transparent"}` }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: V.s4, fontSize: 12 }}>#{i+1}</span>}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, color: isMe ? V.neon : V.white }}>{s.name}{isMe ? " (toi)" : ""}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Stars count={m.stars} color={m.color}/>
                        <span style={{ fontSize: 10, color: V.s5 }}>{s.count} call{s.count > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{s.avg}%</div>
                      <div style={{ fontSize: 10, color: m.color }}>{m.label} {m.icon}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Graph évolution semaine */}
          {reviews.length >= 3 && (() => {
            const last10 = reviews.slice(0, 10).reverse();
            return (
              <div style={card()}>
                <span style={sLabel}>📈 Évolution de tes scores</span>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, paddingTop: 8 }}>
                  {last10.map((r, i) => {
                    const pct = r.globalPct || 0;
                    const m = getMedal(pct);
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ fontSize: 9, color: m.color, fontWeight: 700 }}>{pct}%</div>
                        <div style={{ width: "100%", height: `${Math.max(pct * 0.6, 4)}px`, background: m.color, borderRadius: "4px 4px 0 0", transition: "height .5s ease", opacity: 0.85 }}/>
                        <div style={{ fontSize: 8, color: V.s4, textAlign: "center", lineHeight: 1.2 }}>{r.prospectName?.slice(0,6) || "—"}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  {[{label:"🥉 Bronze",t:55},{label:"🥈 Silver",t:70},{label:"🏆 Gold",t:85}].map(g => (
                    <div key={g.label} style={{ fontSize: 10, color: V.s4 }}>{g.label} ≥{g.t}%</div>
                  ))}
                </div>
              </div>
            );
          })()}

          {reviews.length === 0 && (
            <div style={{ ...card(), textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Aucun call analysé</div>
              <div style={{ color: V.s5, fontSize: 14, marginBottom: 24 }}>Lance ta première analyse pour débloquer ton dashboard.</div>
              <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 12, color: V.white, fontWeight: 700, fontSize: 14, padding: "12px 28px", cursor: "pointer", fontFamily: "inherit" }}>🚀 Analyser mon premier call</button>
            </div>
          )}
        </>)}

        {/* ══ NOUVEAU CALL ════════════════════════════════════════════════════════ */}
        {page === "new" && (<>
          <div style={card()}>
            <span style={sLabel}>Infos du call</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input placeholder="Nom du prospect" value={meta.prospect} onChange={e => setMeta({...meta, prospect: e.target.value})} style={inputStyle}/>
              <input placeholder="Date (ex: 08/06/2026)" value={meta.date} onChange={e => setMeta({...meta, date: e.target.value})} style={inputStyle}/>
            </div>
          </div>

          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={sLabel}>Transcript du call</span>
              <button onClick={() => txtRef.current.click()} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, fontSize: 12, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>📁 Importer .txt</button>
              <input ref={txtRef} type="file" accept=".txt,.md" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setTranscript(ev.target.result); r.readAsText(f); }}/>
            </div>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
              placeholder={"Colle le transcript ici...\n\nSDR: Bonjour Marc, c'est Julie de Vertuoza...\nPROSPECT: Oui bonjour..."}
              style={{ ...inputStyle, minHeight: 300, fontFamily: "monospace", resize: "vertical", lineHeight: 1.7 }}/>
            {transcript && <div style={{ marginTop: 8, fontSize: 11, color: V.s5 }}>📝 {transcript.split(" ").length} mots · ~{Math.ceil(transcript.split(" ").length / 130)} min de call</div>}
          </div>

          {/* Objectif du jour */}
          <div style={{ ...card(), padding: "14px 18px", marginBottom: 14 }}>
            <DailyCounter count={todayReviews}/>
          </div>

          <button onClick={handleAnalyze} disabled={loading || !transcript.trim()} style={{ width: "100%", background: (loading || !transcript.trim()) ? "rgba(255,255,255,0.08)" : V.orange, border: "none", borderRadius: 14, color: (loading || !transcript.trim()) ? V.s4 : V.white, fontSize: 15, fontWeight: 700, padding: "16px", cursor: (loading || !transcript.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .3s" }}>
            {loading ? "⏳ Analyse en cours — 3 IAs en parallèle…" : "🚀 Analyser le Call — Sauvegarde automatique"}
          </button>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: V.s4 }}>✅ La review sera sauvegardée automatiquement après l'analyse</div>
        </>)}

        {/* ══ REVIEW ══════════════════════════════════════════════════════════════ */}
        {page === "review" && (<>
          {loading && (
            <div style={{ textAlign: "center", padding: 80 }}>
              <div style={{ width: 50, height: 50, border: `3px solid ${V.neon}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 20px" }}/>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Analyse en cours…</div>
              <div style={{ fontSize: 13, color: V.s5 }}>Scores • Scripts experts • Plans de progression</div>
            </div>
          )}
          {!loading && (<>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[["review","🎯 Critères"],["summary","📊 Synthèse"]].map(([id,lbl]) => (
                <button key={id} onClick={() => setReviewTab(id)} style={{ flex: 1, padding: "10px", background: reviewTab === id ? V.blue : "rgba(255,255,255,0.05)", border: `1.5px solid ${reviewTab === id ? V.blue : V.border}`, borderRadius: 10, color: reviewTab === id ? V.white : V.s5, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{lbl}</button>
              ))}
            </div>

            {/* Status sauvegarde + meta */}
            <div style={{ ...card(), padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ background: saveStatus === "saved" ? "#10B98120" : "rgba(255,255,255,0.05)", border: `1px solid ${saveStatus === "saved" ? "#10B98140" : V.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, color: saveStatus === "saved" ? "#10B981" : V.s4, fontWeight: 600 }}>
                {saveStatus === "saved" ? "✅ Sauvegardé automatiquement" : "💾 Sauvegarde auto après analyse"}
              </div>
              {meta.prospect && <span style={{ fontSize: 12, color: V.s5 }}>🎯 <strong style={{ color: V.white }}>{meta.prospect}</strong></span>}
              {meta.date && <span style={{ fontSize: 12, color: V.s5 }}>📅 <strong style={{ color: V.white }}>{meta.date}</strong></span>}
              {globalPct > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  <Stars count={medal.stars} color={medal.color}/>
                  <span style={{ fontSize: 18, fontWeight: 800, color: medal.color }}>{globalPct}%</span>
                  <span style={{ fontSize: 14 }}>{medal.icon}</span>
                </div>
              )}
            </div>

            {reviewTab === "review" && CRITERIA.map(section => (
              <div key={section.section} style={card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{section.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: "1.2px" }}>{section.section}</span>
                  </div>
                  {sectionPct(section, scores) > 0 && (
                    <div style={{ background: `${section.color}15`, border: `1px solid ${section.color}40`, borderRadius: 20, padding: "3px 14px" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: section.color }}>{sectionPct(section, scores)}%</span>
                    </div>
                  )}
                </div>
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={scores} justifications={justifications} expertScripts={expertScripts} levelUp={levelUp} onChange={(id,v) => setScores(s => ({...s,[id]:v}))} onJustify={(id,v) => setJustifications(j => ({...j,[id]:v}))} sectionColor={section.color}/>)}
              </div>
            ))}

            {reviewTab === "summary" && (<>
              <div style={card()}>
                <span style={sLabel}>Score global</span>
                <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <GaugeArc pct={globalPct} color={medal.color} size={120}/>
                    <div style={{ fontSize: 28, marginTop: 4 }}>{medal.icon}</div>
                    <div style={{ fontSize: 13, color: medal.color, fontWeight: 700 }}>{medal.label}</div>
                    <Stars count={medal.stars} color={medal.color}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {CRITERIA.map(s => <SectionBar key={s.section} label={s.section} pct={sectionPct(s, scores)} color={s.color} icon={s.icon}/>)}
                  </div>
                </div>
              </div>
              {globalComment && (
                <div style={card()}>
                  <span style={sLabel}>🎯 Verdict du coach</span>
                  <p style={{ color: V.bg1, fontSize: 14, lineHeight: 1.8, margin: "0 0 16px" }}>{globalComment}</p>
                  {(globalStrengths.length > 0 || globalImprovements.length > 0) && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>✅ Forces</div>
                        {globalStrengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 6, borderLeft: "2px solid #10B981" }}>{s}</div>)}
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Axes prioritaires</div>
                        {globalImprovements.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: `${V.orange}10`, borderRadius: 8, marginBottom: 6, borderLeft: `2px solid ${V.orange}` }}>{s}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>)}
          </>)}
        </>)}

        {/* ══ HISTORIQUE ══════════════════════════════════════════════════════════ */}
        {page === "history" && (<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Mes calls</div>
              <div style={{ fontSize: 12, color: V.s5, marginTop: 2 }}>{reviews.length} reviews · {myAvg}% de moyenne</div>
            </div>
            <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 10, color: V.white, fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit" }}>+ Nouveau call</button>
          </div>

          {reviews.length === 0 && <div style={{ ...card(), textAlign: "center", padding: 48 }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ color: V.s5 }}>Aucune review sauvegardée</div></div>}

          {reviews.map(r => {
            const m = getMedal(r.globalPct || 0);
            return (
              <div key={r.id} style={{ ...card(), cursor: "pointer", transition: "border-color .2s" }} onClick={() => { setSelectedReview(r); setPage("detail"); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: `${m.color}15`, border: `2px solid ${m.color}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: m.color }}>{r.globalPct || 0}%</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.prospectName || "Prospect inconnu"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                      <Stars count={m.stars} color={m.color}/>
                      <span style={{ fontSize: 11, color: V.s5 }}>{r.callDate || new Date(r.createdAt?.toDate?.()).toLocaleDateString("fr-FR")}</span>
                      <span style={{ fontSize: 11, color: m.color, fontWeight: 600 }}>{m.label}</span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); if (window.confirm("Supprimer ce call ?")) deleteReview(r.id); }} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 11, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>🗑️ Supprimer</button>
                </div>
              </div>
            );
          })}
        </>)}

        {/* ══ DÉTAIL ══════════════════════════════════════════════════════════════ */}
        {page === "detail" && selectedReview && (() => {
          const r = selectedReview; const m = getMedal(r.globalPct || 0);
          const isOwner = r.userId === user?.uid;
          return (<>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <button onClick={() => setPage("history")} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 10, color: V.s5, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Retour</button>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{r.prospectName || "Prospect"}</div>
                <div style={{ fontSize: 12, color: V.s5 }}>{r.callDate} · {r.sdrName}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{r.globalPct || 0}%</div>
                  <Stars count={m.stars} color={m.color}/>
                  <div style={{ fontSize: 11, color: m.color, fontWeight: 600 }}>{m.icon} {m.label}</div>
                </div>
                {isOwner && (
                  <button onClick={() => { if (window.confirm("Supprimer ce call ?")) deleteReview(r.id); }} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 12, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>🗑️ Supprimer</button>
                )}
              </div>
            </div>

            <div style={card()}>
              <span style={sLabel}>Scores par section</span>
              {CRITERIA.map(s => <SectionBar key={s.section} label={s.section} pct={sectionPct(s, r.scores || {})} color={s.color} icon={s.icon}/>)}
            </div>

            {r.globalComment && (
              <div style={card()}>
                <span style={sLabel}>🎯 Verdict du coach</span>
                <p style={{ color: V.bg1, fontSize: 14, lineHeight: 1.8, margin: "0 0 16px" }}>{r.globalComment}</p>
                {(r.globalStrengths?.length > 0 || r.globalImprovements?.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {r.globalStrengths?.length > 0 && <div>
                      <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>✅ Forces</div>
                      {r.globalStrengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 6, borderLeft: "2px solid #10B981" }}>{s}</div>)}
                    </div>}
                    {r.globalImprovements?.length > 0 && <div>
                      <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Axes prioritaires</div>
                      {r.globalImprovements.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: `${V.orange}10`, borderRadius: 8, marginBottom: 6, borderLeft: `2px solid ${V.orange}` }}>{s}</div>)}
                    </div>}
                  </div>
                )}
              </div>
            )}

            {CRITERIA.map(section => (
              <div key={section.section} style={card()}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{section.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: "1.2px" }}>{section.section}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: section.color }}>{sectionPct(section, r.scores || {})}%</span>
                </div>
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={r.scores||{}} justifications={r.justifications||{}} expertScripts={r.expertScripts||{}} levelUp={r.levelUp||{}} sectionColor={section.color} readOnly/>)}
              </div>
            ))}
          </>);
        })()}
      </div>
    </div>
  );
}
