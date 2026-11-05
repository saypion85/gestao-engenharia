import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { DemandaLinha } from "../lib/filtros";
import { Aviso, BadgeClasse, BadgeSituacao, Carregando } from "../components/ui";
import Resumo from "../components/demanda/Resumo";
import AtividadesAba from "../components/demanda/AtividadesAba";
import ContratacaoAba from "../components/demanda/ContratacaoAba";
import CustosAba from "../components/demanda/CustosAba";
import HistoricoAba from "../components/demanda/HistoricoAba";
import DocumentosAba from "../components/demanda/DocumentosAba";
import RdosAba from "../components/demanda/RdosAba";
import CronogramaAba from "../components/demanda/CronogramaAba";
import MedicaoAba from "../components/demanda/MedicaoAba";

type Aba = "resumo" | "atividades" | "cronograma" | "medicao" | "contratacao" | "custos" | "historico" | "documentos" | "rdo";

export default function DemandaDetalhe() {
  const { id } = useParams();
  const { eGestor, eContratada, podeEditar } = useAuth();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState<DemandaLinha | null>(null);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase.from("v_demandas").select("*").eq("id", Number(id)).maybeSingle();
    if (error) setErro(mensagemErro(error));
    else if (!data) setErro("Demanda não encontrada ou sem permissão de acesso.");
    else setD(data as DemandaLinha);
  }, [id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso><Link to="/demandas">← Voltar para demandas</Link></div>;
  if (!d) return <Carregando />;

  const abas: { id: Aba; nome: string; mostrar: boolean }[] = [
    { id: "resumo", nome: "Resumo", mostrar: true },
    { id: "atividades", nome: "Atividades", mostrar: true },
    { id: "cronograma", nome: "Cronograma", mostrar: true },
    { id: "contratacao", nome: "Contratação", mostrar: !eContratada && d.forma_execucao === "contratada" },
    { id: "medicao", nome: "Medição", mostrar: podeEditar },
    { id: "custos", nome: "Custos", mostrar: eGestor },
    { id: "historico", nome: "Histórico", mostrar: !eContratada },
    { id: "documentos", nome: "Documentos", mostrar: true },
    { id: "rdo", nome: "RDO", mostrar: true },
  ];
  const visiveis = abas.filter((a) => a.mostrar);
  const pedida = params.get("aba") as Aba | null;
  const aba: Aba = visiveis.some((a) => a.id === pedida) ? pedida! : "resumo";

  return (
    <div className="pagina">
      <Link to="/demandas" className="voltar">← Demandas</Link>
      <div className="demanda-cabecalho">
        <div>
          <span className="codigo">{d.codigo}</span>
          <h1>{d.assunto}</h1>
          <div className="linha-badges">
            <BadgeSituacao s={d.situacao} />
            <BadgeClasse c={d.classe} ranking={d.ranking} />
            {d.atrasada && <span className="badge badge-critico">▲ Atrasada</span>}
            {d.acomp_gerencial && <span className="badge">Acomp. gerencial</span>}
          </div>
        </div>
      </div>

      <nav className="abas" role="tablist">
        {visiveis.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""}
            onClick={() => setParams(a.id === "resumo" ? {} : { aba: a.id }, { replace: true })}>{a.nome}</button>
        ))}
      </nav>

      <div className="aba-conteudo">
        {aba === "resumo" && <Resumo d={d} recarregar={recarregar} abrirHistorico={() => setParams({ aba: "historico" }, { replace: true })} />}
        {aba === "atividades" && <AtividadesAba demanda={d} />}
        {aba === "cronograma" && <CronogramaAba d={d} />}
        {aba === "contratacao" && <ContratacaoAba d={d} recarregar={recarregar} />}
        {aba === "medicao" && <MedicaoAba d={d} />}
        {aba === "custos" && <CustosAba d={d} />}
        {aba === "historico" && <HistoricoAba d={d} recarregar={recarregar} />}
        {aba === "documentos" && <DocumentosAba demandaId={d.id} />}
        {aba === "rdo" && <RdosAba d={d} />}
      </div>
    </div>
  );
}
