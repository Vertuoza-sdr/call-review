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

// ── Badges écussons ───────────────────────────────────────────────────────────
const BADGES = [
  { id: "first_call",    icon: "🛡️",  name: "Premier Call",       desc: "Premier call analysé",                 condition: (r,o) => r.length >= 1 },
  { id: "trio",          icon: "⚔️",  name: "Trio du Jour",       desc: "3 calls analysés en une journée",      condition: (r,o) => { const days={}; r.forEach(rv=>{if(!rv.createdAt)return;const d=rv.createdAt.toDate?rv.createdAt.toDate():new Date(rv.createdAt);const k=d.toISOString().slice(0,10);days[k]=(days[k]||0)+1;}); return Object.values(days).some(v=>v>=3); } },
  { id: "ten_calls",     icon: "🏰",  name: "Vétéran",            desc: "10 calls analysés",                    condition: (r,o) => r.length >= 10 },
  { id: "bronze_badge",  icon: "🥉",  name: "Rang Bronze",        desc: "Score moyen ≥ 55%",                    condition: (r,o) => r.length && Math.round(r.reduce((a,rv)=>a+(rv.globalPct||0),0)/r.length) >= 55 },
  { id: "silver_badge",  icon: "🥈",  name: "Rang Argent",        desc: "Score moyen ≥ 70%",                    condition: (r,o) => r.length && Math.round(r.reduce((a,rv)=>a+(rv.globalPct||0),0)/r.length) >= 70 },
  { id: "gold_badge",    icon: "🏆",  name: "Rang Or",            desc: "Score moyen ≥ 85%",                    condition: (r,o) => r.length && Math.round(r.reduce((a,rv)=>a+(rv.globalPct||0),0)/r.length) >= 85 },
  { id: "perfect_close", icon: "🎯",  name: "Closer Parfait",     desc: "Score Closing ≥ 90% sur un call",      condition: (r,o) => r.some(rv=>sectionPct(CRITERIA[3],rv.scores||{})>=90) },
  { id: "obj_validated", icon: "✅",  name: "Objectif Atteint",   desc: "Premier objectif coach validé",        condition: (r,o) => o.some(ob=>ob.status==="validated") },
  { id: "streak_3",      icon: "🔥",  name: "En Feu",             desc: "3 calls consécutifs en amélioration",  condition: (r,o) => { if(r.length<3)return false; const last3=r.slice(0,3).map(rv=>rv.globalPct||0); return last3[0]>last3[1]&&last3[1]>last3[2]; } },
  { id: "discovery_ace", icon: "🔍",  name: "Détective BTP",      desc: "Score Discovery ≥ 85% sur un call",    condition: (r,o) => r.some(rv=>sectionPct(CRITERIA[1],rv.scores||{})>=85) },
  { id: "week_warrior",  icon: "⚡",  name: "Guerrier de la Sem.", desc: "5 calls en une semaine",               condition: (r,o) => { const now=new Date(); return r.filter(rv=>{if(!rv.createdAt)return false;const d=rv.createdAt.toDate?rv.createdAt.toDate():new Date(rv.createdAt);return(now-d)<7*86400000;}).length>=5; } },
  { id: "elite",         icon: "👑",  name: "Élite SDR",          desc: "Score ≥ 90% sur un call",              condition: (r,o) => r.some(rv=>(rv.globalPct||0)>=90) },
];

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

// ── SDR Collector Card ────────────────────────────────────────────────────────
function FifaCard({ name, avg, medal, reviews, allReviews, userId }) {
  const [photoUrl, setPhotoUrl] = useState(() => localStorage.getItem("vertuoza_photo") || "");
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(photoUrl);
  const [imgError, setImgError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("mine"); // mine | team

  const savePhoto = () => {
    setPhotoUrl(inputVal); localStorage.setItem("vertuoza_photo", inputVal);
    setEditing(false); setImgError(false);
  };

  // Thème selon médaille
  const themes = {
    "Gold":     { foil: ["#8B6914","#FFE566","#C8960C","#FFD700","#8B6914"], glow: "#FFD700", accent: "#FFE566", stat: "#FFD700", badge: "#8B6914" },
    "Silver":   { foil: ["#4A6070","#C8DFF0","#7A8FA0","#A8C8E0","#4A6070"], glow: "#A8C8E0", accent: "#E0F0FF", stat: "#A8C8E0", badge: "#4A6070" },
    "Bronze":   { foil: ["#5B2A00","#F0A850","#8B4500","#E8943A","#5B2A00"], glow: "#E8943A", accent: "#FFD0A0", stat: "#E8943A", badge: "#5B2A00" },
    "Rookie":   { foil: ["#001060","#00FFFB","#003FDA","#00FFFB","#001060"], glow: "#00FFFB", accent: "#80FFFD", stat: "#00FFFB", badge: "#001060" },
    "Débutant": { foil: ["#0A0A28","#99B2F0","#525882","#99B2F0","#0A0A28"], glow: "#525882", accent: "#BDD0FF", stat: "#99B2F0", badge: "#0A0A28" },
  };
  const T = themes[medal.label] || themes["Débutant"];

  const getStat = (sIdx, revs) => {
    const r = revs || reviews;
    if (!r.length) return 0;
    return Math.round(r.reduce((acc, rv) => acc + sectionPct(CRITERIA[sIdx], rv.scores || {}), 0) / r.length);
  };

  const totalCalls = reviews.length;
  const bestCall = reviews.length ? Math.max(...reviews.map(r => r.globalPct || 0)) : 0;
  const trend = reviews.length >= 2 ? (reviews[0].globalPct||0) - (reviews[1].globalPct||0) : 0;
  const weekCalls = reviews.filter(r => { if (!r.createdAt) return false; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); return (new Date()-d) < 7*86400000; }).length;

  // Leaderboard cards from allReviews
  const teamCards = Object.values(
    (allReviews||[]).reduce((acc, r) => {
      const n = r.sdrName || r.userEmail?.split("@")[0] || "?";
      if (!acc[n]) acc[n] = { name: n, reviews: [], userId: r.userId };
      acc[n].reviews.push(r);
      return acc;
    }, {})
  ).map(s => ({
    ...s,
    avg: s.reviews.length ? Math.round(s.reviews.reduce((a,r) => a+(r.globalPct||0),0)/s.reviews.length) : 0,
    medal: getMedal(s.reviews.length ? Math.round(s.reviews.reduce((a,r) => a+(r.globalPct||0),0)/s.reviews.length) : 0),
  })).sort((a,b) => b.avg - a.avg);

  // Mini collector card (pour le leaderboard)
  const MiniCard = ({ player, rank }) => {
    const pt = themes[player.medal.label] || themes["Débutant"];
    const photo = player.userId === userId ? photoUrl : "";
    const isMe = player.userId === userId;
    return (
      <div style={{
        width: 130, height: 195, position: "relative", borderRadius: 12, overflow: "hidden",
        background: `linear-gradient(160deg, #0A0A18, #141430)`,
        border: `1.5px solid ${pt.glow}60`,
        boxShadow: `0 4px 20px ${pt.glow}30`,
        flexShrink: 0, cursor: "default",
        outline: isMe ? `2px solid ${pt.glow}` : "none",
      }}>
        {/* Foil background */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${pt.foil.join(",")})`, opacity: 0.12 }}/>

        {/* Rank badge */}
        <div style={{ position: "absolute", top: 7, left: 7, zIndex: 4, fontSize: 14 }}>
          {rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":<span style={{fontSize:10,color:pt.accent,fontWeight:700}}>#{rank+1}</span>}
        </div>

        {/* Score */}
        <div style={{ position: "absolute", top: 6, right: 8, zIndex: 4, textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: pt.accent, lineHeight: 1, textShadow: `0 0 12px ${pt.glow}` }}>{player.avg}</div>
          <div style={{ fontSize: 7, color: pt.accent, opacity: 0.8, letterSpacing: "1px" }}>SCORE</div>
        </div>

        {/* Photo zone */}
        <div style={{ position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)", width: 120, height: 100, overflow: "hidden" }}>
          {photo && !imgError ? (
            <img src={photo} alt={player.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}/>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `${pt.glow}10` }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: pt.accent }}>{player.name.slice(0,2).toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: `${pt.badge}EE`, borderTop: `1px solid ${pt.glow}40`, padding: "5px 6px 6px" }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {player.name.slice(0,10).toUpperCase()}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: pt.accent }}>{getStat(i, player.reviews)}</div>
                <div style={{ fontSize: 6, color: "#ffffff80", letterSpacing: "0.5px" }}>{["OUV","DIS","PIT","CLO"][i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Foil shimmer */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg,transparent 40%,${pt.accent}08 50%,transparent 60%)`, pointerEvents: "none" }}/>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
          {[["mine","Ma carte"],["team","L'équipe"]].map(([id,lbl]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{ padding: "6px 16px", background: activeTab===id ? V.blue : "transparent", border: "none", borderRadius: 8, color: activeTab===id ? V.white : V.s5, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{lbl}</button>
          ))}
        </div>

        {/* ── MA CARTE ── */}
        {activeTab === "mine" && (<>
          <div style={{ position: "relative" }}>
            {/* Glow ambiance derrière la carte */}
            <div style={{ position: "absolute", inset: -20, background: `radial-gradient(ellipse at 50% 60%, ${T.glow}25 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }}/>

            <div
              onClick={() => !editing && setShowModal(true)}
              style={{
                width: 240, height: 360, position: "relative", zIndex: 1,
                borderRadius: 18, overflow: "hidden",
                background: "linear-gradient(170deg, #0D0D1F 0%, #060610 100%)",
                border: `1.5px solid ${T.glow}50`,
                boxShadow: `0 0 0 1px ${T.glow}20, 0 12px 50px ${T.glow}40, 0 2px 8px rgba(0,0,0,0.8)`,
                cursor: editing ? "default" : "pointer",
                fontFamily: "'Gantari',sans-serif",
                transition: "transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s",
              }}
              onMouseEnter={e => { if (!editing) { e.currentTarget.style.transform="translateY(-8px) rotateY(-4deg)"; e.currentTarget.style.boxShadow=`0 0 0 1px ${T.glow}40, 0 24px 60px ${T.glow}60, 0 4px 16px rgba(0,0,0,0.8)`; }}}
              onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=`0 0 0 1px ${T.glow}20, 0 12px 50px ${T.glow}40, 0 2px 8px rgba(0,0,0,0.8)`; }}
            >
              {/* Foil texture en fond */}
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,${T.foil.join(",")})`, opacity: 0.07, pointerEvents: "none" }}/>

              {/* Grille tech subtile */}
              <svg style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none" }} width={240} height={360}>
                {Array.from({length:18}).map((_,i) => <line key={`h${i}`} x1={0} y1={i*20} x2={240} y2={i*20} stroke={T.accent} strokeWidth={0.5}/>)}
                {Array.from({length:12}).map((_,i) => <line key={`v${i}`} x1={i*20} y1={0} x2={i*20} y2={360} stroke={T.accent} strokeWidth={0.5}/>)}
              </svg>

              {/* Reflet diagonal premium */}
              <div style={{ position: "absolute", top: 0, left: "-40%", width: "70%", height: "100%", background: `linear-gradient(105deg,transparent 35%,${T.accent}10 50%,transparent 65%)`, pointerEvents: "none", zIndex: 2 }}/>

              {/* ── PHOTO — pleine hauteur ── */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 240, zIndex: 1, overflow: "hidden" }}>
                {/* Vignette bottom sur la photo */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(transparent,#060610)", zIndex: 2, pointerEvents: "none" }}/>
                {photoUrl && !imgError ? (
                  <img src={photoUrl} alt={name} onError={() => setImgError(true)}
                    onClick={e => { e.stopPropagation(); setInputVal(photoUrl); setEditing(true); }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block", cursor: "pointer" }}/>
                ) : (
                  <div onClick={e => { e.stopPropagation(); setInputVal(photoUrl); setEditing(true); }}
                    style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${T.glow}08`, cursor: "pointer", gap: 8 }}>
                    {/* Téléphone stylisé SVG */}
                    <svg width={60} height={90} viewBox="0 0 60 90">
                      <rect x={4} y={2} width={52} height={86} rx={8} fill="none" stroke={T.glow} strokeWidth={2} opacity={0.6}/>
                      <rect x={8} y={8} width={44} height={66} rx={3} fill={`${T.glow}15`}/>
                      <circle cx={30} cy={82} r={3} fill={T.glow} opacity={0.7}/>
                      <text x={30} y={45} textAnchor="middle" fill={T.accent} fontSize={22} fontWeight={900}>
                        {name.slice(0,2).toUpperCase()}
                      </text>
                      <text x={30} y={60} textAnchor="middle" fill={T.glow} fontSize={9} opacity={0.8}>SDR</text>
                    </svg>
                    <div style={{ fontSize: 10, color: T.accent, opacity: 0.7 }}>📷 Ajouter ta photo</div>
                  </div>
                )}
              </div>

              {/* Score en overlay sur la photo — haut gauche */}
              <div style={{ position: "absolute", top: 14, left: 16, zIndex: 5 }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: T.accent, lineHeight: 1, letterSpacing: "-2px", textShadow: `0 0 20px ${T.glow}, 0 2px 4px rgba(0,0,0,0.8)` }}>{avg||0}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.accent, letterSpacing: "3px", opacity: 0.9, marginTop: 1 }}>SDR</div>
              </div>

              {/* Médaille + étoiles — haut droite */}
              <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, textAlign: "right" }}>
                <div style={{ fontSize: 26, filter: `drop-shadow(0 0 8px ${T.glow})` }}>{medal.icon}</div>
                <Stars count={medal.stars} color={T.accent}/>
                <div style={{ fontSize: 8, color: T.accent, fontWeight: 700, letterSpacing: "1px", marginTop: 2, opacity: 0.8 }}>{medal.label.toUpperCase()}</div>
              </div>

              {/* Icône téléphone subtile — coin bas gauche photo */}
              <div style={{ position: "absolute", bottom: 124, left: 14, zIndex: 4, opacity: 0.35 }}>
                <svg width={18} height={26} viewBox="0 0 18 26">
                  <rect x={1} y={1} width={16} height={24} rx={3} fill="none" stroke={T.accent} strokeWidth={1.5}/>
                  <circle cx={9} cy={22} r={1.5} fill={T.accent}/>
                </svg>
              </div>

              {/* ── ZONE BAS — nom + stats ── */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 4, padding: "10px 14px 12px" }}>

                {/* Nom */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "3px", lineHeight: 1, textShadow: `0 0 16px ${T.glow}80`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 8, color: T.accent, letterSpacing: "2px", opacity: 0.7, marginTop: 3, textTransform: "uppercase" }}>Vertuoza · SDR</div>
                </div>

                {/* Ligne séparatrice néon */}
                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${T.glow},transparent)`, marginBottom: 10, opacity: 0.6 }}/>

                {/* Stats avec barres néon */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  {[
                    { key: "OUV", sIdx: 0 }, { key: "CLO", sIdx: 3 },
                    { key: "DIS", sIdx: 1 }, { key: "PIT", sIdx: 2 },
                  ].map(s => {
                    const val = getStat(s.sIdx);
                    return (
                      <div key={s.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: T.accent, fontWeight: 700, letterSpacing: "1px" }}>{s.key}</span>
                          <span style={{ fontSize: 9, fontWeight: 900, color: "#fff" }}>{val}%</span>
                        </div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${val}%`, background: `linear-gradient(90deg,${T.glow}80,${T.accent})`, borderRadius: 2, boxShadow: `0 0 6px ${T.glow}` }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer pills */}
                <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "center" }}>
                  {[
                    { label: `${totalCalls} calls`, icon: "🎙️" },
                    { label: `Best ${bestCall}%`, icon: "⭐" },
                    { label: trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : "Stable", icon: trend > 0 ? "↗" : trend < 0 ? "↘" : "→" },
                  ].map(p => (
                    <div key={p.label} style={{ background: `${T.glow}15`, border: `1px solid ${T.glow}30`, borderRadius: 20, padding: "2px 8px", fontSize: 8, color: T.accent, fontWeight: 600, display: "flex", gap: 3, alignItems: "center" }}>
                      <span>{p.icon}</span><span>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coins décoratifs */}
              {[[0,0,"45deg"],[0,"auto","135deg"],["auto",0,"-45deg"],["auto","auto","-135deg"]].map(([t,r,deg],i) => (
                <div key={i} style={{ position: "absolute", top: t===0?8:t, right: r===0?8:r, bottom: t==="auto"?8:undefined, left: r==="auto"?8:undefined, width: 12, height: 12, borderTop: `1.5px solid ${T.glow}`, borderLeft: `1.5px solid ${T.glow}`, opacity: 0.5, transform: `rotate(${deg})`, pointerEvents: "none", zIndex: 6 }}/>
              ))}
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
        </>)}

        {/* ── TEAM CARDS ── */}
        {activeTab === "team" && (
          <div>
            <div style={{ fontSize: 11, color: V.s5, textAlign: "center", marginBottom: 14 }}>🏆 Cartes collector de l'équipe</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 420 }}>
              {teamCards.map((player, i) => (
                <MiniCard key={player.name} player={player} rank={i}/>
              ))}
              {teamCards.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>Aucun membre pour l'instant.</div>}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal détails ── */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: V.s1, border: `1px solid ${T.glow}40`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Gantari',sans-serif", boxShadow: `0 0 40px ${T.glow}20` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, border: `2px solid ${T.glow}`, overflow: "hidden", background: `${T.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {photoUrl && !imgError ? <img src={photoUrl} alt={name} style={{ width:"100%",height:"100%",objectFit:"cover",objectPosition:"top" }}/> : <span style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{name.slice(0,2).toUpperCase()}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: V.white, textTransform: "uppercase" }}>{name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 18 }}>{medal.icon}</span>
                  <span style={{ fontSize: 13, color: T.glow, fontWeight: 700 }}>{medal.label}</span>
                  <Stars count={medal.stars} color={T.glow}/>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: T.accent, textShadow: `0 0 16px ${T.glow}` }}>{avg||0}%</div>
                <div style={{ fontSize: 10, color: V.s5 }}>moyenne</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: V.s5, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
              {[{label:"Total calls",value:totalCalls,icon:"🎙️"},{label:"Meilleur",value:bestCall+"%",icon:"⭐"},{label:"Cette sem.",value:weekCalls,icon:"📅"},{label:"Tendance",value:trend>0?`+${trend}%`:trend===0?"=":trend+"%",icon:trend>0?"↗":trend<0?"↘":"→"}].map(k => (
                <div key={k.label} style={{ background:"rgba(255,255,255,0.04)",border:`1px solid ${V.border}`,borderRadius:10,padding:"10px 8px",textAlign:"center" }}>
                  <div style={{ fontSize:18,marginBottom:4 }}>{k.icon}</div>
                  <div style={{ fontSize:13,fontWeight:800,color:V.white }}>{k.value}</div>
                  <div style={{ fontSize:9,color:V.s5,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize:10,color:V.s5,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12 }}>Performance par section</div>
              {[{label:"Ouverture & Posture",sIdx:0,icon:"🎯"},{label:"Discovery & Qualification",sIdx:1,icon:"🔍"},{label:"Pitch & Objections",sIdx:2,icon:"💬"},{label:"Closing & Énergie",sIdx:3,icon:"🚀"}].map(s => {
                const val = getStat(s.sIdx); const m = getMedal(val);
                return (
                  <div key={s.sIdx} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                      <span style={{ fontSize:12,color:V.white }}>{s.icon} {s.label}</span>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <Stars count={m.stars} color={m.color}/>
                        <span style={{ fontSize:13,fontWeight:800,color:m.color }}>{val}%</span>
                      </div>
                    </div>
                    <div style={{ height:6,background:"rgba(255,255,255,0.07)",borderRadius:4,overflow:"hidden" }}>
                      <div style={{ height:"100%",width:`${val}%`,background:CRITERIA[s.sIdx].color,borderRadius:4,transition:"width .6s ease" }}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {reviews.length > 0 && (
              <div>
                <div style={{ fontSize:10,color:V.s5,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10 }}>Derniers calls</div>
                {reviews.slice(0,5).map((r,i) => {
                  const m = getMedal(r.globalPct||0);
                  return (
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:8,marginBottom:6 }}>
                      <span style={{ fontSize:14 }}>{m.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:V.white }}>{r.prospectName||"Prospect"}</div>
                        <div style={{ fontSize:10,color:V.s5 }}>{r.callDate||"—"}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:14,fontWeight:800,color:m.color }}>{r.globalPct||0}%</div>
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

// ── Coach Cinematic ───────────────────────────────────────────────────────────
function CoachCinematic() {
  const [phase, setPhase] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [dots, setDots] = useState("");

  const phases = [
    {
      label: "Écoute du call", icon: "📞", color: V.neon,
      messages: [
        "Hmm… intéressant comme ouverture.",
        "Je note la façon dont il aborde le prospect…",
        "Ah, il y a quelque chose à améliorer ici.",
        "Bonne accroche ! On continue…",
      ]
    },
    {
      label: "Analyse comportementale", icon: "🧠", color: "#8B5CF6",
      messages: [
        "Le ratio parole/écoute… laisse à désirer.",
        "La qualification du décisionnaire… pas terrible.",
        "Vocabulaire BTP ? Je vérifie…",
        "Ce passage sur les objections, il faut qu'on en parle.",
      ]
    },
    {
      label: "Rédaction des scripts experts", icon: "🎙️", color: V.orange,
      messages: [
        "Voici ce que j'aurais dit à sa place…",
        "Conseil en cours de rédaction…",
        "Je formule les meilleures pratiques terrain…",
        "Presque, encore quelques ajustements…",
      ]
    },
    {
      label: "Génération des objectifs", icon: "🎯", color: "#10B981",
      messages: [
        "3 objectifs prioritaires identifiés.",
        "Je prépare ton plan de progression…",
        "Les badges déblocables sont en cours d'évaluation…",
        "Dernière ligne droite, courage !",
      ]
    },
  ];

  // Avancer les phases toutes les 9 secondes
  useEffect(() => {
    const t = setInterval(() => {
      setPhase(p => Math.min(p + 1, phases.length - 1));
      setMsgIdx(0);
      setScore(s => Math.min(s + Math.round(Math.random() * 22 + 18), 99));
    }, 9000);
    return () => clearInterval(t);
  }, []);

  // Changer les messages toutes les 2.5s
  useEffect(() => {
    const t = setInterval(() => {
      setMsgIdx(i => (i + 1) % phases[phase].messages.length);
    }, 2500);
    return () => clearInterval(t);
  }, [phase]);

  // Dots animés
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(t);
  }, []);

  // Score qui monte
  useEffect(() => {
    const t = setInterval(() => {
      setScore(s => s < 87 ? s + Math.round(Math.random() * 3) : s);
    }, 300);
    return () => clearInterval(t);
  }, []);

  const currentPhase = phases[phase];
  const progress = ((phase + 1) / phases.length) * 100;

  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: "'Gantari',sans-serif" }}>

      {/* Téléphone animé SVG */}
      <div style={{ position: "relative", marginBottom: 32 }}>
        {/* Glow */}
        <div style={{ position: "absolute", inset: -30, background: `radial-gradient(ellipse, ${currentPhase.color}30 0%, transparent 70%)`, transition: "background .8s" }}/>

        <svg width={90} height={130} viewBox="0 0 90 130" style={{ position: "relative", zIndex: 1 }}>
          {/* Corps téléphone */}
          <rect x={8} y={4} width={74} height={122} rx={14} fill="#0D0D1F" stroke={currentPhase.color} strokeWidth={2.5}/>
          {/* Écran */}
          <rect x={14} y={16} width={62} height={90} rx={6} fill={`${currentPhase.color}15`}/>
          {/* Bouton home */}
          <circle cx={45} cy={118} r={5} fill="none" stroke={currentPhase.color} strokeWidth={1.5} opacity={0.6}/>
          {/* Caméra */}
          <circle cx={45} cy={10} r={2.5} fill={currentPhase.color} opacity={0.5}/>

          {/* Contenu écran — icône de la phase */}
          <text x={45} y={55} textAnchor="middle" fontSize={28}>{currentPhase.icon}</text>

          {/* Score sur l'écran */}
          <text x={45} y={80} textAnchor="middle" fill={currentPhase.color} fontSize={18} fontWeight={900}>{score}</text>
          <text x={45} y={92} textAnchor="middle" fill={currentPhase.color} fontSize={8} opacity={0.7}>SCORE</text>

          {/* Barres wifi animées */}
          {[0,1,2].map(i => (
            <rect key={i} x={20+i*8} y={100-i*5} width={5} height={5+i*5} rx={1.5}
              fill={currentPhase.color} opacity={phase >= i ? 0.9 : 0.2}/>
          ))}
        </svg>

        {/* Onde sonore gauche */}
        <div style={{ position: "absolute", left: -24, top: "30%", display: "flex", flexDirection: "column", gap: 4 }}>
          {[20,32,24,36,20].map((h, i) => (
            <div key={i} style={{ width: 3, height: h, background: currentPhase.color, borderRadius: 2, opacity: 0.6, animation: `pulse ${0.4 + i*0.1}s ease-in-out infinite alternate`, transition: "background .5s" }}/>
          ))}
        </div>
        {/* Onde sonore droite */}
        <div style={{ position: "absolute", right: -24, top: "30%", display: "flex", flexDirection: "column", gap: 4 }}>
          {[24,36,20,32,28].map((h, i) => (
            <div key={i} style={{ width: 3, height: h, background: currentPhase.color, borderRadius: 2, opacity: 0.6, animation: `pulse ${0.5 + i*0.1}s ease-in-out infinite alternate`, transition: "background .5s" }}/>
          ))}
        </div>
      </div>

      {/* Message coach — bulle */}
      <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${currentPhase.color}30`, borderRadius: 16, padding: "14px 24px", marginBottom: 24, maxWidth: 380, textAlign: "center", minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color .5s" }}>
        <div style={{ fontSize: 15, color: V.white, fontWeight: 500, lineHeight: 1.5 }}>
          <span style={{ fontSize: 18, marginRight: 8 }}>🤖</span>
          {phases[phase].messages[msgIdx]}<span style={{ color: currentPhase.color }}>{dots}</span>
        </div>
      </div>

      {/* Phase label */}
      <div style={{ fontSize: 11, color: currentPhase.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 20, transition: "color .5s" }}>
        {currentPhase.icon} {currentPhase.label}
      </div>

      {/* Barre de progression globale */}
      <div style={{ width: 320, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          {phases.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: i <= phase ? `${p.color}20` : "rgba(255,255,255,0.05)", border: `2px solid ${i <= phase ? p.color : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all .5s" }}>
                {i < phase ? "✓" : p.icon}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${V.blue}, ${currentPhase.color})`, borderRadius: 10, transition: "width 1s ease, background 0.8s" }}/>
        </div>
      </div>

      {/* Motivations rotatives */}
      <div style={{ fontSize: 12, color: V.s5, fontStyle: "italic", textAlign: "center" }}>
        {["💪 Chaque call analysé te rapproche du rang Gold","🔥 Les meilleurs SDR ne s'arrêtent jamais d'apprendre","🎯 Ton coach IA travaille pour toi en ce moment","⚡ Patience — la précision prend du temps","🏆 Bientôt un nouvel écusson peut-être ?"][Math.floor(Date.now() / 5000) % 5]}
      </div>

    </div>
  );
}

// ── Coach Cinematic Loading ───────────────────────────────────────────────────
const CINEMATIC_STEPS = [
  { phase: 0.00, icon: "📞", msg: "Écoute du call en cours…",               sub: "Chargement du transcript",                color: "#00FFFB" },
  { phase: 0.08, icon: "👂", msg: "Hmm… intéressant comme ouverture.",       sub: "Analyse de la posture et du ton",         color: "#00FFFB" },
  { phase: 0.16, icon: "🤔", msg: "Attends… il a oublié de qualifier ça.",   sub: "Évaluation de la discovery",              color: V.orange  },
  { phase: 0.24, icon: "📊", msg: "Calcul du ratio parole en cours…",        sub: "40% SDR / 60% prospect idéalement",       color: V.blue    },
  { phase: 0.30, icon: "💡", msg: "Ah ! Bonne gestion de l'objection prix.", sub: "Analyse du pitch et des objections",      color: "#10B981" },
  { phase: 0.38, icon: "📞", msg: "Le closing… voyons voir…",                sub: "Évaluation de l'engagement prospect",     color: V.orange  },
  { phase: 0.45, icon: "⚡", msg: "L'énergie sur ce call est notable !",     sub: "Mesure de la conviction et du dynamisme", color: "#FFD700" },
  { phase: 0.52, icon: "🎯", msg: "Identification des axes prioritaires…",   sub: "Croisement des 20 critères Vertuoza",     color: "#8B5CF6" },
  { phase: 0.60, icon: "🧠", msg: "Génération des scripts experts…",         sub: "Formulations optimisées BTP en cours",    color: V.neon    },
  { phase: 0.68, icon: "📝", msg: "Rédaction des plans de progression…",     sub: "Phrases types Vertuoza personnalisées",   color: V.blue    },
  { phase: 0.76, icon: "🎓", msg: "Définition de tes 3 objectifs coach…",   sub: "Basé sur tes points les plus faibles",    color: V.orange  },
  { phase: 0.84, icon: "🏆", msg: "Presque terminé — finalisation…",         sub: "Sauvegarde automatique en cours",         color: "#10B981" },
  { phase: 0.92, icon: "✅", msg: "Analyse complète ! Résultats prêts.",     sub: "Ton coaching personnalisé est là",        color: "#FFD700" },
];

const MOTIVATIONS = [
  "Les meilleurs SDR analysent chaque call. Tu fais partie de l'élite. 💪",
  "Chaque analyse te rapproche du rang Gold. Continue comme ça ! 🏆",
  "Un call analysé = un concurrent distancé. Belle mentalité. 🚀",
  "Les données ne mentent pas. Tu vas progresser. 📈",
  "Vertuoza + toi = la combinaison gagnante dans le BTP. 🔥",
];


// ── App principale ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(""); const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [reviews, setReviews] = useState([]); const [allReviews, setAllReviews] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [saveStatus, setSaveStatus] = useState(""); const [reviewTab, setReviewTab] = useState("review");
  const [transcript, setTranscript] = useState("");
  const [scores, setScores] = useState({}); const [justifications, setJustifications] = useState({});
  const [expertScripts, setExpertScripts] = useState({}); const [levelUp, setLevelUp] = useState({});
  const [globalComment, setGlobalComment] = useState(""); const [globalStrengths, setGlobalStrengths] = useState([]);
  const [globalImprovements, setGlobalImprovements] = useState([]);
  const [meta, setMeta] = useState({ prospect: "", date: "" });
  const [loading, setLoading] = useState(false);
  const txtRef = useRef();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setAllReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "objectives"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setObjectives(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
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

  const saveObjectives = async (objs, scores, reviewId) => {
    if (!user || !objs?.length) return;
    // Marquer les anciens objectifs en cours comme "evaluated"
    const pending = objectives.filter(o => o.status === "pending");
    for (const o of pending) {
      const criterionScore = scores[o.criterionId] || 0;
      const validated = criterionScore >= 3;
      try {
        await import("firebase/firestore").then(({ updateDoc, doc: fDoc }) =>
          updateDoc(fDoc(db, "objectives", o.id), { status: validated ? "validated" : "failed", evaluatedAt: new Date(), evaluatedScore: criterionScore })
        );
      } catch {}
    }
    // Sauvegarder les nouveaux objectifs
    for (const obj of objs) {
      try {
        await addDoc(collection(db, "objectives"), {
          userId: user.uid, ...obj,
          status: "pending", createdAt: new Date(),
        });
      } catch {}
    }
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

    const p4 = `Tu es un coach SDR expert Vertuoza. Après avoir analysé ce call, génère 3 objectifs précis et actionnables pour le PROCHAIN call du SDR.
Retourne UNIQUEMENT du JSON valide sans markdown :
[
  {
    "title": "Titre court de l'objectif (max 8 mots)",
    "description": "Description précise de ce qu'il doit faire différemment au prochain call. 1-2 phrases max. Ancré dans le contexte Vertuoza BTP.",
    "criterionId": "ID du critère concerné parmi : tone,rapport,rhythm,opening,flow,talkratio,structure,tools,decision,timing,quantify,objections,sector,trade,vocab,cases,benefits,control,commitment,energy",
    "criterionLabel": "Nom lisible du critère",
    "priority": "high|medium|low",
    "example": "Exemple de phrase concrète à utiliser dans le prochain call"
  }
]
Choisis les 3 critères avec les scores les plus faibles. Sois ultra-précis et actionnable.`;

    try {
      const [r1, r2, r3, r4] = await Promise.all([
        callAPI(p1, `Transcript :\n\n${transcript}`, 5000),
        callAPI(p2, `Transcript :\n\n${transcript}`, 4000),
        callAPI(p3, `Transcript :\n\n${transcript}`, 5000),
        callAPI(p4, `Transcript :\n\n${transcript}`, 3000),
      ]);
      const pct = calcPct(r1.scores || {});
      setScores(r1.scores || {}); setJustifications(r1.justifications || {});
      setGlobalComment(r1.globalComment || "");
      setGlobalStrengths(r1.globalStrengths || []);
      setGlobalImprovements(r1.globalImprovements || []);
      setExpertScripts(r2 || {}); setLevelUp(r3 || {});
      await autoSave(r1, r2, r3, pct);
      await saveObjectives(Array.isArray(r4) ? r4 : [], r1.scores || {});
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
        {[["dashboard","📊","Dashboard"],["new","✍️","Analyser un call"],["history","📋","Mes calls"],["team","🃏","L'Équipe"]].map(([id,icon,lbl]) => (
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
                allReviews={allReviews}
                userId={user.uid}
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

          {/* Objectifs coach */}
          {objectives.length > 0 && (() => {
            const pending = objectives.filter(o => o.status === "pending").slice(0, 3);
            const validated = objectives.filter(o => o.status === "validated").length;
            const failed = objectives.filter(o => o.status === "failed").length;
            const priorityColor = { high: V.orange, medium: V.blue, low: V.s5 };
            const priorityLabel = { high: "Priorité haute", medium: "Priorité moyenne", low: "Priorité basse" };
            return (
              <div style={card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <span style={sLabel}>🎯 Objectifs Coach — Prochain call</span>
                    <div style={{ display: "flex", gap: 12, marginTop: -4 }}>
                      <span style={{ fontSize: 11, color: "#10B981" }}>✅ {validated} validés</span>
                      <span style={{ fontSize: 11, color: "#EF4444" }}>❌ {failed} ratés</span>
                      <span style={{ fontSize: 11, color: V.orange }}>⏳ {pending.length} en cours</span>
                    </div>
                  </div>
                </div>
                {pending.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>Aucun objectif en cours — analyse un call pour en générer de nouveaux !</div>}
                {pending.map((obj, i) => (
                  <div key={obj.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${priorityColor[obj.priority] || V.border}30`, borderLeft: `3px solid ${priorityColor[obj.priority] || V.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${priorityColor[obj.priority] || V.border}20`, border: `1.5px solid ${priorityColor[obj.priority] || V.border}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: priorityColor[obj.priority] || V.s5, flexShrink: 0 }}>{i+1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: V.white }}>{obj.title}</span>
                          <span style={{ fontSize: 9, color: priorityColor[obj.priority] || V.s5, background: `${priorityColor[obj.priority] || V.border}15`, padding: "2px 8px", borderRadius: 20, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{priorityLabel[obj.priority] || obj.priority}</span>
                        </div>
                        <div style={{ fontSize: 12, color: V.s5, lineHeight: 1.6, marginBottom: 6 }}>{obj.description}</div>
                        {obj.example && (
                          <div style={{ background: `${V.neon}10`, border: `1px solid ${V.neon}20`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: V.neon, fontStyle: "italic" }}>
                            💬 "{obj.example}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Badges écussons */}
          {reviews.length > 0 && (() => {
            const earnedBadges = BADGES.filter(b => b.condition(reviews, objectives));
            const lockedBadges = BADGES.filter(b => !b.condition(reviews, objectives));
            return (
              <div style={card()}>
                <span style={sLabel}>🛡️ Mes écussons — {earnedBadges.length}/{BADGES.length} débloqués</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {earnedBadges.map(b => (
                    <div key={b.id} title={b.desc} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: `1.5px solid ${V.neon}40`, borderRadius: 12, minWidth: 70, cursor: "default" }}>
                      <div style={{ fontSize: 28, filter: `drop-shadow(0 0 8px ${V.neon}80)` }}>{b.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: V.neon, textAlign: "center", letterSpacing: "0.3px" }}>{b.name}</div>
                    </div>
                  ))}
                  {lockedBadges.map(b => (
                    <div key={b.id} title={`🔒 ${b.desc}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1.5px solid rgba(255,255,255,0.06)`, borderRadius: 12, minWidth: 70, cursor: "default", opacity: 0.4 }}>
                      <div style={{ fontSize: 28, filter: "grayscale(1)" }}>{b.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: V.s4, textAlign: "center" }}>{b.name}</div>
                    </div>
                  ))}
                </div>
                {earnedBadges.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>Analyse des calls pour débloquer tes premiers écussons !</div>}
              </div>
            );
          })()}

          {reviews.length === 0 && (            <div style={{ ...card(), textAlign: "center", padding: 60 }}>
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
          {loading && <CoachCinematic/>}
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

        {/* ══ ÉQUIPE ══════════════════════════════════════════════════════════════ */}
        {page === "team" && (<>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🃏 Les cartes de l'équipe</div>
            <div style={{ fontSize: 13, color: V.s5 }}>Toutes les cartes SDR — classées par score moyen</div>
          </div>

          {leaderboard.length === 0 && (
            <div style={{ ...card(), textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🃏</div>
              <div style={{ color: V.s5 }}>Aucun membre n'a encore analysé de call.</div>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
            {leaderboard.map((member, rank) => {
              // Reconstituer les reviews de ce membre depuis allReviews
              const memberReviews = allReviews.filter(r => (r.sdrName || r.userEmail?.split("@")[0]) === member.name);
              const memberMedal = getMedal(member.avg);
              const isMe = member.name === user.email.split("@")[0];

              return (
                <div key={member.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {/* Rang */}
                  <div style={{ fontSize: 18 }}>
                    {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : <span style={{ fontSize: 12, color: V.s4, fontWeight: 700 }}>#{rank + 1}</span>}
                  </div>

                  {/* Mini carte non-interactive pour les autres */}
                  <div style={{
                    width: 200, height: 290, position: "relative",
                    borderRadius: 16,
                    background: "#080C1A",
                    border: `1.5px solid ${isMe ? V.neon : memberMedal.color}40`,
                    boxShadow: isMe
                      ? `0 0 0 2px ${V.neon}40, 0 12px 40px ${V.neon}30`
                      : `0 8px 30px ${memberMedal.color}30`,
                    fontFamily: "'Gantari',sans-serif",
                    overflow: "hidden",
                    opacity: 1,
                  }}>
                    {/* Grid bg */}
                    <svg style={{position:"absolute",inset:0,opacity:0.06,pointerEvents:"none"}} width={200} height={290}>
                      <pattern id={`tg_${member.name}`} width="18" height="18" patternUnits="userSpaceOnUse">
                        <path d="M 18 0 L 0 0 0 18" fill="none" stroke={memberMedal.color} strokeWidth="0.3"/>
                      </pattern>
                      <rect width={200} height={290} fill={`url(#tg_${member.name})`}/>
                    </svg>

                    {/* Score haut gauche */}
                    <div style={{position:"absolute",top:12,left:14,zIndex:5}}>
                      <div style={{fontSize:34,fontWeight:900,color:"#fff",lineHeight:1,letterSpacing:"-2px",textShadow:`0 0 16px ${memberMedal.color}`}}>{member.avg}</div>
                      <div style={{fontSize:9,fontWeight:800,color:memberMedal.color,letterSpacing:"2px",textTransform:"uppercase",marginTop:1}}>SDR</div>
                      <svg width={14} height={14} viewBox="0 0 24 24" style={{marginTop:5,display:"block"}} fill="none">
                        <rect x="5" y="2" width="14" height="20" rx="3" stroke={memberMedal.color} strokeWidth="1.5"/>
                        <circle cx="12" cy="18.5" r="1" fill={memberMedal.color}/>
                        <line x1="9" y1="5" x2="15" y2="5" stroke={memberMedal.color} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>

                    {/* Médaille haut droite */}
                    <div style={{position:"absolute",top:10,right:12,zIndex:5,textAlign:"right"}}>
                      <div style={{fontSize:20,lineHeight:1}}>{memberMedal.icon}</div>
                      <Stars count={memberMedal.stars} color={memberMedal.color}/>
                    </div>

                    {/* Zone photo */}
                    <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",top:0,width:150,height:190,zIndex:3,overflow:"hidden",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,#080C1A 0%,transparent 20%,transparent 80%,#080C1A 100%)",zIndex:2,pointerEvents:"none"}}/>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,height:50,background:"linear-gradient(to top,#080C1A,transparent)",zIndex:2,pointerEvents:"none"}}/>
                      {/* Initiales car on n'a pas accès à la photo des autres */}
                      <div style={{width:80,height:80,borderRadius:"50%",background:`${memberMedal.color}15`,border:`2px dashed ${memberMedal.color}40`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,zIndex:3,position:"relative"}}>
                        <span style={{fontSize:22,fontWeight:900,color:"#fff"}}>{member.name.slice(0,2).toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Séparateur */}
                    <div style={{position:"absolute",bottom:82,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${memberMedal.color}60,transparent)`,zIndex:4}}/>

                    {/* Nom */}
                    <div style={{position:"absolute",bottom:58,left:0,right:0,textAlign:"center",zIndex:5,padding:"0 10px"}}>
                      <div style={{fontSize:14,fontWeight:900,color:"#fff",textTransform:"uppercase",letterSpacing:"3px",textShadow:`0 0 16px ${memberMedal.color}`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {member.name.toUpperCase()}
                      </div>
                      {isMe && <div style={{fontSize:7,color:V.neon,letterSpacing:"1.5px",textTransform:"uppercase",marginTop:2}}>← Toi</div>}
                    </div>

                    {/* Stats bas */}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(8,12,26,0.92)",borderTop:`1px solid ${memberMedal.color}25`,padding:"7px 14px 8px",display:"grid",gridTemplateColumns:"1fr 1px 1fr",zIndex:5}}>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {[
                          {k:"CAL",v:member.count},
                          {k:"MOY",v:member.avg+"%"},
                        ].map(s=>(
                          <div key={s.k} style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:12,fontWeight:900,color:memberMedal.color,minWidth:32,textAlign:"right"}}>{s.v}</span>
                            <span style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.7)",letterSpacing:"1px"}}>{s.k}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{background:`linear-gradient(to bottom,transparent,${memberMedal.color}60,transparent)`,margin:"0 4px"}}/>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {[
                          {k:"BEST",v:memberReviews.length?Math.max(...memberReviews.map(r=>r.globalPct||0))+"%":"—"},
                          {k:"MED",v:memberMedal.label.slice(0,4).toUpperCase()},
                        ].map(s=>(
                          <div key={s.k} style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:12,fontWeight:900,color:memberMedal.color,minWidth:32,textAlign:"right"}}>{s.v}</span>
                            <span style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,0.7)",letterSpacing:"1px"}}>{s.k}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reflet coin */}
                    <div style={{position:"absolute",top:0,left:0,width:60,height:60,background:`radial-gradient(circle at 0% 0%,${memberMedal.color}15,transparent 70%)`,pointerEvents:"none",zIndex:6,borderRadius:"16px 0 0 0"}}/>
                  </div>

                  {/* Calls count */}
                  <div style={{ fontSize: 11, color: V.s5 }}>{member.count} call{member.count > 1 ? "s" : ""}</div>
                </div>
              );
            })}
          </div>
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
