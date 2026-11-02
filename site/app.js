// Seu político trabalhou hoje? - lógica da página
// Lê dados/camara.json, dados/senado.json e dados/meta.json gerados por scripts/coletar.js

const PAGINA = 50;
const hojeISO = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso do navegador

let meta;
const dados = { camara: [], senado: [] };
let resumo = {}; // dados/resumo.json: gasto e emendas por parlamentar (opcional)
let aba = 'camara';
let limite = PAGINA;

async function carregar() {
  try {
    const [camara, senado, m] = await Promise.all(
      ['camara', 'senado', 'meta'].map((n) =>
        fetch(`../dados/${n}.json`).then((r) => {
          if (!r.ok) throw new Error(`${n}.json: HTTP ${r.status}`);
          return r.json();
        }),
      ),
    );
    dados.camara = camara;
    dados.senado = senado;
    meta = m;
    resumo = (await lerJson('../dados/resumo.json', false)) ?? {};
  } catch (e) {
    $('main').insertAdjacentHTML(
      'afterbegin',
      `<div class="erro"><b>Não consegui carregar os dados.</b><br>
      Abra o site com o Live Server (botão "Go Live" no VS Code) ou com <code>npm run site</code>, e rode
      <code>npm run coletar</code> antes, para gerar a pasta <code>dados</code>.<br><small>${esc(e.message)}</small></div>`,
    );
    return;
  }
  $('#ano').textContent = meta.ano;
  montarMetodologia();
  document.querySelectorAll('.abas button').forEach((b) =>
    b.addEventListener('click', () => {
      aba = b.dataset.aba;
      document.querySelectorAll('.abas button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      const est = aba === 'alesp';
      const modoAtual = document.querySelector('#modo [aria-pressed="true"]')?.dataset.modo ?? 'presenca';
      $('#federal').hidden = est;
      $('#estadual').hidden = !est;
      $('#sub').innerHTML = est
        ? 'Presença em comissões, projetos e gastos de gabinete dos deputados estaduais, a partir dos dados abertos de cada assembleia legislativa. Escolha o estado abaixo.'
        : `Presença de deputados federais e senadores nas votações do Plenário em <span id="ano">${meta.ano}</span>, calculada a partir dos dados oficiais da Câmara e do Senado.`;
      history.replaceState(null, '', est ? '#estadual' : location.pathname);
      if (est) return window.EST.ranking($('#estadual'), { projetos: 'projetos', andaram: 'andaram' }[modoAtual] ?? 'presenca').then(sincronizarModo);
      $('#busca').value = '';
      const novaOrdem = { projetos: 'projetos', andaram: 'andaram' }[modoAtual];
      $('#ordem').value = novaOrdem ?? (['projetos', 'andaram'].includes($('#ordem').value) ? 'desc' : $('#ordem').value);
      preencherFiltros();
      desenhar(true);
      sincronizarModo();
    }),
  );
  document.querySelectorAll('#modo button').forEach((b) => b.addEventListener('click', () => aplicarModo(b.dataset.modo)));
  $('#ordem').addEventListener('change', sincronizarModo);
  $('#estadual').addEventListener('change', (e) => e.target.id === 'e-ordem' && sincronizarModo());
  ['busca', 'uf', 'partido', 'ordem', 'parciais'].forEach((id) =>
    $('#' + id).addEventListener(id === 'busca' ? 'input' : 'change', () => desenhar(true)),
  );
  $('#mais').addEventListener('click', () => {
    limite += PAGINA;
    desenhar(false);
  });
  preencherFiltros();
  desenhar(true);
  if (location.hash === '#estadual') $('#aba-alesp').click();
}

// ---- alternador "Presença (bater ponto)" x "Projetos feitos" ----
function sincronizarModo() {
  const o = aba === 'alesp' ? window.EST.ordemAtual() : $('#ordem').value;
  const pres = o === 'desc' || o === 'asc' || o === 'presenca';
  document.querySelectorAll('#modo button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.modo === 'projetos' ? o === 'projetos' : b.dataset.modo === 'andaram' ? o === 'andaram' : pres)),
  );
}
function aplicarModo(modo) {
  const alvoOrdem = { projetos: 'projetos', andaram: 'andaram' }[modo];
  if (aba === 'alesp') window.EST.definirOrdem(alvoOrdem ?? 'presenca');
  else {
    $('#ordem').value = alvoOrdem ?? 'desc';
    desenhar(true);
  }
  sincronizarModo();
}

function totalDaCasa() {
  return aba === 'camara' ? meta.camara?.totalSessoes ?? 0 : meta.senado?.totalVotacoes ?? 0;
}

function preencherFiltros() {
  const lista = dados[aba];
  const ufs = [...new Set(lista.map((p) => p.uf).filter(Boolean))].sort();
  const partidos = [...new Set(lista.map((p) => p.partido).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#uf').innerHTML = '<option value="">Todos</option>' + ufs.map((u) => `<option>${esc(u)}</option>`).join('');
  $('#partido').innerHTML = '<option value="">Todos</option>' + partidos.map((p) => `<option>${esc(p)}</option>`).join('');
}

function classeTaxa(p) {
  if (p == null) return 'var(--muted)';
  if (p >= 85) return 'var(--bom)';
  if (p >= 65) return 'var(--medio)';
  return 'var(--baixo)';
}

const dinheiro = (p) => resumo[aba]?.[p.id];
const CHAVE = {
  gastoMenor: (p) => dinheiro(p)?.gasto,
  gastoMaior: (p) => dinheiro(p)?.gasto,
  emendas: (p) => dinheiro(p)?.emPago,
  projetos: (p) => dinheiro(p)?.projetos,
  andaram: (p) => dinheiro(p)?.andaram,
};
function ranquear() {
  const total = totalDaCasa();
  const incluirParciais = $('#parciais').checked;
  const ordem = $('#ordem').value;
  // no modo "projetos feitos" entram todos (suplentes também); nos demais vale a regra de presença
  let base = dados[aba].filter((p) => (ordem === 'projetos' || ordem === 'andaram' || p.percentual != null) && (ordem === 'projetos' || ordem === 'andaram' || incluirParciais || p.possiveis >= total * 0.5));
  const chave = CHAVE[ordem];
  if (chave) base = base.filter((p) => chave(p) != null && (ordem !== 'emendas' || chave(p) > 0));
  const nome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  base.sort((a, b) => {
    if (ordem === 'nome') return nome(a, b);
    if (ordem === 'gastoMenor') return chave(a) - chave(b) || nome(a, b);
    if (ordem === 'gastoMaior' || ordem === 'emendas') return chave(b) - chave(a) || nome(a, b);
    if (ordem === 'andaram') return chave(b) - chave(a) || (dinheiro(b)?.projetos ?? 0) - (dinheiro(a)?.projetos ?? 0) || nome(a, b);
    if (ordem === 'projetos') return chave(b) - chave(a) || (dinheiro(b)?.proposicoes ?? 0) - (dinheiro(a)?.proposicoes ?? 0) || nome(a, b);
    return b.percentual - a.percentual || b.possiveis - a.possiveis || nome(a, b);
  });
  // posição considera empates: mesmo valor = mesma posição
  let pos = 0;
  let ant = null;
  base.forEach((p, i) => {
    const k = ordem === 'nome' ? i : chave ? chave(p) : `${p.percentual}|${p.possiveis}`;
    if (k !== ant) {
      pos = i + 1;
      ant = k;
    }
    p._pos = ordem === 'nome' ? 0 : pos;
  });
  return base;
}

function bannerHoje() {
  const lista = dados[aba];
  const datas = lista.map((p) => p.ultimaSessao?.data).filter(Boolean);
  const ultima = datas.sort().at(-1);
  const casa = aba === 'camara' ? 'na Câmara' : 'no Senado';
  const tipo = aba === 'camara' ? 'sessão deliberativa' : 'votação nominal';
  if (!ultima) return `<strong>Sem dados recentes</strong>`;
  if (ultima === hojeISO) {
    const pres = lista.filter((p) => p.ultimaSessao?.data === hojeISO && p.ultimaSessao.presente).length;
    const tot = lista.filter((p) => p.ultimaSessao?.data === hojeISO).length;
    return `<strong>Hoje houve ${tipo} ${casa}.</strong><span>${pres} de ${tot} parlamentares aparecem como presentes.</span>`;
  }
  return `<strong>Hoje (${fmtData(hojeISO)}) não há registro de ${tipo} ${casa}.</strong>
    <span>A última registrada foi em ${fmtData(ultima)}. Os dados oficiais são atualizados depois das sessões.</span>`;
}

function desenhar(reiniciar) {
  if (reiniciar) limite = PAGINA;
  const total = totalDaCasa();
  const ranque = ranquear();

  $('#hoje').innerHTML = bannerHoje();

  const media = ranque.length ? ranque.reduce((s, p) => s + p.percentual, 0) / ranque.length : null;
  const unidade = aba === 'camara' ? 'sessões deliberativas' : 'votações nominais';
  if ($('#ordem').value === 'andaram') {
    const tot = ranque.reduce((s, p) => s + (dinheiro(p)?.andaram ?? 0), 0);
    const apres = ranque.reduce((s, p) => s + (dinheiro(p)?.projetos ?? 0), 0);
    const com = ranque.filter((p) => (dinheiro(p)?.andaram ?? 0) > 0).length;
    $('#resumo').innerHTML = `
    <div><b>${fmtInt(tot)}</b><small>projetos que andaram em ${meta.ano}</small></div>
    <div><b>${apres ? fmtPct((tot / apres) * 100) : '–'}</b><small>dos ${fmtInt(apres)} projetos apresentados</small></div>
    <div><b>${com}</b><small>parlamentares com ao menos 1 que andou</small></div>
    <div><b>${ranque.length}</b><small>parlamentares na lista</small></div>`;
  } else if ($('#ordem').value === 'projetos') {
    const tot = ranque.reduce((s, p) => s + (dinheiro(p)?.projetos ?? 0), 0);
    const com = ranque.filter((p) => (dinheiro(p)?.projetos ?? 0) > 0).length;
    $('#resumo').innerHTML = `
    <div><b>${fmtInt(tot)}</b><small>projetos apresentados em ${meta.ano}</small></div>
    <div><b>${ranque.length}</b><small>parlamentares na lista</small></div>
    <div><b>${com}</b><small>apresentaram ao menos 1 projeto</small></div>
    <div><b>${ranque.length ? (tot / ranque.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–'}</b><small>projetos por parlamentar, em média</small></div>`;
  } else $('#resumo').innerHTML = `
    <div><b>${total}</b><small>${unidade} em ${meta.ano}</small></div>
    <div><b>${ranque.length}</b><small>parlamentares no ranking</small></div>
    <div><b>${fmtPct(media)}</b><small>presença média</small></div>
    <div><b>${fmtData(aba === 'camara' ? meta.camara?.ultimaSessao : meta.senado?.ultimaVotacao)}</b><small>último registro</small></div>`;

  const q = $('#busca').value.trim().toLowerCase();
  const uf = $('#uf').value;
  const partido = $('#partido').value;
  let vis = ranque.filter(
    (p) =>
      (!q || p.nome.toLowerCase().includes(q)) && (!uf || p.uf === uf) && (!partido || p.partido === partido),
  );
  if ($('#ordem').value === 'asc') vis = [...vis].reverse();

  $('#contagem').textContent = `${vis.length} ${pl(vis.length, 'parlamentar', 'parlamentares')} · ${$('#ordem').value === 'nome' ? '' : ' · posição na ordem escolhida, com empates'}`;
  const fatia = vis.slice(0, limite);
  $('#lista').innerHTML = fatia.length
    ? fatia.map(linha).join('')
    : ['projetos', 'andaram'].includes($('#ordem').value) && !Object.values(resumo[aba] ?? {}).some((r) => r[$('#ordem').value] != null)
      ? '<li class="erro">Ainda não há essa contagem para esta casa. Rode <code>npm run andamento</code> (ou <code>npm run perfis</code>, no modo "Projetos feitos") e depois <code>npm run derivados</code>.</li>'
      : '';
  $('#mais').hidden = vis.length <= limite;
}

function linha(p) {
  const un = aba === 'camara' ? 'sessões' : 'votações';
  let detalhe = `${p.presencas} de ${p.possiveis} ${un}`;
  if (aba === 'senado') {
    detalhe += ` · ${p.justificadas} just. · ${p.ausenciasNaoJustificadas} s/ just.`;
  } else {
    detalhe += ` · ${p.ausencias} ${pl(p.ausencias, 'ausência', 'ausências')}`;
  }
  const u = p.ultimaSessao;
  const chip = u
    ? `<span class="chip ${u.presente ? 'ok' : 'falta'}">${u.data === hojeISO ? 'Hoje' : 'Último registro ' + fmtData(u.data)}: ${u.presente ? 'presente' : 'ausente'}</span>`
    : '';
  const cor = classeTaxa(p.percentual);
  const ordem = $('#ordem').value;
  const r = resumo[aba]?.[p.id];
  let destaque = `<b style="color:${cor}">${fmtPct(p.percentual)}</b>
      <div class="barra"><i style="width:${p.percentual}%;background:${cor}"></i></div>`;
  if (ordem === 'andaram') {
    const f = r?.fases ?? {};
    const partes = [f.lei && `${f.lei} virou lei`, f.outra && `${f.outra} ${f.outra === 1 ? 'enviado' : 'enviados'} à outra casa`, f.plenario && `${f.plenario} ${f.plenario === 1 ? 'pronto' : 'prontos'} para o Plenário`, f.comissao && `${f.comissao} ${f.comissao === 1 ? 'andou' : 'andaram'} em comissão`].filter(Boolean);
    destaque = `<b style="color:var(--verde)">${r?.andaram == null ? '–' : fmtInt(r.andaram)}</b><small>${r?.andaram === 1 ? 'projeto andou' : 'projetos andaram'}</small>`;
    detalhe = `${partes.length ? partes.join(' · ') + ' · ' : ''}${fmtInt(r?.projetos ?? 0)} apresentados · presença ${fmtPct(p.percentual)}`;
  } else if (ordem === 'projetos') {
    const tp = Object.entries(r?.tiposProj ?? {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(' · ');
    destaque = `<b style="color:var(--azul)">${r?.projetos == null ? '–' : fmtInt(r.projetos)}</b><small>${r?.projetos === 1 ? 'projeto' : 'projetos'} em ${meta.ano}</small>`;
    detalhe = (tp ? tp + ' · ' : '') + `presença ${fmtPct(p.percentual)}`;
  } else if (ordem === 'gastoMenor' || ordem === 'gastoMaior') destaque = `<b style="color:var(--amarelo)">${fmtBRL(r?.gasto)}</b><small>cota em ${meta.ano}</small>`;
  else if (ordem === 'emendas') destaque = `<b style="color:var(--azul)">${fmtBRL(r?.emPago)}</b><small>emendas pagas em ${meta.ano}</small>`;
  if (ordem === 'gastoMenor' || ordem === 'gastoMaior' || ordem === 'emendas') detalhe += ` · presença ${fmtPct(p.percentual)}`;
  if (ordem === 'projetos' || ordem === 'andaram') {
    const ps = ` · ${p.presencas ?? 0} de ${p.possiveis ?? 0} ${un}`;
    detalhe += ps;
  }
  return `<li class="linha${p._pos > 0 && p._pos <= 3 ? ' top' : ''}">
    <div class="pos">${p._pos ? p._pos + 'º' : '·'}</div>
    <img class="foto" src="${esc(p.foto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
    <div>
      <div class="nome"><a href="parlamentar.html?casa=${aba}&id=${p.id}">${esc(p.nome)}</a></div>
      <div class="det">${esc(p.partido)} · ${esc(p.uf)} · ${detalhe}</div>
      ${chip}
    </div>
    <div class="taxa">
      ${destaque}
    </div>
  </li>`;
}

function montarMetodologia() {
  const gerado = new Date(meta.geradoEm).toLocaleString('pt-BR');
  $('#metodo-texto').innerHTML = `
    <p><b>Câmara dos Deputados.</b> ${esc(meta.metodologia.camara)}</p>
    <p><b>Senado Federal.</b> ${esc(meta.metodologia.senado)}</p>
    <p><b>Projetos que andaram.</b> Projetos de lei, de lei complementar, propostas de emenda à Constituição, decretos legislativos e resoluções
    apresentados no ano e que já foram além do protocolo: andaram em comissão, ficaram prontos para o Plenário, foram enviados à outra casa ou viraram lei.
    Projetos arquivados, apensados a outros ou aguardando relator não contam. Andar não é o mesmo que ser aprovado em definitivo, e a situação
    é a registrada pela própria casa no dia da coleta.</p>
    <p>A taxa de presença é <i>presenças ÷ total possível</i>. Por padrão, o ranking só inclui quem esteve em exercício em
    pelo menos metade das sessões ou votações, para não comparar quem assumiu há pouco com quem está o ano todo.</p>`;
  $('#fonte').innerHTML = `Fontes:
    <a href="${esc(meta.fontes.camara)}">Dados Abertos da Câmara</a> e
    <a href="${esc(meta.fontes.senado)}">Dados Abertos do Senado</a>.
    Período: ${fmtData(meta.periodo.inicio)} a ${fmtData(meta.periodo.fim)}. Dados coletados em ${esc(gerado)}.`;
}

carregar();
