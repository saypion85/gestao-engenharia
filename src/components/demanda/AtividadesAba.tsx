import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { diasAte, fmtData } from "../../lib/dominio";
import { Aviso, Campo, Carregando, Modal, Vazio, notificar } from "../ui";

export interface Atividade {
  id: number;
  demanda_id: number;
  tipo: "atividade" | "pendencia" | "entrega";
  titulo: string;
  responsavel_id: number | null;
  prazo: string | null;
  situacao: "a_fazer" | "em_andamento" | "concluida" | "cancelada";
  impedimento: boolean;
  impedimento_descricao: string | null;
  concluida_em: string | null;
  criado_em: string;
  demandas?: { codigo: string; assunto: string };
}

export const TIPOS = { atividade: "Atividade", pendencia: "Pendência", entrega: "Entrega" };
export const SITUACOES_ITEM = { a_fazer: "A fazer", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };

export function PrazoItem({ a }: { a: Atividade }) {
  if (!a.prazo) return <span className="sutil">sem prazo</span>;
  const n = diasAte(a.prazo)!;
  const aberta = a.situacao !== "concluida" && a.situacao !== "cancelada";
  return <span className={aberta && n < 0 ? "texto-critico" : aberta && n <= 7 ? "texto-atencao" : "sutil"}>{fmtData(a.prazo)}{aberta && n < 0 ? ` · ${-n}d atraso` : aberta && n === 0 ? " · hoje" : ""}</span>;
}

export function ItemForm({ inicial, demandaId, aoFechar, aoSalvar }: { inicial?: Atividade; demandaId: number; aoFechar: () => void; aoSalvar: () => void }) {
  const { cadastros } = useAuth();
  const [v, setV] = useState({
    tipo: inicial?.tipo ?? "atividade",
    titulo: inicial?.titulo ?? "",
    responsavel_id: inicial?.responsavel_id ?? null,
    prazo: inicial?.prazo ?? "",
    situacao: inicial?.situacao ?? "a_fazer",
    impedimento: inicial?.impedimento ?? false,
    impedimento_descricao: inicial?.impedimento_descricao ?? "",
  });
  const [erro, setErro] = useState("");
  const mudar = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!v.titulo.trim()) return setErro("Descreva a atividade.");
    const dados = { ...v, titulo: v.titulo.trim(), prazo: v.prazo || null, impedimento_descricao: v.impedimento_descricao || null, demanda_id: demandaId };
    const { error } = inicial
      ? await supabase.from("atividades").update(dados).eq("id", inicial.id)
      : await supabase.from("atividades").insert(dados);
    if (error) return setErro(mensagemErro(error));
    notificar(inicial ? "Item atualizado." : "Item incluído.");
    aoSalvar();
    aoFechar();
  }

  async function excluir() {
    if (!inicial || !confirm("Excluir este item?")) return;
    const { error } = await supabase.from("atividades").delete().eq("id", inicial.id);
    if (error) return setErro(mensagemErro(error));
    aoSalvar();
    aoFechar();
  }

  return (
    <Modal titulo={inicial ? "Editar item" : "Novo item"} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="form">
        <div className="segmentado">
          {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((t) => (
            <button type="button" key={t} className={v.tipo === t ? "ativo" : ""} onClick={() => mudar({ tipo: t })} aria-pressed={v.tipo === t}>{TIPOS[t]}</button>
          ))}
        </div>
        <p className="sutil pequeno">Atividade = trabalho a executar · Pendência = algo que falta resolver · Entrega = resultado a entregar (projeto, relatório, obra).</p>
        <Campo rotulo="Descrição" obrigatorio>
          <input value={v.titulo} onChange={(e) => mudar({ titulo: e.target.value })} autoFocus />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Responsável">
            <select value={v.responsavel_id ?? ""} onChange={(e) => mudar({ responsavel_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {cadastros.pessoas.filter((p) => p.ativo !== false || p.id === v.responsavel_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prazo">
            <input type="date" value={v.prazo} onChange={(e) => mudar({ prazo: e.target.value })} />
          </Campo>
          <Campo rotulo="Situação">
            <select value={v.situacao} onChange={(e) => mudar({ situacao: e.target.value as Atividade["situacao"] })}>
              {Object.entries(SITUACOES_ITEM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Campo>
        </div>
        <label className="check-linha"><input type="checkbox" checked={v.impedimento} onChange={(e) => mudar({ impedimento: e.target.checked })} /> Está impedindo o andamento (impedimento)</label>
        {v.impedimento && (
          <Campo rotulo="O que está impedindo?">
            <input value={v.impedimento_descricao} onChange={(e) => mudar({ impedimento_descricao: e.target.value })} placeholder="Ex.: área não liberada pela Operação" />
          </Campo>
        )}
        {erro && <div className="erro-form">{erro}</div>}
        <div className="barra-acoes">
          {inicial && <button type="button" className="btn btn-perigo-link" onClick={excluir}>Excluir</button>}
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function ListaItens({ itens, mostrarDemanda, aoMudar, podeEditar, aoEditar }: {
  itens: Atividade[]; mostrarDemanda?: boolean; aoMudar: () => void; podeEditar: boolean; aoEditar: (a: Atividade) => void;
}) {
  const { cadastros } = useAuth();
  const nome = (id: number | null) => cadastros.pessoas.find((p) => p.id === id)?.nome;

  async function alternar(a: Atividade) {
    const nova = a.situacao === "concluida" ? "a_fazer" : "concluida";
    const { error } = await supabase.from("atividades").update({ situacao: nova }).eq("id", a.id);
    if (error) return notificar(mensagemErro(error), "erro");
    aoMudar();
  }

  return (
    <ul className="itens">
      {itens.map((a) => {
        const feito = a.situacao === "concluida" || a.situacao === "cancelada";
        return (
          <li key={a.id} className={`item${feito ? " feito" : ""}${a.impedimento && !feito ? " impedido" : ""}`}>
            <input type="checkbox" checked={a.situacao === "concluida"} disabled={!podeEditar || a.situacao === "cancelada"}
              onChange={() => alternar(a)} aria-label={`Marcar "${a.titulo}" como concluída`} />
            <div className="item-corpo">
              <div>
                <span className={`tag tag-${a.tipo}`}>{TIPOS[a.tipo]}</span>{" "}
                {podeEditar ? <button className="btn-texto" onClick={() => aoEditar(a)}>{a.titulo}</button> : <span>{a.titulo}</span>}
              </div>
              {mostrarDemanda && a.demandas && (
                <Link to={`/demandas/${a.demanda_id}?aba=atividades`} className="pequeno">{a.demandas.codigo} · {a.demandas.assunto}</Link>
              )}
              <div className="pequeno item-meta">
                <PrazoItem a={a} />
                {nome(a.responsavel_id) && <span>· {nome(a.responsavel_id)}</span>}
                {a.situacao === "em_andamento" && <span>· Em andamento</span>}
                {a.situacao === "cancelada" && <span>· Cancelada</span>}
                {a.situacao === "concluida" && a.concluida_em && <span>· concluída em {fmtData(a.concluida_em)}</span>}
              </div>
              {a.impedimento && !feito && <div className="pequeno texto-critico">▲ Impedimento{a.impedimento_descricao ? `: ${a.impedimento_descricao}` : ""}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AtividadesAba({ demanda }: { demanda: { id: number } }) {
  const { podeEditar } = useAuth();
  const [itens, setItens] = useState<Atividade[] | null>(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState<Atividade | "nova" | null>(null);
  const [verFeitos, setVerFeitos] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("atividades").select("*").eq("demanda_id", demanda.id).order("prazo", { nullsFirst: false }).order("id");
    if (error) setErro(mensagemErro(error));
    else setItens(data as Atividade[]);
  }, [demanda.id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!itens) return <Carregando />;
  const abertos = itens.filter((a) => a.situacao === "a_fazer" || a.situacao === "em_andamento");
  const feitos = itens.filter((a) => !abertos.includes(a));

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>Atividades, pendências e entregas</h2>
        {podeEditar && <button className="btn btn-primario" onClick={() => setForm("nova")}>+ Novo item</button>}
      </div>
      {abertos.length === 0 && <Vazio titulo="Nenhum item em aberto">{podeEditar ? "Use “+ Novo item” para organizar o trabalho desta demanda." : ""}</Vazio>}
      <ListaItens itens={abertos} aoMudar={carregar} podeEditar={podeEditar} aoEditar={setForm} />
      {feitos.length > 0 && (
        <>
          <button className="btn btn-link" onClick={() => setVerFeitos(!verFeitos)}>{verFeitos ? "Ocultar" : "Mostrar"} concluídos/cancelados ({feitos.length})</button>
          {verFeitos && <ListaItens itens={feitos} aoMudar={carregar} podeEditar={podeEditar} aoEditar={setForm} />}
        </>
      )}
      {form && <ItemForm demandaId={demanda.id} inicial={form === "nova" ? undefined : form} aoFechar={() => setForm(null)} aoSalvar={carregar} />}
    </section>
  );
}
