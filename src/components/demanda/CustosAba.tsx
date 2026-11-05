import { useEffect, useState, type FormEvent } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { fmtMoeda } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { Aviso, Campo, Carregando, notificar } from "../ui";

interface Custos {
  orcado_externo: number | null;
  custo_terceirizados: number | null;
  custo_execucao_propria: number | null;
  custo_mo_propria: number | null;
  descricao_custo: string | null;
  efetivo_descricao: string | null;
  observacao: string | null;
  custo_realizado_total?: number;
  save?: number | null;
}

const VAZIO: Custos = { orcado_externo: null, custo_terceirizados: null, custo_execucao_propria: null, custo_mo_propria: null, descricao_custo: null, efetivo_descricao: null, observacao: null };

function Dinheiro({ valor, mudar }: { valor: number | null; mudar: (n: number | null) => void }) {
  const [t, setT] = useState(valor === null ? "" : String(valor).replace(".", ","));
  return (
    <div className="input-prefixo">
      <span>R$</span>
      <input inputMode="decimal" value={t} placeholder="0,00"
        onChange={(e) => {
          setT(e.target.value);
          const limpo = e.target.value.replace(/\./g, "").replace(",", ".").trim();
          mudar(limpo === "" ? null : Number.isFinite(Number(limpo)) ? Number(limpo) : null);
        }} />
    </div>
  );
}

export default function CustosAba({ d }: { d: DemandaLinha }) {
  const [c, setC] = useState<Custos | null>(null);
  const [existe, setExiste] = useState(false);
  const [versao, setVersao] = useState(0);
  const [med, setMed] = useState<{ medido: number; pago: number; ocs: number } | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    const { data, error } = await supabase.from("v_custos").select("*").eq("demanda_id", d.id).maybeSingle();
    if (error) return setErro(mensagemErro(error));
    setExiste(!!data);
    setC((data as Custos) ?? VAZIO);
  }
  useEffect(() => { carregar(); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.from("v_ordens_compra").select("medido, pago, situacao").eq("demanda_id", d.id).then(({ data }) => {
      const v = (data ?? []).filter((o) => o.situacao !== "cancelada");
      setMed(v.length ? { medido: v.reduce((s, o) => s + Number(o.medido), 0), pago: v.reduce((s, o) => s + Number(o.pago), 0), ocs: v.length } : null);
    });
  }, [d.id]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!c) return;
    const { custo_realizado_total: _a, save: _b, ...dados } = c;
    void _a; void _b;
    const { error } = existe
      ? await supabase.from("demanda_custos").update(dados).eq("demanda_id", d.id)
      : await supabase.from("demanda_custos").insert({ ...dados, demanda_id: d.id });
    if (error) return notificar(mensagemErro(error), "erro");
    notificar("Custos salvos.");
    carregar();
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!c) return <Carregando />;
  const mudar = (p: Partial<Custos>) => setC((x) => ({ ...x!, ...p }));
  const total = (c.custo_terceirizados ?? 0) + (c.custo_execucao_propria ?? 0) + (c.custo_mo_propria ?? 0);
  const save = c.orcado_externo !== null ? c.orcado_externo - total : null;

  return (
    <form className="cartao form" onSubmit={salvar}>
      <h2>Custos <span className="badge">visível só para o Gestor</span></h2>
      <div className="resumo-numeros">
        <div><span className="sutil pequeno">Custo realizado total</span><strong>{fmtMoeda(total)}</strong></div>
        <div><span className="sutil pequeno">Orçado externo (referência)</span><strong>{fmtMoeda(c.orcado_externo)}</strong></div>
        <div><span className="sutil pequeno">Save (economia)</span><strong className={save !== null && save < 0 ? "texto-critico" : ""}>{save === null ? "—" : fmtMoeda(save)}</strong></div>
      </div>
      {med && (
        <Aviso tipo="info">
          Medições ({med.ocs} OC): medido <strong>{fmtMoeda(med.medido)}</strong> · pago <strong>{fmtMoeda(med.pago)}</strong>.{" "}
          {Number(c.custo_terceirizados ?? 0) !== med.pago && <button type="button" className="btn-link" onClick={() => { mudar({ custo_terceirizados: med.pago }); setVersao((x) => x + 1); }}>Usar o valor pago como “realizado com terceiros”</button>}
        </Aviso>
      )}
      <p className="sutil pequeno">Save = Orçado externo − custo realizado total (terceiros + execução própria + mão de obra própria). Só é calculado quando o orçado externo é informado.</p>
      <div className="grade-2">
        <Campo rotulo="Orçado externo" ajuda="Quanto custaria se fosse feito com mão de obra externa. Serve de referência para calcular a economia.">
          <Dinheiro valor={c.orcado_externo} mudar={(n) => mudar({ orcado_externo: n })} />
        </Campo>
        <Campo rotulo="Custo realizado com terceiros">
          <Dinheiro key={`terc${versao}`} valor={c.custo_terceirizados} mudar={(n) => mudar({ custo_terceirizados: n })} />
        </Campo>
        <Campo rotulo="Custo da execução própria" ajuda="Materiais, locações e serviços de apoio quando a execução é feita pela equipe Triunfo.">
          <Dinheiro valor={c.custo_execucao_propria} mudar={(n) => mudar({ custo_execucao_propria: n })} />
        </Campo>
        <Campo rotulo="Custo da mão de obra própria">
          <Dinheiro valor={c.custo_mo_propria} mudar={(n) => mudar({ custo_mo_propria: n })} />
        </Campo>
        <Campo rotulo="Descrição dos custos" largo>
          <textarea rows={4} value={c.descricao_custo ?? ""} onChange={(e) => mudar({ descricao_custo: e.target.value || null })} placeholder="1 - Concreto…&#10;2 - Locação de retro…" />
        </Campo>
        <Campo rotulo="Efetivo de mão de obra própria">
          <input value={c.efetivo_descricao ?? ""} onChange={(e) => mudar({ efetivo_descricao: e.target.value || null })} placeholder="Ex.: 1 pedreiro, 2 ajudantes" />
        </Campo>
        <Campo rotulo="Observação">
          <input value={c.observacao ?? ""} onChange={(e) => mudar({ observacao: e.target.value || null })} />
        </Campo>
      </div>
      <div className="barra-acoes"><button className="btn btn-primario">Salvar custos</button></div>
    </form>
  );
}
