# BOSSES — Phantom Blade Zero

Le catalogue propose **59 rencontres classées par chapitre**. Préparez votre équipement chez Inanis et choisissez un combat unique ou une série. **0.7.0-preview.5 expérimentale — Steam build 26367565.** La liste contient des spoilers.

Cette version reprend la libération des commandes après les introductions et le retour au refuge après l’échec de **66 HITS**. Le catalogue propose 59 rencontres, avec une validation détaillée encore partielle. Le test ciblé 66 HITS confirme le retour chez Inanis et l’arrêt du chronomètre. La fin de Xue reste à vérifier ; 22 rencontres demandent une vérification manuelle des phases, finitions ou de leur fin encore incertaine.

Le [registre par combat](mod/Validation/QA-r7.md) et le [rapport détaillé](mod/Validation/validation.json) distinguent démarrage, commandes et victoire. Les essais moteur ne certifient ni les périphériques physiques ni une victoire jouée ; chaque preuve reste liée à sa compilation. Les [22 vérifications manuelles](mod/Validation/QA-r7.md#combats-à-terminer-manuellement) concernent les phases, finitions, variantes incertaines et les fins de Xue et de l’épreuve II.

![Configuration d’une run](mod/Captures/08-run-configuration.png)

## Installer

Windows, pare-feu Windows actif, droits administrateur, une seule campagne locale. Chemin Steam actuellement pris en charge :

```text
C:\Program Files (x86)\Steam\steamapps\common\PBZ
```

1. Après une mise à jour du jeu, le lancer une fois depuis **Steam en ligne, sans mod**, atteindre le menu principal et le fermer.
2. [Télécharger BOSSES](https://github.com/kevinbarfleur/phantom-blade-zero-bosses/releases/download/v0.7.0-preview.5/PBZ-Bosses-0.7.0-preview.5.zip) et tout extraire dans un dossier permanent et inscriptible. Le dossier [`mod/`](mod/) du dépôt fournit le même paquet.
3. Télécharger séparément le ZIP officiel **[PBZModLoader 1.0.0 de LLKKFF](https://www.nexusmods.com/phantombladezero/mods/113?tab=files&file_id=1832)**. Le garder tel quel dans Téléchargements ; le lanceur vérifie son empreinte. Ce chargeur n’est pas redistribué ici.
4. Lancer **`Lancer-Bosses.cmd` normalement**, puis accepter la demande Windows du gardien. Celui-ci sauvegarde la campagne, bloque temporairement le réseau et installe la session.

Pour changer de version, restaurer d’abord avec le `Restaurer-Campagne.cmd` de l’ancienne version, puis extraire la nouvelle dans un autre dossier. Un autre chargeur ou proxy DLL déjà installé empêche le lancement. Conserver une copie indépendante de la campagne.

## Jouer

**BOSSES** ouvre le refuge d’Inanis. Préparer et tester son équipement dans l’inventaire natif, puis parler à **Inanis** ou appuyer sur **F8** pour choisir un boss.

| Réglage | Choix |
|---|---|
| Parcours | Combat unique ou série, à partir du boss choisi |
| Difficulté | Voyageur, Pionnier, Explorateur des enfers ou 66 HITS |
| Chronomètre | Désactivé ou activé |

**Haut/Bas** choisit la ligne ; **Gauche/Droite** change la valeur. À la souris, utiliser les flèches. Descendre sur **Commencer**, puis maintenir le bouton indiqué pendant 1,5 seconde. Retour annule les réglages en cours.

L’arsenal comprend **24 armes, 24 lames spectrales, 51 accessoires et 15 remèdes obtenables en campagne**, indépendamment de vos découvertes. Niveau 30 et forge au refuge ; les niveaux s’adaptent ensuite au combat, sans bonus NG+. Les récompenses d’équipement sont supprimées pour éviter les doublons. L’équilibrage reste provisoire.

Les introductions utilisent les événements ou déclencheurs natifs identifiés. Sans introduction, le mod place le personnage face à l’adversaire. La pose de départ a été corrigée ; le cadrage et la fluidité restent à vérifier visuellement pour chaque rencontre. En cas d’initialisation non confirmée, un menu permet de réessayer ou de retourner au refuge.

Une mort normale relance le combat avec l’équipement conservé et les remèdes remplis. **SYSTÈME → Quitter le jeu** propose aussi **Recommencer le combat** et **Retourner à l’entraînement**. Après victoire : rejouer, choisir un autre boss ou revenir au refuge ; en série, le suivant part automatiquement.

## Chronomètre et 66 HITS

- **Combat unique :** temps de la tentative, remis à zéro après une mort ou un recommencement.
- **Série :** temps de combat cumulé, tentatives perdues comprises. Choisir le premier boss pour une série complète.
- Chargements, pauses et cinématiques reconnues sont exclus ; les QTE détectés comptent. La mesure reste indicative.
- **66 HITS :** difficulté Explorateur des enfers et budget partagé de 66 coups ennemis. **Le 66e coup provoque la mort, arrête la run et ramène automatiquement chez Inanis**, avec un message de fin et le dernier combat atteint. L’enchaînement est annulé. Une nouvelle configuration lance un nouveau défi.
- Soins, mort normale et recommencement d’un combat ne rendent aucun coup. Retour au refuge abandonne la run ; fermeture du jeu ne permet pas de la reprendre. « Détection à vérifier » indique une origine de dégâts non identifiée.

## Restaurer et limites

**Fermer le jeu et attendre la restauration avant de reprendre la campagne.** Le gardien vérifie les originaux, retire les fichiers temporaires et rétablit le réseau. L’arsenal du refuge ne rejoint pas la campagne.

Après un crash ou redémarrage brutal, fermer le jeu et lancer **`Restaurer-Campagne.cmd` depuis le dossier de la session**. Garder `.state` et `.dependencies` jusqu’à la restauration. Pour désinstaller : restaurer, puis supprimer le dossier.

- Vérifier **BOSSES 0.7.0-preview.5** à l’écran titre. Voir le registre pour les entrées confirmées, partielles et restant à tester.
- Les transitions tardives, QTE finaux, projectiles, dégâts périodiques et parades nécessitent encore des essais. Manette physique et vibration restent à confirmer. De brefs artefacts visuels ou sonores de transition peuvent subsister.
- La fin de **Xue** et de **l’épreuve II** reste à confirmer en combat joué. Les diagnostics ne suffisent pas à conclure à un blocage en partie normale. Le démarrage de **Hua Qianxiao**, corrigé puis repris trois fois, reste sous surveillance.
- La stabilité des longues séries et des réglages graphiques habituels reste à valider. Les essais ont utilisé temporairement 30 FPS, puis le préréglage Faible ; le mod public n’impose pas ces réglages. Méthodes, incidents et limites sont détaillés dans le registre.
- Cinq séquences restent exclues : deux rencontres du prologue avec Zuo Shang, le chariot, la première apparition de Yucong et Hansui.
- Autres builds, chemins Steam personnalisés, plusieurs profils, autres mods et écrans autres que 16:9 ne sont pas pris en charge.
- Le blocage réseau et la neutralisation des chemins de succès identifiés ne garantissent pas l’absence de sanction. Si le jeu exige une connexion, restaurer puis effectuer un lancement normal en ligne avant de réessayer.

Mod communautaire expérimental, sans affiliation aux développeurs. Le jeu et PBZModLoader doivent être obtenus séparément auprès de leurs auteurs.
