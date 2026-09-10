export interface TgUser {
  id?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  display_name?: string;
  phone?: string;
}

export function getWebUserId(): string {
  let id = localStorage.getItem("web_user_id");
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem("web_user_id", id);
  }
  return id;
}

export function getTgUser(): TgUser {
  try {
    return JSON.parse(localStorage.getItem("tg_user") || "{}");
  } catch {
    return {};
  }
}

export function isLinked(): boolean {
  return localStorage.getItem("tg_linked") === "true";
}

/** Единый id для всех запросов: после привязки — telegram-xxx, до неё — web-xxx. */
export function getEffectiveUserId(): string {
  if (isLinked()) {
    const u = getTgUser();
    if (u.id && u.id.length > 0) return u.id;
  }
  return getWebUserId();
}

export function getProfileCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("profile") || "{}");
  } catch {
    return {};
  }
}
