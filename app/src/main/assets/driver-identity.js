/* FAST N°1 — driver identity photos + native ride-offer notifications. */
(() => {
  let lastNotifiedOfferId = null;

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
      syncIdentityDocumentsPanel();
      if (state.role === 'driver') refreshIdentityDocuments();
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

  const previousRenderDriverClient = window.renderDriverClient;
  if (typeof previousRenderDriverClient === 'function') {
    window.renderDriverClient = function renderDriverClientWithPhotos(payload) {
      previousRenderDriverClient(payload);
      renderIdentityPhotos(payload);
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

  function ensureIdentityDocumentsStyles() {
    if (document.getElementById('fastIdentityDocumentsStyles')) return;
    const style = document.createElement('style');
    style.id = 'fastIdentityDocumentsStyles';
    style.textContent = `
      .driver-identity-documents{display:grid;gap:10px;margin:14px 0;padding:14px;border:1px solid #dfe7f1;border-radius:14px;background:#f8fbff}
      .driver-identity-documents.hidden{display:none!important}
      .driver-identity-documents h3{margin:0;font-size:15px}
      .driver-identity-documents p{margin:0;font-size:12px;color:#667085;line-height:1.45}
      .driver-identity-document-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .driver-identity-document-grid label{display:grid;gap:5px;font-size:12px;font-weight:700;color:#344054}
      .driver-identity-document-grid input,.driver-identity-document-grid select{width:100%}
      .driver-identity-document-file{grid-column:1/-1}
      .driver-identity-document-send{border:0;border-radius:10px;padding:11px 14px;background:#0b57d0;color:#fff;font-weight:800}
      .driver-identity-document-send:disabled{opacity:.6}
      .driver-identity-document-list{display:grid;gap:7px}
      .driver-identity-document-item{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:9px 10px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;font-size:12px}
      .driver-identity-document-item strong{display:block;color:#101828}
      .driver-identity-document-status{font-weight:800;white-space:nowrap}
      .driver-identity-document-status.pending{color:#b54708}
      .driver-identity-document-status.approved{color:#067647}
      .driver-identity-document-status.rejected{color:#b42318}
      .driver-identity-document-reason{display:block;margin-top:3px;color:#b42318}
      @media(max-width:560px){.driver-identity-document-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function identityDocumentLabel(type) {
    const labels = {
      identity: 'Pièce d’identité',
      license: 'Permis de conduire',
      vehicle_registration: 'Carte grise',
      insurance: 'Assurance du véhicule',
    };
    return labels[String(type || '')] || String(type || 'Document');
  }

  function identityDocumentStatus(status) {
    const labels = {
      pending: 'En attente',
      approved: 'Validé',
      rejected: 'Refusé',
    };
    return labels[String(status || '')] || String(status || '');
  }

  function ensureIdentityDocumentsPanel() {
    const profile = document.querySelector('#profileView .overlay-card.form');
    const save = document.getElementById('saveProfileBtn');
    if (!profile || !save) return null;

    ensureIdentityDocumentsStyles();

    let panel = document.getElementById('driverIdentityDocumentsPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'driverIdentityDocumentsPanel';
    panel.className = 'driver-identity-documents hidden';
    panel.innerHTML = `
      <h3>Vérification d’identité</h3>
      <p>Envoyez vos justificatifs. Ils seront transmis au centre de pilotage FAST pour contrôle avant validation de votre identité.</p>
      <div class="driver-identity-document-grid">
        <label>Type de document
          <select id="driverIdentityDocumentType">
            <option value="identity">Pièce d’identité (CNI ou passeport)</option>
            <option value="license">Permis de conduire</option>
          </select>
        </label>
        <label>Date d’expiration
          <input id="driverIdentityDocumentExpiry" type="date">
        </label>
        <label class="driver-identity-document-file">Fichier
          <input id="driverIdentityDocumentFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif">
        </label>
      </div>
      <button id="driverIdentityDocumentSend" class="driver-identity-document-send" type="button">Envoyer pour vérification</button>
      <div id="driverIdentityDocumentList" class="driver-identity-document-list"></div>
    `;
    profile.insertBefore(panel, save);

    const send = panel.querySelector('#driverIdentityDocumentSend');
    if (send) send.onclick = uploadIdentityDocument;
    return panel;
  }

  function syncIdentityDocumentsPanel() {
    const panel = ensureIdentityDocumentsPanel();
    if (!panel) return;
    panel.classList.toggle('hidden', state.role !== 'driver');
  }

  async function refreshIdentityDocuments() {
    const list = document.getElementById('driverIdentityDocumentList');
    if (!list || state.role !== 'driver' || !state.me?.id) return;

    try {
      const uid = encodeURIComponent(state.me.id);
      const docs = await rest(`driver_documents?select=id,document_type,file_name,status,rejection_reason,expires_at,created_at&driver_id=eq.${uid}&order=created_at.desc&limit=20`);
      const rows = Array.isArray(docs) ? docs : [];
      if (!rows.length) {
        list.innerHTML = '<small>Aucun document envoyé pour le moment.</small>';
        return;
      }
      list.innerHTML = rows.map((doc) => {
        const status = String(doc.status || 'pending');
        const reason = status === 'rejected' && doc.rejection_reason
          ? `<span class="driver-identity-document-reason">${String(doc.rejection_reason).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span>`
          : '';
        const expiry = doc.expires_at ? ` • expire le ${new Date(`${doc.expires_at}T00:00:00`).toLocaleDateString('fr-FR')}` : '';
        return `<div class="driver-identity-document-item">
          <div><strong>${identityDocumentLabel(doc.document_type)}</strong><span>${String(doc.file_name || 'Fichier').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}${expiry}</span>${reason}</div>
          <span class="driver-identity-document-status ${status}">${identityDocumentStatus(status)}</span>
        </div>`;
      }).join('');
    } catch (error) {
      list.innerHTML = '<small>Impossible de charger vos documents pour le moment.</small>';
    }
  }

  async function uploadIdentityDocument() {
    if (state.role !== 'driver' || !state.me?.id) return toast('Connectez-vous comme chauffeur pour envoyer un document.');

    const fileInput = document.getElementById('driverIdentityDocumentFile');
    const typeInput = document.getElementById('driverIdentityDocumentType');
    const expiryInput = document.getElementById('driverIdentityDocumentExpiry');
    const send = document.getElementById('driverIdentityDocumentSend');
    const file = fileInput?.files?.[0];

    if (!file) return toast('Sélectionnez un document à envoyer.');

    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]);
    if (!allowed.has(String(file.type || '').toLowerCase())) {
      return toast('Format accepté : PDF, JPG, PNG, WEBP ou HEIC.');
    }
    if (file.size > 12 * 1024 * 1024) return toast('Le document ne doit pas dépasser 12 Mo.');

    const safeName = String(file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${state.me.id}/${Date.now()}-${safeName}`;
    const documentType = String(typeInput?.value || 'identity');
    const expiresAt = expiryInput?.value || null;
    const countryCode = String(state.me?.country_code || state.country?.code || 'CG').toUpperCase().slice(0, 2);

    if (send) {
      send.disabled = true;
      send.textContent = 'Envoi…';
    }

    try {
      await upload('driver-documents', storagePath, file);
      await rest('driver_documents', {
        method: 'POST',
        body: {
          driver_id: state.me.id,
          document_type: documentType,
          storage_path: storagePath,
          file_name: safeName,
          mime_type: file.type || null,
          file_size_bytes: file.size,
          expires_at: expiresAt,
          country_code: countryCode || 'CG',
        },
        headers: { Prefer: 'return=minimal' },
      });
      if (fileInput) fileInput.value = '';
      if (expiryInput) expiryInput.value = '';
      toast('Document envoyé pour vérification.');
      await refreshIdentityDocuments();
    } catch (error) {
      toast(error.message || 'Impossible d’envoyer le document.');
    } finally {
      if (send) {
        send.disabled = false;
        send.textContent = 'Envoyer pour vérification';
      }
    }
  }

  function bootIdentity() {
    ensureDriverPhotoField();
    syncDriverPhotoField();
    ensureIdentityDocumentsPanel();
    syncIdentityDocumentsPanel();
    bindProfileSave();
    if (state.role === 'driver') refreshIdentityDocuments();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootIdentity);
  else bootIdentity();
})();
