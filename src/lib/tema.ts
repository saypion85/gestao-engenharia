// Tema claro/escuro escolhido pela pessoa; fica salvo neste navegador.
export type Tema = "light" | "dark";
const CHAVE = "trl-tema";

export function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t === "dark" || t === "light") return t;
  } catch { /* navegador sem armazenamento: usa o claro */ }
  return "light";
}

export function aplicarTema(t: Tema) {
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#000000" : "#DA202C");
  try { localStorage.setItem(CHAVE, t); } catch { /* ignora */ }
}
