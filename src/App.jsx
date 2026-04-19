import { useState, useRef, useCallback } from "react";

const API_URL = "/api/claude";

const SYSTEM_PROMPT = `You are Buildify AI, an expert web developer and designer. Your job is to help users create websites by:

1. Building complete, beautiful, functional HTML/CSS/JS code
2. Detecting when a feature needs an external service (database, auth, payments, storage, email, maps, etc.)
3. Asking smart questions about integrations BEFORE writing code that requires them
4. Returning responses in this strict JSON format ONLY — no markdown fences, no extra text:

{
  "message": "Friendly message in Brazilian Portuguese about what you did or need",
  "code": "Complete HTML/CSS/JS code as a single string (or null if asking questions first)",
  "needsIntegrations": [
    {
      "id": "unique_snake_case_id",
      "name": "Service Name",
      "icon": "emoji",
      "description": "Why this is needed",
      "question": "Question to ask the user (in Portuguese)",
      "options": ["Usar minha própria API key", "Pular por agora", "Usar modo demo"]
    }
  ],
  "suggestions": ["sugestão 1", "sugestão 2", "sugestão 3"]
}

Rules:
- ALWAYS return valid JSON, nothing else
- If no integrations needed: "needsIntegrations": []
- Code must be complete, self-contained HTML with inline CSS and JS
- Make beautiful, modern, responsive designs
- Use Google Fonts via @import inside the style tag
- Code must work perfectly inside an iframe
- If user provides API keys in context, USE them in the generated code
- Write all messages and questions in Brazilian Portuguese`;

const STARTER_PROMPTS = [
  { icon: "🛍️", label: "E-commerce", prompt: "Crie uma loja virtual moderna com catálogo de produtos, carrinho e checkout" },
  { icon: "📋", label: "Landing Page", prompt: "Crie uma landing page profissional para startup de tecnologia com hero, features e CTA" },
  { icon: "📊", label: "Dashboard", prompt: "Crie um dashboard administrativo com gráficos, tabelas e métricas em tempo real" },
  { icon: "📝", label: "Blog", prompt: "Crie um blog elegante com lista de posts, página de artigo e comentários" },
  { icon: "🍽️", label: "Restaurante", prompt: "Crie um site de restaurante com cardápio, reservas online e galeria" },
  { icon: "💼", label: "Portfólio", prompt: "Crie um portfólio profissional com projetos, habilidades e formulário de contato" },
];

export default function App() {
  const [email, setEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentCode, setCurrentCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const [pendingIntegrations, setPendingIntegrations] = useState([]);
  const [integrationAnswers, setIntegrationAnswers] = useState({});
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [apiKeys, setApiKeys] = useState({});
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [projectName, setProjectName] = useState("Meu Projeto");
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isCopied, setIsCopied] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setIsLoggedIn(true);
    setMessages([{ role: "assistant", content: "👋 Olá! Sou o Buildify AI, seu assistente para criar sites incríveis.\n\nDescreva o site que você quer construir ou escolha um template abaixo!", time: new Date() }]);
    scrollToBottom();
  };

  const appendMessage = (msg) => setMessages(prev => { const next = [...prev, msg]; scrollToBottom(); return next; });

  const callAPI = async (msgs) => {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, system: SYSTEM_PROMPT, messages: msgs }),
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text || "{}";
    try { return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); }
    catch { return { message: raw, code: null, needsIntegrations: [], suggestions: [] }; }
  };

  const sendMessage = useCallback(async (text = prompt) => {
    if (!text.trim() || isLoading) return;
    setPrompt(""); setIsLoading(true); setSuggestions([]);
    appendMessage({ role: "user", content: text, time: new Date() });
    const hist = messages.slice(-6).map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
    const ctx = { role: "user", content: `${text}\n\n[hasCode=${!!currentCode}, keys=${JSON.stringify(apiKeys)}]` };
    try {
      const parsed = await callAPI([...hist, ctx]);
      if (parsed.needsIntegrations?.length > 0) {
        setPendingIntegrations(parsed.needsIntegrations);
        setPendingPrompt(text);
        setShowIntegrationModal(true);
        appendMessage({ role: "assistant", content: parsed.message, time: new Date() });
        setIsLoading(false); return;
      }
      if (parsed.code) {
        setCurrentCode(parsed.code);
        setHistory(prev => { const next = [...prev.slice(0, historyIdx + 1), parsed.code]; setHistoryIdx(next.length - 1); return next; });
        setActiveTab("preview");
      }
      if (parsed.suggestions?.length) setSuggestions(parsed.suggestions);
      appendMessage({ role: "assistant", content: parsed.message, hasCode: !!parsed.code, time: new Date() });
    } catch { appendMessage({ role: "assistant", content: "❌ Erro ao conectar com a IA. Tente novamente.", time: new Date() }); }
    setIsLoading(false);
  }, [prompt, messages, currentCode, apiKeys, isLoading, historyIdx]);

  const handleIntegrationSubmit = async () => {
    setShowIntegrationModal(false);
    const newKeys = { ...apiKeys };
    pendingIntegrations.forEach(intg => { const ans = integrationAnswers[intg.id]; if (ans && !intg.options.includes(ans)) newKeys[intg.id] = ans; });
    setApiKeys(newKeys); setIntegrationAnswers({});
    const ctx = pendingIntegrations.map(i => `${i.name}: ${integrationAnswers[i.id] || "pulado"}`).join("; ");
    const ep = `${pendingPrompt}\n\n[Integrações: ${ctx}. Keys: ${JSON.stringify(newKeys)}. Gere o código completo agora.]`;
    setPendingIntegrations([]); setPendingPrompt("");
    await sendMessage(ep);
  };

  const undo = () => { if (historyIdx > 0) { const i = historyIdx - 1; setHistoryIdx(i); setCurrentCode(history[i]); } };
  const redo = () => { if (historyIdx < history.length - 1) { const i = historyIdx + 1; setHistoryIdx(i); setCurrentCode(history[i]); } };
  const copyCode = () => { navigator.clipboard.writeText(currentCode); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };
  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  if (!isLoggedIn) {
    return (
      <div style={s.loginWrap}>
        <div style={s.loginBg} />
        <div style={s.loginCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 38 }}>⚡</span>
            <span style={s.logoText}>Buildify</span>
          </div>
          <p style={{ color: "#888", fontSize: 15, margin: 0, textAlign: "center" }}>Crie sites profissionais com IA em segundos</p>
          <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail para começar" style={s.loginInput} />
            <button type="submit" style={s.loginBtn}>Começar a criar grátis →</button>
          </form>
          <p style={{ color: "#555", fontSize: 12 }}>Sem cartão de crédito. Grátis para sempre.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {["🤖 IA que escreve código", "🔗 Integrações inteligentes", "⚡ Preview em tempo real", "📦 Exportação HTML"].map(f => (
              <span key={f} style={s.pill}>{f}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.app}>
      <header style={s.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={s.logoSmall}>⚡ Buildify</span>
          <input value={projectName} onChange={e => setProjectName(e.target.value)} style={s.projInput} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["preview", "code"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...s.tabBtn, ...(activeTab === tab ? s.tabActive : {}) }}>
              {tab === "preview" ? "👁️ Preview" : "</> Código"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={undo} disabled={historyIdx <= 0} style={s.iconBtn}>↩</button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} style={s.iconBtn}>↪</button>
          {currentCode && <button onClick={copyCode} style={s.exportBtn}>{isCopied ? "✅ Copiado!" : "📋 Exportar HTML"}</button>}
          <div style={s.avatar}>{email[0]?.toUpperCase()}</div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <aside style={s.sidebar}>
          <div style={s.chatList}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                {msg.role !== "user" && <div style={s.botAvatar}>⚡</div>}
                <div style={{ ...s.bubble, ...(msg.role === "user" ? s.userBubble : s.botBubble) }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>{msg.content}</p>
                  {msg.hasCode && <div style={s.codeBadge}>✅ Preview atualizado</div>}
                  <span style={{ fontSize: 10, opacity: .45, display: "block", marginTop: 4 }}>{msg.time?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={s.botAvatar}>⚡</div>
                <div style={{ ...s.bubble, ...s.botBubble }}>
                  <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
                    {[0, .2, .4].map((d, i) => <span key={i} style={{ ...s.dot, animationDelay: `${d}s` }} />)}
                  </div>
                </div>
              </div>
            )}
            {suggestions.length > 0 && (
              <div>
                <p style={{ fontSize: 11, color: "#666", margin: "0 0 6px 0" }}>💡 Próximos passos:</p>
                {suggestions.map((sg, i) => <button key={i} onClick={() => sendMessage(sg)} style={s.suggBtn}>{sg}</button>)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {!currentCode && messages.length <= 1 && (
            <div style={s.starterGrid}>
              {STARTER_PROMPTS.map((sp, i) => (
                <button key={i} onClick={() => sendMessage(sp.prompt)} style={s.starterCard}>
                  <span style={{ fontSize: 22 }}>{sp.icon}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>{sp.label}</span>
                </button>
              ))}
            </div>
          )}

          <div style={s.inputRow}>
            <textarea ref={textareaRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={handleKeyDown} placeholder="Descreva o que quer construir ou modificar…" rows={3} style={s.textarea} />
            <button onClick={() => sendMessage()} disabled={!prompt.trim() || isLoading} style={s.sendBtn}>{isLoading ? "⏳" : "➤"}</button>
          </div>
        </aside>

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {activeTab === "preview"
            ? currentCode ? <iframe srcDoc={currentCode} style={s.iframe} title="preview" sandbox="allow-scripts allow-forms allow-same-origin" /> : <div style={s.empty}><span style={{ fontSize: 64 }}>⚡</span><h2 style={{ color: "#e2e8f0", margin: 0 }}>Pronto para criar</h2><p style={{ color: "#666", textAlign: "center", maxWidth: 360 }}>Descreva seu site no chat ao lado ou escolha um template</p></div>
            : currentCode ? <pre style={s.codePre}><code style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6 }}>{currentCode}</code></pre> : <div style={s.empty}><span style={{ fontSize: 64 }}>⚡</span><h2 style={{ color: "#e2e8f0", margin: 0 }}>Nenhum código ainda</h2></div>
          }
        </main>
      </div>

      {showIntegrationModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid #1e1e24" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>🔗 Configurar Integrações</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Seu site precisa de serviços externos. Configure-os abaixo:</p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
              {pendingIntegrations.map(intg => (
                <div key={intg.id} style={s.intgCard}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <span style={{ fontSize: 26 }}>{intg.icon || "🔧"}</span>
                    <div>
                      <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 15, color: "#e2e8f0" }}>{intg.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{intg.description}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 10 }}>{intg.question}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {intg.options.map(opt => (
                      <button key={opt} onClick={() => setIntegrationAnswers(prev => ({ ...prev, [intg.id]: opt }))} style={{ ...s.optBtn, ...(integrationAnswers[intg.id] === opt ? s.optActive : {}) }}>{opt}</button>
                    ))}
                  </div>
                  {integrationAnswers[intg.id] === "Usar minha própria API key" && (
                    <input placeholder={`Cole sua ${intg.name} API key aqui…`} onChange={e => setIntegrationAnswers(prev => ({ ...prev, [intg.id]: e.target.value }))} style={s.keyInput} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 28px", borderTop: "1px solid #1e1e24", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => { setShowIntegrationModal(false); setIsLoading(false); }} style={s.cancelBtn}>Cancelar</button>
              <button onClick={handleIntegrationSubmit} style={s.confirmBtn}>✨ Gerar com integrações</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  loginWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0f", position: "relative" },
  loginBg: { position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,.18) 0%, transparent 70%)", pointerEvents: "none" },
  loginCard: { position: "relative", zIndex: 1, width: "100%", maxWidth: 420, padding: "48px 40px", background: "#111114", border: "1px solid #1e1e28", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 },
  logoText: { fontSize: 34, fontWeight: 900, background: "linear-gradient(135deg, #6366f1, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  loginInput: { width: "100%", padding: "14px 18px", background: "#1a1a24", border: "1px solid #2a2a40", borderRadius: 12, color: "#e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box" },
  loginBtn: { width: "100%", padding: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  pill: { padding: "6px 12px", background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 20, fontSize: 12, color: "#888" },
  app: { display: "flex", flexDirection: "column", height: "100vh", background: "#0d0d0f", color: "#e2e8f0", overflow: "hidden" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 52, background: "#111114", borderBottom: "1px solid #1e1e24", flexShrink: 0 },
  logoSmall: { fontSize: 17, fontWeight: 800, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  projInput: { background: "transparent", border: "1px solid #2a2a35", borderRadius: 6, color: "#aaa", padding: "4px 10px", fontSize: 13, outline: "none", maxWidth: 180 },
  tabBtn: { padding: "6px 16px", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "#666", cursor: "pointer", fontSize: 13 },
  tabActive: { background: "#1e1e2e", border: "1px solid #2a2a40", color: "#e2e8f0" },
  iconBtn: { background: "transparent", border: "1px solid #2a2a35", borderRadius: 6, color: "#888", cursor: "pointer", padding: "4px 10px", fontSize: 16 },
  exportBtn: { padding: "6px 16px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 },
  sidebar: { width: 360, display: "flex", flexDirection: "column", background: "#111114", borderRight: "1px solid #1e1e24", flexShrink: 0 },
  chatList: { flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 12 },
  botAvatar: { width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 },
  bubble: { maxWidth: "80%", padding: "10px 14px", borderRadius: 12 },
  userBubble: { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", borderBottomRightRadius: 4 },
  botBubble: { background: "#1a1a24", border: "1px solid #2a2a35", color: "#d1d5db", borderBottomLeftRadius: 4 },
  codeBadge: { marginTop: 8, padding: "4px 10px", background: "#1a3a2a", border: "1px solid #2a5a3a", borderRadius: 6, fontSize: 11, color: "#4ade80" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#6366f1", display: "inline-block", animation: "bounce 1s infinite" },
  suggBtn: { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12, marginBottom: 4 },
  starterGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 12px 12px" },
  starterCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 10, cursor: "pointer" },
  inputRow: { padding: "12px", borderTop: "1px solid #1e1e24", display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: { flex: 1, background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 },
  sendBtn: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0 },
  iframe: { flex: 1, border: "none", background: "#fff" },
  codePre: { flex: 1, margin: 0, padding: 24, overflowY: "auto", background: "#0d0d0f", whiteSpace: "pre-wrap", wordBreak: "break-all" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#444" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" },
  modal: { width: "100%", maxWidth: 560, maxHeight: "85vh", background: "#111114", border: "1px solid #2a2a35", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" },
  intgCard: { background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 14, padding: 16 },
  optBtn: { padding: "7px 14px", background: "#0d0d0f", border: "1px solid #2a2a40", borderRadius: 8, color: "#888", cursor: "pointer", fontSize: 12 },
  optActive: { background: "#1e1e3a", border: "1px solid #6366f1", color: "#818cf8" },
  keyInput: { width: "100%", padding: "10px 14px", background: "#0d0d0f", border: "1px solid #2a2a40", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" },
  cancelBtn: { padding: "10px 20px", background: "transparent", border: "1px solid #2a2a35", borderRadius: 10, color: "#888", cursor: "pointer", fontSize: 13 },
  confirmBtn: { padding: "10px 24px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
}; 
