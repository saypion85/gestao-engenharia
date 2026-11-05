import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, mensagemErro } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { diasAte } from "../lib/dominio";
import { Aviso, Carregando, Vazio } from "../components/ui";
import { ItemForm, ListaItens, TIPOS, type Atividade } from "../components/demanda/AtividadesAba";

type Janela = "todas" | "vencidas" | "semana" | "sem_prazo";

export default function Atividades() {
  const { cadastros, podeEditar, perfil } = useAuth();
  const minhaPessoa = cadastros.pessoas.find((p) => p.perfil_id === perfil?.id)?.id;
  const [itens, setItens] = useState<Atividade[] | null>(null);
  const [erro, setErro] = useState("");
  const [resp, setResp] = useState<string>("");
  const [janela, setJanela] = useState<Janela>("todas");
  const [tipo, setTipo] = useState("");
  const [soImped, setSoImped] = useState(false);
  const [editar, setEditar] = useState<Atividade | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("atividades").select("*, demandas(codigo, assunto)")
      .in("situacao", ["a_fazer", "em_andamento"]).order("prazo", { nullsFirst: false }).order("id");
    if (error) setErro(mensagemErro(error));
    else setItens(data as Atividade[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => (itens ?? []).filter((a) => {
    if (resp === "sem" ? a.responsavel_id !== null : resp && String(a.responsavel_id) !== resp) return false;
    if (tipo && a.tipo !== tipo) return false;
    if (soImped && !a.impedimento) return false;
    const n = diasAte(a.prazo);
    if (janela === "vencidas" && !(n !== null && n < 0)) return false;
    if (janela === "semana" && !(n !== null && n >= 0 && n <= 7)) return false;
    if (janela === "sem_prazo" && n !== null) return false;
    return true;
  }), [itens, resp, tipo, soImped, janela]);

  if (erro) return <div className="pagina"><Aviso tipo="critico">{erro}</Aviso></div>;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Atividades em aberto</h1>
          <p className="sutil">Atividades, pendências e entregas de todas as demandas. Marque a caixa para concluir.</p>
        </div>
      </div>
      <div className="filtros cartao">
        <div className="filtros-linha">
          <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            <option value="sem">Sem responsável</option>
            {cadastros.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          {minhaPessoa && (
            <button className={`btn-chip${resp === String(minhaPessoa) ? " ativo" : ""}`} onClick={() => setResp(resp === String(minhaPessoa) ? "" : String(minhaPessoa))}>Só as minhas</button>
          )}
          <div className="segmentado">
            {([["todas", "Todas"], ["vencidas", "Vencidas"], ["semana", "Próx. 7 dias"], ["sem_prazo", "Sem prazo"]] as [Janela, string][]).map(([k, n]) => (
              <button key={k} className={janela === k ? "ativo" : ""} onClick={() => setJanela(k)} aria-pressed={janela === k}>{n}</button>
            ))}
          </div>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <label className="check-linha pequeno"><input type="checkbox" checked={soImped} onChange={(e) => setSoImped(e.target.checked)} /> Só impedimentos</label>
        </div>
      </div>
      {!itens ? <Carregando /> : lista.length === 0 ? <Vazio titulo="Nenhuma atividade neste filtro" /> : (
        <section className="cartao">
          <p className="sutil pequeno">{lista.length} item(ns)</p>
          <ListaItens itens={lista} mostrarDemanda aoMudar={carregar} podeEditar={podeEditar} aoEditar={setEditar} />
        </section>
      )}
      {editar && <ItemForm inicial={editar} demandaId={editar.demanda_id} aoFechar={() => setEditar(null)} aoSalvar={carregar} />}
    </div>
  );
}
