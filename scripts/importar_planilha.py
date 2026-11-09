"""
Importação da planilha "Resumo das Obras - Infraestrutura" (aba Dados).

Gera:
  dados/importacao.sql          -> SQL para rodar no Supabase (SQL Editor) uma única vez
  dados/relatorio_importacao.xlsx -> todas as correções/inferências, linha a linha, para conferência

Uso:
  python3 -I scripts/importar_planilha.py caminho/planilha.xlsx [pasta_saida]

Os dados da empresa NÃO vão para o repositório (pasta dados/ está no .gitignore).
"""
import collections
import datetime as dt
import re
import sys
import unicodedata
import warnings
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------- utilidades


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def chave(s) -> str:
    return re.sub(r"[^a-z0-9]", "", sem_acento(str(s)).lower())


def txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def q(v):
    """Literal SQL."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(v, 2)) if isinstance(v, float) else str(v)
    if isinstance(v, dt.date):
        return f"'{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


def data(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def numero(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


# ---------------------------------------------------------------- normalizações

PESSOAS = [
    "Camila Anjos", "Camila Fonseca", "César Campelo", "Gustavo Sipião", "Leandro Maciel",
    "Luis Soares", "Ricardo Santana", "Jonathan Souza", "Erica Moreira",
]
ALIAS_PESSOA = {chave(p): p for p in PESSOAS}
ALIAS_PESSOA.update({"cesar": "César Campelo", "cesarcampelo": "César Campelo", "ricardo": "Ricardo Santana"})

# Locais: variações de digitação -> nome padrão
ALIAS_LOCAL = {
    "arm30": "Armazém 30", "armazem30": "Armazém 30",
    "gcomex": "Gcomex", "gecomex": "Gcomex",
    "ketlog": "Ketlog",
    "arara": "Arará",
    "intoallseas": "INTO / AllSeas",
    "caju44": "Caju 44",
    "arm08": "Armazém 8", "armazem8": "Armazém 8",
    "centralderesiduos": "Central de Resíduos",
    "substacoes": "Subestações",
    "patio0809e10": "Pátio 8, 9 e 10",
}

SITUACAO = {
    "concluido": "concluida", "aguardando": "aguardando", "emexecucao": "em_andamento",
    "suspenso": "suspensa", "cancelado": "cancelada",
}

MD_RE = re.compile(r"MD-INF(?:RA)?-(\d{3})-(\d{4})-(\d{3})|MD-INF(?:RA)?-(\d{4})-(\d{3})-(\d{3})")
MD_NAO_NECESSARIO = {"naoprecisademd", "naotemmd", "na", ""}
MD_A_ELABORAR = {"criarmd", "montarmd"}
RMS_SEM = {"naoprecisaderms", "naotemrms", "na", ""}
FORMULA_CUSTO_REPETIDA = "=3157.26+1180+5585+16200+64.5"
HIST_DATA_RE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*[-–:]?\s*", re.M)

# ---------------------------------------------------------------- leitura


def main(caminho: str, saida: str = "dados"):
    out = Path(saida)
    out.mkdir(parents=True, exist_ok=True)
    wb_v = openpyxl.load_workbook(caminho, data_only=True)
    wb_f = openpyxl.load_workbook(caminho)
    ws, wf = wb_v["Dados"], wb_f["Dados"]
    hoje = dt.date.today()

    cab = [c.value for c in ws[1]]
    col = {str(h).strip(): i for i, h in enumerate(cab) if h}

    def get(row, nome):
        return row[col[nome.strip()]]

    correcoes = []  # (linha, assunto, campo, original, importado, motivo, conferir)

    def anota(linha, assunto, campo, orig, novo, motivo, conferir=False):
        correcoes.append((linha, assunto, campo, "" if orig is None else str(orig), "" if novo is None else str(novo), motivo, "SIM" if conferir else ""))

    locais = collections.OrderedDict()
    demandas, custos, mds, rmss, hist, ativs = [], [], [], [], [], []
    vistos = {}
    contagem_local = collections.Counter(txt(r[col["Local"]]) for r in ws.iter_rows(min_row=2, values_only=True) if txt(r[col["Assunto"]]))

    def local_padrao(v):
        if not v:
            return None
        k = chave(v)
        if k in ALIAS_LOCAL:
            return ALIAS_LOCAL[k]
        # mesma grafia sem acento/maiúsculas -> forma mais usada
        candidatos = [n for n in contagem_local if n and chave(n) == k]
        return max(candidatos, key=lambda n: contagem_local[n]) if candidatos else v

    did = 0
    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        assunto = txt(get(row, "Assunto"))
        if not assunto:
            continue
        did += 1
        frow = [c.value for c in wf[idx]]
        d = {"id": did, "linha": idx, "assunto": re.sub(r"\s+", " ", assunto)}
        if d["assunto"] != assunto:
            anota(idx, assunto, "Assunto", assunto, d["assunto"], "Espaços extras removidos")

        # Duplicidade
        k = chave(d["assunto"])
        if k in vistos:
            anota(idx, assunto, "Assunto", "", f"Possível duplicidade com a linha {vistos[k][0]} (DEM-{vistos[k][1]:04d})",
                  "Mesmo assunto em outra linha. Importada mesmo assim; avalie cancelar ou excluir.", True)
            hist.append((did, hoje, f"Importação: possível duplicidade com DEM-{vistos[k][1]:04d} (mesmo assunto na planilha).", "sistema"))
        else:
            vistos[k] = (idx, did)

        # Local
        lo = txt(get(row, "Local"))
        lp = local_padrao(lo)
        if lp != lo:
            anota(idx, assunto, "Local", lo, lp, "Nome de local padronizado")
        if lp:
            locais.setdefault(lp, None)
        d["local"] = lp

        # Responsável
        r = txt(get(row, "Responsável"))
        rp = ALIAS_PESSOA.get(chave(r)) if r else None
        if r and rp != r:
            anota(idx, assunto, "Responsável", r, rp or "(vazio)", "Nome padronizado" if rp else "Valor sem responsável válido", not rp)
        d["responsavel"] = rp

        d["solicitante"] = txt(get(row, "Solicitante"))
        d["recebida_em"] = data(get(row, "Demanda Recebida em:"))
        ag = txt(get(row, "Acomp. Gerencial"))
        d["acomp_gerencial"] = bool(ag and chave(ag) == "sim")


        # Situação
        st = txt(get(row, "Status")) or ""
        sit = SITUACAO.get(chave(st))
        historico_txt = txt(get(row, "Histórico")) or ""
        if sit is None:
            if ";" in st:
                sit = "concluida" if "concluída" in historico_txt.lower() else "aguardando"
                anota(idx, assunto, "Status", st[:60] + "…", sit, "Campo com a lista inteira colada; situação definida pelo histórico", True)
            else:
                sit = "nao_iniciada"
                anota(idx, assunto, "Status", st, "Não iniciada", "'Outros' não existe no sistema; conferir situação", True)
        elif st != st.strip() or st.strip() not in ("Concluído", "Aguardando", "Em execução", "Suspenso", "Cancelado"):
            anota(idx, assunto, "Status", repr(st), sit, "Espaço extra removido")
        d["situacao"] = sit

        pr = txt(get(row, "Prioridade"))
        d["prioridade_legada"] = pr
        if pr:
            anota(idx, assunto, "Prioridade", pr, "Sem avaliação (prioridade antiga guardada como referência)",
                  "Prioridade agora é calculada pela matriz P × S; avaliar a demanda no sistema", sit not in ("concluida", "cancelada"))

        # Etapa com -> aguardando_o_que
        ec = txt(get(row, "Etapa com"))
        if ec:
            ec_n = ALIAS_PESSOA.get(chave(ec), ec)
            if ec_n != ec:
                anota(idx, assunto, "Etapa com", ec, ec_n, "Nome padronizado")
            if sit == "aguardando":
                d["aguardando_o_que"] = ec_n
            else:
                d["aguardando_o_que"] = None
                hist.append((did, hoje, f"Importação: campo 'Etapa com' da planilha = {ec_n}.", "sistema"))
        else:
            d["aguardando_o_que"] = None

        # Detalhamento
        det = get(row, "Detalhamento do Status")
        det_t = txt(det) if not isinstance(det, dt.datetime) else None
        if isinstance(det, dt.datetime) or (det_t and (det_t in ("-",) or re.fullmatch(r"[\d/]+", det_t) or chave(det_t) == "cesar")):
            if det_t != "-":
                anota(idx, assunto, "Detalhamento do Status", det, "(vazio)", "Valor não descritivo (data ou nome solto)")
            det_t = None
        d["detalhamento"] = det_t
        d["status_projeto"] = txt(get(row, "Status Projeto"))

        # Prazos
        d["prazo_proxima_etapa"] = data(get(row, "Prazo da Próxima etapa"))
        d["prazo_conclusao"] = data(get(row, "Prazo de Conclusão"))
        for campo, chave_d in (("Inicio", "inicio"), ("FIm", "fim")):
            v = get(row, campo)
            d[chave_d] = data(v)
            if v is not None and d[chave_d] is None:
                anota(idx, assunto, campo, v, "(vazio)", "Texto em campo de data")
        if sit == "concluida":
            d["concluida_em"] = d["fim"] or data(get(row, "Atualizado em")) if not str(frow[col["Atualizado em"]]).startswith("=TODAY") else d["fim"]
        else:
            d["concluida_em"] = None

        atualizado = get(row, "Atualizado em")
        if str(frow[col["Atualizado em"]]).startswith("=TODAY"):
            anota(idx, assunto, "Atualizado em", "=TODAY()", "(ignorado)", "Fórmula mostrava sempre a data de hoje", False)
            atualizado = None
        atualizado = data(atualizado)

        # Memorial Descritivo
        md = get(row, "Memorial Descritivo")
        md_t = txt(md) or ""
        achados = MD_RE.findall(md_t)
        if achados:
            d["md_situacao"] = "emitido"
            base = None
            for a in achados:
                if a[0]:
                    num, ano, rev = a[0], a[1], a[2]
                else:
                    ano, num, rev = a[3], a[4], a[5]
                codigo_pad = f"MD-INF-{num}-{ano}-{rev}"
                base = base or f"MD-INF-{num}-{ano}"
                mds.append((did, codigo_pad, int(rev)))
            d["md_codigo"] = base
            if len(achados) > 1 or not re.fullmatch(r"MD-INF-\d{3}-\d{4}-\d{3}", md_t):
                anota(idx, assunto, "Memorial Descritivo", md_t, ", ".join(m[1] for m in mds if m[0] == did),
                      "Código padronizado para MD-INF-NNN-AAAA-REV" + (" (mais de um MD na célula)" if len(achados) > 1 else ""), len(achados) > 1)
        else:
            k_md = chave(md_t)
            d["md_codigo"] = None
            if k_md in MD_A_ELABORAR:
                d["md_situacao"] = "a_elaborar"
                if sit not in ("concluida", "cancelada"):
                    ativs.append((did, "pendencia", "Elaborar Memorial Descritivo"))
                anota(idx, assunto, "Memorial Descritivo", md_t, "A elaborar" + (" + pendência criada" if sit not in ("concluida", "cancelada") else ""), "Ação pendente registrada como situação do MD")
            elif k_md in MD_NAO_NECESSARIO or md_t == "-":
                d["md_situacao"] = "nao_necessario"
            else:
                d["md_situacao"] = None
                anota(idx, assunto, "Memorial Descritivo", md_t, "(vazio)", "Valor não reconhecido como código de MD", True)

        # RMS
        rv = get(row, "RMS")
        rv_t = txt(rv) or ""
        nums = re.findall(r"\d{6,7}", rv_t)
        if nums:
            partes = re.split(r"\n|/|,| e ", rv_t)
            for n in nums:
                trecho = next((p for p in partes if n in p), "")
                if "cancelada" in trecho.lower() or "(cancelada)" in trecho.lower():
                    s_rms = "cancelada"
                elif sit == "concluida":
                    s_rms = "atendida"
                else:
                    s_rms = "aberta"
                rmss.append((did, n, s_rms, trecho.strip() if trecho.strip() != n else None))
                if len(n) == 7:
                    anota(idx, assunto, "RMS", n, n, "Número com 7 dígitos (os demais têm 6): conferir digitação", True)
            if len(nums) > 1 or not rv_t.isdigit():
                anota(idx, assunto, "RMS", rv_t.replace("\n", " | "), "; ".join(f"{x[1]} ({x[2]})" for x in rmss if x[0] == did),
                      "Separado em RMS individuais com situação", "cancelar" in rv_t.lower())
        elif chave(rv_t) == "abrirrms":
            if sit not in ("concluida", "cancelada"):
                ativs.append((did, "pendencia", "Abrir RMS"))
            anota(idx, assunto, "RMS", rv_t, "Pendência 'Abrir RMS'" if sit not in ("concluida", "cancelada") else "(vazio)", "Ação pendente virou pendência da demanda")

        # OS
        os_v = txt(get(row, "Ordem de Serviço"))
        if os_v and chave(os_v) == "na":
            os_v = None
        if os_v and not os_v.isdigit():
            anota(idx, assunto, "Ordem de Serviço", os_v, os_v, "Mais de uma OS informada; o sistema prevê uma OS por demanda", True)
        d["os_numero"] = os_v

        # Forma de execução
        mo = chave(get(row, "Mão de obra propria ") or "")
        if mo == "sim":
            forma = "interna"
        elif mo == "nao":
            forma = "contratada"
        else:
            sem_rms = chave(rv_t) in RMS_SEM and not nums
            forma = "interna" if (sem_rms and chave(rv_t) in ("naoprecisaderms", "naotemrms")) else "contratada"
            anota(idx, assunto, "Forma de execução (novo)", get(row, "Mão de obra propria ") or "", forma.capitalize(),
                  "Inferida pela RMS (sem RMS = interna); conferir", sit not in ("concluida", "cancelada"))
        d["forma_execucao"] = forma

        # Etapa (novo campo) — inferência
        if sit == "concluida":
            etapa = "concluida"
        elif sit == "em_andamento":
            etapa = "execucao"
        else:
            ec_k = chave(d["aguardando_o_que"] or "")
            if "aprovar" in ec_k:
                etapa = "aprovacao"
            elif os_v:
                etapa = "execucao"
            elif nums:
                etapa = "rms_suprimentos"
            elif d["md_situacao"] == "emitido" and forma == "contratada":
                etapa = "rms_suprimentos"
            elif d["md_situacao"] == "a_elaborar":
                etapa = "memorial_descritivo"
            elif d["status_projeto"]:
                etapa = "estudo_projeto"
            else:
                etapa = "recebida"
            if sit != "cancelada" or etapa != "recebida":
                anota(idx, assunto, "Etapa (novo)", "", etapa, "Etapa deduzida de MD/RMS/OS/Etapa com; conferir", sit not in ("cancelada",))
        d["etapa"] = etapa

        # Histórico
        if historico_txt:
            entradas = []
            marcas = list(HIST_DATA_RE.finditer(historico_txt))
            if marcas and marcas[0].start() > 0:
                pre = historico_txt[: marcas[0].start()].strip()
                if pre:
                    entradas.append((atualizado or hoje, pre, True))
            if not marcas:
                entradas.append((atualizado or hoje, historico_txt.strip(), True))
            for i, m in enumerate(marcas):
                fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(historico_txt)
                corpo = historico_txt[m.end():fim].strip()
                try:
                    dd = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                except ValueError:
                    dd = atualizado or hoje
                    anota(idx, assunto, "Histórico", m.group(0), dd, "Data inválida no histórico", True)
                if corpo:
                    entradas.append((dd, corpo, False))
            sem_data = [e for e in entradas if e[2]]
            if sem_data:
                anota(idx, assunto, "Histórico", "(texto sem data)", f"Data atribuída: {(atualizado or hoje).strftime('%d/%m/%Y')}",
                      "Trecho sem data recebeu a data de 'Atualizado em' (ou a da importação)")
            if len(entradas) > 1:
                anota(idx, assunto, "Histórico", f"1 célula", f"{len(entradas)} registros", "Histórico separado por data")
            for e in entradas:
                hist.append((did, e[0], e[1], "atualizacao"))
        elif atualizado:
            hist.append((did, atualizado, "Registro importado da planilha (sem texto de histórico).", "sistema"))

        # Custos
        c = {}
        obs = []
        for campo, chave_c in (("Custo Realizado tercerizados ", "custo_terceirizados"),
                               ("Custo Realizdado com m.o. própria", "custo_execucao_propria"),
                               ("Custo m.o. própria", "custo_mo_propria"),
                               ("Orçado Externo", "orcado_externo")):
            v = get(row, campo)
            fv = frow[col[campo.strip()]]
            if chave_c == "custo_execucao_propria" and str(fv).replace(" ", "") == FORMULA_CUSTO_REPETIDA:
                anota(idx, assunto, campo.strip(), f"{fv} (R$ 26.186,76)", "(vazio)", "Mesma fórmula copiada em 18 linhas: provável erro de cópia", True)
                v = None
            n = numero(v)
            if v is not None and n is None:
                t = txt(v)
                if t and chave(t) != "na":
                    obs.append(f"{campo.strip()}: {t}")
                    anota(idx, assunto, campo.strip(), t, "(observação de custo)", "Texto em campo de valor")
            c[chave_c] = n
        for campo, chave_c in (("Descrição do custo realizado", "descricao_custo"), ("Descrição do efetivo da mão de obra ", "efetivo_descricao")):
            t = txt(get(row, campo))
            c[chave_c] = None if (t and chave(t) == "na") else t
        c["observacao"] = "; ".join(obs) or None
        save_pl = get(row, "Save")
        if any(v is not None for v in c.values()):
            c["demanda_id"] = did
            custos.append(c)
            if c["orcado_externo"] is not None:
                novo = c["orcado_externo"] - sum(c[x] or 0 for x in ("custo_terceirizados", "custo_execucao_propria", "custo_mo_propria"))
                if isinstance(save_pl, (int, float)) and abs(novo - save_pl) > 0.01:
                    anota(idx, assunto, "Save", f"{save_pl:,.2f}", f"{novo:,.2f}", "Save recalculado pela regra única do sistema (Orçado − custo realizado total)", True)
                elif isinstance(save_pl, str) and save_pl.startswith("#"):
                    anota(idx, assunto, "Save", save_pl, f"{novo:,.2f}", "Erro de fórmula na planilha", False)

        demandas.append(d)

    # ------------------------------------------------------------ SQL
    L = ["-- Importação gerada em " + dt.datetime.now().strftime("%d/%m/%Y %H:%M"),
         "-- Rodar UMA vez no SQL Editor do Supabase, com o banco vazio.",
         "begin;",
         "do $$ begin if exists (select 1 from demandas) then raise exception 'Já existem demandas: importação abortada para não duplicar dados.'; end if; end $$;"]
    L.append("insert into pessoas (nome) values " + ", ".join(f"({q(p)})" for p in PESSOAS) + " on conflict (nome) do nothing;")
    L.append("insert into locais (nome) values " + ", ".join(f"({q(n)})" for n in locais) + " on conflict (nome) do nothing;")
    campos = ["id", "assunto", "local_id", "responsavel_id", "solicitante", "recebida_em", "acomp_gerencial", "forma_execucao",
              "situacao", "aguardando_o_que", "etapa", "detalhamento", "status_projeto", "prazo_proxima_etapa", "prazo_conclusao",
              "inicio", "fim", "concluida_em", "md_situacao", "md_codigo", "os_numero", "prioridade_legada", "importado_linha"]
    for d in demandas:
        vals = [
            str(d["id"]), q(d["assunto"]),
            f"(select id from locais where nome = {q(d['local'])})" if d["local"] else "null",
            f"(select id from pessoas where nome = {q(d['responsavel'])})" if d["responsavel"] else "null",
            q(d["solicitante"]), q(d["recebida_em"]), q(d["acomp_gerencial"]), q(d["forma_execucao"]),
            q(d["situacao"]), q(d["aguardando_o_que"]), q(d["etapa"]), q(d["detalhamento"]), q(d["status_projeto"]),
            q(d["prazo_proxima_etapa"]), q(d["prazo_conclusao"]), q(d["inicio"]), q(d["fim"]), q(d["concluida_em"]),
            q(d["md_situacao"]), q(d["md_codigo"]), q(d["os_numero"]), q(d["prioridade_legada"]), str(d["linha"]),
        ]
        L.append(f"insert into demandas ({', '.join(campos)}) overriding system value values ({', '.join(vals)});")
    L.append("select setval(pg_get_serial_sequence('demandas', 'id'), (select max(id) from demandas));")
    for did, cod, rev in mds:
        L.append(f"insert into memoriais_revisoes (demanda_id, codigo, revisao) values ({did}, {q(cod)}, {rev}) on conflict do nothing;")
    for did, n, s, desc in rmss:
        L.append(f"insert into rms (demanda_id, numero, situacao, descricao) values ({did}, {q(n)}, {q(s)}, {q(desc)});")
    for did, tipo, titulo in ativs:
        L.append(f"insert into atividades (demanda_id, tipo, titulo, responsavel_id) values ({did}, {q(tipo)}, {q(titulo)}, (select responsavel_id from demandas where id = {did}));")
    for did, dd, texto, tipo in hist:
        L.append(f"insert into historico (demanda_id, data, texto, tipo, autor_nome) values ({did}, {q(dd)}, {q(texto)}, {q(tipo)}, 'Importado da planilha');")
    ccampos = ["demanda_id", "orcado_externo", "custo_terceirizados", "custo_execucao_propria", "custo_mo_propria", "descricao_custo", "efetivo_descricao", "observacao"]
    for c in custos:
        L.append(f"insert into demanda_custos ({', '.join(ccampos)}) values ({', '.join(q(c[k]) for k in ccampos)});")
    L.append("commit;")
    (out / "importacao.sql").write_text("\n".join(L) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ sincronização segura (idempotente)
    # Funciona com o banco vazio ou já importado: cria o que falta, só preenche campos vazios,
    # não apaga nem sobrescreve nada e pode ser executada mais de uma vez sem duplicar.
    linha_de = {d["id"]: d["linha"] for d in demandas}
    def vl(rows):
        return ",\n".join("(" + ", ".join(r) + ")" for r in rows)
    S = ["-- Sincronização da planilha gerada em " + dt.datetime.now().strftime("%d/%m/%Y %H:%M"),
         "-- Segura para rodar com o banco vazio ou já importado: cria demandas que não existem, preenche apenas",
         "-- campos vazios e acrescenta registros que faltam. Não apaga nem sobrescreve. Pode rodar mais de uma vez.",
         "begin;",
         "insert into pessoas (nome) values " + ", ".join(f"({q(p)})" for p in PESSOAS) + " on conflict (nome) do nothing;",
         "insert into locais (nome) values " + ", ".join(f"({q(n)})" for n in locais) + " on conflict (nome) do nothing;",
         "drop table if exists _p, _sinc;",
         "create temp table _sinc (acao text, codigo text);",
         "create temp table _p (l int primary key, assunto text, local text, resp text, solicitante text, recebida_em date, acomp boolean, forma forma_execucao, "
         "situacao situacao_demanda, aguardando text, etapa etapa_demanda, detalhamento text, status_projeto text, prazo_prox date, prazo date, "
         "inicio date, fim date, concluida_em date, md_sit situacao_md, md_cod text, os text, prio text);"]
    S.append("insert into _p values\n" + vl([[str(d["linha"]), q(d["assunto"]), q(d["local"]), q(d["responsavel"]), q(d["solicitante"]), q(d["recebida_em"]),
        q(d["acomp_gerencial"]), q(d["forma_execucao"]), q(d["situacao"]), q(d["aguardando_o_que"]), q(d["etapa"]), q(d["detalhamento"]),
        q(d["status_projeto"]), q(d["prazo_proxima_etapa"]), q(d["prazo_conclusao"]), q(d["inicio"]), q(d["fim"]), q(d["concluida_em"]),
        q(d["md_situacao"]), q(d["md_codigo"]), q(d["os_numero"]), q(d["prioridade_legada"])] for d in demandas]) + ";")
    S.append("""-- 1) demandas que ainda não existem (mesma linha da planilha e mesmo assunto)
with n as (
  insert into demandas (assunto, local_id, responsavel_id, solicitante, recebida_em, acomp_gerencial, forma_execucao, situacao, aguardando_o_que,
    etapa, detalhamento, status_projeto, prazo_proxima_etapa, prazo_conclusao, inicio, fim, concluida_em, md_situacao, md_codigo, os_numero,
    prioridade_legada, importado_linha)
  select p.assunto, (select id from locais where nome = p.local), (select id from pessoas where nome = p.resp), p.solicitante, p.recebida_em, p.acomp,
    p.forma, p.situacao, p.aguardando, p.etapa, p.detalhamento, p.status_projeto, p.prazo_prox, p.prazo, p.inicio, p.fim, p.concluida_em,
    p.md_sit, p.md_cod, p.os, p.prio, p.l
  from _p p
  where not exists (select 1 from demandas d where d.importado_linha = p.l and d.assunto = p.assunto)
  order by p.l
  returning codigo)
insert into _sinc select 'demanda criada', codigo from n;

-- ligação linha da planilha → demanda do sistema
create temp table _m as select p.l, min(d.id) as id from _p p join demandas d on d.importado_linha = p.l and d.assunto = p.assunto group by p.l;

-- 2) demandas que já existem: só preenche campos vazios
with u as (
  update demandas d set
    local_id = coalesce(d.local_id, (select id from locais where nome = p.local)),
    responsavel_id = coalesce(d.responsavel_id, (select id from pessoas where nome = p.resp)),
    solicitante = coalesce(d.solicitante, p.solicitante), recebida_em = coalesce(d.recebida_em, p.recebida_em),
    aguardando_o_que = case when d.situacao = 'aguardando' then coalesce(d.aguardando_o_que, p.aguardando) else d.aguardando_o_que end,
    detalhamento = coalesce(d.detalhamento, p.detalhamento), status_projeto = coalesce(d.status_projeto, p.status_projeto),
    prazo_proxima_etapa = coalesce(d.prazo_proxima_etapa, p.prazo_prox), prazo_conclusao = coalesce(d.prazo_conclusao, p.prazo),
    inicio = coalesce(d.inicio, p.inicio), fim = coalesce(d.fim, p.fim), md_situacao = coalesce(d.md_situacao, p.md_sit),
    md_codigo = coalesce(d.md_codigo, p.md_cod), os_numero = coalesce(d.os_numero, p.os), prioridade_legada = coalesce(d.prioridade_legada, p.prio)
  from _p p join _m m on m.l = p.l
  where d.id = m.id and (
       (d.local_id is null and p.local is not null) or (d.responsavel_id is null and p.resp is not null)
    or (d.solicitante is null and p.solicitante is not null) or (d.recebida_em is null and p.recebida_em is not null)
    or (d.situacao = 'aguardando' and d.aguardando_o_que is null and p.aguardando is not null)
    or (d.detalhamento is null and p.detalhamento is not null) or (d.status_projeto is null and p.status_projeto is not null)
    or (d.prazo_proxima_etapa is null and p.prazo_prox is not null) or (d.prazo_conclusao is null and p.prazo is not null)
    or (d.inicio is null and p.inicio is not null) or (d.fim is null and p.fim is not null)
    or (d.md_situacao is null and p.md_sit is not null) or (d.md_codigo is null and p.md_cod is not null)
    or (d.os_numero is null and p.os is not null) or (d.prioridade_legada is null and p.prio is not null))
  returning d.codigo)
insert into _sinc select 'campos vazios preenchidos', codigo from u;""")
    S.append("-- 3) revisões de MD que faltam\ninsert into memoriais_revisoes (demanda_id, codigo, revisao) select m.id, v.codigo, v.rev from (values\n"
             + vl([[str(linha_de[did]), q(cod), str(rev)] for did, cod, rev in mds]) + "\n) v(l, codigo, rev) join _m m on m.l = v.l on conflict do nothing;")
    S.append("-- 4) RMS que faltam\ninsert into rms (demanda_id, numero, situacao, descricao) select m.id, v.numero, v.sit::situacao_rms, v.descr from (values\n"
             + vl([[str(linha_de[did]), q(n), q(st), q(desc) if desc else "null::text"] for did, n, st, desc in rmss])
             + "\n) v(l, numero, sit, descr) join _m m on m.l = v.l where not exists (select 1 from rms r where r.demanda_id = m.id and r.numero = v.numero);")
    S.append("-- 5) pendências (Abrir RMS / Elaborar MD) só para demandas criadas agora\ninsert into atividades (demanda_id, tipo, titulo, responsavel_id) "
             "select d.id, v.tipo::tipo_item, v.titulo, d.responsavel_id from (values\n"
             + vl([[str(linha_de[did]), q(tipo), q(titulo)] for did, tipo, titulo in ativs])
             + "\n) v(l, tipo, titulo) join _m m on m.l = v.l join demandas d on d.id = m.id where d.criado_em = now() "
             "and not exists (select 1 from atividades a where a.demanda_id = d.id and a.titulo = v.titulo);")
    S.append("-- 6) registros de histórico que faltam\nwith h as (insert into historico (demanda_id, data, texto, tipo, autor_nome) "
             "select m.id, v.data::date, v.texto, v.tipo::tipo_historico, 'Importado da planilha' from (values\n"
             + vl([[str(linha_de[did]), q(dd), q(texto), q(tipo)] for did, dd, texto, tipo in hist])
             + "\n) v(l, data, texto, tipo) join _m m on m.l = v.l where not exists (select 1 from historico x where x.demanda_id = m.id and x.data = v.data::date and (x.texto = v.texto or (x.autor_nome = 'Importado da planilha' and x.tipo = v.tipo::tipo_historico))) "
             "returning demanda_id)\ninsert into _sinc select 'histórico acrescentado', (select codigo from demandas where id = h.demanda_id) from h;")
    cols = [k for k in ccampos if k != "demanda_id"]
    tipos = {"orcado_externo": "numeric", "custo_terceirizados": "numeric", "custo_execucao_propria": "numeric", "custo_mo_propria": "numeric",
             "descricao_custo": "text", "efetivo_descricao": "text", "observacao": "text"}
    S.append("-- 7) custos: cria ou só preenche campos vazios\ninsert into demanda_custos (demanda_id, " + ", ".join(cols) + ") select m.id, "
             + ", ".join(f"v.{k}::{tipos[k]}" for k in cols) + " from (values\n"
             + vl([[str(linha_de[c["demanda_id"]])] + [q(c[k]) if c[k] is not None else f"null::{tipos[k]}" for k in cols] for c in custos])
             + "\n) v(l, " + ", ".join(cols) + ") join _m m on m.l = v.l\non conflict (demanda_id) do update set "
             + ", ".join(f"{k} = coalesce(demanda_custos.{k}, excluded.{k})" for k in cols) + ";")
    S.append("commit;")
    S.append("-- Resumo (aparece como resultado no SQL Editor)")
    S.append("select acao as \"o que foi feito\", count(*) as quantidade, string_agg(distinct codigo, ', ') as demandas from _sinc group by acao "
             "union all select 'demandas da planilha no sistema', (select count(*) from demandas where importado_linha is not null), null "
             "order by 1;")
    (out / "sincronizacao.sql").write_text("\n".join(S) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ relatório
    rel = openpyxl.Workbook()
    r0 = rel.active
    r0.title = "Resumo"
    cont_sit = collections.Counter(d["situacao"] for d in demandas)
    cont_etapa = collections.Counter(d["etapa"] for d in demandas)
    resumo = [
        ("Demandas importadas", len(demandas)),
        ("Locais (após padronização)", f"{len(locais)} (eram {len(set(contagem_local))})"),
        ("Registros de histórico", len(hist)),
        ("Revisões de MD", len(mds)),
        ("RMS", len(rmss)),
        ("Pendências criadas (Abrir RMS / Elaborar MD)", len(ativs)),
        ("Demandas com custos", len(custos)),
        ("Correções registradas", len(correcoes)),
        ("Itens para conferir", sum(1 for c in correcoes if c[6])),
        ("", ""),
        ("Situação", ""),
        *[(f"  {k}", v) for k, v in cont_sit.most_common()],
        ("", ""),
        ("Etapa", ""),
        *[(f"  {k}", v) for k, v in cont_etapa.most_common()],
    ]
    for a, b in resumo:
        r0.append([a, b])
    r0.column_dimensions["A"].width = 48
    r0.column_dimensions["B"].width = 22

    for nome, filtro in (("Para conferir", lambda c: c[6]), ("Todas as correções", lambda c: True)):
        s = rel.create_sheet(nome)
        s.append(["Linha planilha", "Código no sistema", "Assunto", "Campo", "Valor original", "Valor importado", "Motivo", "Conferir"])
        mapa = {d["linha"]: d["id"] for d in demandas}
        for c in correcoes:
            if filtro(c):
                s.append([c[0], f"DEM-{mapa.get(c[0], 0):04d}", c[1], c[2], c[3], c[4], c[5], c[6]])
        for cell in s[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="DA202C")
        for letra, w in zip("ABCDEFGH", (8, 11, 45, 22, 40, 40, 55, 9)):
            s.column_dimensions[letra].width = w
        for linha in s.iter_rows(min_row=2):
            for cell in linha:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
        s.freeze_panes = "A2"
        s.auto_filter.ref = s.dimensions
    rel.save(out / "relatorio_importacao.xlsx")
    print(f"{len(demandas)} demandas, {len(hist)} históricos, {len(rmss)} RMS, {len(mds)} MDs, {len(custos)} custos, "
          f"{len(ativs)} pendências, {len(locais)} locais, {len(correcoes)} correções "
          f"({sum(1 for c in correcoes if c[6])} para conferir)")


if __name__ == "__main__":
    main(*sys.argv[1:])
