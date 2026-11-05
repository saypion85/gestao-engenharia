import { useState, type ReactNode } from "react";

export interface Segmento { v: number; cor: string; nome: string }
export interface ItemBarra { chave: string; nome: string; segs: Segmento[]; extra?: ReactNode; sufixo?: ReactNode; ativo?: boolean }

/** Barras horizontais (simples ou empilhadas), cada linha clicável. */
export function BarrasEmpilhadas({ itens, aoClicar, vazio = "Nenhuma demanda no recorte." }: { itens: ItemBarra[]; aoClicar?: (chave: string) => void; vazio?: string }) {
  const total = (i: ItemBarra) => i.segs.reduce((s, x) => s + x.v, 0);
  const max = Math.max(1, ...itens.map(total));
  if (!itens.length) return <p className="sutil">{vazio}</p>;
  return (
    <ul className="barras">
      {itens.map((i) => (
        <li key={i.chave}>
          <button type="button" className={`barra-linha${i.ativo ? " ativa" : ""}`} onClick={() => aoClicar?.(i.chave)} disabled={!aoClicar}
            title={i.segs.filter((s) => s.v).map((s) => `${s.nome}: ${s.v}`).join(" · ")}>
            <span className="barra-nome">{i.nome}</span>
            <span className="barra-trilho">
              {i.segs.map((s, k) => s.v > 0 && <span key={k} className="barra" style={{ width: `${(s.v / max) * 100}%`, background: s.cor }} />)}
            </span>
            <span className="barra-valor">{total(i)}{i.sufixo}</span>
          </button>
          {i.extra}
        </li>
      ))}
    </ul>
  );
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <div className="legenda">
      {itens.map((i) => <span key={i.nome}><i style={{ background: i.cor }} />{i.nome}</span>)}
    </div>
  );
}

export interface PontoMes { rotulo: string; entradas: number; conclusoes: number; saldo: number }

/** Entradas × conclusões por mês (barras) + saldo acumulado (linha tracejada). SVG com rolagem própria no celular. */
export function GraficoTendencia({ dados }: { dados: PontoMes[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 620, A = 240, m = { e: 34, d: 12, t: 22, b: 30 };
  const larg = L - m.e - m.d, alt = A - m.t - m.b;
  const max = Math.max(4, ...dados.flatMap((d) => [d.entradas, d.conclusoes, d.saldo]));
  // escala "redonda": passo de 1, 2 ou 5 × 10ⁿ com cerca de 5 divisões, sempre acima do maior valor
  const bruto = max / 5, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 5, 10].map((k) => k * pot).find((x) => x >= bruto)!;
  const topo = Math.ceil(max / passo) * passo;
  const y = (v: number) => m.t + alt - (v / topo) * alt;
  const bw = larg / dados.length;
  const marcas: number[] = [];
  for (let v = 0; v <= topo + 0.001; v += passo) marcas.push(v);
  const linha = dados.map((d, i) => `${i ? "L" : "M"}${m.e + bw * i + bw / 2},${y(d.saldo)}`).join(" ");
  const b = Math.min(18, bw * 0.32);

  return (
    <div className="rolagem-x">
      <svg viewBox={`0 0 ${L} ${A}`} className="grafico" role="img" aria-label="Entradas e conclusões por mês" onMouseLeave={() => setFoco(null)}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} className="grade" />
            <text x={m.e - 6} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = m.e + bw * i + bw / 2;
          return (
            <g key={d.rotulo} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
              <rect x={m.e + bw * i} y={m.t} width={bw} height={alt} fill="transparent" />
              {foco === i && <rect x={m.e + bw * i + 2} y={m.t} width={bw - 4} height={alt} className="foco" />}
              <rect x={cx - b - 1} y={y(d.entradas)} width={b} height={Math.max(0, y(0) - y(d.entradas))} rx={3} className="serie-entradas" />
              <rect x={cx + 1} y={y(d.conclusoes)} width={b} height={Math.max(0, y(0) - y(d.conclusoes))} rx={3} className="serie-conclusoes" />
              {d.entradas > 0 && <text x={cx - b / 2 - 1} y={y(d.entradas) - 4} textAnchor="middle" className="valor">{d.entradas}</text>}
              {d.conclusoes > 0 && <text x={cx + b / 2 + 1} y={y(d.conclusoes) - 4} textAnchor="middle" className="valor">{d.conclusoes}</text>}
              <text x={cx} y={A - 10} textAnchor="middle">{d.rotulo}</text>
            </g>
          );
        })}
        <path d={linha} className="serie-saldo" />
        {dados.map((d, i) => <circle key={i} cx={m.e + bw * i + bw / 2} cy={y(d.saldo)} r={foco === i ? 4.5 : 3} className="ponto-saldo" />)}
        {foco !== null && (() => {
          const d = dados[foco];
          const x = Math.min(L - m.d - 150, Math.max(m.e, m.e + bw * foco + bw / 2 - 75));
          return (
            <g className="dica" pointerEvents="none">
              <rect x={x} y={2} width={150} height={52} rx={6} />
              <text x={x + 10} y={18} className="dica-titulo">{d.rotulo}</text>
              <text x={x + 10} y={32}>Entradas {d.entradas} · Conclusões {d.conclusoes}</text>
              <text x={x + 10} y={46}>Saldo acumulado {d.saldo}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
