import { useCallback, useEffect, useState } from "react";
import { supabase, mensagemErro } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { fmtData, fmtDataHora } from "../../lib/dominio";
import { Aviso, Carregando, Vazio, notificar } from "../ui";

interface Registro { id: number; data: string; texto: string; tipo: "atualizacao" | "decisao" | "sistema"; autor_id: string | null; autor_nome: string | null; criado_em: string }

export default function HistoricoAba({ demandaId }: { demandaId: number }) {
  const { perfil, eGestor } = useAuth();
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_sistema" | "decisao">("sem_sistema");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("historico").select("*").eq("demanda_id", demandaId)
      .order("data", { ascending: false }).order("criado_em", { ascending: false });
    if (error) setErro(mensagemErro(error));
    else setLista(data as Registro[]);
  }, [demandaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(r: Registro) {
    if (!confirm("Excluir este registro do histórico?")) return;
    const { error } = await supabase.from("historico").delete().eq("id", r.id);
    if (error) return notificar(mensagemErro(error), "erro");
    carregar();
  }

  if (erro) return <Aviso tipo="critico">{erro}</Aviso>;
  if (!lista) return <Carregando />;
  const visiveis = lista.filter((r) => filtro === "todos" || (filtro === "decisao" ? r.tipo === "decisao" : r.tipo !== "sistema"));

  return (
    <section className="cartao">
      <div className="linha linha-entre">
        <h2>Histórico</h2>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar histórico">
          <option value="sem_sistema">Andamentos e decisões</option>
          <option value="decisao">Só decisões</option>
          <option value="todos">Tudo (inclui mudanças automáticas)</option>
        </select>
      </div>
      <p className="sutil pequeno">Para incluir um registro, use “Registrar andamento” na aba Resumo.</p>
      {visiveis.length === 0 && <Vazio titulo="Nenhum registro" />}
      <ol className="linha-tempo">
        {visiveis.map((r) => (
          <li key={r.id} className={`lt-${r.tipo}`}>
            <div className="lt-data">{fmtData(r.data)}</div>
            <div className="lt-corpo">
              {r.tipo === "decisao" && <span className="badge badge-critico">Decisão</span>}
              {r.tipo === "sistema" && <span className="badge">Automático</span>}
              <p className="pre">{r.texto}</p>
              <div className="sutil pequeno">
                {r.autor_nome ?? "—"} · registrado em {fmtDataHora(r.criado_em)}
                {(eGestor || (r.autor_id === perfil?.id && r.tipo !== "sistema")) && (
                  <> · <button className="btn-texto pequeno" onClick={() => excluir(r)}>excluir</button></>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
