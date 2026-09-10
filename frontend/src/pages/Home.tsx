import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId } from "../lib/user";

const TILES = [
  { id: 1, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M12 2C8 2 4 5.5 4 9.5c0 5.25 8 12.5 8 12.5s8-7.25 8-12.5C20 5.5 16 2 12 2z"/><circle cx="12" cy="9.5" r="2.5"/></svg>), label: "Куда платить за воду", color: "blue", badge: null, route: null as string | null, chat: "покажи мои квитанции" },
  { id: 2, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>), label: "Когда отключат свет", color: "amber", badge: "Есть отключения", route: null, chat: "когда отключат свет" },
  { id: 3, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>), label: "Подать показания", color: "teal", badge: null, route: "/meters", chat: null },
  { id: 4, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M22 16.92V21a2 2 0 01-2.18 2A19.79 19.79 0 013 5.18 2 2 0 015 3h4.09a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.91 11a16 16 0 006.09 6.09l1.36-1.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>), label: "Аварийная служба", color: "red", badge: "112", route: "/company", chat: null },
  { id: 5, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>), label: "Мои квитанции", color: "blue", badge: "3 новых", route: "/receipts", chat: null },
  { id: 6, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>), label: "Моя УК", color: "violet", badge: null, route: "/company", chat: null },
];

interface Appeal {
  id: string;
  title: string;
  date: string;
  status: string;
  statusColor: "amber" | "green" | "slate";
}

const tileColorMap: Record<string, { bg: string; icon: string; badgeBg: string; badgeText: string }> = {
  blue:   { bg: "bg-[#EBF2FF] hover:bg-[#D7E8FF]", icon: "text-[#1B5EBE]", badgeBg: "bg-[#1B5EBE]", badgeText: "text-white" },
  amber:  { bg: "bg-amber-50 hover:bg-amber-100", icon: "text-amber-600", badgeBg: "bg-amber-500", badgeText: "text-white" },
  teal:   { bg: "bg-teal-50 hover:bg-teal-100", icon: "text-teal-600", badgeBg: "bg-teal-500", badgeText: "text-white" },
  red:    { bg: "bg-red-50 hover:bg-red-100", icon: "text-red-600", badgeBg: "bg-red-600", badgeText: "text-white" },
  violet: { bg: "bg-violet-50 hover:bg-violet-100", icon: "text-violet-600", badgeBg: "bg-violet-500", badgeText: "text-white" },
  slate:  { bg: "bg-slate-100 hover:bg-slate-200", icon: "text-slate-500", badgeBg: "bg-slate-400", badgeText: "text-white" },
};

const appealStatusMap: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
  slate: "bg-slate-100 text-slate-500",
};

const RESOURCE_SHORT: Record<string, string> = {
  cold_water: "ХВС",
  hot_water: "ГВС",
  electricity: "Свет",
  gas: "Газ",
  heating: "Тепло",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<Appeal[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [debt, setDebt] = useState<string>("—");
  const [debtSub, setDebtSub] = useState("Загружаю…");
  const [nextPay, setNextPay] = useState("—");
  const [nextPaySub, setNextPaySub] = useState("Загружаю…");
  const [metersLine, setMetersLine] = useState("—");
  const [metersSub, setMetersSub] = useState("Загружаю…");
  const [ukName, setUkName] = useState("—");
  const [ukPhone, setUkPhone] = useState("Загружаю…");
  const navigate = useNavigate();

  const isAuth = localStorage.getItem("auth") === "true";

  const tgUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("tg_user") || "{}");
    } catch {
      return {};
    }
  })();

  const firstName = tgUser.first_name || tgUser.display_name?.split(" ")?.[0];
  const initials =
    ((firstName?.[0] || tgUser.display_name?.[0] || "И") as string) +
    ((tgUser.last_name?.[0] || tgUser.display_name?.split(" ")?.[1]?.[0] || "П") as string);
  const displayName = firstName
    ? `${firstName} ${tgUser.last_name || tgUser.display_name?.split(" ")?.slice(1)?.join(" ") || ""}`.trim()
    : "Пользователь";

  const uid = getEffectiveUserId();

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("history") || "[]");
      setHistory(Array.isArray(raw) ? raw : []);
    } catch {
      setHistory([]);
    }
    let alive = true;
    (async () => {
      // Адрес — из базы (туда его кладёт бот при /register), кэш — запасной вариант
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/profile`);
        if (r.ok) {
          const p = await r.json();
          if (p?.street && p?.house && alive) {
            setAddress(`${p.street}, ${p.house}${p.apartment ? `, кв. ${p.apartment}` : ""}`);
            localStorage.setItem("profile", JSON.stringify({
              city: p.city || "", street: p.street || "", house: p.house || "",
              apartment: p.apartment || "", phone: p.phone || "",
            }));
          }
        }
      } catch { /* ignore */ }
      if (!alive) return;
      // Квитанции → задолженность и следующий платёж
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts?limit=12`);
        if (r.ok && alive) {
          const list = await r.json();
          if (Array.isArray(list) && list.length) {
            const due = list.filter((x: { status: string }) => x.status === "unpaid" || x.status === "overdue");
            const sum = due.reduce((s: number, x: { amount_cents: number }) => s + (x.amount_cents || 0) / 100, 0);
            setDebt(`${sum.toFixed(2)} ₽`);
            setDebtSub(due.length ? `К оплате: ${due.length}` : "Нет долгов");
            const first = due[0] || list[0];
            setNextPay(`${((first.amount_cents || 0) / 100).toFixed(2)} ₽`);
            setNextPaySub(first.billing_period || first.provider || "");
          } else {
            setDebt("0 ₽"); setDebtSub("Нет начислений");
            setNextPay("—"); setNextPaySub("Квитанций пока нет");
          }
        }
      } catch { if (alive) { setDebt("—"); setDebtSub("Нет связи"); } }
      // Показания
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/meter-readings?limit=4`);
        if (r.ok && alive) {
          const list = await r.json();
          if (Array.isArray(list) && list.length) {
            const top = list.slice(0, 2).map((m: { resource: string; value: number }) => `${RESOURCE_SHORT[m.resource] || m.resource} ${m.value}`).join(" · ");
            setMetersLine(top || "Есть показания");
            setMetersSub(`${list.length} показаний подано`);
          } else {
            setMetersLine("Нет показаний"); setMetersSub("Нажмите «Подать показания»");
          }
        }
      } catch { if (alive) { setMetersLine("—"); setMetersSub("Нет связи"); } }
      // УК
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/organization`);
        if (r.ok && alive) {
          const d = await r.json();
          if (d?.management?.name) {
            setUkName(d.management.name.length > 18 ? d.management.name.slice(0, 18) + "…" : d.management.name);
            setUkPhone(d.management.phone || "телефон не указан");
          } else {
            setUkName("Не закреплена"); setUkPhone("укажите адрес в профиле");
          }
        }
      } catch { if (alive) { setUkName("—"); setUkPhone("Нет связи"); } }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Кэш адреса, если сервер пока молчит
  useEffect(() => {
    if (address) return;
    try {
      const p = JSON.parse(localStorage.getItem("profile") || "{}");
      if (p.street && p.house) setAddress(`${p.street}, ${p.house}${p.apartment ? `, кв. ${p.apartment}` : ""}`);
    } catch { /* ignore */ }
  }, [address]);

  function goToChat(message?: string) {
    navigate("/chat", { state: message ? { initialMessage: message } : undefined });
  }

  function handleTile(tile: (typeof TILES)[number]) {
    if (tile.route) navigate(tile.route);
    else goToChat(tile.chat || tile.label);
  }

  const recent = history.slice(0, 3);

  return (
    <div className="min-h-screen bg-white font-sans text-[#0F172A]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4"><path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z"/></svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">
              ЖКХ-<span className="text-[#1B5EBE]">помощник</span>
            </span>
          </button>

          <div className="flex items-center gap-4">
            {address && (
              <>
                <div className="flex items-center gap-1.5 text-[13px] text-[#64748B]">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#1B5EBE]">
                    <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"/>
                    <circle cx="8" cy="6" r="1.5"/>
                  </svg>
                  <span className="font-medium text-[#334155]">{address}</span>
                </div>
                <div className="w-px h-5 bg-[#E2E8F0]" />
              </>
            )}

            {isAuth ? (
              <button
                onClick={() => navigate("/profile")}
                title="Личный кабинет"
                className="flex items-center gap-2 rounded-full hover:bg-[#F1F5F9] px-2 py-1 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[13px] font-semibold">
                  {initials}
                </div>
                <span className="text-[13px] font-medium text-[#334155]">{displayName}</span>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[#94A3B8]">
                  <path d="M2 4l4 4 4-4"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="flex items-center gap-2 bg-[#229ED9] hover:bg-[#1c87b8] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
                </svg>
                Войти
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#EBF2FF] to-white pt-14 pb-12 px-8">
        <div className="max-w-[720px] mx-auto text-center">
          <p className="text-[13px] font-medium text-[#1B5EBE] tracking-wide uppercase mb-3">Добро пожаловать</p>
          <h1 className="text-[36px] font-extrabold tracking-tight text-[#0F172A] mb-2">
            Здравствуйте{isAuth && firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="text-[18px] text-[#64748B] mb-8">Чем могу помочь сегодня?</p>

          <div className={`relative max-w-[560px] mx-auto transition-all duration-200 ${focused ? "drop-shadow-lg" : "drop-shadow-md"}`}>
            <div className={`flex items-center bg-white rounded-2xl border-2 transition-colors duration-200 ${focused ? "border-[#1B5EBE]" : "border-[#E2E8F0]"} px-4 py-3.5`}>
              <svg viewBox="0 0 20 20" fill="none" stroke="#94A3B8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                <circle cx="9" cy="9" r="6"/>
                <path d="M15 15l3 3"/>
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Например: куда платить за воду"
                className="flex-1 ml-3 bg-transparent text-[15px] text-[#0F172A] placeholder-[#94A3B8] outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-[#94A3B8] hover:text-[#64748B] transition-colors">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M3 3l10 10M13 3L3 13"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => goToChat(query || undefined)}
                className="ml-3 bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[13px] font-semibold px-4 py-1.5 rounded-xl transition-colors"
              >
                Найти
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1280px] mx-auto px-8 pb-16">
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#0F172A]">Популярные услуги</h2>
            <button className="text-[13px] font-medium text-[#1B5EBE] hover:text-[#1449A0] transition-colors">
              Все услуги →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 xl:gap-5">
            {TILES.map((tile) => {
              const c = tileColorMap[tile.color] ?? tileColorMap.blue;
              return (
                <button
                  key={tile.id}
                  onClick={() => handleTile(tile)}
                  className={`relative flex flex-col items-start gap-4 p-6 rounded-2xl ${c.bg} transition-all duration-200 group text-left cursor-pointer`}
                >
                  {tile.badge && (
                    <span className={`absolute top-4 right-4 text-[11px] font-semibold ${c.badgeBg} ${c.badgeText} rounded-full px-2.5 py-0.5`}>
                      {tile.badge}
                    </span>
                  )}
                  <div className={`p-2.5 rounded-xl bg-white/70 ${c.icon} transition-transform duration-200 group-hover:scale-110`}>
                    {tile.icon}
                  </div>
                  <p className="text-[15px] font-semibold text-[#0F172A] leading-snug">
                    {tile.label}
                  </p>
                  <div className={`flex items-center gap-1 text-[12px] font-medium ${c.icon} opacity-70 group-hover:opacity-100 transition-opacity`}>
                    <span>Подробнее</span>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 translate-x-0 group-hover:translate-x-0.5 transition-transform">
                      <path d="M2 6h8M6 2l4 4-4 4"/>
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-4 gap-4 mb-12">
          {[
            { label: "Задолженность", value: debt, sub: debtSub, color: "text-emerald-600", route: "/receipts" },
            { label: "Следующий платёж", value: nextPay, sub: nextPaySub, color: "text-[#1B5EBE]", route: "/receipts" },
            { label: "Показания счётчиков", value: metersLine, sub: metersSub, color: "text-[#64748B]", route: "/meters" },
            { label: "УК на связи", value: ukName, sub: ukPhone, color: "text-[#64748B]", route: "/company" },
          ].map((s, i) => (
            <button key={i} onClick={() => navigate(s.route)} className="bg-[#F8FAFC] rounded-xl px-5 py-4 border border-[#E2E8F0] text-left hover:border-[#93C5FD] transition-colors">
              <p className="text-[12px] text-[#94A3B8] font-medium mb-1">{s.label}</p>
              <p className={`text-[16px] font-bold ${s.color} mb-0.5`}>{s.value}</p>
              <p className="text-[12px] text-[#64748B]">{s.sub}</p>
            </button>
          ))}
        </section>

        {recent.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-[#0F172A]">Последние обращения</h2>
              <button
                onClick={() => navigate("/history")}
                className="text-[13px] font-medium text-[#1B5EBE] hover:text-[#1449A0] transition-colors"
              >
                Все обращения →
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {recent.map((a) => (
                <article
                  key={a.id}
                  onClick={() => goToChat(a.title)}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#93C5FD] hover:shadow-sm transition-all duration-200 cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-[11px] font-semibold text-[#94A3B8] font-mono tracking-wide">{a.id}</span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${appealStatusMap[a.statusColor]}`}>
                      {a.status}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#0F172A] mb-4 group-hover:text-[#1B5EBE] transition-colors">
                    {a.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#94A3B8]">{a.date}</span>
                    <span className="text-[12px] font-medium text-[#1B5EBE] group-hover:text-[#1449A0] transition-colors">
                      Подробнее →
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="max-w-[1280px] mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z"/>
              </svg>
            </div>
            <span className="text-[13px] font-medium text-[#64748B]">ЖКХ-помощник © 2026</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-[#94A3B8]">
            <a href="#" className="hover:text-[#1B5EBE] transition-colors">Помощь</a>
            <a href="#" className="hover:text-[#1B5EBE] transition-colors">Обратная связь</a>
            <a href="#" className="hover:text-[#1B5EBE] transition-colors">Политика конфиденциальности</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
