import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { supabase, mensagemErro } from "../lib/supabase";
import { ETAPAS, FLUXO, FORMAS, MD_SITUACOES, SITUACOES, type Etapa, type Forma, type Situacao } from "../lib/dominio";
import PrioridadeEditor, { PRIORIDADE_VAZIA, type ValoresPrioridade } from "./PrioridadeEditor";
import { Campo } from "./ui";

export interface ValoresDemanda extends ValoresPrioridade {
  assunto: string;
  descricao: string | null;
  local_id: number | null;
  responsavel_id: number | null;
  solicitante: string | null;
  recebida_em: string | null;
  acomp_gerencial: boolean;
  forma_execucao: Forma;
  empresa_id: number | null;
  situacao: Situacao;
  aguardando_o_que: string | null;
  etapa: Etapa;
  detalhamento: string | null;
  status_projeto: string | null;
  prazo_proxima_etapa: string | null;
  prazo_conclusao: string | null;
  inicio: string | null;
  fim: string | null;
  md_situacao: string | null;
  md_codigo: string | null;
  os_numero: string | null;
}

export const DEMANDA_VAZIA: ValoresDemanda = {
  ...PRIORIDADE_VAZIA,
  assunto: "", descricao: null, local_id: null, responsavel_id: null, solicitante: null, recebida_em: null,
  acomp_gerencial: false, forma_execucao: "contratada", empresa_id: null, situacao: "nao_iniciada", aguardando_o_que: null,
  etapa: "recebida", detalhamento: null, status_projeto: null, prazo_proxima_etapa: null, prazo_conclusao: null,
  inicio: null, fim: null, md_situacao: null, md_codigo: null, os_numero: null,
};

export const CAMPOS_DEMANDA = Object.keys(DEMANDA_VAZIA) as (keyof ValoresDemanda)[];

interface Props {
  inicial: ValoresDemanda;
  nova?: boolean;
  aoSalvar: (v: ValoresDemanda) => Promise<void>;
  aoCancelar?: () => void;
}

export default function DemandaForm({ inicial, nova, aoSalvar, aoCancelar }: Props) {
  const { cadastros, recarregarCadastros } = useAuth();
  const [v, setV] = useState<ValoresDemanda>(inicial);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [novoLocal, setNovoLocal] = useState<string | null>(null);
  const mudar = (p: Partial<ValoresDemanda>) => setV((x) => ({ ...x, ...p }));
  const t = (s: string) => (s.trim() ? s : null);

  const etapas = FLUXO[v.forma_execucao];

  function trocarForma(f: Forma) {
    const p: Partial<ValoresDemanda> = { forma_execucao: f };
    if (!FLUXO[f].includes(v.etapa)) p.etapa = "recebida";
    if (f === "interna") p.empresa_id = null;
    mudar(p);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!v.assunto.trim()) return setErro("Informe o assunto da demanda.");
    if (nova && (!v.probabilidade || ![v.sev_pessoas, v.sev_operacao, v.sev_financeiro, v.sev_legal].some(Boolean))) {
      return setErro("Avalie a prioridade: informe a probabilidade e pelo menos uma nota de severidade.");
    }
    setSalvando(true);
    try {
      const final = { ...v };
      if (novoLocal && novoLocal.trim()) {
        const { data, error } = await supabase.from("locais").insert({ nome: novoLocal.trim() }).select("id").single();
        if (error) throw error;
        final.local_id = data.id;
        await recarregarCadastros();
      }
      await aoSalvar(final);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="form">
      <section className="cartao">
        <h2>Identificação</h2>
        <div className="grade-2">
          <Campo rotulo="Assunto" obrigatorio largo>
            <input value={v.assunto} onChange={(e) => mudar({ assunto: e.target.value })} placeholder="Ex.: Reforma do telhado do Armazém 30" autoFocus={nova} />
          </Campo>
          <Campo rotulo="Descrição" largo ajuda="Detalhe o que precisa ser feito, se necessário.">
            <textarea rows={3} value={v.descricao ?? ""} onChange={(e) => mudar({ descricao: t(e.target.value) })} />
          </Campo>
          <Campo rotulo="Local">
            {novoLocal === null ? (
              <select value={v.local_id ?? ""} onChange={(e) => e.target.value === "__novo" ? setNovoLocal("") : mudar({ local_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Selecione…</option>
                {cadastros.locais.filter((l) => l.ativo !== false || l.id === v.local_id).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                <option value="__novo">+ Cadastrar novo local</option>
              </select>
            ) : (
              <div className="linha">
                <input value={novoLocal} onChange={(e) => setNovoLocal(e.target.value)} placeholder="Nome do novo local" autoFocus />
                <button type="button" className="btn btn-link" onClick={() => setNovoLocal(null)}>Cancelar</button>
              </div>
            )}
          </Campo>
          <Campo rotulo="Responsável">
            <select value={v.responsavel_id ?? ""} onChange={(e) => mudar({ responsavel_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Selecione…</option>
              {cadastros.pessoas.filter((p) => p.ativo !== false || p.id === v.responsavel_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Solicitante" ajuda="Pessoa ou área que pediu a demanda.">
            <input value={v.solicitante ?? ""} onChange={(e) => mudar({ solicitante: t(e.target.value) })} />
          </Campo>
          <Campo rotulo="Recebida em">
            <input type="date" value={v.recebida_em ?? ""} onChange={(e) => mudar({ recebida_em: e.target.value || null })} />
          </Campo>
        </div>
        <label className="check-linha">
          <input type="checkbox" checked={v.acomp_gerencial} onChange={(e) => mudar({ acomp_gerencial: e.target.checked })} />
          Acompanhamento gerencial <span className="sutil pequeno">(destaca no painel)</span>
        </label>
      </section>

      <section className="cartao">
        <h2>Execução e andamento</h2>
        <div className="campo">
          <span className="campo-rotulo">Forma de execução <span className="obrig">*</span></span>
          <div className="segmentado">
            {(Object.keys(FORMAS) as Forma[]).map((f) => (
              <button type="button" key={f} className={v.forma_execucao === f ? "ativo" : ""} onClick={() => trocarForma(f)} aria-pressed={v.forma_execucao === f}>{FORMAS[f]}</button>
            ))}
          </div>
          <small className="sutil">
            {v.forma_execucao === "interna" ? "Etapas: Recebida → Estudo/Projeto → Aprovação → Execução → Encerramento → Concluída." :
              "Etapas: Recebida → Estudo/Projeto → MD → RMS/Suprimentos → Aprovação → OS → Execução → Encerramento → Concluída."}
          </small>
        </div>
        <div className="grade-2">
          {v.forma_execucao === "contratada" && (
            <Campo rotulo="Empresa contratada" ajuda="Usuários desta empresa passam a ver a demanda e podem preencher RDO.">
              <select value={v.empresa_id ?? ""} onChange={(e) => mudar({ empresa_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Ainda não definida</option>
                {cadastros.empresas.filter((x) => x.ativo !== false || x.id === v.empresa_id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Situação">
            <select value={v.situacao} onChange={(e) => mudar({ situacao: e.target.value as Situacao })}>
              {Object.entries(SITUACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Campo>
          {v.situacao === "aguardando" && (
            <Campo rotulo="Aguardando o quê / quem?">
              <input value={v.aguardando_o_que ?? ""} onChange={(e) => mudar({ aguardando_o_que: t(e.target.value) })} placeholder="Ex.: aprovação da Gerência, cotação de Suprimentos" />
            </Campo>
          )}
          <Campo rotulo="Etapa">
            <select value={v.etapa} onChange={(e) => mudar({ etapa: e.target.value as Etapa })}>
              {etapas.map((k) => <option key={k} value={k}>{ETAPAS[k]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prazo da próxima etapa">
            <input type="date" value={v.prazo_proxima_etapa ?? ""} onChange={(e) => mudar({ prazo_proxima_etapa: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Prazo de conclusão" ajuda="Usado no indicador de atraso do painel.">
            <input type="date" value={v.prazo_conclusao ?? ""} onChange={(e) => mudar({ prazo_conclusao: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Início da execução">
            <input type="date" value={v.inicio ?? ""} onChange={(e) => mudar({ inicio: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Fim da execução">
            <input type="date" value={v.fim ?? ""} onChange={(e) => mudar({ fim: e.target.value || null })} />
          </Campo>
          <Campo rotulo="Detalhamento da situação" largo>
            <input value={v.detalhamento ?? ""} onChange={(e) => mudar({ detalhamento: t(e.target.value) })} placeholder="Resumo curto do momento atual" />
          </Campo>
          <Campo rotulo="Situação do projeto" ajuda="Para demandas de projeto/desenho: Estudo preliminar, Layout enviado, Em elaboração…">
            <input value={v.status_projeto ?? ""} onChange={(e) => mudar({ status_projeto: t(e.target.value) })} list="status-projeto" />
            <datalist id="status-projeto">
              <option value="Estudo preliminar" /><option value="Em elaboração" /><option value="Layout enviado" /><option value="Em andamento" />
            </datalist>
          </Campo>
        </div>
      </section>

      {v.forma_execucao === "contratada" && (
        <section className="cartao">
          <h2>Contratação</h2>
          <p className="sutil pequeno">As revisões do MD e as RMS são registradas na aba Contratação da demanda.</p>
          <div className="grade-2">
            <Campo rotulo="Memorial Descritivo">
              <select value={v.md_situacao ?? ""} onChange={(e) => mudar({ md_situacao: e.target.value || null })}>
                <option value="">Não informado</option>
                {Object.entries(MD_SITUACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Código base do MD" ajuda="Sem a revisão. Ex.: MD-INF-043-2025">
              <input value={v.md_codigo ?? ""} onChange={(e) => mudar({ md_codigo: t(e.target.value) })} placeholder="MD-INF-000-2026" />
            </Campo>
            <Campo rotulo="Ordem de Serviço (OS)">
              <input value={v.os_numero ?? ""} onChange={(e) => mudar({ os_numero: t(e.target.value) })} />
            </Campo>
          </div>
        </section>
      )}

      <section className="cartao">
        <h2>Prioridade {nova && <span className="obrig">*</span>}</h2>
        <PrioridadeEditor v={v} mudar={mudar} />
      </section>

      {erro && <div className="erro-form" role="alert">{erro}</div>}
      <div className="barra-acoes">
        {aoCancelar && <button type="button" className="btn" onClick={aoCancelar}>Cancelar</button>}
        <button className="btn btn-primario" disabled={salvando}>{salvando ? "Salvando…" : nova ? "Cadastrar demanda" : "Salvar alterações"}</button>
      </div>
    </form>
  );
}
