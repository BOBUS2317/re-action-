import { useEffect, useMemo, useState } from "react";
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
  city?: string | null;
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

function fmt(amountCents: number): string {
  return ((amountCents || 0) / 100).toFixed(2);
}

/** Демо-расшифровка чека: делим сумму на 4 услуги, копейки сходятся с итогом. */
function breakdown(totalCents: number): { name: string; cents: number }[] {
  const shares = [
    { name: "Холодное водоснабжение и водоотведение", part: 0.18 },
    { name: "Горячее водоснабжение", part: 0.27 },
    { name: "Электроэнергия", part: 0.22 },
    { name: "Содержание жилья", part: 0.33 },
  ];
  const rows = shares.map((s) => ({ name: s.name, cents: Math.round(totalCents * s.part) }));
  const diff = totalCents - rows.reduce((s, r) => s + r.cents, 0);
  rows[rows.length - 1].cents += diff;
  return rows;
}

export default function Receipts() {
  const navigate = useNavigate();
  const [uid] = useState(() => getEffectiveUserId());
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "due" | "paid">("all");
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const isLinked = localStorage.getItem("tg_linked") === "true";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts?limit=24`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setError("Не смог загрузить квитанции. Проверьте связь и попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const due = useMemo(
    () => items.filter((r) => r.status === "unpaid" || r.status === "overdue"),
    [items]
  );
  const debt = useMemo(() => due.reduce((s, r) => s + (r.amount_cents || 0), 0), [due]);

  const visible = useMemo(() => {
    if (filter === "due") return due;
    if (filter === "paid") return items.filter((r) => r.status === "paid" || r.status === "cancelled");
    return items;
  }, [items, due, filter]);

  async function payOne(id: number) {
    setPayingId(id);
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts/${id}/pay`, { method: "POST" });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error((e && e.detail) || `HTTP ${r.status}`);
      }
      const updated: Receipt = await r.json();
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setToast(`Квитанция ${updated.billing_period} оплачена. Деньги не списывались — это демо-оплата.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Не получилось оплатить. Попробуйте позже.");
    } finally {
      setPayingId(null);
    }
  }

  async function payAll() {
    if (!due.length) return;
    if (!window.confirm(`Оплатить ${due.length} квитанции на ${fmt(debt)} ₽? Это демо-оплата.`)) return;
    setPayingAll(true);
    try {
      for (const r of due) {
        const resp = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts/${r.id}/pay`, { method: "POST" });
        if (!resp.ok) throw new Error(`Не оплатилась ${r.billing_period}`);
        const updated: Receipt = await resp.json();
        setItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      }
      setToast("Все квитанции оплачены.");
    } catch {
      setToast("Часть квитанций не оплатилась. Обновите страницу и попробуйте ещё раз.");
    } finally {
      setPayingAll(false);
    }
  }

  async function loadDemo() {
    setDemoLoading(true);
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts/demo`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
      setToast("Загрузил демо-квитанции за 3 месяца.");
    } catch {
      setToast("Не получилось загрузить демо-квитанции.");
    } finally {
      setDemoLoading(false);
    }
  }

  async function copyRequisites(r: Receipt) {
    const text = `${r.provider}\nПериод: ${r.billing_period}\nСумма: ${fmt(r.amount_cents)} ₽\nЛицевой счёт: ${uid}\n${r.due_at ? `Оплатить до: ${r.due_at.slice(0, 10)}\n` : ""}Назначение: ЖКХ за ${r.billing_period}`;
    try {
      await navigator.clipboard.writeText(text);
      setToast("Реквизиты скопированы.");
    } catch {
      setToast("Не получилось скопировать. Выделите текст вручную.");
    }
  }

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
          {loading ? "Загружаю…" : items.length ? `Задолженность: ${fmt(debt)} ₽ · к оплате: ${due.length}` : "На этот профиль начислений пока нет"}
        </p>

        {toast && (
          <div className="mb-4 bg-[#0F172A] text-white text-[13px] font-medium px-4 py-3 rounded-xl">{toast}</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">К оплате</p>
              <p className="text-[24px] font-extrabold text-[#0F172A]">{fmt(debt)} ₽</p>
              <p className="text-[12px] text-[#64748B]">Демо-режим: деньги никуда не уходят, статус меняется в базе.</p>
            </div>
            <button
              onClick={payAll}
              disabled={!due.length || payingAll}
              className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:opacity-40 text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              {payingAll ? "Оплачиваю…" : due.length ? `Оплатить всё (${due.length})` : "Долгов нет"}
            </button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex gap-2 mb-4">
            {([
              { k: "all", label: `Все (${items.length})` },
              { k: "due", label: `К оплате (${due.length})` },
              { k: "paid", label: `Оплаченные (${items.length - due.length})` },
            ] as const).map((t) => (
              <button
                key={t.k}
                onClick={() => setFilter(t.k)}
                className={`text-[13px] font-semibold px-4 py-2 rounded-full border transition-colors ${filter === t.k ? "bg-[#1B5EBE] border-[#1B5EBE] text-white" : "bg-white border-[#E2E8F0] text-[#475569] hover:border-[#1B5EBE]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-[14px] text-[#64748B]">Загружаю квитанции…</div>
        ) : error && !items.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
            <p className="text-[14px] text-[#64748B] mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={load} className="bg-[#1B5EBE] text-white text-[14px] font-semibold px-6 py-3 rounded-xl">Повторить</button>
              <button onClick={() => navigate("/profile")} className="bg-white border border-[#E2E8F0] text-[14px] font-semibold px-6 py-3 rounded-xl">Открыть профиль</button>
            </div>
          </div>
        ) : !items.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center">
            <p className="text-[16px] font-semibold text-[#0F172A] mb-1">Квитанций пока нет</p>
            <p className="text-[14px] text-[#64748B] mb-6">
              {isLinked
                ? "Нажмите кнопку ниже — создам демо-начисления за 3 месяца, чтобы проверить оплату."
                : "Если вы регистрировались в боте — привяжите Telegram в профиле. Или нажмите кнопку ниже для демо-начислений."}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={loadDemo} disabled={demoLoading} className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:opacity-50 text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors">
                {demoLoading ? "Создаю…" : "Показать демо-квитанции"}
              </button>
              {!isLinked && (
                <button onClick={() => navigate("/profile")} className="bg-white border border-[#E2E8F0] text-[14px] font-semibold px-6 py-3 rounded-xl">
                  Привязать Telegram
                </button>
              )}
            </div>
          </div>
        ) : !visible.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center text-[14px] text-[#64748B]">
            В этом фильтре квитанций нет.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const isDue = r.status === "unpaid" || r.status === "overdue";
              const expanded = expandedId === r.id;
              return (
                <article key={r.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-[13px] font-bold text-[#0F172A]">{r.billing_period}</span>
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[r.status] || STATUS_STYLE.unpaid}`}>
                          {STATUS_NAME[r.status] || r.status}
                        </span>
                      </div>
                      <p className="text-[14px] text-[#0F172A] font-medium">{r.provider}</p>
                      <p className="text-[12px] text-[#94A3B8] mt-0.5">
                        {r.due_at ? `До ${r.due_at.slice(0, 10)}` : ""}
                        {r.paid_at && r.status === "paid" ? ` · оплачена ${r.paid_at.slice(0, 10)}` : ""}
                        {r.street ? ` · ${r.street} ${r.house || ""}${r.apartment ? `, кв. ${r.apartment}` : ""}` : ""}
                      </p>
                    </div>
                    <p className="text-[18px] font-extrabold text-[#0F172A] whitespace-nowrap">{fmt(r.amount_cents)} ₽</p>
                  </div>

                  <div className="flex gap-2 mt-4 flex-wrap">
                    {isDue && (
                      <button
                        onClick={() => payOne(r.id)}
                        disabled={payingId === r.id}
                        className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:opacity-50 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors"
                      >
                        {payingId === r.id ? "Оплата…" : `Оплатить ${fmt(r.amount_cents)} ₽`}
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      className="bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors"
                    >
                      {expanded ? "Скрыть чек" : "Чек и детали"}
                    </button>
                    <button
                      onClick={() => copyRequisites(r)}
                      className="bg-white border border-[#E2E8F0] hover:border-[#1B5EBE] text-[#475569] text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors"
                    >
                      Скопировать реквизиты
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-4 border-t border-[#F1F5F9] pt-4">
                      <p className="text-[13px] font-bold text-[#0F172A] mb-2">Расшифровка (демо)</p>
                      <div className="space-y-1.5">
                        {breakdown(r.amount_cents).map((b) => (
                          <div key={b.name} className="flex justify-between text-[13px]">
                            <span className="text-[#475569]">{b.name}</span>
                            <span className="font-semibold text-[#0F172A]">{fmt(b.cents)} ₽</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[13px] pt-2 border-t border-[#F1F5F9]">
                          <span className="font-bold text-[#0F172A]">Итого</span>
                          <span className="font-extrabold text-[#0F172A]">{fmt(r.amount_cents)} ₽</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => window.print()} className="text-[12px] font-semibold text-[#1B5EBE] hover:underline">
                          Печать чека
                        </button>
                        <span className="text-[12px] text-[#94A3B8]">Лицевой счёт: {uid}</span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
