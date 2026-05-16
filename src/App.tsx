import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './supabase';

const MOCK_POOL = [
  { items: [
    { name: "Gunkan Gaman", qty: 2, obs: "sem pimenta" },
    { name: "Sashimi de Salmão", qty: 1, obs: "" },
    { name: "Temaki Philadelphia", qty: 2, obs: "" }
  ]},
  { items: [
    { name: "Combinado Iniciante 30 Peças", qty: 1, obs: "urgente" },
    { name: "Água com Gás", qty: 2, obs: "" }
  ]},
  { items: [
    { name: "Carpaccio de Salmão", qty: 1, obs: "" },
    { name: "Robata de Camarão 10 un.", qty: 1, obs: "bem grelhado" },
    { name: "Sake Tradicional", qty: 1, obs: "quente" }
  ]},
  { items: [
    { name: "Sashimi Atum Flambado", qty: 2, obs: "" },
    { name: "Harumaki de Camarão", qty: 3, obs: "" }
  ]},
  { items: [
    { name: "Bolinho de Salmão", qty: 4, obs: "crocante" },
    { name: "Tempurá de Camarão 10 un.", qty: 1, obs: "" },
    { name: "Chá Verde Quente", qty: 2, obs: "" }
  ]}
];

type OrderItem = { name: string; qty: number; obs: string };
type Order = {
  id: string;
  table: number;
  items: OrderItem[];
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
};

type UrgencyInfo = { level: 'Crítico' | 'Atenção' | 'Normal', sidebar: string, border: string, badge: string, pulsing: boolean };

function getStation(itemName: string) {
  const n = itemName.toLowerCase();
  if (n.includes("sashimi") || n.includes("sushi") || n.includes("gunkan") ||
      n.includes("temaki") || n.includes("makimono") || n.includes("harumaki"))
    return { label: "Sushi Bar", color: "#13aff0", kanji: "寿" };
  if (n.includes("robata") || n.includes("grelhado"))
    return { label: "Robata", color: "#C8922A", kanji: "炉" };
  if (n.includes("tempurá") || n.includes("tempura") || n.includes("frito") ||
      n.includes("bolinho") || n.includes("wonton"))
    return { label: "Fritura", color: "#D4A030", kanji: "天" };
  if (n.includes("bebida") || n.includes("sake") || n.includes("chá") ||
      n.includes("água") || n.includes("suco"))
    return { label: "Bar", color: "#74C69D", kanji: "飲" };
  return { label: "Geral", color: "#A89880", kanji: "食" };
}

function getUrgency(createdAt: string, now: Date): UrgencyInfo {
  const diffMins = (now.getTime() - new Date(createdAt).getTime()) / 60000;
  if (diffMins > 10) return { level: 'Crítico', sidebar: '#C0392B', border: 'rgba(192,57,43,0.8)', badge: '#C0392B', pulsing: true };
  if (diffMins >= 5) return { level: 'Atenção', sidebar: '#D47A1A', border: 'rgba(212,122,26,0.6)', badge: '#D47A1A', pulsing: false };
  return { level: 'Normal', sidebar: '#C8922A', border: 'var(--border)', badge: '#A89880', pulsing: false };
}

let audioContext: AudioContext | null = null;

async function playAlert(muted: boolean) {
  if (muted) return;
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
    }
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const frequencies = [110, 165, 220, 311, 440, 659, 880];
    const startTime = audioContext.currentTime;
    
    frequencies.forEach((freq, i) => {
      if (!audioContext) return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(i === 0 ? 0.4 : 0.15, startTime);
      const decayTime = i === 0 ? 4.0 : 2.5 - (i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + decayTime);
      osc.start(startTime);
      osc.stop(startTime + decayTime + 0.1);
    });
  } catch(e) {
    console.error('Erro ao tocar som:', e);
  }
}

async function playItemReadyAlert(muted: boolean) {
  if (muted) return;
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
    }
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5 major chord arpeggio
    const startTime = audioContext.currentTime;
    
    notes.forEach((freq, i) => {
      if (!audioContext) return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.type = 'sine';
      const t = startTime + (i * 0.08);
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  } catch(e) {
    console.error('Erro ao tocar som:', e);
  }
}

function groupOrderItems(items: OrderItem[]) {
  const groups: Record<string, { station: ReturnType<typeof getStation>, items: OrderItem[] }> = {};
  items.forEach(item => {
    const st = getStation(item.name);
    if (!groups[st.label]) {
      groups[st.label] = { station: st, items: [] };
    }
    groups[st.label].items.push(item);
  });
  return Object.values(groups);
}

function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour12: false });
}

function formatRelative(iso: string, now: Date) {
    const diff = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'agora';
    return `${diff}min atrás`;
}

function StatCard({ label, value, color, solidBg, pulse }: { label: string, value: string|number, color: string, solidBg?: boolean, pulse?: boolean }) {
  const bgColor = solidBg ? color : 'var(--bg-primary)';
  const textColor = solidBg ? 'var(--bg-primary)' : color;
  const labelColor = solidBg ? 'var(--bg-primary)' : 'var(--cream-dim)';
  
  return (
     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: bgColor, border: solidBg ? 'none' : '1px solid var(--border-dim)', borderRadius: '8px', padding: '6px 12px', minWidth: '85px', animation: pulse ? 'criticalPulse 1.5s infinite' : 'none', boxShadow: solidBg ? `0 4px 12px ${color}40` : 'none' }}>
        <span style={{ fontSize: '22px', fontWeight: 800, color: textColor, opacity: solidBg ? 0.95 : 1 }}>{value}</span>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: labelColor, fontWeight: solidBg ? 700 : 500, letterSpacing: '0.05em', opacity: solidBg ? 0.8 : 1 }}>{label}</span>
     </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
   return (
      <h3 style={{ fontFamily: '"Shippori Mincho", serif', fontSize: '15px', fontWeight: 800, color: 'var(--cream)', borderBottom: '1px solid var(--border-dim)', paddingBottom: '8px', marginBottom: '16px', marginTop: 0 }}>
         {children}
      </h3>
   );
}

const LOCAL_STORAGE_KEY = 'gaman_orders';

export default function KitchenPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [muted, setMuted] = useState(false);
  const [filter, setFilter] = useState('Todos');
  const [sortBy, setSortBy] = useState('Mais antigo primeiro');
  const [now, setNow] = useState(new Date());
  const [popup, setPopup] = useState<{ id: string; table: number; items: number } | null>(null);
  const [waiterPopup, setWaiterPopup] = useState<{ table: number } | null>(null);
  const [itemReadyPopup, setItemReadyPopup] = useState<{ table: number; itemName: string } | null>(null);
  const knownOrderIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const [needsInteraction, setNeedsInteraction] = useState(false);

  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Busca inicial dos pedidos abertos
  useEffect(() => {
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('gaman_orders')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(100);
      
      if (!error && data) {
        setOrders(data as Order[]);
        data.forEach((o: any) => knownOrderIds.current.add(o.id));
        isInitialLoad.current = false;
      }
    };
    fetchOrders();
  }, []);

  // Inscrição para receber novos pedidos em tempo real
  useEffect(() => {
    const ch = supabase.channel('kitchen')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gaman_orders' },
        (payload) => {
          const newOrder = payload.new as Order;
          setOrders(prev => [newOrder, ...prev]);
          if (!knownOrderIds.current.has(newOrder.id)) {
            knownOrderIds.current.add(newOrder.id);
            playAlert(mutedRef.current);
            setPopup({ 
              id: newOrder.id, 
              table: newOrder.table, 
              items: newOrder.items?.reduce((acc, i) => acc + i.qty, 0) || 0 
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gaman_orders' },
        (payload) => {
          const updatedOrder = payload.new as Order;
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        }
      )
      .subscribe((status) => {
        console.log('Supabase Realtime Kitchen Status:', status);
      });
      
    // Polling fallback to guarantee updates
    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from('gaman_orders')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(100);
      
      if (!error && data) {
        const fetchedOrders = data as Order[];
        const newOrders = fetchedOrders.filter(o => !knownOrderIds.current.has(o.id));
        
        if (newOrders.length > 0 && !isInitialLoad.current) {
          // Detectamos novos pedidos via polling!
          playAlert(mutedRef.current);
          const newest = newOrders[0];
          setPopup({ 
            id: newest.id, 
            table: newest.table, 
            items: newest.items?.reduce((acc, i) => acc + i.qty, 0) || 0 
          });
          
          // Se o áudio estiver bloqueado, avisa o usuário
          if (audioContext && audioContext.state === 'suspended') {
            setNeedsInteraction(true);
          }
        }
        
        // Atualiza o set de conhecidos
        fetchedOrders.forEach(o => knownOrderIds.current.add(o.id));
        setOrders(fetchedOrders);
      }
    }, 3000);
      
    return () => {
      supabase.removeChannel(ch);
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (popup) {
      const timer = setTimeout(() => setPopup(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [popup]);

  useEffect(() => {
    if (waiterPopup) {
      const timer = setTimeout(() => setWaiterPopup(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [waiterPopup]);

  useEffect(() => {
    if (itemReadyPopup) {
      const timer = setTimeout(() => setItemReadyPopup(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [itemReadyPopup]);

  const handleSimulate = useCallback(async () => {
      const randomPoolItem = MOCK_POOL[Math.floor(Math.random() * MOCK_POOL.length)];
      await supabase.from('gaman_orders').insert({
          table: Math.floor(Math.random() * 20) + 1,
          items: randomPoolItem.items,
          status: 'pending'
      });
  }, []);

  const handleComplete = useCallback(async (id: string, table: number) => {
      const nowISO = new Date().toISOString();
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'completed', completedAt: nowISO } : o));
      setWaiterPopup({ table });
      
      await supabase.from('gaman_orders').update({
         status: 'completed',
         completedAt: nowISO
      }).eq('id', id);
  }, []);

  const handleItemReady = useCallback(async (orderId: string, table: number, itemIndex: number, itemName: string) => {
      // Remove item from order, if last item mark order as completed
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const newItems = [...o.items];
        newItems.splice(itemIndex, 1);
        if (newItems.length === 0) {
          return { ...o, items: newItems, status: 'completed' as const, completedAt: new Date().toISOString() };
        }
        return { ...o, items: newItems };
      }));
      setItemReadyPopup({ table, itemName });
      playItemReadyAlert(mutedRef.current);
      
      // Update in DB
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const newItems = [...order.items];
        newItems.splice(itemIndex, 1);
        if (newItems.length === 0) {
          await supabase.from('gaman_orders').update({
            items: newItems,
            status: 'completed',
            completedAt: new Date().toISOString()
          }).eq('id', orderId);
        } else {
          await supabase.from('gaman_orders').update({
            items: newItems
          }).eq('id', orderId);
        }
      }
      
      // Force an immediate poll to sync correctly across all clients
      const { data } = await supabase.from('gaman_orders').select('*').order('createdAt', { ascending: false }).limit(100);
      if (data) setOrders(data as Order[]);
  }, [muted, orders]);

  const stats = useMemo(() => {
      const pending = orders.filter(o => o.status === 'pending');
      let totalItems = 0;
      let criticalCount = 0;
      let sumMinutes = 0;

      pending.forEach(o => {
          totalItems += o.items.reduce((acc, i) => acc + i.qty, 0);
          const mins = (now.getTime() - new Date(o.createdAt).getTime()) / 60000;
          sumMinutes += mins;
          if (mins > 10) criticalCount++;
      });

      const avgTime = pending.length > 0 ? (sumMinutes / pending.length).toFixed(1) : '0.0';

      return {
          pending: pending.length,
          critical: criticalCount,
          completed: orders.filter(o => o.status === 'completed').length,
          totalItems,
          avgTime
      };
  }, [orders, now]);

  const filteredAndSortedOrders = useMemo(() => {
      let result = orders.filter(o => o.status === 'pending');

      if (filter === 'Críticos') {
          result = result.filter(o => (now.getTime() - new Date(o.createdAt).getTime()) / 60000 > 10);
      } else if (filter !== 'Todos') {
          result = result.filter(o => o.items.some(i => getStation(i.name).label === filter));
      }

      result.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();

          if (sortBy === 'Mais antigo primeiro') {
              return timeA - timeB; 
          } else if (sortBy === 'Mais recente primeiro') {
               return timeB - timeA;
          } else if (sortBy === 'Mesa (crescente)') {
               return a.table - b.table || timeA - timeB;
          } else if (sortBy === 'Nível de urgência') {
               const urgA = getUrgency(a.createdAt, now).level;
               const urgB = getUrgency(b.createdAt, now).level;
               const val = { 'Crítico': 3, 'Atenção': 2, 'Normal': 1 };
               if (val[urgA] !== val[urgB]) return val[urgB] - val[urgA];
               return timeA - timeB;
          }
          return 0;
      });

      return result;
  }, [orders, filter, sortBy, now]);

  const stationQueue = useMemo(() => {
      const counts: Record<string, { count: number; station: ReturnType<typeof getStation> }> = {
        'Sushi Bar': { count: 0, station: { label: 'Sushi Bar', color: '#13aff0', kanji: '寿' } },
        'Robata': { count: 0, station: { label: 'Robata', color: '#C8922A', kanji: '炉' } },
        'Fritura': { count: 0, station: { label: 'Fritura', color: '#D4A030', kanji: '天' } },
        'Bar': { count: 0, station: { label: 'Bar', color: '#74C69D', kanji: '飲' } },
        'Geral': { count: 0, station: { label: 'Geral', color: '#A89880', kanji: '食' } },
      };

      orders.filter(o => o.status === 'pending').forEach(o => {
          o.items.forEach(i => {
             const st = getStation(i.name);
             if (!counts[st.label]) {
                 counts[st.label] = { count: 0, station: st };
             }
             counts[st.label].count += i.qty;
          });
      });

      return Object.values(counts).sort((a,b) => b.count - a.count);
  }, [orders]);

  const oldestPending = useMemo(() => {
      return [...orders.filter(o => o.status === 'pending')].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).slice(0, 3);
  }, [orders]);

  const latestCompleted = useMemo(() => {
      return [...orders.filter(o => o.status === 'completed')].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()).slice(0, 3);
  }, [orders]);

  const filters = ['Todos', 'Críticos', 'Sushi Bar', 'Robata', 'Fritura', 'Bar'];
  const sorts = ['Mais antigo primeiro', 'Mais recente primeiro', 'Mesa (crescente)', 'Nível de urgência'];

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes criticalPulse {
          0%,100% { border-color: rgba(192,57,43,0.8); }
          50%     { border-color: rgba(192,57,43,0.2); }
        }
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(116,198,157,0.5); }
          50%     { box-shadow: 0 0 0 8px rgba(116,198,157,0); }
        }
        @keyframes pulseOpacity {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(380px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-380px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes popupPulse {
          0% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0.7); }
          70% { box-shadow: 0 0 0 16px rgba(192, 57, 43, 0); }
          100% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0); }
        }
        @keyframes popupPulseAmber {
          0% { box-shadow: 0 0 0 0 rgba(212, 160, 48, 0.7); }
          70% { box-shadow: 0 0 0 16px rgba(212, 160, 48, 0); }
          100% { box-shadow: 0 0 0 0 rgba(212, 160, 48, 0); }
        }

        .btn-concluir {
          background-color: var(--green);
          color: var(--bg-primary);
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          box-shadow: 0 4px 12px rgba(45, 106, 79, 0.4);
        }
        .btn-concluir:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(45, 106, 79, 0.6);
        }

        .sidebar {
           width: 240px;
           background-color: var(--bg-secondary);
           border-left: 1px solid var(--border);
           padding: 24px 20px;
           overflow-y: auto;
           flex-shrink: 0;
        }
        @media (max-width: 1200px) {
          .sidebar { display: none !important; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Header Fixo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '72px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '4px' }}>
              <span style={{ fontSize: '34px', color: 'var(--crimson)', fontFamily: '"Noto Serif JP", serif', fontWeight: 700 }}>我慢</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }}>
                <span style={{ fontSize: '22px', letterSpacing: '0.15em', color: 'var(--crimson)', fontFamily: '"Shippori Mincho", serif', lineHeight: 0.9 }}>GAMAN</span>
                <span style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--amber)', lineHeight: 1, fontWeight: 800, paddingLeft: '2px' }}>SUSHI LOUNGE</span>
              </div>
            </div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--green-light)', animation: 'pulse 2s infinite' }} />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <StatCard label="Em Aberto" value={stats.pending} color="var(--amber)" solidBg />
            <StatCard label="Críticos" value={stats.critical} color="var(--crimson-hot)" pulse={stats.critical > 0} solidBg />
            <StatCard label="Concluídos" value={stats.completed} color="var(--green-light)" solidBg />
            <StatCard label="Total de Itens" value={stats.totalItems} color="var(--cream)" />
            <StatCard label="Tempo Médio" value={`${stats.avgTime}m`} color="var(--amber)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '22px', fontFamily: '"DM Sans", sans-serif', fontVariantNumeric: 'tabular-nums', color: 'var(--cream)', fontWeight: 500 }}>
                {now.toLocaleTimeString('pt-BR', { hour12: false })}
            </span>
            <button aria-label="Toggle Sound" onClick={() => {
                setMuted(!muted);
                if (audioContext && audioContext.state === 'suspended') {
                  audioContext.resume();
                }
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: 0 }}>
                {muted ? '🔕' : '🔔'}
            </button>
            <button onClick={() => {
              handleSimulate();
              if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
              }
            }} style={{ backgroundColor: 'var(--crimson)', color: 'var(--cream)', border: 'none', padding: '8px 18px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', transition: 'filter 0.2s' }} onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'} onMouseOut={e => e.currentTarget.style.filter = 'none'}>
                + Simular
            </button>
          </div>
        </div>

        {needsInteraction && (
          <div 
            onClick={() => {
              if (audioContext) audioContext.resume();
              setNeedsInteraction(false);
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '40px', borderRadius: '24px', border: '2px solid var(--amber)', textAlign: 'center', animation: 'slideIn 0.5s ease-out' }}>
              <span style={{ fontSize: '64px', marginBottom: '24px', display: 'block' }}>🔊</span>
              <h2 style={{ color: 'var(--cream)', fontSize: '24px', marginBottom: '12px' }}>O som está pausado</h2>
              <p style={{ color: 'var(--cream-dim)', marginBottom: '32px' }}>Clique em qualquer lugar para ativar os alertas sonoros.</p>
              <button style={{ backgroundColor: 'var(--amber)', color: 'var(--bg-primary)', border: 'none', padding: '12px 32px', borderRadius: '12px', fontWeight: 800, textTransform: 'uppercase' }}>Ativar Som Agora</button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', padding: '16px 32px', borderBottom: '1px solid var(--border-dim)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', width: '100%', maxWidth: '1200px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {filters.map(f => {
                  const isActive = filter === f;
                  return (
                    <button key={f} onClick={() => setFilter(f)} style={{
                        backgroundColor: isActive ? 'var(--crimson)' : 'var(--bg-secondary)',
                        color: isActive ? 'var(--cream)' : 'var(--cream-faint)',
                        border: `1px solid ${isActive ? 'var(--crimson)' : 'var(--border-dim)'}`,
                        padding: '8px 20px', borderRadius: '24px', fontSize: '14px', cursor: 'pointer',
                        transition: 'all 0.2s', fontWeight: isActive ? 700 : 500,
                        boxShadow: isActive ? '0 2px 8px rgba(139, 26, 26, 0.4)' : 'none'
                    }}>
                      {f}
                    </button>
                  )
              })}
            </div>
            
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                backgroundColor: 'var(--bg-secondary)', color: 'var(--cream)', border: '1px solid var(--border-dim)',
                padding: '10px 16px', borderRadius: '8px', fontSize: '14px', outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 500
            }}>
                {sorts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            
            {/* Cards Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px', alignContent: 'start' }}>
                  {filteredAndSortedOrders.map(order => {
                      const isCompleted = order.status === 'completed';
                      const urgency = isCompleted ? { border: 'var(--border-dim)', sidebar: 'var(--green)', badge: 'var(--cream-faint)', pulsing: false } as UrgencyInfo : getUrgency(order.createdAt, now);
                      const timeRef = isCompleted ? (order.completedAt || order.createdAt) : order.createdAt;
                      const groupedItems = groupOrderItems(order.items);
                      const totalItems = order.items.reduce((acc, i) => acc + i.qty, 0);
                      const totalProducts = order.items.length;

                      return (
                          <div key={order.id} style={{ 
                                backgroundColor: 'var(--bg-card)',
                                border: `1px solid ${isCompleted ? 'var(--border-dim)' : urgency.border}`,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                borderRadius: '8px',
                                position: 'relative',
                                overflow: 'hidden',
                                opacity: isCompleted ? 0.45 : 1,
                                display: 'flex',
                                flexDirection: 'column',
                                animation: urgency.pulsing && !isCompleted ? 'criticalPulse 1.5s infinite' : 'none',
                                transition: 'all 0.3s',
                                paddingLeft: '4px'
                          }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: urgency.sidebar }} />
                              
                              <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-dim)' }}>
                                  <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--amber)', lineHeight: 1 }}>MESA {String(order.table).padStart(2, '0')}</span>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                      <span style={{ fontSize: '13px', color: 'var(--cream-dim)', fontVariantNumeric: 'tabular-nums' }}>[{formatTime(timeRef)}]</span>
                                      <span style={{ fontSize: '11px', color: urgency.badge, animation: urgency.pulsing && !isCompleted ? 'pulseOpacity 1s infinite' : 'none', fontWeight: urgency.pulsing ? 700 : 400 }}>
                                          {isCompleted ? 'Concluído' : formatRelative(order.createdAt, now)}
                                      </span>
                                  </div>
                              </div>

                              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                                 {groupedItems.map((group, gIdx) => (
                                    <div key={gIdx}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'var(--bg-primary)', border: `1px solid ${group.station.color}40`, marginBottom: '10px' }}>
                                            <span style={{ color: group.station.color, fontFamily: '"Noto Serif JP", serif', paddingTop: '2px' }}>{group.station.kanji}</span>
                                            <span style={{ fontSize: '11px', color: group.station.color, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{group.station.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                           {group.items.map((item, idx) => {
                                               // Find original index in order.items for dispatch
                                               const originalIdx = order.items.findIndex(oi => oi.name === item.name && oi.qty === item.qty);
                                               return (
                                               <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, backgroundColor: 'var(--amber)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px', lineHeight: 1, marginTop: '2px' }}>×{item.qty}</span>
                                                        <span style={{ fontSize: '15px', color: 'var(--cream)', lineHeight: '1.2' }}>{item.name}</span>
                                                      </div>
                                                      {!isCompleted && (
                                                        <button 
                                                          onClick={() => handleItemReady(order.id, order.table, originalIdx >= 0 ? originalIdx : 0, item.name)}
                                                          style={{ backgroundColor: '#13aff0', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', transition: 'filter 0.2s' }}
                                                          onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
                                                          onMouseOut={e => e.currentTarget.style.filter = 'none'}
                                                        >
                                                          ✔ Pronto
                                                        </button>
                                                      )}
                                                  </div>
                                                  {item.obs && (
                                                      <span style={{ fontSize: '11px', color: 'var(--cream-dim)', fontStyle: 'italic', paddingLeft: '32px' }}>↳ {item.obs}</span>
                                                  )}
                                               </div>
                                               );
                                           })}
                                        </div>
                                    </div>
                                 ))}
                              </div>

                              <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '48px' }}>
                                  <span style={{ fontSize: '12px', color: 'var(--cream-dim)' }}>
                                      {totalItems} {totalItems === 1 ? 'item' : 'itens'} · {totalProducts} {totalProducts === 1 ? 'produto' : 'produtos'}
                                  </span>
                                  {!isCompleted && (
                                      <button className="btn-concluir" onClick={() => handleComplete(order.id, order.table)}>
                                          ✓ Concluído
                                      </button>
                                  )}
                              </div>
                          </div>
                      );
                  })}
               </div>
            </div>

            {/* Sidebar Direita */}
            <aside className="sidebar">
               <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-dim)', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                   <SectionTitle>Fila por estação</SectionTitle>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {stationQueue.map(({ station, count }) => {
                          if (count === 0) return null;
                          const width = Math.min((count / 30) * 100, 100);
                          return (
                             <div key={station.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--cream-dim)', marginBottom: '6px' }}>
                                   <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <span style={{ fontFamily: '"Noto Serif JP", serif', color: station.color }}>{station.kanji}</span>
                                      <span>{station.label}</span>
                                   </div>
                                   <span style={{ fontWeight: 600, color: 'var(--cream)' }}>{count} itens</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-dim)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${width}%`, height: '100%', backgroundColor: station.color, borderRadius: '3px' }}/>
                                </div>
                             </div>
                          )
                      })}
                   </div>
               </div>

               <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-dim)', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                   <SectionTitle>Pedidos Antigos</SectionTitle>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {oldestPending.length === 0 && <span style={{ fontSize: '13px', color: 'var(--cream-faint)' }}>Nenhum pedido em aberto.</span>}
                      {oldestPending.map(o => {
                          const urg = getUrgency(o.createdAt, now);
                          return (
                             <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: 'var(--amber)', fontWeight: 700 }}>Mesa {String(o.table).padStart(2, '0')}</span>
                                <span style={{ color: urg.badge }}>{formatRelative(o.createdAt, now)}</span>
                             </div>
                          );
                      })}
                   </div>
               </div>

               <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-dim)', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                   <SectionTitle>Últimos Concluídos</SectionTitle>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                       {latestCompleted.length === 0 && <span style={{ fontSize: '13px', color: 'var(--cream-faint)' }}>Nenhum pedido concluído.</span>}
                       {latestCompleted.map(o => (
                           <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--cream-faint)' }}>
                                <span>Mesa {String(o.table).padStart(2, '0')}</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(o.completedAt || o.createdAt)}</span>
                           </div>
                       ))}
                   </div>
               </div>
            </aside>
        </div>

        {/* Popup Notificação Pedido */}
        {popup && (
           <div style={{ 
               position: 'fixed', top: '90px', right: '24px', zIndex: 999, 
               backgroundColor: 'var(--amber)', border: '2px solid var(--amber-dim)', 
               borderRadius: '12px', padding: '16px 24px', color: 'var(--bg-primary)', 
               boxShadow: '0 8px 32px rgba(0,0,0,0.6)', 
               animation: 'slideInRight 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards, popupPulseAmber 1.5s infinite', 
               display: 'flex', alignItems: 'center', gap: '16px' 
           }}>
              <span style={{ fontSize: '32px' }}>🔔</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                 <span style={{ fontWeight: 800, fontSize: '18px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Novo Pedido · Mesa {String(popup.table).padStart(2, '0')}</span>
                 <span style={{ fontSize: '14px', opacity: 0.9, fontWeight: 600 }}>{popup.items} {popup.items === 1 ? 'item recebido' : 'itens recebidos'}</span>
              </div>
           </div>
        )}

        {/* Popup Notificação Garçom */}
        {waiterPopup && (
           <div style={{ 
               position: 'fixed', bottom: '32px', right: '32px', zIndex: 999, 
               backgroundColor: 'var(--green)', border: '2px solid var(--cream)', 
               borderRadius: '12px', padding: '16px 24px', color: 'var(--bg-primary)', 
               boxShadow: '0 8px 32px rgba(0,0,0,0.6)', 
               animation: 'slideInRight 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards', 
               display: 'flex', alignItems: 'center', gap: '16px' 
           }}>
              <span style={{ fontSize: '32px' }}>🏃</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                 <span style={{ fontWeight: 800, fontSize: '18px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mesa {String(waiterPopup.table).padStart(2, '0')} — TUDO PRONTO</span>
                 <span style={{ fontSize: '14px', fontWeight: 600 }}>Garçom acionado com sucesso</span>
              </div>
           </div>
        )}

        {/* Popup Item Individual Pronto */}
        {itemReadyPopup && (
           <div style={{ 
               position: 'fixed', bottom: '32px', left: '32px', zIndex: 999, 
               backgroundColor: '#13aff0', border: '2px solid #fff', 
               borderRadius: '12px', padding: '14px 20px', color: '#fff', 
               boxShadow: '0 8px 32px rgba(0,0,0,0.6)', 
               animation: 'slideInLeft 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards', 
               display: 'flex', alignItems: 'center', gap: '14px',
               maxWidth: '380px'
           }}>
              <span style={{ fontSize: '28px' }}>🍣</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                 <span style={{ fontWeight: 800, fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mesa {String(itemReadyPopup.table).padStart(2, '0')} — Item Enviado</span>
                 <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.9 }}>{itemReadyPopup.itemName}</span>
              </div>
           </div>
        )}
      </div>
    </>
  );
}
