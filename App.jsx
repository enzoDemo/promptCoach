import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// Eliminamos remark-gfm para asegurar compatibilidad en la compilación
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
  CheckCircle2, AlertTriangle, ArrowRight, Layout, History, Lightbulb, Award, User, FileText
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAJpQoQr11wFQtGfUBw33uLIhDikmT6WO8",
  authDomain: "prompt-coach-fdcf8.firebaseapp.com",
  projectId: "prompt-coach-fdcf8",
  storageBucket: "prompt-coach-fdcf8.firebasestorage.app",
  messagingSenderId: "818629881362",
  appId: "1:818629881362:web:761f68b1bba1f56a8772cb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'prompt-coach-v1'; 

// --- 2. API KEY DE GEMINI ---
const HARDCODED_API_KEY = 'AIzaSyAtpltu7Eufur_JXdvUxvt_EUQ_AqHhmXo';

// --- PROMPTS DE GENERACIÓN AVANZADOS ---
const BASE_INSTRUCTION = `
  Genera un escenario de entrenamiento detallado.
  ESTRUCTURA OBLIGATORIA DE LA RESPUESTA (Usa Markdown estándar):
  
  ### Contexto
  [Describe quién es el usuario y qué problema reportó el cliente o jefe inicialmente]

  ### El Hallazgo (Investigación)
  [Describe qué descubrió el usuario tras investigar. Causa raíz, datos ocultos, logs, etc.]

  ### Datos Adjuntos
  [Genera un bloque de código (usando triple backticks) con datos simulados realistas que respalden el hallazgo (CSV, JSON, XML o Log). El usuario deberá usar estos datos en su prompt]

  ### Tu Misión
  [Define qué debe lograr el usuario. Ej: Redactar un correo explicando esto, crear un reporte, o pedirle a la IA que analice el adjunto]
`;

const ROLES = {
  sales: {
    id: 'sales',
    label: 'Ventas (CRM)',
    icon: <Briefcase />,
    color: 'from-blue-600 to-cyan-500',
    context: 'Zoho CRM, Ventas B2B.',
    systemGen: `Actúa como Gerente de Ventas usando Zoho CRM. ${BASE_INSTRUCTION} Ejemplo de datos: Un CSV con leads duplicados o historial de compras.`
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    icon: <Megaphone />,
    color: 'from-pink-600 to-rose-500',
    context: 'Zoho Campaigns, Marketing Digital.',
    systemGen: `Actúa como Director de Marketing usando Zoho Campaigns. ${BASE_INSTRUCTION} Ejemplo de datos: Tabla con métricas de Open Rate bajas o JSON de segmentación fallida.`
  },
  support: {
    id: 'support',
    label: 'Soporte / IT',
    icon: <Headphones />,
    color: 'from-violet-600 to-purple-500',
    context: 'Zoho Desk, Google Workspace.',
    systemGen: `Actúa como Coordinador de Soporte Técnico. ${BASE_INSTRUCTION} Ejemplo de datos: Un Log de error del servidor, cabeceras de correo (headers) o configuración DNS.`
  },
  dev: {
    id: 'dev',
    label: 'Desarrollo',
    icon: <Code2 />,
    color: 'from-emerald-600 to-green-500',
    context: 'Zoho Creator, Deluge, API Integrations.',
    systemGen: `Actúa como Lead Developer. ${BASE_INSTRUCTION} Ejemplo de datos: Un snippet de código Deluge con un error lógico o una respuesta JSON de API con error 400.`
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

  useEffect(() => {
    const savedUser = localStorage.getItem('pm_username');
    if (savedUser) {
      setUsername(savedUser);
      setView('dashboard');
    }
  }, []);

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
    setLoadingText('Analizando logs y generando caso realista...');
    setResult(null);
    setUserPrompt('');
    
    const role = ROLES[roleKey];
    if (!role) { alert("Error: Rol no encontrado"); setIsLoading(false); return; }

    setSelectedRole(role);
    setView('arena');

    try {
      const scenarioText = await callGemini(
        "Genera un nuevo escenario ahora.", 
        role.systemGen
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
    setLoadingText('Evaluando tu solución...');

    try {
      const simulationPromise = callGemini(
        userPrompt, 
        `Actúa como la herramienta o persona a la que se dirige el usuario. Contexto: ${currentScenario}. Responde al prompt del usuario de forma realista.`
      );

      const coachPrompt = `
        Contexto del Escenario: ${currentScenario}
        Prompt del Usuario: "${userPrompt}"
        
        Evalúa si el usuario resolvió la misión y usó correctamente los datos adjuntos si existían.
        Salida JSON: { "score": number, "critique": string, "improved_prompt": string, "explanation": string }
      `;
      
      const coachPromise = callGemini(coachPrompt, "Eres un Coach experto. Sé crítico pero constructivo.", true);

      const [simResponse, coachAnalysis] = await Promise.all([simulationPromise, coachPromise]);

      const improvedSimResponse = await callGemini(
        coachAnalysis.improved_prompt,
        `Actúa como la herramienta/persona del escenario. Contexto: ${currentScenario}.`
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

  // Componente para renderizar Markdown con estilo consistente
  // NOTA: Se ha eliminado remarkGfm para evitar errores de compilación, 
  // pero react-markdown procesará correctamente negritas, listas y bloques de código.
  const MarkdownRenderer = ({ content }) => (
    <ReactMarkdown 
      components={{
        h3: ({node, ...props}) => <h3 className="text-lg font-bold text-white mt-4 mb-2 uppercase tracking-wide flex items-center gap-2 border-b border-slate-700 pb-1" {...props} />,
        p: ({node, ...props}) => <p className="text-slate-300 mb-3 leading-relaxed" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1" {...props} />,
        li: ({node, ...props}) => <li className="ml-2" {...props} />,
        strong: ({node, ...props}) => <strong className="text-blue-200 font-bold" {...props} />,
        code: ({node, inline, className, children, ...props}) => {
          return !inline ? (
            <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 my-4 font-mono text-xs text-blue-300 overflow-x-auto shadow-inner relative group">
              <div className="absolute top-2 right-2 opacity-50 text-[10px] uppercase tracking-wider text-slate-500">Archivo Simulado</div>
              <pre {...props}>{children}</pre>
            </div>
          ) : (
            <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-200 font-mono text-sm" {...props}>
              {children}
            </code>
          )
        },
        // Estilos básicos para tablas si el markdown las genera
        table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full text-left text-sm whitespace-nowrap" {...props} /></div>,
        th: ({node, ...props}) => <th className="bg-slate-800 font-semibold p-2 border-b border-slate-700 text-slate-200" {...props} />,
        td: ({node, ...props}) => <td className="p-2 border-b border-slate-800 text-slate-400" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );

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
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 backdrop-blur-sm z-50">
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
              <p className="text-slate-400 mb-10 text-lg">Entrena con situaciones reales que incluyen logs, datos y contextos complejos.</p>
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
                        <p className="text-sm text-slate-300 truncate opacity-50">Escenario completado...</p>
                      </div>
                      <div className={`px-3 py-1 rounded-md text-sm font-bold border ${h.coachData.score >= 80 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                        {h.coachData.score} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'arena' && (
          <div className="flex-1 h-full overflow-y-auto animate-in slide-in-from-right-8 duration-500 bg-slate-950 scroll-smooth">
            
            <div className="bg-slate-900 border-b border-slate-800 p-6 shadow-sm">
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
                
                {/* MISSION BOX RENOVADA CON MARKDOWN */}
                <div className="bg-gradient-to-b from-blue-900/10 to-blue-900/5 border border-blue-500/20 p-6 rounded-xl shadow-lg">
                  <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold uppercase tracking-wider text-xs border-b border-blue-500/20 pb-2">
                    <FileText size={16} /> Misión Activa
                  </div>
                  <MarkdownRenderer content={currentScenario} />
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="max-w-5xl mx-auto space-y-8 pb-20">
                {!result && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-1 shadow-2xl mt-4">
                      <textarea 
                        value={userPrompt}
                        onChange={e => setUserPrompt(e.target.value)}
                        placeholder={`Escribe tu prompt para resolver el caso. \n\nPuedes copiar y pegar los datos del archivo simulado si es necesario...`}
                        className="w-full min-h-[200px] bg-slate-950 rounded-xl p-6 text-slate-200 focus:outline-none resize-none text-base leading-relaxed placeholder:text-slate-600 font-mono"
                      />
                      <div className="p-3 flex justify-between items-center bg-slate-900 rounded-b-xl border-t border-slate-800">
                        <span className="text-xs text-slate-500 px-2">Incluye variables o datos del escenario en tu prompt</span>
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
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 pt-8">
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
                          <div className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800/50 max-h-96 overflow-y-auto">
                             <MarkdownRenderer content={result.userResponse} />
                          </div>
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
                          <div className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800/50 max-h-96 overflow-y-auto">
                            <MarkdownRenderer content={result.improvedResponse} />
                          </div>
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
