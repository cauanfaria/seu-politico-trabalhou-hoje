// Aba "Deputados Estaduais" da página Trabalhos realizados.
// Lê dados/trabalhos/<arq>.json (projetos apresentados + o que houve nas comissões) e dados/apelidos-<arq>.json (explicações).
(function () {
  const PAGINA = 30;
  const ESTADOS = { SP: { nome: 'São Paulo', arq: 'alesp', casa: 'Alesp' } };
  const TODOS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
  let uf = 'SP';
  let dados = null; // { itens, apelidos, deputados }
  let limite = PAGINA;
  const f = { busca: '', tipo: '', ano: '', expl: '', com: '' };

  const iniciais = (n) => {
    const p = String(n ?? '?').split(/\s+/).filter((x) => x && !/^(de|da|do|das|dos|e)$/i.test(x));
    return ((p[0]?.[0] ?? '?') + (p[1]?.[0] ?? '')).toUpperCase();
  };
  const avatar = (a) => `<span class="av av-sem"><span class="av-ini">${esc(iniciais(a.n))}</span></span>`;
  const seletor = () =>
    `<label class="uf-sel"><span>Estado</span><select id="t-uf" aria-label="Estado">${Object.entries(TODOS)
      .map(([k, n]) => `<option value="${k}"${k === uf ? ' selected' : ''}${ESTADOS[k] ? '' : ' disabled'}>${n}${ESTADOS[k] ? '' : ' (em breve)'}</option>`)
      .join('')}</select></label>`;

  async function carregar() {
    if (dados?.uf === uf) return;
    const e = ESTADOS[uf];
    const [t, ap, base] = await Promise.all([
      lerJson(`../dados/trabalhos/${e.arq}.json`, false),
      lerJson(`../dados/apelidos-${e.arq}.json`, false),
      lerJson(`../dados/${e.arq}.json`, false),
    ]);
    if (!t) throw new Error(`dados/trabalhos/${e.arq}.json não encontrado. Rode: npm run alesp`);
    const apelidos = ap || {};
    const itens = t.itens.map((p) => {
      const a = apelidos[p.k];
      return {
        ...p,
        ano: Number(String(p.k).split('/')[1]),
        explicado: !!a?.resumo,
        titulo: a?.titulo || `${p.t} nº ${p.k.split(' ')[1]}`,
        resumo: a?.resumo || p.e || '',
        busca: norm(`${a?.titulo ?? ''} ${p.k} ${p.t} ${p.e} ${a?.resumo ?? ''} ${(a?.busca || []).join(' ')} ${p.au.map((x) => x.n).join(' ')}`),
      };
    });
    dados = { uf, itens, apelidos, anos: [...new Set(itens.map((x) => x.ano))].sort((a, b) => b - a), tipos: [...new Set(itens.map((x) => x.t))], geradoEm: t.geradoEm };
  }

  const filtrar = () => {
    const q = norm(f.busca).trim();
    return dados.itens.filter(
      (p) =>
        (!f.tipo || p.t === f.tipo) &&
        (!f.ano || String(p.ano) === f.ano) &&
        (!f.expl || (f.expl === 'sim' ? p.explicado : !p.explicado)) &&
        (!f.com || (f.com === 'sim' ? p.cm.length > 0 : f.com === 'div' ? p.cm.some((c) => c.x > 0 || c.o > 0) : p.cm.length === 0)) &&
        (!q || q.split(/\s+/).every((t) => p.busca.includes(t))),
    );
  };

  function comissoes(p) {
    if (!p.cm.length) return '';
    return `<div class="t-com">${p.cm
      .slice(0, 3)
      .map(
        (c) =>
          `<div><b>Comissão ${esc(c.c)}</b> · ${fmtData(c.d)}: <span class="p-sim"><b>${c.f}</b> a favor</span>${c.x ? ` · <span class="p-nao"><b>${c.x}</b> ${pl(c.x, 'contra', 'contra')}</span>` : ''}${c.o ? ` · <b>${c.o}</b> ${pl(c.o, 'outro voto', 'outros votos')}` : ''}${c.contra.length ? `<small>Votaram contra: ${esc(c.contra.join(', '))}${c.x > c.contra.length ? '…' : ''}</small>` : ''}</div>`,
      )
      .join('')}${p.cm.length > 3 ? `<small>e mais ${p.cm.length - 3} ${pl(p.cm.length - 3, 'votação', 'votações')} em comissões</small>` : ''}</div>`;
  }
  function autores(p) {
    const mostrar = p.au.slice(0, 3);
    const mais = p.nAu - mostrar.length;
    const nome = (a) => (a.id ? `<a href="estadual.html#${a.id}">${esc(a.n)}</a>` : esc(a.n));
    return `<div class="autores"><span class="rot">Autoria</span><span class="av-pilha">${mostrar.map(avatar).join('')}</span>
      <span class="aut-nomes">${mostrar.map(nome).join(', ')}${mais > 0 ? ` e mais ${fmtInt(mais)}` : ''}</span></div>`;
  }
  function item(p) {
    return `<li class="v-item"><div class="v-meta"><span>${fmtData(p.d)}</span><span>${esc(p.t)}</span>
      ${p.explicado ? '<span class="sel-res ok">Explicada</span>' : '<span class="sel-res">Sem explicação</span>'}
      ${p.cm.length ? `<span class="sel-res com">Passou por comissão</span>` : ''}</div>
      <div class="v-titulo">${esc(p.titulo)}${p.explicado ? ` <small>(${esc(p.k)})</small>` : ''}</div>
      ${p.resumo ? `<div class="v-resumo">${esc(p.resumo.length > 260 ? p.resumo.slice(0, 259) + '…' : p.resumo)}</div>` : ''}
      ${p.explicado ? '<div class="v-guia">Explicação escrita com ajuda de IA a partir do texto oficial.</div>' : ''}
      ${autores(p)}${comissoes(p)}
      ${p.explicado && p.e ? `<details class="t-oficial"><summary>Texto oficial</summary><p>${esc(p.e)}</p></details>` : ''}</li>`;
  }

  async function desenhar(alvo, abas) {
    alvo.innerHTML = `${abas('estadual')}<p>Carregando…</p>`;
    try {
      await carregar();
    } catch (e) {
      alvo.innerHTML = `${abas('estadual')}<div class="erro"><b>Não consegui carregar os trabalhos.</b><br>${esc(e.message)}</div>`;
      return;
    }
    const total = dados.itens.length;
    const expl = dados.itens.filter((x) => x.explicado).length;
    const comCm = dados.itens.filter((x) => x.cm.length).length;
    const casa = ESTADOS[uf].casa;
    alvo.innerHTML = `${abas('estadual')}
      <div class="seletor-uf">${seletor()}</div>
      <div class="aviso-e"><b>O que aparece aqui.</b> A ${esc(casa)} não publica votações nominais do Plenário em dados abertos. Por isso mostramos os
        <b>projetos apresentados</b> (de lei, de lei complementar, de decreto legislativo, de resolução e propostas de emenda à Constituição) e, quando houve, como os
        membros das comissões votaram. Votar a favor do parecer em comissão não é a aprovação final do projeto.</div>
      ${numeros([
        [fmtInt(total), `projetos apresentados em ${dados.itens.length ? Math.max(...dados.anos) : ''}`],
        [fmtInt(comCm), 'passaram por votação em comissão'],
        [fmtInt(expl), pl(expl, 'já explicado', 'já explicados')],
        [fmtInt(total - expl), 'ainda sem explicação'],
      ])}
      ${secao(
        `Projetos apresentados · ${TODOS[uf]}`,
        'Clique no nome da autoria para ver o perfil do deputado. Use os filtros para ver o que já foi explicado.',
        `<div class="ferramentas">
          <input type="search" id="t-busca" placeholder="Buscar por tema, número ou autor (ex.: escola, 1234/2026)" value="${esc(f.busca)}" />
          <select id="t-expl"><option value="">Explicados e não explicados</option><option value="sim">Só explicados</option><option value="nao">Só sem explicação</option></select>
          <select id="t-tipo"><option value="">Todos os tipos</option>${dados.tipos.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
          <select id="t-ano"><option value="">Todos os anos</option>${dados.anos.map((a) => `<option>${a}</option>`).join('')}</select>
          <select id="t-com"><option value="">Com ou sem votação em comissão</option><option value="sim">Com votação em comissão</option><option value="div">Com voto contrário ou diferente</option><option value="nao">Sem votação em comissão</option></select>
        </div>
        <p class="contagem" id="t-cont"></p><ul class="v-lista" id="t-lista"></ul><button class="mais-itens" id="t-mais" hidden>Mostrar mais</button>`,
        'Autoria: os três primeiros nomes aparecem na lista; projetos de outros poderes (Governador, Mesa Diretora, tribunais) não têm perfil de deputado.',
      )}`;
    for (const k of ['expl', 'tipo', 'ano', 'com']) $('#t-' + k, alvo).value = f[k];
    $('#t-uf', alvo).addEventListener('change', (e) => {
      uf = e.target.value;
      dados = null;
      desenhar(alvo, abas);
    });
    const pintar = () => {
      const l = filtrar();
      $('#t-cont', alvo).textContent = `${fmtInt(l.length)} ${pl(l.length, 'projeto', 'projetos')}${l.length !== total ? ` (de ${fmtInt(total)})` : ''}`;
      $('#t-lista', alvo).innerHTML = l.slice(0, limite).map(item).join('') || '<li class="vazio">Nenhum projeto encontrado.</li>';
      $('#t-mais', alvo).hidden = l.length <= limite;
      $('#t-mais', alvo).textContent = `Mostrar mais (${fmtInt(Math.max(0, l.length - limite))} ${pl(l.length - limite, 'restante', 'restantes')})`;
    };
    $('#t-busca', alvo).addEventListener('input', (e) => {
      f.busca = e.target.value;
      limite = PAGINA;
      pintar();
    });
    for (const k of ['expl', 'tipo', 'ano', 'com'])
      $('#t-' + k, alvo).addEventListener('change', (e) => {
        f[k] = e.target.value;
        limite = PAGINA;
        pintar();
      });
    $('#t-mais', alvo).addEventListener('click', () => {
      limite += PAGINA;
      pintar();
    });
    pintar();
  }
  window.TE = { desenhar };
})();
