/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  Monitor,
  Clock,
  Volume2,
  UserCheck
} from 'lucide-react';
import { BroadcastMessage, ConnectedWorkstation } from '../types';

interface DesktopPopupOverlayProps {
  stationName: string;
  username: string;
  role: 'console' | 'workstation';
  showPopupsInConsole?: boolean;
  onBroadcastReceived?: (msg: BroadcastMessage) => void;
  onMessageUpdated?: (msg: BroadcastMessage) => void;
  onMessageDeleted?: (id: string) => void;
  onClientsUpdated?: (clients: ConnectedWorkstation[]) => void;
  onWsStatusChange?: (connected: boolean) => void;
}

function playAlertTone(urgency: 'info' | 'warning' | 'urgent') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playBeep = (freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    if (urgency === 'urgent') {
      playBeep(880, 0, 0.16, 'triangle');
      playBeep(660, 0.19, 0.16, 'triangle');
      playBeep(880, 0.38, 0.22, 'triangle');
    } else if (urgency === 'warning') {
      playBeep(660, 0, 0.16, 'sine');
      playBeep(523.25, 0.18, 0.22, 'sine');
    } else {
      playBeep(587.33, 0, 0.18, 'sine');
      playBeep(783.99, 0.16, 0.2, 'sine');
    }
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export default function DesktopPopupOverlay({
  stationName,
  username,
  role,
  showPopupsInConsole = true,
  onBroadcastReceived,
  onMessageUpdated,
  onMessageDeleted,
  onClientsUpdated,
  onWsStatusChange
}: DesktopPopupOverlayProps) {
  const [activePopups, setActivePopups] = useState<BroadcastMessage[]>([]);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const callbacksRef = useRef({
    onBroadcastReceived,
    onMessageUpdated,
    onMessageDeleted,
    onClientsUpdated,
    onWsStatusChange,
    showPopupsInConsole,
    stationName,
    username,
    role
  });

  useEffect(() => {
    callbacksRef.current = {
      onBroadcastReceived,
      onMessageUpdated,
      onMessageDeleted,
      onClientsUpdated,
      onWsStatusChange,
      showPopupsInConsole,
      stationName,
      username,
      role
    };
  });

  useEffect(() => {
    let unmounted = false;

    const connectWs = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        machine: callbacksRef.current.stationName,
        user: callbacksRef.current.username,
        role: callbacksRef.current.role
      });
      const wsUrl = `${protocol}//${window.location.host}/ws/messages?${params.toString()}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          callbacksRef.current.onWsStatusChange?.(true);
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'init' && parsed.payload?.connectedWorkstations) {
              callbacksRef.current.onClientsUpdated?.(parsed.payload.connectedWorkstations);
            } else if (parsed.type === 'clients:status') {
              callbacksRef.current.onClientsUpdated?.(parsed.payload || []);
            } else if (parsed.type === 'message:updated') {
              callbacksRef.current.onMessageUpdated?.(parsed.payload);
            } else if (parsed.type === 'message:deleted') {
              callbacksRef.current.onMessageDeleted?.(parsed.payload?.id);
              setActivePopups((prev) => prev.filter((p) => p.id !== parsed.payload?.id));
            } else if (parsed.type === 'message:broadcast') {
              const msg: BroadcastMessage = parsed.payload;
              callbacksRef.current.onBroadcastReceived?.(msg);

              const currentStation = callbacksRef.current.stationName.toUpperCase();
              const targetsUpper = (msg.targetMachines || []).map((t) => t.toUpperCase());
              const matchesStation =
                msg.targetMode === 'all' ||
                currentStation === 'ALL' ||
                targetsUpper.includes(currentStation) ||
                callbacksRef.current.role === 'console';

              if (matchesStation && (callbacksRef.current.role === 'workstation' || callbacksRef.current.showPopupsInConsole)) {
                setActivePopups((prev) => {
                  if (prev.some((p) => p.id === msg.id)) return prev;
                  return [msg, ...prev];
                });

                if (msg.playSound) {
                  playAlertTone(msg.urgency);
                }

                // Trigger native OS browser notification when permitted
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  try {
                    const prefix =
                      msg.urgency === 'urgent' ? '[URGENTE]' : msg.urgency === 'warning' ? '[AVISO]' : '[INFO]';
                    new Notification(`${prefix} ${msg.title}`, {
                      body: msg.body,
                      tag: msg.id,
                      requireInteraction: msg.urgency === 'urgent' || msg.requireAck
                    });
                  } catch {}
                }

                // Report delivered receipt to backend
                fetch(`/api/messages/${msg.id}/delivered`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    machineName: callbacksRef.current.stationName
                  })
                }).catch(() => {});

                // Schedule auto-close if configured and not requiring mandatory ack
                if (msg.autoCloseSeconds > 0 && !msg.requireAck) {
                  window.setTimeout(() => {
                    setActivePopups((prev) => prev.filter((p) => p.id !== msg.id));
                  }, msg.autoCloseSeconds * 1000);
                }
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          callbacksRef.current.onWsStatusChange?.(false);
          if (!unmounted) {
            reconnectTimerRef.current = window.setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!unmounted) {
          reconnectTimerRef.current = window.setTimeout(connectWs, 4000);
        }
      }
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Re-register when stationName or role changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'register',
          machineName: stationName,
          username,
          role
        })
      );
    }
  }, [stationName, username, role]);

  const handleAcknowledge = async (msg: BroadcastMessage) => {
    setAcknowledgingId(msg.id);
    try {
      await fetch(`/api/messages/${msg.id}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineName: stationName,
          username
        })
      });
    } catch {}
    setAcknowledgingId(null);
    setActivePopups((prev) => prev.filter((p) => p.id !== msg.id));
  };

  const handleDismiss = (id: string) => {
    setActivePopups((prev) => prev.filter((p) => p.id !== id));
  };

  if (activePopups.length === 0) return null;

  const urgentPopup = activePopups.find((p) => p.urgency === 'urgent');
  const floatingPopups = activePopups.filter((p) => p.id !== urgentPopup?.id);

  return (
    <>
      {/* Center modal overlay for URGENT / CRITICAL desktop alerts */}
      {urgentPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border-2 border-red-600 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-red-600 px-5 py-3.5 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertOctagon className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-100">
                    Alerta Urgente da Rede · {urgentPopup.category}
                  </div>
                  <h3 className="text-sm font-bold truncate">{urgentPopup.title}</h3>
                </div>
              </div>
              {!urgentPopup.requireAck && (
                <button
                  type="button"
                  onClick={() => handleDismiss(urgentPopup.id)}
                  className="p-1 hover:bg-red-700 rounded-md transition-colors cursor-pointer"
                  title="Fechar alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {urgentPopup.body}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-3 border-t border-slate-100">
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  Remetente: <strong className="text-slate-700">{urgentPopup.sender}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" />
                  Estação: <strong className="font-mono text-slate-700">{stationName}</strong>
                </span>
                {urgentPopup.playSound && (
                  <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                    <Volume2 className="w-3.5 h-3.5" />
                    Alerta sonoro
                  </span>
                )}
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {urgentPopup.sentAt || urgentPopup.createdAt}
              </span>
              <button
                type="button"
                disabled={acknowledgingId === urgentPopup.id}
                onClick={() => handleAcknowledge(urgentPopup)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                {acknowledgingId === urgentPopup.id ? 'Confirmando...' : 'Confirmar Leitura (Ciente)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-right Windows Desktop-style Toast Stack for Info & Warning */}
      {floatingPopups.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[95] flex flex-col gap-3 w-full max-w-md pointer-events-none">
          {floatingPopups.map((popup) => {
            const isWarning = popup.urgency === 'warning';
            const headerBg = isWarning ? 'bg-amber-600' : 'bg-blue-600';
            const borderCol = isWarning ? 'border-amber-500' : 'border-blue-500';
            const btnBg = isWarning
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700';

            return (
              <div
                key={popup.id}
                className={`pointer-events-auto bg-white rounded-xl border ${borderCol} shadow-xl overflow-hidden transition-all`}
              >
                <div className={`${headerBg} px-4 py-2.5 flex items-center justify-between text-white`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {isWarning ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-90 block">
                        {isWarning ? 'Aviso da Rede' : 'Comunicado TI'} · {popup.category}
                      </span>
                      <h4 className="text-xs font-bold truncate">{popup.title}</h4>
                    </div>
                  </div>
                  {!popup.requireAck && (
                    <button
                      type="button"
                      onClick={() => handleDismiss(popup.id)}
                      className="p-1 hover:bg-black/15 rounded transition-colors cursor-pointer"
                      title="Fechar notificação"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {popup.body}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    <span>
                      Por <strong className="text-slate-700">{popup.sender}</strong> ·{' '}
                      <span className="font-mono">{stationName}</span>
                    </span>
                    <button
                      type="button"
                      disabled={acknowledgingId === popup.id}
                      onClick={() => handleAcknowledge(popup)}
                      className={`px-3 py-1.5 ${btnBg} text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {popup.requireAck ? 'Li e estou ciente' : 'OK'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
