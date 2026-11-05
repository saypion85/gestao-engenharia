import { useEffect, useRef, useState, type ReactNode } from "react";
import { CLASSES, SITUACOES, type Classe, type Situacao } from "../lib/dominio";

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <div className="estado" role="status"><span className="spinner" aria-hidden /> {texto}</div>;
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="estado vazio">
      <strong>{titulo}</strong>
      {children && <div className="sutil">{children}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "atencao" | "critico" | "ok"; children: ReactNode }) {
  const glifo = { info: "ⓘ", atencao: "◐", critico: "▲", ok: "●" }[tipo];
  return <div className={`aviso aviso-${tipo}`} role={tipo === "critico" ? "alert" : undefined}><span aria-hidden>{glifo}</span><div>{children}</div></div>;
}

/** Pequena explicação ao lado de um campo ou indicador. */
export function Ajuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("click", fechar);
    return () => document.removeEventListener("click", fechar);
  }, [aberto]);
  return (
    <span className="ajuda" ref={ref}>
      <button type="button" className="ajuda-botao" aria-label="Ajuda" aria-expanded={aberto}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAberto(!aberto); }}>?</button>
      {aberto && <span className="ajuda-balao" role="tooltip">{children}</span>}
    </span>
  );
}

export function BadgeSituacao({ s }: { s: Situacao }) {
  return <span className={`badge sit-${s}`}>{SITUACOES[s]}</span>;
}

export function BadgeClasse({ c, ranking }: { c: Classe | null; ranking?: number | null }) {
  if (!c) return <span className="badge classe-sem" title="Prioridade ainda não avaliada">Sem avaliação</span>;
  const info = CLASSES[c];
  return (
    <span className={`badge classe-${c}`} title={`${info.acao} (${info.prazo})`}>
      <span aria-hidden>{info.glifo}</span> {ranking ? `#${ranking} · ` : ""}{info.nome}
    </span>
  );
}

export function Campo({ rotulo, ajuda, children, obrigatorio, largo }: { rotulo: string; ajuda?: ReactNode; children: ReactNode; obrigatorio?: boolean; largo?: boolean }) {
  return (
    <label className={`campo${largo ? " largo" : ""}`}>
      <span className="campo-rotulo">
        {rotulo}{obrigatorio && <span className="obrig" aria-label="obrigatório"> *</span>}
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </span>
      {children}
    </label>
  );
}

export function Modal({ titulo, aoFechar, children, largo }: { titulo: string; aoFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    document.body.classList.add("sem-rolagem");
    return () => { document.removeEventListener("keydown", esc); document.body.classList.remove("sem-rolagem"); };
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal${largo ? " largo" : ""}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

/** Avisos rápidos (canto inferior). */
let emitir: ((m: string, tipo?: "ok" | "erro") => void) | null = null;
export function notificar(m: string, tipo: "ok" | "erro" = "ok") { emitir?.(m, tipo); }

export function Notificacoes() {
  const [itens, setItens] = useState<{ id: number; m: string; tipo: string }[]>([]);
  useEffect(() => {
    emitir = (m, tipo = "ok") => {
      const id = Date.now() + Math.random();
      setItens((x) => [...x, { id, m, tipo }]);
      setTimeout(() => setItens((x) => x.filter((i) => i.id !== id)), tipo === "erro" ? 7000 : 3500);
    };
    return () => { emitir = null; };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {itens.map((i) => <div key={i.id} className={`toast toast-${i.tipo}`}>{i.m}</div>)}
    </div>
  );
}
