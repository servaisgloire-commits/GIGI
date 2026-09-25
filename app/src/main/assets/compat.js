'use strict';

function fastCompatFallback(error){
  return [404,502,503].includes(Number(error?.status||0));
}

function fastPasswordProblem(password){
  if(password.length<12)return 'Le mot de passe doit contenir au moins 12 caractères.';
  if(!/[a-z]/.test(password))return 'Ajoutez au moins une lettre minuscule au mot de passe.';
  if(!/[A-Z]/.test(password))return 'Ajoutez au moins une lettre majuscule au mot de passe.';
  if(!/[0-9]/.test(password))return 'Ajoutez au moins un chiffre au mot de passe.';
  if(!/[^A-Za-z0-9]/.test(password))return 'Ajoutez au moins un symbole au mot de passe.';
  return '';
}

async function supabaseAuth(path,body){
  if(!KEY)throw new Error('Authentification FAST indisponible.');
  const res=await fetch(`${SUPA}/auth/v1/${path}`,{
    method:'POST',
    headers:{apikey:KEY,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body)
  });
  return parse(res);
}

login=async function(e){
  e.preventDefault();
  const email=$('loginEmail').value.trim();
  const password=$('loginPassword').value;
  if(!email||!password)return toast('Saisissez votre e-mail et votre mot de passe.');
  try{
    let r;
    try{
      r=await api('/v1/auth/password',{method:'POST',auth:false,body:{email,password}});
    }catch(error){
      if(!fastCompatFallback(error))throw error;
      r=await supabaseAuth('token?grant_type=password',{email,password});
    }
    if(!r?.access_token)throw new Error('Session FAST incomplète.');
    saveSession(r);
    try { window.FastNative?.commitAutofill?.(); } catch {}
    await enter();
  }catch(error){toast(error.message)}
};

signup=async function(e){
  e.preventDefault();
  const email=$('signupEmail').value.trim();
  const password=$('signupPassword').value;
  const firstName=$('firstName').value.trim();
  const lastName=$('lastName').value.trim();
  const phone=$('phone').value.trim();
  if(!firstName||!lastName||!phone||!email)return toast('Complétez tous les champs du compte FAST.');
  const passwordProblem=fastPasswordProblem(password);
  if(passwordProblem)return toast(passwordProblem);
  const body={email,password,role:$('role').value,first_name:firstName,last_name:lastName,phone};
  try{
    let r;
    try{
      r=await api('/v1/auth/signup',{method:'POST',auth:false,body});
    }catch(error){
      if(!fastCompatFallback(error))throw error;
      const raw=await supabaseAuth('signup',{
        email:body.email,password:body.password,
        data:{role:body.role,first_name:body.first_name,last_name:body.last_name,phone:body.phone,country_code:'CG'}
      });
      r={...raw,session:!!raw.access_token};
    }
    if(r?.access_token){
      saveSession(r);
      try { window.FastNative?.commitAutofill?.(); } catch {}
      toast('Compte FAST créé.');
      await enter();
    }else{
      toast('Compte créé. Vérifiez votre e-mail puis connectez-vous.');
      authMode('login');
    }
  }catch(error){toast(error.message)}
};

recover=async function(){
  const email=$('loginEmail').value.trim();
  if(!email)return toast('Saisissez votre e-mail.');
  try{
    try{
      await api('/v1/auth/recover',{method:'POST',auth:false,body:{email}});
    }catch(error){
      if(!fastCompatFallback(error))throw error;
      await supabaseAuth('recover',{email});
    }
    toast('Lien de réinitialisation envoyé.');
  }catch(error){toast(error.message)}
};

async function loadVehicleDirect(){
  const uid=encodeURIComponent(state.me.id);
  const rows=await rest(`vehicles?select=id,driver_id,make,model,color,plate_number,seats,vehicle_type,photo_path,is_active&driver_id=eq.${uid}&is_active=eq.true&limit=1`);
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}

loadVehicle=async function(){
  if(state.role!=='driver')return;
  try{
    let vehicle;
    try{
      const r=await api('/v1/driver/vehicle');
      vehicle=r.vehicle||null;
    }catch(error){
      if(error.status!==404)throw error;
      vehicle=await loadVehicleDirect();
    }
    state.vehicle=vehicle;
    if(vehicle){
      $('vehicleMake').value=vehicle.make||'';
      $('vehicleModel').value=vehicle.model||'';
      $('vehicleColor').value=vehicle.color||'';
      $('vehiclePlate').value=vehicle.plate_number||'';
      $('vehicleType').value=vehicle.vehicle_type||'standard';
    }
    $('vehicleAlert').classList.toggle('hidden',!!(vehicle?.plate_number&&vehicle?.photo_path));
  }catch(error){
    $('vehicleAlert').classList.remove('hidden');
    console.warn('FAST vehicle load',error.message);
  }
};

function fastVehicleSaveFallback(error){
  const status=Number(error?.status||0);
  const message=String(error?.message||'').toLowerCase();
  return status===404||(!status&&(
    message.includes('failed to fetch')||
    message.includes('networkerror')||
    message.includes('network request failed')
  ));
}

saveVehicle=async function(){
  try{
    let photoPath=state.vehicle?.photo_path||null;
    const file=$('vehiclePhoto').files[0];
    if(file){
      photoPath=`${state.me.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
      await upload('vehicle-photos',photoPath,file);
    }
    const payload={
      make:$('vehicleMake').value.trim(),model:$('vehicleModel').value.trim(),color:$('vehicleColor').value.trim(),
      plate_number:$('vehiclePlate').value.trim().toUpperCase(),vehicle_type:$('vehicleType').value,
      seats:$('vehicleType').value==='xl'?6:4,photo_path:photoPath,is_active:true
    };
    if(!payload.plate_number)return toast('Saisissez l’immatriculation du véhicule.');
    let vehicle;
    try{
      const r=await api('/v1/driver/vehicle',{method:'PUT',body:payload});
      vehicle=r.vehicle||r;
    }catch(error){
      if(!fastVehicleSaveFallback(error))throw error;
      let rows;
      if(state.vehicle?.id){
        rows=await rest(`vehicles?id=eq.${encodeURIComponent(state.vehicle.id)}`,{
          method:'PATCH',body:payload,headers:{Prefer:'return=representation'}
        });
      }else{
        rows=await rest('vehicles',{
          method:'POST',body:{...payload,driver_id:state.me.id},headers:{Prefer:'return=representation'}
        });
      }
      vehicle=Array.isArray(rows)?rows[0]:rows;
    }
    state.vehicle=vehicle;
    toast('Véhicule enregistré.');
    $('vehicleAlert').classList.toggle('hidden',!(vehicle?.plate_number&&vehicle?.photo_path));
  }catch(error){toast(error.message)}
};

pollOffer=async function(){
  try{
    const r=await api('/v1/driver/offers/current');
    const offer=r.offer;
    if(!offer){$('offerCard').classList.add('hidden');state.offer=null;return}
    let ride=r.ride||null;
    if(!ride&&offer.ride_id){
      try{const full=await api(`/v1/rides/${offer.ride_id}`);ride=full.ride||full}catch{}
    }
    ride=ride||{};
    state.offer={...offer,ride};
    $('offerTitle').textContent=`${ride.pickup_address||'Départ'} → ${ride.destination_address||'Destination'}`;
    $('offerPrice').textContent=money(offer.offered_price||ride.customer_proposed_price||ride.estimated_price||0,offer.currency||ride.currency||'XAF');
    $('offerEta').textContent=offer.eta_min?`${offer.eta_min} min`:'—';
    $('offerDistance').textContent=offer.distance_km?`${Number(offer.distance_km).toFixed(1)} km`:'—';
    $('offerInfo').textContent=[paymentLabel(ride.payment_method||''),ride.estimated_distance_km?`${Number(ride.estimated_distance_km).toFixed(1)} km de trajet`:null].filter(Boolean).join(' • ');
    $('offerCard').classList.remove('hidden');
  }catch(error){console.warn('FAST offer poll',error.message)}
};

window.FAST_COMPAT_READY=true;
