import { useState, useRef, useEffect } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
} from "firebase/auth";
import {
  collection, addDoc, query, where, orderBy,
  onSnapshot, deleteDoc, doc, getDocs, updateDoc, getDoc,
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

// ── Traductions (FR / NL) ──────────────────────────────────────────────────────
const TR = {
  fr: {
    // Nav
    nav_dashboard: "Dashboard", nav_new: "Analyser un call", nav_history: "Mes calls",
    nav_objectives: "Objectifs", nav_team: "L'Équipe", nav_admin: "Admin",
    nav_analysis: "🎯 Analyse", nav_detail: "🔍 Détail",
    logout: "Déconnexion", today: "aujourd'hui",
    // Dashboard
    welcome_title: "Ton premier call t'attend.",
    welcome_sub: "Lance ton analyse, reçois ton coaching personnalisé et rejoins le classement de l'équipe.",
    welcome_cta: "🚀 Analyser mon premier call",
    score_avg: "Score moy.", sales_role: "Vertuoza Sales", call: "call", calls: "calls", analyzed: "analysé", analyzed_pl: "analysés",
    xp_to: "XP avant",
    week: "Cette semaine", best_score: "Meilleur score", luc_avg: "LUC moyen", obj_validated: "Obj. validés",
    team_ranking: "Classement équipe", no_calls_yet: "Aucun call pour l'instant.",
    recent_form: "Forme récente",
    next_objectives: "Objectifs pour le prochain call",
    see_all_objectives: "Voir tous les objectifs →",
    my_badges: "Mes écussons",
    unlock_badges: "Analyse des calls pour débloquer tes premiers écussons !",
    // Daily counter
    daily_done: "Objectif du jour atteint ! 🎉",
    daily_remaining: (n) => `Encore ${n} call${n>1?"s":""} à analyser`,
    daily_count: (c,g) => `${c} / ${g} calls analysés aujourd'hui`,
    // New call
    step_transcript: "Transcript", step_selfeval: "Autoévaluation",
    call_info: "Infos du call", prospect_name: "Nom du prospect", call_date: "Date (ex: 08/06/2026)",
    call_transcript: "Transcript du call", import_txt: "📁 Importer .txt",
    transcript_placeholder: "Colle le transcript ici...\n\nSDR: Bonjour Marc, c'est Julie de Vertuoza...\nPROSPECT: Oui bonjour...",
    words: "mots", est_duration: "min de call",
    next_selfeval: "Suivant — Autoévaluation →",
    selfeval_title: "🙋 Comment tu évalues ton call ?",
    selfeval_sub: "Avant de voir l'analyse du coach, prends 2 minutes pour te noter honnêtement. C'est pour toi — plus tu es lucide, plus le feedback sera utile.",
    feeling_title: "💬 Ton ressenti sur ce call",
    feeling_good: "✅ Ce que tu penses avoir bien fait", feeling_good_ph: "Ex: J'ai bien qualifié la taille de l'entreprise, j'ai utilisé le bon vocabulaire bâtiment...",
    feeling_bad: "⚠️ Ce que tu aurais dû faire différemment", feeling_bad_ph: "Ex: J'ai été trop rapide sur le pitch, je n'ai pas quantifié le problème en euros...",
    feeling_general: "🎯 Ressenti général sur ce call",
    feeling_fire: "En feu", feeling_solid: "Solide", feeling_avg: "Moyen", feeling_frustrating: "Frustrant", feeling_improve: "À améliorer",
    back: "← Retour", launch_analysis: "🚀 Lancer l'analyse du coach",
    autosave_note: "✅ Sauvegarde automatique · Résultats en ~30 secondes",
    // Review
    no_analysis: "Aucune analyse en cours",
    no_analysis_sub: "Lance une nouvelle analyse pour voir les résultats ici.",
    analyze_call: "✍️ Analyser un call",
    showing_last: "Affichage du dernier call analysé —",
    new_btn: "+ Nouveau",
    call_with: "Call avec",
    saved: "✅ Sauvegardé", from_history: "📋 Depuis l'historique", saving: "💾 En cours...",
    coach_name: "Marc", coach_role: "Coach Sales · Vertuoza",
    did_well: "✅ Ce que t'as bien fait", working_on: "🎯 Ce qu'on travaille",
    mirror_title: "Miroir — Toi vs Marc", mirror_sub: "Ta lucidité sur ton propre call",
    luc_score: "Score LUC",
    aligned: "Aligné", overestimated: "Surestimé", underestimated: "Sous-estimé",
    aligned_msg: "Tu te connais", overest_msg: "Angles morts", underest_msg: "Trop modeste",
    biggest_gaps: "🃏 Plus grands écarts",
    excellent_lucidity: "🎯 Excellente lucidité !",
    you: "Toi", marc: "Marc",
    overest_detail: "⚠️ Angle mort — tu te voyais mieux que Marc te voit",
    underest_detail: "💪 Tu te sous-estimais — Marc pense mieux de toi",
    criteria: "critères", marc_speaks: "Marc te parle",
    what_marc_said: "🎙️ Ce que Marc aurait dit", phrases_to_use: "💬 Phrases à utiliser",
    badges_unlocked: "🎖️ Écussons débloqués", keep_going: "Continue comme ça.",
    // History
    my_calls: "Mes calls", reviews_count: "reviews", avg: "de moyenne",
    new_call: "+ Nouveau call", no_saved_review: "Aucune review sauvegardée",
    delete: "🗑️ Supprimer",
    // Objectives
    my_objectives: "🎯 Mes Objectifs Coach",
    objectives_sub: "Générés automatiquement après chaque analyse · Validés au call suivant",
    clear_all: "🗑️ Tout effacer",
    in_progress: "⏳ En cours — À valider au prochain call",
    validated: "✅ Objectifs validés — Comment tu les as atteints",
    failed: "❌ Objectifs ratés — À retenter",
    pending: "En cours", validated_kpi: "Validés", failed_kpi: "Ratés", success_rate: "Taux succès",
    priority_high: "🔴 Haute", priority_medium: "🟡 Moyenne", priority_low: "🟢 Basse",
    phrase_to_use: "💬 Phrase à utiliser", what_to_say: "💬 Ce que tu devais dire",
    validated_on: "✓ Validé le", call_validated: "📋 Call où tu l'as validé",
    coach_analysis: "Analyse du coach :", retry: "Retente cet objectif au prochain call 💪", not_achieved: "Non atteint",
    no_objectives: "Aucun objectif encore",
    no_objectives_sub: "Analyse un call pour recevoir tes premiers objectifs personnalisés du coach IA.",
    // Team
    team_cards: "🏆 Cartes collector de l'équipe", no_members: "Aucun membre pour l'instant.",
    my_card: "Ma carte", team_tab: "L'équipe",
    add_photo: "Ajouter ta photo", change_photo: "Changer la photo",
    photo_url: "URL de ta photo", apply: "✅ Appliquer", cancel: "Annuler",
    // Admin
    admin_view: "⚙️ Vue Admin — Équipe", admin_mode: "Mode Administrateur",
    active_sales: "Sales actifs", total_calls: "Total calls", team_score: "Score équipe", obj_in_progress: "Obj. en cours",
    this_week: "cette sem.",
    section_performance: "Performance par section",
    objectives_in_progress: "⏳ Objectifs en cours",
    history_calls: "📋 Historique des calls", see: "Voir →",
    badges_unlocked_count: "🛡️ Écussons débloqués",
    // Auth
    login: "Connexion", signup: "Créer un compte",
    login_title: "Accès à ton espace", login_sub: "Entre dans l'arène. Tes stats t'attendent.",
    signup_title: "Rejoindre l'équipe", signup_sub: "Crée ton compte et commence à progresser.",
    continue_google: "Continuer avec Google", or_email: "ou avec ton email",
    email_label: "Email", password_label: "Mot de passe",
    enter_arena: "Entrer dans l'arène →", join_team: "Rejoindre l'équipe →", connecting: "⏳ Connexion…",
    restricted_access: "🔒 Accès réservé à l'équipe Sales Vertuoza",
    every_session: "Chaque session est une opportunité de progresser.",
    headline1: "Analyse.", headline2: "Progresse.", headline3: "Domine.",
    hero_desc: "L'environnement d'entraînement des meilleurs Sales Vertuoza. Chaque call analysé, chaque objectif validé, chaque rang atteint.",
    stat_criteria: "Critères analysés", stat_ai: "IAs en parallèle", stat_progress: "Progression/semaine",
  },
  nl: {
    nav_dashboard: "Dashboard", nav_new: "Gesprek analyseren", nav_history: "Mijn gesprekken",
    nav_objectives: "Doelen", nav_team: "Het team", nav_admin: "Beheer",
    nav_analysis: "🎯 Analyse", nav_detail: "🔍 Detail",
    logout: "Uitloggen", today: "vandaag",
    welcome_title: "Je eerste gesprek wacht op je.",
    welcome_sub: "Start je analyse, ontvang je persoonlijke coaching en kom in het teamklassement.",
    welcome_cta: "🚀 Analyseer mijn eerste gesprek",
    score_avg: "Gem. score", sales_role: "Vertuoza Sales", call: "gesprek", calls: "gesprekken", analyzed: "geanalyseerd", analyzed_pl: "geanalyseerd",
    xp_to: "XP tot",
    week: "Deze week", best_score: "Beste score", luc_avg: "Gem. LUC", obj_validated: "Behaalde doelen",
    team_ranking: "Teamklassement", no_calls_yet: "Nog geen gesprekken.",
    recent_form: "Recente vorm",
    next_objectives: "Doelen voor het volgende gesprek",
    see_all_objectives: "Alle doelen bekijken →",
    my_badges: "Mijn badges",
    unlock_badges: "Analyseer gesprekken om je eerste badges te ontgrendelen!",
    daily_done: "Dagdoel bereikt! 🎉",
    daily_remaining: (n) => `Nog ${n} gesprek${n>1?"ken":""} te analyseren`,
    daily_count: (c,g) => `${c} / ${g} gesprekken vandaag geanalyseerd`,
    step_transcript: "Transcript", step_selfeval: "Zelfevaluatie",
    call_info: "Gesprekinfo", prospect_name: "Naam prospect", call_date: "Datum (bv. 08/06/2026)",
    call_transcript: "Transcript van het gesprek", import_txt: "📁 .txt importeren",
    transcript_placeholder: "Plak hier het transcript...\n\nSALES: Hallo Marc, dit is Julie van Vertuoza...\nPROSPECT: Ja hallo...",
    words: "woorden", est_duration: "min gesprek",
    next_selfeval: "Volgende — Zelfevaluatie →",
    selfeval_title: "🙋 Hoe evalueer je je gesprek?",
    selfeval_sub: "Voor je de analyse van de coach ziet, neem 2 minuten om jezelf eerlijk te beoordelen. Dit is voor jou — hoe eerlijker, hoe nuttiger de feedback.",
    feeling_title: "💬 Jouw gevoel over dit gesprek",
    feeling_good: "✅ Wat je denkt goed gedaan te hebben", feeling_good_ph: "Bv: Ik heb de bedrijfsgrootte goed gekwalificeerd, ik gebruikte de juiste bouwvakjargon...",
    feeling_bad: "⚠️ Wat je anders had moeten doen", feeling_bad_ph: "Bv: Ik was te snel met de pitch, ik heb het probleem niet in euro's gekwantificeerd...",
    feeling_general: "🎯 Algemeen gevoel over dit gesprek",
    feeling_fire: "Top vorm", feeling_solid: "Solide", feeling_avg: "Gemiddeld", feeling_frustrating: "Frustrerend", feeling_improve: "Te verbeteren",
    back: "← Terug", launch_analysis: "🚀 Start coachanalyse",
    autosave_note: "✅ Automatisch opgeslagen · Resultaten binnen ~30 sec",
    no_analysis: "Geen actieve analyse",
    no_analysis_sub: "Start een nieuwe analyse om hier resultaten te zien.",
    analyze_call: "✍️ Gesprek analyseren",
    showing_last: "Laatst geanalyseerd gesprek —",
    new_btn: "+ Nieuw",
    call_with: "Gesprek met",
    saved: "✅ Opgeslagen", from_history: "📋 Uit geschiedenis", saving: "💾 Bezig...",
    coach_name: "Marc", coach_role: "Sales Coach · Vertuoza",
    did_well: "✅ Wat je goed deed", working_on: "🎯 Waar we aan werken",
    mirror_title: "Spiegel — Jij vs Marc", mirror_sub: "Jouw zelfinzicht over dit gesprek",
    luc_score: "LUC-score",
    aligned: "Juist", overestimated: "Overschat", underestimated: "Onderschat",
    aligned_msg: "Je kent jezelf", overest_msg: "Blinde vlekken", underest_msg: "Te bescheiden",
    biggest_gaps: "🃏 Grootste verschillen",
    excellent_lucidity: "🎯 Uitstekend zelfinzicht!",
    you: "Jij", marc: "Marc",
    overest_detail: "⚠️ Blinde vlek — je zag jezelf beter dan Marc je ziet",
    underest_detail: "💪 Je onderschatte jezelf — Marc denkt beter over je",
    criteria: "criteria", marc_speaks: "Marc praat tegen je",
    what_marc_said: "🎙️ Wat Marc gezegd zou hebben", phrases_to_use: "💬 Te gebruiken zinnen",
    badges_unlocked: "🎖️ Badges ontgrendeld", keep_going: "Ga zo door.",
    my_calls: "Mijn gesprekken", reviews_count: "reviews", avg: "gemiddeld",
    new_call: "+ Nieuw gesprek", no_saved_review: "Geen opgeslagen review",
    delete: "🗑️ Verwijderen",
    my_objectives: "🎯 Mijn Coachdoelen",
    objectives_sub: "Automatisch gegenereerd na elke analyse · Gevalideerd bij het volgende gesprek",
    clear_all: "🗑️ Alles wissen",
    in_progress: "⏳ Lopend — Te valideren bij volgend gesprek",
    validated: "✅ Behaalde doelen — Hoe je ze bereikte",
    failed: "❌ Niet behaalde doelen — Opnieuw proberen",
    pending: "Lopend", validated_kpi: "Behaald", failed_kpi: "Gemist", success_rate: "Slagingsgraad",
    priority_high: "🔴 Hoog", priority_medium: "🟡 Gemiddeld", priority_low: "🟢 Laag",
    phrase_to_use: "💬 Te gebruiken zin", what_to_say: "💬 Wat je moest zeggen",
    validated_on: "✓ Behaald op", call_validated: "📋 Gesprek waar je het behaalde",
    coach_analysis: "Coachanalyse:", retry: "Probeer dit doel opnieuw bij het volgende gesprek 💪", not_achieved: "Niet behaald",
    no_objectives: "Nog geen doelen",
    no_objectives_sub: "Analyseer een gesprek om je eerste persoonlijke doelen van de AI-coach te ontvangen.",
    team_cards: "🏆 Collectiekaarten van het team", no_members: "Nog geen teamleden.",
    my_card: "Mijn kaart", team_tab: "Het team",
    add_photo: "Foto toevoegen", change_photo: "Foto wijzigen",
    photo_url: "URL van je foto", apply: "✅ Toepassen", cancel: "Annuleren",
    admin_view: "⚙️ Beheerweergave — Team", admin_mode: "Beheerdersmodus",
    active_sales: "Actieve sales", total_calls: "Totaal gesprekken", team_score: "Teamscore", obj_in_progress: "Lopende doelen",
    this_week: "deze week",
    section_performance: "Prestaties per sectie",
    objectives_in_progress: "⏳ Lopende doelen",
    history_calls: "📋 Gespreksgeschiedenis", see: "Bekijk →",
    badges_unlocked_count: "🛡️ Ontgrendelde badges",
    login: "Inloggen", signup: "Account aanmaken",
    login_title: "Toegang tot je ruimte", login_sub: "Stap de arena binnen. Je stats wachten op je.",
    signup_title: "Word lid van het team", signup_sub: "Maak je account aan en begin met groeien.",
    continue_google: "Doorgaan met Google", or_email: "of met je e-mail",
    email_label: "E-mail", password_label: "Wachtwoord",
    enter_arena: "Stap de arena binnen →", join_team: "Word lid van het team →", connecting: "⏳ Verbinden…",
    restricted_access: "🔒 Toegang voorbehouden aan het Vertuoza Sales-team",
    every_session: "Elke sessie is een kans om te groeien.",
    headline1: "Analyseer.", headline2: "Groei.", headline3: "Domineer.",
    hero_desc: "De trainingsomgeving van de beste Vertuoza Sales. Elk geanalyseerd gesprek, elk behaald doel, elk niveau bereikt.",
    stat_criteria: "Geanalyseerde criteria", stat_ai: "AI's parallel", stat_progress: "Groei/week",
  },
};



// ── Système de Séniorité & XP ─────────────────────────────────────────────────
const LEVELS = [
  { name: "Junior",  min: 0,    max: 499,  color: "#10B981", glow: "#10B98150", icon: "🟢", next: "Médior" },
  { name: "Médior",  min: 500,  max: 1499, color: V.blue,    glow: "#003FDA50", icon: "🔵", next: "Senior" },
  { name: "Senior",  min: 1500, max: 2999, color: "#8B5CF6", glow: "#8B5CF650", icon: "🟣", next: "Expert" },
  { name: "Expert",  min: 3000, max: 9999, color: "#FFD700", glow: "#FFD70050", icon: "🟡", next: null },
];

const getLevel = (xp) => LEVELS.find(l => xp >= l.min && xp <= l.max) || LEVELS[0];

const calcXP = (reviews, objectives) => {
  let xp = 0;
  xp += reviews.length * 50; // +50 par call analysé
  xp += objectives.filter(o => o.status === "validated").length * 75; // +75 objectif validé
  xp += reviews.filter(r => (r.globalPct||0) >= 80).length * 60; // +60 score ≥ 80%
  xp += reviews.filter(r => (r.lucScore||0) >= 70).length * 40; // +40 LUC ≥ 70
  // Bonus 3 calls/jour
  const days = {};
  reviews.forEach(r => {
    if (!r.createdAt) return;
    const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
    const k = d.toISOString().slice(0,10);
    days[k] = (days[k]||0)+1;
  });
  xp += Object.values(days).filter(v => v >= 3).length * 100;
  return xp;
};

const calcLUC = (selfScores, coachScores) => {
  const ids = Object.keys(coachScores).filter(id => (selfScores[id]??0) > 0 && (coachScores[id]??0) > 0);
  if (!ids.length) return 0;
  let pts = 0;
  ids.forEach(id => {
    const diff = Math.abs((coachScores[id]||0) - (selfScores[id]||0));
    if (diff === 0) pts += 5;
    else if (diff === 1) pts += (selfScores[id] < coachScores[id] ? 4 : 3);
    else if (diff === 2) pts += (selfScores[id] < coachScores[id] ? 2 : 1);
  });
  return Math.round((pts / (ids.length * 5)) * 100);
};

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
  { id: "elite",         icon: "👑",  name: "Élite Sales",         desc: "Score ≥ 90% sur un call",              condition: (r,o) => r.some(rv=>(rv.globalPct||0)>=90) },
  { id: "sniper",        icon: "🎯",  name: "Sniper",              desc: "Score LUC ≥ 80 sur un call",           condition: (r,o) => r.some(rv=>(rv.lucScore||0)>=80) },
  { id: "oracle",        icon: "🧠",  name: "Oracle",              desc: "15+ critères alignés en un call",      condition: (r,o) => r.some(rv=>(rv.lucAligned||0)>=15) },
  { id: "beat_prof",     icon: "🥊",  name: "Bat le Prof",         desc: "Score LUC ≥ 85 sur un call",           condition: (r,o) => r.some(rv=>(rv.lucScore||0)>=85) },
  { id: "medior",        icon: "🔵",  name: "Médior",              desc: "500 XP atteints",                      condition: (r,o) => calcXP(r,o) >= 500 },
  { id: "senior_badge",  icon: "🟣",  name: "Senior",              desc: "1500 XP atteints",                     condition: (r,o) => calcXP(r,o) >= 1500 },
  { id: "expert_badge",  icon: "🟡",  name: "Expert",              desc: "3000 XP atteints",                     condition: (r,o) => calcXP(r,o) >= 3000 },
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
function DailyCounter({ count, t }) {
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
          {done ? t("daily_done") : t("daily_remaining", DAILY_GOAL - count)}
        </div>
        <div style={{ fontSize: 11, color: V.s5 }}>{t("daily_count", count, DAILY_GOAL)}</div>
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
            <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>🚀 Phrases à utiliser</div>
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
function FifaCard({ name, avg, medal, reviews, allReviews, userId, t }) {
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
  const lucReviews = reviews.filter(r => r.lucScore != null);
  const avgLuc = lucReviews.length ? Math.round(lucReviews.reduce((a,r)=>a+(r.lucScore||0),0)/lucReviews.length) : 0;
  const myXpCard = calcXP(reviews, []);
  const myLevelCard = getLevel(myXpCard);

  const cardStats = [
    { key: "OUV", val: getStat(0) }, { key: "DIS", val: getStat(1) },
    { key: "PIT", val: getStat(2) }, { key: "CLO", val: getStat(3) },
    { key: "LUC", val: avgLuc },
    { key: "XP", val: Math.min(99, Math.round((myXpCard / 3000) * 99)) },
  ];

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
          {[["mine",t("my_card")],["team",t("team_tab")]].map(([id,lbl]) => (
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
                    <div style={{ fontSize: 10, color: T.accent, opacity: 0.7 }}>📷 {t("add_photo")}</div>
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

                {/* Nom + niveau */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "3px", lineHeight: 1, textShadow: `0 0 16px ${T.glow}80`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name.toUpperCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 7, color: T.accent, letterSpacing: "2px", opacity: 0.7, textTransform: "uppercase" }}>Vertuoza · Sales</div>
                    <div style={{ background: `${myLevelCard.color}20`, border: `1px solid ${myLevelCard.color}50`, borderRadius: 10, padding: "1px 6px", fontSize: 7, fontWeight: 800, color: myLevelCard.color, letterSpacing: "0.5px" }}>
                      {myLevelCard.icon} {myLevelCard.name.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Ligne séparatrice néon */}
                <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${T.glow},transparent)`, marginBottom: 8, opacity: 0.6 }}/>

                {/* Stats 3x2 avec LUC et XP */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 8px" }}>
                  {cardStats.map(s => (
                    <div key={s.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 8, color: s.key === "LUC" ? "#8B5CF6" : s.key === "XP" ? "#FFD700" : T.accent, fontWeight: 700, letterSpacing: "0.5px" }}>{s.key}</span>
                        <span style={{ fontSize: 8, fontWeight: 900, color: "#fff" }}>{s.val}</span>
                      </div>
                      <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${s.val}%`, background: s.key === "LUC" ? "#8B5CF6" : s.key === "XP" ? "#FFD700" : T.accent, borderRadius: 2 }}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer pills */}
                <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "center" }}>
                  {[
                    { label: `${totalCalls} calls`, icon: "🎙️" },
                    { label: `LUC ${avgLuc}`, icon: "🧠" },
                    { label: trend > 0 ? `+${trend}%` : trend < 0 ? `${trend}%` : "Stable", icon: trend > 0 ? "↗" : trend < 0 ? "↘" : "→" },
                  ].map(p => (
                    <div key={p.label} style={{ background: `${T.glow}15`, border: `1px solid ${T.glow}30`, borderRadius: 20, padding: "2px 7px", fontSize: 8, color: T.accent, fontWeight: 600, display: "flex", gap: 3, alignItems: "center" }}>
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
              <div style={{ fontSize: 10, color: V.s5, marginBottom: 6, textTransform: "uppercase", letterSpacing: "1px" }}>{t("photo_url")}</div>
              <input type="text" placeholder="https://... (LinkedIn, Slack...)" value={inputVal}
                onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && savePhoto()} autoFocus
                style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: V.white, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}/>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={savePhoto} style={{ flex: 1, background: V.blue, border: "none", borderRadius: 8, color: V.white, fontSize: 12, fontWeight: 700, padding: "7px", cursor: "pointer", fontFamily: "inherit" }}>{t("apply")}</button>
                <button onClick={() => setEditing(false)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: V.s5, fontSize: 12, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit" }}>{t("cancel")}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setInputVal(photoUrl); setEditing(true); }} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, fontSize: 11, padding: "6px 18px", cursor: "pointer", fontFamily: "inherit" }}>
              📷 {photoUrl ? t("change_photo") : t("add_photo")}
            </button>
          )}
        </>)}

        {/* ── TEAM CARDS ── */}
        {activeTab === "team" && (
          <div>
            <div style={{ fontSize: 11, color: V.s5, textAlign: "center", marginBottom: 14 }}>{t("team_cards")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 420 }}>
              {teamCards.map((player, i) => (
                <MiniCard key={player.name} player={player} rank={i}/>
              ))}
              {teamCards.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>{t("no_members")}</div>}
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
  const [dots, setDots] = useState("");
  const [blink, setBlink] = useState(true);

  const phases = [
    { label: "Écoute du call", icon: "📞", color: V.neon, sdrAction: "call",
      messages: ["Hmm… intéressant comme ouverture.", "Je note la façon dont il aborde le prospect…", "Ah, quelque chose à améliorer ici.", "Bonne accroche ! On continue…"] },
    { label: "Analyse comportementale", icon: "🧠", color: "#8B5CF6", sdrAction: "think",
      messages: ["Le ratio parole/écoute… laisse à désirer.", "La qualification du décisionnaire… à revoir.", "Vocabulaire BTP ? Je vérifie…", "Ce passage sur les objections, il faut qu'on en parle."] },
    { label: "Rédaction scripts experts", icon: "🎙️", color: V.orange, sdrAction: "write",
      messages: ["Voici ce que j'aurais dit à sa place…", "Conseil en cours de rédaction…", "Je formule les meilleures pratiques terrain…", "Presque, encore quelques ajustements…"] },
    { label: "Génération des objectifs", icon: "🎯", color: "#10B981", sdrAction: "win",
      messages: ["3 objectifs prioritaires identifiés.", "Je prépare ton plan de progression…", "Les badges sont en cours d'évaluation…", "Dernière ligne droite, courage !"] },
  ];

  useEffect(() => {
    const t = setInterval(() => { setPhase(p => Math.min(p + 1, phases.length - 1)); setMsgIdx(0); }, 9000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % phases[phase].messages.length), 2500);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 800);
    return () => clearInterval(t);
  }, []);

  const C = phases[phase].color;
  const action = phases[phase].sdrAction;
  const progress = ((phase + 1) / phases.length) * 100;

  return (
    <div style={{ minHeight: "65vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "'Gantari',sans-serif" }}>

      {/* ── Illustration SVG SDR + Coach ── */}
      <div style={{ position: "relative", marginBottom: 28, width: 340, height: 200 }}>
        {/* Glow ambiance */}
        <div style={{ position: "absolute", inset: -20, background: `radial-gradient(ellipse at 50% 60%, ${C}20 0%, transparent 70%)`, transition: "background 1s", pointerEvents: "none" }}/>

        <svg width={340} height={200} viewBox="0 0 340 200" style={{ position: "relative", zIndex: 1 }}>

          {/* ══ FOND ══ */}
          {/* Sol */}
          <ellipse cx={170} cy={195} rx={140} ry={8} fill={`${C}15`}/>

          {/* ══ COACH (gauche) ══ */}
          {/* Corps coach */}
          <rect x={30} y={95} width={50} height={75} rx={10} fill="#0D1840"/>
          <rect x={33} y={98} width={44} height={68} rx={8} fill="#001060"/>
          {/* Veste coach */}
          <rect x={30} y={95} width={50} height={40} rx={8} fill="#001880"/>
          {/* Cravate */}
          <rect x={52} y={100} width={6} height={28} rx={3} fill={C} opacity={0.8}/>
          {/* Tête coach */}
          <ellipse cx={55} cy={82} rx={22} ry={24} fill="#D4956A"/>
          {/* Cheveux */}
          <ellipse cx={55} cy={62} rx={22} ry={10} fill="#2D1A0A"/>
          <rect x={33} y={62} width={44} height={12} rx={6} fill="#2D1A0A"/>
          {/* Yeux coach */}
          <ellipse cx={47} cy={80} rx={3.5} ry={4} fill="#1A0A00"/>
          <ellipse cx={63} cy={80} rx={3.5} ry={4} fill="#1A0A00"/>
          <circle cx={48} cy={79} r={1} fill="#fff" opacity={0.6}/>
          <circle cx={64} cy={79} r={1} fill="#fff" opacity={0.6}/>
          {/* Sourcils expressifs selon phase */}
          {phase <= 1 ? <>
            <path d="M44 73 Q47 70 50 73" fill="none" stroke="#2D1A0A" strokeWidth={2}/>
            <path d="M60 73 Q63 70 66 73" fill="none" stroke="#2D1A0A" strokeWidth={2}/>
          </> : <>
            <path d="M44 72 Q47 75 50 72" fill="none" stroke="#2D1A0A" strokeWidth={2}/>
            <path d="M60 72 Q63 75 66 72" fill="none" stroke="#2D1A0A" strokeWidth={2}/>
          </>}
          {/* Bouche coach */}
          {phase >= 2
            ? <path d="M49 90 Q55 95 61 90" fill="none" stroke="#8B4513" strokeWidth={2}/>
            : <path d="M49 88 Q55 92 61 88" fill="none" stroke="#8B4513" strokeWidth={1.5}/>
          }
          {/* Bras coach tendu vers SDR */}
          <path d="M80 115 Q110 100 120 105" fill="none" stroke="#001880" strokeWidth={12} strokeLinecap="round"/>
          <path d="M80 115 Q110 100 120 105" fill="none" stroke="#0D1840" strokeWidth={8} strokeLinecap="round"/>
          {/* Main coach pointant */}
          <ellipse cx={124} cy={104} rx={8} ry={6} fill="#D4956A" transform="rotate(-20 124 104)"/>
          {/* Doigt pointé */}
          <rect x={128} y={99} width={14} height={5} rx={2.5} fill="#D4956A" transform="rotate(-15 128 99)"/>
          {/* Badge COACH */}
          <rect x={32} y={125} width={36} height={14} rx={4} fill={C} opacity={0.9}/>
          <text x={50} y={135} textAnchor="middle" fill="#000" fontSize={7} fontWeight={900}>COACH</text>
          {/* Clipboard */}
          <rect x={20} y={100} width={24} height={32} rx={3} fill="#fff" opacity={0.9}/>
          <rect x={22} y={104} width={20} height={2} rx={1} fill="#ccc"/>
          <rect x={22} y={108} width={15} height={2} rx={1} fill="#ccc"/>
          <rect x={22} y={112} width={18} height={2} rx={1} fill={C} opacity={0.8}/>
          <rect x={22} y={116} width={12} height={2} rx={1} fill="#ccc"/>
          <rect x={28} y={96} width={8} height={6} rx={2} fill="#888"/>

          {/* ══ SDR (droite) ══ */}
          {/* Corps SDR */}
          <rect x={220} y={90} width={56} height={80} rx={12} fill="#001640"/>
          <rect x={224} y={94} width={48} height={72} rx={9} fill="#002060"/>
          {/* Chemise SDR */}
          <rect x={220} y={90} width={56} height={45} rx={10} fill="#003080"/>
          {/* Cravate SDR */}
          <rect x={245} y={95} width={7} height={32} rx={3} fill={V.orange} opacity={0.9}/>
          {/* Tête SDR */}
          <ellipse cx={248} cy={74} rx={24} ry={26} fill="#C68642"/>
          {/* Cheveux SDR */}
          <ellipse cx={248} cy={52} rx={24} ry={11} fill="#1A0A00"/>
          <rect x={224} y={52} width={48} height={14} rx={7} fill="#1A0A00"/>
          {/* Yeux SDR expressifs */}
          <ellipse cx={239} cy={72} rx={4} ry={4.5} fill="#1A0A00"/>
          <ellipse cx={257} cy={72} rx={4} ry={4.5} fill="#1A0A00"/>
          <circle cx={240} cy={71} r={1.2} fill="#fff" opacity={0.7}/>
          <circle cx={258} cy={71} r={1.2} fill="#fff" opacity={0.7}/>
          {/* Expression SDR selon action */}
          {action === "win"
            ? <path d="M241 84 Q248 91 255 84" fill="none" stroke="#8B4513" strokeWidth={2.5}/>
            : <path d="M241 83 Q248 87 255 83" fill="none" stroke="#8B4513" strokeWidth={2}/>
          }
          {/* Oreillette SDR */}
          <circle cx={272} cy={72} r={7} fill="#1A1A3A" stroke={C} strokeWidth={1.5}/>
          <circle cx={272} cy={72} r={3} fill={C} opacity={blink ? 0.9 : 0.3} style={{ transition: "opacity .3s" }}/>
          <path d="M279 72 Q288 65 290 55" fill="none" stroke={C} strokeWidth={1.5} opacity={0.6}/>
          {/* Fil oreillette */}
          <path d="M272 79 Q272 88 265 92" fill="none" stroke="#333" strokeWidth={1.5}/>

          {/* ══ ACTION selon phase ══ */}
          {action === "call" && <>
            {/* Ondes sonores autour de l'oreillette */}
            {[14,20,27].map((r,i) => (
              <circle key={i} cx={272} cy={72} r={r} fill="none" stroke={C} strokeWidth={1}
                opacity={blink ? 0.5 - i*0.12 : 0.2 - i*0.05} style={{ transition: "opacity .4s" }}/>
            ))}
            {/* Téléphone dans la main */}
            <rect x={205} y={108} width={24} height={40} rx={5} fill="#0D0D1F" stroke={C} strokeWidth={1.5}/>
            <rect x={208} y={113} width={18} height={28} rx={3} fill={`${C}20`}/>
            <text x={217} y={131} textAnchor="middle" fontSize={10}>📞</text>
          </>}

          {action === "think" && <>
            {/* Bulle de pensée */}
            <circle cx={285} cy={45} r={3} fill={C} opacity={0.5}/>
            <circle cx={293} cy={35} r={5} fill={C} opacity={0.6}/>
            <ellipse cx={305} cy={22} rx={18} ry={13} fill="#0D1840" stroke={C} strokeWidth={1.5}/>
            <text x={305} y={26} textAnchor="middle" fill={C} fontSize={12}>🤔</text>
            {/* Graphique dans les mains */}
            <rect x={228} y={120} width={32} height={22} rx={4} fill="#fff" opacity={0.9}/>
            <rect x={231} y={136} width={4} height={4} rx={1} fill={V.orange}/>
            <rect x={237} y={130} width={4} height={10} rx={1} fill={C}/>
            <rect x={243} y={126} width={4} height={14} rx={1} fill="#10B981"/>
            <rect x={249} y={132} width={4} height={8} rx={1} fill="#8B5CF6}"/>
          </>}

          {action === "write" && <>
            {/* Stylo dans la main */}
            <rect x={210} y={118} width={30} height={6} rx={3} fill="#fff" opacity={0.9}/>
            <polygon points="240,118 246,121 240,124" fill={V.orange}/>
            {/* Lignes d'écriture */}
            {[0,1,2].map(i => (
              <rect key={i} x={213} y={128+i*6} width={i===1?18:22} height={2} rx={1} fill={C} opacity={0.6}/>
            ))}
            {/* Bulle discours */}
            <path d={`M275 50 Q295 40 305 48 Q315 56 305 64 Q295 72 280 65 Q265 72 275 50`} fill="#0D1840" stroke={C} strokeWidth={1.5}/>
            <text x={290} y={59} textAnchor="middle" fill={C} fontSize={9} fontWeight={700}>Script</text>
          </>}

          {action === "win" && <>
            {/* Trophy */}
            <text x={248} y={45} textAnchor="middle" fontSize={20} style={{ animation: "bounce .6s ease-in-out infinite alternate" }}>🏆</text>
            {/* Confetti */}
            {[[170,30,V.neon],[190,20,V.orange],[210,35,"#FFD700"],[230,25,"#10B981"],[165,50,"#8B5CF6"]].map(([cx,cy,fill],i) => (
              <rect key={i} x={cx} y={cy} width={6} height={6} rx={1} fill={fill} opacity={0.8}
                transform={`rotate(${i*35} ${cx+3} ${cy+3})`}/>
            ))}
            {/* Checkmark */}
            <circle cx={168} cy={110} r={14} fill="#10B981" opacity={0.2}/>
            <path d="M161 110 L166 116 L176 104" fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinecap="round"/>
          </>}

          {/* ══ BULLE DIALOGUE COACH → SDR ══ */}
          <path d="M85 75 Q120 55 160 62 Q185 65 185 78 Q185 92 160 95 Q140 98 115 90 Q90 95 85 75" fill="#0D1840" stroke={C} strokeWidth={1.5} opacity={0.95}/>
          <text x={135} y={75} textAnchor="middle" fill={V.white} fontSize={8} fontWeight={600}>
            {phases[phase].messages[msgIdx].length > 28
              ? phases[phase].messages[msgIdx].slice(0,28) + "…"
              : phases[phase].messages[msgIdx]}
          </text>
          <text x={135} y={86} textAnchor="middle" fill={C} fontSize={8} opacity={0.7}>
            {phases[phase].icon} {phases[phase].label}
          </text>

          {/* Ligne entre les deux personnages */}
          <line x1={83} y1={140} x2={220} y2={140} stroke={`${C}20`} strokeWidth={1} strokeDasharray="4 4"/>

        </svg>
      </div>

      {/* Message principal */}
      <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C}30`, borderRadius: 16, padding: "14px 24px", marginBottom: 20, maxWidth: 380, textAlign: "center", transition: "border-color .5s" }}>
        <div style={{ fontSize: 15, color: V.white, fontWeight: 600, lineHeight: 1.5 }}>
          <span style={{ marginRight: 8 }}>{phases[phase].icon}</span>
          {phases[phase].messages[msgIdx]}<span style={{ color: C }}>{dots}</span>
        </div>
      </div>

      {/* Étapes */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: i <= phase ? `${p.color}20` : "rgba(255,255,255,0.05)", border: `2px solid ${i <= phase ? p.color : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all .5s" }}>
              {i < phase ? "✓" : p.icon}
            </div>
            {i < phases.length - 1 && <div style={{ width: 24, height: 2, background: i < phase ? C : "rgba(255,255,255,0.1)", borderRadius: 2, transition: "background .5s" }}/>}
          </div>
        ))}
      </div>

      {/* Barre globale */}
      <div style={{ width: 320, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: C, borderRadius: 10, transition: "width 1s ease, background .8s" }}/>
      </div>

      {/* Motivation */}
      <div style={{ fontSize: 12, color: V.s5, fontStyle: "italic", textAlign: "center", maxWidth: 320 }}>
        {["💪 Chaque call analysé te rapproche du rang Gold","🔥 Les meilleurs SDR ne s'arrêtent jamais d'apprendre","🎯 Ton coach IA travaille pour toi en ce moment","⚡ Patience — la précision prend du temps","🏆 Bientôt un nouvel écusson peut-être ?"][Math.floor(Date.now() / 5000) % 5]}
      </div>

      <style>{`
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}

// ── XP Level Floating Widget ─────────────────────────────────────────────────
function XPWidget({ xp, reviews, objectives }) {
  const [expanded, setExpanded] = useState(false);
  const [prevXp, setPrevXp] = useState(xp);
  const [gainAnim, setGainAnim] = useState(null);

  const level = getLevel(xp);
  const nextLevel = LEVELS.find(l => l.min > xp);
  const progress = nextLevel
    ? ((xp - level.min) / (level.max - level.min + 1)) * 100
    : 100;
  const isNearNext = nextLevel && (nextLevel.min - xp) <= 100;
  const circumference = 2 * Math.PI * 22;

  useEffect(() => {
    if (xp > prevXp) {
      setGainAnim(`+${xp - prevXp} XP`);
      setTimeout(() => setGainAnim(null), 2000);
    }
    setPrevXp(xp);
  }, [xp]);

  const xpBreakdown = [
    { label: "Calls analysés", value: reviews.length, xp: reviews.length * 50, icon: "🎙️" },
    { label: "Objectifs validés", value: objectives.filter(o=>o.status==="validated").length, xp: objectives.filter(o=>o.status==="validated").length * 75, icon: "✅" },
    { label: "Scores ≥ 80%", value: reviews.filter(r=>(r.globalPct||0)>=80).length, xp: reviews.filter(r=>(r.globalPct||0)>=80).length * 60, icon: "⭐" },
    { label: "LUC ≥ 70", value: reviews.filter(r=>(r.lucScore||0)>=70).length, xp: reviews.filter(r=>(r.lucScore||0)>=70).length * 40, icon: "🧠" },
  ];

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, fontFamily: "'Gantari',sans-serif" }}>
      {/* XP gain animation */}
      {gainAnim && (
        <div style={{ position: "absolute", bottom: 80, right: 0, fontSize: 14, fontWeight: 800, color: level.color, animation: "floatUp 2s ease forwards", pointerEvents: "none", whiteSpace: "nowrap" }}>
          {gainAnim}
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div style={{ position: "absolute", bottom: 80, right: 0, width: 280, background: V.s1, border: `1px solid ${level.color}40`, borderRadius: 16, padding: 20, boxShadow: `0 8px 40px ${level.color}20`, animation: "fadeInUp .2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 24 }}>{level.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: level.color }}>{level.name}</div>
              <div style={{ fontSize: 11, color: V.s5 }}>{xp} XP total</div>
            </div>
            {nextLevel && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 11, color: V.s5 }}>Prochain</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: nextLevel.color }}>{nextLevel.name}</div>
                <div style={{ fontSize: 10, color: V.s4 }}>{nextLevel.min - xp} XP restants</div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: level.color, borderRadius: 10, transition: "width .5s ease", boxShadow: `0 0 8px ${level.color}` }}/>
          </div>

          {/* XP breakdown */}
          <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Sources d'XP</div>
          {xpBreakdown.map(b => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12 }}>{b.icon}</span>
              <span style={{ fontSize: 11, color: V.s5, flex: 1 }}>{b.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: level.color }}>+{b.xp} XP</span>
            </div>
          ))}

          {isNearNext && nextLevel && (
            <div style={{ marginTop: 12, background: `${V.orange}15`, border: `1px solid ${V.orange}30`, borderRadius: 8, padding: "8px 12px", fontSize: 11, color: V.orange, fontWeight: 600, textAlign: "center" }}>
              🔥 Plus que {nextLevel.min - xp} XP pour devenir {nextLevel.name} !
            </div>
          )}
        </div>
      )}

      {/* Main button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: 64, height: 64, borderRadius: "50%", background: V.s1, border: `2px solid ${level.color}${isNearNext ? "" : "60"}`, cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${isNearNext ? "24px" : "12px"} ${level.glow}`, animation: isNearNext ? "pulse 1.5s ease-in-out infinite" : "none", transition: "box-shadow .3s", padding: 0 }}
      >
        {/* Circular progress */}
        <svg width={64} height={64} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx={32} cy={32} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4}/>
          <circle cx={32} cy={32} r={22} fill="none" stroke={level.color} strokeWidth={4}
            strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress/100)}
            style={{ transition: "stroke-dashoffset .5s ease" }}/>
        </svg>
        {/* Level icon */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 18, lineHeight: 1 }}>{level.icon}</div>
          <div style={{ fontSize: 8, fontWeight: 800, color: level.color, letterSpacing: "0.5px" }}>{level.name.toUpperCase().slice(0,3)}</div>
        </div>
      </button>
    </div>
  );
}

// ── App principale ────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("vertuoza_lang") || "fr");
  const t = (key, ...args) => {
    const val = TR[lang]?.[key] ?? TR.fr[key] ?? key;
    return typeof val === "function" ? val(...args) : val;
  };
  const changeLang = (l) => { setLang(l); localStorage.setItem("vertuoza_lang", l); };

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(""); const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [reviews, setReviews] = useState([]); const [allReviews, setAllReviews] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [allObjectives, setAllObjectives] = useState([]);
  const [selObj, setSelObj] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedSdr, setSelectedSdr] = useState(null); // for admin view
  const [saveStatus, setSaveStatus] = useState(""); const [reviewTab, setReviewTab] = useState("review");

  // Autoévaluation SDR
  const [selfScores, setSelfScores] = useState({});
  const [selfComment, setSelfComment] = useState({ strengths: "", weaknesses: "", feeling: "" });
  const [selfDone, setSelfDone] = useState(false);
  const [newStep, setNewStep] = useState("transcript"); // transcript | selfeval
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

  // Vérifier si admin
  useEffect(() => {
    if (!user) return;
    const checkAdmin = async () => {
      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        setIsAdmin(adminDoc.exists());
      } catch { setIsAdmin(false); }
    };
    checkAdmin();
  }, [user]);
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

  useEffect(() => {
    if (!user || !isAdmin) return;
    const q = query(collection(db, "objectives"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setAllObjectives(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user, isAdmin]);

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

  const handleGoogleAuth = async () => {
    setAuthBusy(true); setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") setAuthError(e.message);
    }
    setAuthBusy(false);
  };

  // Save automatique après analyse
  const autoSave = async (r1, r2, r3, pct, selfAnalysisComment) => {
    if (!user) return;
    const lucScore = selfDone ? calcLUC(selfScores, r1.scores || {}) : null;
    const lucAligned = selfDone ? Object.keys(r1.scores||{}).filter(id => r1.scores[id] === (selfScores[id]||0)).length : null;
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
        selfScores: selfDone ? selfScores : null,
        selfComment: selfDone ? selfComment : null,
        selfAnalysisComment: selfAnalysisComment || null,
        lucScore, lucAligned,
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
        await updateDoc(doc(db, "objectives", o.id), {
          status: validated ? "validated" : "failed",
          evaluatedAt: new Date(),
          evaluatedScore: criterionScore,
        });
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
    const r = reviews.find(r => r.id === id) || allReviews.find(r => r.id === id);
    if (!r) return;
    // Seul le propriétaire ou un admin peut supprimer
    if (r.userId !== user?.uid && !isAdmin) return;
    await deleteDoc(doc(db, "reviews", id));
    if (page === "detail") setPage("history");
  };

  const clearAllObjectives = async (targetUserId) => {
    // S'assurer que targetUserId est bien un string UID, pas un event
    const uid = (typeof targetUserId === "string" && targetUserId.length > 5) ? targetUserId : null;
    if (!window.confirm("Supprimer tous les objectifs ?")) return;
    try {
      let snap;
      if (uid) {
        snap = await getDocs(query(collection(db, "objectives"), where("userId", "==", uid)));
      } else {
        snap = await getDocs(collection(db, "objectives"));
      }
      console.log("Objectifs à supprimer:", snap.docs.length);
      for (const d of snap.docs) await deleteDoc(doc(db, "objectives", d.id));
    } catch (e) { console.error("Erreur:", e); alert("Erreur : " + e.message); }
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setPage("review"); setReviewTab("mirror");
    setScores({}); setJustifications({}); setExpertScripts({}); setLevelUp({}); setGlobalComment("");

    const feelingMap = { fire: "En feu / motivé", solid: "Solide / satisfait", avg: "Moyen / mitigé", frustrating: "Frustrant", improve: "À améliorer / pas confiant" };
    const selfEvalContext = selfDone && Object.keys(selfScores).length > 0
      ? `\n\nAUTOÉVALUATION DU SDR (ses propres notes) :\n${JSON.stringify(selfScores)}\n\nCe qu'il pense avoir bien fait : "${selfComment.strengths}"\nCe qu'il pense avoir raté : "${selfComment.weaknesses}"\nRessentis général : "${feelingMap[selfComment.feeling] || selfComment.feeling}"`
      : "";

    const langInstruction = lang === "nl"
      ? "\n\nIMPORTANT : Réponds entièrement en NÉERLANDAIS (Dutch/Vlaams). Tous les textes (justifications, commentaires, scripts, objectifs) doivent être en néerlandais, naturel et professionnel, adapté au secteur de la construction belge (bouwsector). Les clés JSON restent en anglais/français comme spécifié, seules les VALEURS texte sont en néerlandais."
      : "";

    const p1 = `Tu es Marc, coach commercial senior chez Vertuoza avec 12 ans d'expérience dans la vente terrain BTP. Tu as toi-même été SDR, manager, puis directeur commercial. Tu analyses des calls de tes SDRs comme un mentor qui connaît chaque artisan du secteur par cœur.

Ton style : direct, humain, jamais condescendant. Tu parles comme un vrai coach — tu cites des moments précis du call, tu utilises le "tu", tu vas à l'essentiel. Pas de jargon corporate, pas de bullet points vides. Quand c'est bien, tu le dis franchement. Quand c'est raté, tu expliques exactement pourquoi avec des exemples concrets tirés du transcript.

Tu connais Vertuoza sur le bout des doigts : logiciel de gestion tout-en-un pour les entreprises du bâtiment (devis, facturation, planning chantier, RH, comptabilité). Tu sais qu'un électricien de 8 personnes n'a pas les mêmes douleurs qu'un maçon de 25, et tu adaptes toujours tes retours au contexte du prospect.

Retourne UNIQUEMENT du JSON valide sans markdown :
{
  "scores": {"tone":2,"rapport":2,"rhythm":2,"opening":2,"flow":2,"talkratio":2,"structure":2,"tools":2,"decision":2,"timing":2,"quantify":2,"objections":2,"sector":2,"trade":2,"vocab":2,"cases":2,"benefits":2,"control":2,"commitment":2,"energy":2},
  "justifications": {
    "tone": "Commentaire direct et humain sur CE qui s'est passé. Cite un moment précis du transcript si possible. Parle au SDR comme un coach parlerait à son joueur — 'Là tu as fait X, c'est bien parce que... / le problème c'est que...' Max 3 phrases percutantes.",
    "rapport": "...", "rhythm": "...", "opening": "...", "flow": "...", "talkratio": "...",
    "structure": "...", "tools": "...", "decision": "...", "timing": "...", "quantify": "...",
    "objections": "...", "sector": "...", "trade": "...", "vocab": "...", "cases": "...",
    "benefits": "...", "control": "...", "commitment": "...", "energy": "..."
  },
  "globalComment": "Verdict coach en 4-5 phrases — comme si tu parlais à ton SDR après le call. Commence par un point fort sincère, puis l'angle mort principal, puis ce sur quoi tu vas travailler ensemble. Ton humain, pas corporate.",
  "globalStrengths": ["Force concrète observée dans ce call", "Force 2", "Force 3"],
  "globalImprovements": ["Ce qu'on travaille en priorité", "Axe 2", "Axe 3"],
  "selfAnalysisComment": "Si une autoévaluation SDR est fournie : compare les notes SDR vs tes notes. Dis-lui où il se voit trop bien (angles morts), où il se sous-estime (manque de confiance), et où il est lucide. Parle-lui directement — 'Tu t'es donné 4 sur le closing alors que...' / 'Par contre tu avais raison de noter 2 sur...' Si pas d'autoéval, retourne null."
}
Scores : 1=absent, 2=insuffisant, 3=correct, 4=maîtrisé. Exigeant mais juste.${langInstruction}`;

    const p2 = `Tu es Marc, le même coach. Pour chaque critère, écris exactement ce que tu aurais dit à la place du SDR dans CE call précis. Pas un script générique — une vraie phrase ancrée dans le contexte du prospect, son métier, ses douleurs identifiées dans le transcript.

Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":"...","rapport":"...","rhythm":"...","opening":"...","flow":"...","talkratio":"...","structure":"...","tools":"...","decision":"...","timing":"...","quantify":"...","objections":"...","sector":"...","trade":"...","vocab":"...","cases":"...","benefits":"...","control":"...","commitment":"...","energy":"..."}

1-3 phrases max. Naturel, humain, professionnel. Utilise le prénom du prospect si identifiable. Vocabulaire BTP concret.${langInstruction}`;

    const p3 = `Tu es Marc, le coach. Pour chaque critère, donne une explication courte de ce qu'il faut changer + 2-3 phrases types à réutiliser. Les phrases doivent sonner comme de vraies phrases de call — pas des templates robotiques.

Retourne UNIQUEMENT du JSON valide sans markdown :
{"tone":{"tip":"Ce qu'il faut concrètement changer — 1 phrase directe.","scripts":["Phrase naturelle 1","Phrase naturelle 2"]},"rapport":{"tip":"...","scripts":["...","..."]},"rhythm":{"tip":"...","scripts":["...","..."]},"opening":{"tip":"...","scripts":["...","...","..."]},"flow":{"tip":"...","scripts":["...","..."]},"talkratio":{"tip":"...","scripts":["...","..."]},"structure":{"tip":"...","scripts":["...","...","..."]},"tools":{"tip":"...","scripts":["...","...","..."]},"decision":{"tip":"...","scripts":["...","..."]},"timing":{"tip":"...","scripts":["...","...","..."]},"quantify":{"tip":"...","scripts":["...","...","..."]},"objections":{"tip":"...","scripts":["...","...","..."]},"sector":{"tip":"...","scripts":["...","..."]},"trade":{"tip":"...","scripts":["...","..."]},"vocab":{"tip":"...","scripts":["...","..."]},"cases":{"tip":"...","scripts":["...","...","..."]},"benefits":{"tip":"...","scripts":["...","...","..."]},"control":{"tip":"...","scripts":["...","..."]},"commitment":{"tip":"...","scripts":["...","...","..."]},"energy":{"tip":"...","scripts":["...","..."]}}${langInstruction}`;

    const p4 = `Tu es Marc, le coach. Génère 3 objectifs très précis pour le prochain call — basés sur les 3 plus gros points faibles. Chaque objectif doit être mesurable et formulé comme une mission concrète, pas un conseil vague.

Retourne UNIQUEMENT du JSON valide sans markdown :
[{"title":"Mission courte (max 6 mots)","description":"Ce que le SDR doit faire différemment — formulé comme une instruction précise de coach. 1-2 phrases max.","criterionId":"ID parmi: tone,rapport,rhythm,opening,flow,talkratio,structure,tools,decision,timing,quantify,objections,sector,trade,vocab,cases,benefits,control,commitment,energy","criterionLabel":"Nom lisible","priority":"high|medium|low","example":"Phrase exacte à prononcer dans le prochain call"}]
3 objectifs max. Ultra-concrets. Pas de généralités.${langInstruction}`;

    try {
      const [r1, r2, r3, r4] = await Promise.all([
        callAPI(p1, `Transcript du call :\n\n${transcript}${selfEvalContext}`, 5000),
        callAPI(p2, `Transcript du call :\n\n${transcript}`, 4000),
        callAPI(p3, `Transcript du call :\n\n${transcript}`, 5000),
        callAPI(p4, `Transcript du call :\n\n${transcript}`, 3000),
      ]);
      const pct = calcPct(r1.scores || {});
      setScores(r1.scores || {}); setJustifications(r1.justifications || {});
      setGlobalComment(r1.globalComment || "");
      setGlobalStrengths(r1.globalStrengths || []);
      setGlobalImprovements(r1.globalImprovements || []);
      setExpertScripts(r2 || {}); setLevelUp(r3 || {});
      await autoSave(r1, r2, r3, pct, r1.selfAnalysisComment);
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
  const myXP = calcXP(reviews, objectives);
  const myLevel = getLevel(myXP);
  const pendingObjectives = objectives.filter(o => o.status === "pending");
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
    <div style={{ minHeight: "100vh", background: V.darkBlue, fontFamily: "'Gantari',sans-serif", display: "flex", overflow: "hidden", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gantari:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        ${gStyles}
        @keyframes floatUp { from { transform: translateY(100vh); opacity: 0; } to { transform: translateY(-20px); opacity: 0.6; } }
        @keyframes scanline { 0% { top: -10%; } 100% { top: 110%; } }
        @keyframes glitch { 0%,100% { clip-path: inset(0 0 98% 0); } 20% { clip-path: inset(33% 0 56% 0); } 40% { clip-path: inset(70% 0 10% 0); } 60% { clip-path: inset(15% 0 75% 0); } 80% { clip-path: inset(55% 0 35% 0); } }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes borderGlow { 0%,100% { border-color: ${V.neon}40; box-shadow: 0 0 20px ${V.neon}10; } 50% { border-color: ${V.neon}80; box-shadow: 0 0 40px ${V.neon}30; } }
      `}</style>

      {/* Language switcher */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", border: `1px solid ${V.border}`, borderRadius: 20, padding: 3 }}>
        {["fr","nl"].map(l => (
          <button key={l} onClick={() => changeLang(l)} style={{ background: lang === l ? V.blue : "transparent", border: "none", borderRadius: 16, color: lang === l ? V.white : V.s5, fontWeight: 700, fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{l.toUpperCase()}</button>
        ))}
      </div>

      {/* ── FOND GAUCHE — Univers immersif ── */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 64px", overflow: "hidden" }}>

        {/* Grille tech en fond */}
        <svg style={{ position: "absolute", inset: 0, opacity: 0.04 }} width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={V.neon} strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>

        {/* Scanline animée */}
        <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, transparent, ${V.neon}40, transparent)`, animation: "scanline 4s linear infinite", zIndex: 1, pointerEvents: "none" }}/>

        {/* Particules flottantes */}
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ position: "absolute", left: `${10 + i * 12}%`, bottom: "-20px", width: `${4 + i % 3 * 3}px`, height: `${4 + i % 3 * 3}px`, borderRadius: "50%", background: i % 2 === 0 ? V.neon : V.orange, animation: `floatUp ${6 + i * 1.5}s ease-in infinite`, animationDelay: `${i * 0.8}s`, opacity: 0.5 }}/>
        ))}

        {/* Cercles décoratifs */}
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", border: `1px solid ${V.neon}15`, pointerEvents: "none" }}/>
        <div style={{ position: "absolute", top: -50, right: -50, width: 250, height: 250, borderRadius: "50%", border: `1px solid ${V.neon}10`, pointerEvents: "none" }}/>
        <div style={{ position: "absolute", bottom: -120, left: -80, width: 350, height: 350, borderRadius: "50%", border: `1px solid ${V.blue}20`, pointerEvents: "none" }}/>

        {/* Logo + titre */}
        <div style={{ position: "relative", zIndex: 2, animation: "fadeInUp .8s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: V.blue, border: `2px solid ${V.neon}50`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 24px ${V.neon}30`, padding: 10 }}>
                <svg viewBox="0 0 997.25 837.77" style={{ width: "100%", height: "100%", filter: `brightness(0) saturate(100%) invert(93%) sepia(61%) saturate(400%) hue-rotate(130deg) brightness(105%)` }}>
                  <path fillRule="evenodd" d="M601.88,792.79H411.19a62.11,62.11,0,0,1-62.11-62.11h0a62.11,62.11,0,0,1,62.11-62.11H601.88A62.11,62.11,0,0,1,664,730.68h0A62.11,62.11,0,0,1,601.88,792.79ZM578.62,523.13h0A62.11,62.11,0,0,0,516.51,461H320.82a62.11,62.11,0,0,0-62.11,62.11h0a62.11,62.11,0,0,0,62.11,62.11H516.51A62.11,62.11,0,0,0,578.62,523.13Zm182,0h0A62.12,62.12,0,0,0,698.55,461H667.44a62.11,62.11,0,0,0-62.11,62.11h0a62.11,62.11,0,0,0,62.11,62.11h31.11A62.12,62.12,0,0,0,760.67,523.13ZM870.4,315.18h0a62.12,62.12,0,0,0-62.11-62.12h-315a62.12,62.12,0,0,0-62.11,62.12h0a62.11,62.11,0,0,0,62.11,62.11h315A62.11,62.11,0,0,0,870.4,315.18Zm-466.38,0h0a62.11,62.11,0,0,0-62.11-62.12H210.85a62.12,62.12,0,0,0-62.12,62.12h0a62.12,62.12,0,0,0,62.12,62.11H341.91A62.11,62.11,0,0,0,404,315.18ZM637.26,107h0a62.1,62.1,0,0,0-62.11-62.11H107A62.11,62.11,0,0,0,44.91,107h0A62.11,62.11,0,0,0,107,169.1H575.15A62.11,62.11,0,0,0,637.26,107Zm315,.11h0A62.11,62.11,0,0,0,890.14,45H726.63a62.11,62.11,0,0,0-62.11,62.11h0a62.12,62.12,0,0,0,62.11,62.12H890.14A62.12,62.12,0,0,0,952.25,107.1Z"/>
                </svg>
              </div>
            <div>
              <div style={{ fontSize: 13, color: V.neon, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", marginBottom: 2 }}>Vertuoza</div>
              <div style={{ fontSize: 11, color: V.s4, letterSpacing: "2px", textTransform: "uppercase" }}>Sales Performance Platform</div>
            </div>
          </div>

          {/* Headline principale */}
          <div style={{ fontSize: 48, fontWeight: 900, color: V.white, lineHeight: 1.1, letterSpacing: "-2px", marginBottom: 20 }}>
            {t("headline1")}<br/>
            <span style={{ color: V.neon }}>{t("headline2")}</span><br/>
            <span style={{ color: V.orange }}>{t("headline3")}</span>
          </div>

          <div style={{ fontSize: 16, color: V.s5, lineHeight: 1.7, maxWidth: 400, marginBottom: 48 }}>
            {t("hero_desc")}
          </div>

          {/* Stats live */}
          <div style={{ display: "flex", gap: 32, marginBottom: 48 }}>
            {[
              { value: "20", label: t("stat_criteria"), color: V.neon },
              { value: "4", label: t("stat_ai"), color: V.orange },
              { value: "3×", label: t("stat_progress"), color: "#10B981" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 32, fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: V.s4, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Features pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 36 }}>
            {["🎯 Coach IA personnalisé", "🛡️ Badges & progression", "🃏 Carte SDR collector", "📊 Dashboard temps réel", "🏆 Leaderboard équipe", "🎬 Cinématique analyse"].map(f => (
              <div key={f} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: V.s5 }}>{f}</div>
            ))}
          </div>
        </div>

        {/* Ticker en bas */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: `${V.s1}CC`, borderTop: `1px solid ${V.border}`, overflow: "hidden", display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 0, animation: "ticker 20s linear infinite", whiteSpace: "nowrap" }}>
            {[...Array(2)].map((_, j) => (
              <span key={j} style={{ display: "inline-flex", gap: 40, paddingRight: 40 }}>
                {["🎙️ Call analysé : +74% · Objectif CLOSING validé", "🏆 Nouveau rang GOLD débloqué", "⚡ 3 calls analysés aujourd'hui", "🛡️ Écusson VÉTÉRAN débloqué", "📈 Score moyen équipe : 78%", "🔥 Streak de 5 calls en progression"].map((t, i) => (
                  <span key={i} style={{ fontSize: 11, color: V.s5 }}>
                    <span style={{ color: V.neon, marginRight: 8 }}>◆</span>{t}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── DROITE — Formulaire ── */}
      <div style={{ width: 440, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 48px", background: "rgba(0,0,0,0.3)", borderLeft: `1px solid ${V.border}`, position: "relative", zIndex: 2 }}>
        <div style={{ width: "100%", animation: "fadeInUp .8s ease .2s both" }}>

          {/* Header form */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: V.white, marginBottom: 6 }}>
              {authMode === "login" ? t("login_title") : t("signup_title")}
            </div>
            <div style={{ fontSize: 13, color: V.s5 }}>
              {authMode === "login" ? t("login_sub") : t("signup_sub")}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 4 }}>
            {[["login",t("login")],["signup",t("signup")]].map(([m,l]) => (
              <button key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, padding: "9px", background: authMode === m ? V.blue : "transparent", border: "none", borderRadius: 8, color: authMode === m ? V.white : V.s5, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{l}</button>
            ))}
          </div>

          {/* Google first */}
          <button onClick={handleGoogleAuth} disabled={authBusy}
            style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, color: V.white, fontSize: 14, fontWeight: 600, padding: "13px", cursor: authBusy ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20, transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          >
            <svg width={18} height={18} viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {t("continue_google")}
          </button>

          {/* Séparateur */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/>
            <span style={{ fontSize: 11, color: V.s4 }}>{t("or_email")}</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/>
          </div>

          {/* Champs */}
          <div style={{ marginBottom: 12 }}>
            <span style={sLabel}>Email</span>
            <input type="email" placeholder="julie@vertuoza.com" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, animation: "borderGlow 3s ease-in-out infinite" }}/>
          </div>
          <div style={{ marginBottom: 20 }}>
            <span style={sLabel}>Mot de passe</span>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} style={inputStyle}/>
          </div>

          {authError && <div style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 10, padding: "10px 14px", color: "#EF4444", fontSize: 12, marginBottom: 16 }}>{authError}</div>}

          <button onClick={handleAuth} disabled={authBusy} style={{ width: "100%", background: authBusy ? "rgba(255,255,255,0.1)" : V.blue, border: "none", borderRadius: 12, color: V.white, fontSize: 14, fontWeight: 700, padding: "14px", cursor: authBusy ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .2s", boxShadow: authBusy ? "none" : `0 4px 20px ${V.blue}60` }}
            onMouseEnter={e => { if (!authBusy) { e.currentTarget.style.background = V.s3; e.currentTarget.style.transform = "translateY(-1px)"; }}}
            onMouseLeave={e => { e.currentTarget.style.background = V.blue; e.currentTarget.style.transform = "none"; }}
          >
            {authBusy ? t("connecting") : authMode === "login" ? t("enter_arena") : t("join_team")}
          </button>

          {/* Footer */}
          <div style={{ marginTop: 28, padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid rgba(255,255,255,0.06)` }}>
            <div style={{ fontSize: 11, color: V.s4, textAlign: "center", lineHeight: 1.6 }}>
              {t("restricted_access")}<br/>
              <span style={{ color: V.s5 }}>{t("every_session")}</span>
            </div>
          </div>
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
            <div style={{ fontSize: 10, color: V.s5, letterSpacing: "1px", textTransform: "uppercase" }}>Sales Performance</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Language switcher */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", border: `1px solid ${V.border}`, borderRadius: 20, padding: 3 }}>
            {["fr","nl"].map(l => (
              <button key={l} onClick={() => changeLang(l)} style={{ background: lang === l ? V.blue : "transparent", border: "none", borderRadius: 16, color: lang === l ? V.white : V.s5, fontWeight: 700, fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>{l.toUpperCase()}</button>
            ))}
          </div>
          {/* Daily counter compact */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${todayReviews >= DAILY_GOAL ? "#10B98140" : V.border}`, borderRadius: 20, padding: "6px 14px" }}>
            <span style={{ fontSize: 12 }}>{todayReviews >= DAILY_GOAL ? "✅" : "🎯"}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: todayReviews >= DAILY_GOAL ? "#10B981" : V.s5 }}>{todayReviews}/{DAILY_GOAL} {t("today")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isAdmin && <span style={{ fontSize: 10, color: V.neon, background: `${V.neon}15`, border: `1px solid ${V.neon}40`, borderRadius: 20, padding: "2px 8px", fontWeight: 700, letterSpacing: "0.5px" }}>ADMIN</span>}
            <span style={{ fontSize: 16 }}>{myMedal.icon}</span>
            <span style={{ fontSize: 12, color: V.s5 }}>{user.email.split("@")[0]}</span>
          </div>
          <button onClick={() => signOut(auth)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{t("logout")}</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${V.border}`, display: "flex", padding: "0 24px", background: V.s1 }}>
        {[["dashboard","📊",t("nav_dashboard")],["new","✍️",t("nav_new")],["history","📋",t("nav_history")],["objectives","🎯", pendingObjectives.length > 0 ? `${t("nav_objectives")} (${pendingObjectives.length})` : t("nav_objectives")],["team","🃏",t("nav_team")],...(isAdmin ? [["admin","⚙️",t("nav_admin")]] : [])].map(([id,icon,lbl]) => (
          <button key={id} onClick={() => setPage(id)} style={{ background: "none", border: "none", borderBottom: page === id ? `2px solid ${V.neon}` : "2px solid transparent", color: page === id ? V.neon : V.s5, fontSize: 13, fontWeight: 600, padding: "12px 18px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" }}>{icon} {lbl}</button>
        ))}
        {(page === "review" || page === "detail") && (
          <button style={{ background: "none", border: "none", borderBottom: `2px solid ${V.orange}`, color: V.orange, fontSize: 13, fontWeight: 600, padding: "12px 18px", fontFamily: "inherit" }}>
            {page === "review" ? t("nav_analysis") : t("nav_detail")}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px", boxSizing: "border-box" }}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════════ */}
        {page === "dashboard" && (<>

          {reviews.length === 0 ? (
            /* Empty state — call to action */
            <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 20, filter: `drop-shadow(0 0 20px ${V.orange}60)` }}>🎙️</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: V.white, letterSpacing: "-1px", marginBottom: 8 }}>{t("welcome_title")}</div>
              <div style={{ fontSize: 15, color: V.s5, maxWidth: 360, lineHeight: 1.7, marginBottom: 32 }}>{t("welcome_sub")}</div>
              <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 14, color: V.white, fontWeight: 800, fontSize: 16, padding: "16px 40px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.3px", boxShadow: `0 8px 32px ${V.orange}50` }}>{t("welcome_cta")}</button>
            </div>
          ) : (<>

          {/* ── HEADER JERSEY — identité du Sales ── */}
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", marginBottom: 20, padding: "28px 28px 24px" }}>
            {/* Fond avec texture terrain */}
            <div style={{ position: "absolute", inset: 0, background: V.s1 }}/>
            <svg style={{ position: "absolute", inset: 0, opacity: 0.05 }} width="100%" height="100%">
              <defs>
                <pattern id="hex" width="28" height="32" patternUnits="userSpaceOnUse">
                  <polygon points="14,2 26,8 26,24 14,30 2,24 2,8" fill="none" stroke={V.neon} strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hex)"/>
            </svg>
            {/* Glow accent */}
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `${V.blue}30`, filter: "blur(60px)", pointerEvents: "none" }}/>

            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              {/* Jersey number */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 72, fontWeight: 900, color: myMedal.color, letterSpacing: "-4px", lineHeight: 1, textShadow: `0 0 40px ${myMedal.color}60` }}>{myAvg || "—"}</div>
                <div style={{ fontSize: 10, color: myMedal.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", marginTop: 2 }}>{t("score_avg")}</div>
              </div>

              {/* Infos joueur */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: V.white, textTransform: "uppercase", letterSpacing: "1px" }}>{user.email.split("@")[0]}</div>
                  <div style={{ background: `${myLevel.color}20`, border: `1px solid ${myLevel.color}50`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 800, color: myLevel.color }}>{myLevel.icon} {myLevel.name}</div>
                  {isAdmin && <div style={{ background: `${V.neon}15`, border: `1px solid ${V.neon}40`, borderRadius: 20, padding: "3px 12px", fontSize: 10, fontWeight: 800, color: V.neon, letterSpacing: "1px" }}>ADMIN</div>}
                </div>
                <div style={{ fontSize: 12, color: V.s5, marginBottom: 10 }}>{t("sales_role")} · {reviews.length} {reviews.length > 1 ? t("calls") : t("call")} {reviews.length > 1 ? t("analyzed_pl") : t("analyzed")}</div>
                <Stars count={myMedal.stars} color={myMedal.color}/>
                <div style={{ fontSize: 11, color: myMedal.color, marginTop: 4, fontWeight: 600 }}>{myMedal.icon} {myMedal.label}</div>
              </div>

              {/* XP progress */}
              <div style={{ flexShrink: 0, minWidth: 160 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: V.s5, textTransform: "uppercase", letterSpacing: "1px" }}>XP</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: myLevel.color }}>{myXP} / {myLevel.max + 1}</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${Math.min(((myXP - myLevel.min) / (myLevel.max - myLevel.min + 1)) * 100, 100)}%`, background: myLevel.color, borderRadius: 10, boxShadow: `0 0 10px ${myLevel.color}` }}/>
                </div>
                {LEVELS.find(l => l.min > myXP) && (
                  <div style={{ fontSize: 10, color: V.s4 }}>
                    {LEVELS.find(l => l.min > myXP).min - myXP} {t("xp_to")} {LEVELS.find(l => l.min > myXP).name}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── COMPTEUR JOURNALIER ── */}
          <div style={{ marginBottom: 16 }}>
            <DailyCounter count={todayReviews} t={t}/>
          </div>

          {/* ── KPIs MINI ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: t("week"), value: reviews.filter(r => { if (!r.createdAt) return false; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); return (new Date()-d) < 7*86400000; }).length, icon: "📅", color: V.blue, suffix: " calls" },
              { label: t("best_score"), value: Math.max(...reviews.map(r => r.globalPct||0)), icon: "⭐", color: "#FFD700", suffix: "%" },
              { label: t("luc_avg"), value: (() => { const l = reviews.filter(r=>r.lucScore!=null); return l.length ? Math.round(l.reduce((a,r)=>a+(r.lucScore||0),0)/l.length) : "—"; })(), icon: "🧠", color: "#8B5CF6", suffix: l => typeof l === "number" ? "" : "" },
              { label: t("obj_validated"), value: objectives.filter(o=>o.status==="validated").length, icon: "✅", color: "#10B981", suffix: "" },
            ].map(k => (
              <div key={k.label} style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 14, padding: "16px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color, letterSpacing: "-0.5px" }}>{k.value}{typeof k.suffix === "string" ? k.suffix : ""}</div>
                <div style={{ fontSize: 10, color: V.s5, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* ── CARTE + LEADERBOARD ── */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 20, alignItems: "start" }}>
            {/* Carte FIFA */}
            <FifaCard name={user.email.split("@")[0]} avg={myAvg} medal={myMedal} reviews={reviews} allReviews={allReviews} userId={user.uid} t={t}/>

            {/* Leaderboard style match */}
            <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 20, height: "100%", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🏆</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: V.white, textTransform: "uppercase", letterSpacing: "1px" }}>{t("team_ranking")}</span>
              </div>
              {leaderboard.length === 0 && <div style={{ color: V.s5, fontSize: 13 }}>{t("no_calls_yet")}</div>}
              {leaderboard.map((s, i) => {
                const m = getMedal(s.avg);
                const isMe = s.name === user.email.split("@")[0];
                const barW = Math.max((s.avg / 100) * 100, 4);
                return (
                  <div key={s.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, width: 22, textAlign: "center", flexShrink: 0 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":<span style={{ fontSize: 10, color: V.s4 }}>#{i+1}</span>}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 800 : 500, color: isMe ? V.neon : V.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}{isMe ? " ←" : ""}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: m.color, flexShrink: 0 }}>{s.avg}%</span>
                    </div>
                    <div style={{ marginLeft: 30, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barW}%`, background: isMe ? V.neon : m.color, borderRadius: 4, transition: "width .8s ease", opacity: isMe ? 1 : 0.7 }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── GRAPHE ÉVOLUTION ── */}
          {reviews.length >= 2 && (() => {
            const last10 = reviews.slice(0, 10).reverse();
            const maxPct = Math.max(...last10.map(r => r.globalPct||0));
            const minPct = Math.min(...last10.map(r => r.globalPct||0));
            const H = 100; const W_BAR = 1 / last10.length;
            return (
              <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📈</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: V.white, textTransform: "uppercase", letterSpacing: "1px" }}>{t("recent_form")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Sparkline values={last10.map(r=>r.globalPct||0)} color={V.neon} width={100} height={28}/>
                    {(() => { const trend = (last10[last10.length-1]?.globalPct||0) - (last10[0]?.globalPct||0); return <span style={{ fontSize: 12, fontWeight: 700, color: trend >= 0 ? "#10B981" : "#EF4444" }}>{trend >= 0 ? "↗" : "↘"} {Math.abs(trend)}%</span>; })()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
                  {last10.map((r, i) => {
                    const pct = r.globalPct || 0;
                    const m = getMedal(pct);
                    const h = Math.max(((pct - Math.max(minPct-10,0)) / (Math.min(maxPct+10,100) - Math.max(minPct-10,0))) * 80, 8);
                    const isLast = i === last10.length - 1;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{ fontSize: 9, color: m.color, fontWeight: 700 }}>{pct}%</div>
                        <div style={{ width: "100%", height: `${h}px`, background: isLast ? m.color : `${m.color}50`, borderRadius: "4px 4px 0 0", transition: "height .5s ease", position: "relative", overflow: "hidden" }}>
                          {isLast && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.1)", animation: "pulse 2s ease-in-out infinite" }}/>}
                        </div>
                        <div style={{ fontSize: 8, color: V.s4, textAlign: "center", lineHeight: 1.2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.prospectName?.slice(0,5) || "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── OBJECTIFS EN COURS ── */}
          {pendingObjectives.length > 0 && (
            <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>🎯</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: V.white, textTransform: "uppercase", letterSpacing: "1px" }}>{t("next_objectives")}</span>
                <span style={{ marginLeft: "auto", background: `${V.orange}20`, border: `1px solid ${V.orange}40`, borderRadius: 20, padding: "2px 10px", fontSize: 11, color: V.orange, fontWeight: 700 }}>{pendingObjectives.length}</span>
              </div>
              {pendingObjectives.slice(0,3).map((obj, i) => {
                const pc = { high: V.orange, medium: V.blue, low: V.s5 }[obj.priority] || V.s5;
                return (
                  <div key={obj.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < Math.min(pendingObjectives.length,3)-1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${pc}20`, border: `1.5px solid ${pc}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: pc, flexShrink: 0 }}>{i+1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: V.white, marginBottom: 2 }}>{obj.title}</div>
                      <div style={{ fontSize: 11, color: V.s5, lineHeight: 1.5 }}>{obj.description}</div>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setPage("objectives")} style={{ width: "100%", marginTop: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${V.border}`, borderRadius: 10, color: V.s5, fontSize: 12, fontWeight: 600, padding: "9px", cursor: "pointer", fontFamily: "inherit" }}>{t("see_all_objectives")}</button>
            </div>
          )}

          {/* ── BADGES ── */}
          {reviews.length > 0 && (() => {
            const earned = BADGES.filter(b => b.condition(reviews, objectives));
            const locked = BADGES.filter(b => !b.condition(reviews, objectives));
            return (
              <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 16 }}>🛡️</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: V.white, textTransform: "uppercase", letterSpacing: "1px" }}>{t("my_badges")}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: V.s5 }}>{earned.length}/{BADGES.length}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {earned.map(b => (
                    <div key={b.id} title={b.desc} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 12px", background: `${V.neon}08`, border: `1.5px solid ${V.neon}30`, borderRadius: 12, minWidth: 64, transition: "transform .2s" }}
                      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                      <div style={{ fontSize: 26, filter: `drop-shadow(0 0 6px ${V.neon}60)` }}>{b.icon}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: V.neon, textAlign: "center", letterSpacing: "0.3px" }}>{b.name}</div>
                    </div>
                  ))}
                  {locked.slice(0,4).map(b => (
                    <div key={b.id} title={`🔒 ${b.desc}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1.5px solid rgba(255,255,255,0.06)", borderRadius: 12, minWidth: 64, opacity: 0.35, filter: "grayscale(1)" }}>
                      <div style={{ fontSize: 26 }}>{b.icon}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: V.s4, textAlign: "center" }}>{b.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          </>)}
        </>)}


        {/* ══ NOUVEAU CALL ════════════════════════════════════════════════════════ */}
        {page === "new" && (<>

          {/* Étapes visuelles */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
            {[["1",t("step_transcript"),"transcript"],["2",t("step_selfeval"),"selfeval"]].map(([num,lbl,step],i) => (
              <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: newStep === step ? V.orange : newStep === "selfeval" && step === "transcript" ? "#10B981" : "rgba(255,255,255,0.1)", border: `2px solid ${newStep === step ? V.orange : newStep === "selfeval" && step === "transcript" ? "#10B981" : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: V.white, transition: "all .3s" }}>
                    {newStep === "selfeval" && step === "transcript" ? "✓" : num}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: newStep === step ? V.orange : V.s5 }}>{lbl}</span>
                </div>
                {i === 0 && <div style={{ flex: 1, height: 2, background: newStep === "selfeval" ? "#10B981" : "rgba(255,255,255,0.1)", margin: "0 12px", transition: "background .3s" }}/>}
              </div>
            ))}
          </div>

          {/* ── ÉTAPE 1 : Transcript ── */}
          {newStep === "transcript" && (<>
            <div style={card()}>
              <span style={sLabel}>{t("call_info")}</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input placeholder={t("prospect_name")} value={meta.prospect} onChange={e => setMeta({...meta, prospect: e.target.value})} style={inputStyle}/>
                <input placeholder={t("call_date")} value={meta.date} onChange={e => setMeta({...meta, date: e.target.value})} style={inputStyle}/>
              </div>
            </div>
            <div style={card()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={sLabel}>{t("call_transcript")}</span>
                <button onClick={() => txtRef.current.click()} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 8, color: V.s5, fontSize: 12, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>{t("import_txt")}</button>
                <input ref={txtRef} type="file" accept=".txt,.md" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setTranscript(ev.target.result); r.readAsText(f); }}/>
              </div>
              <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                placeholder={t("transcript_placeholder")}
                style={{ ...inputStyle, minHeight: 300, fontFamily: "monospace", resize: "vertical", lineHeight: 1.7 }}/>
              {transcript && <div style={{ marginTop: 8, fontSize: 11, color: V.s5 }}>📝 {transcript.split(" ").length} {t("words")} · ~{Math.ceil(transcript.split(" ").length / 130)} {t("est_duration")}</div>}
            </div>
            <div style={{ ...card(), padding: "14px 18px", marginBottom: 14 }}>
              <DailyCounter count={todayReviews} t={t}/>
            </div>
            <button onClick={() => { if (!transcript.trim()) return; setSelfScores({}); setSelfComment({ strengths: "", weaknesses: "", feeling: "" }); setNewStep("selfeval"); }}
              disabled={!transcript.trim()}
              style={{ width: "100%", background: !transcript.trim() ? "rgba(255,255,255,0.08)" : V.blue, border: "none", borderRadius: 14, color: !transcript.trim() ? V.s4 : V.white, fontSize: 15, fontWeight: 700, padding: "16px", cursor: !transcript.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all .3s" }}>
              {t("next_selfeval")}
            </button>
          </>)}

          {/* ── ÉTAPE 2 : Autoévaluation ── */}
          {newStep === "selfeval" && (<>
            <div style={card()}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: V.white, marginBottom: 6 }}>{t("selfeval_title")}</div>
                <div style={{ fontSize: 13, color: V.s5, lineHeight: 1.6 }}>{t("selfeval_sub")}</div>
              </div>

              {/* Notes par section */}
              {CRITERIA.map(section => (
                <div key={section.section} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>{section.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: "1px" }}>{section.section}</span>
                  </div>
                  {section.items.map(c => (
                    <div key={c.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: V.white }}>{c.label}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {SCORES.map(s => (
                            <button key={s.value} onClick={() => setSelfScores(prev => ({...prev, [c.id]: s.value}))}
                              style={{ background: selfScores[c.id] === s.value ? s.color : "rgba(255,255,255,0.06)", border: `1.5px solid ${selfScores[c.id] === s.value ? s.color : "rgba(255,255,255,0.12)"}`, color: selfScores[c.id] === s.value ? "#fff" : V.s5, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontFamily: "inherit", cursor: "pointer", fontWeight: selfScores[c.id] === s.value ? 700 : 400, transition: "all .15s", whiteSpace: "nowrap" }}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Ressenti global */}
            <div style={card()}>
              <span style={sLabel}>{t("feeling_title")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: V.s5, marginBottom: 6 }}>{t("feeling_good")}</div>
                  <textarea value={selfComment.strengths} onChange={e => setSelfComment(p => ({...p, strengths: e.target.value}))}
                    placeholder={t("feeling_good_ph")}
                    style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.6 }}/>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: V.s5, marginBottom: 6 }}>{t("feeling_bad")}</div>
                  <textarea value={selfComment.weaknesses} onChange={e => setSelfComment(p => ({...p, weaknesses: e.target.value}))}
                    placeholder={t("feeling_bad_ph")}
                    style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.6 }}/>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: V.s5, marginBottom: 6 }}>{t("feeling_general")}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[["🔥","fire",t("feeling_fire")],["😊","solid",t("feeling_solid")],["😐","avg",t("feeling_avg")],["😤","frustrating",t("feeling_frustrating")],["💪","improve",t("feeling_improve")]].map(([emoji,key,label]) => (
                      <button key={label} onClick={() => setSelfComment(p => ({...p, feeling: key}))}
                        style={{ background: selfComment.feeling === key ? `${V.orange}20` : "rgba(255,255,255,0.05)", border: `1.5px solid ${selfComment.feeling === key ? V.orange : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, color: selfComment.feeling === key ? V.orange : V.s5, cursor: "pointer", fontFamily: "inherit", fontWeight: selfComment.feeling === key ? 700 : 400, transition: "all .2s" }}>
                        {emoji} {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setNewStep("transcript")} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 12, color: V.s5, fontSize: 14, fontWeight: 600, padding: "14px 20px", cursor: "pointer", fontFamily: "inherit" }}>{t("back")}</button>
              <button onClick={() => { setSelfDone(true); handleAnalyze(); }}
                style={{ flex: 1, background: V.orange, border: "none", borderRadius: 12, color: V.white, fontSize: 15, fontWeight: 700, padding: "14px", cursor: "pointer", fontFamily: "inherit" }}>
                {t("launch_analysis")}
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: V.s4 }}>{t("autosave_note")}</div>
          </>)}
        </>)}

        {/* ══ REVIEW ══════════════════════════════════════════════════════════════ */}
        {page === "review" && (<>
          {loading && <CoachCinematic/>}
          {!loading && (() => {
            // Si les states sont vides (retour sur la page), on utilise le dernier call sauvegardé
            const hasState = scores && Object.keys(scores).length > 0;
            const fallback = !hasState && reviews.length > 0 ? reviews[0] : null;

            const displayScores = hasState ? scores : (fallback?.scores || {});
            const displayJust = hasState ? justifications : (fallback?.justifications || {});
            const displayExpert = hasState ? expertScripts : (fallback?.expertScripts || {});
            const displayLevelUp = hasState ? levelUp : (fallback?.levelUp || {});
            const displayComment = hasState ? globalComment : (fallback?.globalComment || "");
            const displayStrengths = hasState ? globalStrengths : (fallback?.globalStrengths || []);
            const displayImprovements = hasState ? globalImprovements : (fallback?.globalImprovements || []);
            const displaySelfScores = hasState ? selfScores : (fallback?.selfScores || {});
            const displaySelfDone = hasState ? selfDone : !!fallback?.selfScores;
            const displaySelfComment = hasState ? selfComment : (fallback?.selfComment || {});
            const displayLucScore = hasState ? (selfDone ? calcLUC(selfScores, scores) : null) : fallback?.lucScore;
            const displayPct = hasState ? globalPct : (fallback?.globalPct || 0);
            const displayMeta = hasState ? meta : { prospect: fallback?.prospectName || "", date: fallback?.callDate || "" };

            if (!hasState && !fallback) return (
              <div style={{ textAlign: "center", padding: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: V.white, marginBottom: 8 }}>Aucune analyse en cours</div>
                <div style={{ color: V.s5, fontSize: 13, marginBottom: 24 }}>Lance une nouvelle analyse pour voir les résultats ici.</div>
                <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 12, color: V.white, fontWeight: 700, fontSize: 14, padding: "12px 28px", cursor: "pointer", fontFamily: "inherit" }}>✍️ Analyser un call</button>
              </div>
            );

            const m = getMedal(displayPct);
            const allIds = CRITERIA.flatMap(s => s.items.map(i => i.id));
            const rated = allIds.filter(id => (displaySelfScores[id]??0) > 0 && (displayScores[id]??0) > 0);
            const aligned = rated.filter(id => displayScores[id] === displaySelfScores[id]).length;
            const overrated = rated.filter(id => (displaySelfScores[id]||0) > (displayScores[id]||0)).length;
            const underrated = rated.filter(id => (displaySelfScores[id]||0) < (displayScores[id]||0)).length;
            const xpGained = 50 + (displayPct >= 80 ? 60 : 0) + ((displayLucScore||0) >= 70 ? 40 : 0);

            return (
              <div style={{ animation: "fadeInUp .5s ease" }}>
                {fallback && (
                  <div style={{ background: `${V.blue}10`, border: `1px solid ${V.blue}30`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13 }}>📋</span>
                    <span style={{ fontSize: 12, color: V.s5 }}>{t("showing_last")} <strong style={{ color: V.white }}>{fallback.prospectName || "Prospect"}</strong> · {fallback.callDate || ""}</span>
                    <button onClick={() => setPage("new")} style={{ marginLeft: "auto", background: V.orange, border: "none", borderRadius: 8, color: V.white, fontSize: 11, fontWeight: 700, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>+ Nouveau</button>
                  </div>
                )}

                {/* ══ 1. VERDICT D'ENTRÉE ══ */}
                <div style={{ ...card(), background: `linear-gradient(135deg, ${m.color}15, rgba(255,255,255,0.03))`, border: `1px solid ${m.color}30`, marginBottom: 16, textAlign: "center", padding: "28px 20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, opacity: 0.03 }}>
                    <svg width="100%" height="100%"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill={m.color}/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>
                  </div>
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ fontSize: 48, marginBottom: 8, filter: `drop-shadow(0 0 16px ${m.color})` }}>{m.icon}</div>
                    <div style={{ fontSize: 52, fontWeight: 900, color: m.color, letterSpacing: "-2px", lineHeight: 1, textShadow: `0 0 30px ${m.color}60` }}>{displayPct}%</div>
                    <div style={{ fontSize: 16, color: V.white, fontWeight: 700, marginTop: 6 }}>{m.label}</div>
                    {displayMeta.prospect && <div style={{ fontSize: 13, color: V.s5, marginTop: 4 }}>{t("call_with")} <strong style={{ color: V.white }}>{displayMeta.prospect}</strong>{displayMeta.date ? ` · ${displayMeta.date}` : ""}</div>}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "6px 18px" }}>
                      <span style={{ fontSize: 14 }}>⚡</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: myLevel.color }}>+{xpGained} XP</span>
                      <span style={{ fontSize: 11, color: V.s5 }}>· {myLevel.name}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 20 }}>
                      {CRITERIA.map(s => {
                        const pct = sectionPct(s, displayScores);
                        return (
                          <div key={s.section} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 6px" }}>
                            <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{pct}%</div>
                            <div style={{ fontSize: 8, color: V.s5, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{s.section.split(" ")[0]}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 14, fontSize: 11, color: saveStatus === "saved" ? "#10B981" : V.s4 }}>
                      {saveStatus === "saved" ? t("saved") : fallback ? t("from_history") : t("saving")}
                    </div>
                  </div>
                </div>

                {/* ══ 2. VERDICT DE MARC ══ */}
                {displayComment && (
                  <div style={{ ...card(), border: `1px solid ${V.neon}20`, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${V.neon}20`, border: `2px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🧑‍💼</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: V.white }}>{t("coach_name")}</div>
                        <div style={{ fontSize: 10, color: V.neon, letterSpacing: "1px" }}>{t("coach_role")}</div>
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                      <p style={{ color: V.bg1, fontSize: 14, lineHeight: 1.9, margin: 0 }}>{displayComment}</p>
                    </div>
                    {(displayStrengths.length > 0 || displayImprovements.length > 0) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{t("did_well")}</div>
                          {displayStrengths.map((s,i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 6, borderLeft: "2px solid #10B981", lineHeight: 1.5 }}>{s}</div>)}
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{t("working_on")}</div>
                          {displayImprovements.map((s,i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "6px 10px", background: `${V.orange}10`, borderRadius: 8, marginBottom: 6, borderLeft: `2px solid ${V.orange}`, lineHeight: 1.5 }}>{s}</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ 3. MIROIR ══ */}
                {displaySelfDone && rated.length > 0 && (
                  <div style={{ ...card(), border: "1px solid #8B5CF650", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🪞</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: V.white }}>{t("mirror_title")}</div>
                          <div style={{ fontSize: 11, color: V.s5 }}>{t("mirror_sub")}</div>
                        </div>
                      </div>
                      {displayLucScore !== null && displayLucScore !== undefined && (
                        <div style={{ textAlign: "center", background: "#8B5CF620", border: "1px solid #8B5CF650", borderRadius: 12, padding: "8px 16px" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#8B5CF6" }}>{displayLucScore}</div>
                          <div style={{ fontSize: 9, color: V.s5, textTransform: "uppercase", letterSpacing: "1px" }}>{t("luc_score")}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
                      {[
                        { label: t("aligned"), value: aligned, color: "#10B981", icon: "🎯", msg: t("aligned_msg") },
                        { label: t("overestimated"), value: overrated, color: "#EF4444", icon: "⚠️", msg: t("overest_msg") },
                        { label: t("underestimated"), value: underrated, color: "#F59E0B", icon: "💪", msg: t("underest_msg") },
                      ].map(k => (
                        <div key={k.label} style={{ textAlign: "center", background: `${k.color}08`, border: `1px solid ${k.color}25`, borderRadius: 10, padding: "10px 6px" }}>
                          <div style={{ fontSize: 20 }}>{k.icon}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
                          <div style={{ fontSize: 9, color: V.s5, marginTop: 2 }}>{k.msg}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>{t("biggest_gaps")}</div>
                    {(() => {
                      const bigGaps = rated
                        .map(id => ({ id, diff: (displaySelfScores[id]||0) - (displayScores[id]||0), criterion: CRITERIA.flatMap(s=>s.items).find(c=>c.id===id) }))
                        .filter(g => Math.abs(g.diff) >= 1).sort((a,b) => Math.abs(b.diff)-Math.abs(a.diff)).slice(0,5);
                      if (!bigGaps.length) return <div style={{ color: V.s5, fontSize: 13 }}>{t("excellent_lucidity")}</div>;
                      return bigGaps.map(({ id, diff, criterion }) => {
                        const sdrSc = SCORES.find(s => s.value === (displaySelfScores[id]||0));
                        const coachSc = SCORES.find(s => s.value === (displayScores[id]||0));
                        const isOver = diff > 0;
                        const gc = isOver ? "#EF4444" : "#F59E0B";
                        return (
                          <div key={id} style={{ background: `${gc}08`, border: `1px solid ${gc}20`, borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: V.white }}>{criterion?.label}</span>
                              <span style={{ fontSize: 10, background: `${sdrSc?.color}20`, color: sdrSc?.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t("you")}: {sdrSc?.label}</span>
                              <span style={{ color: gc }}>→</span>
                              <span style={{ fontSize: 10, background: `${coachSc?.color}20`, color: coachSc?.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t("marc")}: {coachSc?.label}</span>
                            </div>
                            <div style={{ fontSize: 11, color: gc, fontStyle: "italic" }}>
                              {isOver ? t("overest_detail") : t("underest_detail")}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* ══ 4. CRITÈRES + MARC TE PARLE ══ */}
                {CRITERIA.map(section => (
                  <div key={section.section} style={{ ...card(), marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{section.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: section.color, textTransform: "uppercase", letterSpacing: "1px" }}>{section.section}</div>
                          <div style={{ fontSize: 11, color: V.s5 }}>{section.items.length} {t("criteria")}</div>
                        </div>
                      </div>
                      <div style={{ background: `${section.color}15`, border: `1px solid ${section.color}40`, borderRadius: 20, padding: "5px 16px" }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: section.color }}>{sectionPct(section, displayScores)}%</span>
                      </div>
                    </div>
                    {section.items.map(c => {
                      const sc = SCORES.find(s => s.value === (displayScores[c.id]||0));
                      const selfSc = displaySelfDone ? SCORES.find(s => s.value === (displaySelfScores[c.id]||0)) : null;
                      const just = displayJust?.[c.id];
                      const expert = displayExpert?.[c.id];
                      const up = displayLevelUp?.[c.id];
                      return (
                        <div key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16, marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: section.color, flexShrink: 0 }}/>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: V.white }}>{c.label}</span>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {selfSc && selfSc.value > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${selfSc.color}15`, color: selfSc.color, border: `1px solid ${selfSc.color}30` }}>Toi: {selfSc.label}</span>}
                              {sc && sc.value > 0 && <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, background: `${sc.color}20`, color: sc.color, fontWeight: 700, border: `1px solid ${sc.color}40` }}>Marc: {sc.label}</span>}
                            </div>
                          </div>
                          {just && (
                            <div style={{ marginLeft: 16, marginBottom: 10 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${V.neon}15`, border: `1.5px solid ${V.neon}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>🧑‍💼</div>
                                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0 12px 12px 12px", padding: "10px 14px", flex: 1 }}>
                                  <div style={{ fontSize: 9, color: V.neon, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "1px" }}>{t("marc_speaks")}</div>
                                  <div style={{ fontSize: 13, color: V.bg1, lineHeight: 1.8 }}>{just}</div>
                                </div>
                              </div>
                            </div>
                          )}
                          {expert && (
                            <div style={{ marginLeft: 16, marginBottom: 8 }}>
                              <div style={{ background: `${V.blue}12`, border: `1px solid ${V.neon}20`, borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ fontSize: 9, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{t("what_marc_said")}</div>
                                <div style={{ fontSize: 12.5, color: V.bg1, lineHeight: 1.7, fontStyle: "italic" }}>"{expert}"</div>
                              </div>
                            </div>
                          )}
                          {up?.scripts?.length > 0 && (
                            <div style={{ marginLeft: 16 }}>
                              <div style={{ fontSize: 9, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{t("phrases_to_use")}</div>
                              {up.scripts.map((s,i) => (
                                <div key={i} style={{ background: `${V.orange}08`, border: `1px solid ${V.orange}20`, borderRadius: 8, padding: "7px 12px", fontSize: 12, color: V.s5, fontStyle: "italic", lineHeight: 1.6, marginBottom: 5 }}>
                                  <span style={{ color: V.orange, fontWeight: 800, fontStyle: "normal" }}>{i+1}. </span>"{s}"
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* ══ 5. BADGES DÉBLOQUÉS ══ */}
                {(() => {
                  const newBadges = BADGES.filter(b => b.condition(reviews, objectives));
                  if (!newBadges.length) return null;
                  return (
                    <div style={{ ...card(), border: `1px solid ${V.neon}20`, textAlign: "center", padding: 24, marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: V.white, marginBottom: 4 }}>{t("badges_unlocked")}</div>
                      <div style={{ fontSize: 12, color: V.s5, marginBottom: 16 }}>{t("keep_going")}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                        {newBadges.slice(0,4).map(b => (
                          <div key={b.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 14px", background: `${V.neon}08`, border: `1.5px solid ${V.neon}30`, borderRadius: 12 }}>
                            <div style={{ fontSize: 28, filter: `drop-shadow(0 0 8px ${V.neon}80)` }}>{b.icon}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: V.neon }}>{b.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </>)}

        {/* ══ HISTORIQUE ══════════════════════════════════════════════════════════ */}
        {page === "history" && (<>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("my_calls")}</div>
              <div style={{ fontSize: 12, color: V.s5, marginTop: 2 }}>{reviews.length} {t("reviews_count")} · {myAvg}% {t("avg")}</div>
            </div>
            <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 10, color: V.white, fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: "pointer", fontFamily: "inherit" }}>{t("new_call")}</button>
          </div>

          {reviews.length === 0 && <div style={{ ...card(), textAlign: "center", padding: 48 }}><div style={{ fontSize: 32, marginBottom: 10 }}>📋</div><div style={{ color: V.s5 }}>{t("no_saved_review")}</div></div>}

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
                  {(r.userId === user?.uid || isAdmin) && (
                    <button onClick={e => { e.stopPropagation(); if (window.confirm("Supprimer ce call ?")) deleteReview(r.id); }} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 11, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>🗑️ Supprimer</button>
                  )}
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

        {/* ══ OBJECTIFS ════════════════════════════════════════════════════════════ */}
        {page === "objectives" && (() => {
          const pending   = objectives.filter(o => o.status === "pending");
          const validated = objectives.filter(o => o.status === "validated");
          const failed    = objectives.filter(o => o.status === "failed");
          const total     = objectives.length;
          const validRate = total ? Math.round((validated.length / total) * 100) : 0;
          const priorityColor = { high: V.orange, medium: V.blue, low: V.s5 };
          const priorityLabel = { high: t("priority_high"), medium: t("priority_medium"), low: t("priority_low") };

          const getReviewForObj = (obj) => {
            if (!obj.evaluatedAt) return null;
            const evalDate = obj.evaluatedAt.toDate ? obj.evaluatedAt.toDate() : new Date(obj.evaluatedAt);
            return reviews.find(r => {
              const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt || 0);
              return Math.abs(d - evalDate) < 60000;
            }) || reviews[0];
          };

          return (<>
            {/* Header stats */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{t("my_objectives")}</div>
                {objectives.length > 0 && (
                  <button onClick={() => clearAllObjectives()} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 11, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>{t("clear_all")}</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: V.s5 }}>{t("objectives_sub")}</div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: t("pending"),    value: pending.length,   icon: "⏳", color: V.orange },
                { label: t("validated_kpi"),     value: validated.length, icon: "✅", color: "#10B981" },
                { label: t("failed_kpi"),       value: failed.length,    icon: "❌", color: "#EF4444" },
                { label: t("success_rate"), value: validRate + "%",  icon: "📈", color: V.neon },
              ].map(k => (
                <div key={k.label} style={{ ...card(), marginBottom: 0, textAlign: "center", padding: "16px 10px" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 10, color: V.s5, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Objectifs en cours */}
            {pending.length > 0 && (
              <div style={card()}>
                <span style={sLabel}>{t("in_progress")}</span>
                {pending.map((obj, i) => (
                  <div key={obj.id} onClick={() => setSelObj(selObj?.id === obj.id ? null : obj)}
                    style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${priorityColor[obj.priority] || V.border}30`, borderLeft: `3px solid ${priorityColor[obj.priority] || V.border}`, borderRadius: 10, padding: "14px", marginBottom: 10, cursor: "pointer", transition: "background .2s" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${priorityColor[obj.priority] || V.border}20`, border: `2px solid ${priorityColor[obj.priority] || V.border}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: priorityColor[obj.priority] || V.s5, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: V.white }}>{obj.title}</span>
                          <span style={{ fontSize: 9, color: priorityColor[obj.priority] || V.s5, background: `${priorityColor[obj.priority] || V.border}15`, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{priorityLabel[obj.priority] || obj.priority}</span>
                          <span style={{ fontSize: 10, color: V.s5 }}>📋 {obj.criterionLabel}</span>
                        </div>
                        <div style={{ fontSize: 13, color: V.s5, lineHeight: 1.6, marginBottom: selObj?.id === obj.id ? 10 : 0 }}>{obj.description}</div>
                        {selObj?.id === obj.id && obj.example && (
                          <div style={{ background: `${V.neon}10`, border: `1px solid ${V.neon}25`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: V.neon, fontStyle: "italic", marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6, fontStyle: "normal" }}>{t("phrase_to_use")}</div>
                            "{obj.example}"
                          </div>
                        )}
                      </div>
                      <span style={{ color: V.s4, fontSize: 12 }}>{selObj?.id === obj.id ? "▲" : "▼"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Objectifs validés */}
            {validated.length > 0 && (
              <div style={card()}>
                <span style={sLabel}>{t("validated")}</span>
                {validated.map((obj) => {
                  const review = getReviewForObj(obj);
                  const score = obj.evaluatedScore || 0;
                  const scoreObj = SCORES.find(s => s.value === score);
                  return (
                    <div key={obj.id} onClick={() => setSelObj(selObj?.id === obj.id ? null : obj)}
                      style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderLeft: "3px solid #10B981", borderRadius: 10, padding: "14px", marginBottom: 10, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#10B98120", border: "2px solid #10B98150", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✅</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: V.white }}>{obj.title}</span>
                            <span style={{ fontSize: 11, color: "#10B981", background: "#10B98115", padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>Validé ✓</span>
                            {scoreObj && <span style={{ fontSize: 11, color: scoreObj.color, background: `${scoreObj.color}15`, padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{scoreObj.label}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: V.s5, marginBottom: 4 }}>{obj.description}</div>
                          {obj.evaluatedAt && <div style={{ fontSize: 10, color: "#10B98180" }}>{t("validated_on")} {new Date(obj.evaluatedAt.toDate ? obj.evaluatedAt.toDate() : obj.evaluatedAt).toLocaleDateString(lang==="nl"?"nl-BE":"fr-FR")}</div>}

                          {/* Détail si sélectionné */}
                          {selObj?.id === obj.id && (<>
                            {obj.example && (
                              <div style={{ background: `${V.neon}10`, border: `1px solid ${V.neon}25`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: V.neon, fontStyle: "italic", marginTop: 10 }}>
                                <div style={{ fontSize: 10, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6, fontStyle: "normal" }}>{t("what_to_say")}</div>
                                "{obj.example}"
                              </div>
                            )}
                            {review && (
                              <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${V.border}`, borderRadius: 8, padding: "12px", marginTop: 10 }}>
                                <div style={{ fontSize: 10, color: V.s5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>{t("call_validated")}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 13, color: V.white, fontWeight: 600 }}>{review.prospectName || "Prospect"}</div>
                                  <div style={{ fontSize: 11, color: V.s5 }}>·</div>
                                  <div style={{ fontSize: 11, color: V.s5 }}>{review.callDate || "—"}</div>
                                  <div style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: getMedal(review.globalPct||0).color }}>{review.globalPct||0}%</div>
                                </div>
                                {review.justifications?.[obj.criterionId] && (
                                  <div style={{ fontSize: 12, color: V.s5, marginTop: 8, padding: "8px 10px", background: "#10B98110", borderRadius: 6, borderLeft: "2px solid #10B981", lineHeight: 1.6 }}>
                                    <span style={{ color: "#10B981", fontWeight: 600 }}>{t("coach_analysis")} </span>
                                    {review.justifications[obj.criterionId]}
                                  </div>
                                )}
                              </div>
                            )}
                          </>)}
                        </div>
                        <span style={{ color: V.s4, fontSize: 12, flexShrink: 0 }}>{selObj?.id === obj.id ? "▲" : "▼"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Objectifs ratés */}
            {failed.length > 0 && (
              <div style={card()}>
                <span style={sLabel}>{t("failed")}</span>
                {failed.map((obj) => (
                  <div key={obj.id} style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderLeft: "3px solid #EF4444", borderRadius: 10, padding: "14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EF444420", border: "2px solid #EF444450", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>❌</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: V.white }}>{obj.title}</span>
                          <span style={{ fontSize: 11, color: "#EF4444", background: "#EF444415", padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{t("not_achieved")}</span>
                        </div>
                        <div style={{ fontSize: 12, color: V.s5, marginBottom: 6 }}>{obj.description}</div>
                        {obj.example && (
                          <div style={{ fontSize: 11, color: "#EF444480", fontStyle: "italic" }}>💬 "{obj.example}"</div>
                        )}
                        <div style={{ fontSize: 11, color: "#EF444460", marginTop: 4 }}>{t("retry")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {objectives.length === 0 && (
              <div style={{ ...card(), textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t("no_objectives")}</div>
                <div style={{ color: V.s5, fontSize: 13, marginBottom: 24 }}>{t("no_objectives_sub")}</div>
                <button onClick={() => setPage("new")} style={{ background: V.orange, border: "none", borderRadius: 12, color: V.white, fontWeight: 700, fontSize: 14, padding: "12px 28px", cursor: "pointer", fontFamily: "inherit" }}>{t("analyze_call")}</button>
              </div>
            )}
          </>);
        })()}

        {/* ══ ADMIN ════════════════════════════════════════════════════════════════ */}
        {page === "admin" && isAdmin && (() => {
          // Build SDR profiles from allReviews + allObjectives
          const sdrs = Object.values(
            allReviews.reduce((acc, r) => {
              const uid = r.userId || "unknown";
              if (!acc[uid]) acc[uid] = { uid, name: r.sdrName || r.userEmail?.split("@")[0] || "?", email: r.userEmail || "", reviews: [] };
              acc[uid].reviews.push(r);
              return acc;
            }, {})
          ).map(s => ({
            ...s,
            avg: s.reviews.length ? Math.round(s.reviews.reduce((a,r) => a+(r.globalPct||0),0)/s.reviews.length) : 0,
            medal: getMedal(s.reviews.length ? Math.round(s.reviews.reduce((a,r) => a+(r.globalPct||0),0)/s.reviews.length) : 0),
            objectives: allObjectives.filter(o => o.userId === s.uid),
          })).sort((a,b) => b.avg - a.avg);

          const activeSdr = selectedSdr ? sdrs.find(s => s.uid === selectedSdr) : null;
          const priorityColor = { high: V.orange, medium: V.blue, low: V.s5 };

          return (<>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              {activeSdr && (
                <button onClick={() => setSelectedSdr(null)} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 10, color: V.s5, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Retour</button>
              )}
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {activeSdr ? `👤 ${activeSdr.name}` : "⚙️ Vue Admin — Équipe"}
                </div>
                <div style={{ fontSize: 12, color: V.neon, fontWeight: 600 }}>Mode Administrateur</div>
              </div>
            </div>

            {/* ── Vue liste des SDR ── */}
            {!activeSdr && (<>
              {/* KPIs globaux */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "SDR actifs", value: sdrs.length, icon: "👥", color: V.neon },
                  { label: "Total calls", value: allReviews.length, icon: "🎙️", color: V.blue },
                  { label: "Score équipe", value: sdrs.length ? Math.round(sdrs.reduce((a,s)=>a+s.avg,0)/sdrs.length) + "%" : "—", icon: "📊", color: "#10B981" },
                  { label: "Obj. en cours", value: allObjectives.filter(o=>o.status==="pending").length, icon: "🎯", color: V.orange },
                ].map(k => (
                  <div key={k.label} style={{ ...card(), marginBottom: 0, textAlign: "center", padding: "16px 10px" }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: V.s5, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Cartes SDR cliquables */}
              {sdrs.map((sdr, i) => {
                const sdrPending = sdr.objectives.filter(o => o.status === "pending").length;
                const sdrValidated = sdr.objectives.filter(o => o.status === "validated").length;
                const weekCalls = sdr.reviews.filter(r => { if (!r.createdAt) return false; const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt); return (new Date()-d) < 7*86400000; }).length;
                const trend = sdr.reviews.length >= 2 ? (sdr.reviews[0].globalPct||0)-(sdr.reviews[1].globalPct||0) : 0;
                return (
                  <div key={sdr.uid} onClick={() => setSelectedSdr(sdr.uid)}
                    style={{ ...card(), cursor: "pointer", transition: "border-color .2s", border: `1px solid ${i===0?`${sdr.medal.color}40`:V.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {/* Rang */}
                      <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                      {/* Avatar */}
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${sdr.medal.color}15`, border: `2px solid ${sdr.medal.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: sdr.medal.color, flexShrink: 0 }}>
                        {sdr.name.slice(0,2).toUpperCase()}
                      </div>
                      {/* Infos */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: V.white }}>{sdr.name}</div>
                        <div style={{ fontSize: 11, color: V.s5, marginTop: 2 }}>{sdr.email}</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: V.s5 }}>🎙️ {sdr.reviews.length} calls</span>
                          <span style={{ fontSize: 10, color: V.s5 }}>📅 {weekCalls} cette sem.</span>
                          {sdrPending > 0 && <span style={{ fontSize: 10, color: V.orange }}>⏳ {sdrPending} obj. en cours</span>}
                          {sdrValidated > 0 && <span style={{ fontSize: 10, color: "#10B981" }}>✅ {sdrValidated} validés</span>}
                          {trend !== 0 && <span style={{ fontSize: 10, color: trend>0?"#10B981":"#EF4444" }}>{trend>0?`↗+${trend}%`:`↘${trend}%`}</span>}
                        </div>
                      </div>
                      {/* Score */}
                      <div style={{ textAlign: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: sdr.medal.color }}>{sdr.avg}%</div>
                        <div style={{ fontSize: 12 }}>{sdr.medal.icon}</div>
                        <Stars count={sdr.medal.stars} color={sdr.medal.color}/>
                      </div>
                      <span style={{ color: V.s4, fontSize: 14 }}>→</span>
                    </div>

                    {/* Mini barres sections */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 12 }}>
                      {CRITERIA.map(section => {
                        const avg = sdr.reviews.length ? Math.round(sdr.reviews.reduce((a,r)=>a+sectionPct(section,r.scores||{}),0)/sdr.reviews.length) : 0;
                        return (
                          <div key={section.section}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 9, color: V.s5 }}>{section.icon}</span>
                              <span style={{ fontSize: 9, color: section.color, fontWeight: 700 }}>{avg}%</span>
                            </div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${avg}%`, background: section.color, borderRadius: 2 }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>)}

            {/* ── Vue détail SDR (admin) ── */}
            {activeSdr && (<>
              {/* Score + médaille */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Score moyen", value: activeSdr.avg + "%", icon: activeSdr.medal.icon, color: activeSdr.medal.color },
                  { label: "Calls analysés", value: activeSdr.reviews.length, icon: "🎙️", color: V.blue },
                  { label: "Obj. validés", value: activeSdr.objectives.filter(o=>o.status==="validated").length, icon: "✅", color: "#10B981" },
                  { label: "Obj. en cours", value: activeSdr.objectives.filter(o=>o.status==="pending").length, icon: "⏳", color: V.orange },
                ].map(k => (
                  <div key={k.label} style={{ ...card(), marginBottom: 0, textAlign: "center", padding: "14px 8px" }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: V.s5, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.8px" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Scores par section */}
              <div style={card()}>
                <span style={sLabel}>Performance par section</span>
                {CRITERIA.map(section => {
                  const avg = activeSdr.reviews.length ? Math.round(activeSdr.reviews.reduce((a,r)=>a+sectionPct(section,r.scores||{}),0)/activeSdr.reviews.length) : 0;
                  return <SectionBar key={section.section} label={section.section} pct={avg} color={section.color} icon={section.icon}/>;
                })}
              </div>

              {/* Objectifs en cours */}
              {activeSdr.objectives.filter(o=>o.status==="pending").length > 0 && (
                <div style={card()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={sLabel}>⏳ Objectifs en cours</span>
                    <button onClick={() => clearAllObjectives(activeSdr.uid)} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>🗑️ Effacer</button>
                  </div>
                  {activeSdr.objectives.filter(o=>o.status==="pending").map((obj,i) => (
                    <div key={obj.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${priorityColor[obj.priority]||V.border}30`, borderLeft: `3px solid ${priorityColor[obj.priority]||V.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: V.white, marginBottom: 4 }}>{obj.title}</div>
                      <div style={{ fontSize: 12, color: V.s5, marginBottom: 6 }}>{obj.description}</div>
                      {obj.example && <div style={{ fontSize: 11, color: V.neon, fontStyle: "italic" }}>💬 "{obj.example}"</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Derniers calls */}
              <div style={card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={sLabel}>📋 Historique des calls</span>
                </div>
                {activeSdr.reviews.slice(0,10).map(r => {
                  const m = getMedal(r.globalPct||0);
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 8, cursor: "pointer" }}
                      onClick={() => { setSelectedReview(r); setPage("detail"); }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: `${m.color}15`, border: `1.5px solid ${m.color}40`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 10 }}>{m.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: m.color }}>{r.globalPct||0}%</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: V.white }}>{r.prospectName||"Prospect"}{r.company?` · ${r.company}`:""}</div>
                        <div style={{ fontSize: 11, color: V.s5 }}>{r.callDate||new Date(r.createdAt?.toDate?.()).toLocaleDateString("fr-FR")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Stars count={m.stars} color={m.color}/>
                        <span style={{ fontSize: 11, color: V.s5 }}>Voir →</span>
                        <button onClick={e=>{e.stopPropagation();if(window.confirm("Supprimer ?"))deleteReview(r.id);}} style={{ background:"#EF444415",border:"none",borderRadius:6,color:"#EF4444",fontSize:10,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit" }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Badges débloqués */}
              {(() => {
                const sdrReviews = activeSdr.reviews;
                const sdrObjs = activeSdr.objectives;
                const earned = BADGES.filter(b => b.condition(sdrReviews, sdrObjs));
                if (!earned.length) return null;
                return (
                  <div style={card()}>
                    <span style={sLabel}>🛡️ Écussons débloqués ({earned.length}/{BADGES.length})</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {earned.map(b => (
                        <div key={b.id} title={b.desc} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 10px", background: "rgba(255,255,255,0.05)", border: `1px solid ${V.neon}30`, borderRadius: 10, minWidth: 60 }}>
                          <div style={{ fontSize: 22 }}>{b.icon}</div>
                          <div style={{ fontSize: 8, color: V.neon, textAlign: "center", fontWeight: 700 }}>{b.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>)}
          </>);
        })()}

        {/* ══ DÉTAIL ══════════════════════════════════════════════════════════════ */}
        {page === "detail" && selectedReview && (() => {
          const r = selectedReview;
          const m = getMedal(r.globalPct || 0);
          const canDelete = r.userId === user?.uid || isAdmin;
          const rLucScore = r.lucScore;
          const rRated = r.selfScores ? CRITERIA.flatMap(s=>s.items.map(i=>i.id)).filter(id => (r.selfScores[id]??0)>0 && (r.scores?.[id]??0)>0) : [];
          const rAligned = rRated.filter(id => r.scores[id] === r.selfScores[id]).length;
          const rOverrated = rRated.filter(id => (r.selfScores[id]||0) > (r.scores[id]||0)).length;
          const rUnderrated = rRated.filter(id => (r.selfScores[id]||0) < (r.scores[id]||0)).length;

          return (<>
            {/* Back + delete */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <button onClick={() => setPage("history")} style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${V.border}`, borderRadius: 10, color: V.s5, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Retour</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{r.prospectName || "Prospect"}</div>
                <div style={{ fontSize: 11, color: V.s5 }}>{r.callDate} · {r.sdrName}</div>
              </div>
              {canDelete && (
                <button onClick={() => { if (window.confirm("Supprimer ce call ?")) deleteReview(r.id); }} style={{ background: "#EF444415", border: "1px solid #EF444430", borderRadius: 8, color: "#EF4444", fontSize: 12, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>🗑️</button>
              )}
            </div>

            {/* Verdict header */}
            <div style={{ ...card(), background: `linear-gradient(135deg, ${m.color}15, rgba(255,255,255,0.03))`, border: `1px solid ${m.color}30`, textAlign: "center", padding: "24px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 6, filter: `drop-shadow(0 0 12px ${m.color})` }}>{m.icon}</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: m.color, letterSpacing: "-2px", lineHeight: 1 }}>{r.globalPct || 0}%</div>
              <div style={{ fontSize: 14, color: V.white, fontWeight: 700, marginTop: 4 }}>{m.label}</div>
              {rLucScore !== null && rLucScore !== undefined && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, background: "#8B5CF615", border: "1px solid #8B5CF640", borderRadius: 20, padding: "5px 16px" }}>
                  <span style={{ fontSize: 12 }}>🧠</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#8B5CF6" }}>LUC {rLucScore}</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 16 }}>
                {CRITERIA.map(s => (
                  <div key={s.section} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 4px" }}>
                    <div style={{ fontSize: 14, marginBottom: 3 }}>{s.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{sectionPct(s, r.scores||{})}%</div>
                    <div style={{ fontSize: 7, color: V.s5, textTransform: "uppercase" }}>{s.section.split(" ")[0]}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Marc verdict */}
            {r.globalComment && (
              <div style={{ ...card(), border: `1px solid ${V.neon}20`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${V.neon}15`, border: `2px solid ${V.neon}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🧑‍💼</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: V.white }}>Marc</div>
                    <div style={{ fontSize: 10, color: V.neon, letterSpacing: "1px" }}>Coach Sales · Vertuoza</div>
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                  <p style={{ color: V.bg1, fontSize: 13.5, lineHeight: 1.9, margin: 0 }}>{r.globalComment}</p>
                </div>
                {(r.globalStrengths?.length > 0 || r.globalImprovements?.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {r.globalStrengths?.length > 0 && <div>
                      <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{t("did_well")}</div>
                      {r.globalStrengths.map((s,i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "5px 10px", background: "#10B98110", borderRadius: 8, marginBottom: 5, borderLeft: "2px solid #10B981" }}>{s}</div>)}
                    </div>}
                    {r.globalImprovements?.length > 0 && <div>
                      <div style={{ fontSize: 10, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{t("working_on")}</div>
                      {r.globalImprovements.map((s,i) => <div key={i} style={{ fontSize: 12, color: V.bg1, padding: "5px 10px", background: `${V.orange}10`, borderRadius: 8, marginBottom: 5, borderLeft: `2px solid ${V.orange}` }}>{s}</div>)}
                    </div>}
                  </div>
                )}
              </div>
            )}

            {/* Miroir si autoéval */}
            {r.selfScores && rRated.length > 0 && (
              <div style={{ ...card(), border: "1px solid #8B5CF650", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🪞</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: V.white }}>Miroir — Toi vs Marc</div>
                      <div style={{ fontSize: 10, color: V.s5 }}>Ta lucidité sur ce call</div>
                    </div>
                  </div>
                  {rLucScore !== null && rLucScore !== undefined && (
                    <div style={{ background: "#8B5CF620", border: "1px solid #8B5CF650", borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#8B5CF6" }}>{rLucScore}</div>
                      <div style={{ fontSize: 8, color: V.s5, textTransform: "uppercase" }}>Score LUC</div>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
                  {[{label:"Aligné",value:rAligned,color:"#10B981",icon:"🎯"},{label:"Surestimé",value:rOverrated,color:"#EF4444",icon:"⚠️"},{label:"Sous-estimé",value:rUnderrated,color:"#F59E0B",icon:"💪"}].map(k => (
                    <div key={k.label} style={{ textAlign:"center", background:`${k.color}08`, border:`1px solid ${k.color}25`, borderRadius:10, padding:"8px 6px" }}>
                      <div style={{ fontSize:16 }}>{k.icon}</div>
                      <div style={{ fontSize:18, fontWeight:900, color:k.color }}>{k.value}</div>
                      <div style={{ fontSize:9, color:V.s5 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                {/* Top gaps */}
                {rRated.filter(id => Math.abs((r.selfScores[id]||0)-(r.scores[id]||0)) >= 2).slice(0,3).map(id => {
                  const c = CRITERIA.flatMap(s=>s.items).find(ci=>ci.id===id);
                  const diff = (r.selfScores[id]||0) - (r.scores[id]||0);
                  const sdrSc = SCORES.find(s=>s.value===(r.selfScores[id]||0));
                  const coachSc = SCORES.find(s=>s.value===(r.scores[id]||0));
                  const col = diff > 0 ? "#EF4444" : "#F59E0B";
                  return (
                    <div key={id} style={{ background:`${col}08`, border:`1px solid ${col}20`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:V.white, marginBottom:4 }}>{c?.label}</div>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
                        <span style={{ fontSize:10, background:`${sdrSc?.color}20`, color:sdrSc?.color, padding:"2px 8px", borderRadius:10, fontWeight:700 }}>Toi: {sdrSc?.label}</span>
                        <span style={{ color:col }}>→</span>
                        <span style={{ fontSize:10, background:`${coachSc?.color}20`, color:coachSc?.color, padding:"2px 8px", borderRadius:10, fontWeight:700 }}>Marc: {coachSc?.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:col, fontStyle:"italic" }}>
                        {diff > 0 ? "⚠️ Angle mort identifié" : "💪 Tu te sous-estimais"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Critères avec Marc te parle */}
            {CRITERIA.map(section => (
              <div key={section.section} style={{ ...card(), marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{section.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: section.color, textTransform: "uppercase", letterSpacing: "1px" }}>{section.section}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: section.color }}>{sectionPct(section, r.scores||{})}%</span>
                </div>
                {section.items.map(c => {
                  const sc = SCORES.find(s => s.value === (r.scores?.[c.id]||0));
                  const selfSc = r.selfScores ? SCORES.find(s => s.value === (r.selfScores[c.id]||0)) : null;
                  const just = r.justifications?.[c.id];
                  const expert = r.expertScripts?.[c.id];
                  const up = r.levelUp?.[c.id];
                  return (
                    <div key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 14, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: section.color, flexShrink: 0 }}/>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: V.white }}>{c.label}</span>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          {selfSc && selfSc.value > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: `${selfSc.color}15`, color: selfSc.color, border: `1px solid ${selfSc.color}30` }}>Toi: {selfSc.label}</span>}
                          {sc && sc.value > 0 && <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 10, background: `${sc.color}20`, color: sc.color, fontWeight: 700, border: `1px solid ${sc.color}40` }}>Marc: {sc.label}</span>}
                        </div>
                      </div>
                      {just && (
                        <div style={{ marginLeft: 13, marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${V.neon}15`, border: `1.5px solid ${V.neon}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>🧑‍💼</div>
                            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "0 10px 10px 10px", padding: "9px 12px", flex: 1 }}>
                              <div style={{ fontSize: 8, color: V.neon, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "1px" }}>Marc te parle</div>
                              <div style={{ fontSize: 12.5, color: V.bg1, lineHeight: 1.8 }}>{just}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {expert && (
                        <div style={{ marginLeft: 13, marginBottom: 6 }}>
                          <div style={{ background: `${V.blue}12`, border: `1px solid ${V.neon}20`, borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 8, color: V.neon, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>🎙️ Ce que Marc aurait dit</div>
                            <div style={{ fontSize: 12, color: V.bg1, lineHeight: 1.7, fontStyle: "italic" }}>"{expert}"</div>
                          </div>
                        </div>
                      )}
                      {up?.scripts?.length > 0 && (
                        <div style={{ marginLeft: 13 }}>
                          <div style={{ fontSize: 8, color: V.orange, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>💬 Phrases à utiliser</div>
                          {up.scripts.map((s,i) => (
                            <div key={i} style={{ background: `${V.orange}08`, border: `1px solid ${V.orange}20`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: V.s5, fontStyle: "italic", marginBottom: 4, lineHeight: 1.5 }}>
                              <span style={{ color: V.orange, fontWeight: 800, fontStyle: "normal" }}>{i+1}. </span>"{s}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>);
        })()}
      </div>

      {/* XP Level Widget — always visible */}
      <XPWidget xp={myXP} reviews={reviews} objectives={objectives}/>
    </div>
  );
}
