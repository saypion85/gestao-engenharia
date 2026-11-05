import { CATEGORIAS, CLASSES, ESFORCO, PROBABILIDADE, SEVERIDADE, classe, pontuacao, regraDeCorteAplicada, severidade } from "../lib/dominio";
import { Ajuda, BadgeClasse } from "./ui";

export interface ValoresPrioridade {
  categoria_principal: string | null;
  categoria_secundaria: string | null;
  probabilidade: number | null;
  sev_pessoas: number | null;
  sev_operacao: number | null;
  sev_financeiro: number | null;
  sev_legal: number | null;
  risco_queda_eletro: boolean;
  prazo_legal: boolean;
  efeito_cadeia: boolean;
  esforco: string | null;
}

export const PRIORIDADE_VAZIA: ValoresPrioridade = {
  categoria_principal: null, categoria_secundaria: null, probabilidade: null,
  sev_pessoas: null, sev_operacao: null, sev_financeiro: null, sev_legal: null,
  risco_queda_eletro: false, prazo_legal: false, efeito_cadeia: false, esforco: null,
};

const SEV_COLUNAS = [
  { campo: "sev_pessoas", nome: "Pessoas", chave: "pessoas" },
  { campo: "sev_operacao", nome: "Operação", chave: "operacao" },
  { campo: "sev_financeiro", nome: "Financeiro", chave: "financeiro" },
  { campo: "sev_legal", nome: "Legal", chave: "legal" },
] as const;

export default function PrioridadeEditor({ v, mudar, somenteLeitura }: { v: ValoresPrioridade; mudar: (p: Partial<ValoresPrioridade>) => void; somenteLeitura?: boolean }) {
  const pts = pontuacao(v);
  const cl = classe(v);
  const num = (x: string) => (x ? Number(x) : null);

  return (
    <fieldset className="prioridade" disabled={somenteLeitura}>
      <div className="prioridade-resultado">
        <div>
          <div className="sutil pequeno">Resultado</div>
          <BadgeClasse c={cl} />
        </div>
        <div>
          <div className="sutil pequeno">Pontuação (P × S)</div>
          <strong>{pts !== null ? `${v.probabilidade} × ${severidade(v)} = ${pts}` : "—"}</strong>
        </div>
        {cl && <div className="pequeno">{CLASSES[cl].acao}. <strong>Prazo sugerido: {CLASSES[cl].prazo}</strong></div>}
        {regraDeCorteAplicada(v) && <div className="pequeno texto-critico">Regra de corte aplicada: severidade 5, ou risco de queda/eletrocussão com probabilidade 3 ou mais.</div>}
      </div>

      <div className="grade-2">
        <label className="campo">
          <span className="campo-rotulo">Categoria principal <Ajuda>Tipo de risco que a demanda trata. Se afetar outra área, informe a secundária.</Ajuda></span>
          <select value={v.categoria_principal ?? ""} onChange={(e) => mudar({ categoria_principal: e.target.value || null })}>
            <option value="">Selecione…</option>
            {Object.entries(CATEGORIAS).map(([k, c]) => <option key={k} value={k} title={c.exemplos}>{k} · {c.nome}</option>)}
          </select>
          {v.categoria_principal && <small className="sutil">Ex.: {CATEGORIAS[v.categoria_principal].exemplos}</small>}
        </label>
        <label className="campo">
          <span className="campo-rotulo">Categoria secundária</span>
          <select value={v.categoria_secundaria ?? ""} onChange={(e) => mudar({ categoria_secundaria: e.target.value || null })}>
            <option value="">Nenhuma</option>
            {Object.entries(CATEGORIAS).filter(([k]) => k !== v.categoria_principal).map(([k, c]) => <option key={k} value={k}>{k} · {c.nome}</option>)}
          </select>
        </label>
      </div>

      <div className="campo">
        <span className="campo-rotulo">Probabilidade (P) <Ajuda>Qual a chance de o problema acontecer?</Ajuda></span>
        <div className="opcoes-nota">
          {PROBABILIDADE.map((p) => (
            <button type="button" key={p.nota} className={`nota${v.probabilidade === p.nota ? " ativa" : ""}`}
              onClick={() => mudar({ probabilidade: v.probabilidade === p.nota ? null : p.nota })} title={p.criterio} aria-pressed={v.probabilidade === p.nota}>
              <strong>{p.nota}</strong> <span>{p.nivel}</span>
            </button>
          ))}
        </div>
        {v.probabilidade && <small className="sutil">{PROBABILIDADE[v.probabilidade - 1].criterio}</small>}
      </div>

      <div className="campo">
        <span className="campo-rotulo">Severidade (S) <Ajuda>Dê uma nota para cada tipo de impacto. Vale a maior nota.</Ajuda></span>
        <div className="grade-sev">
          {SEV_COLUNAS.map((c) => (
            <label key={c.campo} className="campo">
              <span className="pequeno">{c.nome}</span>
              <select aria-label={`Severidade ${c.nome}`} value={v[c.campo] ?? ""} onChange={(e) => mudar({ [c.campo]: num(e.target.value) } as Partial<ValoresPrioridade>)}>
                <option value="">—</option>
                {SEVERIDADE[c.chave].map((t, i) => <option key={i} value={i + 1}>{i + 1} · {t}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="checks">
        <label><input type="checkbox" checked={v.risco_queda_eletro} onChange={(e) => mudar({ risco_queda_eletro: e.target.checked })} /> Risco de queda ou eletrocussão</label>
        <label><input type="checkbox" checked={v.prazo_legal} onChange={(e) => mudar({ prazo_legal: e.target.checked })} /> Tem prazo legal ou contratual</label>
        <label><input type="checkbox" checked={v.efeito_cadeia} onChange={(e) => mudar({ efeito_cadeia: e.target.checked })} /> Efeito em cadeia (agrava outros riscos)</label>
      </div>

      <label className="campo campo-curto">
        <span className="campo-rotulo">Esforço para resolver <Ajuda>Usado só para desempatar: entre demandas iguais, a de menor custo e prazo vem antes.</Ajuda></span>
        <select value={v.esforco ?? ""} onChange={(e) => mudar({ esforco: e.target.value || null })}>
          <option value="">Não informado</option>
          {Object.entries(ESFORCO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>

      <details className="pequeno sutil">
        <summary>Como o ranking é calculado</summary>
        <p>Ordem: classe (Crítico → Baixo), maior pontuação, depois desempates: maior severidade para pessoas, prazo legal/contratual,
          efeito em cadeia e menor esforço. Demandas concluídas ou canceladas saem do ranking; suspensas continuam com número.</p>
      </details>
    </fieldset>
  );
}
