import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface UserProfile {
  display_name: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
  apartment: string | null;
}

const TILES = [
  { id: 1, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M12 2C8 2 4 5.5 4 9.5c0 5.25 8 12.5 8 12.5s8-7.25 8-12.5C20 5.5 16 2 12 2z"/><circle cx="12" cy="9.5" r="2.5"/></svg>), label: "Куда платить\nза воду", color: "blue", badge: null },
  { id: 2, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>), label: "Когда отключат\nсвет", color: "amber", badge: "Есть отключения" },
  { id: 3, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>), label: "Подать\nпоказания", color: "teal", badge: null },
  { id: 4, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M22 16.92V21a2 2 0 01-2.18 2A19.79 19.79 0 013 5.18 2 2 0 015 3h4.09a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.91 11a16 16 0 006.09 6.09l1.36-1.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>), label: "Аварийная\nслужба", color: "red", badge: "112" },
  { id: 5, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>), label: "Мои\nквитанции", color: "blue", badge: "3 новых" },
  { id: 6, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>), label: "Моя УК", color: "violet", badge: null },
];

const APPEALS = [
  { id: "ЖКХ-2024-1891", title: "Течь батареи в подъезде", date: "08 сен 2026", status: "В работе", statusColor: "amber", desc: "Радиатор отопления на 3 этаже подъезда №2 даёт течь." },
  { id: "ЖКХ-2024-1742", title: "Замена лампочки в лифте", date: "02 сен 2026", status: "Выполнено", statusColor: "green", desc: "Перегорела лампа освещения в кабине лифта." },
  { id: "ЖКХ-2024-1610", title: "Уборка придомовой территории", date: "25 авг 2026", status: "Закрыто", statusColor: "slate", desc: "Прошу провести уборку мусора у контейнерной площадки." },
];

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

export default function Home() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userId = localStorage.getItem("reaction_user_id");
    if (!userId) return;
    fetch(`${API_URL}/api/users/${encodeURIComponent(userId)}/profile`)
      .then((response) => response.ok ? response.json() : null)
      .then((data: UserProfile | null) => setProfile(data))
      .catch(() => undefined);
  }, []);

  const displayName = profile?.display_name ?? "Гость";
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "Г";
  const address = profile?.street
    ? [profile.city, `ул. ${profile.street}`, profile.house, profile.apartment && `кв. ${profile.apartment}`].filter(Boolean).join(", ")
    : "Адрес не указан";

  return (
    <div className="min-h-screen bg-white font-sans text-[#0F172A]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4"><path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z"/></svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">ЖКХ-<span className="text-[#1B5EBE]">помощник</span></span>
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[13px] text-[#64748B]">
              <span className="font-medium text-[#334155]">{address}</span>
            </div>
            <div className="w-px h-5 bg-[#E2E8F0]" />
            <button className="flex items-center gap-2 rounded-full hover:bg-[#F1F5F9] px-2 py-1 transition-colors">
              <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[13px] font-semibold">{initials}</div>
              <span className="text-[13px] font-medium text-[#334155]">{displayName}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#EBF2FF] to-white pt-14 pb-12 px-8">
        <div className="max-w-[720px] mx-auto text-center">
          <h1 className="text-[36px] font-extrabold tracking-tight text-[#0F172A] mb-2">Здравствуйте, {displayName}!</h1>
          <p className="text-[18px] text-[#64748B] mb-8">Чем могу помочь сегодня?</p>

          <div className="relative max-w-[560px] mx-auto">
            <div className={`flex items-center bg-white rounded-2xl border-2 ${focused ? "border-[#1B5EBE]" : "border-[#E2E8F0]"} px-4 py-3.5 shadow-md`}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Например: куда платить за воду"
                className="flex-1 bg-transparent text-[15px] text-[#0F172A] placeholder-[#94A3B8] outline-none"
              />
              <button onClick={() => navigate("/chat")} className="ml-3 bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[13px] font-semibold px-4 py-1.5 rounded-xl transition-colors">Найти</button>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1280px] mx-auto px-8 pb-16">
        <section className="mb-12">
          <h2 className="text-[18px] font-bold text-[#0F172A] mb-5">Популярные услуги</h2>
          <div className="grid grid-cols-3 gap-4">
            {TILES.map((tile) => {
              const c = tileColorMap[tile.color] ?? tileColorMap.blue;
              return (
                <button key={tile.id} onClick={() => navigate("/chat")} className={`relative flex flex-col items-start gap-4 p-6 rounded-2xl ${c.bg} transition-all group text-left`}>
                  {tile.badge && <span className={`absolute top-4 right-4 text-[11px] font-semibold ${c.badgeBg} ${c.badgeText} rounded-full px-2.5 py-0.5`}>{tile.badge}</span>}
                  <div className={`p-2.5 rounded-xl bg-white/70 ${c.icon}`}>{tile.icon}</div>
                  <p className="text-[15px] font-semibold text-[#0F172A] leading-snug whitespace-pre-line">{tile.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-4 gap-4 mb-12">
          {[
            { label: "Задолженность", value: "0 ₽", sub: "Нет долгов" },
            { label: "Следующий платёж", value: "4 512 ₽", sub: "до 25 сентября" },
            { label: "Показания счётчиков", value: "ХВС 1842 м³", sub: "ГВС 931 м³" },
            { label: "УК на связи", value: "ООО «Уют»", sub: "+7 812 555-01-02" },
          ].map((s, i) => (
            <div key={i} className="bg-[#F8FAFC] rounded-xl px-5 py-4 border border-[#E2E8F0]">
              <p className="text-[12px] text-[#94A3B8] font-medium mb-1">{s.label}</p>
              <p className="text-[16px] font-bold text-[#0F172A] mb-0.5">{s.value}</p>
              <p className="text-[12px] text-[#64748B]">{s.sub}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-[#0F172A] mb-5">Последние обращения</h2>
          <div className="grid grid-cols-3 gap-4">
            {APPEALS.map((a) => (
              <article key={a.id} onClick={() => navigate("/chat")} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#93C5FD] hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="text-[11px] font-semibold text-[#94A3B8] font-mono">{a.id}</span>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${appealStatusMap[a.statusColor]}`}>{a.status}</span>
                </div>
                <h3 className="text-[15px] font-semibold text-[#0F172A] mb-2">{a.title}</h3>
                <p className="text-[13px] text-[#64748B] mb-4">{a.desc}</p>
                <span className="text-[12px] text-[#94A3B8]">{a.date}</span>
              </article>
            ))}
          </div>

          <div className="mt-4 p-5 rounded-2xl border-2 border-dashed border-[#BFDBFE] bg-[#F0F7FF] flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#1B5EBE] mb-0.5">Подать новое обращение</p>
              <p className="text-[13px] text-[#64748B]">Опишите проблему — мы передадим в вашу УК</p>
            </div>
            <button onClick={() => navigate("/chat")} className="bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl transition-colors">+ Новое обращение</button>
          </div>
        </section>
      </main>
    </div>
  );
}
