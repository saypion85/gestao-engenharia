import type { ReactNode } from "react";
import { fmtData, hojeISO } from "../lib/dominio";
import { diasEntre } from "../lib/cronograma";

export interface LinhaGantt {
  chave: string;
  nome: ReactNode;
  sub?: ReactNode;
  previsto: [string, string] | null;
  realizado: [string, string | null] | null; // fim null = em andamento (vai até hoje)
  tom: "ok" | "atencao" | "critico" | "neutro";
  situacao?: string;
  marco?: { data: string; rotulo: string } | null; // ex.: prazo de conclusão
  destaque?: boolean;
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function Gantt({ linhas, periodo, aoClicar, prazo, rotuloColuna = "Etapa" }: { linhas: LinhaGantt[]; periodo: [string, string]; aoClicar?: (chave: string) => void; prazo?: string | null; rotuloColuna?: string }) {
  const hoje = hojeISO();
  const [ini, fim] = periodo;
  const total = Math.max(1, diasEntre(ini, fim));
  const x = (d: string) => Math.min(100, Math.max(0, (diasEntre(ini, d) / total) * 100));
  const larg = (a: string, b: string) => Math.max(0.6, x(b) - x(a) + (100 / total));

  // marcas de mês
  const meses: { pos: number; rotulo: string }[] = [];
  const d0 = new Date(ini + "T00:00:00Z");
  for (let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + (d0.getUTCDate() === 1 ? 0 : 1), 1)); d.toISOString().slice(0, 10) <= fim; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    meses.push({ pos: x(iso), rotulo: `${MES[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? `/${String(d.getUTCFullYear()).slice(2)}` : ""}` });
  }
  const hojeDentro = hoje >= ini && hoje <= fim;
  const prazoDentro = !!prazo && prazo >= ini && prazo <= fim;

  return (
    <div className="rolagem-x">
      <div className="gantt" role="table" aria-label="Cronograma: previsto e realizado">
        <div className="gantt-linha gantt-cabecalho" role="row">
          <div className="gantt-rotulo" role="columnheader">{rotuloColuna}</div>
          <div className="gantt-trilho" role="columnheader">
            {meses.map((m) => <span key={m.pos} className="gantt-mes" style={{ left: `${m.pos}%` }}>{m.rotulo}</span>)}
            {hojeDentro && <span className="gantt-hoje-rotulo" style={{ left: `${x(hoje)}%` }}>hoje</span>}
            {prazoDentro && <span className="gantt-prazo-rotulo" style={{ left: `${x(prazo!)}%` }} title={`Prazo de conclusão: ${fmtData(prazo!)}`}>◆ prazo</span>}
          </div>
        </div>
        {linhas.map((l) => {
          const fimReal = l.realizado ? l.realizado[1] ?? hoje : null;
          const dica = [
            l.previsto ? `Previsto: ${fmtData(l.previsto[0])} → ${fmtData(l.previsto[1])}` : "Sem previsão",
            l.realizado ? `Realizado: ${fmtData(l.realizado[0])} → ${l.realizado[1] ? fmtData(l.realizado[1]) : "em andamento"}` : "Não iniciado",
            l.situacao,
          ].filter(Boolean).join("\n");
          return (
            <div key={l.chave} role="row" className={`gantt-linha${aoClicar ? " clicavel" : ""}${l.destaque ? " destaque" : ""}`}
              onClick={() => aoClicar?.(l.chave)} tabIndex={aoClicar ? 0 : undefined}
              onKeyDown={(e) => aoClicar && e.key === "Enter" && aoClicar(l.chave)}>
              <div className="gantt-rotulo" role="cell">
                <div className="gantt-nome">{l.nome}</div>
                {l.sub && <div className="sutil pequeno">{l.sub}</div>}
              </div>
              <div className="gantt-trilho" role="cell" title={dica}>
                {meses.map((m) => <span key={m.pos} className="gantt-grade" style={{ left: `${m.pos}%` }} />)}
                {hojeDentro && <span className="gantt-hoje" style={{ left: `${x(hoje)}%` }} />}
                {prazoDentro && <span className="gantt-prazo" style={{ left: `${x(prazo!)}%` }} />}
                {l.previsto && <span className="gantt-prev" style={{ left: `${x(l.previsto[0])}%`, width: `${larg(l.previsto[0], l.previsto[1])}%` }} />}
                {l.realizado && fimReal && (
                  <span className={`gantt-real tom-${l.tom}${l.realizado[1] ? "" : " aberto"}`}
                    style={{ left: `${x(l.realizado[0])}%`, width: `${larg(l.realizado[0], fimReal)}%` }} />
                )}
                {l.marco && l.marco.data >= ini && l.marco.data <= fim && (
                  <span className="gantt-marco" style={{ left: `${x(l.marco.data)}%` }} title={`${l.marco.rotulo}: ${fmtData(l.marco.data)}`} aria-label={l.marco.rotulo}>◆</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LegendaGantt() {
  return (
    <div className="legenda">
      <span><i className="leg-prev" />Previsto</span>
      <span><i className="leg-real" />Realizado</span>
      <span><i className="leg-real aberto" />Em andamento (até hoje)</span>
      <span><i className="leg-real tom-critico" />Atrasado</span>
      <span><i className="leg-hoje" />Hoje</span>
      <span>◆ Prazo de conclusão</span>
    </div>
  );
}
