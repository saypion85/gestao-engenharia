import { useNavigate } from "react-router-dom";
import DemandaForm, { DEMANDA_VAZIA } from "../components/DemandaForm";
import { supabase } from "../lib/supabase";
import { hojeISO } from "../lib/dominio";
import { notificar } from "../components/ui";

export default function DemandaNova() {
  const nav = useNavigate();
  return (
    <div className="pagina pagina-estreita">
      <div className="pagina-topo">
        <h1>Nova demanda</h1>
      </div>
      <DemandaForm
        nova
        inicial={{ ...DEMANDA_VAZIA, recebida_em: hojeISO() }}
        aoCancelar={() => nav(-1)}
        aoSalvar={async (v) => {
          const { data, error } = await supabase.from("demandas").insert(v).select("id, codigo").single();
          if (error) throw error;
          await supabase.from("historico").insert({ demanda_id: data.id, texto: "Demanda cadastrada.", tipo: "atualizacao" });
          notificar(`Demanda ${data.codigo} cadastrada.`);
          nav(`/demandas/${data.id}`, { replace: true });
        }}
      />
    </div>
  );
}
