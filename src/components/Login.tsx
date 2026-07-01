import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Shield, Server, AlertCircle, Eye, EyeOff, UserCheck, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Connection status from server
  const [useDemoMode, setUseDemoMode] = useState(true);
  const [adConnected, setAdConnected] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    // Check AD status on load to inform user of login mode
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/ad/status');
        if (res.ok) {
          const data = await res.json();
          setUseDemoMode(data.useDemoMode);
          setAdConnected(data.connected);
          setServerError(data.error);
        }
      } catch (err) {
        console.error('Erro ao verificar status do AD para tela de login:', err);
      }
    };
    checkStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ad/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha na autenticação.');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar ao servidor de autenticação.');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill helper for testing/simulation mode
  const handleQuickFill = (user: string) => {
    setUsername(user);
    setPassword('Password123');
    setError(null);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans p-4 relative overflow-hidden">
      {/* Decorative background gradients */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Brand logo & title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-2xl text-white font-bold text-lg mb-3 shadow-lg shadow-blue-500/20">
            AD
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-display">Console DirectoryAdmin</h1>
          <p className="text-xs text-slate-400 mt-1">Gerenciamento Centralizado de Active Directory</p>
        </div>

        {/* Connection Mode Info Banner */}
        <div className="mb-6 bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-2xl p-4 flex gap-3 items-start">
          <div className="p-2 bg-slate-800 rounded-lg text-slate-400 shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-slate-300">Conectividade do Servidor</h3>
            {useDemoMode ? (
              <div>
                <span className="inline-flex items-center text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
                  Modo Simulação
                </span>
                <p className="text-[10px] text-slate-400 mt-1">
                  O servidor está emulando o ambiente AD local. Use qualquer credencial administrativa de teste listada abaixo.
                </p>
              </div>
            ) : adConnected ? (
              <div>
                <span className="inline-flex items-center text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase animate-pulse">
                  AD Real Conectado
                </span>
                <p className="text-[10px] text-slate-400 mt-1">
                  Integrado com o servidor Active Directory em <span className="font-mono">\\casanova</span>. Autenticação real com suas credenciais de rede.
                </p>
              </div>
            ) : (
              <div>
                <span className="inline-flex items-center text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 uppercase">
                  AD Real Offline
                </span>
                <p className="text-[10px] text-slate-400 mt-1">
                  Falha de rede com o servidor AD. {serverError && <span className="text-red-400 block mt-0.5">{serverError}</span>}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Login Form Card */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-500" />
            <span>Autenticação de Operador</span>
          </h2>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-2 items-start text-xs text-red-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Usuário do AD (sAMAccountName)</label>
              <input
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: ana.santos"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Senha de Rede</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha corporativa do AD"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-3 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Autenticando...</span>
                  </span>
                ) : (
                  <>
                    <span>Entrar no Console AD</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Administrative Quick-Test Accounts (Only shown when useDemoMode is true) */}
        {useDemoMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-6 bg-slate-900/40 backdrop-blur-sm border border-slate-800/60 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Contas de Teste Administrador (Modo Simulação)</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Apenas contas com privilégios administrativos podem logar. Clique para preencher automaticamente (senha padrão: <code className="font-mono text-slate-300 bg-slate-800 px-1 rounded">Password123</code>):
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <button
                onClick={() => handleQuickFill('ana.santos')}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-left text-slate-300 transition-colors flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white truncate">ana.santos</span>
                <span className="text-slate-400 text-[9px] truncate">TI / Infraestrutura</span>
              </button>
              <button
                onClick={() => handleQuickFill('lucas.oliveira')}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-left text-slate-300 transition-colors flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white truncate">lucas.oliveira</span>
                <span className="text-slate-400 text-[9px] truncate">Suporte / TI</span>
              </button>
              <button
                onClick={() => handleQuickFill('carlos.souza')}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-left text-slate-300 transition-colors flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white truncate">carlos.souza</span>
                <span className="text-slate-400 text-[9px] truncate">Financeiro (Líder)</span>
              </button>
              <button
                onClick={() => handleQuickFill('admin')}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-left text-slate-300 transition-colors flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white truncate">admin</span>
                <span className="text-slate-400 text-[9px] truncate">Administrador Geral</span>
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
