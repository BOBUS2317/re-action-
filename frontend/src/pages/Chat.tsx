import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

type Role = "bot" | "user" | "operator";

interface Message {
  id: number;
  role: Role;
  text: string;
  time: string;
}

interface HistoryEntry {
  id: string;
  title: string;
  date: string;
  status: string;
  statusColor: "amber" | "green" | "slate";
  rating?: number;
  comment?: string;
}

const QUICK_REPLIES = [
  "Куда платить за воду",
  "Подать показания",
  "Аварийная служба",
  "Мои квитанции",
];

const BOT_SCRIPT: Record<string, string> = {
  "Куда платить за воду":
    "Оплату за холодное и горячее водоснабжение принимает АО «Водоканал». Оплатить можно:\n• На сайте vodokanal.spb.ru\n• В приложении банка\n• В МФЦ\n\nРеквизиты:\n• ИНН 7830001915\n• Счёт 40702810200001234567",
  "Когда отключат свет":
    "По адресу ул. Ленина, 15 запланированы отключения:\n\n⚡ **12 сентября**, 09:00–13:00 — плановое\n💧 **14 сентября**, 10:00–14:00 — плановое\n🔥 **15 сентября** — аварийное отопление\n\nПолный график — в разделе «Отключения».",
  "Подать показания":
    "Передайте показания до 25-го числа каждого месяца:\n1. Холодная вода (ХВС)\n2. Горячая вода (ГВС)\n\nПоследние показания:\n• ХВС — 1842 м³ (09.09.2026)\n• ГВС — 931 м³ (09.09.2026)",
  "Аварийная служба":
    "Аварийная служба работает 24/7:\n\n💧 Вода: **+7 812 555-01-99**\n⚡ Свет: **+7 812 555-01-98**\n🔥 Газ: **04**\n\nОпишите ситуацию — я передам в вашу УК.",
  "Мои квитанции":
    "Найдены квитанции по адресу ул. Ленина, 15:\n\n• **Сентябрь 2026** — 4 512 ₽ (не оплачено)\n• Август 2026 — 4 318 ₽ ✓ оплачено\n• Июль 2026 — 4 205 ₽ ✓ оплачено",
  "Моя УК":
    "Ваша управляющая компания — **ООО «Уют»**.\n\nКонтакты:\n• Телефон: +7 812 555-01-02\n• Сайт: uyut-spb.ru\n• Режим работы: пн–пт, 9:00–18:00",
};

const FALLBACK =
  "Понял вас! Сейчас уточню информацию по вашему запросу. Если вопрос срочный — позвоните в вашу УК ООО «Уют»: +7 812 555-01-02.";

function formatTime(date: Date) {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center shrink-0">
      <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
        <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
      </svg>
    </div>
  );
}

function OperatorAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
        {/* Голова */}
        <circle cx="12" cy="9" r="3.2" />
        {/* Плечи */}
        <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
        {/* Наушники — дужка */}
        <path d="M6 9.5V8a6 6 0 0112 0v1.5" />
        {/* Наушники — амбушюры */}
        <rect x="4.5" y="8.5" width="2.5" height="3.5" rx="1" fill="white" />
        <rect x="17" y="8.5" width="2.5" height="3.5" rx="1" fill="white" />
        {/* Микрофон */}
        <path d="M18.5 12v2a3 3 0 01-3 3h-1.5" />
        <circle cx="13.5" cy="17" r="0.6" fill="white" />
      </svg>
    </div>
  );
}

function Bubble({ msg, userInitials }: { msg: Message; userInitials: string }) {
  const isUser = msg.role === "user";
  const isOperator = msg.role === "operator";
  const isBot = msg.role === "bot";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {isBot && <BotAvatar />}
      {isOperator && <OperatorAvatar />}
      <div className={`max-w-[520px] ${isUser ? "items-end flex flex-col" : ""}`}>
        {isOperator && (
          <p className="text-[11px] font-semibold text-emerald-700 mb-1 px-1">
            Алексей · Оператор
          </p>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
            isOperator
              ? "bg-emerald-50 text-[#0F172A] rounded-tl-sm border border-emerald-100"
              : isBot
              ? "bg-[#F1F5F9] text-[#0F172A] rounded-tl-sm"
              : "bg-[#1B5EBE] text-white rounded-tr-sm"
          }`}
          dangerouslySetInnerHTML={{
            __html: msg.text
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br/>"),
          }}
        />
        <p className="text-[11px] text-[#94A3B8] mt-1 px-1">{msg.time}</p>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center shrink-0 text-white text-[12px] font-semibold">
          {userInitials}
        </div>
      )}
    </div>
  );
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "bot",
    text: "Здравствуйте! Я виртуальный помощник ЖКХ-сервиса. Помогу разобраться с оплатой, показаниями счётчиков, плановыми отключениями и многим другим.\n\nЧем могу помочь?",
    time: formatTime(new Date()),
  },
];

const STATUS_STYLES: Record<string, string> = {
  amber: "text-amber-700 bg-amber-100",
  green: "text-emerald-700 bg-emerald-100",
  slate: "text-slate-500 bg-slate-100",
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [ticketStatus, setTicketStatus] = useState<"amber" | "green" | "slate">("amber");
  const [ticketTitle, setTicketTitle] = useState<string>("");
  const [ticketDate, setTicketDate] = useState<string>("");
  const [ticketRating, setTicketRating] = useState<number | undefined>(undefined);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const sentRef = useRef(false);

  const tgUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("tg_user") || "{}");
    } catch {
      return {};
    }
  })();

  const initials =
    (tgUser.first_name?.[0] || "И") + (tgUser.last_name?.[0] || "П");
  const displayName = tgUser.first_name
    ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim()
    : "Пользователь";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (sentRef.current) return;
    const state = location.state as { initialMessage?: string } | null;
    if (!state?.initialMessage) return;
    sentRef.current = true;
    sendMessage(state.initialMessage);
    window.history.replaceState({}, "");
  }, [location.state]);

  function saveToHistory(text: string): string {
    try {
      const raw = JSON.parse(localStorage.getItem("history") || "[]");
      const list: HistoryEntry[] = Array.isArray(raw) ? raw : [];
      const now = new Date();
      const dateStr = now.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const id = `ЖКХ-${now.getFullYear()}-${String(
        Math.floor(Math.random() * 9000) + 1000
      )}`;
      const entry: HistoryEntry = {
        id,
        title: text,
        date: dateStr,
        status: "В работе",
        statusColor: "amber",
      };
      const next = [entry, ...list].slice(0, 20);
      localStorage.setItem("history", JSON.stringify(next));
      return id;
    } catch {
      return "";
    }
  }

  function updateTicket(id: string, patch: Partial<HistoryEntry>) {
    try {
      const raw = JSON.parse(localStorage.getItem("history") || "[]");
      const list: HistoryEntry[] = Array.isArray(raw) ? raw : [];
      const next = list.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      );
      localStorage.setItem("history", JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const now = new Date();
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      text: text.trim(),
      time: formatTime(now),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (text.trim().length >= 3 && !currentTicketId) {
      const id = saveToHistory(text.trim());
      if (id) {
        setCurrentTicketId(id);
        setTicketStatus("amber");
        setTicketTitle(text.trim());
        setTicketDate(
          now.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        );
      }
    }

    setTyping(true);

    setTimeout(() => {
      const reply = BOT_SCRIPT[text.trim()] ?? FALLBACK;
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "bot", text: reply, time: formatTime(new Date()) },
      ]);
    }, 900 + Math.random() * 600);
  }

  function handleCloseTicket() {
    if (!currentTicketId) {
      alert("Обращения ещё нет — задайте вопрос в чате.");
      return;
    }
    if (ticketStatus === "slate") {
      alert("Обращение уже закрыто.");
      return;
    }
    if (!confirm("Закрыть обращение? Оно переместится в раздел «Закрыто».")) return;

    updateTicket(currentTicketId, { status: "Закрыто", statusColor: "slate" });
    setTicketStatus("slate");

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 2,
        role: "bot",
        text: `Обращение **${currentTicketId}** закрыто. Оцените, пожалуйста, качество помощи — это важно для нас.`,
        time: formatTime(new Date()),
      },
    ]);

    setRating(0);
    setHoverRating(0);
    setComment("");
    setShowRatingModal(true);
  }

  function handleEscalate() {
    if (!currentTicketId) {
      alert("Обращения ещё нет — задайте вопрос в чате.");
      return;
    }
    if (ticketStatus === "green") {
      alert("Оператор уже подключён.");
      return;
    }
    if (ticketStatus === "slate") {
      alert("Обращение закрыто. Откройте новое.");
      return;
    }

    updateTicket(currentTicketId, { status: "У специалиста", statusColor: "green" });
    setTicketStatus("green");

    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 10,
          role: "bot",
          text: `Понял вас! Перевожу на оператора… ⏳`,
          time: formatTime(new Date()),
        },
      ]);

      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 11,
            role: "operator",
            text: `Здравствуйте! Я **Алексей**, диспетчер ООО «Уют». Вижу ваше обращение **${currentTicketId}**.\n\nЧто случилось? Опишите ситуацию подробнее — постараюсь помочь.`,
            time: formatTime(new Date()),
          },
        ]);
      }, 1800);
    }, 900);
  }

  function handleSubmitRating() {
    if (!currentTicketId) return;
    if (rating === 0) {
      alert("Поставьте оценку от 1 до 5 звёзд");
      return;
    }
    updateTicket(currentTicketId, { rating, comment: comment.trim() || undefined });
    setTicketRating(rating);
    setShowRatingModal(false);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 4,
        role: "bot",
        text: `Спасибо за оценку! Ваш отзыв поможет нам стать лучше. ⭐ ${rating}/5`,
        time: formatTime(new Date()),
      },
    ]);
  }

  function openRatingModal() {
    setRating(ticketRating || 0);
    setHoverRating(0);
    setComment("");
    setShowRatingModal(true);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const statusLabel: Record<string, string> = {
    amber: "В работе",
    green: "У специалиста",
    slate: "Закрыто",
  };

  return (
    <div className="h-screen flex flex-col bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] h-14 flex items-center px-6 gap-4 shrink-0 z-10">
        <button onClick={() => navigate("/")} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#1B5EBE] flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
              <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold text-[#0F172A]">ЖКХ-помощник</span>
          <span className="text-[13px] text-[#94A3B8] mx-1">/</span>
          <span className="text-[14px] text-[#64748B]">Чат с помощником</span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            На связи
          </span>
          <div className="w-px h-4 bg-[#E2E8F0]" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[11px] font-semibold">
              {initials}
            </div>
            <span className="text-[13px] font-medium text-[#334155]">{displayName}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} userInitials={initials} />
            ))}
            {typing && (
              <div className="flex gap-3 items-center">
                <BotAvatar />
                <div className="bg-[#F1F5F9] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-8 py-3 border-t border-[#F1F5F9] flex gap-2 overflow-x-auto">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="shrink-0 text-[12px] font-medium text-[#1B5EBE] border border-[#BFDBFE] bg-[#F0F7FF] hover:bg-[#DBEAFE] rounded-full px-3.5 py-1.5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="px-8 py-4 border-t border-[#E2E8F0] bg-white">
            <div className="flex items-end gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl px-4 py-3 focus-within:border-[#1B5EBE] focus-within:bg-white transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Напишите сообщение… (Enter — отправить)"
                rows={1}
                className="flex-1 bg-transparent resize-none text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none max-h-32 leading-relaxed"
                style={{ overflowY: "auto" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] flex items-center justify-center transition-colors shrink-0"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 translate-x-px">
                  <path d="M14 8H2M9 3l5 5-5 5" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] text-[#CBD5E1] mt-2 text-center">
              Shift+Enter — перенос строки
            </p>
          </div>
        </div>

        <aside className="w-[320px] border-l border-[#E2E8F0] bg-[#F8FAFC] flex flex-col shrink-0 overflow-y-auto">
          <div className="px-6 py-5 border-b border-[#E2E8F0]">
            <h2 className="text-[14px] font-bold text-[#0F172A]">Карточка обращения</h2>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">Текущий диалог</p>
          </div>

          <div className="px-6 py-5 space-y-4 flex-1">
            {[
              { label: "ID обращения", value: currentTicketId || "—", mono: true },
              { label: "Тема", value: ticketTitle || "—" },
              { label: "Адрес", value: "ул. Ленина, 15" },
              { label: "Дата создания", value: ticketDate || "—" },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wide mb-1">
                  {f.label}
                </p>
                <p className={`text-[14px] text-[#0F172A] font-medium ${f.mono ? "font-mono" : ""} ${f.value === "—" ? "text-[#CBD5E1]" : ""}`}>
                  {f.value}
                </p>
              </div>
            ))}

            <div>
              <p className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wide mb-1">
                Статус
              </p>
              <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[ticketStatus]}`}>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ticketStatus === "amber"
                      ? "bg-amber-500 animate-pulse"
                      : ticketStatus === "green"
                      ? "bg-emerald-500"
                      : "bg-slate-400"
                  }`}
                />
                {statusLabel[ticketStatus]}
              </span>
            </div>

            {ticketRating !== undefined && (
              <div>
                <p className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wide mb-1">
                  Ваша оценка
                </p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg
                      key={s}
                      viewBox="0 0 20 20"
                      className={`w-4 h-4 ${s <= ticketRating ? "text-amber-400" : "text-[#E2E8F0]"}`}
                      fill="currentColor"
                    >
                      <path d="M10 1l2.6 5.9 6.4.6-4.8 4.2 1.4 6.3L10 14.8 4.4 18l1.4-6.3L1 7.5l6.4-.6L10 1z" />
                    </svg>
                  ))}
                  <span className="text-[12px] text-[#64748B] ml-1">
                    {ticketRating}/5
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-[#E2E8F0] pt-4">
              <p className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wide mb-3">
                {ticketStatus === "green" ? "Оператор" : "Ответственный"}
              </p>
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                    ticketStatus === "green"
                      ? "bg-emerald-600 text-white"
                      : "bg-[#E2E8F0] text-[#64748B]"
                  }`}
                >
                  {ticketStatus === "green" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <circle cx="12" cy="9" r="3.2" />
                      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
                      <path d="M6 9.5V8a6 6 0 0112 0v1.5" />
                      <rect x="4.5" y="8.5" width="2.5" height="3.5" rx="1" fill="white" />
                      <rect x="17" y="8.5" width="2.5" height="3.5" rx="1" fill="white" />
                    </svg>
                  ) : (
                    "АК"
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0F172A]">Алексей К.</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    {ticketStatus === "green" ? "Оператор • онлайн" : "Диспетчер ООО «Уют»"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 border-t border-[#E2E8F0] space-y-2">
            <button
              onClick={handleEscalate}
              disabled={ticketStatus === "green" || ticketStatus === "slate"}
              className="w-full text-[13px] font-semibold text-white bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed rounded-xl py-2.5 transition-colors"
            >
              {ticketStatus === "green" ? "Оператор подключён" : "Перевести на оператора"}
            </button>

            {ticketStatus === "slate" ? (
              <button
                onClick={openRatingModal}
                className="w-full text-[13px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-xl py-2.5 transition-colors"
              >
                {ticketRating ? "Изменить оценку" : "Оценить обращение"}
              </button>
            ) : (
              <button
                onClick={handleCloseTicket}
                className="w-full text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl py-2.5 transition-colors"
              >
                Закрыть обращение
              </button>
            )}
          </div>
        </aside>
      </div>

      {showRatingModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => setShowRatingModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-[#0F172A]">
                Оцените качество помощи
              </h3>
              <button
                onClick={() => setShowRatingModal(false)}
                className="text-[#94A3B8] hover:text-[#64748B] transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>

            <p className="text-[13px] text-[#64748B] mb-5">
              Насколько вы довольны решением обращения?
            </p>

            <div
              className="flex items-center justify-center gap-2 mb-6"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  className="transition-transform hover:scale-110"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`w-10 h-10 transition-colors ${
                      s <= (hoverRating || rating)
                        ? "text-amber-400"
                        : "text-[#E2E8F0]"
                    }`}
                    fill="currentColor"
                  >
                    <path d="M12 1l3 7 7.5.6-5.7 5L18.5 21 12 17.3 5.5 21l1.7-7.4-5.7-5L9 8l3-7z" />
                  </svg>
                </button>
              ))}
            </div>

            {rating > 0 && (
              <p className="text-center text-[13px] font-semibold text-[#0F172A] mb-5">
                {rating === 1 && "Очень плохо"}
                {rating === 2 && "Плохо"}
                {rating === 3 && "Нормально"}
                {rating === 4 && "Хорошо"}
                {rating === 5 && "Отлично!"}
              </p>
            )}

            <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
              Комментарий (необязательно)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Что понравилось или что можно улучшить?"
              rows={3}
              className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors resize-none mb-6"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowRatingModal(false)}
                className="flex-1 text-[14px] font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl py-3 transition-colors"
              >
                Пропустить
              </button>
              <button
                onClick={handleSubmitRating}
                disabled={rating === 0}
                className="flex-1 bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-[14px] font-semibold rounded-xl py-3 transition-colors"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
