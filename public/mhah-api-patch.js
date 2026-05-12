(function(){
  console.log('[CLIENT] mhah-api-patch.js loading...');
  const TOKEN_KEY = 'mhah_api_token';
  const SYNC_KEYS = [K.m, K.p, K.c, K.r, K.mc, K.z, K.cb];
  const originalSd = typeof sd === 'function' ? sd : function(){};
  const originalCheckS = typeof checkS === 'function' ? checkS : function(){ return false; };
  const originalDoAdmLogin = typeof doAdmLogin === 'function' ? doAdmLogin : function(){};
  const originalDoMemLogin = typeof doMemLogin === 'function' ? doMemLogin : function(){};
  const originalDoLogout = typeof doLogout === 'function' ? doLogout : function(){};
  const originalDoCP = typeof doCP === 'function' ? doCP : function(){};
  const originalProcessStripePayment = typeof processStripePayment === 'function' ? processStripePayment : function(){};
  const originalCheckStripeReturn = typeof checkStripeReturn === 'function' ? checkStripeReturn : function(){};
  const originalSMC = typeof sMC === 'function' ? sMC : function(){};
  const originalSZ = typeof sZ === 'function' ? sZ : function(){};
  const originalSCB = typeof sCB === 'function' ? sCB : function(){};
  const originalOpenCB = typeof openCB === 'function' ? openCB : null;
  const originalSetCBM = typeof setCBM === 'function' ? setCBM : null;
  const originalLaunchSelectedPayment = typeof launchSelectedPayment === 'function' ? launchSelectedPayment : null;
  let suppressServerSync = false;
  let syncTimer = null;

  function apiEnabled(){
    return window.location.protocol !== 'file:' && !!window.location.origin && window.location.origin !== 'null';
  }

  function getToken(){
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getCurrentMemberRecordSafe(){
    if(typeof getCurrentMemberRecord === 'function') return getCurrentMemberRecord();
    if(!window.CU || !CU.code || CU.type !== 'member') return null;
    return gd(K.m).find(function(m){ return m.code === CU.code; }) || null;
  }

  function getStripeTypeLabelSafe(packageId){
    if(typeof getStripeTypeLabel === 'function') return getStripeTypeLabel(packageId);
    var labels = {
      cotisation_mensuelle: 'Cotisation Mensuelle',
      cotisation_semestrielle: 'Cotisation Semestrielle',
      cotisation_annuelle: 'Cotisation Annuelle',
      don_custom: 'Don'
    };
    return labels[packageId] || 'Paiement';
  }

  async function apiRequest(path, options){
    if(!apiEnabled()) throw new Error('API indisponible en mode fichier');
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if(token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(window.location.origin + path, Object.assign({}, opts, { headers }));
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.indexOf('application/json') >= 0 ? await response.json() : await response.text();
    if(!response.ok){
      const msg = data && data.error ? data.error : (typeof data === 'string' ? data : ('Erreur API ' + response.status));
      throw new Error(msg);
    }
    return data;
  }

  function applySnapshot(snapshot){
    if(!snapshot) return;
    suppressServerSync = true;
    try {
      if(snapshot.members) originalSd(K.m, snapshot.members);
      if(snapshot.payments) originalSd(K.p, snapshot.payments);
      if(snapshot.chats) originalSd(K.c, snapshot.chats);
      if(snapshot.requests) originalSd(K.r, snapshot.requests);
      if(snapshot.moncash) originalSd(K.mc, snapshot.moncash);
      if(snapshot.zelle) originalSd(K.z, snapshot.zelle);
      if(snapshot.cards) originalSd(K.cb, snapshot.cards);
    } finally {
      suppressServerSync = false;
    }
  }

  function currentSnapshot(){
    return {
      members: gd(K.m),
      payments: gd(K.p),
      chats: gd(K.c),
      requests: gd(K.r),
      moncash: gd(K.mc),
      zelle: gd(K.z),
      cards: gd(K.cb)
    };
  }

  async function syncSnapshotNow(){
    console.log('[CLIENT] syncSnapshotNow called');
    if(!apiEnabled()) {
      console.log('[CLIENT] syncSnapshotNow: API not enabled');
      return;
    }
    if(suppressServerSync) {
      console.log('[CLIENT] syncSnapshotNow: server sync suppressed');
      return;
    }
    if(!window.CU) {
      console.log('[CLIENT] syncSnapshotNow: no user context');
      return;
    }
    if(CU.type !== 'admin') {
      console.log('[CLIENT] syncSnapshotNow: user not admin, type:', CU.type);
      return;
    }
    if(!getToken()) {
      console.log('[CLIENT] syncSnapshotNow: no token');
      return;
    }

    console.log('[CLIENT] syncSnapshotNow: starting sync for admin', CU.role);
    try {
      const snapshot = currentSnapshot();
      console.log('[CLIENT] syncSnapshotNow: sending snapshot with', {
        members: snapshot.members ? snapshot.members.length : 0,
        payments: snapshot.payments ? snapshot.payments.length : 0,
        chats: snapshot.chats ? snapshot.chats.length : 0
      });

      const response = await apiRequest('/api/data/snapshot', {
        method: 'POST',
        body: JSON.stringify({ snapshot: snapshot })
      });

      console.log('[CLIENT] syncSnapshotNow: sync successful');
    } catch(err){
      console.error('[CLIENT] syncSnapshotNow: sync failed', err);
    }
  }

  function scheduleSnapshotSync(){
    console.log('[CLIENT] scheduleSnapshotSync called');
    if(syncTimer) {
      console.log('[CLIENT] scheduleSnapshotSync: clearing existing timer');
      clearTimeout(syncTimer);
    }
    syncTimer = setTimeout(() => {
      console.log('[CLIENT] scheduleSnapshotSync: executing sync');
      syncSnapshotNow();
    }, 500);
  }

  sd = function(k, v){
    console.log('[CLIENT] sd called with key:', k, 'value:', v);
    originalSd(k, v);
    if(!suppressServerSync && SYNC_KEYS.indexOf(k) >= 0){
      console.log('[CLIENT] sd: key in SYNC_KEYS, scheduling sync');
      scheduleSnapshotSync();
    } else {
      console.log('[CLIENT] sd: key not in SYNC_KEYS or sync suppressed');
    }
  };

  async function restoreServerSession(){
    if(!apiEnabled() || !getToken()) return false;
    try {
      const data = await apiRequest('/api/session', { method: 'GET' });
      if(data && data.session){
        applySnapshot(data.snapshot || {});
        CU = data.session;
        originalSd(K.s, data.session);
        if(CU.type === 'admin') uiAdm(); else uiMem();
        return true;
      }
    } catch(err){
      console.warn('restore session failed', err);
      localStorage.removeItem(TOKEN_KEY);
    }
    return false;
  }

  async function syncDataAfterLocalSession(){
    if(!apiEnabled() || !getToken() || !window.CU) return;
    try {
      const data = await apiRequest('/api/session', { method: 'GET' });
      applySnapshot(data.snapshot || {});
      if(typeof refresh === 'function') refresh();
      if(window.CU && CU.type === 'member' && typeof popMem === 'function') popMem();
    } catch(err){
      console.warn('sync after local session failed', err);
    }
  }

  async function handleLogin(kind, payload){
    const path = kind === 'admin' ? '/api/auth/admin/login' : '/api/auth/member/login';
    const data = await apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if(data && data.token && data.session){
      localStorage.setItem(TOKEN_KEY, data.token);
      applySnapshot(data.snapshot || {});
      CU = data.session;
      originalSd(K.s, data.session);
      if(CU.type === 'admin') uiAdm(); else uiMem();
      toast('Bienvenue, ' + (CU.name || 'Utilisateur') + ' !', 'success');
      return true;
    }
    return false;
  }

  doAdmLogin = async function(){
    if(!apiEnabled()) {
      console.error('API indisponible');
      if(typeof showE === 'function') showE('lErr');
      E('lErr').textContent = '❌ API indisponible, connexion requise';
      setTimeout(function(){ if(typeof hideE === 'function') hideE('lErr'); }, 4000);
      return;
    }
    try {
      await handleLogin('admin', { role: E('lRole').value, password: E('lPw').value });
    } catch(err){
      console.error(err);
      if(typeof showE === 'function') showE('lErr');
      E('lErr').textContent = '❌ ' + err.message;
      setTimeout(function(){ if(typeof hideE === 'function') hideE('lErr'); E('lErr').textContent = '❌ Identifiants invalides'; }, 4000);
      E('lPw').value = '';
    }
  };

  doMemLogin = async function(){
    if(!apiEnabled()) {
      console.error('API indisponible');
      E('mlE').textContent = '❌ API indisponible, connexion requise';
      if(typeof showE === 'function') showE('mlE');
      setTimeout(function(){ if(typeof hideE === 'function') hideE('mlE'); }, 4000);
      return;
    }
    try {
      await handleLogin('member', { code: E('mlC').value.trim(), password: E('mlP').value });
    } catch(err){
      console.error(err);
      E('mlE').textContent = '❌ ' + err.message;
      if(typeof showE === 'function') showE('mlE');
      setTimeout(function(){ if(typeof hideE === 'function') hideE('mlE'); }, 4000);
    }
  };

  doLogout = function(){
    localStorage.removeItem(TOKEN_KEY);
    return originalDoLogout();
  };

  doCP = async function(){
    if(!apiEnabled() || !getToken()){
      console.error('Connexion requise pour changer le mot de passe');
      toast('Connexion requise', 'error');
      return;
    }
    try {
      await apiRequest('/api/member/change-password', {
        method: 'POST',
        body: JSON.stringify({
          oldPassword: E('cpO').value,
          newPassword: E('cpN').value,
          confirmPassword: E('cpC').value
        })
      });
      if(typeof hideM === 'function') hideM('mCP');
      toast('✅ Mot de passe mis à jour', 'success');
    } catch(err){
      E('cpE').textContent = '❌ ' + err.message;
      if(typeof showE === 'function') showE('cpE');
    }
  };

  function inferPaymentType(typeLabel){
    return /don/i.test(typeLabel || '') ? 'don' : 'cotisation';
  }

  function inferPackageId(typeLabel){
    const label = String(typeLabel || '').toLowerCase();
    if(label.indexOf('mens') >= 0) return 'cotisation_mensuelle';
    if(label.indexOf('semes') >= 0) return 'cotisation_semestrielle';
    if(label.indexOf('ann') >= 0) return 'cotisation_annuelle';
    if(label.indexOf('don') >= 0) return 'don_custom';
    return 'custom_payment';
  }

  function getProviderForMethod(method){
    if(method === 'paypal') return 'paypal';
    if(method === 'moncash') return 'moncash';
    return 'stripe';
  }

  async function createHostedPayment(method, amount, typeLabel, memberCode){
    const provider = getProviderForMethod(method);
    const data = await apiRequest('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        provider: provider,
        method: method,
        amount: amount,
        currency: 'USD',
        payment_type: inferPaymentType(typeLabel),
        package_id: inferPackageId(typeLabel),
        type_label: typeLabel,
        member_code: memberCode
      })
    });
    if(data && data.url){
      toast('Redirection vers le paiement sécurisé...', 'success');
      window.location.href = data.url;
      return true;
    }
    throw new Error('URL de paiement introuvable');
  }

  function ensureCardModalHasStripe(){
    var hiddenMethod = E('cbMethod');
    if(!hiddenMethod) return;
    var buttonsRow = document.querySelector('#cbPB .cbmB') ? document.querySelector('#cbPB .cbmB').parentElement : null;
    if(buttonsRow && !document.querySelector('#cbPB .cbmB[data-m="stripe"]')){
      var btn = document.createElement('button');
      btn.setAttribute('onclick', "setCBM('stripe')");
      btn.setAttribute('data-m', 'stripe');
      btn.className = 'cbmB flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-center font-semibold text-sm';
      btn.innerHTML = '<i class="fas fa-bolt text-emerald-600 text-2xl block mb-1"></i>Stripe';
      buttonsRow.appendChild(btn);
    }
    if(!E('stripeFields')){
      var holder = document.createElement('div');
      holder.id = 'stripeFields';
      holder.className = 'hidden text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3';
      holder.innerHTML = '<i class="fas fa-shield-alt mr-1"></i>Paiement sécurisé hébergé. Clique sur valider pour être redirigé vers la page sécurisée.';
      var ppFields = E('ppFields');
      if(ppFields && ppFields.parentNode){
        ppFields.parentNode.insertBefore(holder, ppFields.nextSibling);
      } else if(E('cbPB')) {
        E('cbPB').appendChild(holder);
      }
    }
  }

  openCB = function(){
    if(originalOpenCB) originalOpenCB();
    ensureCardModalHasStripe();
    setTimeout(function(){ setCBM((E('cbMethod') && E('cbMethod').value) || 'visa'); }, 0);
  };

  setCBM = function(m){
    if(originalSetCBM) originalSetCBM(m);
    ensureCardModalHasStripe();
    document.querySelectorAll('.cbmB').forEach(function(b){
      b.classList.remove('border-indigo-300','bg-indigo-50','border-blue-300','bg-blue-50','border-red-300','bg-red-50','border-emerald-300','bg-emerald-50');
      b.classList.add('border-gray-200','bg-white');
    });
    var btn = document.querySelector('.cbmB[data-m="' + m + '"]');
    if(btn){
      btn.classList.remove('border-gray-200','bg-white');
      if(m === 'visa') btn.classList.add('border-indigo-300','bg-indigo-50');
      else if(m === 'mastercard') btn.classList.add('border-red-300','bg-red-50');
      else if(m === 'stripe') btn.classList.add('border-emerald-300','bg-emerald-50');
      else btn.classList.add('border-blue-300','bg-blue-50');
    }
    if(E('cbMethod')) E('cbMethod').value = m;
    if(m === 'paypal'){
      if(typeof hideE === 'function') hideE('cardFields');
      if(typeof showE === 'function') showE('ppFields');
      if(typeof hideE === 'function') hideE('stripeFields');
    } else if(m === 'stripe'){
      if(typeof hideE === 'function') hideE('cardFields');
      if(typeof hideE === 'function') hideE('ppFields');
      if(typeof showE === 'function') showE('stripeFields');
    } else {
      if(typeof hideE === 'function') hideE('ppFields');
      if(typeof hideE === 'function') hideE('stripeFields');
      if(typeof showE === 'function') showE('cardFields');
    }
  };

  launchSelectedPayment = async function(amount, typeLabel, method){
    if(typeof hideM === 'function') hideM('mStripe');
    var member = getCurrentMemberRecordSafe();
    if(!apiEnabled() || !getToken() || !member){
      console.error('Connexion requise pour lancer le paiement');
      toast('Connexion requise', 'error');
      return;
    }
    if(method === 'moncash'){
      try {
        await createHostedPayment('moncash', amount, typeLabel, member.code);
      } catch(err){
        console.error(err);
        toast('❌ ' + err.message, 'error');
      }
      return;
    }
    if(method === 'zelle'){
      console.error('Connexion requise pour Zelle');
      toast('Connexion requise', 'error');
      return;
    }
    if(method === 'paypal' || method === 'visa' || method === 'mastercard' || method === 'stripe'){
      try {
        await createHostedPayment(method, amount, typeLabel, member.code);
      } catch(err){
        console.error(err);
        toast('❌ ' + err.message, 'error');
      }
      return;
    }
    console.error('Méthode de paiement non autorisée');
    toast('Méthode de paiement non autorisée', 'error');
  };

  function openPaymentMethodSelector(amount, typeLabel){
    var safeType = String(typeLabel || 'Paiement').replace(/'/g, "\\'");
    var amountValue = parseFloat(amount || 0);
    var amountLabel = amountValue.toFixed(2);
    E('stripeTitle').textContent = 'Choisir un moyen de paiement';
    E('stripeContent').innerHTML =
      '<div class="space-y-4">' +
      '<div class="bg-slate-50 border border-slate-200 rounded-xl p-3">' +
      '<p class="text-sm font-bold text-slate-800">' + esc(typeLabel || 'Paiement') + '</p>' +
      '<p class="text-xs text-slate-500 mt-1">Montant: <strong>$' + amountLabel + '</strong></p>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'moncash\')" class="p-3 rounded-xl text-left text-white g-mc shadow payment-btn-active"><span class="text-sm font-bold block">MonCash</span><span class="text-[11px] opacity-90">HTG converti auto</span></button>' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'zelle\')" class="p-3 rounded-xl text-left text-white g-zl shadow payment-btn-active"><span class="text-sm font-bold block">Zelle</span><span class="text-[11px] opacity-90">USD direct</span></button>' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'visa\')" class="p-3 rounded-xl text-left text-white g-card shadow payment-btn-active"><span class="text-sm font-bold block">Visa</span><span class="text-[11px] opacity-90">Carte bancaire</span></button>' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'mastercard\')" class="p-3 rounded-xl text-left bg-gradient-to-r from-red-500 to-orange-500 text-white shadow rounded-xl payment-btn-active"><span class="text-sm font-bold block">Mastercard</span><span class="text-[11px] opacity-90">Carte bancaire</span></button>' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'paypal\')" class="p-3 rounded-xl text-left bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow rounded-xl payment-btn-active"><span class="text-sm font-bold block">PayPal</span><span class="text-[11px] opacity-90">Checkout</span></button>' +
      '<button onclick="launchSelectedPayment(' + amountValue + ', \'" + safeType + "\', \'stripe\')" class="p-3 rounded-xl text-left bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow rounded-xl payment-btn-active"><span class="text-sm font-bold block">Stripe</span><span class="text-[11px] opacity-90">Checkout</span></button>' +
      '</div>' +
      '<div class="mt-1 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700"><i class="fas fa-shield-alt mr-1"></i>Tous les moyens actifs sont disponibles ici.</div>' +
      '</div>';
    if(typeof showM === 'function') showM('mStripe');
  }
  window.openPaymentMethodSelector = openPaymentMethodSelector;

  window.continueDonationChoice = function(){
    var amount = parseFloat(E('donAmount').value);
    if(!amount || amount < 1){ toast('Montant invalide (min $1)', 'error'); return; }
    openPaymentMethodSelector(amount, 'Don');
  };

  openStripeCotisation = function(){
    E('stripeTitle').textContent = 'Cotisation';
    E('stripeContent').innerHTML =
      '<div class="space-y-4">' +
      '<p class="text-sm text-gray-600 mb-4">Choisis un forfait, puis ton moyen de paiement.</p>' +
      '<button onclick="openPaymentMethodSelector(10, \'Cotisation Mensuelle\')" class="w-full p-4 border-2 border-purple-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition text-left payment-btn-active"><div class="flex justify-between items-center"><div><p class="font-bold text-gray-800">Cotisation Mensuelle</p><p class="text-xs text-gray-500">Paiement chaque mois</p></div><p class="text-xl font-bold text-purple-600">$10</p></div></button>' +
      '<button onclick="openPaymentMethodSelector(30, \'Cotisation Semestrielle\')" class="w-full p-4 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition text-left payment-btn-active"><div class="flex justify-between items-center"><div><p class="font-bold text-gray-800">Cotisation Semestrielle</p><p class="text-xs text-gray-500">Tous les 6 mois</p></div><p class="text-xl font-bold text-blue-600">$30</p></div></button>' +
      '<button onclick="openPaymentMethodSelector(50, \'Cotisation Annuelle\')" class="w-full p-4 border-2 border-green-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition text-left payment-btn-active"><div class="flex justify-between items-center"><div><p class="font-bold text-gray-800">Cotisation Annuelle</p><p class="text-xs text-gray-500">Une fois par an</p></div><p class="text-xl font-bold text-green-600">$50</p></div></button>' +
      '<div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700"><i class="fas fa-bolt mr-1"></i>MonCash, Zelle, Visa, Mastercard, PayPal et Stripe sont tous actifs ici.</div>' +
      '</div>';
    if(typeof showM === 'function') showM('mStripe');
  };

  openStripeDon = function(){
    E('stripeTitle').textContent = 'Faire un Don';
    E('stripeContent').innerHTML =
      '<div class="space-y-4">' +
      '<p class="text-sm text-gray-600 mb-3">Entre ton montant, puis choisis le moyen de paiement.</p>' +
      '<div class="flex gap-2 mb-3">' +
      '<button onclick="setDonAmount(25)" class="flex-1 py-2 border-2 rounded-lg hover:bg-gray-50 payment-btn-active">$25</button>' +
      '<button onclick="setDonAmount(50)" class="flex-1 py-2 border-2 rounded-lg hover:bg-gray-50 payment-btn-active">$50</button>' +
      '<button onclick="setDonAmount(100)" class="flex-1 py-2 border-2 rounded-lg hover:bg-gray-50 payment-btn-active">$100</button>' +
      '</div>' +
      '<input id="donAmount" type="number" step="1" min="1" placeholder="Montant personnalisé" class="w-full p-3 border-2 rounded-xl text-lg font-bold text-center input-styled">' +
      '<button onclick="continueDonationChoice()" class="w-full py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition payment-btn-active"><i class="fas fa-arrow-right mr-2"></i>Continuer</button>' +
      '<div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700"><i class="fas fa-heart mr-1"></i>Tous les moyens de paiement sont disponibles pour les dons.</div>' +
      '</div>';
    if(typeof showM === 'function') showM('mStripe');
  };

  processStripePayment = async function(packageId, amount, customLabel){
    if(!apiEnabled() || !getToken()){
      console.error('Connexion requise pour le paiement Stripe');
      toast('Connexion requise', 'error');
      return;
    }
    const member = getCurrentMemberRecordSafe();
    if(!member){ toast('Veuillez vous connecter', 'error'); return; }
    try {
      await createHostedPayment('stripe', amount, customLabel || getStripeTypeLabelSafe(packageId), member.code);
    } catch(err){
      console.error(err);
      toast('❌ ' + err.message, 'error');
    }
  };

  sCB = async function(){
    if(!apiEnabled() || !getToken()){
      console.error('Connexion requise pour les paiements par carte');
      toast('Connexion requise', 'error');
      return;
    }
    var memberCode = E('cb1').value.trim();
    var amount = parseFloat(E('cb2').value);
    var method = E('cbMethod').value;
    var typeLabel = E('cb3').value;
    if(!memberCode || !amount || amount <= 0){ toast('Requis', 'error'); return; }
    if(['visa','mastercard','stripe','paypal'].indexOf(method) >= 0){
      try {
        await createHostedPayment(method, amount, typeLabel, memberCode);
      } catch(err){
        console.error(err);
        toast('❌ ' + err.message, 'error');
      }
      return;
    }
    console.error('Méthode de paiement inconnue ou non autorisée');
    toast('Méthode de paiement non autorisée', 'error');
  };

  async function saveManualPayment(provider, status){
    const prefix = provider === 'moncash' ? 'mc' : 'z';
    const memberCode = E(prefix + '1').value.trim();
    const amount = parseFloat(E(prefix + (provider === 'moncash' ? '3' : '2')).value);
    if(!memberCode || !amount || amount <= 0){ toast('Requis', 'error'); return; }
    const payload = provider === 'moncash'
      ? { provider: provider, status: status, memberCode: memberCode, phone: E('mc2').value.trim(), amount: amount, type: E('mc4').value, ref: E('mc5').value.trim() }
      : { provider: provider, status: status, memberCode: memberCode, amount: amount, type: E('z3').value, senderName: E('z4').value.trim(), ref: E('z5').value.trim() };
    const data = await apiRequest('/api/payments/manual', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    applySnapshot(data.snapshot || {});
    if(typeof hideM === 'function') hideM(provider === 'moncash' ? 'mMCP' : 'mZP');
    if(typeof refresh === 'function') refresh();
    if(window.CU && CU.type === 'member' && typeof popMem === 'function') popMem();
    toast('✅ ' + (provider === 'moncash' ? 'MonCash' : 'Zelle') + ' enregistré', 'success');
  }

  sMC = async function(status){
    if(!apiEnabled() || !getToken()){
      console.error('Connexion requise pour MonCash');
      toast('Connexion requise', 'error');
      return;
    }
    try {
      await saveManualPayment('moncash', status);
    } catch(err){
      console.error(err);
      toast('❌ ' + err.message, 'error');
    }
  };

  sZ = async function(status){
    if(!apiEnabled() || !getToken()){
      console.error('Connexion requise pour Zelle');
      toast('Connexion requise', 'error');
      return;
    }
    try {
      await saveManualPayment('zelle', status);
    } catch(err){
      console.error(err);
      toast('❌ ' + err.message, 'error');
    }
  };

  checkStripeReturn = async function(){
    const params = new URLSearchParams(window.location.search);
    const success = params.get('payment_success');
    const cancelled = params.get('payment_cancelled');
    const transactionId = params.get('transactionId') || params.get('transaction_id') || '';
    const moncashOrderId = params.get('orderId') || params.get('order_id') || '';
    const provider = params.get('provider') || ((transactionId || moncashOrderId) ? 'moncash' : 'stripe');
    const txRef = params.get('tx_ref') || moncashOrderId;
    const sessionId = params.get('session_id');
    const orderId = params.get('token') || params.get('order_id') || moncashOrderId;
    const shouldVerifyMoncash = provider === 'moncash' && (transactionId || moncashOrderId);
    if(!apiEnabled() || !getToken() || ((!success && !cancelled) && !shouldVerifyMoncash)){
      return;
    }
    try {
      if((success === 'true' && txRef) || shouldVerifyMoncash){
        const data = await apiRequest('/api/payments/verify-return', {
          method: 'POST',
          body: JSON.stringify({
            provider: provider,
            tx_ref: txRef,
            session_id: sessionId,
            order_id: orderId,
            transaction_id: transactionId
          })
        });
        applySnapshot(data.snapshot || {});
        if(typeof refresh === 'function') refresh();
        if(window.CU && CU.type === 'member' && typeof popMem === 'function') popMem();
        toast('✅ Paiement confirmé côté serveur', 'success');
      } else if(cancelled === 'true'){
        toast('❌ Paiement annulé', 'error');
      }
    } catch(err){
      console.error(err);
      toast('❌ Retour paiement: ' + err.message, 'error');
    } finally {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  async function bootMHAHApp(){
    if(typeof checkOnlineStatus === 'function') checkOnlineStatus();
    const restored = await restoreServerSession();
    if(!restored){
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    await checkStripeReturn();
  }

  window.addEventListener('load', function(){
    bootMHAHApp();
  });
})();
