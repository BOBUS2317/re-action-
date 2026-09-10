import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  function handleFakeLogin() {
    // Заглушка: имитируем успешный вход
    localStorage.setItem("auth", "true");
    localStorage.setItem(
      "tg_user",
      JSON.stringify({
        id: 1,
        first_name: "Иван",
        last_name: "Петров",
        username: "ivan_p",
        auth_date: Date.now(),
        hash: "fake",
      })
    );
    navigate("/");
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#EBF2FF] to-white flex items-center justify-center px-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-[#E2E8F0] shadow-lg p-10">
        <button
          onClick={() => navigate("/")}
          className="text-[13px] text-[#64748B] hover:text-[#1B5EBE] mb-6 flex items-center gap-1 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          На главную
        </button>

        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1B5EBE] flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-5 h-5">
              <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
            </svg>
          </div>
          <span className="text-[18px] font-bold tracking-tight text-[#0F172A]">
            ЖКХ-<span className="text-[#1B5EBE]">помощник</span>
          </span>
        </div>

        <h1 className="text-[24px] font-bold text-[#0F172A] text-center mb-2">
          Войдите через Telegram
        </h1>
        <p className="text-[14px] text-[#64748B] text-center mb-8">
          Это быстро и безопасно — Telegram подтвердит вашу личность
        </p>

        <button
          onClick={handleFakeLogin}
          className="w-full flex items-center justify-center gap-2.5 bg-[#229ED9] hover:bg-[#1c87b8] text-white text-[15px] font-semibold rounded-xl py-3.5 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          Войти через Telegram
        </button>

        <div className="border-t border-[#E2E8F0] mt-8 pt-6">
          <p className="text-[12px] text-[#94A3B8] text-center leading-relaxed mb-4">
            Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных
          </p>
          <div className="flex items-center justify-center gap-2 text-[12px] text-[#94A3B8]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
              <rect x="2" y="7" width="12" height="7" rx="1.5" />
              <path d="M5 7V5a3 3 0 016 0v2" />
            </svg>
            <span>Данные защищены</span>
          </div>
        </div>
      </div>
    </div>
  );
}