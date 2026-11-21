
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut
} from 'firebase/auth';
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

(function(){
  "use strict";

  /* ==================== CONSTANTES ==================== */
  const LS_KEY = 'cofrinho-fofo-v1';
  const IDENTITY_KEY = 'cofrinho-identidade-v1';
  const LABEL  = { eu:'Matheus', ela:'Antonella', juntos:'Juntos' };
  const ORDEM  = ['eu','ela','juntos'];

  /* ==================== ELEMENTOS ==================== */
  const telaSetup  = document.getElementById('tela-setup');
  const telaApp    = document.getElementById('tela-app');
  const telaLogin  = document.getElementById('tela-login');
  const btnMatheus = document.getElementById('btnMatheus');
  const btnAntonella = document.getElementById('btnAntonella');
  const btnSair    = document.getElementById('btnSair');
  const btnExportar = document.getElementById('btnExportar');
  const erroLogin  = document.getElementById('erroLogin');
  const syncStatus = document.getElementById('syncStatus');
  const inpTotal   = document.getElementById('inpTotal');
  const inpPrazo   = document.getElementById('inpPrazo');
  const prazoInfo  = document.getElementById('prazoInfo');
  const btnEditarPrazo = document.getElementById('btnEditarPrazo');
  const prazoEdicao = document.getElementById('prazoEdicao');
  const inpNovoPrazo = document.getElementById('inpNovoPrazo');
  const btnCancelarPrazo = document.getElementById('btnCancelarPrazo');
  const btnSalvarPrazo = document.getElementById('btnSalvarPrazo');
  const erroPrazo = document.getElementById('erroPrazo');
  const btnGerar   = document.getElementById('btnGerar');
  const erroBox    = document.getElementById('erro');
  const inpBackup  = document.getElementById('inpBackup');
  const erroBackup = document.getElementById('erroBackup');
  const grid       = document.getElementById('grid');
  const segQuem    = document.getElementById('segQuem');
  const btnReset   = document.getElementById('btnReset');
  const modal      = document.getElementById('modal');
  const btnCancelar= document.getElementById('btnCancelar');
  const btnConfirmar=document.getElementById('btnConfirmar');
  const modalEdicao = document.getElementById('modalEdicao');
  const edicaoTitulo = document.getElementById('edicaoTitulo');
  const edicaoValor = document.getElementById('edicaoValor');
  const btnRestaurarValor = document.getElementById('btnRestaurarValor');
  const edicaoData = document.getElementById('edicaoData');
  const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
  const btnSalvarEdicao = document.getElementById('btnSalvarEdicao');
  const erroEdicao = document.getElementById('erroEdicao');
  const btnAdicionarValor = document.getElementById('btnAdicionarValor');
  const modalAdicionarValor = document.getElementById('modalAdicionarValor');
  const pessoaAdicionarValor = document.getElementById('pessoaAdicionarValor');
  const inpAdicionarValor = document.getElementById('inpAdicionarValor');
  const btnCancelarAdicionarValor = document.getElementById('btnCancelarAdicionarValor');
  const btnConfirmarAdicionarValor = document.getElementById('btnConfirmarAdicionarValor');
  const erroAdicionarValor = document.getElementById('erroAdicionarValor');
  const btnAjustarTotal = document.getElementById('btnAjustarTotal');
  const modalAjustarTotal = document.getElementById('modalAjustarTotal');
  const inpAjustarTotal = document.getElementById('inpAjustarTotal');
  const btnCancelarAjustarTotal = document.getElementById('btnCancelarAjustarTotal');
  const btnConfirmarAjustarTotal = document.getElementById('btnConfirmarAjustarTotal');
  const erroAjustarTotal = document.getElementById('erroAjustarTotal');

  const rGuardado  = document.getElementById('rGuardado');
  const rMeta      = document.getElementById('rMeta');
  const rBarra     = document.getElementById('rBarra');
  const rPct       = document.getElementById('rPct');
  const rFalta     = document.getElementById('rFalta');
  const rCount     = document.getElementById('rCount');

  /* ==================== ESTADO ==================== */
  let state = null; // { totalCents, n, items:[{v, by}], quem }
  let itemEmEdicao = null;
  let longPressTimer = null;
  let longPressStart = null;
  let suppressTapIndex = null;
  let currentUser = null;
  let currentIdentity = null;
  let cloudDocRef = null;
  let stopCloudListener = null;
  let cloudReady = false;
  let pendingCloudWrites = 0;
  let lastCloudState = null;
  let cloudWriteQueue = Promise.resolve();

  try{
    const identidadeSalva = localStorage.getItem(IDENTITY_KEY);
    if(identidadeSalva === 'eu' || identidadeSalva === 'ela') currentIdentity = identidadeSalva;
  }catch(error){
    console.error('Falha ao ler a pessoa escolhida neste navegador.', error);
  }

  /* ==================== UTILITÁRIOS ==================== */
  function fmt(cents){
    const s = (cents/100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return 'R$ ' + s;
  }

  function formatarDataRegistro(dataISO){
    if(typeof dataISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return 'Sem data';
    const partes = dataISO.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function dataLocalISO(data){
    return data.getFullYear() + '-' +
      String(data.getMonth() + 1).padStart(2, '0') + '-' +
      String(data.getDate()).padStart(2, '0');
  }

  function diasAtePrazo(dataISO){
    const partes = dataISO.split('-').map(Number);
    const prazoUTC = Date.UTC(partes[0], partes[1] - 1, partes[2]);
    const hoje = new Date();
    const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.round((prazoUTC - hojeUTC) / 86400000);
  }

  function atualizarPrazo(){
    if(!state || !state.prazo){
      prazoInfo.textContent = 'Prazo final não definido para esta meta.';
      return;
    }

    const dias = diasAtePrazo(state.prazo);
    const dataFormatada = new Date(state.prazo + 'T00:00:00').toLocaleDateString('pt-BR');
    if(dias > 0){
      prazoInfo.textContent = 'Faltam ' + dias + ' dia' + (dias === 1 ? '' : 's') + ' para o prazo final (' + dataFormatada + ').';
    } else if(dias === 0){
      prazoInfo.textContent = 'O prazo final é hoje (' + dataFormatada + ')!';
    } else {
      const atraso = Math.abs(dias);
      prazoInfo.textContent = 'O prazo terminou há ' + atraso + ' dia' + (atraso === 1 ? '' : 's') + ' (' + dataFormatada + ').';
    }

    const diasDisponiveis = Math.max(1, dias);
    const marcados = state.items.filter(function(item){ return !!item.by; }).length;
    if(marcados > diasDisponiveis){
      prazoInfo.textContent += ' ' + marcados + ' quadradinho' + (marcados === 1 ? ' já marcado foi mantido.' : 's já marcados foram mantidos.');
    }
  }

  function agendarAtualizacaoPrazo(){
    const agora = new Date();
    const proximaMeiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 1);
    setTimeout(function(){
      atualizarPrazo();
      agendarAtualizacaoPrazo();
    }, proximaMeiaNoite - agora);
  }

  function parseMoney(str){
    if(!str) return NaN;
    let s = String(str).trim().replace(/[R$\s]/g,'');
    if(!s) return NaN;
    if(s.indexOf(',') >= 0){
      s = s.replace(/\./g,'').replace(',','.');
    } else {
      const p = s.split('.');
      if(p.length > 2) s = s.replace(/\./g,'');
      else if(p.length === 2 && p[1].length === 3) s = s.replace(/\./g,'');
    }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : Math.round(n * 100);
  }

  function baixarBackup(){
    if(!state) return;
    const arquivo = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup-tonteu-cofrinho.json';
    link.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function copiarEstado(value){
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  function normalizarEstado(value){
    if(!value || !Array.isArray(value.items) || !value.items.length || value.items.length > 1000 ||
      !Number.isSafeInteger(value.totalCents) || value.totalCents <= 0 ||
      value.items.some(function(item){
        return !item || !Number.isSafeInteger(item.v) || item.v <= 0 ||
          (item.by != null && ORDEM.indexOf(item.by) < 0);
      })) return null;
    const s = copiarEstado(value);
    if(ORDEM.indexOf(s.quem) < 0) s.quem = 'eu';
    s.items.forEach(function(item){
      if(item.by == null) item.by = null;
      if(typeof item.defaultV !== 'number' && typeof item.v === 'number') item.defaultV = item.v;
    });
    s.n = s.items.length;
    return s;
  }

  function mostrarErroLogin(msg){
    erroLogin.textContent = msg;
    erroLogin.classList.add('visivel');
  }

  function definirStatusSync(msg, erro){
    syncStatus.textContent = msg;
    syncStatus.classList.toggle('erro', !!erro);
  }

  function textoErroFirebase(error){
    const mensagens = {
      'auth/operation-not-allowed':'Habilitem login anônimo em Authentication no Firebase.',
      'auth/too-many-requests':'Muitas tentativas. Aguardem um pouco e tentem novamente.',
      'auth/network-request-failed':'Sem conexão com a internet. Verifiquem a conexão e tentem novamente.',
      'auth/invalid-api-key':'A configuração Firebase está incorreta. Confiram o firebaseConfig.',
      'auth/app-not-authorized':'Este endereço precisa ser autorizado nas configurações de Authentication do Firebase.',
      'permission-denied':'O Firestore recusou o acesso. Confiram as regras de firestore.rules no Firebase.'
    };
    return mensagens[error && error.code] || 'Não foi possível conectar ao Firebase. Verifiquem a configuração e tentem novamente.';
  }

  function salvarLocalmente(){
    try{
      if(state) localStorage.setItem(LS_KEY, JSON.stringify(state));
      else localStorage.removeItem(LS_KEY);
      return true;
    }catch(error){
      console.error('Falha ao salvar o cofrinho neste navegador.', error);
      definirStatusSync('Não foi possível salvar neste navegador.', true);
      return false;
    }
  }

  function mesmoValor(a, b){
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function mesclarAlteracoes(base, local, remoto){
    const resultado = copiarEstado(remoto);
    ['totalCents', 'n', 'prazo', 'quem'].forEach(function(chave){
      if(!mesmoValor(local[chave], base[chave])) resultado[chave] = local[chave];
    });

    if(!mesmoValor(local.items, base.items)){
      if(local.items.length !== base.items.length){
        resultado.items = copiarEstado(local.items);
        resultado.n = local.n;
      } else if(remoto.items.length === base.items.length){
        resultado.items = copiarEstado(remoto.items);
        local.items.forEach(function(itemLocal, indice){
          const itemBase = base.items[indice];
          const itemResultado = resultado.items[indice];
          const chaves = new Set(Object.keys(itemBase).concat(Object.keys(itemLocal)));
          chaves.forEach(function(chave){
            if(mesmoValor(itemLocal[chave], itemBase[chave])) return;
            if(Object.prototype.hasOwnProperty.call(itemLocal, chave)) itemResultado[chave] = itemLocal[chave];
            else delete itemResultado[chave];
          });
        });
      }
    }
    return resultado;
  }

  function carregar(){
    let raw;
    try{
      raw = localStorage.getItem(LS_KEY);
    }catch(error){
      console.error('Falha ao ler o cofrinho salvo neste navegador.', error);
      mostrarErroLogin('Não foi possível ler os dados salvos neste navegador.');
      return null;
    }
    if(!raw) return null;
    try{
      return normalizarEstado(JSON.parse(raw));
    }catch(error){
      console.error('Os dados salvos neste navegador não puderam ser lidos.', error);
      mostrarErroLogin('Os dados salvos neste navegador estão inválidos. Não foram sobrescritos.');
      return null;
    }
  }

  function salvar(){
    if(!state) return;
    salvarLocalmente();
    if(!currentUser || !cloudReady || !cloudDocRef) return;

    const local = copiarEstado(state);
    const base = copiarEstado(lastCloudState);
    const referencia = cloudDocRef;
    pendingCloudWrites++;
    definirStatusSync('Sincronizando...', false);
    cloudWriteQueue = cloudWriteQueue.then(async function(){
      const merged = await runTransaction(db, async function(transaction){
        const snapshot = await transaction.get(referencia);
        const registro = snapshot.exists() ? snapshot.data() : null;
        const remoto = registro && registro.state != null ? normalizarEstado(registro.state) : null;
        if(registro && registro.state != null && !remoto) throw new Error('Os dados do cofrinho na nuvem estão inválidos.');
        const proximo = base && remoto ? mesclarAlteracoes(base, local, remoto) : local;
        transaction.set(referencia, { state:proximo, updatedAt:serverTimestamp() });
        return proximo;
      });
      lastCloudState = copiarEstado(merged);
    }).then(function(){
      pendingCloudWrites--;
      if(pendingCloudWrites === 0 && state){
        if(!mesmoValor(state, lastCloudState)){
          state = copiarEstado(lastCloudState);
          salvarLocalmente();
          renderGrade();
          atualizarQuem();
          atualizarResumo();
        }
        definirStatusSync('Sincronizado com o cofrinho compartilhado.', false);
      }
    }).catch(function(error){
      pendingCloudWrites--;
      console.error('Falha ao sincronizar o cofrinho com o Firestore.', error);
      definirStatusSync(textoErroFirebase(error), true);
    });
  }

  let erroTimer = null;
  function mostrarErro(msg){
    erroBox.textContent = msg;
    erroBox.classList.add('visivel');
    clearTimeout(erroTimer);
    erroTimer = setTimeout(function(){ erroBox.classList.remove('visivel'); }, 3400);
  }

  function arredondarPara50Centavos(valorCents){
    return Math.ceil(valorCents / 50) * 50;
  }

  /* ==================== SORTEIO DOS VALORES ==================== */
  /* Gera N valores cuja soma é EXATAMENTE totalCents. */
  function gerarValores(totalCents, n){
    const passo = totalCents % 50 === 0 ? 50 : 1;
    const totalUnidades = totalCents / passo;
    // valor mínimo por quadradinho (35% da média)
    const min = Math.max(1, Math.floor(totalUnidades / n * 0.35));
    const restante = totalUnidades - min * n;

    // pesos aleatórios com variação (alguns maiores, outros menores)
    const pesos = new Array(n);
    let somaPesos = 0;
    for(let i = 0; i < n; i++){
      const r = Math.random();
      pesos[i] = 0.3 + r * r * 1.6;
      somaPesos += pesos[i];
    }

    // distribuição proporcional + método do maior resto (fecha exato)
    const vals = new Array(n);
    const frac = new Array(n);
    let usado = 0;

    for(let i = 0; i < n; i++){
      const exato = restante * pesos[i] / somaPesos;
      const base  = Math.floor(exato);
      vals[i] = min + base;
      usado += base;
      frac[i] = { i: i, f: exato - base };
    }

    let sobra = restante - usado;
    if(sobra > 0){
      frac.sort(function(a,b){ return b.f - a.f; });
      for(let k = 0; k < sobra; k++){
        vals[frac[k % n].i] += 1;
      }
    }

    // embaralha para os valores grandes não ficarem todos juntos
    for(let i = n - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = vals[i]; vals[i] = vals[j]; vals[j] = t;
    }

    return vals.map(function(valor){ return valor * passo; });
  }

  function redimensionarGrade(novoN){
    const itens = state.items.slice();
    const marcados = itens.filter(function(item){ return !!item.by; });
    const valorMarcado = marcados.reduce(function(soma, item){ return soma + item.v; }, 0);
    const restante = state.totalCents - valorMarcado;
    const alvo = Math.max(novoN, marcados.length + (restante > 0 ? 1 : 0));

    while(itens.length > alvo){
      let indice = itens.length - 1;
      while(indice >= 0 && itens[indice].by) indice--;
      if(indice < 0) break;
      itens.splice(indice, 1);
    }
    while(itens.length < alvo) itens.push({ v:0, defaultV:0, by:null });

    let pendentes = itens.filter(function(item){ return !item.by; });
    const valorMinimoPendente = restante % 50 === 0 ? 50 : 1;
    while(restante < valorMinimoPendente * pendentes.length){
      let indice = itens.length - 1;
      while(indice >= 0 && itens[indice].by) indice--;
      if(indice < 0) break;
      itens.splice(indice, 1);
      pendentes = itens.filter(function(item){ return !item.by; });
    }

    if(pendentes.length){
      const valoresPendentes = gerarValores(restante, pendentes.length);
      let indiceValor = 0;
      itens.forEach(function(item){
        if(!item.by){
          item.v = valoresPendentes[indiceValor++];
          item.defaultV = item.v;
        }
      });
    }

    state.items = itens;
    state.n = itens.length;
  }

  function abrirEdicaoQuadradinho(indice){
    const item = state && state.items[indice];
    if(!item || !item.by) return;

    itemEmEdicao = indice;
    edicaoTitulo.textContent = 'Ajustar quadradinho #' + (indice + 1);
    edicaoValor.value = fmt(item.v);
    edicaoData.value = item.savedOn || '';
    edicaoData.max = dataLocalISO(new Date());
    erroEdicao.textContent = '';
    erroEdicao.classList.remove('visivel');
    modalEdicao.hidden = false;
    edicaoValor.focus();
  }

  function fecharEdicaoQuadradinho(){
    modalEdicao.hidden = true;
    itemEmEdicao = null;
    suppressTapIndex = null;
    erroEdicao.classList.remove('visivel');
  }

  function cancelarPressaoLonga(){
    if(longPressTimer !== null){
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressStart = null;
  }

  /* ==================== RENDER ==================== */
  function renderGrade(){
    const partes = new Array(state.items.length);
    for(let i = 0; i < state.items.length; i++){
      const it = state.items[i];
      partes[i] =
        '<div class="day' + (it.by ? ' done ' + it.by : '') + '" data-i="' + i + '" role="button" tabindex="0">' +
          '<span class="num">' + (i + 1) + '</span>' +
          '<span class="val">' + fmt(it.v) + '</span>' +
          '<span class="tag">' + (it.by ? LABEL[it.by] : '') + '</span>' +
          '<span class="date">' + (it.by ? formatarDataRegistro(it.savedOn) : '') + '</span>' +
        '</div>';
    }
    grid.innerHTML = partes.join('');
  }

  function atualizarCard(i){
    const el = grid.children[i];
    if(!el) return;
    const it = state.items[i];
    el.className = 'day' + (it.by ? ' done ' + it.by : '');
    const tag = el.querySelector('.tag');
    if(tag) tag.textContent = it.by ? LABEL[it.by] : '';
    const date = el.querySelector('.date');
    if(date) date.textContent = it.by ? formatarDataRegistro(it.savedOn) : '';
  }

  function atualizarResumo(){
    atualizarPrazo();
    const total = state.totalCents;
    let guardado = 0, feitos = 0;
    const stats = {
      eu: { total:0, count:0, valueId:'dashMatheus', infoId:'dashMatheusInfo', barId:'dashMatheusBar' },
      ela: { total:0, count:0, valueId:'dashAntonella', infoId:'dashAntonellaInfo', barId:'dashAntonellaBar' },
      juntos: { total:0, count:0, valueId:'dashJuntos', infoId:'dashJuntosInfo', barId:'dashJuntosBar' }
    };

    for(let i = 0; i < state.items.length; i++){
      const it = state.items[i];
      if(it.by){
        guardado += it.v;
        feitos++;
        if(stats[it.by]){
          stats[it.by].total += it.v;
          stats[it.by].count++;
        }
      }
    }

    ORDEM.forEach(function(quem){
      const stat = stats[quem];
      const share = guardado > 0 ? stat.total / guardado * 100 : 0;
      document.getElementById(stat.valueId).textContent = fmt(stat.total);
      document.getElementById(stat.infoId).textContent =
        stat.count + ' quadradinho' + (stat.count === 1 ? '' : 's') + ' · ' + share.toFixed(1) + '% do guardado';
      document.getElementById(stat.barId).style.width = share.toFixed(1) + '%';
    });

    const falta = total - guardado;
    const pct   = total > 0 ? (guardado / total) * 100 : 0;
    const pctVis = guardado >= total ? 100 : Math.floor(pct);

    rGuardado.textContent = fmt(guardado);
    rMeta.textContent     = fmt(total);
    rBarra.style.width    = Math.min(100, pct).toFixed(2) + '%';
    rPct.textContent      = pctVis + '%';
    rFalta.textContent    = falta > 0 ? 'Faltam ' + fmt(falta) : 'Meta concluída! 🎉';
    rCount.textContent    = feitos + '/' + state.items.length;
  }

  function atualizarQuem(){
    const botoes = segQuem.querySelectorAll('button');
    for(let i = 0; i < botoes.length; i++){
      botoes[i].classList.toggle('ativo', botoes[i].dataset.quem === state.quem);
    }
  }

  /* ==================== NAVEGAÇÃO ==================== */
  function abrirApp(){
    telaLogin.hidden = true;
    telaSetup.hidden = true;
    telaApp.hidden   = false;
    renderGrade();
    atualizarQuem();
    atualizarResumo();
    window.scrollTo(0, 0);
  }

  function abrirSetup(){
    telaLogin.hidden = true;
    telaApp.hidden   = true;
    telaSetup.hidden = false;
    grid.innerHTML   = '';
    window.scrollTo(0, 0);
  }

  /* ==================== EVENTOS ==================== */
  async function entrarComo(identidade){
    erroLogin.classList.remove('visivel');
    currentIdentity = identidade;
    try{
      localStorage.setItem(IDENTITY_KEY, identidade);
    }catch(error){
      console.error('Falha ao salvar a pessoa escolhida neste navegador.', error);
      mostrarErroLogin('Não foi possível lembrar a pessoa escolhida neste navegador.');
      return;
    }

    btnMatheus.disabled = true;
    btnAntonella.disabled = true;
    try{
      if(auth.currentUser) conectarUsuario(auth.currentUser);
      else await signInAnonymously(auth);
    }catch(error){
      console.error('Falha ao entrar anonimamente no Firebase.', error);
      mostrarErroLogin(textoErroFirebase(error));
    }finally{
      btnMatheus.disabled = false;
      btnAntonella.disabled = false;
    }
  }

  btnMatheus.addEventListener('click', function(){ entrarComo('eu'); });
  btnAntonella.addEventListener('click', function(){ entrarComo('ela'); });
  btnSair.addEventListener('click', async function(){
    const identidadeAnterior = currentIdentity;
    try{
      await cloudWriteQueue;
      currentIdentity = null;
      localStorage.removeItem(IDENTITY_KEY);
      await signOut(auth);
    }catch(error){
      console.error('Falha ao sair da conta Firebase.', error);
      currentIdentity = identidadeAnterior;
      if(identidadeAnterior){
        try{ localStorage.setItem(IDENTITY_KEY, identidadeAnterior); }
        catch(storageError){ console.error('Falha ao restaurar a pessoa escolhida.', storageError); }
      }
      definirStatusSync(textoErroFirebase(error), true);
    }
  });
  btnExportar.addEventListener('click', baixarBackup);

  inpBackup.addEventListener('change', function(){
    const arquivo = inpBackup.files && inpBackup.files[0];
    if(!arquivo) return;
    erroBackup.classList.remove('visivel');
    if(!currentUser || !cloudReady || state){
      erroBackup.textContent = 'Importem o backup somente quando a conta estiver conectada e ainda não houver uma meta na nuvem.';
      erroBackup.classList.add('visivel');
      inpBackup.value = '';
      return;
    }
    if(arquivo.size > 1024 * 1024){
      erroBackup.textContent = 'O arquivo de backup é maior que 1 MB e não foi importado.';
      erroBackup.classList.add('visivel');
      inpBackup.value = '';
      return;
    }

    const leitor = new FileReader();
    leitor.onload = function(){
      try{
        const importado = normalizarEstado(JSON.parse(String(leitor.result)));
        if(!importado) throw new Error('Formato de backup inválido.');
        if(state){
          erroBackup.textContent = 'Uma meta chegou da nuvem enquanto o backup era lido. O arquivo não foi aplicado.';
          erroBackup.classList.add('visivel');
          return;
        }
        state = importado;
        salvar();
        abrirApp();
        definirStatusSync('Backup importado; sincronizando com a nuvem...', false);
      }catch(error){
        console.error('Falha ao importar o backup do cofrinho.', error);
        erroBackup.textContent = 'Esse arquivo não parece ser um backup válido do cofrinho.';
        erroBackup.classList.add('visivel');
      }finally{
        inpBackup.value = '';
      }
    };
    leitor.onerror = function(){
      console.error('Falha ao ler o arquivo de backup.', leitor.error);
      erroBackup.textContent = 'Não foi possível ler esse arquivo de backup.';
      erroBackup.classList.add('visivel');
      inpBackup.value = '';
    };
    leitor.readAsText(arquivo);
  });

  btnGerar.addEventListener('click', function(){
    const totalDigitado = parseMoney(inpTotal.value);
    const prazo = inpPrazo.value;

    if(!Number.isSafeInteger(totalDigitado) || totalDigitado <= 0){
      mostrarErro('Coloque o valor total que vocês querem juntar 💗');
      inpTotal.focus();
      return;
    }
    const totalCents = arredondarPara50Centavos(totalDigitado);
    if(!Number.isSafeInteger(totalCents)){
      mostrarErro('O valor total informado é muito alto.');
      inpTotal.focus();
      return;
    }
    inpTotal.value = fmt(totalCents);
    if(!prazo){
      mostrarErro('Escolham a data do prazo final ✨');
      inpPrazo.focus();
      return;
    }
    const diasRestantes = diasAtePrazo(prazo);
    if(diasRestantes < 0){
      mostrarErro('A data do prazo final precisa ser hoje ou uma data futura 😊');
      inpPrazo.focus();
      return;
    }
    const n = Math.max(1, diasRestantes);
    if(n > 1000){
      mostrarErro('Escolham uma data que esteja a no máximo 1000 dias 🙈');
      inpPrazo.focus();
      return;
    }
    if(totalCents / n < 100){
      mostrarErro('Com esse valor, cada quadradinho ficaria com menos de R$ 1,00. Aumentem o total ou diminuam os dias 😊');
      return;
    }

    const valores = gerarValores(totalCents, n);
    state = {
      totalCents: totalCents,
      n: n,
      prazo: prazo,
      quem: currentIdentity || 'eu',
      items: valores.map(function(v){ return { v: v, defaultV: v, by: null }; })
    };

    salvar();
    erroBox.classList.remove('visivel');
    abrirApp();
  });

  inpPrazo.min = dataLocalISO(new Date());
  inpNovoPrazo.min = dataLocalISO(new Date());

  btnEditarPrazo.addEventListener('click', function(){
    inpNovoPrazo.value = state.prazo || dataLocalISO(new Date());
    erroPrazo.textContent = '';
    erroPrazo.classList.remove('visivel');
    prazoEdicao.hidden = false;
    inpNovoPrazo.focus();
  });

  btnCancelarPrazo.addEventListener('click', function(){
    prazoEdicao.hidden = true;
    erroPrazo.classList.remove('visivel');
  });

  btnSalvarPrazo.addEventListener('click', function(){
    const novoPrazo = inpNovoPrazo.value;
    if(!novoPrazo){
      erroPrazo.textContent = 'Escolham a data do prazo final ✨';
      erroPrazo.classList.add('visivel');
      inpNovoPrazo.focus();
      return;
    }

    const diasRestantes = diasAtePrazo(novoPrazo);
    if(diasRestantes < 0){
      erroPrazo.textContent = 'A data do prazo final precisa ser hoje ou uma data futura 😊';
      erroPrazo.classList.add('visivel');
      inpNovoPrazo.focus();
      return;
    }
    if(diasRestantes > 1000){
      erroPrazo.textContent = 'Escolham uma data que esteja a no máximo 1000 dias 🙈';
      erroPrazo.classList.add('visivel');
      inpNovoPrazo.focus();
      return;
    }

    if(novoPrazo !== state.prazo){
      redimensionarGrade(Math.max(1, diasRestantes));
      state.prazo = novoPrazo;
      salvar();
      renderGrade();
      atualizarResumo();
    }
    prazoEdicao.hidden = true;
    erroPrazo.classList.remove('visivel');
  });

  // Enter nos campos
  inpTotal.addEventListener('keydown', function(e){ if(e.key === 'Enter') inpPrazo.focus(); });
  inpPrazo.addEventListener('keydown', function(e){ if(e.key === 'Enter') btnGerar.click(); });

  // Selecionar quem guardou
  segQuem.addEventListener('click', function(e){
    const b = e.target.closest('button[data-quem]');
    if(!b || !state) return;
    state.quem = b.dataset.quem;
    salvar();
    atualizarQuem();
  });

  // Tocar nos quadradinhos
  grid.addEventListener('pointerdown', function(e){
    if(!state || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = e.target.closest('.day');
    if(!card) return;

    const indice = parseInt(card.dataset.i, 10);
    const item = state.items[indice];
    if(!item || !item.by) return;

    cancelarPressaoLonga();
    longPressStart = { x:e.clientX, y:e.clientY };
    longPressTimer = setTimeout(function(){
      longPressTimer = null;
      suppressTapIndex = indice;
      abrirEdicaoQuadradinho(indice);
    }, 600);
  });

  grid.addEventListener('contextmenu', function(e){
    if(e.target.closest('.day')) e.preventDefault();
  });

  grid.addEventListener('pointermove', function(e){
    if(longPressTimer === null || !longPressStart) return;
    const dx = e.clientX - longPressStart.x;
    const dy = e.clientY - longPressStart.y;
    if(dx * dx + dy * dy > 100) cancelarPressaoLonga();
  });

  grid.addEventListener('pointerleave', cancelarPressaoLonga);
  document.addEventListener('pointerup', cancelarPressaoLonga);
  document.addEventListener('pointercancel', cancelarPressaoLonga);

  grid.addEventListener('click', function(e){
    if(!state) return;
    const card = e.target.closest('.day');
    if(!card) return;

    const i  = parseInt(card.dataset.i, 10);
    if(suppressTapIndex === i){
      suppressTapIndex = null;
      return;
    }
    const it = state.items[i];
    if(!it) return;

    const tag = e.target.closest('.tag');
    const date = e.target.closest('.date');

    if(tag && it.by){
      if(it.by !== state.quem) it.by = state.quem;
    } else if(date && it.by){
      return;
    } else if(it.by){
      it.by = null;
      it.savedOn = null;
    } else {
      it.by = state.quem;
      it.savedOn = dataLocalISO(new Date());
    }

    salvar();
    atualizarCard(i);
    atualizarResumo();
  });

  // Acessibilidade teclado
  grid.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.day');
    if(!card) return;
    e.preventDefault();
    card.click();
  });

  // Reset
  btnReset.addEventListener('click', function(){ modal.hidden = false; });
  btnCancelar.addEventListener('click', function(){ modal.hidden = true; });
  modal.addEventListener('click', function(e){ if(e.target === modal) modal.hidden = true; });

  btnConfirmar.addEventListener('click', async function(){
    const anterior = copiarEstado(state);
    state = null;
    modal.hidden = true;
    inpTotal.value = '';
    inpPrazo.value = '';
    salvarLocalmente();
    abrirSetup();
    if(!cloudDocRef || !currentUser) return;

    pendingCloudWrites++;
    cloudWriteQueue = cloudWriteQueue.then(async function(){
      await setDoc(cloudDocRef, { state:null, updatedAt:serverTimestamp() });
      lastCloudState = null;
      pendingCloudWrites--;
      definirStatusSync('Meta removida do cofrinho compartilhado.', false);
    }).catch(function(error){
      pendingCloudWrites--;
      console.error('Falha ao remover a meta compartilhada.', error);
      state = anterior;
      salvarLocalmente();
      abrirApp();
      mostrarErro(textoErroFirebase(error));
      definirStatusSync('A meta não foi removida da nuvem.', true);
    });
  });

  btnCancelarEdicao.addEventListener('click', fecharEdicaoQuadradinho);
  btnRestaurarValor.addEventListener('click', function(){
    if(itemEmEdicao === null || !state) return;
    const item = state.items[itemEmEdicao];
    if(!item) return;
    edicaoValor.value = fmt(typeof item.defaultV === 'number' ? item.defaultV : item.v);
    erroEdicao.classList.remove('visivel');
  });

  modalEdicao.addEventListener('click', function(e){
    if(e.target === modalEdicao) fecharEdicaoQuadradinho();
  });

  btnSalvarEdicao.addEventListener('click', function(){
    if(itemEmEdicao === null || !state) return;
    const item = state.items[itemEmEdicao];
    if(!item || !item.by) return;

    const valorDigitado = parseMoney(edicaoValor.value);
    if(!Number.isSafeInteger(valorDigitado) || valorDigitado <= 0){
      erroEdicao.textContent = 'Digite um valor maior que zero 💗';
      erroEdicao.classList.add('visivel');
      edicaoValor.focus();
      return;
    }

    const novaData = edicaoData.value || item.savedOn || '';
    if(novaData && diasAtePrazo(novaData) > 0){
      erroEdicao.textContent = 'A data não pode estar no futuro 😊';
      erroEdicao.classList.add('visivel');
      edicaoData.focus();
      return;
    }

    let outrosMarcados = 0;
    state.items.forEach(function(outroItem, indice){
      if(indice !== itemEmEdicao && outroItem.by) outrosMarcados += outroItem.v;
    });
    const maximoPermitido = state.totalCents - outrosMarcados;
    const novoValor = valorDigitado === maximoPermitido ? maximoPermitido : arredondarPara50Centavos(valorDigitado);
    if(novoValor > maximoPermitido){
      erroEdicao.textContent = 'Esse valor ultrapassa o total da meta junto com os outros quadradinhos marcados.';
      erroEdicao.classList.add('visivel');
      edicaoValor.focus();
      return;
    }

    const valorMudou = item.v !== novoValor;
    item.v = novoValor;
    item.savedOn = novaData || null;
    if(valorMudou) redimensionarGrade(state.items.length);

    salvar();
    renderGrade();
    atualizarResumo();
    fecharEdicaoQuadradinho();
  });

  function fecharModalAdicionarValor(){
    modalAdicionarValor.hidden = true;
    erroAdicionarValor.classList.remove('visivel');
  }

  btnAdicionarValor.addEventListener('click', function(){
    if(!state) return;
    pessoaAdicionarValor.textContent = LABEL[state.quem] || LABEL.eu;
    inpAdicionarValor.value = '';
    erroAdicionarValor.textContent = '';
    erroAdicionarValor.classList.remove('visivel');
    modalAdicionarValor.hidden = false;
    inpAdicionarValor.focus();
  });

  btnCancelarAdicionarValor.addEventListener('click', fecharModalAdicionarValor);
  modalAdicionarValor.addEventListener('click', function(e){
    if(e.target === modalAdicionarValor) fecharModalAdicionarValor();
  });

  btnConfirmarAdicionarValor.addEventListener('click', function(){
    if(!state) return;
    const valorDigitado = parseMoney(inpAdicionarValor.value);
    if(!Number.isSafeInteger(valorDigitado) || valorDigitado <= 0){
      erroAdicionarValor.textContent = 'Digite um valor maior que zero 💗';
      erroAdicionarValor.classList.add('visivel');
      inpAdicionarValor.focus();
      return;
    }

    const guardado = state.items.reduce(function(soma, item){
      return soma + (item.by ? item.v : 0);
    }, 0);
    const restante = state.totalCents - guardado;
    const valor = valorDigitado === restante ? restante : arredondarPara50Centavos(valorDigitado);
    if(valor > restante){
      erroAdicionarValor.textContent = 'Esse valor é maior do que falta para atingir a meta.';
      erroAdicionarValor.classList.add('visivel');
      inpAdicionarValor.focus();
      return;
    }

    const item = state.items.find(function(registro){ return !registro.by; });
    if(!item){
      erroAdicionarValor.textContent = 'Todos os quadradinhos já foram preenchidos.';
      erroAdicionarValor.classList.add('visivel');
      return;
    }

    item.v = valor;
    item.defaultV = valor;
    item.by = state.quem;
    item.savedOn = dataLocalISO(new Date());
    redimensionarGrade(state.items.length);
    salvar();
    renderGrade();
    atualizarQuem();
    atualizarResumo();
    fecharModalAdicionarValor();
  });

  function fecharModalAjustarTotal(){
    modalAjustarTotal.hidden = true;
    erroAjustarTotal.classList.remove('visivel');
  }

  btnAjustarTotal.addEventListener('click', function(){
    if(!state) return;
    const guardado = state.items.reduce(function(soma, item){
      return soma + (item.by ? item.v : 0);
    }, 0);
    inpAjustarTotal.value = fmt(guardado);
    erroAjustarTotal.textContent = '';
    erroAjustarTotal.classList.remove('visivel');
    modalAjustarTotal.hidden = false;
    inpAjustarTotal.focus();
  });

  btnCancelarAjustarTotal.addEventListener('click', fecharModalAjustarTotal);
  modalAjustarTotal.addEventListener('click', function(e){
    if(e.target === modalAjustarTotal) fecharModalAjustarTotal();
  });

  btnConfirmarAjustarTotal.addEventListener('click', function(){
    if(!state) return;
    const totalDigitado = parseMoney(inpAjustarTotal.value);
    if(!Number.isSafeInteger(totalDigitado) || totalDigitado < 0){
      erroAjustarTotal.textContent = 'Digite um total válido, que pode ser zero.';
      erroAjustarTotal.classList.add('visivel');
      inpAjustarTotal.focus();
      return;
    }

    const novoTotal = totalDigitado === state.totalCents
      ? totalDigitado
      : arredondarPara50Centavos(totalDigitado);
    if(novoTotal > state.totalCents){
      erroAjustarTotal.textContent = 'O total ajustado não pode ultrapassar a meta.';
      erroAjustarTotal.classList.add('visivel');
      inpAjustarTotal.focus();
      return;
    }

    const marcados = state.items.map(function(item, indice){
      return { item:item, indice:indice };
    }).filter(function(registro){ return !!registro.item.by; });

    if(novoTotal === 0){
      marcados.forEach(function(registro){
        registro.item.by = null;
        registro.item.savedOn = null;
      });
    } else {
      if(!marcados.length){
        const primeiroPendente = state.items.find(function(item){ return !item.by; });
        if(!primeiroPendente){
          erroAjustarTotal.textContent = 'Não há quadradinhos disponíveis para esse ajuste.';
          erroAjustarTotal.classList.add('visivel');
          return;
        }
        primeiroPendente.by = state.quem;
        primeiroPendente.savedOn = dataLocalISO(new Date());
        marcados.push({
          item:primeiroPendente,
          indice:state.items.indexOf(primeiroPendente)
        });
      }

      const unidades = Math.floor(novoTotal / 50);
      const residuo = novoTotal % 50;
      const quantidadeManter = Math.min(marcados.length, Math.max(1, unidades));
      marcados.sort(function(a, b){
        const dataA = a.item.savedOn || '';
        const dataB = b.item.savedOn || '';
        return dataA.localeCompare(dataB) || a.indice - b.indice;
      });
      const manter = marcados.slice(0, quantidadeManter);
      const manterSet = new Set(manter.map(function(registro){ return registro.item; }));
      marcados.forEach(function(registro){
        if(!manterSet.has(registro.item)){
          registro.item.by = null;
          registro.item.savedOn = null;
        }
      });

      const pesoTotal = manter.reduce(function(soma, registro){
        return soma + registro.item.v;
      }, 0);
      const unidadesMinimas = unidades >= manter.length ? 1 : 0;
      const unidadesExtras = Math.max(0, unidades - unidadesMinimas * manter.length);
      const distribuicoes = manter.map(function(registro){
        const exato = pesoTotal > 0
          ? unidadesExtras * registro.item.v / pesoTotal
          : unidadesExtras / manter.length;
        const base = Math.floor(exato);
        return { registro:registro, unidades:unidadesMinimas + base, fracao:exato - base };
      });
      let unidadesUsadas = 0;
      distribuicoes.sort(function(a, b){
        return b.fracao - a.fracao || a.registro.indice - b.registro.indice;
      });
      unidadesUsadas = distribuicoes.reduce(function(soma, item){
        return soma + item.unidades - unidadesMinimas;
      }, 0);
      for(let i = 0; i < unidades - unidadesMinimas * manter.length - unidadesUsadas; i++){
        distribuicoes[i % distribuicoes.length].unidades++;
      }
      distribuicoes.forEach(function(distribuicao){
        const item = distribuicao.registro.item;
        item.v = distribuicao.unidades * 50;
        item.defaultV = item.v;
      });
      if(residuo > 0){
        const item = distribuicoes[0].registro.item;
        item.v += residuo;
        item.defaultV = item.v;
      }
    }

    redimensionarGrade(state.items.length);
    salvar();
    renderGrade();
    atualizarQuem();
    atualizarResumo();
    fecharModalAjustarTotal();
  });

  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;
    if(!modalAjustarTotal.hidden) fecharModalAjustarTotal();
    else if(!modalAdicionarValor.hidden) fecharModalAdicionarValor();
    else if(!modalEdicao.hidden) fecharEdicaoQuadradinho();
    else if(!modal.hidden) modal.hidden = true;
  });

  /* ==================== INICIALIZAÇÃO ==================== */
  function conectarUsuario(user){
    if(stopCloudListener){
      stopCloudListener();
      stopCloudListener = null;
    }

    currentUser = user;
    cloudReady = false;
    lastCloudState = null;
    telaLogin.hidden = false;
    telaSetup.hidden = true;
    telaApp.hidden = true;
    erroLogin.classList.remove('visivel');
    erroLogin.textContent = '';
    cloudDocRef = doc(db, 'cofrinhos', 'tonteu-compartilhado');
    definirStatusSync('Conectando ao cofrinho compartilhado...', false);

    let primeiraLeitura = true;
    stopCloudListener = onSnapshot(cloudDocRef, function(snapshot){
      const registro = snapshot.exists() ? snapshot.data() : null;

      if(primeiraLeitura){
        primeiraLeitura = false;
        cloudReady = true;
        if(!registro){
          lastCloudState = null;
          state = carregar();
          if(state){
            state.quem = currentIdentity;
            abrirApp();
            salvar();
          } else {
            abrirSetup();
          }
          return;
        }

        if(registro.state === null){
          state = null;
          lastCloudState = null;
          salvarLocalmente();
          abrirSetup();
          definirStatusSync('Conta conectada ao Firebase.', false);
          return;
        }

        const remoto = normalizarEstado(registro.state);
        if(!remoto){
          cloudReady = false;
          telaLogin.hidden = false;
          mostrarErroLogin('Os dados do cofrinho na nuvem estão inválidos. Eles não foram alterados.');
          return;
        }
        state = remoto;
        lastCloudState = copiarEstado(remoto);
        const identidadeMudou = currentIdentity && state.quem !== currentIdentity;
        if(identidadeMudou) state.quem = currentIdentity;
        salvarLocalmente();
        abrirApp();
        if(identidadeMudou) salvar();
        else definirStatusSync('Sincronizado com o cofrinho compartilhado.', false);
        return;
      }

      if(pendingCloudWrites > 0) return;
      if(!registro || registro.state === null){
        state = null;
        lastCloudState = null;
        salvarLocalmente();
        abrirSetup();
        definirStatusSync('A meta compartilhada foi removida.', false);
        return;
      }

      const remoto = normalizarEstado(registro.state);
      if(!remoto){
        definirStatusSync('Os dados da nuvem estão inválidos; nenhuma alteração foi aplicada.', true);
        return;
      }
      lastCloudState = copiarEstado(remoto);
      if(mesmoValor(state, remoto)) return;
      state = remoto;
      salvarLocalmente();
      abrirApp();
      definirStatusSync('Atualizado pelo outro aparelho.', false);
    }, function(error){
      console.error('Falha ao receber atualizações do Firestore.', error);
      cloudReady = false;
      telaApp.hidden = true;
      telaSetup.hidden = true;
      telaLogin.hidden = false;
      mostrarErroLogin(textoErroFirebase(error));
    });
  }

  onAuthStateChanged(auth, function(user){
    if(!user){
      currentUser = null;
      cloudReady = false;
      cloudDocRef = null;
      lastCloudState = null;
      if(stopCloudListener){
        stopCloudListener();
        stopCloudListener = null;
      }
      state = null;
      telaLogin.hidden = false;
      telaSetup.hidden = true;
      telaApp.hidden = true;
      return;
    }

    if(currentIdentity) conectarUsuario(user);
    else {
      currentUser = user;
      telaLogin.hidden = false;
      telaSetup.hidden = true;
      telaApp.hidden = true;
    }
  });

  agendarAtualizacaoPrazo();

})();
