import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface ProfileData {
  city: string;
  street: string;
  house: string;
  apartment: string;
  phone: string;
}

export default function Profile() {
  const navigate = useNavigate();

  const tgUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("tg_user") || "{}");
    } catch {
      return {};
    }
  })();

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem("profile") || "{}");
    } catch {
      return {};
    }
  })();

  const [form, setForm] = useState<ProfileData>({
    city: saved.city || "",
    street: saved.street || "",
    house: saved.house || "",
    apartment: saved.apartment || "",
    phone: saved.phone || "",
  });

  const [savedFlag, setSavedFlag] = useState(false);

  const initials =
    (tgUser.first_name?.[0] || "И") + (tgUser.last_name?.[0] || "П");
  const displayName = tgUser.first_name
    ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim()
    : "Пользователь";
  const username = tgUser.username ? `@${tgUser.username}` : "";

  function handleChange(field: keyof ProfileData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedFlag(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("profile", JSON.stringify(form));
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2500);
  }

  function logout() {
    localStorage.removeItem("auth");
    localStorage.removeItem("tg_user");
    navigate("/");
  }

  const isComplete =
    form.city && form.street && form.house && form.apartment;

  return (
    <div
      className="min-h-screen bg-[#F8FAFC]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
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

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-[13px] font-medium text-[#64748B] hover:text-[#1B5EBE] transition-colors"
            >
              На главную
            </button>
            <div className="w-px h-5 bg-[#E2E8F0]" />
            <button
              onClick={logout}
              className="text-[13px] font-medium text-[#64748B] hover:text-red-600 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10">
        <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">
          Личный кабинет
        </h1>
        <p className="text-[14px] text-[#64748B] mb-8">
          Заполните данные — они используются для отключений, квитанций и обращений в УК
        </p>

        <div className="grid grid-cols-3 gap-6">
          {/* Left: profile card */}
          <aside className="col-span-1">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[28px] font-bold mb-4">
                  {initials}
                </div>
                <p className="text-[16px] font-bold text-[#0F172A] mb-0.5">
                  {displayName}
                </p>
                {username && (
                  <p className="text-[13px] text-[#64748B]">{username}</p>
                )}
              </div>

              <div className="border-t border-[#E2E8F0] mt-6 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] text-[#94A3B8]">Статус</span>
                  {isComplete ? (
                    <span className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Заполнен
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      Не заполнен
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#94A3B8]">Способ входа</span>
                  <span className="text-[12px] font-medium text-[#334155]">
                    Telegram
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right: form */}
          <section className="col-span-2">
            <form
              onSubmit={handleSave}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-6"
            >
              <h2 className="text-[16px] font-bold text-[#0F172A] mb-5">
                Адрес проживания
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Город
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    placeholder="Санкт-Петербург"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Улица
                  </label>
                  <input
                    type="text"
                    value={form.street}
                    onChange={(e) => handleChange("street", e.target.value)}
                    placeholder="ул. Ленина"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Дом
                  </label>
                  <input
                    type="text"
                    value={form.house}
                    onChange={(e) => handleChange("house", e.target.value)}
                    placeholder="15"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Квартира
                  </label>
                  <input
                    type="text"
                    value={form.apartment}
                    onChange={(e) => handleChange("apartment", e.target.value)}
                    placeholder="42"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <h2 className="text-[16px] font-bold text-[#0F172A] mb-5 mt-8">
                Контакты
              </h2>

              <div className="mb-6">
                <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                  Телефон
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Сохранить
                </button>
                {savedFlag && (
                  <span className="text-[13px] text-emerald-600 font-medium flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                    Сохранено
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}