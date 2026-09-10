import { useState } from "react";
import { useNavigate } from "react-router-dom";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  let res = "+7";
  if (digits.length > 1) res += ` (${digits.slice(1, 4)}`;
  if (digits.length >= 5) res += `) ${digits.slice(4, 7)}`;
  if (digits.length >= 8) res += `-${digits.slice(7, 9)}`;
  if (digits.length >= 10) res += `-${digits.slice(9, 11)}`;
  return res;
}

export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [focused, setFocused] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const isValid = digits.length === 11;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    localStorage.setItem("phone", phone);

    // Генерируем 6-значный код-заглушку
    const code = String(Math.floor(100000 + Math.random() * 900000));
    sessionStorage.setItem("demo_code", code);

    navigate("/verify");
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
          Войдите, чтобы мы помогли
        </h1>
        <p className="text-[14px] text-[#64748B] text-center mb-8">
          Отправим код подтверждения в Telegram
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
            Номер телефона
          </label>
          <div
            className={`flex items-center bg-[#F8FAFC] rounded-xl border-2 transition-colors ${
              focused ? "border-[#1B5EBE] bg-white" : "border-[#E2E8F0]"
            } px-4 py-3 mb-6`}
          >
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="+7 (___) ___-__-__"
              className="flex-1 bg-transparent text-[15px] text-[#0F172A] placeholder-[#94A3B8] outline-none"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="w-full bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-xl py-3.5 transition-colors flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
            Получить код
          </button>
        </form>

        <p className="text-[12px] text-[#94A3B8] text-center mt-6 leading-relaxed">
          Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных
        </p>
      </div>
    </div>
  );
}