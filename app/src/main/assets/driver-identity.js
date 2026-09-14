/* FAST N°1 — driver identity photos + native ride-offer notifications. */
(() => {
  let lastNotifiedOfferId = null;
  const rideIdentityCache = new Map();

  function ensureDriverPhotoField() {
    const profile = document.querySelector('#profileView .overlay-card.form');
    const save = document.getElementById('saveProfileBtn');
    if (!profile || !save) return null;
    let field = document.getElementById('driverPhotoField');
    if (field) return field;
    field = document.createElement('label');
    field.id = 'driverPhotoField';
    field.className = 'driver-photo-field hidden';
    field.innerHTML = `Photo du chauffeur
      <input id="driverPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">
      <div id="driverPhotoPreview" class="driver-photo-preview hidden"></div>
      <small>Cette photo sera affichée au client quand vous acceptez une course.</small>`;
    profile.insertBefore(field, save);
    const input = field.querySelector('#driverPhoto');
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      const preview = field.querySelector('#driverPhotoPreview');
      if (!file || !preview) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = '';
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Aperçu photo chauffeur';
      preview.appendChild(image);
      preview.classList.remove('hidden');
    });
    return field;
  }

  function syncDriverPhotoField() {
    const field = ensureDriverPhotoField();
    if (!field) return;
    field.classList.toggle('hidden', state.role !== 'driver');
  }

  const previousLoadMe = window.loadMe;
  if (typeof previousLoadMe === 'function') {
    window.loadMe = async function loadMeWithDriverPhoto() {
      const result = await previousLoadMe();
      syncDriverPhotoField();
      return result;
    };
  }

  const previousSaveProfile = window.saveProfile;
  if (typeof previousSaveProfile === 'function') {
    window.saveProfile = async function saveProfileWithDriverPhoto() {
      if (state.role === 'driver' && state.me?.id) {
        const file = document.getElementById('driverPhoto')?.files?.[0];
        if (file) {
          if (!String(file.type || '').startsWith('image/')) return toast('Sélectionnez une image pour la photo du chauffeur.');
          if (file.size > 8 * 1024 * 1024) return toast('La photo du chauffeur ne doit pas dépasser 8 Mo.');
          const safeName = String(file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
          const photoPath = `${state.me.id}/${Date.now()}-${safeName}`;
          try {
            await upload('driver-photos', photoPath, file);
            await rest(`profiles?id=eq.${encodeURIComponent(state.me.id)}`, {
              method: 'PATCH',
              body: { avatar_url: photoPath },
              headers: { Prefer: 'return=minimal' },
            });
          } catch (error) {
            return toast(error.message || 'Impossible d’enregistrer la photo du chauffeur.');
          }
        }
      }
      return previousSaveProfile();
    };
  }

  function bindProfileSave() {
    const button = document.getElementById('saveProfileBtn');
    if (button && typeof window.saveProfile === 'function') button.onclick = window.saveProfile;
  }

  function ensureIdentityPhotoPair() {
    const card = document.getElementById('driverCard');
    const avatar = document.getElementById('driverAvatar');
    if (!card || !avatar) return null;
    let pair = document.getElementById('driverIdentityPhotos');
    if (pair) return pair;
    pair = document.createElement('div');
    pair.id = 'driverIdentityPhotos';
    pair.className = 'driver-identity-photos';
    card.insertBefore(pair, card.firstChild);
    pair.appendChild(avatar);
    const vehicle = document.createElement('img');
    vehicle.id = 'driverVehiclePhoto';
    vehicle.className = 'driver-vehicle-photo hidden';
    vehicle.alt = 'Véhicule du chauffeur';
    pair.appendChild(vehicle);
    card.classList.add('driver-card-with-photos');
    return pair;
  }

  function renderIdentityPhotos(payload) {
    const driver = payload?.driver || {};
    const vehicle = payload?.vehicle || {};
    const avatar = document.getElementById('driverAvatar');
    if (!avatar) return;
    ensureIdentityPhotoPair();

    const driverPhoto = String(driver.photo_url || '').trim();
    avatar.innerHTML = '';
    if (driverPhoto) {
      const image = document.createElement('img');
      image.src = driverPhoto;
      image.alt = 'Photo du chauffeur';
      image.onerror = () => {
        avatar.innerHTML = '';
        avatar.textContent = (driver.first_name?.[0] || 'F').toUpperCase();
      };
      avatar.appendChild(image);
    } else {
      avatar.textContent = (driver.first_name?.[0] || 'F').toUpperCase();
    }

    const vehiclePhoto = document.getElementById('driverVehiclePhoto');
    if (vehiclePhoto) {
      const url = String(vehicle.photo_url || '').trim();
      if (url) {
        vehiclePhoto.src = url;
        vehiclePhoto.classList.remove('hidden');
      } else {
        vehiclePhoto.removeAttribute('src');
        vehiclePhoto.classList.add('hidden');
      }
    }
  }

  async function fetchRideIdentity(rideId) {
    if (!rideId || !token()) return null;
    if (rideIdentityCache.has(rideId)) return rideIdentityCache.get(rideId);
    const request = (async () => {
      const response = await fetch(`${SUPA}/functions/v1/fast-ride-identity`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ride_id: rideId }),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      return data?.ok ? data : null;
    })().catch(() => null);
    rideIdentityCache.set(rideId, request);
    return request;
  }

  function hydrateIdentityIfNeeded(payload) {
    if (state.role !== 'client') return;
    const rideId = payload?.ride?.id || state.ride?.id;
    if (!rideId) return;
    const hasDriverPhoto = !!String(payload?.driver?.photo_url || '').trim();
    const hasVehiclePhoto = !!String(payload?.vehicle?.photo_url || '').trim();
    if (hasDriverPhoto && hasVehiclePhoto) return;
    fetchRideIdentity(rideId).then(identity => {
      if (!identity || state.ride?.id !== rideId) return;
      renderIdentityPhotos({
        ...payload,
        driver: { ...(payload?.driver || {}), ...(identity.driver || {}) },
        vehicle: { ...(payload?.vehicle || {}), ...(identity.vehicle || {}) },
      });
    });
  }

  const previousRenderDriverClient = window.renderDriverClient;
  if (typeof previousRenderDriverClient === 'function') {
    window.renderDriverClient = function renderDriverClientWithPhotos(payload) {
      previousRenderDriverClient(payload);
      renderIdentityPhotos(payload);
      hydrateIdentityIfNeeded(payload);
    };
  }

  const previousPollOffer = window.pollOffer;
  if (typeof previousPollOffer === 'function') {
    window.pollOffer = async function pollOfferWithNativeNotification() {
      await previousPollOffer();
      const offer = state.offer;
      if (!offer?.id || offer.id === lastNotifiedOfferId) return;
      lastNotifiedOfferId = offer.id;
      const ride = offer.ride || {};
      const amount = offer.offered_price || ride.customer_proposed_price || ride.estimated_price || 0;
      const currency = offer.currency || ride.currency || 'XAF';
      const title = 'Nouvelle course FAST';
      const route = `${ride.pickup_address || 'Départ'} → ${ride.destination_address || 'Destination'}`;
      const body = amount ? `${route} • ${money(amount, currency)}` : route;
      if (window.FastNative?.notifyRideOffer) {
        window.FastNative.notifyRideOffer(String(offer.id), title, body);
      }
    };
  }

  function bootIdentity() {
    ensureDriverPhotoField();
    syncDriverPhotoField();
    bindProfileSave();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootIdentity);
  else bootIdentity();
})();
