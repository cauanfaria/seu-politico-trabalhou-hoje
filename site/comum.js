// Funções compartilhadas pelas páginas Votações e Painel
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtData = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '-');
const fmtPct = (n) => (n == null ? '-' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
const fmtInt = (n) => (n ?? 0).toLocaleString('pt-BR');
const fmtBRL = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtBRLc = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMi = (n) => {
  n = n ?? 0;
  if (n >= 1e9) return `R$ ${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  return fmtBRL(n);
};
// singular/plural: 1 outro, 0 ou 2+ outros
const pl = (n, um, varios) => (n === 1 ? um : varios);
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

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
  MSC: 'Mensagem',
  MSF: 'Mensagem',
  OFS: 'Ofício',
  REQ: 'Requerimento',
  RQS: 'Requerimento',
};
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


// A votação é sobre o TEXTO da proposta (e não sobre requerimento, recurso, destaque ou emenda ligados a ela)?
function ehTextoPrincipal(desc) {
  return /^\s*(Aprovad[oa]s?|Rejeitad[oa]s?|Mantid[oa]s?|Prejudicad[oa]s?),?\s*(em\s+(primeiro|segundo|\d.)\s+turno,?\s*)?(a\s+|o\s+)?(Proposta de Emenda|Projeto de|Medida Provisória|Substitutivo|Subemenda Substitutiva|Subemenda\s+Global|Emenda Aglutinativa)/i.test(desc || '');
}

// Título, explicação e resultado de uma votação (mesma lógica do perfil do parlamentar).
// apelidos: conteúdo de dados/apelidos.json
function descreverVotacao(casa, b, apelidos) {
  const camara = casa === 'camara';
  const desc = b.desc || '';
  const chave = camara ? (b.proposicao ? `${b.proposicao.sigla} ${b.proposicao.numero}/${b.proposicao.ano}` : chaveDoTexto(desc)) : b.i;
  const ap = chave ? apelidos[chave] : null;
  const ementa = camara ? b.proposicao?.ementa ?? '' : b.e ?? '';
  let tituloAuto = desc ? desc.replace(/\s*Sim:.*$/i, '') : 'Votação no Plenário';
  if (chave) {
    const [sigla, ...resto] = String(chave).split(' ');
    tituloAuto = TIPOS[sigla] ? `${TIPOS[sigla]} nº ${resto.join(' ')}` : String(chave);
  }
  const procedimental = camara && !!chave && !ehTextoPrincipal(desc);
  const resultado = camara
    ? /^(Aprovad[oa]|Rejeitad[oa]|Mantid[oa]|Prejudicad[oa])/i.exec(desc)?.[0] ?? ''
    : b.r === 'A'
      ? 'Aprovada'
      : b.r === 'R'
        ? 'Rejeitada'
        : b.r || '';
  const turno = /primeiro turno|1[ºo°] turno/i.test(desc) ? '1º turno' : /segundo turno|2[ºo°] turno/i.test(desc) ? '2º turno' : '';
  const resumo = ap?.resumo ?? ementa ?? '';
  return {
    chave,
    titulo: ap?.titulo ?? tituloAuto,
    resumo: resumo || (camara ? b.ultima || '' : ''),
    guia: ap?.resumo ? '' : procedimental ? 'Votar Sim é ser a favor do pedido votado; votar Não é ser contra.' : 'Votar Sim é ser a favor da proposta; votar Não é ser contra.',
    explicado: !!ap?.resumo,
    ementa,
    procedimental,
    resultado,
    turno,
    textoOficial: desc.replace(/\s+/g, ' ').trim(),
    busca: norm(`${ap?.titulo ?? ''} ${tituloAuto} ${chave ?? ''} ${resumo} ${desc} ${(ap?.busca || []).join(' ')}`),
  };
}

// barra Sim x Não x outros
function barraPlacar(c) {
  const t = c.votaram || 1;
  const outros = Math.max(0, c.votaram - c.sim - c.nao);
  return `<div class="placar-barra" role="img" aria-label="${c.sim} Sim, ${c.nao} Não, ${outros} ${pl(outros, 'outro', 'outros')}">
    <i class="b-sim" style="width:${(c.sim / t) * 100}%"></i><i class="b-nao" style="width:${(c.nao / t) * 100}%"></i><i class="b-out" style="width:${(outros / t) * 100}%"></i></div>`;
}

// blocos de página (mesmo visual do perfil)
function secao(titulo, funcao, corpo, sobre) {
  return `<section class="secao"><h2>${esc(titulo)}</h2><p class="funcao">${funcao}</p>${corpo}${sobre ? `<p class="sobre">${sobre}</p>` : ''}</section>`;
}
const numeros = (itens) =>
  `<div class="numeros">${itens.map(([v, r]) => `<div><b>${v}</b><small>${esc(r)}</small></div>`).join('')}</div>`;
const indisponivel = (t = 'Dado não disponível nesta coleta.') => `<p class="indisponivel">${esc(t)}</p>`;
function tabelaBarras(linhas, formatar) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return `<table class="tabela">${linhas
    .map(
      (l) =>
        `<tr><td>${l.href ? `<a href="${esc(l.href)}">${esc(l.rotulo)}</a>` : esc(l.rotulo)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ''}<div class="mini"><i style="width:${(l.valor / max) * 100}%"></i></div></td><td class="n">${formatar(l.valor)}</td></tr>`,
    )
    .join('')}</table>`;
}
