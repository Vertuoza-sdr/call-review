import { useState, useRef, useEffect } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, deleteDoc, doc,
} from "firebase/firestore";

// ── Palette Vertuoza ──────────────────────────────────────────────────────────
const V = {
  darkBlue: "#08104D",
  blue: "#003FDA",
  neon: "#00FFFB",
  orange: "#FF4217",
  s1: "#001957",
  s2: "#00206E",
  s3: "#0032AE",
  s4: "#525882",
  s5: "#99B2F0",
  bg1: "#E5ECFB",
  bg2: "#F2F5FD",
  bg3: "#F9FBFF",
  white: "#FFFFFF",
};

// ── Critères ──────────────────────────────────────────────────────────────────
const CRITERIA = [
  { section: "OUVERTURE & POSTURE", color: V.orange, icon: "🎯", items: [
    { id: "tone",    label: "Ton assuré et professionnel dès le début",  tip: "Voix posée, rythme maîtrisé, pas de 'euh' excessifs — posture d'expert crédible dans le secteur bâtiment." },
    { id: "rapport", label: "Création d'un rapport humain rapide",        tip: "Utilise le prénom du prospect, montre qu'il connaît le secteur, évite le ton trop corporate." },
    { id: "rhythm",  label: "Rythme adapté au prospect",                  tip: "Ni trop rapide (anxiogène), ni trop lent (perd l'attention). Adapté à un entrepreneur du bâtiment occupé." },
    { id: "opening", label: "Ouverture claire, engageante et différenciante", tip: "Accroche ancrée dans une vraie douleur terrain : perte de temps sur les devis, désorganisation chantier, facturation en retard…" },
  ]},
  { section: "DISCOVERY & QUALIFICATION", color: V.blue, icon: "🔍", items: [
    { id: "flow",      label: "Enchaînement fluide des étapes du call",      tip: "Intro → découverte → qualification → pitch → next step. Pas de rupture awkward, pas de silence non maîtrisé." },
    { id: "talkratio", label: "Ratio de parole maîtrisé (40/60)",            tip: "Le SDR parle 40% du temps, le prospect 60%. Trop parler = monologue commercial. Trop peu = call sans direction." },
    { id: "structure", label: "Identification complète de la structure entreprise", tip: "Taille (nb employés), volume de chantiers, CA approximatif, organisation interne (admin, techniciens, sous-traitants)." },
    { id: "tools",     label: "Compréhension des outils & irritants actuels", tip: "Excel, papier, WhatsApp, ERP concurrent ? Quels irritants quotidiens ? Où perdent-ils du temps / de l'argent ?" },
    { id: "decision",  label: "Identification et qualification du décisionnaire", tip: "Patron, associé, conjoint, responsable admin ? Qui signe ? Qui bloque ? Qui influencer ?" },
    { id: "timing",    label: "Qualification du timing et déclencheur d'urgence", tip: "Déclencheur concret : forte croissance, problème récent de facturation, perte d'un chantier, nouvel associé…" },
    { id: "quantify",  label: "Quantification chiffrée du problème prospect",  tip: "Combien d'heures perdues par semaine ? Combien de devis ratés ? Combien d'argent laissé sur la table ? Le prospect doit SENTIR le coût de son inaction." },
  ]},
  { section: "PITCH & GESTION OBJECTIONS", color: "#8B5CF6", icon: "💬", items: [
    { id: "objections", label: "Gestion des objections sans se déstabiliser",  tip: "Prix, 'pas le moment', 'on a déjà un outil', 'faut que j'en parle à ma femme'… Le SDR rebondit avec calme et méthode." },
    { id: "sector",     label: "Réponses et exemples ancrés dans le bâtiment", tip: "Cite des clients similaires (maçon 8 personnes, électricien 15 techniciens…). Pas de pitch générique SaaS." },
    { id: "trade",      label: "Discours adapté au métier précis du prospect",  tip: "Électricien ≠ plombier ≠ maçon ≠ couvreur. Les douleurs et le vocabulaire changent selon le corps de métier." },
    { id: "vocab",      label: "Maîtrise du vocabulaire métier BTP",            tip: "Devis, situation de travaux, avenant, sous-traitants, CCTP, attachement, pointage chantier… Pas de jargon SaaS." },
    { id: "cases",      label: "Vertuoza ancré dans des cas concrets terrain",  tip: "'Sur chantier', 'le soir depuis le van', 'technicien qui pointe ses heures en direct', 'devis signé en 10 min'… Pas de feature abstraite." },
    { id: "benefits",   label: "Bénéfices mis en avant vs fonctionnalités",     tip: "Temps récupéré, argent gagné, stress en moins, sérénité, fierté du travail bien géré. PAS 'on a un module de facturation'." },
  ]},
  { section: "CLOSING & ÉNERGIE", color: "#10B981", icon: "🚀", items: [
    { id: "control",    label: "Contrôle du call de bout en bout",    tip: "Le SDR guide la conversation, pose les questions, fixe le rythme. Il ne subit pas le prospect qui part dans tous les sens." },
    { id: "commitment", label: "Engagement concret obtenu en fin de call", tip: "Date de démo confirmée, email reçu, décisionnaire impliqué, prochaine étape claire pour les deux parties." },
    { id: "energy",     label: "Niveau de conviction et d'énergie projeté", tip: "Le prospect doit raccrocher en sentant qu'il a parlé à un expert passionné qui croit en ce qu'il vend — pas à quelqu'un qui récite un script." },
  ]},
];

const ALL_IDS = CRITERIA.flatMap(s => s.items.map(i => i.id));

const SCORES = [
  { value: 0, label: "—",           color: V.s4 },
  { value: 1, label: "Manquant",    color: "#EF4444" },
  { value: 2, label: "Partiel",     color: "#F59E0B" },
  { value: 3, label: "Bon",         color: "#10B981" },
  { value: 4, label: "Excellent",   color: V.blue },
];

const getGrade = p =>
  p >= 90 ? { label: "Elite 🏆",       color: V.neon,   bg: "#00FFFB20" } :
  p >= 75 ? { label: "Solide ✅",       color: "#10B981", bg: "#10B98120" } :
  p >= 55 ? { label: "À améliorer ⚠️", color: "#F59E0B", bg: "#F59E0B20" } :
            { label: "À travailler 🔧", color: "#EF4444", bg: "#EF444420" };

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

// ── Composants UI ─────────────────────────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, readOnly }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [value]);
  return (
    <textarea ref={ref} value={value || ""} onChange={onChange} placeholder={placeholder} readOnly={readOnly} rows={2}
      style={{ width: "100%", background: readOnly ? "transparent" : "rgba(255,255,255,0.05)", border: `1px solid ${readOnly ? "transparent" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: V.bg1, fontSize: 13, padding: "10px 12px", fontFamily: "'Gantari',sans-serif", outline: "none", boxSizing: "border-box", resize: "none", lineHeight: 1.7, overflow: "hidden", minHeight: 60 }} />
  );
}

function ScoreChip({ value, selected, onClick }) {
  const s = SCORES.find(s => s.value === value);
  return (
    <button onClick={() => onClick(value)} style={{
      background: selected ? s.color : "rgba(255,255,255,0.06)",
      border: `1.5px solid ${selected ? s.color : "rgba(255,255,255,0.12)"}`,
      color: selected ? "#fff" : V.s5,
      borderRadius: 20, padding: "4px 12px", fontSize: 11,
      fontFamily: "'Gantari',sans-serif", cursor: "pointer",
      fontWeight: selected ? 700 : 400, transition: "all .2s",
      whiteSpace: "nowrap",
    }}>{s.label}</button>
  );
}

function GaugeArc({ pct, color, size = 120 }) {
  const r = size / 2 - 10, circ = Math.PI * r, dash = (pct / 100) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
      <path d={`M 10 ${cy} A ${r} ${r} 0 0 1 ${size-10} ${cy}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} strokeLinecap="round"/>
      <path d={`M 10 ${cy} A ${r} ${r} 0 0 1 ${size-10} ${cy}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} style={{ filter: `drop-shadow(0 0 8px ${color})` }}/>
      <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={size * 0.2} fontWeight="700" fontFamily="'Gantari',sans-serif">{pct}%</text>
    </svg>
  );
}

function SectionBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: V.s5, fontFamily: "'Gantari',sans-serif" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: 10, transition: "width .8s ease", boxShadow: `0 0 8px ${color}66` }}/>
      </div>
    </div>
  );
}

function CriterionRow({ criterion, scores, justifications, expertScripts, levelUp, onChange, onJustify, sectionColor, readOnly }) {
  const score = scores[criterion.id] ?? 0;
  const [open, setOpen] = useState(false);
  const sc = SCORES.find(s => s.value === score);
  const expert = expertScripts?.[criterion.id];
  const up = levelUp?.[criterion.id];

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(!open)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sectionColor, flexShrink: 0, marginTop: 1, boxShadow: `0 0 6px ${sectionColor}` }}/>
            <span style={{ color: V.white, fontSize: 13.5, fontWeight: 600, fontFamily: "'Gantari',sans-serif" }}>{criterion.label}</span>
            <span style={{ color: V.s4, fontSize: 10, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
          </div>
          {open && <div style={{ marginTop: 6, marginLeft: 14, color: V.s5, fontSize: 12, fontStyle: "italic", lineHeight: 1.6, fontFamily: "'Gantari',sans-serif" }}>💡 {criterion.tip}</div>}
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
        {/* Analyse */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8, fontFamily: "'Gantari',sans-serif" }}>📋 Analyse & Recommandation</div>
          <AutoTextarea value={justifications[criterion.id]} onChange={e => onJustify && onJustify(criterion.id, e.target.value)} placeholder="Observation précise du call + recommandation concrète et actionnabe..." readOnly={readOnly}/>
        </div>

        {/* Script expert */}
        {expert && (
          <div style={{ background: "linear-gradient(135deg, rgba(0,63,218,0.15), rgba(0,255,251,0.08))", border: "1px solid rgba(0,255,251,0.2)", borderLeft: `3px solid ${V.neon}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8, fontFamily: "'Gantari',sans-serif" }}>🎙️ Ce que le SDR expert aurait dit</div>
            <div style={{ color: V.bg1, fontSize: 13, lineHeight: 1.75, fontStyle: "italic", fontFamily: "'Gantari',sans-serif" }}>"{expert}"</div>
          </div>
        )}

        {/* Level up */}
        {up && (
          <div style={{ background: "linear-gradient(135deg, rgba(255,66,23,0.12), rgba(139,92,246,0.08))", border: "1px solid rgba(255,66,23,0.25)", borderLeft: `3px solid ${V.orange}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8, fontFamily: "'Gantari',sans-serif" }}>🚀 Pour passer au niveau supérieur</div>
            {up.tip && <div style={{ color: V.bg1, fontSize: 12.5, lineHeight: 1.7, marginBottom: 8, fontFamily: "'Gantari',sans-serif" }}>{up.tip}</div>}
            {up.scripts && up.scripts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {up.scripts.map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: V.s5, fontStyle: "italic", fontFamily: "'Gantari',sans-serif", lineHeight: 1.6 }}>
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

// ── App principale ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(""); const [authBusy, setAuthBusy] = useState(false);

  const [page, setPage] = useState("dashboard");
  const [reviews, setReviews] = useState([]); const [allReviews, setAllReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [saveStatus, setSaveStatus] = useState(""); const [reviewTab, setReviewTab] = useState("review");

  const [transcript, setTranscript] = useState("");
  const [scores, setScores] = useState({}); const [justifications, setJustifications] = useState({});
  const [expertScripts, setExpertScripts] = useState({}); const [levelUp, setLevelUp] = useState({});
  const [globalComment, setGlobalComment] = useState(""); const [globalStrengths, setGlobalStrengths] = useState([]);
  const [globalImprovements, setGlobalImprovements] = useState([]);
  const [meta, setMeta] = useState({ sdr: "", date: "", prospect: "", company: "" });
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

  const handleAuth = async () => {
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      const msgs = { "auth/invalid-credential": "Email ou mot de passe incorrect.", "auth/email-already-in-use": "Email déjà utilisé.", "auth/weak-password": "Mot de passe trop court (6 car. min).", "auth/invalid-email": "Email invalide." };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthBusy(false);
  };

  const saveReview = async () => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      await addDoc(collection(db, "reviews"), {
        userId: user.uid, userEmail: user.email,
        sdrName: meta.sdr || user.email, prospectName: meta.prospect,
        company: meta.company, callDate: meta.date,
        scores, justifications, expertScripts, levelUp,
        globalComment, globalStrengths, globalImprovements,
        globalPct: calcPct(scores), createdAt: new Date(),
      });
      setSaveStatus("saved");
    } catch { setSaveStatus("error"); }
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const deleteReview = async (id) => {
    await deleteDoc(doc(db, "reviews", id));
    if (page === "detail") setPage("history");
  };

  const callAPI = async (system, content, maxT = 4000) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: maxT, system, messages: [{ role: "user", content }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const txt = data.content?.map(b => b.text || "").join("") || "";
    return JSON.parse(txt.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim());
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setPage("review"); setReviewTab("review");
    setScores({}); setJustifications({}); setExpertScripts({}); setLevelUp({}); setGlobalComment("");

    const p1 = `Tu es un directeur commercial senior avec 10 ans d'expérience dans la vente de logiciels SaaS BTP. Tu analyses des calls SDR pour Vertuoza — logiciel de gestion tout-en-un pour les entreprises du bâtiment (devis, facturation, planning, chantier, RH, comptabilité).

Retourne UNIQUEMENT du JSON valide sans markdown ni backticks :
{
  "scores": {"tone":2,"rapport":2,"rhythm":2,"opening":2,"flow":2,"talkratio":2,"structure":2,"tools":2,"decision":2,"timing":2,"quantify":2,"objections":2,"sector":2,"trade":2,"vocab":2,"cases":2,"benefits":2,"control":2,"commitment":2,"energy":2},
  "justifications": {
    "tone": "Analyse précise de ce qui s'est passé dans le call sur ce point. Cite des moments précis. Donne une recommandation claire et actionnnable.",
    ... (même structure pour tous les IDs)
  },
  "globalComment": "Verdict global en 4-5 phrases : profil SDR, forces identifiées, angles morts principaux, verdict final sur la qualité du call.",
  "globalStrengths": ["Force 1 avec exemple concret du call", "Force 2", "Force 3"],
  "globalImprovements": ["Axe d'amélioration 1 prioritaire", "Axe 2", "Axe 3"]
}
Scores : 1=manquant, 2=partiel, 3=bon, 4=excellent. Sois précis, direct, exigeant. Cite des éléments réels du transcript. Ne surévalue jamais.`;

    const p2 = `Tu es un top SDR Vertuoza, 5 ans d'expérience dans la vente terrain BTP. Pour chaque critère, écris LA formulation exacte que tu aurais utilisée dans CE call précis, avec le contexte du prospect identifié.

Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":"formulation naturelle...","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."}

1-3 phrases max par critère. Naturel, ancré dans le contexte du call. Pas de script robotique.`;

    const p3 = `Tu es un coach commercial expert BTP. Pour chaque critère, donne ce qu'il faut faire pour passer au niveau supérieur : une explication + 2-3 phrases types réutilisables dans n'importe quel call Vertuoza.

Retourne UNIQUEMENT du JSON valide sans markdown :
{
  "tone": { "tip": "Ce qu'il faut concrètement changer ou améliorer pour ce critère.", "scripts": ["Phrase type 1 réutilisable", "Phrase type 2", "Phrase type 3"] },
  "rapport": { "tip": "...", "scripts": ["...","..."] },
  "rhythm": { "tip": "...", "scripts": ["...","..."] },
  "opening": { "tip": "...", "scripts": ["...","...","..."] },
  "flow": { "tip": "...", "scripts": ["...","..."] },
  "talkratio": { "tip": "...", "scripts": ["...","..."] },
  "structure": { "tip": "...", "scripts": ["...","...","..."] },
  "tools": { "tip": "...", "scripts": ["...","...","..."] },
  "decision": { "tip": "...", "scripts": ["...","..."] },
  "timing": { "tip": "...", "scripts": ["...","...","..."] },
  "quantify": { "tip": "...", "scripts": ["...","...","..."] },
  "objections": { "tip": "...", "scripts": ["...","...","..."] },
  "sector": { "tip": "...", "scripts": ["...","..."] },
  "trade": { "tip": "...", "scripts": ["...","..."] },
  "vocab": { "tip": "...", "scripts": ["...","..."] },
  "cases": { "tip": "...", "scripts": ["...","...","..."] },
  "benefits": { "tip": "...", "scripts": ["...","...","..."] },
  "control": { "tip": "...", "scripts": ["...","..."] },
  "commitment": { "tip": "...", "scripts": ["...","...","..."] },
  "energy": { "tip": "...", "scripts": ["...","..."] }
}
Les phrases types doivent être utilisables dans n'importe quel call Vertuoza BTP. Naturelles, percutantes, ancrées dans le secteur.`;

    try {
      const [r1, r2, r3] = await Promise.all([
        callAPI(p1, `Analyse ce transcript de call SDR Vertuoza :\n\n${transcript}`, 5000),
        callAPI(p2, `Transcript du call :\n\n${transcript}`, 4000),
        callAPI(p3, `Transcript du call :\n\n${transcript}`, 5000),
      ]);
      setScores(r1.scores || {}); setJustifications(r1.justifications || {});
      setGlobalComment(r1.globalComment || "");
      setGlobalStrengths(r1.globalStrengths || []);
      setGlobalImprovements(r1.globalImprovements || []);
      setExpertScripts(r2 || {}); setLevelUp(r3 || {});
    } catch (e) { setGlobalComment("❌ Erreur : " + e.message); }
    setLoading(false);
  };

  const globalPct = calcPct(scores);
  const grade = getGrade(globalPct);
  const myAvg = reviews.length ? Math.round(reviews.reduce((a, r) => a + (r.globalPct || 0), 0) / reviews.length) : 0;

  const leaderboard = Object.values(
    allReviews.reduce((acc, r) => {
      const name = r.sdrName || r.userEmail || "Inconnu";
      if (!acc[name]) acc[name] = { name, total: 0, count: 0 };
      acc[name].total += r.globalPct || 0; acc[name].count += 1;
      return acc;
    }, {})
  ).map(s => ({ ...s, avg: Math.round(s.total / s.count) })).sort((a, b) => b.avg - a.avg);

  // ── Styles globaux ────────────────────────────────────────────────────────────
  const card = (extra = {}) => ({
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 16, padding: 20, marginBottom: 16,
    backdropFilter: "blur(10px)", ...extra,
  });

  const input = {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, color: V.white, fontSize: 13, padding: "10px 14px",
    fontFamily: "'Gantari',sans-serif", outline: "none", width: "100%", boxSizing: "border-box",
  };

  const sLabel = {
    fontSize: 10, fontWeight: 700, color: V.s5, textTransform: "uppercase",
    letterSpacing: "1.2px", marginBottom: 8, display: "block", fontFamily: "'Gantari',sans-serif",
  };

  // ── AUTH ──────────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: V.darkBlue, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${V.neon}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 20% 50%, ${V.s2}60 0%, ${V.darkBlue} 60%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Gantari',sans-serif", padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Gantari:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${V.blue}, ${V.neon}20)`, border: `2px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: V.neon, boxShadow: `0 0 24px ${V.neon}30` }}>V</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: V.white, letterSpacing: "-0.5px" }}>Vertuoza</div>
              <div style={{ fontSize: 12, color: V.neon, fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase" }}>Call Review</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: V.s5 }}>SDR Performance Platform</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, backdropFilter: "blur(20px)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
            {[["login","Connexion"],["signup","Créer un compte"]].map(([m,l]) => (
              <button key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, padding: "9px", background: authMode === m ? V.blue : "transparent", border: "none", borderRadius: 8, color: authMode === m ? V.white : V.s5, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{l}</button>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={sLabel}>Email</span>
            <input type="email" placeholder="julie@vertuoza.com" value={email} onChange={e => setEmail(e.target.value)} style={input}/>
          </div>
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Mot de passe</span>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} style={input}/>
          </div>

          {authError && <div style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 10, padding: "10px 14px", color: "#EF4444", fontSize: 12, marginBottom: 16 }}>{authError}</div>}

          <button onClick={handleAuth} disabled={authBusy} style={{ width: "100%", background: `linear-gradient(135deg, ${V.blue}, ${V.s3})`, border: "none", borderRadius: 12, color: V.white, fontSize: 14, fontWeight: 700, padding: "13px", cursor: authBusy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: authBusy ? 0.7 : 1, boxShadow: `0 4px 20px ${V.blue}60`, transition: "all .2s" }}>
            {authBusy ? "⏳" : authMode === "login" ? "Se connecter →" : "Créer mon compte →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── APP ────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 0% 0%, ${V.s1}80 0%, ${V.darkBlue} 50%)`, fontFamily: "'Gantari',sans-serif", color: V.white }}>
      <link href="https://fonts.googleapis.com/css2?family=Gantari:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} * { scrollbar-width: thin; scrollbar-color: ${V.s3} transparent; }`}</style>

      {/* Topbar */}
      <div style={{ background: "rgba(8,16,77,0.8)", backdropFilter: "blur(20px)", borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${V.blue}, ${V.neon}30)`, border: `1.5px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: V.neon }}>V</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px" }}>Vertuoza <span style={{ color: V.neon }}>Call Review</span></div>
            <div style={{ fontSize: 10, color: V.s5, letterSpacing: "1px", textTransform: "uppercase" }}>SDR Performance</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: V.s5 }}>{user.email}</span>
          <button onClick={() => signOut(auth)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: V.s5, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, transition: "all .2s" }}>Déconnexion</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", padding: "0 24px", background: "rgba(8,16,77,0.5)" }}>
        {[["dashboard","📊","Dashboard"],["new","✍️","Nouveau call"],["history","📋","Historique"]].map(([id,icon,lbl]) => (
          <button key={id} onClick={() => setPage(id)} style={{ background: "none", border: "none", borderBottom: page === id ? `2px solid ${V.neon}` : "2px solid transparent", color: page === id ? V.neon : V.s5, fontSize: 13, fontWeight: 600, padding: "12px 18px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" }}>{icon} {lbl}</button>
        ))}
        {(page === "review" || page === "detail") && (
          <button style={{ background: "none", border: "none", borderBottom: `2px solid ${V.orange}`, color: V.orange, fontSize: 13, fontWeight: 600, padding: "12px 18px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            {page === "review" ? "🎯 Analyse" : "🔍 Détail"}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px", boxSizing: "border-box" }}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════════ */}
        {page === "dashboard" && (<>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Calls analysés", value: reviews.length, icon: "🎙️", color: V.neon },
              { label: "Score moyen", value: myAvg ? myAvg + "%" : "—", icon: "⭐", color: getGrade(myAvg).color },
              { label: "Dernier call", value: reviews[0] ? reviews[0].globalPct + "%" : "—", icon: "📅", color: V.orange },
            ].map(k => (
              <div key={k.label} style={{ ...card(), textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{k.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color, letterSpacing: "-1px", textShadow: `0 0 20px ${k.color}60` }}>{k.value}</div>
                <div style={{ fontSize: 11, color: V.s5, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Progression */}
          {reviews.length > 0 && (
            <div style={card()}>
              <span style={sLabel}>Ma progression</span>
              <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <GaugeArc pct={myAvg} color={getGrade(myAvg).color} size={120}/>
                  <div style={{ fontSize: 12, color: getGrade(myAvg).color, fontWeight: 700, marginTop: 4 }}>{getGrade(myAvg).label}</div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {CRITERIA.map(s => {
                    const avg = reviews.length ? Math.round(reviews.reduce((a, r) => a + sectionPct(s, r.scores || {}), 0) / reviews.length) : 0;
                    return <SectionBar key={s.section} label={s.section} pct={avg} color={s.color}/>;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div style={card()}>
              <span style={sLabel}>🏆 Classement équipe</span>
              {leaderboard.map((s, i) => {
                const g = getGrade(s.avg);
                return (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: i < leaderboard.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <span style={{ fontSize: 20, width: 30, textAlign: "center" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: V.s4, fontSize: 13 }}>#{i+1}</span>}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: V.s5 }}>{s.count} call{s.count > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ background: g.bg, border: `1px solid ${g.color}40`, borderRadius: 20, padding: "4px 14px" }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: g.color }}>{s.avg}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reviews.length === 0 && (
            <div style={{ ...card(), textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Aucun call analysé</div>
              <div style={{ color: V.s5, fontSize: 14, marginBottom: 24 }}>Lance ta première analyse pour voir ta progression ici.</div>
              <button onClick={() => setPage("new")} style={{ background: `linear-gradient(135deg, ${V.orange}, #CC3412)`, border: "none", borderRadius: 12, color: V.white, fontWeight: 700, fontSize: 14, padding: "12px 24px", cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 20px ${V.orange}50` }}>🚀 Analyser mon premier call</button>
            </div>
          )}
        </>)}

        {/* ══ NOUVEAU CALL ════════════════════════════════════════════════════════ */}
        {page === "new" && (<>
          <div style={card()}>
            <span style={sLabel}>Infos du call</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Nom du SDR","sdr"],["Date","date"],["Prospect","prospect"],["Entreprise / Métier BTP","company"]].map(([ph,k]) => (
                <input key={k} placeholder={ph} value={meta[k]} onChange={e => setMeta({...meta,[k]:e.target.value})} style={input}/>
              ))}
            </div>
          </div>

          <div style={card()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={sLabel}>Transcript du call</span>
              <button onClick={() => txtRef.current.click()} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: V.s5, fontSize: 12, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>📁 Importer .txt</button>
              <input ref={txtRef} type="file" accept=".txt,.md" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setTranscript(ev.target.result); r.readAsText(f); }}/>
            </div>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
              placeholder={"Colle le transcript ici...\n\nSDR: Bonjour Marc, c'est Julie de Vertuoza...\nPROSPECT: Oui bonjour, je peux vous parler 2 minutes..."}
              style={{ ...input, minHeight: 300, fontFamily: "monospace", resize: "vertical", lineHeight: 1.7 }}/>
            {transcript && <div style={{ marginTop: 8, fontSize: 11, color: V.s5 }}>📝 {transcript.split(" ").length} mots · {Math.ceil(transcript.split(" ").length / 130)} min de lecture estimée</div>}
          </div>

          <button onClick={handleAnalyze} disabled={loading || !transcript.trim()} style={{ width: "100%", background: (loading || !transcript.trim()) ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg, ${V.orange}, #CC3412)`, border: "none", borderRadius: 14, color: (loading || !transcript.trim()) ? V.s4 : V.white, fontSize: 15, fontWeight: 700, padding: "16px", cursor: (loading || !transcript.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "-0.2px", boxShadow: (loading || !transcript.trim()) ? "none" : `0 6px 30px ${V.orange}50`, transition: "all .3s" }}>
            {loading ? "⏳ Analyse en cours — 3 IAs travaillent en parallèle…" : "🚀 Analyser le Call avec l'IA"}
          </button>
        </>)}

        {/* ══ REVIEW ══════════════════════════════════════════════════════════════ */}
        {page === "review" && (<>
          {loading && (
            <div style={{ textAlign: "center", padding: 80 }}>
              <div style={{ width: 50, height: 50, border: `3px solid ${V.neon}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 20px" }}/>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Analyse en cours…</div>
              <div style={{ fontSize: 13, color: V.s5 }}>Scores • Scripts experts • Plans de progression — en parallèle</div>
            </div>
          )}

          {!loading && (<>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {[["review","🎯 Critères"],["summary","📊 Synthèse"]].map(([id,lbl]) => (
                <button key={id} onClick={() => setReviewTab(id)} style={{ flex: 1, padding: "10px", background: reviewTab === id ? V.blue : "rgba(255,255,255,0.05)", border: `1.5px solid ${reviewTab === id ? V.blue : "rgba(255,255,255,0.1)"}`, borderRadius: 10, color: reviewTab === id ? V.white : V.s5, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{lbl}</button>
              ))}
            </div>

            {/* Save */}
            <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
              <button onClick={saveReview} disabled={saveStatus === "saving" || !Object.keys(scores).length} style={{ background: saveStatus === "saved" ? "#10B98120" : saveStatus === "error" ? "#EF444420" : `linear-gradient(135deg, #10B981, #059669)`, border: saveStatus ? `1px solid currentColor` : "none", borderRadius: 10, color: saveStatus === "saved" ? "#10B981" : saveStatus === "error" ? "#EF4444" : V.white, fontWeight: 600, fontSize: 13, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", boxShadow: saveStatus ? "none" : "0 4px 16px #10B98140" }}>
                {saveStatus === "saving" ? "⏳ Sauvegarde…" : saveStatus === "saved" ? "✅ Sauvegardé !" : saveStatus === "error" ? "❌ Erreur" : "💾 Sauvegarder la review"}
              </button>
              {(meta.sdr || meta.prospect) && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {meta.sdr && <span style={{ fontSize: 12, color: V.s5 }}>👤 <strong style={{ color: V.white }}>{meta.sdr}</strong></span>}
                  {meta.prospect && <span style={{ fontSize: 12, color: V.s5 }}>🎯 <strong style={{ color: V.white }}>{meta.prospect}</strong></span>}
                  {meta.company && <span style={{ fontSize: 12, color: V.s5 }}>🏗️ <strong style={{ color: V.white }}>{meta.company}</strong></span>}
                  {globalPct > 0 && <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: grade.color }}>{globalPct}% — {grade.label}</span>}
                </div>
              )}
            </div>

            {/* Critères */}
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
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={scores} justifications={justifications} expertScripts={expertScripts} levelUp={levelUp} onChange={(id, v) => setScores(s => ({...s,[id]:v}))} onJustify={(id, v) => setJustifications(j => ({...j,[id]:v}))} sectionColor={section.color}/>)}
              </div>
            ))}

            {/* Synthèse */}
            {reviewTab === "summary" && (<>
              <div style={card()}>
                <span style={sLabel}>Score global</span>
                <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <GaugeArc pct={globalPct} color={grade.color} size={120}/>
                    <div style={{ fontSize: 13, color: grade.color, fontWeight: 700, marginTop: 4 }}>{grade.label}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {CRITERIA.map(s => <SectionBar key={s.section} label={s.section} pct={sectionPct(s, scores)} color={s.color}/>)}
                  </div>
                </div>
              </div>

              {globalComment && (
                <div style={card()}>
                  <span style={sLabel}>🎯 Verdict du coach</span>
                  <p style={{ color: V.bg1, fontSize: 14, lineHeight: 1.8, margin: 0 }}>{globalComment}</p>
                  {globalStrengths.length > 0 && (
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>✅ Forces</div>
                        {globalStrengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 6, borderLeft: "2px solid #10B981" }}>{s}</div>)}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Axes prioritaires</div>
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
            <div style={{ fontSize: 18, fontWeight: 800 }}>Mes reviews</div>
            <button onClick={() => setPage("new")} style={{ background: `linear-gradient(135deg, ${V.orange}, #CC3412)`, border: "none", borderRadius: 10, color: V.white, fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${V.orange}50` }}>+ Nouveau call</button>
          </div>

          {reviews.length === 0 && <div style={{ ...card(), textAlign: "center", padding: 48 }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ color: V.s5 }}>Aucune review sauvegardée</div></div>}

          {reviews.map(r => {
            const g = getGrade(r.globalPct || 0);
            return (
              <div key={r.id} style={{ ...card(), cursor: "pointer", transition: "border-color .2s", borderColor: "rgba(255,255,255,0.09)" }} onClick={() => { setSelectedReview(r); setPage("detail"); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: g.bg, border: `2px solid ${g.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: g.color, flexShrink: 0, fontFamily: "inherit" }}>{r.globalPct || 0}%</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.prospectName || "Prospect"}{r.company ? ` · ${r.company}` : ""}</div>
                    <div style={{ fontSize: 12, color: V.s5, marginTop: 2 }}>{r.callDate || new Date(r.createdAt?.toDate?.()).toLocaleDateString("fr-FR")} · {r.sdrName}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ background: g.bg, border: `1px solid ${g.color}40`, borderRadius: 16, padding: "3px 12px", fontSize: 11, color: g.color, fontWeight: 600 }}>{g.label}</span>
                    <button onClick={e => { e.stopPropagation(); if (window.confirm("Supprimer ?")) deleteReview(r.id); }} style={{ background: "#EF444415", border: "none", borderRadius: 8, color: "#EF4444", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </>)}

        {/* ══ DÉTAIL ══════════════════════════════════════════════════════════════ */}
        {page === "detail" && selectedReview && (() => {
          const r = selectedReview;
          const g = getGrade(r.globalPct || 0);
          return (<>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <button onClick={() => setPage("history")} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: V.s5, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Retour</button>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{r.prospectName || "Prospect"}{r.company ? ` · ${r.company}` : ""}</div>
                <div style={{ fontSize: 12, color: V.s5 }}>{r.callDate} · {r.sdrName}</div>
              </div>
              <div style={{ marginLeft: "auto", background: g.bg, border: `1px solid ${g.color}40`, borderRadius: 20, padding: "6px 18px" }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: g.color }}>{r.globalPct || 0}%</span>
              </div>
            </div>

            <div style={card()}>
              <span style={sLabel}>Scores par section</span>
              {CRITERIA.map(s => <SectionBar key={s.section} label={`${s.icon} ${s.section}`} pct={sectionPct(s, r.scores || {})} color={s.color}/>)}
            </div>

            {r.globalComment && (
              <div style={card()}>
                <span style={sLabel}>🎯 Verdict du coach</span>
                <p style={{ color: V.bg1, fontSize: 14, lineHeight: 1.8, margin: 0 }}>{r.globalComment}</p>
                {(r.globalStrengths?.length > 0 || r.globalImprovements?.length > 0) && (
                  <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {r.globalStrengths?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>✅ Forces</div>
                        {r.globalStrengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 6, borderLeft: "2px solid #10B981" }}>{s}</div>)}
                      </div>
                    )}
                    {r.globalImprovements?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Axes prioritaires</div>
                        {r.globalImprovements.map((s, i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: `${V.orange}10`, borderRadius: 8, marginBottom: 6, borderLeft: `2px solid ${V.orange}` }}>{s}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {CRITERIA.map(section => (
              <div key={section.section} style={card()}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{section.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: "1.2px" }}>{section.section}</span>
                </div>
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={r.scores || {}} justifications={r.justifications || {}} expertScripts={r.expertScripts || {}} levelUp={r.levelUp || {}} sectionColor={section.color} readOnly/>)}
              </div>
            ))}
          </>);
        })()}
      </div>
    </div>
  );
}
