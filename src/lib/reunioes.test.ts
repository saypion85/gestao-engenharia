import { describe, expect, it } from "vitest";
import { ataEmTexto, montarAta, motivosDaDemanda, pesoPauta, type Reuniao } from "./reunioes";
import type { DemandaLinha } from "./filtros";

const hoje = new Date().toISOString().slice(0, 10);
const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const dem = (p: Partial<DemandaLinha>): DemandaLinha => ({
  id: 1, codigo: "DEM-0001", assunto: "Telhado", situacao: "em_andamento", etapa: "execucao", forma_execucao: "interna",
  prazo_conclusao: null, prazo_proxima_etapa: null, ultima_atualizacao: hoje, acomp_gerencial: false, ranking: null, pontuacao: null,
  rms_validas: 0, md_situacao: null, responsavel_nome: "Luis Soares", ...p,
} as DemandaLinha);

describe("pauta da reunião", () => {
  it("lista os motivos de atenção da demanda", () => {
    const d = dem({ prazo_conclusao: ontem, acomp_gerencial: true });
    expect(motivosDaDemanda(d, new Set([1]), new Set([1]))).toEqual(["Decisão a tomar", "Com impedimento", "Prazo de conclusão vencido", "Acompanhamento gerencial"]);
  });
  it("demanda encerrada não entra na pauta", () => {
    expect(motivosDaDemanda(dem({ situacao: "concluida", prazo_conclusao: ontem }), new Set([1]), new Set([1]))).toEqual([]);
  });
  it("impedimento e decisão pesam mais que acompanhamento", () => {
    const a = dem({ id: 1 }), b = dem({ id: 2 });
    expect(pesoPauta(a, ["Com impedimento", "Decisão a tomar"])).toBeGreaterThan(pesoPauta(b, ["Acompanhamento gerencial", MARCAS_LEVES]));
  });
});
const MARCAS_LEVES = "Vencendo em 7 dias";

describe("ata", () => {
  const reuniao: Reuniao = { id: 9, titulo: "Semanal", data: "2026-11-05", hora: "09:00:00", local: "Sala 2", participantes_ids: [1, 2], convidados: "Fiscal AVM", objetivo: null, assuntos_gerais: "Férias de dezembro", status: "planejada", ata: null, encerrada_em: null, encerrada_por_nome: null, criado_em: "" };
  const ata = montarAta({
    reuniao, demandas: [dem({})], pessoas: [{ id: 1, nome: "Gustavo Sipião" }, { id: 2, nome: "Luis Soares" }],
    itens: [{ id: 1, reuniao_id: 9, demanda_id: 1, ordem: 0, motivos: ["Com impedimento"], notas: "Aguardar liberação", discutido: true }],
    decisoes: [
      { id: 1, demanda_id: 1, data: "2026-11-05", texto: "Contratar guindaste?", autor_nome: "Luis Soares", decisao_status: "tomada", decisao_responsavel: null, decisao_prazo: null, decisao_resultado: "Sim, locação por 2 dias", decidida_em: "2026-11-05", decidida_por_nome: "Gustavo Sipião", reuniao_id: 9 },
      { id: 2, demanda_id: 1, data: "2026-11-05", texto: "Trocar a telha?", autor_nome: "Luis Soares", decisao_status: "pendente", decisao_responsavel: "Direx", decisao_prazo: "2026-11-20", decisao_resultado: null, decidida_em: null, decidida_por_nome: null, reuniao_id: null },
    ],
    acoes: [{ id: 1, demanda_id: 1, reuniao_id: 9, tipo: "acao", titulo: "Cotar guindaste", responsavel_id: 2, prazo: "2026-11-10", situacao: "a_fazer", concluida_em: null, criado_em: "" }],
    acoesAnteriores: [], encerradaPor: "Gustavo Sipião", agora: "2026-11-05T12:00:00Z",
  });
  it("reúne participantes, decisões, pendências e plano de ação", () => {
    expect(ata.reuniao.participantes).toEqual(["Gustavo Sipião", "Luis Soares"]);
    expect(ata.decisoes_tomadas).toHaveLength(1);
    expect(ata.decisoes_pendentes[0]).toMatchObject({ quem: "Direx", prazo: "2026-11-20" });
    expect(ata.acoes[0]).toMatchObject({ descricao: "Cotar guindaste", responsavel: "Luis Soares", prazo: "2026-11-10" });
  });
  it("texto para e-mail tem plano de ação com quem e quando", () => {
    const t = ataEmTexto(ata);
    expect(t).toContain("PLANO DE AÇÃO");
    expect(t).toContain("1. Cotar guindaste — Responsável: Luis Soares — Prazo: 10/11/2026");
    expect(t).toContain("Contratar guindaste? → Sim, locação por 2 dias");
    expect(t).toContain("Quem decide: Direx");
    expect(t).toContain("Férias de dezembro");
  });
});
