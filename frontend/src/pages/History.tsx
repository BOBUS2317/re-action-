import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId } from "../lib/user";

interface Appeal {
  id: string;
  title: string;
  date: string;
  status: string;
  statusColor: "amber" | "green" | "slate";
}

const appealStatusMap: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
  slate: "bg-slate-100 text-slate-500",
};

const TICKET_STATUS: Record<string, { label: string; color: "amber" | "green" | "slate" }> = {
  new: { label: "Новая", color: "amber" },
  accepted: { label: "Принята", color: "amber" },
  in_progress: { label: "В работе", color: "amber" },
  waiting: { label: "Ждёт уточнения", color: "amber" },
  resolved: { label: "Решена", color: "green" },
  closed: { label: "Закрыта", color: "green" },
  cancelled: { label: "Отменена", color: "slate" },
};

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let local: Appeal[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem("history") || "[]");
      local = Array.isArray(raw) ? raw : [];
    } catch { local = []; }
    (async () => {
      let server: Appeal[] = [];
      try {
        const uid = getEffectiveUserId();
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/tickets`);
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list)) {
            server = list.slice(0, 30).map((t: { id: number; title: string; status: string; created_at: string }) => {
              const m = TICKET_STATUS[t.status] || { label: t.status, color: "slate" as const };
              return {
                id: `№${t.id}`,
                title: t.title || "Обращение",
                date: String(t.created_at || "").slice(0, 10),
                status: m.label,
                statusColor: m.color,
              };
            });
          }
        }
      } catch { /* offline — покажем локальное */ }
      if (!alive) return;
      // Серверные заявки первыми (там же история из бота), потом локальные без дублей
      const seen = new Set(server.map((a) => `${a.title}|${a.date}`));
      const merged = [...server, ...local.filter((a) => !seen.has(`${a.title}|${a.date}`))];
      setHistory(merged);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  function clearAll() {
    if (!confirm("Удалить локальную историю? Заявки на сервере (в том числе из бота) останутся.")) return;
    localStorage.removeItem("history");
    setHistory((prev) => prev.filter((a) => a.id.startsWith("№") && /^\u2116\d+$/.test(a.id)));
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
              </svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">
              ЖКХ-<span className="text-[#1B5EBE]">помощник</span>
            </span>
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-[13px] font-medium text-[#64748B] hover:text-[#1B5EBE] transition-colors"
          >
            На главную
          </button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">Мои обращения</h1>
            <p className="text-[14px] text-[#64748B]">
              {loading ? "Загружаю…" : `Всего: ${history.length} (сайт и бот — вместе)`}
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearAll}
              className="text-[13px] font-medium text-[#94A3B8] hover:text-red-600 transition-colors"
            >
              Очистить историю
            </button>
          )}
        </div>

        {history.length === 0 && !loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
            </div>
            <p className="text-[16px] font-semibold text-[#0F172A] mb-1">Пока нет обращений</p>
            <p className="text-[14px] text-[#64748B] mb-6">
              Задайте вопрос в чате — обращение появится здесь
            </p>
            <button
              onClick={() => navigate("/chat")}
              className="bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Открыть чат
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((a) => (
              <article
                key={a.id + a.title}
                onClick={() =>
                  navigate("/chat", { state: { initialMessage: a.title } })
                }
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#93C5FD] hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[11px] font-semibold text-[#94A3B8] font-mono">
                      {a.id}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${appealStatusMap[a.statusColor]}`}>
                      {a.status}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#0F172A] mb-1 truncate">
                    {a.title}
                  </h3>
                  <span className="text-[12px] text-[#94A3B8]">{a.date}</span>
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="#94A3B8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
