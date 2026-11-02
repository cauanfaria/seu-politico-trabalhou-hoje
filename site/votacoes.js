// Página Votações: lista de votações nominais e, para cada uma, quem votou o quê.
// Rota: votacoes.html#camara  |  #senado  |  #camara/<id>  |  #senado/<id>
const PAGINA = 30;
const CASAS = { camara: 'Câmara dos Deputados', senado: 'Senado Federal' };
const NOME_PARL = { camara: 'deputados', senado: 'senadores' };
let APELIDOS = {};
const indice = { camara: null, senado: null };
const gente = { camara: new Map(), senado: new Map() };
let limite = PAGINA;
const filtros = { busca: '', tipo: '', expl: '' };
const alvo = $('#conteudo');

function rota() {
  const [c, id] = location.hash.replace('#', '').split('/');
  return { casa: c === 'senado' ? 'senado' : c === 'estadual' ? 'estadual' : 'camara', id: id || null };
}

async function carregarCasa(casa) {
  if (indice[casa]) return;
  const [idx, rank] = await Promise.all([lerJson(`../dados/votacoes/${casa}.json`, false), lerJson(`../dados/${casa}.json`, false)]);
  if (!idx) throw new Error(`dados/votacoes/${casa}.json não encontrado. Rode: npm run derivados`);
  indice[casa] = idx.map((b) => ({ ...b, ...descreverVotacao(casa, b, APELIDOS) })).sort((a, b) => String(b.d).localeCompare(String(a.d)) || String(b.id).localeCompare(String(a.id)));
  gente[casa] = new Map((rank || []).map((p) => [p.id, p]));
}

const abas = (casa) =>
  `<div class="abas" role="tablist">${Object.keys(CASAS)
    .concat('estadual')
    .map((c) => `<a role="tab" class="aba-link" href="#${c}" aria-selected="${c === casa}">${c === 'camara' ? 'Deputados Federais' : c === 'senado' ? 'Senadores' : 'Deputados Estaduais'}</a>`)
    .join('')}</div>`;


// ---------------- autoria (dono da pauta) e fases ----------------
const iniciais = (n) => {
  const p = String(n ?? '?').split(/\s+/).filter((x) => x && !/^(de|da|do|das|dos|e)$/i.test(x));
  return ((p[0]?.[0] ?? '?') + (p[1]?.[0] ?? '')).toUpperCase();
};
function fotoAutor(a) {
  const p = a.id ? gente[a.c]?.get(a.id) : null;
  if (p?.foto) return p.foto;
  if (a.c === 'camara' && a.id) return `https://www.camara.leg.br/internet/deputado/bandep/${a.id}.jpg`;
  return null;
}
function avatar(a, grande = false) {
  const f = fotoAutor(a);
  const cls = `av${grande ? ' av-g' : ''}`;
  return f
    ? `<span class="${cls}"><span class="av-ini">${esc(iniciais(a.n))}</span><img src="${esc(f)}" alt="" loading="lazy" onerror="this.remove()" /></span>`
    : `<span class="${cls} av-sem"><span class="av-ini">${esc(iniciais(a.n))}</span></span>`;
}
const nomeAutor = (a) => String(a.n ?? '').replace(/^(Deputad[oa]|Senador[a]?)\s+/i, '');
function autoresLinha(v) {
  const lista = v.autores?.lista;
  if (!lista?.length) return '';
  const mostrar = lista.slice(0, 3);
  const mais = (v.autores.total ?? lista.length) - mostrar.length;
  return `<div class="autores"><span class="rot">Autoria</span><span class="av-pilha">${mostrar.map((a) => avatar(a)).join('')}</span>
    <span class="aut-nomes">${esc(mostrar.map(nomeAutor).join(', '))}${mais > 0 ? ` e mais ${fmtInt(mais)}` : ''}</span></div>`;
}
function autoresCards(v) {
  const lista = v.autores?.lista;
  if (!lista?.length) return '';
  const mais = (v.autores.total ?? lista.length) - lista.length;
  return `<div class="aut-cards">${lista
    .map((a) => {
      const p = a.id ? gente[a.c]?.get(a.id) : null;
      const sub = p ? `${p.partido}-${p.uf}` : a.t || '';
      const nome = esc(nomeAutor(a));
      return `<div class="aut-card">${avatar(a, true)}<div>${p ? `<a href="parlamentar.html?casa=${a.c}&id=${a.id}">${nome}</a>` : `<b>${nome}</b>`}<small>${esc(sub)}</small></div></div>`;
    })
    .join('')}</div>${mais > 0 ? `<p class="nota">e mais ${fmtInt(mais)} ${mais === 1 ? 'autor' : 'autores'} que assinam a proposta.</p>` : ''}`;
}
const baseChave = (c) => String(c ?? '').replace(/\s*\(.*\)\s*$/, '');
const nomeCasa = (c) => (c === 'camara' ? 'Câmara' : 'Senado');
function etapas(v) {
  const k = baseChave(v.chave);
  if (!k) return [];
  const todas = [];
  for (const c of ['camara', 'senado']) for (const x of indice[c] ?? []) if (baseChave(x.chave) === k && !x.procedimental) todas.push({ ...x, casa: c });
  return todas.sort((a, b) => String(a.d).localeCompare(String(b.d)) || (a.casa === 'camara' ? -1 : 1));
}
const rotEtapa = (e) => `${nomeCasa(e.casa)}${e.turno ? ' · ' + e.turno : ''}`;
function timeline(v, casa) {
  const et = etapas(v);
  if (et.length < 2) return '';
  const atual = (e) => e.casa === casa && String(e.id) === String(v.id);
  const resumoFases = `<div class="fases-resumo">${et.map((e) => `<span class="fase-chip ${e.casa}${atual(e) ? ' atual' : ''}">${esc(rotEtapa(e))}</span>`).join('<span class="seta">→</span>')}</div>`;
  const passo = (e) => {
    const outros = Math.max(0, e.votaram - e.sim - e.nao);
    const txt = String(e.textoOficial).replace(/\s*Sim:.*$/i, '');
    const res = e.resultado ? `<span class="sel-res ${/^aprov|^mant/i.test(e.resultado) ? 'ok' : /^rejeit/i.test(e.resultado) ? 'no' : ''}">${esc(e.resultado)}</span>` : '';
    const corpo = `<div class="fase-meta"><span>${fmtData(e.d)}</span>${e.turno ? `<b>${esc(e.turno)}</b>` : ''}${res}</div>
      <div class="fase-txt">${esc(txt.length > 150 ? txt.slice(0, 149) + '…' : txt)}</div>
      ${barraPlacar(e)}
      <div class="leg"><span class="p-sim"><b>${fmtInt(e.sim)}</b> Sim</span><span class="p-nao"><b>${fmtInt(e.nao)}</b> Não</span>${outros ? `<span class="p-out"><b>${fmtInt(outros)}</b> ${pl(outros, 'outro', 'outros')}</span>` : ''}<span><b>${fmtInt(e.votaram)}</b> ${pl(e.votaram, 'votou', 'votaram')}</span></div>`;
    return `<li class="fase ${e.casa}${atual(e) ? ' atual' : ''}">${atual(e) ? corpo + '<span class="aqui">você está vendo esta votação</span>' : `<a href="#${e.casa}/${esc(e.id)}">${corpo}<span class="ver">Ver quem votou →</span></a>`}</li>`;
  };
  // uma fase por casa, na ordem em que a proposta passou por elas
  const ordemCasas = [...new Set(et.map((e) => e.casa))];
  const blocos = ordemCasas
    .map((c, i) => {
      const lista = et.filter((e) => e.casa === c);
      const ult = lista[lista.length - 1];
      return `<div class="fase-bloco ${c}">
        <h3><span class="selo-casa ${c}">${c === 'camara' ? 'Deputados · Câmara' : 'Senadores · Senado'}</span><span class="fase-num">${i + 1}ª fase</span></h3>
        <p class="fase-sub">${fmtInt(lista.length)} ${pl(lista.length, 'votação nominal', 'votações nominais')} · ${fmtInt(ult.votaram)} ${c === 'camara' ? 'deputados' : 'senadores'} ${pl(ult.votaram, 'votou', 'votaram')} na última</p>
        <ol class="fases">${lista.map(passo).join('')}</ol></div>`;
    })
    .join('');
  return secao(
    'Por onde a proposta passou',
    'Cada casa do Congresso vota separadamente. Aqui estão as fases desta proposta, com o placar de cada votação. Clique em uma para ver quem votou.',
    `${resumoFases}${blocos}`,
    'Aparecem só votações nominais do Plenário em 2026. Análise em comissões, sanção e promulgação não entram aqui.',
  );
}

// ---------------- lista ----------------
function itemLista(casa, v) {
  const res = v.resultado ? `<span class="sel-res ${/^aprov|^mant/i.test(v.resultado) ? 'ok' : /^rejeit/i.test(v.resultado) ? 'no' : ''}">${esc(v.resultado)}</span>` : '';
  return `<li class="v-item"><a href="#${casa}/${esc(v.id)}">
    <div class="v-meta"><span>${fmtData(v.d)}</span>${v.turno ? `<span>${esc(v.turno)}</span>` : ''}${res}${v.explicado ? '<span class="sel-res ok">Explicada</span>' : '<span class="sel-res">Sem explicação</span>'}${v.procedimental ? '<span class="sel-res">requerimento/destaque</span>' : ''}${v.a ? '<span class="sel-res">indicação de autoridade</span>' : ''}${(() => { const n = etapas(v).length; return !v.procedimental && n > 1 ? `<span class="sel-res fase">${n} etapas votadas</span>` : ''; })()}</div>
    <div class="v-titulo">${esc(v.titulo)}${v.explicado && v.chave ? ` <small>(${esc(v.chave)})</small>` : ''}</div>
    ${v.resumo ? `<div class="v-resumo">${esc(v.resumo.length > 220 ? v.resumo.slice(0, 219) + '…' : v.resumo)}</div>` : ''}
    ${v.guia ? `<div class="v-guia">${esc(v.guia)}</div>` : ''}
    ${autoresLinha(v)}
    ${barraPlacar(v)}
    <div class="leg"><span class="p-sim"><b>${fmtInt(v.sim)}</b> Sim</span><span class="p-nao"><b>${fmtInt(v.nao)}</b> Não</span>${v.votaram - v.sim - v.nao > 0 ? `<span class="p-out"><b>${fmtInt(v.votaram - v.sim - v.nao)}</b> ${pl(v.votaram - v.sim - v.nao, 'outro', 'outros')}</span>` : ''}<span><b>${fmtInt(v.votaram)}</b> ${pl(v.votaram, 'votou', 'votaram')}</span></div>
  </a></li>`;
}

function filtrar(casa) {
  const q = norm(filtros.busca).trim();
  return indice[casa].filter((v) => {
    if (casa === 'camara' && filtros.tipo !== 'todas' && v.procedimental) return false;
    if (casa === 'senado' && filtros.tipo === 'projetos' && v.a) return false;
    if (casa === 'senado' && filtros.tipo === 'autoridades' && !v.a) return false;
    if (filtros.expl && (filtros.expl === 'sim') !== !!v.explicado) return false;
    return !q || q.split(/\s+/).every((t) => v.busca.includes(t));
  });
}

function desenharLista(casa) {
  const total = indice[casa].length;
  const lista = filtrar(casa);
  const opcoes =
    casa === 'camara'
      ? `<option value="">Só votações de propostas (sem requerimentos e destaques)</option><option value="todas">Todas as votações nominais</option>`
      : `<option value="">Todas as votações nominais</option><option value="projetos">Só projetos e propostas</option><option value="autoridades">Só indicações de autoridades</option>`;
  alvo.innerHTML = `${abas(casa)}
    ${numeros([
      [fmtInt(total), pl(total, 'votação nominal', 'votações nominais')],
      [fmtInt(indice[casa].filter((x) => x.explicado).length), pl(indice[casa].filter((x) => x.explicado).length, 'já explicada', 'já explicadas')],
      [fmtInt(indice[casa].filter((x) => !x.explicado).length), 'ainda sem explicação'],
    ])}
    ${secao(
      `Votações nominais · ${CASAS[casa]}`,
      `${fmtInt(total)} ${pl(total, 'votação com voto individual registrado', 'votações com voto individual registrado')}. Clique em uma para ver quem votou Sim, Não e os demais votos.`,
      `<div class="ferramentas">
        <input type="search" id="busca" placeholder="Buscar por tema ou número (ex.: 6x1, 221, aposentadoria)" value="${esc(filtros.busca)}" />
        <select id="expl"><option value="">Explicadas e não explicadas</option><option value="sim">Só explicadas</option><option value="nao">Só sem explicação</option></select>
        <select id="tipo">${opcoes}</select>
      </div>
      <p class="contagem" id="cont"></p>
      <ul class="v-lista" id="lista"></ul>
      <button class="mais-itens" id="mais" hidden>Mostrar mais</button>`,
      'Votações simbólicas (sem registro de cada voto) não aparecem. "Outros" inclui abstenções, obstruções e votos secretos.',
    )}`;
  $('#tipo').value = filtros.tipo;
  $('#expl').value = filtros.expl;
  $('#expl').addEventListener('change', (e) => {
    filtros.expl = e.target.value;
    limite = PAGINA;
    pintar();
  });
  const pintar = () => {
    const l = filtrar(casa);
    $('#cont').textContent = `${fmtInt(l.length)} ${l.length === 1 ? 'votação' : 'votações'}${l.length !== total ? ` (de ${fmtInt(total)})` : ''}`;
    $('#lista').innerHTML = l.slice(0, limite).map((v) => itemLista(casa, v)).join('') || '<li class="vazio">Nenhuma votação encontrada.</li>';
    $('#mais').hidden = l.length <= limite;
    $('#mais').textContent = `Mostrar mais (${fmtInt(Math.max(0, l.length - limite))} ${pl(l.length - limite, 'restante', 'restantes')})`;
  };
  $('#busca').addEventListener('input', (e) => {
    filtros.busca = e.target.value;
    limite = PAGINA;
    pintar();
  });
  $('#tipo').addEventListener('change', (e) => {
    filtros.tipo = e.target.value;
    limite = PAGINA;
    pintar();
  });
  $('#mais').addEventListener('click', () => {
    limite += PAGINA;
    pintar();
  });
  pintar();
}

// ---------------- detalhe ----------------
async function desenharDetalhe(casa, id) {
  const v = indice[casa].find((x) => String(x.id) === String(id));
  if (!v) {
    alvo.innerHTML = `<a class="voltar-v" href="#${casa}">← Todas as votações</a><div class="erro">Votação não encontrada.</div>`;
    return;
  }
  alvo.innerHTML = `<a class="voltar-v" href="#${casa}">← Todas as votações</a><p>Carregando votos…</p>`;
  const arq = await lerJson(`../dados/votacoes/${casa}/${v.id}.json`, false);
  if (!arq) {
    alvo.innerHTML = `<a class="voltar-v" href="#${casa}">← Todas as votações</a><div class="erro">Os votos desta votação não foram encontrados. Rode <code>npm run derivados</code>.</div>`;
    return;
  }
  const grupos = arq.grupos;
  const pessoa = (pid) => gente[casa].get(pid) ?? { id: pid, nome: `Parlamentar nº ${pid}`, partido: '?', uf: '?', semPerfil: true };

  // votos por partido
  const porPartido = new Map();
  for (const [tipo, ids] of Object.entries(grupos)) {
    for (const pid of ids) {
      const p = pessoa(pid);
      const g = porPartido.get(p.partido) ?? { partido: p.partido, sim: 0, nao: 0, outros: 0 };
      if (tipo === 'Sim') g.sim++;
      else if (tipo === 'Não') g.nao++;
      else g.outros++;
      porPartido.set(p.partido, g);
    }
  }
  const partidos = [...porPartido.values()].sort((a, b) => b.sim + b.nao + b.outros - (a.sim + a.nao + a.outros) || a.partido.localeCompare(b.partido));
  const ufs = [...new Set(Object.values(grupos).flat().map((pid) => pessoa(pid).uf))].sort();
  const outros = Object.entries(grupos).filter(([t]) => t !== 'Sim' && t !== 'Não').sort((a, b) => b[1].length - a[1].length);
  const resumo = v.resumo;

  alvo.innerHTML = `<a class="voltar-v" href="#${casa}">← Todas as votações</a>
    <div class="d-cab">
      <p class="v-meta"><span>${CASAS[casa]}</span><span>${fmtData(v.d)}</span>${v.turno ? `<span>${esc(v.turno)}</span>` : ''}${v.resultado ? `<span class="sel-res ${/^aprov|^mant/i.test(v.resultado) ? 'ok' : /^rejeit/i.test(v.resultado) ? 'no' : ''}">${esc(v.resultado)}</span>` : ''}</p>
      <h2>${esc(v.titulo)}${v.explicado && v.chave ? ` <small>(${esc(v.chave)})</small>` : ''}</h2>
      ${resumo ? `<p>${esc(resumo)}</p>` : ''}
      ${v.guia ? `<p class="v-guia">${esc(v.guia)}</p>` : ''}
      ${v.explicado ? '<p class="ia">Explicação escrita com ajuda de IA a partir do texto oficial.</p>' : ''}
      ${v.procedimental ? `<div class="aviso-proc"><b>Atenção:</b> esta votação não foi sobre o texto final. Foi um requerimento, destaque ou emenda ligado à proposta acima. O que foi votado: <b>${esc(v.textoOficial.replace(/\s*Sim:.*$/i, ''))}</b></div>` : ''}
      <details><summary>Texto oficial</summary>${v.ementa ? `<p><b>Ementa:</b> ${esc(v.ementa)}</p>` : ''}<p>${esc(v.textoOficial)}</p></details>
    </div>
    ${v.autores?.lista?.length ? secao('Dono da pauta', 'Quem apresentou esta proposta.', autoresCards(v)) : ''}
    ${timeline(v, casa)}
    ${secao(
      'Resultado',
      'Quantos parlamentares registraram voto.',
      `${numeros([
        [fmtInt(v.votaram), pl(v.votaram, 'votou', 'votaram')],
        [fmtInt(v.sim), pl(v.sim, 'votou Sim', 'votaram Sim')],
        [fmtInt(v.nao), pl(v.nao, 'votou Não', 'votaram Não')],
        [fmtInt(v.votaram - v.sim - v.nao), 'abstenções, obstruções e outros votos'],
      ])}${barraPlacar(v)}`,
      `"Votaram" conta quem registrou Sim, Não, abstenção, obstrução ou voto secreto. Quem não aparece pode ter faltado, estar de licença ou não ser parlamentar na data. Fonte: API de Dados Abertos ${casa === 'camara' ? 'da Câmara' : 'do Senado'}.`,
    )}
    ${secao(
      'Votos por partido',
      'Clique em um partido para filtrar as listas abaixo.',
      `<div class="rolagem"><table class="tabela" id="tab-partidos"><tr><th>Partido</th><th class="n">Sim</th><th class="n">Não</th><th class="n">Outros</th></tr>${partidos
        .map((g) => `<tr class="clic" data-partido="${esc(g.partido)}"><td>${esc(g.partido)}</td><td class="n">${g.sim}</td><td class="n">${g.nao}</td><td class="n">${g.outros}</td></tr>`)
        .join('')}</table></div>`,
    )}
    ${secao(
      'Quem votou o quê',
      `Lista nominal dos ${NOME_PARL[casa]}. Clique em um nome para ver o perfil completo.`,
      `<div class="ferramentas">
        <input type="search" id="f-nome" placeholder="Buscar parlamentar" />
        <select id="f-partido"><option value="">Todos os partidos</option>${partidos.map((g) => `<option>${esc(g.partido)}</option>`).join('')}</select>
        <select id="f-uf"><option value="">Todos os estados</option>${ufs.map((u) => `<option>${esc(u)}</option>`).join('')}</select>
      </div>
      <div class="cols">
        <div class="col-voto sim"><h3>Votaram SIM (<span id="n-sim"></span>)</h3><ul class="nomes" id="l-sim"></ul></div>
        <div class="col-voto nao"><h3>Votaram NÃO (<span id="n-nao"></span>)</h3><ul class="nomes" id="l-nao"></ul></div>
      </div>
      <div id="outros"></div>`,
    )}`;

  const itemNome = (pid) => {
    const p = pessoa(pid);
    return `<li>${p.semPerfil ? esc(p.nome) : `<a href="parlamentar.html?casa=${casa}&id=${p.id}">${esc(p.nome)}</a>`} <small>${esc(p.partido)}-${esc(p.uf)}</small></li>`;
  };
  const pintar = () => {
    const q = norm($('#f-nome').value).trim();
    const fp = $('#f-partido').value;
    const fu = $('#f-uf').value;
    const pass = (pid) => {
      const p = pessoa(pid);
      return (!fp || p.partido === fp) && (!fu || p.uf === fu) && (!q || norm(p.nome).includes(q));
    };
    const lista = (tipo) =>
      (grupos[tipo] || [])
        .filter(pass)
        .sort((a, b) => pessoa(a).nome.localeCompare(pessoa(b).nome, 'pt-BR'));
    for (const [tipo, sel] of [['Sim', 'sim'], ['Não', 'nao']]) {
      const l = lista(tipo);
      $(`#n-${sel}`).textContent = l.length;
      $(`#l-${sel}`).innerHTML = l.map(itemNome).join('') || '<li class="vazio">Ninguém com esses filtros.</li>';
    }
    $('#outros').innerHTML = outros
      .map(([tipo]) => [tipo, lista(tipo)])
      .filter(([, l]) => l.length)
      .map(([tipo, l]) => `<details class="outros"><summary>${esc(tipo)} (${l.length})</summary><ul class="nomes">${l.map(itemNome).join('')}</ul></details>`)
      .join('');
  };
  ['f-nome'].forEach((i) => $('#' + i).addEventListener('input', pintar));
  ['f-partido', 'f-uf'].forEach((i) => $('#' + i).addEventListener('change', pintar));
  $('#tab-partidos').addEventListener('click', (e) => {
    const tr = e.target.closest('tr.clic');
    if (!tr) return;
    $('#f-partido').value = tr.dataset.partido;
    pintar();
    $('#f-partido').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  pintar();
}

// ---------------- principal ----------------
async function desenhar() {
  const { casa, id } = rota();
  if (casa === 'estadual') return window.TE.desenhar(alvo, abas);
  try {
    await carregarCasa(casa);
    await carregarCasa(casa === 'camara' ? 'senado' : 'camara').catch(() => {});
  } catch (e) {
    alvo.innerHTML = `<div class="erro"><b>Não consegui carregar as votações.</b><br>${esc(e.message)}</div>`;
    return;
  }
  if (id) await desenharDetalhe(casa, id);
  else desenharLista(casa);
  if (id) window.scrollTo(0, 0);
}

(async function iniciar() {
  APELIDOS = (await lerJson('../dados/apelidos.json', false)) || {};
  if (!location.hash) filtros.tipo = '';
  window.addEventListener('hashchange', () => {
    limite = PAGINA;
    const { casa } = rota();
    if (casa !== window.__casaAnterior) {
      filtros.tipo = '';
      filtros.busca = '';
      filtros.expl = '';
    }
    window.__casaAnterior = casa;
    desenhar();
  });
  window.__casaAnterior = rota().casa;
  desenhar();
})();
