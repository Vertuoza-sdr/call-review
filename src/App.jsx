import { useState, useRef, useEffect } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, deleteDoc, doc, getDocs
} from "firebase/firestore";

const CRITERIA = [
  { section: "OUVERTURE & POSTURE", color: "#F97316", items: [
    { id: "tone",    label: "Ton assuré et professionnel dès le début", tip: "Voix posée, rythme maîtrisé, pas de 'euh' excessifs." },
    { id: "rapport", label: "Relation humaine et rapport de confiance",  tip: "Utilise le prénom, connaît le secteur, évite un ton trop corporate." },
    { id: "rhythm",  label: "Rythme adapté au prospect",                 tip: "Ni trop rapide, ni trop lent. Adapté à des entrepreneurs occupés." },
    { id: "opening", label: "Ouverture claire et engageante",            tip: "Accroche liée à une vraie douleur terrain." },
  ]},
  { section: "STRUCTURE & DISCOVERY", color: "#3B82F6", items: [
    { id: "flow",      label: "Enchaînement naturel des étapes",           tip: "Intro → questions → pitch → next step sans rupture." },
    { id: "talkratio", label: "Gestion du temps de parole",                tip: "Ratio idéal : 40% parle / 60% écoute." },
    { id: "structure", label: "Identification de la structure entreprise", tip: "Taille, nombre d'employés, volume de chantiers." },
    { id: "tools",     label: "Compréhension des outils et douleurs",      tip: "Excel, papier, ERP, irritants quotidiens." },
    { id: "decision",  label: "Identification du bon décisionnaire",       tip: "Patron, associé, conjoint, responsable admin." },
    { id: "timing",    label: "Qualification du timing et de l'urgence",   tip: "Déclencheur concret : croissance, facturation…" },
    { id: "quantify",  label: "Quantification du problème du prospect",    tip: "Temps perdu, argent perdu, erreurs, retards." },
  ]},
  { section: "PITCH & OBJECTIONS", color: "#8B5CF6", items: [
    { id: "objections", label: "Gestion des objections calmement",          tip: "Prix, temps, habitudes anciennes." },
    { id: "sector",     label: "Réponses adaptées au secteur bâtiment",     tip: "Exemples concrets de clients similaires." },
    { id: "trade",      label: "Discours adapté au métier du prospect",      tip: "Électricien ≠ maçon ≠ couvreur." },
    { id: "vocab",      label: "Utilisation correcte du vocabulaire métier", tip: "Devis, situation de travaux, sous-traitants, CCTP…" },
    { id: "cases",      label: "Vertuoza relié à des cas concrets terrain",  tip: "\"Sur chantier\", \"le soir\", \"technicien sur mobile\"." },
    { id: "benefits",   label: "Mise en avant des bénéfices (pas features)", tip: "Temps gagné, argent, organisation, sérénité." },
  ]},
  { section: "CLOSING & ÉNERGIE", color: "#10B981", items: [
    { id: "control",    label: "Contrôle du call",               tip: "Guide la conversation, ne la subit pas." },
    { id: "commitment", label: "Engagement concret du prospect",  tip: "Date, email, démo confirmée." },
    { id: "energy",     label: "Conviction et énergie projetées", tip: "Le prospect doit sentir un expert passionné." },
  ]},
];

const ALL_IDS = CRITERIA.flatMap(s => s.items.map(i => i.id));
const SCORES = [
  { value: 0, label: "N/A",          color: "#6B7280" },
  { value: 1, label: "❌ Manquant",  color: "#EF4444" },
  { value: 2, label: "⚠️ Partiel",   color: "#F59E0B" },
  { value: 3, label: "✅ Bon",       color: "#10B981" },
  { value: 4, label: "⭐ Excellent", color: "#3B82F6" },
];

const getGrade = p =>
  p >= 90 ? { label: "Elite",        color: "#3B82F6" } :
  p >= 75 ? { label: "Solide",       color: "#10B981" } :
  p >= 55 ? { label: "À améliorer",  color: "#F59E0B" } :
            { label: "À travailler", color: "#EF4444" };

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

function ScoreButton({ value, selected, onClick }) {
  const s = SCORES.find(s => s.value === value);
  return (
    <button onClick={() => onClick(value)} style={{
      background: selected ? s.color : "transparent",
      border: `1.5px solid ${selected ? s.color : "#2D3748"}`,
      color: selected ? "#fff" : "#9CA3AF",
      borderRadius: 6, padding: "3px 8px", fontSize: 11,
      fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
      fontWeight: selected ? 600 : 400, transition: "all .15s",
    }}>{s.label}</button>
  );
}

function AutoTextarea({ value, onChange, placeholder, readOnly }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [value]);
  return (
    <textarea ref={ref} value={value || ""} onChange={onChange} placeholder={placeholder}
      readOnly={readOnly} rows={2} style={{
        width: "100%", background: readOnly ? "#0D1117" : "#111827",
        border: "1px solid #1F2937", borderRadius: 6, color: "#D1D5DB",
        fontSize: 12.5, padding: "8px 10px", fontFamily: "inherit",
        outline: "none", boxSizing: "border-box", resize: "none",
        lineHeight: 1.6, overflow: "hidden", minHeight: 52,
      }} />
  );
}

function GaugeArc({ score, max, color, size = 90 }) {
  const pct = max > 0 ? score / max : 0;
  const r = size / 2 - 8, circ = Math.PI * r, dash = pct * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
      <path d={`M 8 ${cy} A ${r} ${r} 0 0 1 ${size-8} ${cy}`} fill="none" stroke="#1F2937" strokeWidth={7} strokeLinecap="round"/>
      <path d={`M 8 ${cy} A ${r} ${r} 0 0 1 ${size-8} ${cy}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}/>
      <text x={cx} y={cy+5} textAnchor="middle" fill={color} fontSize={size*.22} fontWeight="700" fontFamily="'DM Sans',sans-serif">{Math.round(pct*100)}%</text>
    </svg>
  );
}

function MiniSparkline({ values, color }) {
  if (!values || values.length < 2) return null;
  const w = 120, h = 36, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r={3} fill={color}/>;
      })}
    </svg>
  );
}

function CriterionRow({ criterion, scores, justifications, expertScripts, onChange, onJustify, sectionColor, readOnly }) {
  const score = scores[criterion.id] ?? 0;
  const [showTip, setShowTip] = useState(false);
  const expertText = expertScripts?.[criterion.id];
  const sc = SCORES.find(s => s.value === score);
  return (
    <div style={{ borderBottom: "1px solid #1F2937", padding: "14px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setShowTip(!showTip)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sectionColor, flexShrink: 0, marginTop: 2 }}/>
            <span style={{ color: "#E5E7EB", fontSize: 13, fontWeight: 600 }}>{criterion.label}</span>
            <span style={{ color: "#4B5563", fontSize: 10, marginLeft: 4 }}>{showTip ? "▲" : "▼"}</span>
          </div>
          {showTip && <div style={{ marginTop: 5, marginLeft: 14, color: "#6B7280", fontSize: 11.5, fontStyle: "italic", lineHeight: 1.5 }}>💡 {criterion.tip}</div>}
        </div>
        {!readOnly ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 260 }}>
            {SCORES.map(s => <ScoreButton key={s.value} value={s.value} selected={score === s.value} onClick={v => onChange(criterion.id, v)}/>)}
          </div>
        ) : (
          <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, background: `${sc?.color}20`, color: sc?.color, fontWeight: 600, whiteSpace: "nowrap" }}>{sc?.label}</span>
        )}
      </div>
      <div style={{ marginLeft: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>📋 Analyse & Recommandation</div>
          <AutoTextarea value={justifications[criterion.id]} onChange={e => onJustify && onJustify(criterion.id, e.target.value)} placeholder="Ce qui a été observé + recommandation…" readOnly={readOnly}/>
        </div>
        {expertText && (
          <div style={{ background: "linear-gradient(135deg,#0F1F0F,#0A1A0A)", border: "1px solid #16a34a30", borderLeft: "3px solid #16a34a", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>🎙️ Ce que j'aurais dit — version expert</div>
            <div style={{ color: "#86efac", fontSize: 13, lineHeight: 1.7, fontStyle: "italic" }}>"{expertText}"</div>
          </div>
        )}
      </div>
    </div>
  );
}

async function transcribeWithWhisper(file, apiKey, language) {
  const fd = new FormData();
  fd.append("file", file); fd.append("model", "whisper-1"); fd.append("response_format", "verbose_json");
  if (language) fd.append("language", language);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Whisper ${res.status}`); }
  return (await res.json()).text || "";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [page, setPage] = useState("dashboard");
  const [reviews, setReviews] = useState([]);
  const [allReviews, setAllReviews] = useState([]);
  const [selectedReview, setSelectedReview] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [reviewTab, setReviewTab] = useState("review");

  const [inputMode, setInputMode] = useState("audio");
  const [transcript, setTranscript] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [audioLang, setAudioLang] = useState("fr");
  const [txStatus, setTxStatus] = useState("idle");
  const [txMsg, setTxMsg] = useState("");

  const [scores, setScores] = useState({});
  const [justifications, setJustifications] = useState({});
  const [expertScripts, setExpertScripts] = useState({});
  const [globalComment, setGlobalComment] = useState("");
  const [meta, setMeta] = useState({ sdr: "", date: "", prospect: "", company: "" });
  const [loading, setLoading] = useState(false);

  const audioRef = useRef(), txtRef = useRef();

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  // Load my reviews
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [user]);

  // Load all reviews for leaderboard
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => setAllReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, [user]);

  const handleAuth = async () => {
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      const msgs = {
        "auth/invalid-credential": "Email ou mot de passe incorrect.",
        "auth/email-already-in-use": "Cet email est déjà utilisé.",
        "auth/weak-password": "Mot de passe trop court (6 caractères min).",
        "auth/invalid-email": "Email invalide.",
      };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthBusy(false);
  };

  const handleLogout = () => signOut(auth);

  const saveReview = async () => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      await addDoc(collection(db, "reviews"), {
        userId: user.uid,
        userEmail: user.email,
        sdrName: meta.sdr || user.email,
        prospectName: meta.prospect,
        company: meta.company,
        callDate: meta.date,
        scores, justifications, expertScripts,
        globalComment,
        globalPct: calcPct(scores),
        createdAt: new Date(),
      });
      setSaveStatus("saved");
    } catch (e) { setSaveStatus("error"); }
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
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxT, system, messages: [{ role: "user", content }] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const txt = data.content?.map(b => b.text || "").join("") || "";
    return JSON.parse(txt.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim());
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setPage("review"); setReviewTab("review");
    setScores({}); setJustifications({}); setExpertScripts({}); setGlobalComment("");

    const p1 = `Tu es un expert en coaching commercial B2B SaaS spécialisé BTP. Tu analyses des calls SDR pour Vertuoza (logiciel gestion bâtiment). Retourne UNIQUEMENT du JSON valide sans markdown :
{"scores":{"tone":2,"rapport":2,"rhythm":2,"opening":2,"flow":2,"talkratio":2,"structure":2,"tools":2,"decision":2,"timing":2,"quantify":2,"objections":2,"sector":2,"trade":2,"vocab":2,"cases":2,"benefits":2,"control":2,"commitment":2,"energy":2},"justifications":{"tone":"...","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."},"globalComment":"3-4 phrases synthèse."}
Scores: 1=manquant,2=partiel,3=bon,4=excellent.`;

    const p2 = `Tu es un top SDR Vertuoza expert BTP. Pour chaque critère, écris exactement ce qu'un expert aurait dit dans CE call. Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":"...","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."}
Formulations naturelles, 1-3 phrases, vocabulaire bâtiment.`;

    try {
      const [r1, r2] = await Promise.all([
        callAPI(p1, `Transcript:\n\n${transcript}`),
        callAPI(p2, `Transcript:\n\n${transcript}`),
      ]);
      setScores(r1.scores || {}); setJustifications(r1.justifications || {});
      setGlobalComment(r1.globalComment || ""); setExpertScripts(r2 || {});
    } catch (e) { setGlobalComment("❌ Erreur : " + e.message); }
    setLoading(false);
  };

  const handleTranscribe = async () => {
    if (!audioFile || !openaiKey.trim()) return;
    setTxStatus("processing"); setTxMsg("Transcription via Whisper…");
    try {
      const txt = await transcribeWithWhisper(audioFile, openaiKey.trim(), audioLang);
      setTranscript(txt); setTxStatus("done"); setTxMsg("✅ Transcription terminée !");
    } catch (e) { setTxStatus("error"); setTxMsg("❌ " + e.message); }
  };

  const globalPct = calcPct(scores);
  const grade = getGrade(globalPct);

  const myAvg = reviews.length ? Math.round(reviews.reduce((a, r) => a + (r.globalPct || 0), 0) / reviews.length) : 0;
  const sparkline = reviews.slice(0, 10).reverse().map(r => r.globalPct || 0);

  const leaderboard = Object.values(
    allReviews.reduce((acc, r) => {
      const name = r.sdrName || r.userEmail || "Inconnu";
      if (!acc[name]) acc[name] = { name, total: 0, count: 0 };
      acc[name].total += r.globalPct || 0;
      acc[name].count += 1;
      return acc;
    }, {})
  ).map(s => ({ ...s, avg: Math.round(s.total / s.count) }))
   .sort((a, b) => b.avg - a.avg);

  const S = {
    card: { background: "#0D1117", border: "1px solid #1F2937", borderRadius: 12, padding: 20, marginBottom: 16 },
    label: { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8, display: "block" },
    input: { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, color: "#D1D5DB", fontSize: 13, padding: "9px 12px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  };

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#6B7280", fontSize: 14 }}>Chargement…</div>
    </div>
  );

  if (!user) return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"/>
      <div style={{ width: 380, background: "#0D1117", border: "1px solid #1F2937", borderRadius: 16, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#F97316,#EF4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff" }}>V</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: "#E5E7EB" }}>Vertuoza <span style={{ color: "#F97316" }}>Call Review</span></div>
            <div style={{ fontSize: 11, color: "#6B7280" }}>SDR Performance Platform</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "#111827", borderRadius: 8, padding: 4 }}>
          {[["login","Connexion"],["signup","Créer un compte"]].map(([m,l]) => (
            <button key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, padding: "7px", background: authMode === m ? "#1F2937" : "transparent", border: "none", borderRadius: 6, color: authMode === m ? "#F97316" : "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={S.label}>Email</span>
          <input type="email" placeholder="julie@vertuoza.com" value={email} onChange={e => setEmail(e.target.value)} style={S.input}/>
        </div>
        <div style={{ marginBottom: 20 }}>
          <span style={S.label}>Mot de passe</span>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} style={S.input}/>
        </div>
        {authError && <div style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, padding: "8px 12px", color: "#EF4444", fontSize: 12, marginBottom: 14 }}>{authError}</div>}
        <button onClick={handleAuth} disabled={authBusy} style={{ width: "100%", background: "linear-gradient(135deg,#F97316,#EF4444)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, padding: "11px", cursor: authBusy ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: authBusy ? 0.7 : 1 }}>
          {authBusy ? "⏳ …" : authMode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#030712", fontFamily: "'DM Sans',sans-serif", color: "#E5E7EB" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"/>

      {/* Topbar */}
      <div style={{ background: "#0A0F1E", borderBottom: "1px solid #1F2937", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#F97316,#EF4444)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#fff" }}>V</div>
          <span style={{ fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", fontSize: 15 }}>Vertuoza <span style={{ color: "#F97316" }}>Call Review</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#6B7280" }}>👤 {user.email}</span>
          <button onClick={handleLogout} style={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#9CA3AF", padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Déconnexion</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid #1F2937", display: "flex", padding: "0 20px", background: "#0A0F1E" }}>
        {[["dashboard","📊 Dashboard"],["new","🎙️ Nouveau call"],["history","📋 Historique"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setPage(id)} style={{ background: "none", border: "none", borderBottom: page === id ? "2px solid #F97316" : "2px solid transparent", color: page === id ? "#F97316" : "#6B7280", fontSize: 13, fontWeight: 600, padding: "11px 16px", cursor: "pointer", fontFamily: "inherit" }}>{lbl}</button>
        ))}
        {(page === "review" || page === "detail") && (
          <button style={{ background: "none", border: "none", borderBottom: "2px solid #8B5CF6", color: "#8B5CF6", fontSize: 13, fontWeight: 600, padding: "11px 16px", fontFamily: "inherit" }}>
            {page === "review" ? "🎯 Analyse" : "🔍 Détail"}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", boxSizing: "border-box" }}>

        {/* DASHBOARD */}
        {page === "dashboard" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Mes calls analysés", value: reviews.length, icon: "🎙️", color: "#F97316" },
              { label: "Mon score moyen", value: myAvg + "%", icon: "⭐", color: getGrade(myAvg).color },
              { label: "Dernier score", value: reviews[0] ? reviews[0].globalPct + "%" : "—", icon: "📅", color: "#8B5CF6" },
            ].map(k => (
              <div key={k.label} style={{ ...S.card, marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{k.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: k.color, fontFamily: "'Space Grotesk',sans-serif" }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {reviews.length > 0 && (
            <div style={S.card}>
              <span style={S.label}>Ma progression</span>
              <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <GaugeArc score={myAvg} max={100} color={getGrade(myAvg).color} size={100}/>
                  <div style={{ fontSize: 12, color: getGrade(myAvg).color, fontWeight: 700, marginTop: 4 }}>{getGrade(myAvg).label}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Évolution (derniers calls)</div>
                  <MiniSparkline values={sparkline} color="#F97316"/>
                  <div style={{ marginTop: 12 }}>
                    {CRITERIA.map(s => {
                      const avg = reviews.length ? Math.round(reviews.reduce((a, r) => a + sectionPct(s, r.scores || {}), 0) / reviews.length) : 0;
                      return (
                        <div key={s.section} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{s.section}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{avg}%</span>
                          </div>
                          <div style={{ height: 5, background: "#1F2937", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${avg}%`, background: s.color, borderRadius: 3 }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {leaderboard.length > 0 && (
            <div style={S.card}>
              <span style={S.label}>🏆 Classement équipe</span>
              {leaderboard.map((s, i) => {
                const g = getGrade(s.avg);
                return (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < leaderboard.length - 1 ? "1px solid #1F2937" : "none" }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E5E7EB" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>{s.count} call{s.count > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: g.color, fontFamily: "'Space Grotesk',sans-serif" }}>{s.avg}%</div>
                      <div style={{ fontSize: 10, color: g.color }}>{g.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reviews.length === 0 && (
            <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
              <div style={{ color: "#9CA3AF", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Aucun call analysé</div>
              <div style={{ color: "#4B5563", fontSize: 13, marginBottom: 20 }}>Lance ta première analyse pour voir ta progression.</div>
              <button onClick={() => setPage("new")} style={{ background: "linear-gradient(135deg,#F97316,#EF4444)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13, padding: "9px 18px", cursor: "pointer", fontFamily: "inherit" }}>🚀 Analyser mon premier call</button>
            </div>
          )}
        </>)}

        {/* NOUVEAU CALL */}
        {page === "new" && (<>
          <div style={S.card}>
            <span style={S.label}>Infos du call</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Nom du SDR","sdr"],["Date du call","date"],["Nom du prospect","prospect"],["Entreprise / Métier BTP","company"]].map(([ph,k]) => (
                <input key={k} placeholder={ph} value={meta[k]} onChange={e => setMeta({...meta,[k]:e.target.value})} style={S.input}/>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[["audio","🎙️","Fichier audio"],["text","📝","Transcript texte"]].map(([id,icon,lbl]) => (
              <button key={id} onClick={() => setInputMode(id)} style={{ flex:1, padding:"10px", background: inputMode===id?"#1F2937":"transparent", border:`1.5px solid ${inputMode===id?"#F97316":"#1F2937"}`, borderRadius:10, color:inputMode===id?"#F97316":"#6B7280", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {icon} {lbl}
              </button>
            ))}
          </div>

          {inputMode === "audio" && (
            <div style={S.card}>
              <span style={S.label}>Transcription — OpenAI Whisper</span>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input type={showKey?"text":"password"} placeholder="Clé API OpenAI (sk-...)" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} style={{ ...S.input, fontFamily:"monospace", flex:1, width:"auto" }}/>
                <button onClick={() => setShowKey(!showKey)} style={{ background:"#1F2937", border:"1px solid #374151", borderRadius:8, color:"#9CA3AF", padding:"9px 12px", cursor:"pointer", fontFamily:"inherit" }}>{showKey?"🙈":"👁️"}</button>
              </div>
              <select value={audioLang} onChange={e => setAudioLang(e.target.value)} style={{ ...S.input, marginBottom:12 }}>
                <option value="fr">🇫🇷 Français</option>
                <option value="nl">🇳🇱 Néerlandais</option>
                <option value="en">🇬🇧 Anglais</option>
              </select>
              <div onClick={() => audioRef.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setAudioFile(f);setTxStatus("idle");setTxMsg("");}}}
                style={{ border:`2px dashed ${audioFile?"#F97316":"#1F2937"}`, borderRadius:10, padding:"24px 20px", textAlign:"center", cursor:"pointer", background:audioFile?"#F9731608":"#111827", marginBottom:12 }}>
                <input ref={audioRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.ogg,.webm,.aac,.flac" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setAudioFile(f);setTxStatus("idle");setTxMsg("");}}}/>
                {audioFile ? (
                  <div><div style={{ fontSize:22, marginBottom:6 }}>🎙️</div><div style={{ color:"#F97316", fontWeight:600, fontSize:13 }}>{audioFile.name}</div><div style={{ color:"#6B7280", fontSize:11, marginTop:3 }}>{(audioFile.size/1024/1024).toFixed(1)} MB</div></div>
                ) : (
                  <div><div style={{ fontSize:28, marginBottom:6 }}>📂</div><div style={{ color:"#9CA3AF", fontSize:13, fontWeight:500 }}>Glisse ton fichier audio ici</div><div style={{ color:"#4B5563", fontSize:11, marginTop:3 }}>MP3, MP4, M4A, WAV — max 25MB</div></div>
                )}
              </div>
              {txMsg && <div style={{ padding:"8px 12px", borderRadius:8, background:`${txStatus==="done"?"#10B981":txStatus==="error"?"#EF4444":"#3B82F6"}15`, color:txStatus==="done"?"#10B981":txStatus==="error"?"#EF4444":"#3B82F6", fontSize:12, marginBottom:12 }}>{txMsg}</div>}
              <button onClick={handleTranscribe} disabled={!audioFile||!openaiKey.trim()||txStatus==="processing"}
                style={{ width:"100%", background:(!audioFile||!openaiKey.trim())?"#1F2937":"linear-gradient(135deg,#3B82F6,#6366F1)", border:"none", borderRadius:10, color:(!audioFile||!openaiKey.trim())?"#4B5563":"#fff", fontSize:14, fontWeight:700, padding:"12px", cursor:(!audioFile||!openaiKey.trim())?"not-allowed":"pointer", fontFamily:"inherit" }}>
                {txStatus==="processing"?"⚡ Transcription…":"🎙️ Transcrire avec Whisper"}
              </button>
              {txStatus==="done" && transcript && (
                <div style={{ marginTop:12, background:"#111827", border:"1px solid #1F2937", borderRadius:8, padding:"10px 12px", color:"#9CA3AF", fontSize:11, fontFamily:"monospace", maxHeight:100, overflowY:"auto", lineHeight:1.6 }}>
                  {transcript.slice(0,500)}{transcript.length>500?"…":""}
                </div>
              )}
            </div>
          )}

          {inputMode === "text" && (
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <span style={S.label}>Transcript texte</span>
                <button onClick={()=>txtRef.current.click()} style={{ background:"#1F2937", border:"1px solid #374151", borderRadius:6, color:"#9CA3AF", fontSize:12, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit" }}>📁 .txt</button>
                <input ref={txtRef} type="file" accept=".txt,.md" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setTranscript(ev.target.result);r.readAsText(f);}}/>
              </div>
              <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder={"SDR: Bonjour Marc...\nPROSPECT: Oui bonjour..."} style={{ ...S.input, minHeight:260, fontFamily:"monospace", resize:"vertical", lineHeight:1.6 }}/>
            </div>
          )}

          <button onClick={handleAnalyze} disabled={loading||!transcript.trim()}
            style={{ width:"100%", background:(loading||!transcript.trim())?"#1F2937":"linear-gradient(135deg,#F97316,#EF4444)", border:"none", borderRadius:10, color:(loading||!transcript.trim())?"#4B5563":"#fff", fontSize:15, fontWeight:700, padding:"14px", cursor:(loading||!transcript.trim())?"not-allowed":"pointer", fontFamily:"inherit" }}>
            {loading?"⏳ Analyse en cours…":"🚀 Analyser le Call avec l'IA"}
          </button>
        </>)}

        {/* REVIEW */}
        {page === "review" && (<>
          {loading && (
            <div style={{ textAlign:"center", padding:60 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>⚡</div>
              <div style={{ color:"#E5E7EB", fontWeight:600, marginBottom:6 }}>Analyse en cours…</div>
              <div style={{ fontSize:12, color:"#4B5563" }}>Scores + scripts experts générés en parallèle</div>
            </div>
          )}
          {!loading && (<>
            <div style={{ display:"flex", gap:6, marginBottom:16 }}>
              {[["review","🎯 Critères"],["summary","📊 Synthèse"]].map(([id,lbl]) => (
                <button key={id} onClick={()=>setReviewTab(id)} style={{ flex:1, padding:"9px", background:reviewTab===id?"#1F2937":"transparent", border:`1.5px solid ${reviewTab===id?"#F97316":"#1F2937"}`, borderRadius:8, color:reviewTab===id?"#F97316":"#6B7280", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center" }}>
              <button onClick={saveReview} disabled={saveStatus==="saving"||!Object.keys(scores).length}
                style={{ background:saveStatus==="saved"?"#10B98120":saveStatus==="error"?"#EF444420":"linear-gradient(135deg,#10B981,#059669)", border:saveStatus?"1px solid currentColor":"none", borderRadius:8, color:saveStatus==="saved"?"#10B981":saveStatus==="error"?"#EF4444":"#fff", fontWeight:600, fontSize:13, padding:"9px 18px", cursor:"pointer", fontFamily:"inherit" }}>
                {saveStatus==="saving"?"⏳ …":saveStatus==="saved"?"✅ Sauvegardé !":saveStatus==="error"?"❌ Erreur":"💾 Sauvegarder"}
              </button>
              <span style={{ fontSize:12, color:"#4B5563" }}>Sauvegarde dans ton historique + leaderboard</span>
            </div>
            {(meta.sdr||meta.prospect) && (
              <div style={{ ...S.card, padding:"12px 16px", display:"flex", gap:16, flexWrap:"wrap", marginBottom:16 }}>
                {meta.sdr && <span style={{ fontSize:12, color:"#9CA3AF" }}>👤 <strong style={{ color:"#E5E7EB" }}>{meta.sdr}</strong></span>}
                {meta.date && <span style={{ fontSize:12, color:"#9CA3AF" }}>📅 <strong style={{ color:"#E5E7EB" }}>{meta.date}</strong></span>}
                {meta.prospect && <span style={{ fontSize:12, color:"#9CA3AF" }}>🎯 <strong style={{ color:"#E5E7EB" }}>{meta.prospect}</strong></span>}
                {meta.company && <span style={{ fontSize:12, color:"#9CA3AF" }}>🏗️ <strong style={{ color:"#E5E7EB" }}>{meta.company}</strong></span>}
                {globalPct > 0 && <span style={{ marginLeft:"auto", fontSize:16, fontWeight:700, color:grade.color }}>{globalPct}% — {grade.label}</span>}
              </div>
            )}
            {reviewTab === "review" && CRITERIA.map(section => (
              <div key={section.section} style={S.card}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:3, height:18, borderRadius:2, background:section.color }}/>
                    <span style={{ fontSize:12, fontWeight:700, color:section.color, textTransform:"uppercase", letterSpacing:"1px" }}>{section.section}</span>
                  </div>
                  {sectionPct(section,scores) > 0 && <span style={{ fontSize:12, fontWeight:600, color:section.color, background:`${section.color}15`, padding:"2px 10px", borderRadius:20 }}>{sectionPct(section,scores)}%</span>}
                </div>
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={scores} justifications={justifications} expertScripts={expertScripts} onChange={(id,v)=>setScores(s=>({...s,[id]:v}))} onJustify={(id,v)=>setJustifications(j=>({...j,[id]:v}))} sectionColor={section.color}/>)}
              </div>
            ))}
            {reviewTab === "summary" && (<>
              <div style={S.card}>
                <span style={S.label}>Score global</span>
                <div style={{ display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
                  <div style={{ textAlign:"center" }}>
                    <GaugeArc score={globalPct} max={100} color={grade.color} size={100}/>
                    <div style={{ fontSize:12, color:grade.color, fontWeight:700, marginTop:4 }}>{grade.label}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    {CRITERIA.map(s => { const pct=sectionPct(s,scores); return (
                      <div key={s.section} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12, color:"#9CA3AF" }}>{s.section}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:s.color }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, background:"#1F2937", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:s.color, borderRadius:3 }}/>
                        </div>
                      </div>
                    );})}
                  </div>
                </div>
              </div>
              {globalComment && <div style={S.card}><span style={S.label}>Verdict du coach</span><p style={{ color:"#D1D5DB", fontSize:13.5, lineHeight:1.7, margin:0 }}>{globalComment}</p></div>}
            </>)}
          </>)}
        </>)}

        {/* HISTORIQUE */}
        {page === "history" && (<>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:16, fontWeight:700, fontFamily:"'Space Grotesk',sans-serif" }}>Mes reviews</div>
            <button onClick={()=>setPage("new")} style={{ background:"linear-gradient(135deg,#F97316,#EF4444)", border:"none", borderRadius:8, color:"#fff", fontWeight:600, fontSize:13, padding:"9px 18px", cursor:"pointer", fontFamily:"inherit" }}>+ Nouveau call</button>
          </div>
          {reviews.length === 0 && <div style={{ ...S.card, textAlign:"center", padding:40 }}><div style={{ fontSize:32, marginBottom:10 }}>📋</div><div style={{ color:"#9CA3AF", fontSize:14 }}>Aucune review sauvegardée</div></div>}
          {reviews.map(r => {
            const g = getGrade(r.globalPct||0);
            return (
              <div key={r.id} style={{ ...S.card, cursor:"pointer" }} onClick={()=>{setSelectedReview(r);setPage("detail");}}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:48, height:48, borderRadius:10, background:`${g.color}15`, border:`2px solid ${g.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15, color:g.color, fontFamily:"'Space Grotesk',sans-serif", flexShrink:0 }}>{r.globalPct||0}%</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:"#E5E7EB" }}>{r.prospectName||"Prospect"} {r.company?`· ${r.company}`:""}</div>
                    <div style={{ fontSize:12, color:"#6B7280", marginTop:2 }}>{r.callDate||new Date(r.createdAt?.toDate?.()).toLocaleDateString("fr-FR")} · {g.label}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#6B7280" }}>Voir →</span>
                    <button onClick={e=>{e.stopPropagation();if(window.confirm("Supprimer ?"))deleteReview(r.id);}} style={{ background:"#EF444415", border:"none", borderRadius:6, color:"#EF4444", fontSize:11, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </>)}

        {/* DÉTAIL */}
        {page === "detail" && selectedReview && (() => {
          const r = selectedReview;
          const g = getGrade(r.globalPct||0);
          return (<>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <button onClick={()=>setPage("history")} style={{ background:"#1F2937", border:"none", borderRadius:8, color:"#9CA3AF", padding:"8px 14px", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>← Retour</button>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"#E5E7EB" }}>{r.prospectName||"Prospect"} {r.company?`· ${r.company}`:""}</div>
                <div style={{ fontSize:12, color:"#6B7280" }}>{r.callDate} · {r.sdrName}</div>
              </div>
              <div style={{ marginLeft:"auto", fontSize:22, fontWeight:700, color:g.color, fontFamily:"'Space Grotesk',sans-serif" }}>{r.globalPct||0}%</div>
            </div>
            <div style={S.card}>
              <span style={S.label}>Scores par section</span>
              {CRITERIA.map(s => { const pct=sectionPct(s,r.scores||{}); return (
                <div key={s.section} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:12, color:"#9CA3AF" }}>{s.section}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:s.color }}>{pct}%</span>
                  </div>
                  <div style={{ height:6, background:"#1F2937", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:s.color, borderRadius:3 }}/>
                  </div>
                </div>
              );})}
            </div>
            {r.globalComment && <div style={S.card}><span style={S.label}>Verdict du coach</span><p style={{ color:"#D1D5DB", fontSize:13.5, lineHeight:1.7, margin:0 }}>{r.globalComment}</p></div>}
            {CRITERIA.map(section => (
              <div key={section.section} style={S.card}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <div style={{ width:3, height:18, borderRadius:2, background:section.color }}/>
                  <span style={{ fontSize:12, fontWeight:700, color:section.color, textTransform:"uppercase", letterSpacing:"1px" }}>{section.section}</span>
                </div>
                {section.items.map(c => <CriterionRow key={c.id} criterion={c} scores={r.scores||{}} justifications={r.justifications||{}} expertScripts={r.expertScripts||{}} sectionColor={section.color} readOnly/>)}
              </div>
            ))}
          </>);
        })()}
      </div>
    </div>
  );
}
