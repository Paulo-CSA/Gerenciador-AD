import React, { useState, useEffect } from "react";
import { 
  Database, 
  Server, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  AlertTriangle, 
  Info, 
  Download, 
  RefreshCw, 
  KeyRound, 
  Globe, 
  FileCode2,
  Lock
} from "lucide-react";

interface AdConfigPanelProps {
  onConfigChanged: () => void;
}

export default function AdConfigPanel({ onConfigChanged }: AdConfigPanelProps) {
  const [config, setConfig] = useState({
    url: "ldap://192.168.1.100:389",
    baseDN: "DC=empresa,DC=local",
    username: "admin@empresa.local",
    password: "",
    domain: "empresa.local",
    useDemoMode: true
  });

  const [status, setStatus] = useState<{
    connected: boolean;
    useDemoMode: boolean;
    error: string | null;
    loading: boolean;
  }>({
    connected: false,
    useDemoMode: true,
    error: null,
    loading: true
  });

  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  const fetchStatus = async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true }));
      const res = await fetch("/api/ad/status");
      const data = await res.json();
      setStatus({
        connected: data.connected,
        useDemoMode: data.useDemoMode,
        error: data.error,
        loading: false
      });
      if (data.config) {
        setConfig(prev => ({
          ...prev,
          url: data.config.url || prev.url,
          baseDN: data.config.baseDN || prev.baseDN,
          username: data.config.username || prev.username,
          domain: data.config.domain || prev.domain,
          useDemoMode: data.useDemoMode
        }));
      }
    } catch (err) {
      console.error("Erro ao carregar status do AD:", err);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ad/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      setStatus({
        connected: data.connected,
        useDemoMode: data.useDemoMode,
        error: data.error,
        loading: false
      });
      setTestResult({
        success: data.connected,
        msg: data.connected 
          ? "Conexão com Active Directory realizada com sucesso!" 
          : data.error || "Erro ao conectar. Verifique as configurações."
      });
      if (data.connected) {
        setConfig(prev => ({ ...prev, password: "" }));
      }
      onConfigChanged();
    } catch (err) {
      setTestResult({ success: false, msg: "Não foi possível conectar ao servidor backend da aplicação." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDemo = async (checked: boolean) => {
    const updatedConfig = { ...config, useDemoMode: checked };
    setConfig(updatedConfig);
    setSaving(true);
    try {
      const res = await fetch("/api/ad/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
      const data = await res.json();
      setStatus(prev => ({
        ...prev,
        connected: data.connected,
        useDemoMode: data.useDemoMode,
        error: data.error
      }));
      onConfigChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" id="ad-config-panel">
      
      {/* Upper Status Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${status.useDemoMode ? "bg-amber-50 text-amber-600 border border-amber-100" : status.connected ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-800 text-base flex items-center gap-2">
              Status do Active Directory
              {status.loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {status.useDemoMode ? (
                <span className="flex items-center gap-1 text-amber-700 font-semibold">
                  <Database className="w-3.5 h-3.5" />
                  Ativo em Modo Simulação (Banco de Dados Local)
                </span>
              ) : status.connected ? (
                <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conectado ao Active Directory Real
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-700 font-semibold">
                  <XCircle className="w-3.5 h-3.5" />
                  Erro de Conexão com Domain Controller LDAP
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500">Modo Simulação:</span>
          <button 
            onClick={() => handleToggleDemo(!config.useDemoMode)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${config.useDemoMode ? "bg-blue-600" : "bg-slate-200"}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${config.useDemoMode ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connection parameters Form */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <h4 className="font-display font-bold text-slate-800 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <Lock className="w-4.5 h-4.5 text-blue-600" />
            Parâmetros de Conexão LDAP/LDAPS
          </h4>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">URL de Conexão LDAP</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400"><Server className="w-4 h-4" /></span>
                  <input 
                    type="text" 
                    placeholder="ldap://192.168.1.100:389"
                    required
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.url}
                    onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Use ldap:// para porta padrão 389 ou ldaps:// para criptografia SSL na porta 636.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">DN Base de Busca (Base DN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400"><Database className="w-4 h-4" /></span>
                  <input 
                    type="text" 
                    placeholder="DC=empresa,DC=local"
                    required
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.baseDN}
                    onChange={(e) => setConfig({ ...config, baseDN: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Ponto de partida na árvore do AD para localizar os usuários e grupos.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">Usuário de Bind (Leitor AD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400"><KeyRound className="w-4 h-4" /></span>
                  <input 
                    type="text" 
                    placeholder="Ex: admin@empresa.local ou CN=Admin,..."
                    required
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Conta com permissões de leitura no AD para pesquisar atributos e OUs.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">Senha de Bind</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400"><Lock className="w-4 h-4" /></span>
                  <input 
                    type="password" 
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Deixe em branco para manter a senha salva atual.</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-slate-600 block">Nome do Domínio NetBIOS / DNS</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400"><Globe className="w-4 h-4" /></span>
                  <input 
                    type="text" 
                    placeholder="empresa.local"
                    required
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.domain}
                    onChange={(e) => setConfig({ ...config, domain: e.target.value })}
                  />
                </div>
                <p className="text-[10px] text-slate-400">Domínio Windows para geração automática de User Principal Name (UPN) e e-mails.</p>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl text-xs flex gap-2.5 border ${testResult.success ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"}`}>
                {testResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                <div className="space-y-1">
                  <strong className="font-semibold">{testResult.success ? "Sucesso!" : "Falha na Conexão"}</strong>
                  <p className="text-[11px] leading-relaxed">{testResult.msg}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={fetchStatus}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold rounded-xl text-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Status
              </button>
              <button 
                type="submit" 
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Salvando..." : "Testar & Salvar Conexão"}
              </button>
            </div>
          </form>
        </div>

        {/* Instructions Panel */}
        <div className="space-y-6">
          <div className="bg-blue-50/50 border border-blue-100/50 p-6 rounded-2xl text-xs space-y-4">
            <h4 className="font-display font-bold text-slate-800 flex items-center gap-2">
              <Info className="w-4.5 h-4.5 text-blue-600" />
              Como conectar no meu AD local?
            </h4>
            <div className="text-slate-600 space-y-3 leading-relaxed">
              <p>
                Como esta aplicação está rodando na <strong>Nuvem (AI Studio Sandbox)</strong>, ela não consegue se comunicar diretamente com IPs privados da sua rede local (ex: <code className="bg-white border border-slate-100 px-1 py-0.5 rounded font-mono font-bold text-blue-700">192.168.x.x</code> ou controlador de domínio local).
              </p>
              <p className="font-semibold text-slate-700">Para conectar com seu servidor de fato:</p>
              <ol className="list-decimal pl-4 space-y-2 text-[11px]">
                <li>Clique no menu de configurações do AI Studio (topo/lateral) e selecione <strong>"Exportar ZIP"</strong> para baixar o código fonte deste projeto completo.</li>
                <li>Extraia o projeto no seu computador ou servidor de homologação que esteja <strong>dentro da mesma rede local</strong> (intranet) que o seu Active Directory.</li>
                <li>Abra o terminal na pasta extraída, instale as dependências executando <code className="bg-white border px-1 py-0.5 rounded font-mono font-semibold">npm install</code> e inicie o app com <code className="bg-white border px-1 py-0.5 rounded font-mono font-semibold text-emerald-600">npm run dev</code>.</li>
                <li>Acesse o app no navegador local e preencha as configurações do seu AD acima, desativando o <strong>Modo Simulação</strong>. Pronto! O app fará conexões LDAP diretas e reais ao seu Controlador de Domínio!</li>
              </ol>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs text-xs space-y-3">
            <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-slate-600" />
              Requisitos de Rede & AD
            </h5>
            <ul className="space-y-2 text-slate-500 text-[11px]">
              <li className="flex items-start gap-1.5">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>Porta 389 (LDAP):</strong> Ativada no firewall do Windows Server para leitura padrão.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>Porta 636 (LDAPS):</strong> Obrigatória caso queira habilitar a <strong>redefinição e alteração de senhas</strong>. O Windows Server exige criptografia LDAPS (com certificado SSL válido ou autoassinado) para resetar senhas por segurança.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>Conta de Bind:</strong> Recomenda-se uma conta de serviço padrão do domínio (não precisa ser Domain Admin se for apenas leitura de dados).</span>
              </li>
            </ul>
          </div>
        </div>

      </div>

    </div>
  );
}
