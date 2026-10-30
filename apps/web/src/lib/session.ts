/** El token vive en localStorage; cualquier fallo del almacenamiento cae a memoria. */
const KEY = "carrousado.token";
let memory: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string | null) {
  memory = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado o almacenamiento bloqueado: queda en memoria */
  }
}
