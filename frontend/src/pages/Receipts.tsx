import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId } from "../lib/user";

interface Receipt {
  id: number;
  billing_period: string;
  provider: string;
  amount_cents: number;
  status: string;
  due_at?: string | null;
  paid_at?: string | null;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  unpaid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const STATUS_NAME: Record<string, string> = {
  unpaid: "Не оплачена",
  overdue: "Просрочена",
  paid: "Оплачена",
  cancelled: "Отменена",
};

export default function Receipts() {
  const navigate = useNavigate();
  const [uid] = useState(() => getEffectiveUserId());
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isLinked = localStorage.getItem("tg_linked") === "true";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts?limit=24`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (alive) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setError("Не смог загрузить квитанции. Проверьте связь и попробуйте позже.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid]);

  const debt = items
    .filter((r) => r.status === "unpaid" || r.status === "overdue")
    .reduce((s, r) => s + (r.amount_cents || 0) / 100, 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4"><path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" /></svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">ЖКХ-<span className="text-[#1B5EBE]">помощник</span></span>
          </button>
          <button onClick={() => navigate("/")} className="text-[13px] font-medium text-[#64748B] hover:text-[#1B5EBE] transition-colors">На главную</button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10">
        <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">Мои квитанции</h1>
        <p className="text-[14px] text-[#64748B] mb-6">
          {loading ? "Загружаю…" : items.length ? `Задолженность: ${debt.toFixed(2)} ₽` : "На этот профиль начислений пока нет"}
        </p>

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-[14px] text-[#64748B]">Загружаю квитанции…</div>
        ) : error && !items.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
            <p className="text-[14px] text-[#64748B] mb-4">{error}</p>
            <button onClick={() => navigate("/profile")} className="bg-[#1B5EBE] text-white text-[14px] font-semibold px-6 py-3 rounded-xl">Открыть профиль</button>
          </div>
        ) : !items.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center">
            <p className="text-[16px] font-semibold text-[#0F172A] mb-1">Квитанций пока нет</p>
            <p className="text-[14px] text-[#64748B] mb-6">
              {isLinked
                ? "Начисления появятся здесь, когда УК их выставит."
                : "Если вы регистрировались в боте — привяжите Telegram в профиле, и я подтяну ваши начисления."}
            </p>
            {!isLinked && (
              <button onClick={() => navigate("/profile")} className="bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors">
                Привязать Telegram
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <article key={r.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[13px] font-bold text-[#0F172A]">{r.billing_period}</span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[r.status] || STATUS_STYLE.unpaid}`}>
                      {STATUS_NAME[r.status] || r.status}
                    </span>
                  </div>
                  <p className="text-[14px] text-[#0F172A] font-medium">{r.provider}</p>
                  <p className="text-[12px] text-[#94A3B8]">
                    {((r.amount_cents || 0) / 100).toFixed(2)} ₽
                    {r.due_at ? ` · до ${r.due_at.slice(0, 10)}` : ""}
                    {r.street ? ` · ${r.street} ${r.house || ""}${r.apartment ? `, кв. ${r.apartment}` : ""}` : ""}
                  </p>
                </div>
                <p className="text-[18px] font-extrabold text-[#0F172A] whitespace-nowrap">{((r.amount_cents || 0) / 100).toFixed(2)} ₽</p>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
