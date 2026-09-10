import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId } from "../lib/user";

interface Org {
  id: number;
  name: string;
  kind: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  organization_name?: string | null;
}

export default function Company() {
  const navigate = useNavigate();
  const [uid] = useState(() => getEffectiveUserId());
  const [mgmt, setMgmt] = useState<Org | null>(null);
  const [emergency, setEmergency] = useState<Org[]>([]);
  const [city, setCity] = useState("Томск");
  const [news, setNews] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [or, pr] = await Promise.all([
          fetch(`/api/users/${encodeURIComponent(uid)}/organization`),
          fetch(`/api/users/${encodeURIComponent(uid)}/profile`),
        ]);
        let c = "Томск";
        if (pr.ok) {
          const p = await pr.json();
          if (p?.city) { c = p.city; if (alive) setCity(p.city); }
        }
        if (or.ok) {
          const d = await or.json();
          if (alive) {
            setMgmt(d.management || null);
            setEmergency(d.emergency || []);
          }
        }
        try {
          const ar = await fetch(`/api/announcements?city=${encodeURIComponent(c)}`);
          if (ar.ok && alive) setNews(await ar.json());
        } catch { /* ignore */ }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid]);

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
        <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">Моя УК</h1>
        <p className="text-[14px] text-[#64748B] mb-6">{loading ? "Загружаю…" : `Город: ${city}`}</p>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 mb-4">
          <h2 className="text-[16px] font-bold text-[#0F172A] mb-3">Управляющая компания</h2>
          {!mgmt ? (
            <p className="text-[14px] text-[#64748B]">За профилем УК не закреплена. Уточните адрес в профиле — и мы подскажем вашу компанию.</p>
          ) : (
            <div>
              <p className="text-[15px] font-semibold text-[#0F172A] mb-1">{mgmt.name}</p>
              <p className="text-[14px] text-[#64748B]">Телефон: {mgmt.phone || "не указан"}</p>
              {mgmt.website && <a href={mgmt.website} target="_blank" rel="noreferrer" className="text-[14px] text-[#1B5EBE] hover:underline">{mgmt.website}</a>}
            </div>
          )}
        </div>

        <div className="bg-white border border-red-100 rounded-2xl p-6 mb-6">
          <h2 className="text-[16px] font-bold text-[#0F172A] mb-3">Аварийные номера</h2>
          <div className="space-y-2">
            {emergency.map((e) => (
              <p key={e.id} className="text-[14px] text-[#0F172A]"><span className="font-semibold">{e.name}:</span> {e.phone}</p>
            ))}
            <p className="text-[13px] text-[#64748B]">При запахе газа, дыме или угрозе жизни сначала звоните 112.</p>
          </div>
        </div>

        <h2 className="text-[18px] font-bold text-[#0F172A] mb-4">Объявления по дому</h2>
        {!news.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-[14px] text-[#64748B]">Активных объявлений сейчас нет.</div>
        ) : (
          <div className="space-y-3">
            {news.slice(0, 5).map((a) => (
              <article key={a.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                <p className="text-[15px] font-semibold text-[#0F172A] mb-1">{a.title}</p>
                <p className="text-[14px] text-[#64748B]">{a.body}</p>
                {a.organization_name && <p className="text-[12px] text-[#94A3B8] mt-2">{a.organization_name}</p>}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
