import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Briefcase, Code2, Headphones, Megaphone, Zap, Send, RefreshCw, 
  CheckCircle2, AlertTriangle, ArrowRight, Layout, History, Lightbulb, Award, User
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE FIREBASE (¡EDITA ESTO!) ---
// Ve a https://console.firebase.google.com/ > Tu Proyecto > Configuración del Proyecto
// Copia y pega los valores aquí.
const firebaseConfig = {
  apiKey: "TU_API_KEY_DE_FIREBASE_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Inicialización segura
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'prompt-coach-v1'; // Identificador para la DB

// --- 2. API KEY DE GEMINI (Hardcoded) ---
const HARDCODED_API_KEY = 'AIzaSyAtpltu7Eufur_JXdvUxvt_EUQ_AqHhmXo';

// --- Roles & System Prompts ---
const ROLES = {
  SALES: {
    id: 'sales',
    label: 'Ventas (CRM)',
    icon: <Briefcase />,
    color: 'from-blue-600 to-cyan-500',
    context: 'Zoho CRM, Gestión de Leads, Pipelines, Correos de venta en frío, Negociación.',
    systemGen: 'Genera una situación difícil y específica para un ejecutivo de ventas que usa Zoho CRM. La situación debe requerir redactar un correo persuasivo a un cliente difícil, o pedirle a la IA que analice datos de ventas complejos. No des la solución.'
  },
  MARKETING: {
    id: 'marketing',
    label: 'Marketing',
    icon: <Megaphone />,
    color: 'from-pink-600 to-rose-500',
    context: 'Zoho Campaigns, Redes Sociales, Copywriting, Segmentación de audiencia.',
    systemGen: 'Genera un desafío de creatividad para un marketer digital usando Zoho Campaigns. Ejemplo: Crear asuntos para A/B testing, redactar un post para LinkedIn sobre un producto B2B aburrido, o segmentar una audiencia compleja.'
  },
  SUPPORT: {
    id: 'support',
    label: 'Soporte / IT',
    icon: <Headphones />,
    color: 'from-violet-600 to-purple-500',
    context: 'Zoho Desk, Google Workspace (Gmail, Drive), Atención al cliente, Resolución de tickets.',
    systemGen: 'Genera un escenario de soporte técnico tenso. Ejemplo: Un cliente VIP enojado por un fallo en Google Workspace o Zoho Desk. El usuario debe usar la IA para redactar una respuesta empática y técnica paso a paso.'
  },
  DEV: {
    id: 'dev',
    label: 'Desarrollo',
    icon: <Code2 />,
    color: 'from-emerald-600 to-green-500',
    context: 'Zoho Creator, Deluge Script, Integraciones API, Google Apps Script.',
    systemGen: 'Genera un problema técnico que requiera generar código. Ejemplo: "Necesito un script en Deluge para Zoho Creator que actualice X campo cuando Y sucede". El desafío es que la petición inicial suele ser vaga y necesita especificaciones técnicas.'
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState(() => localStorage.getItem('pm_username') || '');
  const [view, setView] = useState('setup'); 
  const [selectedRole, setSelectedRole] = useState(null);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [result, setResult] = useState(null); 
  const [history, setHistory] = useState([]);

  // Auth Init
  useEffect(() => {
    signInAnonymously(auth).catch((err) => console.error("Error Auth:", err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Auto-login check
  useEffect(() => {
    if (username) {
      setView('dashboard');
    }
  }, [username]);

  // History Listener
  useEffect(() => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'users', user.uid, 'scenarios'),
        orderBy('timestamp', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snap) => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firestore error:", e);
    }
  }, [user]);

  // Gemini Helper
  const callGemini = async (prompt, systemInstruction = '', isJson = false) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${HARDCODED_API_KEY}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: isJson ? { responseMimeType: "application/json" } : {}
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Error en Gemini API");
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return isJson ? JSON.parse(text) : text;
  };

  // Actions
  const handleSetup = () => {
    if (username.trim()) {
      localStorage.setItem('pm_username', username);
      setView('dashboard');
    }
  };

  const generateScenario = async (roleKey) => {
    setIsLoading(true);
    setLoadingText('Analizando contexto y generando desafío...');
    setResult(null);
    setUserPrompt('');
    
    const role = ROLES[roleKey];
    setSelectedRole(role);
    setView('arena');

    try {
      const scenarioText = await callGemini(
        "Genera un escenario ahora.", 
        role.systemGen + " El formato de salida debe ser solo el texto descriptivo del problema."
      );
      setCurrentScenario(scenarioText);
    } catch (e) {
      alert("Error generando escenario: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitPrompt = async () => {
    if (!userPrompt.trim()) return;
    setIsLoading(true);
    setLoadingText('El Coach está analizando tu estrategia...');

    try {
      const simulationPromise = callGemini(
        userPrompt, 
        `Actúa como la herramienta o persona a la que se dirige el usuario en este contexto: ${selectedRole.context}. Contexto del escenario: ${currentScenario}. Responde a su prompt tal cual, sin corregirlos.`
      );

      const coachPrompt = `
        Escenario: ${currentScenario}
        Prompt del Usuario: "${userPrompt}"
        Rol del Usuario: ${selectedRole.label}
        Tarea:
        1. Evalúa el prompt del 1 al 100.
        2. Identifica 2 fortalezas y 2 debilidades.
        3. Reescribe el prompt para que sea PERFECTO (Expert Level).
        4. Explica POR QUÉ el nuevo prompt es mejor.
        Salida JSON: { "score": number, "critique": string, "improved_prompt": string, "explanation": string }
      `;
      
      const coachPromise = callGemini(coachPrompt, "Eres un experto Ingeniero de Prompts.", true);

      const [simResponse, coachAnalysis] = await Promise.all([simulationPromise, coachPromise]);

      const improvedSimResponse = await callGemini(
        coachAnalysis.improved_prompt,
        `Actúa como la herramienta o persona a la que se dirige el usuario en este contexto: ${selectedRole.context}. Contexto del escenario: ${currentScenario}.`
      );

      setResult({
        userResponse: simResponse,
        coach: coachAnalysis,
        improvedResponse: improvedSimResponse
      });

      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'scenarios'), {
          role: selectedRole.label,
          scenario: currentScenario,
          userPrompt: userPrompt,
          coachData: coachAnalysis,
          timestamp: serverTimestamp()
        });
      }

    } catch (e) {
      console.error(e);
      alert("Error en el análisis: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-200 font-sans">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Zap size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Prompt Coach</h1>
          <p className="text-slate-400 text-center mb-8 text-sm">Entrenamiento de IA para equipos de alto rendimiento.</p>
          <div className="space-y-6">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Nombre de Usuario</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-500" size={18} />
                <input 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Ej. Juan Pérez"
                  onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
                />
              </div>
            </div>
            <button 
              onClick={handleSetup}
              disabled={!username.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              Comenzar Entrenamiento
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col h-screen overflow-hidden">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setView('dashboard')}>
          <Zap className="text-blue-500" />
          <span className="font-bold text-lg tracking-tight">Prompt Coach</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
             <span className="block text-sm font-medium text-white">{username}</span>
             <span className="block text-xs text-slate-500">Usuario</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-sm font-bold border border-slate-700 shadow-inner">
            {username.substring(0,2).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex">
        {view === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-8 animate-in fade-in duration-500">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold mb-2 text-white">Selecciona tu Área</h2>
              <p className="text-slate-400 mb-10 text-lg">La IA generará un desafío único basado en situaciones reales.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {Object.values(ROLES).map((role) => (
                  <button
                    key={role.id}
                    onClick={() => generateScenario(role.id)}
                    className="group relative overflow-hidden bg-slate-900 border border-slate-800 hover:border-blue-500/50 p-6 rounded-2xl text-left transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10"
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${role.color} opacity-5 rounded-bl-full transition-transform group-hover:scale-110 group-hover:opacity-10`} />
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                      {role.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-white">{role.label}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{role.context}</p>
                    <div className="mt-6 flex items-center text-blue-400 text-sm font-bold opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                      INICIAR RETO <ArrowRight size={16} className="ml-2" />
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-800 pt-8">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-300">
                  <History size={18} className="text-slate-500" />
                  Intentos Recientes
                </h3>
                <div className="space-y-3">
                  {history.slice(0, 3).map(h => (
                    <div key={h.id} className="bg-slate-900/50 hover:bg-slate-900 p-4 rounded-lg border border-slate-800 flex justify-between items-center transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">{h.role}</span>
                        <p className="text-sm text-slate-300 truncate">{h.scenario}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-md text-sm font-bold border ${h.coachData.score >= 80 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                        {h.coachData.score} pts
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="p-8 text-center bg-slate-900/30 rounded-lg border border-slate-800 border-dashed">
                      <p className="text-slate-500 text-sm">Aún no has completado ningún desafío.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'arena' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden animate-in slide-in-from-right-8 duration-500">
            <div className="bg-slate-900 border-b border-slate-800 p-6 shadow-sm shrink-0">
              <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-2 mb-3">
                   <button onClick={() => setView('dashboard')} className="text-slate-500 hover:text-white transition-colors flex items-center gap-1 text-sm font-medium">
                     <Layout size={16} /> Dashboard
                   </button>
                   <span className="text-slate-700">/</span>
                   <span className={`text-xs font-bold px-2 py-1 rounded bg-slate-800 text-slate-300 uppercase`}>
                     {selectedRole?.label}
                   </span>
                </div>
                <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
                  <h2 className="text-lg font-medium text-blue-100 leading-relaxed">
                    <span className="text-blue-400 font-bold mr-2 uppercase tracking-wide text-xs block mb-1">Misión Actual:</span>
                    {currentScenario}
                  </h2>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
              <div className="max-w-5xl mx-auto space-y-8 pb-20">
                {!result && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-1 shadow-2xl">
                      <textarea 
                        value={userPrompt}
                        onChange={e => setUserPrompt(e.target.value)}
                        placeholder={`Escribe aquí tu prompt...`}
                        className="w-full min-h-[200px] bg-slate-950 rounded-xl p-6 text-slate-200 focus:outline-none resize-none text-base leading-relaxed placeholder:text-slate-600"
                      />
                      <div className="p-3 flex justify-between items-center bg-slate-900 rounded-b-xl border-t border-slate-800">
                        <span className="text-xs text-slate-500 px-2">Presiona enviar para recibir feedback</span>
                        <button 
                          onClick={submitPrompt}
                          disabled={isLoading || !userPrompt.trim()}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/25"
                        >
                          {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
                          {isLoading ? 'Analizando...' : 'Enviar Prompt'}
                        </button>
                      </div>
                    </div>
                    {isLoading && (
                       <div className="text-center mt-12">
                         <div className="inline-block p-4 rounded-full bg-slate-900 border border-slate-800 mb-4 animate-bounce"><Zap className="text-blue-500" size={24} /></div>
                         <p className="text-slate-400 animate-pulse font-medium">{loadingText}</p>
                       </div>
                    )}
                  </div>
                )}

                {result && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center justify-between bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
                      <div><h3 className="text-2xl font-bold text-white mb-2">Análisis del Coach</h3></div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className={`text-5xl font-black ${result.coach.score >= 80 ? 'text-green-400' : 'text-amber-400'}`}>{result.coach.score}</div>
                          <div className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Puntaje</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 opacity-90">
                          <p className="text-xs text-slate-500 mb-3 font-mono font-bold">TU PROMPT:</p>
                          <p className="text-sm text-slate-300 italic mb-6 border-l-2 border-slate-700 pl-4">"{userPrompt}"</p>
                          <p className="text-xs text-slate-500 mb-3 font-mono font-bold">RESULTADO GENERADO:</p>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded-lg border border-slate-800/50 max-h-60 overflow-y-auto">{result.userResponse}</div>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
                          <h4 className="flex items-center gap-2 text-red-400 font-bold mb-3 text-sm uppercase tracking-wide"><AlertTriangle size={18} /> Áreas de Mejora</h4>
                          <p className="text-sm text-red-100/80 leading-relaxed">{result.coach.critique}</p>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="bg-slate-900 rounded-xl border border-emerald-500/30 p-6 shadow-2xl shadow-emerald-900/10 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                          <p className="text-xs text-emerald-500 mb-3 font-mono font-bold">PROMPT OPTIMIZADO:</p>
                          <p className="text-sm text-emerald-100 italic mb-6 border-l-2 border-emerald-500/30 pl-4">"{result.coach.improved_prompt}"</p>
                          <p className="text-xs text-emerald-500 mb-3 font-mono font-bold">RESULTADO GENERADO:</p>
                          <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950 p-4 rounded-lg border border-slate-800/50 max-h-60 overflow-y-auto">{result.improvedResponse}</div>
                        </div>
                         <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6">
                          <h4 className="flex items-center gap-2 text-blue-400 font-bold mb-3 text-sm uppercase tracking-wide"><Lightbulb size={18} /> Análisis del Experto</h4>
                          <p className="text-sm text-blue-100/80 leading-relaxed">{result.coach.explanation}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center pt-12 pb-20">
                      <button onClick={() => setView('dashboard')} className="group bg-slate-800 hover:bg-slate-700 text-white px-10 py-4 rounded-full font-bold transition-all border border-slate-700 hover:border-slate-500 hover:scale-105 flex items-center gap-3 shadow-xl">
                        <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-500"/> Nuevo Entrenamiento
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
