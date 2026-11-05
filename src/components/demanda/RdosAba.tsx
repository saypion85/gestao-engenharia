import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fmtData, hojeISO } from "../../lib/dominio";
import type { DemandaLinha } from "../../lib/filtros";
import { Aviso, Carregando, Vazio, notificar } from "../ui";

export const STATUS_RDO: Record<string, string> = {
  rascunho: "Rascunho", enviado: "Enviado", revisado_ok: "Revisado sem ressalvas", revisado_ressalvas: "Revisado com ressalvas",
};

interface RdoLinha { id: number; data: string; origem: string; status: string; empresa_id: number | null; atividades_executadas: string | null; ocorrencias: { impedimento?: boolean }[] }

export default function RdosAba({ d }: { d: DemandaLinha }) {
  const { podeEditar, eContratada, cadastros } = useAuth();
  const [lista, setLista] = useState<RdoLinha[] | null>(null);
  const [erro, setErro] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("rdos").select("id, data, origem, status, empresa_id, atividades_executadas, ocorrencias").eq("demanda_id", d.id).order("data", { ascending: false })
      .then(({ data, error }) => (error ? setErro(mensagemErro(error)) : setLista(data as RdoLinha[])));
  }, [d.id]);

  async function novo() {
    const origem = eContratada ? "contratada" : "equipe";
    const { data, error } = await supabase.from("rdos").insert({
      demanda_id: d.id, data: hojeISO(), origem, empresa_id: eContratada ? undefined : null,
    }).select("id").single();
    if (error) return notificar(mensagemErro(error), "erro");
    nav(`/demandas/${d.id}/rdo/${data.id}`);
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!lista) return <Carregando />;
  const empresa = (id: number | null) => cadastros.empresas.find((e) => e.id === id)?.nome;

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>RDO — Relatório Diário de Obra</h2>
        {(podeEditar || eContratada) && <button className="btn btn-primario" onClick={novo}>+ Novo RDO</button>}
      </div>
      <p className="sutil pequeno">Preencha um RDO por dia de trabalho. RDO feito fora do sistema? Anexe na aba Documentos com o tipo “RDO (arquivo externo)”.</p>
      {lista.length === 0 && <Vazio titulo="Nenhum RDO registrado" />}
      <ul className="rdos">
        {lista.map((r) => (
          <li key={r.id}>
            <Link to={`/demandas/${d.id}/rdo/${r.id}`} className="rdo-item">
              <strong>{fmtData(r.data)}</strong>
              <span className={`badge rdo-${r.status}`}>{STATUS_RDO[r.status]}</span>
              <span className="pequeno">{r.origem === "contratada" ? `Contratada${empresa(r.empresa_id) ? `: ${empresa(r.empresa_id)}` : ""}` : "Equipe Triunfo"}</span>
              {r.ocorrencias?.some((o) => o.impedimento) && <span className="pequeno texto-critico">▲ Impedimento</span>}
              <span className="sutil pequeno rdo-resumo">{r.atividades_executadas?.slice(0, 120) ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
