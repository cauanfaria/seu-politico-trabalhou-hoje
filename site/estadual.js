// Deputados Estaduais de SP (Alesp). Dados: dados/alesp.json, dados/painel-alesp.json, dados/perfis/alesp/<id>.json
// Rotas: estadual.html (ranking) e estadual.html#<id> (perfil)
(function () {
let alvo = document.getElementById('conteudo');
// Estados com dados coletados. Para incluir outro: gerar dados/<arq>.json, dados/painel-<arq>.json e dados/perfis/<arq>/ e acrescentar aqui.
const ESTADOS = {
  SP: { nome: 'São Paulo', casa: 'Assembleia Legislativa de São Paulo (Alesp)', sigla: 'Alesp', arq: 'alesp', cmd: 'npm run alesp', fonteNome: 'Portal de Dados Abertos da Alesp', fonteUrl: 'https://www.al.sp.gov.br/dados-abertos/' },
  MG: { nome: 'Minas Gerais', casa: 'Assembleia Legislativa de Minas Gerais (ALMG)', sigla: 'ALMG', arq: 'mg', cmd: 'npm run mg', fonteNome: 'API de Dados Abertos da ALMG', fonteUrl: 'https://dadosabertos.almg.gov.br/' },
};
const hrefDep = (u, id) => (u === 'SP' ? `estadual.html#${id}` : `estadual.html#${u}/${id}`);
const TODOS_ESTADOS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
let uf = 'SP';
function seletorUF() {
  return `<label class="uf-sel"><span>Estado</span><select class="uf-select" aria-label="Estado">${Object.entries(TODOS_ESTADOS)
    .map(([k, n]) => `<option value="${k}"${k === uf ? ' selected' : ''}${ESTADOS[k] ? '' : ' disabled'}>${n}${ESTADOS[k] ? '' : ' (em breve)'}</option>`)
    .join('')}</select></label>`;
}
let base;
let painel;
let ordem = 'presenca';
let limite = 40;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const PALETA = ['#2ed47a', '#ffd43b', '#3d7bff', '#ff8a5b', '#b57bff', '#27c9d8', '#ff6b9a'];
const COR_OUTROS = '#5d7088';

const iniciais = (n) => {
  const p = String(n).replace(/^(Dr\.?|Dra\.?|Prof[ªa]?\.?|Pastor|Delegad[oa]|Agente|Capit[ãa]o|Coronel|Sargento|Cabo)\s+/i, '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const classe = (p) => (p == null ? 'var(--muted)' : p >= 0.85 ? 'var(--bom)' : p >= 0.65 ? 'var(--medio)' : 'var(--baixo)');
const pct = (p) => (p == null ? '-' : fmtPct(p * 100));

function pizza(itens, formatar, centro) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!total) return indisponivel('Sem dados para este gráfico.');
  let acum = 0;
  const cores = itens.map((it, i) => (it.outros ? COR_OUTROS : PALETA[i % PALETA.length]));
  const fatias = itens.map((it, i) => {
    const de = (acum / total) * 100;
    acum += it.valor;
    return `${cores[i]} ${de}% ${(acum / total) * 100}%`;
  });
  return `<div class="pizza-bloco"><div class="pizza" style="background:conic-gradient(${fatias.join(',')})" role="img" aria-label="Gráfico de pizza">
    <div class="pizza-furo"><b>${esc(centro)}</b><small>total</small></div></div>
    <ul class="pizza-leg">${itens
      .map((it, i) => `<li><i style="background:${cores[i]}"></i><span class="pl-nome">${esc(it.rotulo)}</span><span class="pl-val">${formatar(it.valor)} <small>${((it.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></span></li>`)
      .join('')}</ul></div>`;
}
function topComOutros(lista, n = 6) {
  const t = lista.slice(0, n).map((x) => ({ rotulo: x.tipo, valor: x.total }));
  const r = lista.slice(n).reduce((s, x) => s + x.total, 0);
  if (r > 0) t.push({ rotulo: 'Outros', valor: r, outros: true });
  return t;
}

async function carregar() {
  if (base && base._uf === uf) return true;
  base = painel = null;
  try {
    [base, painel] = await Promise.all([lerJson(`../dados/${ESTADOS[uf].arq}.json`), lerJson(`../dados/painel-${ESTADOS[uf].arq}.json`, false)]);
    base._uf = uf;
    return true;
  } catch (e) {
    alvo.innerHTML = `<div class="erro"><b>Não consegui carregar os dados de ${esc(ESTADOS[uf].nome)}.</b><br>Rode <code>${esc(ESTADOS[uf].cmd)}</code> e abra o site com <code>npm run site</code>.<br><small>${esc(e.message)}</small></div>`;
    return false;
  }
}

// ---------------- ranking ----------------
function ordenar(lista) {
  const f = {
    presenca: (a, b) => b.presencaPct - a.presencaPct || b.reunioesPrevistas - a.reunioesPrevistas,
    projetos: (a, b) => b.projetosAno - a.projetosAno || b.proposicoesAno - a.proposicoesAno,
    andaram: (a, b) => (b.andaram ?? 0) - (a.andaram ?? 0) || b.projetosAno - a.projetosAno,
    gastoMenor: (a, b) => a.gastoAno - b.gastoAno,
    gastoMaior: (a, b) => b.gastoAno - a.gastoAno,
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  }[ordem];
  let l = [...lista];
  if (ordem === 'presenca') l = l.filter((d) => d.presencaPct != null && (d.reunioesPrevistas >= 3 || ($('#e-poucas', alvo) && $('#e-poucas', alvo).checked)));
  return l.sort((a, b) => f(a, b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
function valorPrincipal(d) {
  if (ordem === 'andaram') return { txt: `${fmtInt(d.andaram ?? 0)} ${pl(d.andaram ?? 0, 'projeto andou', 'projetos andaram')}`, cor: 'var(--verde)', barra: null };
  if (ordem === 'projetos') return { txt: `${fmtInt(d.projetosAno)} ${pl(d.projetosAno, 'projeto', 'projetos')}`, cor: 'var(--azul)', barra: null };
  if (ordem.startsWith('gasto')) return { txt: fmtBRL(d.gastoAno), cor: 'var(--amarelo)', barra: null };
  if (ordem === 'nome') return { txt: pct(d.presencaPct), cor: classe(d.presencaPct), barra: d.presencaPct };
  return { txt: pct(d.presencaPct), cor: classe(d.presencaPct), barra: d.presencaPct };
}
const temPresenca = () => base.deputados.some((d) => d.reunioesPrevistas > 0);
function linha(d, pos) {
  const v = valorPrincipal(d);
  const reun = !temPresenca() ? 'presença em comissões não disponível' : d.reunioesPrevistas ? `${d.presencas} de ${d.reunioesPrevistas} ${pl(d.reunioesPrevistas, 'reunião', 'reuniões')} de comissão` : 'sem reunião de comissão prevista';
  return `<li class="linha linha-e${pos && pos <= 3 ? ' top' : ''}">
    <div class="pos">${pos ? pos + 'º' : '·'}</div>
    <div class="avatar" aria-hidden="true">${esc(iniciais(d.nome))}</div>
    <div><div class="nome"><a href="${hrefDep(uf, d.id)}">${esc(d.nome)}</a></div>
      <div class="det">${esc(d.partido)} · ${reun} · ${fmtInt(d.projetosAno)} ${pl(d.projetosAno, 'projeto', 'projetos')}${d.andaram != null ? ` (${fmtInt(d.andaram)} ${pl(d.andaram, 'andou', 'andaram')})` : ''} · gabinete ${fmtBRL(d.gastoAno)}</div></div>
    <div class="taxa"><b style="color:${v.cor}">${esc(v.txt)}</b>
      ${v.barra != null ? `<div class="barra"><i style="width:${v.barra * 100}%;background:${v.cor}"></i></div>` : ''}</div>
  </li>`;
}
async function ranking(el, ordemInicial) {
  alvo = el;
  if (ordemInicial) ordem = ordemInicial;
  if (!(await carregar())) return;
  const ano = base.ano;
  const p = painel;
  const partidos = [...new Set(base.deputados.map((d) => d.partido))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  alvo.innerHTML = `
    <div class="seletor-uf">${seletorUF()}</div>
    <div class="aviso-e"><b>O que este ranking mede.</b> A ${esc(ESTADOS[uf].casa)} não publica a presença nem as votações nominais do Plenário em dados abertos.
      O que existe, e é mostrado aqui, é o que a assembleia publica: reuniões e votos em comissões (quando disponíveis), os projetos de autoria e a verba de gabinete. É um retrato parcial do trabalho.${(base.limitacoes || []).length && uf !== 'SP' ? `<br><small>${base.limitacoes.map(esc).join(' ')}</small>` : ''}</div>
    ${p ? `<section class="resumo">
      <div><b>${fmtInt(p.n)}</b><small>deputados estaduais</small></div>
      <div><b>${pct(p.presencaMedia)}</b><small>presença média em comissões, ${ano}</small></div>
      <div><b>${fmtInt(p.projetosAno)}</b><small>projetos apresentados em ${ano}</small></div>
      <div><b>${fmtMi(p.gastoTotal)}</b><small>verba de gabinete em ${ano}</small></div></section>` : ''}
    <section class="filtros">
      <label><span>Buscar</span><input type="search" id="e-busca" placeholder="Nome do deputado" autocomplete="off" /></label>
      <label><span>Partido</span><select id="e-partido"><option value="">Todos</option>${partidos.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label><span>Ordenar por</span><select id="e-ordem">
        <option value="presenca">Presença em comissões (maior primeiro)</option>
        <option value="projetos">Mais projetos apresentados</option>
        <option value="andaram">Mais projetos que andaram (votados em comissão)</option>
        <option value="gastoMenor">Menor gasto de gabinete</option>
        <option value="gastoMaior">Maior gasto de gabinete</option>
        <option value="nome">Nome (A a Z)</option></select></label>
      <label class="check"><input type="checkbox" id="e-poucas" /><span>Incluir quem teve só 1 ou 2 reuniões de comissão no ano (taxa pouco confiável)</span></label>
    </section>
    <p id="e-contagem" class="contagem"></p><ol id="e-lista" class="lista"></ol><button id="e-mais" class="mais" hidden>Mostrar mais</button>
    <section class="metodo"><h2>Como o cálculo é feito</h2>
      <p><b>Presença em comissões.</b> Para cada reunião <i>realizada</i> em ${ano} de uma comissão da qual o deputado era membro efetivo naquela data,
      conta-se se ele consta na lista de presença. A taxa é presenças ÷ reuniões. Presença como suplente em outras comissões não entra na conta.</p>
      <p><b>Projetos.</b> Projetos de lei, de lei complementar, de decreto legislativo, de resolução e propostas de emenda à Constituição de
      que o deputado é autor ou coautor. Requerimentos, indicações e moções não entram nessa contagem.</p>
      <p><b>Projetos que andaram.</b> Projetos de autoria do deputado, apresentados no ano, que já foram votados em alguma comissão. Votar na comissão não é a aprovação final: o projeto ainda pode passar por outras comissões, pelo Plenário e pela sanção do Governador.</p>
      <p><b>Verba de gabinete.</b> Despesas ressarcidas com a verba de gabinete, somadas por deputado no ano.</p>
      <p class="aviso">Comissões podem ter poucas reuniões no ano: uma taxa de 100% pode ser 1 de 1. Veja sempre o número de reuniões ao lado.
      Dados oficiais, atualizados pela ${esc(ESTADOS[uf].sigla)} com atraso.</p>
      <p class="fonte">Fonte: <a href="${esc(ESTADOS[uf].fonteUrl)}">${esc(ESTADOS[uf].fonteNome)}</a> (estado de ${esc(ESTADOS[uf].nome)}). Coletado em ${esc(new Date(base.geradoEm).toLocaleString('pt-BR'))}.</p></section>`;
  if (!temPresenca() && ordem === 'presenca') ordem = 'andaram';
  $('#e-ordem', alvo).value = ordem;
  $('.uf-select', alvo).addEventListener('change', (e) => {
    uf = e.target.value;
    ranking(alvo);
  });
  const desenhar = (reiniciar) => {
    if (reiniciar) limite = 40;
    ordem = $('#e-ordem', alvo).value;
    const q = norm($('#e-busca', alvo).value.trim());
    const par = $('#e-partido', alvo).value;
    const todos = ordenar(base.deputados);
    const pos = new Map();
    let ant = null;
    let n = 0;
    todos.forEach((d, i) => {
      const chave = ordem === 'presenca' ? `${d.presencaPct}|${d.reunioesPrevistas}` : ordem === 'projetos' ? d.projetosAno : ordem === 'andaram' ? d.andaram ?? 0 : ordem.startsWith('gasto') ? d.gastoAno : i;
      if (chave !== ant) {
        n = i + 1;
        ant = chave;
      }
      pos.set(d.id, ordem === 'nome' ? 0 : n);
    });
    const vis = todos.filter((d) => (!q || norm(d.nome).includes(q)) && (!par || d.partido === par));
    $('#e-contagem', alvo).textContent = `${vis.length} ${pl(vis.length, 'deputado', 'deputados')}${ordem === 'presenca' ? ($('#e-poucas', alvo).checked ? ' com reunião de comissão no ano' : ' com 3 ou mais reuniões de comissão no ano') : ''}`;
    $('#e-lista', alvo).innerHTML = vis.slice(0, limite).map((d) => linha(d, pos.get(d.id))).join('');
    $('#e-mais', alvo).hidden = vis.length <= limite;
  };
  ['busca', 'partido', 'ordem', 'poucas'].forEach((id) => $('#e-' + id, alvo).addEventListener(id === 'busca' ? 'input' : 'change', () => desenhar(true)));
  $('#e-mais', alvo).addEventListener('click', () => {
    limite += 40;
    desenhar(false);
  });
  desenhar(true);
}

// ---------------- perfil ----------------
async function perfil(id) {
  alvo = document.getElementById('conteudo');
  alvo.innerHTML = '<p>Carregando…</p>';
  let d;
  try {
    d = await lerJson(`../dados/perfis/${ESTADOS[uf].arq}/${id}.json`);
  } catch {
    alvo.innerHTML = `<div class="erro">Deputado não encontrado. <a href="index.html#estadual">Voltar ao ranking</a></div>`;
    return;
  }
  document.title = `${d.nome} · Deputado Estadual (${uf})`;
  const ano = d.ano;
  const c = d.comissoes;
  const au = d.autoria;
  const ya = au.porAno[ano] || { total: 0, porTipo: {} };
  const proj = Object.entries(ya.porTipo).filter(([k]) => /projeto|proposta/i.test(k)).reduce((s, [, v]) => s + v, 0);
  const gasto = d.despesas[ano];
  const vc = d.votosComissao;

  const blocoComissoes = c.reunioesPrevistas
    ? numeros([
        [pct(c.pct), `presença nas reuniões de comissão em ${ano}`],
        [`${c.presencas} de ${c.reunioesPrevistas}`, pl(c.reunioesPrevistas, 'reunião realizada', 'reuniões realizadas')],
        [fmtInt(c.comoSuplente), `presenças como suplente em outras comissões`],
      ]) +
      `<div class="rolagem"><table class="tabela"><tr><th>Comissão</th><th>Papel</th><th class="n">Presenças</th><th class="n">Reuniões</th></tr>${c.porComissao
        .map((x) => `<tr><td>${esc(x.sigla)} <small>${esc(x.nome !== x.sigla ? x.nome : '')}</small></td><td>${esc(x.papel || '')}</td><td class="n">${x.presencas}</td><td class="n">${x.reunioes}</td></tr>`)
        .join('')}</table></div>`
    : indisponivel(`Sem reunião de comissão realizada em ${ano} em que ele fosse membro efetivo.`);

  const pj = au.projetos || [];
  const liPj = (p) =>
    `<li><b>${esc(p.k)}</b> <span class="fase ${p.andou ? 'fase-comissao' : 'fase-parado'}">${p.andou ? 'Andou: votado em comissão' : 'Parado'}</span> <small>${fmtData(p.data)}</small><br>${esc(p.e)}${p.cm.map((g) => `<small>${esc(g.c)} em ${fmtData(g.d)}: ${g.f} a favor, ${g.x} contra</small>`).join('')}</li>`;
  const blocoAndamento = pj.length
    ? `<h3 class="sub-h">Projetos e andamento</h3><p class="sobre"><b>${fmtInt(pj.filter((p) => p.andou).length)}</b> andaram (foram votados em alguma comissão) e <b>${fmtInt(pj.filter((p) => !p.andou).length)}</b> estão parados ou aguardando.</p>
      <ul class="itens">${pj.filter((p) => p.andou).map(liPj).join('') || '<li>Nenhum projeto andou ainda.</li>'}</ul>
      ${pj.some((p) => !p.andou) ? `<details class="parados"><summary>Ver os ${fmtInt(pj.filter((p) => !p.andou).length)} projetos parados</summary><ul class="itens">${pj.filter((p) => !p.andou).map(liPj).join('')}</ul></details>` : ''}`
    : '';

  const blocoAutoria =
    numeros([
      [fmtInt(proj), `projetos apresentados em ${ano}`],
      [fmtInt(ya.total), `proposições no total em ${ano} (inclui requerimentos, indicações e moções)`],
    ]) +
    (Object.keys(ya.porTipo).length ? tabelaBarras(Object.entries(ya.porTipo).sort((a, b) => b[1] - a[1]).map(([r, v]) => ({ rotulo: r, valor: v })), fmtInt) : '') +
    blocoAndamento +
    (au.recentes.length
      ? `<h3 class="sub-h">Mais recentes</h3><ul class="itens">${au.recentes
          .slice(0, 12)
          .map((p) => `<li><b>${esc(p.rotulo)}</b> <small>${fmtData(p.data)}${p.coautores ? ` · com ${p.coautores} ${pl(p.coautores, 'coautor', 'coautores')}` : ''}</small><br>${esc(p.ementa)}</li>`)
          .join('')}</ul>`
      : '');

  const cats = Object.entries(vc.porCategoria).sort((a, b) => b[1] - a[1]);
  const blocoVotos = vc.total
    ? numeros([[fmtInt(vc.total), `votos dados em comissões em ${ano}`]]) +
      `<div class="cats">${cats.map(([k, v]) => `<span class="cat ${esc(k)}">${esc(k)}: ${fmtInt(v)}</span>`).join('')}</div>` +
      `<ul class="itens">${vc.recentes
        .slice(0, 15)
        .map((v) => `<li class="voto-item"><b class="${esc(v.cat)}">${esc(v.voto)}</b> <small>${fmtData(v.d)} · ${esc(v.comissao)}${v.proposicao ? ' · ' + esc(v.proposicao) : ''}</small>${v.ementa ? esc(v.ementa) : ''}</li>`)
        .join('')}</ul>`
    : indisponivel(`Nenhum voto em comissão registrado em ${ano}.`);

  let blocoGasto = indisponivel(`Sem despesas de gabinete publicadas para ${ano}.`);
  if (gasto) {
    const max = Math.max(...gasto.meses, 1);
    blocoGasto =
      numeros([[fmtBRL(gasto.total), `gastos de gabinete em ${ano}`], [fmtInt(gasto.linhas), 'notas e recibos']]) +
      `<div class="meses">${gasto.meses.map((v, i) => `<div style="height:${(v / max) * 100}%" title="${MESES[i]}: ${fmtBRLc(v)}"></div>`).join('')}</div>
       <div class="rot-meses">${MESES.map((m) => `<span>${m}</span>`).join('')}</div>` +
      `<h3 class="sub-h">Por tipo de despesa</h3>${pizza(topComOutros(gasto.tipos), fmtBRL, fmtBRL(gasto.total))}` +
      `<h3 class="sub-h">Maiores fornecedores</h3>${tabelaBarras(gasto.fornecedores.map((f) => ({ rotulo: f.fornecedor, sub: f.cnpj || '', valor: f.total })), fmtBRL)}`;
  }

  alvo.innerHTML = `
    <a class="voltar" href="index.html#estadual">← Voltar ao ranking</a>
    <div class="cab"><div class="avatar g" aria-hidden="true">${esc(iniciais(d.nome))}</div>
      <div><h1>${esc(d.nome)}</h1>
      <p>${esc(d.partido)} · Deputado(a) Estadual · ${esc(ESTADOS[uf].nome)}</p>
      ${d.base ? `<p>Base eleitoral: ${esc(d.base)}</p>` : ''}
      ${d.email ? `<p><a href="mailto:${esc(d.email)}">${esc(d.email)}</a>${d.sala ? ' · ' + esc(d.sala) : ''}</p>` : ''}</div></div>
    ${d.areas.length ? `<p class="funcao">Áreas de atuação declaradas: ${d.areas.map(esc).join(', ')}.</p>` : ''}
    ${secao('Presença nas comissões', 'Reuniões realizadas das comissões das quais é membro efetivo.', blocoComissoes, `A ${ESTADOS[uf].sigla} não publica a presença no Plenário em dados abertos.`)}
    ${secao('Projetos e propostas', 'O que o deputado apresentou, sozinho ou com outros autores.', blocoAutoria)}
    ${secao('Votos nas comissões', 'Como votou nos pareceres e projetos analisados pelas comissões.', blocoVotos, `As votações do Plenário da ${ESTADOS[uf].sigla} não têm voto nominal nos dados abertos.`)}
    ${secao('Verba de gabinete', 'Despesas ressarcidas com a verba de gabinete.', blocoGasto)}`;
}

// ---------------- painel (usado em painel.html) ----------------
function blocoProjetosPainel() {
  const ds = base.deputados.filter((d) => d.projetosAno != null);
  const proj = ds.reduce((s, d) => s + (d.projetosAno || 0), 0);
  const and = ds.reduce((s, d) => s + (d.andaram || 0), 0);
  if (!proj) return '';
  const comUm = ds.filter((d) => (d.andaram || 0) > 0).length;
  const top = (campo) => ds.filter((d) => (d[campo] || 0) > 0).sort((a, b) => b[campo] - a[campo] || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 10).map((d) => ({ rotulo: d.nome, sub: d.partido, valor: d[campo], href: `estadual.html#${d.id}` }));
  const pp = {};
  for (const d of ds) {
    const g = (pp[d.partido] ??= { n: 0, proj: 0, and: 0 });
    g.n++;
    g.proj += d.projetosAno || 0;
    g.and += d.andaram || 0;
  }
  const tab = Object.entries(pp).sort((a, b) => b[1].and - a[1].and || b[1].proj - a[1].proj);
  return secao('Projetos e o que andou', 'Projetos apresentados no ano. Nas assembleias, "andou" = o projeto já passou por comissão (isso não quer dizer que foi aprovado).',
      numeros([
        [fmtInt(proj), 'projetos apresentados'],
        [fmtInt(and), 'projetos que andaram'],
        [fmtPct((and / proj) * 100), 'do total andou'],
        [fmtInt(comUm), 'deputados com ao menos um projeto que andou'],
      ])) +
    `<div class="dois">${secao('Quem mais teve projetos andando', 'Os 10 deputados com mais projetos votados em comissão.', top('andaram').length ? tabelaBarras(top('andaram'), fmtInt) : indisponivel('Nenhum projeto andou ainda.'))}
    ${secao('Quem mais apresentou projetos', 'Os 10 deputados com mais projetos apresentados.', tabelaBarras(top('projetosAno'), fmtInt), 'Quantidade não é qualidade.')}</div>` +
    secao('Projetos por partido', 'Ordenado pelos projetos que andaram.', `<div class="rolagem"><table class="tabela"><tr><th>Partido</th><th class="n">Deputados</th><th class="n">Projetos</th><th class="n">Andaram</th><th class="n">% que andou</th></tr>${tab.map(([k, g]) => `<tr><td>${esc(k)}</td><td class="n">${g.n}</td><td class="n">${fmtInt(g.proj)}</td><td class="n">${fmtInt(g.and)}</td><td class="n">${g.proj ? fmtPct((g.and / g.proj) * 100) : '-'}</td></tr>`).join('')}</table></div>`);
}
async function painelEstadual(el) {
  alvo = el;
  if (!(await carregar())) return;
  const p = painel;
  if (!p) {
    el.innerHTML = indisponivel('Rode ${ESTADOS[uf].cmd} para gerar o painel dos deputados estaduais.');
    return;
  }
  const ano = p.ano;
  const faixas = Array(10).fill(0);
  const comDados = base.deputados.filter((d) => d.presencaPct != null && d.reunioesPrevistas >= 3);
  comDados.forEach((d) => faixas[Math.min(9, Math.floor(d.presencaPct * 10))]++);
  const maxF = Math.max(...faixas, 1);
  const rot = faixas.map((_, i) => `${i * 10}–${i === 9 ? 100 : i * 10 + 9}%`);
  const porPartido = p.partidos.map((x) => ({ rotulo: x.k, valor: x.gastoMedio * x.n })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
  const topP = porPartido.slice(0, 7);
  const resto = porPartido.slice(7).reduce((s, x) => s + x.valor, 0);
  if (resto > 0) topP.push({ rotulo: 'Outros partidos', valor: resto, outros: true });
  const projP = p.partidos.filter((x) => x.projetos > 0).map((x) => ({ rotulo: x.k, valor: x.projetos })).sort((a, b) => b.valor - a.valor);
  const topJ = projP.slice(0, 7);
  const restoJ = projP.slice(7).reduce((s, x) => s + x.valor, 0);
  if (restoJ > 0) topJ.push({ rotulo: 'Outros partidos', valor: restoJ, outros: true });
  const lista = (itens, f) => tabelaBarras(itens.map((x) => ({ rotulo: x.nome, sub: x.partido, valor: x.v, href: hrefDep(uf, x.id) })), f);
  el.innerHTML = `
    <div class="seletor-uf">${seletorUF()}</div>
    <p class="nota">Dados da ${esc(ESTADOS[uf].sigla)} coletados em ${fmtData(base.geradoEm)}. A ${esc(ESTADOS[uf].sigla)} não publica presença nem votos nominais do Plenário.</p>
    ${secao('Visão geral', `Deputados estaduais de ${ESTADOS[uf].nome} em ${ano}.`, numeros([
      [fmtInt(p.n), 'deputados estaduais'],
      [pct(p.presencaMedia), 'presença média em comissões'],
      [fmtInt(p.projetosAno), `projetos apresentados em ${ano}`],
      [fmtInt(p.proposicoesAno), 'proposições no total (inclui requerimentos, indicações e moções)'],
      [fmtMi(p.gastoTotal), `verba de gabinete em ${ano}`],
      [fmtBRL(p.gastoMedio), 'gasto médio por gabinete'],
    ]), `Fonte: dados abertos da ${ESTADOS[uf].sigla}, tratados por este site.`)}
    ${blocoProjetosPainel()}
    ${secao('Como a presença em comissões se distribui', 'Quantos deputados estão em cada faixa (só quem teve 3 ou mais reuniões previstas).',
      `<div class="hist">${faixas.map((n, i) => `<div style="height:${(n / maxF) * 100}%" title="${rot[i]}: ${n}"><span>${n}</span></div>`).join('')}</div>
       <div class="hist-rot">${rot.map((r) => `<span>${r}</span>`).join('')}</div>`)}
    <div class="dois">
      ${secao('Em que a verba de gabinete é gasta', `Gastos de ${ano} por tipo, somando todos os gabinetes.`, pizza(topComOutros(p.gastoPorTipo), fmtMi, fmtMi(p.gastoTotal)))}
      ${secao('Quanto cada partido gastou', `Parte de cada partido no gasto total de ${ano}.`, pizza(topP, fmtMi, fmtMi(p.gastoTotal)), 'Partidos com mais deputados tendem a gastar mais no total. Veja o gasto médio na tabela.')}
    </div>
    <div class="dois">
      ${secao('Projetos por partido', `Projetos apresentados em ${ano}.`, pizza(topJ, fmtInt, fmtInt(p.projetosAno)), 'Conta projetos de lei, de lei complementar, de decreto legislativo, de resolução e propostas de emenda. Requerimentos, indicações e moções não entram.')}
      ${secao('Maiores gastos de gabinete', `Os 10 deputados com maior gasto em ${ano}.`, lista(p.topGasto, fmtBRL), 'Gasto alto não é irregularidade: a verba cobre divulgação, aluguel, combustível e equipe de apoio, e varia com a base eleitoral.')}
    </div>
    ${secao('Mais projetos apresentados', `Os 10 deputados com mais projetos em ${ano}.`, lista(p.topProjetos, fmtInt), 'Quantidade não mede qualidade nem aprovação: muitos projetos são parecidos entre si ou não chegam a ser votados.')}
    ${secao('Por partido', 'Clique no título de uma coluna para ordenar.', '<div id="est-tab"></div>', 'Partidos pequenos têm poucos deputados, então a média varia mais.')}`;
  $('.uf-select', el).addEventListener('change', (e) => {
    uf = e.target.value;
    painelEstadual(el);
  });
  const cols = [
    { k: 'k', r: 'Partido', txt: true },
    { k: 'n', r: 'Deputados', f: fmtInt },
    { k: 'presenca', r: 'Presença em comissões', f: pct },
    { k: 'gastoMedio', r: 'Gasto médio', f: fmtBRL },
    { k: 'projetos', r: 'Projetos', f: fmtInt },
  ];
  const o = { col: 'n', dir: -1 };
  const tab = () => {
    const l = [...p.partidos].sort((a, b) => (o.col === 'k' ? String(a.k).localeCompare(String(b.k), 'pt-BR') : (a[o.col] ?? -1) - (b[o.col] ?? -1)) * o.dir);
    $('#est-tab', el).innerHTML = `<div class="rolagem"><table class="tabela"><tr>${cols
      .map((c) => `<th class="ord${c.txt ? '' : ' n'}" data-col="${c.k}" ${o.col === c.k ? `aria-sort="${o.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(c.r)}</th>`)
      .join('')}</tr>${l.map((g) => `<tr>${cols.map((c) => `<td${c.txt ? '' : ' class="n"'}>${c.txt ? esc(g.k) : g[c.k] == null ? '-' : c.f(g[c.k])}</td>`).join('')}</tr>`).join('')}</table></div>`;
    $('#est-tab', el).querySelectorAll('th.ord').forEach((th) =>
      th.addEventListener('click', () => {
        if (o.col === th.dataset.col) o.dir *= -1;
        else {
          o.col = th.dataset.col;
          o.dir = th.dataset.col === 'k' ? 1 : -1;
        }
        tab();
      }),
    );
  };
  tab();
}

// troca a ordem do ranking vindo de fora (botoes "Presença" / "Projetos feitos")
function definirOrdem(v) {
  ordem = v;
  const sel = alvo && $('#e-ordem', alvo);
  if (sel) {
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
window.EST = { ranking, painel: painelEstadual, definirOrdem, ordemAtual: () => ordem };

// página de perfil (estadual.html)
if (document.body.dataset.pagina === 'perfil') {
  const abrir = async () => {
    const h = location.hash.replace('#', '');
    if (!h) return location.replace('index.html#estadual');
    const m = h.match(/^([A-Za-z]{2})\/(\d+)$/);
    uf = m ? m[1].toUpperCase() : 'SP';
    const id = m ? m[2] : h;
    alvo = document.getElementById('conteudo');
    await carregar();
    perfil(Number(id));
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', abrir);
  abrir();
}
})();
