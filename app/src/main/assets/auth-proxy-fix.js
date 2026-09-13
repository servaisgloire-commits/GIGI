(function(){
  'use strict';

  async function fastAuthFetch(path, payload){
    if(!API) throw new Error('Service FAST indisponible');
    const controller = new AbortController();
    const timeout = setTimeout(function(){ controller.abort(); }, 15000);
    try{
      const response = await fetch(API + path, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload || {}),
        cache: 'no-store',
        signal: controller.signal
      });
      let data = {};
      try{ data = await response.json(); }catch(_e){}
      if(!response.ok){
        throw new Error(data.detail || data.message || ('FAST HTTP ' + response.status));
      }
      return data;
    }catch(error){
      if(error && error.name === 'AbortError'){
        throw new Error('Connexion FAST trop lente. Réessayez.');
      }
      if(error && String(error.message || error) === 'Failed to fetch'){
        throw new Error('Connexion FAST indisponible. Vérifiez Internet puis réessayez.');
      }
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  window.login = async function(){
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if(!email || !password) return toast('Entrez votre e-mail et votre mot de passe');
    try{
      const data = await fastAuthFetch('/v1/auth/password', {email:email,password:password});
      if(!data.access_token) throw new Error('Session FAST non reçue');
      token = data.access_token;
      localStorage.setItem('fast_access_token', token);
      try{ FASTNative.setAccessToken(token); }catch(_e){}
      await loadMe();
      showApp();
      toast('Bienvenue sur FAST');
    }catch(error){
      toast(error.message || 'Connexion impossible');
    }
  };

  window.signup = async function(){
    try{
      await fastAuthFetch('/v1/auth/signup', {
        email: $('signupEmail').value.trim(),
        password: $('signupPassword').value,
        role: $('signupRole').value,
        first_name: $('firstName').value.trim(),
        last_name: $('lastName').value.trim(),
        phone: $('phone').value.trim()
      });
      toast('Compte créé. Vérifiez votre e-mail.');
    }catch(error){
      toast(error.message || 'Création du compte impossible');
    }
  };

  window.forgotPassword = async function(){
    const email = $('loginEmail').value.trim();
    if(!email) return toast('Entrez votre e-mail');
    try{
      await fastAuthFetch('/v1/auth/recover', {email:email});
      toast('Lien envoyé');
    }catch(error){
      toast(error.message || 'Envoi impossible');
    }
  };

  window.FASTAuthProxyAudit = {
    backend: function(){ return API || ''; },
    active: function(){ return typeof window.login === 'function' && typeof window.signup === 'function'; }
  };
})();
