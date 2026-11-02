// Painel geral. Para incluir outro cargo no futuro: gerar a mesma estrutura em dados/painel.json
// (casas.<id>) e acrescentar uma linha em CARGOS.
const CARGOS = [
  { id: 'camara', rotulo: 'Deputados Federais', singular: 'deputado', plural: 'deputados', parl: 'camara', tem: { gasto: 'cota parlamentar' } },
  { id: 'senado', rotulo: 'Senadores', singular: 'senador', plural: 'senadores', parl: 'senado', tem: { gasto: 'cota parlamentar (CEAPS)' } },
  { id: 'alesp', rotulo: 'Deputados Estaduais', singular: 'deputado', plural: 'deputados', parl: 'alesp', tem: { gasto: 'verba de gabinete' } },
];
const alvo = $('#conteudo');
let painel;
let cargo = CARGOS.find((c) => c.id === location.hash.replace('#', '')) ?? CARGOS[0];
const ordem = { partidos: { col: 'n', dir: -1 }, ufs: { col: 'n', dir: -1 } };

const colunas = [
  { k: 'chave', r: '', txt: true },
  { k: 'n', r: 'Parlamentares', f: fmtInt },
  { k: 'presenca', r: 'Presença', f: fmtPct },
  { k: 'gasto', r: 'Gasto da cota', f: fmtMi },
  { k: 'gastoMedio', r: 'Gasto médio', f: fmtBRL },
  { k: 'emEmp', r: 'Emendas empenhadas', f: fmtMi },
  { k: 'emPago', r: 'Emendas pagas', f: fmtMi },
];

const PALETA = ['#2ed47a', '#ffd43b', '#3d7bff', '#ff8a5b', '#b57bff', '#27c9d8', '#ff6b9a'];
const COR_OUTROS = '#5d7088';
// gráfico de pizza (rosca) com legenda. itens: [{rotulo, valor, outros?}]
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
  return `<div class="pizza-bloco">
    <div class="pizza" style="background:conic-gradient(${fatias.join(',')})" role="img" aria-label="Gráfico de pizza">
      <div class="pizza-furo"><b>${esc(centro)}</b><small>total</small></div></div>
    <ul class="pizza-leg">${itens
      .map(
        (it, i) =>
          `<li><i style="background:${cores[i]}"></i><span class="pl-nome">${esc(it.rotulo)}</span><span class="pl-val">${formatar(it.valor)} <small>${((it.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></span></li>`,
      )
      .join('')}</ul></div>`;
}
function topPartidos(partidos, campo, n = 7) {
  const todos = partidos.filter((p) => p[campo] > 0).sort((a, b) => b[campo] - a[campo]);
  const topo = todos.slice(0, n).map((p) => ({ rotulo: p.chave, valor: p[campo] }));
  const resto = todos.slice(n).reduce((s, p) => s + p[campo], 0);
  if (resto > 0) topo.push({ rotulo: 'Outros partidos', valor: resto, outros: true });
  return topo;
}


// ---------- projetos de lei e andamento (a partir de dados/resumo.json + lista do cargo) ----------
let RESUMO = null;
const RANK = {};
const FASES = [['lei', 'Virou lei'], ['outra', 'Enviado à outra casa'], ['aprovado', 'Aprovado na casa'], ['plenario', 'Pronto para votar no Plenário'], ['comissao', 'Andou em comissão']];
function secaoProjetos(c) {
  const rank = RANK[c.id];
  const res = RESUMO?.[c.id];
  if (!rank || !res) return '';
  const linhas = rank.map((p) => ({ ...p, r: res[String(p.id)] })).filter((p) => p.r && p.r.projetos != null);
  if (!linhas.length) return '';
  const soma = (f) => linhas.reduce((s, p) => s + (f(p) || 0), 0);
  const projetos = soma((p) => p.r.projetos);
  const andaram = soma((p) => p.r.andaram);
  if (!projetos) return '';
  const fases = FASES.map(([k, rot]) => ({ rotulo: rot, valor: soma((p) => p.r.fases?.[k]) })).filter((x) => x.valor > 0);
  const comUm = linhas.filter((p) => p.r.andaram > 0).length;
  const comProj = linhas.filter((p) => p.r.projetos > 0).length;
  const top = (campo) =>
    linhas
      .filter((p) => (p.r[campo] || 0) > 0)
      .sort((a, b) => b.r[campo] - a.r[campo] || String(a.nome).localeCompare(b.nome, 'pt-BR'))
      .slice(0, 10)
      .map((p) => ({ rotulo: p.nome, sub: `${p.partido}-${p.uf}`, valor: p.r[campo], href: `parlamentar.html?casa=${c.parl}&id=${p.id}` }));
  const porPartido = {};
  for (const p of linhas) {
    const g = (porPartido[p.partido] ??= { n: 0, proj: 0, and: 0 });
    g.n++;
    g.proj += p.r.projetos || 0;
    g.and += p.r.andaram || 0;
  }
  const tab = Object.entries(porPartido).sort((a, b) => b[1].and - a[1].and || b[1].proj - a[1].proj);
  return `${secao(
    'Projetos de lei e o que andou',
    `Projetos (PL, PEC, PDL etc.) apresentados em ${RESUMO.ano}. "Andou" = passou da fase de protocolo: foi para comissão, Plenário, outra casa ou virou lei.`,
    numeros([
      [fmtInt(projetos), 'projetos apresentados'],
      [fmtInt(andaram), 'projetos que andaram'],
      [fmtPct((andaram / projetos) * 100), 'do total andou'],
      [fmtInt(comUm), `${c.plural} com ao menos um projeto que andou`],
      [fmtInt(comProj - comUm), `${c.plural} com projetos, mas nenhum andou`],
    ]),
    'Projetos de autoria coletiva (assinados por vários parlamentares) não contam como "andou" no Senado. A situação é a informada pela própria casa.',
  )}
  <div class="dois">
    ${secao('Em que fase estão os que andaram', 'Só projetos que saíram do ponto de partida.', pizza(fases, fmtInt, fmtInt(andaram)))}
    ${secao('Quem mais teve projetos andando', `Os 10 ${c.plural} com mais projetos que andaram.`, top('andaram').length ? tabelaBarras(top('andaram'), fmtInt) : indisponivel('Nenhum projeto andou ainda.'), 'Quem protocola muitos projetos não necessariamente vê muitos andarem.')}
  </div>
  ${secao('Quem mais apresentou projetos', `Os 10 ${c.plural} com mais projetos apresentados.`, tabelaBarras(top('projetos'), fmtInt), 'Quantidade não é qualidade: veja ao lado quantos desses andaram.')}
  ${secao(
    'Projetos por partido',
    'Ordenado pelos projetos que andaram.',
    `<div class="rolagem"><table class="tabela"><tr><th>Partido</th><th class="n">Parlamentares</th><th class="n">Projetos</th><th class="n">Andaram</th><th class="n">% que andou</th></tr>${tab
      .map(([k, g]) => `<tr><td>${esc(k)}</td><td class="n">${g.n}</td><td class="n">${fmtInt(g.proj)}</td><td class="n">${fmtInt(g.and)}</td><td class="n">${g.proj ? fmtPct((g.and / g.proj) * 100) : '-'}</td></tr>`)
      .join('')}</table></div>`,
  )}`;
}

function tabelaGrupo(nome, rotuloChave, lista) {
  const o = ordem[nome];
  const dados = [...lista].sort((a, b) => {
    const va = a[o.col];
    const vb = b[o.col];
    if (o.col === 'chave') return String(va).localeCompare(String(vb), 'pt-BR') * o.dir;
    return ((va ?? -1) - (vb ?? -1)) * o.dir || String(a.chave).localeCompare(String(b.chave), 'pt-BR');
  });
  const cab = colunas
    .map((c) => {
      const sel = o.col === c.k;
      return `<th class="ord${c.txt ? '' : ' n'}" data-tab="${nome}" data-col="${c.k}" ${sel ? `aria-sort="${o.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(c.txt ? rotuloChave : c.r)}</th>`;
    })
    .join('');
  const linhas = dados
    .map(
      (g) =>
        `<tr>${colunas.map((c) => `<td${c.txt ? '' : ' class="n"'}>${c.txt ? esc(g.chave) : g[c.k] == null ? '-' : c.f(g[c.k])}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<div class="rolagem"><table class="tabela"><tr>${cab}</tr>${linhas}</table></div>`;
}

function desenhar() {
  if (cargo.id === 'alesp') {
    alvo.innerHTML = `${abas()}<div id="est-painel"></div>`;
    window.EST.painel($('#est-painel'));
    return;
  }
  const d = painel.casas[cargo.id];
  if (!d) {
    alvo.innerHTML = `${abas()}${indisponivel('Dados deste cargo ainda não foram gerados.')}`;
    return;
  }
  const maxF = Math.max(...d.faixas, 1);
  const rotFaixas = d.faixas.map((_, i) => `${i * 10}–${i === 9 ? 100 : i * 10 + 9}%`);
  const lista = (itens, rotulo) =>
    itens.length
      ? tabelaBarras(
          itens.map((p) => ({ rotulo: p.nome, sub: `${p.partido}-${p.uf}`, valor: p.valor, href: `parlamentar.html?casa=${cargo.parl}&id=${p.id}` })),
          fmtBRL,
        )
      : indisponivel(`Sem ${rotulo} registrados.`);
  alvo.innerHTML = `${abas()}
    <p class="nota">Dados atualizados em ${fmtData(painel.geradoEm)}. Presença calculada sobre ${fmtInt(d.nInc)} ${cargo.plural} com ao menos metade das ${cargo.id === 'camara' ? 'sessões' : 'votações'} do ano (mandatos parciais ficam de fora).</p>
    ${secao(
      'Visão geral',
      `${cargo.rotulo} em exercício no período.`,
      numeros([
        [fmtInt(d.n), cargo.plural],
        [fmtPct(d.presenca), 'presença geral'],
        [fmtPct(d.mediana), 'presença mediana'],
        [fmtInt(d.votacoes.total), pl(d.votacoes.total, 'votação nominal no ano', 'votações nominais no ano')],
        [fmtMi(d.gastoTotal), `gasto da ${cargo.tem.gasto} em ${painel.ano}`],
        [fmtMi(d.emPago), `emendas de ${painel.ano} efetivamente pagas`],
      ]),
      'Presença geral = presenças somadas ÷ presenças possíveis de todos. Mediana = o valor do meio da lista. Fonte: dados abertos oficiais, tratados por este site.',
    )}
    ${secaoProjetos(cargo)}
    ${secao(
      'Como a presença se distribui',
      `Quantos ${cargo.plural} estão em cada faixa de presença.`,
      `<div class="hist">${d.faixas.map((n, i) => `<div style="height:${(n / maxF) * 100}%" title="${rotFaixas[i]}: ${n}"><span>${n}</span></div>`).join('')}</div>
       <div class="hist-rot">${rotFaixas.map((r) => `<span>${r}</span>`).join('')}</div>`,
    )}
    <div class="dois">
      ${secao(
        `Em que a ${cargo.tem.gasto} é gasta`,
        `Gastos de ${painel.ano} por tipo de despesa, somando todos os ${cargo.plural}.`,
        pizza(d.gastoPorTipo, fmtMi, fmtMi(d.gastoTotal)),
        'Fonte: notas e recibos publicados pela ' + (cargo.id === 'camara' ? 'Câmara' : 'Senado') + '.',
      )}
      ${secao(
        'Quanto cada partido gastou',
        `Parte de cada partido no gasto total da cota em ${painel.ano}.`,
        pizza(topPartidos(d.partidos, 'gasto'), fmtMi, fmtMi(d.gastoTotal)),
        'Partidos com mais parlamentares tendem a gastar mais no total. Veja o gasto médio na tabela por partido.',
      )}
    </div>
    <div class="dois">
      ${secao(
        'Para onde vão as emendas',
        `Emendas individuais de ${painel.ano} por área (valor empenhado).`,
        pizza(d.emendasPorArea, fmtMi, fmtMi(d.emEmpenhado)),
        'Considera as principais áreas de cada parlamentar. Empenhado = valor reservado no orçamento, ainda não necessariamente pago.',
      )}
      ${secao(
        'Tipo de emenda',
        '"Transferências Especiais" (as chamadas emendas Pix) vão direto ao município, sem convênio. As de finalidade definida têm destino específico.',
        pizza(d.emendasPorTipo, fmtMi, fmtMi(d.emEmpenhado)),
      )}
    </div>
    ${secao(
      'Por partido',
      'Clique no título de uma coluna para ordenar. A presença de cada partido soma todos os seus parlamentares.',
      tabelaGrupo('partidos', 'Partido', d.partidos),
      'Partidos pequenos têm poucos parlamentares, então a média varia mais. Parlamentares que mudaram de partido contam no partido atual.',
    )}
    ${secao('Por estado', 'Mesma leitura, agrupada por unidade da federação.', tabelaGrupo('ufs', 'Estado', d.ufs))}
    <div class="dois">
      ${secao(
        `Maiores gastos da ${cargo.tem.gasto}`,
        `Os 10 ${cargo.plural} com maior gasto em ${painel.ano}.`,
        lista(d.topGasto, 'gastos'),
        'Gasto alto não é irregularidade: a cota cobre passagens, escritório e divulgação, e varia com a distância do estado a Brasília.',
      )}
      ${secao(
        'Maiores emendas pagas',
        `Os 10 ${cargo.plural} com maior valor pago de emendas individuais de ${painel.ano}.`,
        lista(d.topEmendasPago, 'valores de emendas'),
        'Considera só emendas individuais de 2026 atribuídas pelo nome; o pagamento pode ocorrer ao longo dos anos seguintes. Emendas de bancada, comissão e relator não entram.',
      )}
    </div>`;
  alvo.querySelectorAll('th.ord').forEach((th) =>
    th.addEventListener('click', () => {
      const o = ordem[th.dataset.tab];
      if (o.col === th.dataset.col) o.dir *= -1;
      else {
        o.col = th.dataset.col;
        o.dir = th.dataset.col === 'chave' ? 1 : -1;
      }
      desenhar();
    }),
  );
  alvo.querySelectorAll('.abas a').forEach((a) =>
    a.addEventListener('click', () => {
      cargo = CARGOS.find((c) => c.id === a.dataset.id);
    }),
  );
}
function abas() {
  return `<div class="abas" role="tablist">${CARGOS.map((c) => `<a role="tab" href="#${c.id}" data-id="${c.id}" aria-selected="${c.id === cargo.id}">${esc(c.rotulo)}</a>`).join('')}</div>`;
}

(async function iniciar() {
  try {
    painel = await lerJson('../dados/painel.json');
    RESUMO = await lerJson('../dados/resumo.json', false);
    for (const k of ['camara', 'senado']) RANK[k] = await lerJson(`../dados/${k}.json`, false);
  } catch (e) {
    alvo.innerHTML = `<div class="erro"><b>Não consegui carregar o painel.</b><br>Rode <code>npm run derivados</code> para gerar <code>dados/painel.json</code>.<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  window.addEventListener('hashchange', () => {
    cargo = CARGOS.find((c) => c.id === location.hash.replace('#', '')) ?? cargo;
    desenhar();
  });
  desenhar();
})();
