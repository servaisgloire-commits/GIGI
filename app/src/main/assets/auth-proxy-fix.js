(function(){
  'use strict';

  const AUTH_EDGE = 'https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-auth-proxy';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38';

  function authAction(path){
    if(path === '/v1/auth/password') return 'password';
    if(path === '/v1/auth/signup') return 'signup';
    if(path === '/v1/auth/recover-password' || path === '/v1/auth/recover') return 'recover';
    throw new Error('Route d’authentification FAST inconnue');
  }

  async function fastAuthFetch(path, payload){
    const controller = new AbortController();
    const timeout = setTimeout(function(){ controller.abort(); }, 15000);
    try{
      const response = await fetch(AUTH_EDGE, {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'apikey': SUPABASE_PUBLIC_KEY
        },
        body: JSON.stringify(Object.assign({action:authAction(path)}, payload || {})),
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

  window.FASTAuthProxyRequest = fastAuthFetch;

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
      const data = await fastAuthFetch('/v1/auth/signup', {
        email: $('signupEmail').value.trim(),
        password: $('signupPassword').value,
        role: $('signupRole').value,
        first_name: $('firstName').value.trim(),
        last_name: $('lastName').value.trim(),
        phone: $('phone').value.trim()
      });
      if(data.access_token){
        token = data.access_token;
        localStorage.setItem('fast_access_token', token);
        try{ FASTNative.setAccessToken(token); }catch(_e){}
        await loadMe();
        showApp();
        toast('Compte créé. Bienvenue sur FAST.');
        return;
      }
      toast('Compte créé. Vérifiez votre e-mail.');
    }catch(error){
      toast(error.message || 'Création du compte impossible');
    }
  };

  window.forgotPassword = async function(){
    const email = $('loginEmail').value.trim();
    if(!email) return toast('Entrez votre e-mail');
    try{
      const data = await fastAuthFetch('/v1/auth/recover-password', {email:email});
      if(data && data.ok === false) throw new Error(data.message || 'Réessayez dans quelques instants.');
      toast((data && data.message) || 'Lien envoyé');
    }catch(error){
      toast(error.message || 'Envoi impossible');
    }
  };

  window.FASTAuthProxyAudit = {
    backend: function(){ return AUTH_EDGE; },
    active: function(){ return typeof window.login === 'function' && typeof window.signup === 'function'; }
  };
})();
