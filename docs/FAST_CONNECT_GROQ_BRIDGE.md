# FAST Connect — GroqCloud (18 rôles)

Intégration **FAST Connect uniquement**. Elle ne concerne pas l'application chauffeur/client ni Talent Congo.

## Déjà installé

- Edge Function privée `fast-connect-groq` du projet Supabase `hmwxwzfcpdvgzjgxruup`, JWT requis.
- Lecture de la demande avec **le jeton du membre connecté** (politiques RLS), puis vérification de son appartenance et du canal.
- 18 fiches de rôle chargées depuis `fast_discussion_agents`, **un moteur Groq et une clé commune**.
- Uniquement le texte de la demande du membre et les indications non confidentielles du rôle sont envoyés à Groq.
- Réponse insérée dans le même canal avec préfixe `[GroqCloud · openai/gpt-oss-120b]`, `reply_to` et code d'agent ; file marquée `answered` après sauvegarde.
- Blocage des clés qui apparaissent dans une demande ; aucune commande DELETE/DROP/TRUNCATE ; aucun droit supplémentaire au client.
- L'ancienne automatisation ChatGPT reste en place tant que la migration n'a pas réussi son premier test réel.

## Étape indispensable : configurer la clé secrète dans Supabase

1. Ouvrir <https://console.groq.com/keys>, générer une clé API personnelle Groq.
2. Ouvrir **Supabase Dashboard > projet FAST > Edge Functions > Secrets** : <https://supabase.com/dashboard/project/hmwxwzfcpdvgzjgxruup/settings/functions>.
3. Ajouter `GROQ_API_KEY` avec la valeur dans l'interface sécurisée Supabase. **Ne jamais publier une clé dans le chat, GitHub, l'APK ou une variable `VITE_*`.**
4. Optionnel : `GROQ_MODEL=openai/gpt-oss-120b`. Les quotas/règles de modèle de votre organisation peuvent changer.
5. Une fois connecté à FAST Connect, appeler `supabase.functions.invoke('fast-connect-groq', {body:{request_id: id}})` pour une demande **déjà enregistrée** ; seule son auteur peut demander la génération.

## Raccordement au site FAST Connect (interface privée)

Après avoir enregistré `fast_discussion_messages`, puis `fast_discussion_agent_requests`, récupérer l'ID réel de la demande :

```js
const { data: request, error: queueError } = await supabase
  .from('fast_discussion_agent_requests')
  .insert({
    message_id: message.id,
    channel_slug: selectedChannel,
    agent_code: selectedAgentCode,
    requested_by: session.user.email.toLowerCase(),
    status: 'pending',
  })
  .select('id').single();
if (queueError) throw queueError;
const { data: answer, error: groqError } =
  await supabase.functions.invoke('fast-connect-groq', {
    body: { request_id: request.id },
  });
if (groqError) {
  // Keep the message/request intact. Display a retry option.
  console.warn('Réponse Groq différée :', groqError.message);
}
```

Ce fragment doit être adapté à **la source ACTUELLEMENT déployée** sur Vercel, et non appliqué aveuglément à une archive antérieure ; un déploiement sans récupération de la version courante pourrait écraser l'interface Entraide et ses corrections.

## Tests et limites

- Edge Function déployée avec `verify_jwt=true` ; une requête non authentifiée doit être refusée.
- Santé du modèle Groq : **non vérifiée tant que `GROQ_API_KEY` n'est pas enregistré**.
- Test bout en bout : connexion d'un utilisateur FAST, demande dans un canal autorisé, réponse Groq, mise à jour `answered`, aucune fuite intercanaux, aucune suppression, validation N+1.
- Groq peut répondre `429` lorsque le compte atteint ses quotas ; la demande reste en attente et l'interface peut proposer un nouvel essai.
- `sender_kind='agent_chatgpt'` demeure le type d'enregistrement *hérité* imposé par le schéma actuel et son index anti-doublon ; le texte et le nom de l'expéditeur identifient Groq sans ambiguïté.
