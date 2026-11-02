// Página de perfil de um parlamentar: parlamentar.html?casa=camara|senado&id=123
const params = new URLSearchParams(location.search);
const casa = params.get('casa') === 'senado' ? 'senado' : 'camara';
const id = Number(params.get('id'));
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '-');
const fmtPct = (n) => (n == null ? '-' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
const fmtInt = (n) => (n ?? 0).toLocaleString('pt-BR');
const fmtBRL = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const TIPOS = {
  PL: 'Projeto de lei',
  PLP: 'Projeto de lei complementar',
  PEC: 'Proposta de emenda à Constituição',
  PDL: 'Projeto de decreto legislativo',
  PDC: 'Projeto de decreto legislativo',
  PDS: 'Projeto de decreto legislativo',
  PRC: 'Projeto de resolução',
  PRS: 'Projeto de resolução',
  PLN: 'Projeto de lei do Congresso (orçamento)',
  PLV: 'Projeto de lei de conversão',
  MPV: 'Medida provisória',
  RIC: 'Requerimento de informação a ministro',
  PFC: 'Proposta de fiscalização e controle',
  RCP: 'Requerimento de CPI',
  REQ: 'Requerimento',
  RQS: 'Requerimento',
  INC: 'Indicação ao Executivo',
  SUG: 'Sugestão legislativa',
  EMC: 'Emenda',
  EMP: 'Emenda',
  MSF: 'Mensagem',
  OFS: 'Ofício',
};
const GRUPOS = [
  { nome: 'Leis e normas propostas', tipos: ['PL', 'PLP', 'PEC', 'PDL', 'PDC', 'PDS', 'PRC', 'PRS', 'PLN', 'PLV', 'MPV'] },
  { nome: 'Fiscalização do Executivo', tipos: ['RIC', 'PFC', 'RCP'] },
];
const nomeTipo = (s) => (TIPOS[s] ? `${TIPOS[s]} (${s})` : s);

const ROTULO_VOTO_SENADO = {
  AP: 'Ausente (atividade parlamentar)',
  'P-NRV': 'Presente, sem registrar voto',
  'Presidente (art. 51 RISF)': 'Presidiu a votação',
  Votou: 'Votou (voto secreto)',
};
const classeVoto = (t) => (/^sim$/i.test(t) ? 'sim' : /^n[aã]o$/i.test(t) ? 'nao' : 'neutro');

// ---- votos explícitos: título claro, o que a proposta faz, o voto em destaque e o resultado ----
let ANDAMENTO = null; // dados/andamento/{casa}/{id}.json: todos os projetos e a situacao de cada um
let APELIDOS = {}; // dados/apelidos.json: { "PEC 221/2019": { titulo, resumo, busca: [...] } }

const SIGLAS_TEXTO = [
  ['Proposta de Emenda à Constituição', 'PEC'],
  ['Projeto de Lei Complementar', 'PLP'],
  ['Projeto de Lei de Conversão', 'PLV'],
  ['Projeto de Lei', 'PL'],
  ['Projeto de Decreto Legislativo', 'PDL'],
  ['Projeto de Resolução', 'PRC'],
  ['Medida Provisória', 'MPV'],
];
function chaveDoTexto(t) {
  for (const [nome, sigla] of SIGLAS_TEXTO) {
    const m = new RegExp(nome + '\\s+n[ºo°.]*\\s*([\\d.]+),?\\s+de\\s+(\\d{4})', 'i').exec(t || '');
    if (m) return `${sigla} ${m[1].replace(/\./g, '')}/${m[2]}`;
  }
  return null;
}

function veredito(casaVoto, t) {
  if (t == null) return { texto: 'Sem voto registrado', classe: 'sem' };
  if (/^sim$/i.test(t)) return { texto: 'Votou SIM', classe: 'sim' };
  if (/^n[aã]o$/i.test(t)) return { texto: 'Votou NÃO', classe: 'nao' };
  if (/^absten/i.test(t)) return { texto: 'Se absteve', classe: 'neutro' };
  if (/^obstru/i.test(t)) return { texto: 'Obstruiu a votação', classe: 'neutro' };
  if (/^art\.? ?17/i.test(t)) return { texto: 'Presidiu a sessão', classe: 'neutro' };
  if (/^sem tipo/i.test(t)) return { texto: 'Voto não informado', classe: 'sem' };
  if (casaVoto === 'senado') {
    if (t === 'AP') return { texto: 'Ausente (atividade parlamentar)', classe: 'sem' };
    if (t === 'P-NRV') return { texto: 'Presente, sem registrar voto', classe: 'sem' };
    if (t === 'Votou') return { texto: 'Votou (voto secreto)', classe: 'neutro' };
    if (/^presidente/i.test(t)) return { texto: 'Presidiu a votação', classe: 'neutro' };
  }
  return { texto: String(t), classe: 'neutro' };
}

function montarVoto(casaVoto, b, t) {
  const camara = casaVoto === 'camara';
  const desc = b.desc || '';
  const chave = camara ? (b.proposicao ? `${b.proposicao.sigla} ${b.proposicao.numero}/${b.proposicao.ano}` : chaveDoTexto(desc)) : b.i;
  const ap = chave ? APELIDOS[chave] : null;
  const ementa = camara ? b.proposicao?.ementa ?? '' : b.e ?? '';
  // título automático: "Proposta de emenda à Constituição nº 221/2019" (o apelido manual, se houver, tem prioridade)
  let tituloAuto = 'Votação no Plenário';
  if (chave) {
    const [sigla, ...resto] = chave.split(' ');
    tituloAuto = `${TIPOS[sigla] ?? sigla} nº ${resto.join(' ')}`;
  }
  const titulo = ap?.titulo ?? tituloAuto;
  let resumo = ap?.resumo ?? ementa ?? '';
  let oficialSeparado = true;
  if (!resumo) {
    resumo = camara ? b.ultima || desc : desc; // sem ementa: mostra o texto oficial
    oficialSeparado = resumo !== desc;
  }
  const turno = /primeiro turno|1[ºo°] turno/i.test(desc) ? '1º turno' : /segundo turno|2[ºo°] turno/i.test(desc) ? '2º turno' : '';
  const resultado = camara ? /^(Aprovad[oa]|Rejeitad[oa]|Mantid[oa]|Prejudicad[oa])/i.exec(desc)?.[0] ?? '' : '';
  const pl = /Sim:\s*(\d+);\s*N[aã]o:\s*(\d+)/i.exec(desc);
  const ver = veredito(casaVoto, t);
  // Votação procedimental (Câmara): o texto oficial não nomeia a proposta ("Rejeitado o Requerimento",
  // "Mantido o texto"...). A proposta identificada é só o assunto ao qual a votação se liga.
  const procedimental = camara && !!b.proposicao && !chaveDoTexto(desc);
  const acaoVotada = desc.replace(/\s*Sim:.*$/i, '').trim();
  return {
    ...b,
    d: b.d || '',
    t,
    chave,
    titulo,
    resumo,
    turno,
    resultado,
    placar: pl ? { sim: pl[1], nao: pl[2] } : null,
    ver,
    semVoto: t == null,
    procedimental,
    acaoVotada,
    oficial: oficialSeparado && !procedimental ? desc : '',
    _txt: `${titulo} ${chave ?? ''} ${resumo} ${desc} ${ver.texto} ${(ap?.busca || []).join(' ')}`.toLowerCase(),
  };
}

function renderVoto(x) {
  return `<li class="voto${x.semVoto ? ' voto-sem' : ''}">
    <div class="voto-topo"><span class="veredito ${x.ver.classe}">${esc(x.ver.texto)}</span>
      <span class="voto-meta">${fmtData(x.d)}${x.turno ? ' · ' + esc(x.turno) : ''}</span></div>
    ${
      x.procedimental
        ? `<div class="voto-proc"><b>Votação durante a análise de:</b></div>`
        : ''
    }
    <div class="voto-titulo">${esc(x.titulo)}${x.chave && x.titulo !== x.chave ? ` <small>(${esc(x.chave)})</small>` : ''}</div>
    ${x.resumo ? `<div class="voto-resumo">${esc(x.resumo)}</div>` : ''}
    ${
      x.procedimental
        ? `<div class="voto-acao">O que foi votado: <b>${esc(x.acaoVotada)}</b> (requerimento, destaque ou emenda ligada a esta proposta, e não a votação final do texto).</div>`
        : ''
    }
    ${x.resultado ? `<div class="voto-res">Resultado: ${esc(x.resultado)}${x.placar ? ` · ${esc(x.placar.sim)} Sim × ${esc(x.placar.nao)} Não` : ''}</div>` : ''}
    ${x.oficial ? `<details><summary>Texto oficial da votação</summary><p>${esc(x.oficial)}</p></details>` : ''}
  </li>`;
}

async function lerJson(caminho, obrigatorio = true) {
  try {
    const r = await fetch(caminho);
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (obrigatorio) throw e;
    return null;
  }
}

function secao(titulo, funcao, corpo, sobre) {
  return `<section class="secao"><h2>${esc(titulo)}</h2><p class="funcao">${funcao}</p>${corpo}${
    sobre ? `<p class="sobre">${sobre}</p>` : ''
  }</section>`;
}
const numeros = (itens) =>
  `<div class="numeros">${itens.map(([v, r]) => `<div><b>${v}</b><small>${esc(r)}</small></div>`).join('')}</div>`;
const indisponivel = (t = 'Dado não disponível nesta coleta.') => `<p class="indisponivel">${esc(t)}</p>`;

function tabelaBarras(linhas, formatar) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return `<table class="tabela">${linhas
    .map(
      (l) =>
        `<tr><td>${esc(l.rotulo)}<div class="mini"><i style="width:${(l.valor / max) * 100}%"></i></div></td><td class="n">${formatar(l.valor)}</td></tr>`,
    )
    .join('')}</table>`;
}

// lista com busca e "mostrar mais"
function listaFiltravel(chave, itens, renderItem, { placeholder = 'Buscar', filtroExtra = null, mostrarTambem = null } = {}) {
  const idLista = `lst-${chave}`;
  setTimeout(() => {
    const ul = $('#' + idLista);
    if (!ul) return;
    const busca = $('#bus-' + chave);
    const extra = filtroExtra ? $('#ext-' + chave) : null;
    const tambem = mostrarTambem ? $('#tam-' + chave) : null;
    const mais = $('#mais-' + chave);
    let limite = 20;
    const desenhar = () => {
      const q = busca.value.trim().toLowerCase();
      const vis = itens.filter(
        (x) =>
          (!q || x._txt.includes(q)) &&
          (!extra || !extra.checked || filtroExtra.fn(x)) &&
          (!tambem || tambem.checked || !mostrarTambem.ocultar(x)),
      );
      ul.innerHTML = vis.slice(0, limite).map(renderItem).join('') || '<li class="indisponivel">Nada encontrado.</li>';
      mais.hidden = vis.length <= limite;
      mais.textContent = `Mostrar mais (${vis.length - limite} restantes)`;
    };
    busca.addEventListener('input', () => {
      limite = 20;
      desenhar();
    });
    extra?.addEventListener('change', () => {
      limite = 20;
      desenhar();
    });
    tambem?.addEventListener('change', () => {
      limite = 20;
      desenhar();
    });
    mais.addEventListener('click', () => {
      limite += 30;
      desenhar();
    });
    desenhar();
  }, 0);
  return `<div class="ferramentas">
      <input type="search" id="bus-${chave}" placeholder="${esc(placeholder)}" />
      ${filtroExtra ? `<label><input type="checkbox" id="ext-${chave}" /> ${esc(filtroExtra.rotulo)}</label>` : ''}
      ${mostrarTambem ? `<label><input type="checkbox" id="tam-${chave}" /> ${esc(mostrarTambem.rotulo)}</label>` : ''}
    </div>
    <ul class="itens" id="${idLista}"></ul>
    <button class="mais-itens" id="mais-${chave}" hidden></button>`;
}

function graficoMeses(valores) {
  const max = Math.max(...valores, 1);
  return `<div class="meses" title="Gasto por mês">${valores
    .map((v, i) => `<div style="height:${(v / max) * 100}%" title="${MESES[i]}: ${esc(fmtBRL(v))}"></div>`)
    .join('')}</div><div class="rot-meses">${MESES.map((m) => `<span>${m}</span>`).join('')}</div>`;
}

function blocoGastos(d, nomeCota, fonteLink) {
  if (!d) return indisponivel();
  if (!d.documentos) {
    return indisponivel(
      'Nenhum gasto registrado em 2026 nesta fonte. Pode indicar mandato recente, licença ou dados ainda não publicados; não significa necessariamente que não houve gasto.',
    );
  }
  const top = d.porTipo.slice(0, 8).map((t) => ({ rotulo: t.tipo, valor: t.valor }));
  return `${numeros([
    [fmtBRL(d.total), `gasto em ${nomeCota} em 2026`],
    [fmtInt(d.documentos), 'notas e recibos'],
  ])}
    ${top.length ? tabelaBarras(top, fmtBRL) : indisponivel('Nenhum gasto registrado.')}
    ${d.total > 0 ? graficoMeses(d.porMes) : ''}`;
}

// ---------------- posição no ranking ----------------
function posicao(lista, total, alvo) {
  const base = lista
    .filter((p) => p.percentual != null && p.possiveis >= total * 0.5)
    .sort((a, b) => b.percentual - a.percentual || b.possiveis - a.possiveis || a.nome.localeCompare(b.nome, 'pt-BR'));
  let pos = 0;
  let ant = null;
  let achada = null;
  base.forEach((p, i) => {
    const k = `${p.percentual}|${p.possiveis}`;
    if (k !== ant) {
      pos = i + 1;
      ant = k;
    }
    if (p.id === alvo.id) achada = pos;
  });
  return { pos: achada, de: base.length };
}

// ---------------- Câmara ----------------
function paginaCamara(r, p, perfil, catalogo, meta, pos) {
  const d = perfil.detalhe || {};
  const v = perfil.votos;
  const registradosPorId = new Map(v.lista.map((x) => [x.v, x.t]));
  const votos = catalogo
    .map((c) => montarVoto('camara', c, registradosPorId.get(c.id) ?? null))
    .sort((a, b) => b.d.localeCompare(a.d));

  const cargo = `<div class="cargo"><h2>O que faz um Deputado Federal</h2><ul>
      <li>Representa o povo na Câmara dos Deputados.</li>
      <li>Elabora e vota leis federais.</li>
      <li>Discute, altera e vota o Orçamento da União (a proposta é enviada pelo Presidente da República).</li>
      <li>Fiscaliza as ações e os gastos do Poder Executivo.</li></ul></div>`;

  const presenca = secao(
    'Presença',
    'Votar leis exige estar presente. Conta as sessões deliberativas do Plenário.',
    numeros([
      [fmtPct(p.percentual), 'taxa de presença'],
      [`${p.presencas} de ${p.possiveis}`, 'sessões em que esteve presente'],
      [fmtInt(p.ausencias), 'ausências'],
      [pos.pos ? `${pos.pos}º de ${pos.de}` : 'fora do ranking', pos.pos ? 'posição entre os deputados' : 'mandato parcial no período'],
    ]),
    'Fonte: lista oficial de presentes de cada sessão (API de Dados Abertos da Câmara). A API não separa falta justificada de não justificada.',
  );

  const registrados = v.registrados;
  const pctVoto = v.totalNominais ? (registrados / v.totalNominais) * 100 : null;
  const votacoes = secao(
    'Votações nominais',
    'O que foi votado e o que este deputado votou, da mais recente para a mais antiga.',
    `${numeros([
      [fmtInt(registrados), `votos registrados (de ${fmtInt(v.totalNominais)} votações nominais)`],
      [fmtPct(pctVoto), 'das votações nominais do ano'],
      [fmtInt(v.porTipo['Sim']), 'votos "Sim"'],
      [fmtInt(v.porTipo['Não']), 'votos "Não"'],
      [fmtInt((v.porTipo['Abstenção'] || 0) + (v.porTipo['Obstrução'] || 0)), 'abstenções e obstruções'],
    ])}${
      votos.length
        ? listaFiltravel('votos', votos, renderVoto, {
            placeholder: 'Buscar por tema ou número (ex.: 6x1, 221, requerimento)',
            mostrarTambem: { rotulo: 'Mostrar também votações sem voto registrado', ocultar: (x) => x.semVoto },
          })
        : indisponivel('Nenhum voto nominal registrado.')
    }`,
    '"Votou SIM" significa a favor do que estava em votação naquele momento (em destaques e emendas, pode ser manter ou retirar um trecho). "Sem voto registrado" pode ser ausência, licença ou mandato ainda não iniciado. Votações simbólicas não aparecem. Fonte: API de Dados Abertos da Câmara.',
  );

  const a = perfil.autoria;
  const projetos = !a
    ? secao('Projetos e propostas', 'Elaborar leis.', indisponivel())
    : secao(
        'Projetos e propostas',
        'Elaborar leis. Inclui o que o deputado apresentou como autor ou coautor em 2026.',
        `${numeros([
          [fmtInt(a.total), 'propostas em 2026'],
          ...GRUPOS.map((g) => [fmtInt(g.tipos.reduce((s, t) => s + (a.porTipo[t] || 0), 0)), g.nome.toLowerCase()]),
        ])}
        ${tabelaBarras(
          Object.entries(a.porTipo)
            .sort((x, y) => y[1] - x[1])
            .map(([s, n]) => ({ rotulo: nomeTipo(s), valor: n })),
          fmtInt,
        )}
        ${blocoAndamento(ANDAMENTO, (x) => `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${x.id}`)}
        <h3>Mais recentes</h3>
        <ul class="itens">${a.recentes
          .slice(0, 12)
          .map(
            (x) =>
              `<li><a href="https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${x.id}" target="_blank" rel="noopener">${esc(x.sigla)} ${esc(x.numero)}/${esc(x.ano)}</a><small>${esc(x.ementa)}</small></li>`,
          )
          .join('')}</ul>`,
        'Quantidade não é qualidade: um projeto relevante pode valer mais que dezenas de requerimentos. Fonte: API de Dados Abertos da Câmara.',
      );

  const ric = a?.porTipo?.RIC || 0;
  const pfc = a?.porTipo?.PFC || 0;
  const coms = perfil.comissoes || [];
  const fiscal = secao(
    'Fiscalização do Executivo',
    'Pedidos de informação a ministros, propostas de fiscalização e participação em comissões.',
    `${numeros([
      [fmtInt(ric), 'requerimentos de informação (RIC)'],
      [fmtInt(pfc), 'propostas de fiscalização (PFC)'],
      [fmtInt(coms.length), 'comissões e órgãos em 2026'],
    ])}
    ${
      coms.length
        ? `<table class="tabela">${coms
            .map(
              (c) =>
                `<tr><td>${esc(c.nome)} <small>(${esc(c.sigla)})</small></td><td>${esc(c.titulo)}</td><td class="n">${fmtData(c.inicio)}${c.fim ? ' a ' + fmtData(c.fim) : ' em diante'}</td></tr>`,
            )
            .join('')}</table>`
        : indisponivel('Nenhuma comissão registrada em 2026.')
    }`,
    'Fonte: API de Dados Abertos da Câmara. Convocações de ministros e presença em comissões ficam para uma próxima etapa.',
  );

  const orcamento = secao(
    'Orçamento da União',
    'O deputado altera o orçamento por meio de emendas parlamentares.',
    indisponivel('Emendas parlamentares ainda não estão incluídas. Entram na próxima etapa, com dados do Portal da Transparência.'),
  );

  const gastos = secao(
    'Gastos da cota parlamentar',
    'Uso de dinheiro público para as atividades do mandato (passagens, escritório, divulgação, etc.).',
    blocoGastos(perfil.despesas, 'cota parlamentar'),
    'Fonte: API de Dados Abertos da Câmara (valor líquido das despesas).',
  );

  const info = [
    d.nomeCivil && d.nomeCivil !== p.nome ? `Nome civil: ${esc(d.nomeCivil)}` : '',
    d.escolaridade ? `Escolaridade: ${esc(d.escolaridade)}` : '',
    d.situacao ? `Situação: ${esc(d.situacao)}` : '',
  ].filter(Boolean);

  return {
    cab: `<p>${esc(p.partido)} · ${esc(p.uf)} · Deputado(a) Federal</p>${info.map((i) => `<p>${i}</p>`).join('')}
      <p><a href="https://www.camara.leg.br/deputados/${p.id}" target="_blank" rel="noopener">Página oficial na Câmara</a></p>`,
    corpo: cargo + presenca + votacoes + projetos + fiscal + orcamento + gastos,
  };
}

// ---------------- Senado ----------------
function paginaSenado(r, p, perfil, meta, pos) {
  const v = perfil.votos;
  const lista = v.lista.map((x) => montarVoto('senado', x, x.t)).sort((a, b) => b.d.localeCompare(a.d));
  const autoridades = lista.filter((x) => x.a);

  const cargo = `<div class="cargo"><h2>O que faz um Senador</h2><ul>
      <li>Representa os Estados e o Distrito Federal.</li>
      <li>Elabora e vota leis federais.</li>
      <li>Aprova indicações de autoridades, como ministros do STF e diretores do Banco Central.</li>
      <li>Julga crimes de responsabilidade do Presidente da República e de outras autoridades.</li></ul></div>`;

  const presenca = secao(
    'Presença',
    'Presença nas votações nominais do Plenário.',
    numeros([
      [fmtPct(p.percentual), 'taxa de presença'],
      [`${p.presencas} de ${p.possiveis}`, 'votações em que esteve presente'],
      [fmtInt(p.justificadas), 'ausências justificadas (atividade parlamentar)'],
      [fmtInt(p.ausenciasNaoJustificadas), 'ausências sem justificativa registrada'],
      [pos.pos ? `${pos.pos}º de ${pos.de}` : 'fora do ranking', pos.pos ? 'posição entre os senadores' : 'mandato parcial no período'],
    ]),
    'Fonte: registro oficial de cada votação (API de Dados Abertos do Senado). Licenças ficam fora do cálculo.',
  );

  const votacoes = secao(
    'Votações nominais',
    'O que foi votado e o que este senador votou, da mais recente para a mais antiga.',
    `${numeros([
      [fmtInt(v.totalVotacoes), 'votações nominais em 2026'],
      [fmtInt(v.porTipo['Sim']), 'votos "Sim"'],
      [fmtInt(v.porTipo['Não']), 'votos "Não"'],
      [fmtInt(v.porTipo['Abstenção']), 'abstenções'],
    ])}${
      lista.length
        ? listaFiltravel('votos', lista, renderVoto, {
            placeholder: 'Buscar por tema ou número (ex.: 6x1, 221, embaixador)',
            filtroExtra: { rotulo: 'Só indicações de autoridades', fn: (x) => x.a },
          })
        : indisponivel('Nenhuma votação registrada.')
    }`,
    '"Votou SIM" significa a favor do que estava em votação naquele momento. Votos secretos aparecem como "Votou (voto secreto)". Fonte: API de Dados Abertos do Senado.',
  );

  const indicacoes = secao(
    'Indicações de autoridades',
    'O Senado aprova ou rejeita nomes indicados para cargos como ministro de tribunais, diretor do Banco Central e embaixador.',
    autoridades.length
      ? `${numeros([[fmtInt(autoridades.length), 'votações identificadas em 2026']])}<ul class="itens">${autoridades
          .slice(0, 30)
          .map(renderVoto)
          .join('')}</ul>`
      : indisponivel('Nenhuma votação desse tipo identificada no período.'),
    'As votações são identificadas pelo texto da ementa e podem não incluir todas. Votações de indicações costumam ser secretas: nesse caso aparece apenas "Votou".',
  );

  const a = perfil.autoria;
  const projetos = secao(
    'Projetos e propostas',
    'Elaborar leis. Inclui o que o senador apresentou em 2026.',
    !a
      ? indisponivel('A lista de autorias não pôde ser obtida na coleta.')
      : `${numeros([[fmtInt(a.total), 'propostas em 2026']])}
        ${blocoAndamento(ANDAMENTO, (x) => `https://www25.senado.leg.br/web/atividade/materias/-/materia/${x.codigo}`)}
        ${a.total ? tabelaBarras(Object.entries(a.porTipo).sort((x, y) => y[1] - x[1]).map(([s, n]) => ({ rotulo: nomeTipo(s), valor: n })), fmtInt) : ''}
        <ul class="itens">${a.recentes
          .slice(0, 12)
          .map(
            (x) =>
              `<li>${x.codigo ? `<a href="https://www25.senado.leg.br/web/atividade/materias/-/materia/${esc(x.codigo)}" target="_blank" rel="noopener">${esc(x.sigla)} ${esc(x.numero)}/${esc(x.ano)}</a>` : `<b>${esc(x.sigla)} ${esc(x.numero)}/${esc(x.ano)}</b>`}<small>${esc(x.ementa)}</small></li>`,
          )
          .join('')}</ul>`,
    'Quantidade não é qualidade. Fonte: API de Dados Abertos do Senado.',
  );

  const julgamentos = secao(
    'Julgamento de autoridades',
    'O Senado julga o Presidente da República e outras autoridades por crimes de responsabilidade.',
    indisponivel('Esses julgamentos são raros e ainda não estão incluídos. Quando houver, os votos aparecerão aqui.'),
  );

  const gastos = secao(
    'Gastos da cota (CEAPS)',
    'Uso de dinheiro público para as atividades do mandato.',
    blocoGastos(perfil.despesas, 'cota parlamentar'),
    'Fonte: dados abertos administrativos do Senado (valor reembolsado).',
  );

  return {
    cab: `<p>${esc(p.partido)} · ${esc(p.uf)} · Senador(a)</p>
      <p><a href="${esc(perfil.paginaOficial)}" target="_blank" rel="noopener">Página oficial no Senado</a></p>`,
    corpo: cargo + presenca + votacoes + indicacoes + projetos + julgamentos + gastos,
  };
}


// ---------------- andamento dos projetos ----------------
const FASE_ROTULO = {
  lei: 'Virou lei',
  outra: 'Enviado à outra casa',
  aprovado: 'Aprovado na casa',
  plenario: 'Pronto para votar no Plenário',
  comissao: 'Andou em comissão',
  parado: 'Parado',
};
function blocoAndamento(and, urlDe) {
  if (!and || !and.projetos?.length) return '';
  const lista = and.projetos;
  const andaram = lista.filter((x) => x.f !== 'parado' && !x.coletivo);
  const parados = lista.filter((x) => x.f === 'parado');
  const li = (x) =>
    `<li><a href="${esc(urlDe(x))}" target="_blank" rel="noopener">${esc(x.k)}</a> <span class="fase fase-${esc(x.f)}">${esc(FASE_ROTULO[x.f])}</span>${x.coletivo ? ' <span class="fase">autoria coletiva (não conta)</span>' : ''}<small>${esc(x.e)}</small>${x.s ? `<small>Situação: ${esc(x.s)}</small>` : ''}</li>`;
  return `<h3>Projetos de lei e andamento</h3>
    <p class="sobre">Só projetos (PL, PEC, PDL etc.) apresentados em 2026. <b>${fmtInt(andaram.length)}</b> andaram e <b>${fmtInt(parados.length)}</b> estão parados, arquivados ou aguardando. Fonte: situação atual informada pela própria casa.</p>
    ${andaram.length ? `<ul class="itens">${andaram.map(li).join('')}</ul>` : '<p class="sobre">Nenhum projeto deste parlamentar andou ainda.</p>'}
    ${
      parados.length
        ? `<details class="parados"><summary>Ver os ${fmtInt(parados.length)} projetos parados</summary><ul class="itens">${parados.map(li).join('')}</ul></details>`
        : ''
    }`;
}

// ---------------- principal ----------------
async function iniciar() {
  const alvo = $('#conteudo');
  try {
    if (!id) throw new Error('Parlamentar não informado.');
    const [ranking, meta, perfil] = await Promise.all([
      lerJson(`../dados/${casa}.json`),
      lerJson('../dados/meta.json'),
      lerJson(`../dados/perfis/${casa}/${id}.json`),
    ]);
    const p = ranking.find((x) => x.id === id);
    if (!p) throw new Error('Parlamentar não encontrado no ranking.');
    const total = casa === 'camara' ? meta.camara.totalSessoes : meta.senado.totalVotacoes;
    const pos = posicao(ranking, total, p);
    document.title = `${p.nome} · Seu político trabalhou hoje?`;

    APELIDOS = (await lerJson('../dados/apelidos.json', false)) || {};
    ANDAMENTO = await lerJson(`../dados/andamento/${casa}/${id}.json`, false);
    let pagina;
    if (casa === 'camara') {
      const catalogo = (await lerJson('../dados/votacoes-camara.json', false)) || [];
      pagina = paginaCamara(ranking, p, perfil, catalogo, meta, pos);
    } else {
      pagina = paginaSenado(ranking, p, perfil, meta, pos);
    }
    alvo.innerHTML = `<div class="cab">
        <img class="foto-g" src="${esc(p.foto)}" alt="" onerror="this.style.visibility='hidden'" />
        <div><h1>${esc(p.nome)}</h1>${pagina.cab}</div></div>
      ${pagina.corpo}
      <p class="sobre">Dados coletados em ${esc(new Date(perfil.geradoEm).toLocaleString('pt-BR'))}.</p>`;
  } catch (e) {
    alvo.innerHTML = `<div class="erro"><b>Não consegui abrir este perfil.</b><br>${esc(e.message)}<br>
      <small>Rode <code>node scripts/coletar-perfis.js</code> para gerar os perfis e abra o site pelo <code>npm run site</code>.</small></div>`;
  }
}
iniciar();
