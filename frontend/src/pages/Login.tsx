import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const endpoint = isLogin ? "/api/login" : "/api/register";
    const payload = isLogin
      ? { username, password }
      : { username, password, full_name: fullName };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Ошибка авторизации");

      if (isLogin) {
        // Сохраняем имя и ID пользователя в localStorage
        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("full_name", data.full_name);
        navigate("/");
      } else {
        alert("Регистрация успешна! Теперь войдите в систему.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] w-[400px] shadow-sm">
        <h1 className="text-[20px] font-bold text-[#0F172A] mb-2">
          {isKLogin(isLogin) ? "Вход в систему" : "Регистрация"}
        </h1>
        <p className="text-[13px] text-[#64748B] mb-6">ЖКХ-помощник</p>

        {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-[13px]">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-[12px] font-medium text-[#64748B] mb-1">Имя и фамилия</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[14px] outline-none focus:border-[#1B5EBE]"
              />
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium text-[#64748B] mb-1">Логин</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[14px] outline-none focus:border-[#1B5EBE]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#64748B] mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-xl text-[14px] outline-none focus:border-[#1B5EBE]"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#1B5EBE] hover:bg-[#1449A0] text-white font-semibold py-2.5 rounded-xl text-[14px] transition-colors"
          >
            {isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-center text-[13px] text-[#1B5EBE] mt-4 hover:underline"
        >
          {isLogin ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

function isKLogin(isLogin: boolean) {
  return isLogin;
}