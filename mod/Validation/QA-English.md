# BOSSES — English validation summary

This document accompanies **0.7.0-preview.6**. It preserves the scope of the earlier preview.5 evidence; translation and repackaging do not repeat or certify those tests. The catalogue has **59 active encounters**, with **60 historical identities** retained after merging the duo’s duplicate entry. **22 active encounters require specific manual follow-ups**; the historical register has 23 qualifications.

## What the evidence means

| Area | Observed evidence and scope | What is not established |
|---|---|---|
| Encounter coverage | All 59 active entries have an imported completed diagnostic scenario | A completed scenario can contain partial checks or an error; it is not a completed fight |
| Entry and controls | Native routing and engine-driven movement, targeting, attacks and pause were sampled separately | Physical keyboard/controller behavior and uninterrupted control through every phase |
| Facing | 35 profiles without a direct authored intro sequence were retested: 33 attributable pose updates, 2 native introductions | Every first visible frame and every camera angle; numerical alignment is not a complete visual check |
| 66 HITS | A targeted test observed the native death path, automatic return to Inanis and a stopped timer | Every damage source, projectile, damage-over-time tick or parry edge case |
| Public preview.5 loading | Title → refuge → native inventory, level-30 equipment, then inventory closure were observed on the public payload | Other brief automated key presses were inconclusive; neither full physical controls nor fight launch was certified by this smoke |
| Restoration | The prior session verified 30 original files, removed 117 temporary files and 18 firewall rules, with no extra saves remaining | Restoration of a future session must be verified separately |
| Preview.6 public loading | Exact final payload: title, mouse activation of BOSSES, level-30 native inventory, Escape closure and refuge observed; loader reported one mod loaded and zero failures | Brief automated E/F8 inputs did not open the selector; fight launch, controller input and full victories were not certified |
| Preview.6 timer | A new live diagnostic screenshot shows the compact upper-right timer and the 4/66 counter | The frame is not a new complete 66-hit test or a full-series timing validation |
| Preview.6 system menu | One highlighted action; mouse opened the restart confirmation and cancelled it, then confirmed Return to Training and reached Inanis | The actual restart and physical controller behavior were not exercised in this check |

The earlier public payload was `d4ec01cecc41e69494f65d3146284c72b374056932fb6b6c89194d8b6fcaa4f2`. Other diagnostic evidence uses its own recorded build hashes. The earlier final natural regression of the first three encounters completed without errors, on a separate diagnostic payload.

The new system-menu check used private diagnostic payload `187433ecfcaf6e485aab7e6a8493f9b9726767c12401cbba9570940a472e1376`. Returning to Inanis left the run inactive, with its timer stopped at 4,561 ms and five hits recorded. This is distinct from the final public build’s smoke test, whose result is recorded in [validation.json](validation.json). The new English screenshots were captured in game; engine-guided navigation used for the tour does not establish physical keyboard or controller control.

At this documentation checkpoint, **391 source tests**, **20 launcher checks** and **7 packaging-contract tests** passed. The isolated tests of the final packaged sources are recorded separately; these figures do not claim they have already run.

Many ending tests used a simulated kill. The standard harness could also attempt to lower the minimum-health floor, except in the specially scoped BigBro support sequence. Xue’s latest ending test instead reduced health to a positive value and sent native engine attack input. Neither method is a fully played victory. A changed health floor alone does not prove a native phase transition.

## Manual follow-ups

Play these encounters through their final victory, including any transformations, summons, executions or QTEs. Then verify the result menu and, separately, automatic progression in series mode. Names use the game’s native English localization; trial labels identify the mod’s separate variants.

| Encounter | Check still required |
|---|---|
| Peng Meng, the Axemaster | Perform the native final execution; a forced kill does not reproduce the finisher’s removal of the health lock |
| The Hunt, Sixfold Scythe | The native entry begins with an earlier form; play through the transformation and final victory |
| Jing Ye, the Outlaw | Complete the mounted-to-ground transition and the ground phase |
| Bai Chilian, Lady of the Twin Serpents | Complete all forms/stages and final victory |
| Mu Xiaokui, Young Mistress of the Order | Complete all stages and final victory |
| Jade Dancer & Iron Fiend | Complete the duo and final QTE; the old duplicate entry is not a second selectable fight |
| Blaze, Shadow Warden Captain | Complete all stages and final victory |
| Chang Hong, the Thunder Spear | Complete all stages and final victory |
| Flame, the Mask-Bound Lion Dance Grandmaster | Complete all stages; also check pause outside the native grab sequence that interrupted the diagnostic |
| Corpse-Eating Xue | Confirm a normally played ending with summons present. Reduced-health attack tests observed death followed by a new actor; the cause and normal-play outcome remain unconfirmed |
| Chief Disciple of the Seven-Stars Formation | Play the formation’s successive stages; the earlier diagnostic observed the first-stage group, not a live second-stage group |
| Bi Feng, Giant Saber Commander | Perform the native ending execution/performance and confirm victory |
| Jade-Face | Confirm which stages the shared encounter graph actually uses, then complete the fight |
| Huangxing, the Kunlun Renegade | Complete all stages and final victory |
| Yucong, No. 34 Twisted Puppet | Complete all stages and final victory |
| Lei Dang, the Tiger Cannon | Let the long introduction finish or skip it, then complete all stages and final victory |
| The Crusher and the Saw | Complete the combined encounter and final victory |
| Leng Tu, Herald of the Veil | Play through the summoned stages and the native final phase |
| Meng Hua, The Merciful Lady of the Blossom Veil | Complete the native health-threshold phase transition and final victory; also review framing after the introduction |
| Zuo Shang, the Order’s Shadow Sovereign | Complete all stages and final victory |
| The Gold-Masked One — Trial II | Confirm the ending manually: the latest diagnostic stayed at 1 HP, whereas an earlier test completed. No extra mandatory phase or normal-play softlock is established |
| The Gold-Masked One — Trial V | Perform the native final execution and confirm victory; this qualification does not automatically apply to Trials I–IV |

## Remaining focused checks

- **Hua Qianxiao:** the identified introduction-graph replacement issue was corrected. Two natural chained entries and one actually skipped intro succeeded afterward. Keep monitoring; the replacement-after-dispatch branch was covered by unit tests, not observed again live after the fix.
- **Master Bi Hai and Dusk, the Puppeteer:** observed locked classes match native summons. That is not proof of locking an unrelated enemy, but it does not confirm primary-boss targeting. The exact owner of the observed instance was not measured. Primary damage is assessed separately.
- **Blizzard Blademaster:** native frost/frozen tags were observed during the limited-control window. Physical recovery after the effect still needs a player check; this was not promoted to a movement pass.
- **Visual transitions:** some black frames are native loading screens with controls still blocked. In the targeted Jing Ye observation, health remained full and the next capture showed gameplay; this does not certify every transition. A targeted early Red capture showed the player facing the opponent on the perch, without proving the full fight.
- **Long sessions:** small batches do not establish long-run stability. One private combined preview.6 tour was deliberately stopped after available RAM fell below its 2.5 GiB guard threshold; this is neither a spontaneous-crash report nor a stability pass. An earlier interrupted duo observation had a save-read failure before the helper requested shutdown; the preceding game state remains uncertain.

Earlier tests temporarily used 30 FPS and, later, the native Low preset with ray tracing disabled. The Low/RT setting was confirmed after the targeted 66 HITS test. Those conditions do not certify the usual graphics settings; the public mod does not impose the private test profile.

## Recording a manual result

Record the mod version/build hash, Steam build, encounter, format, difficulty, timer and 66 HITS settings, and whether the intro ended naturally or was skipped. Keep these outcomes separate: first visible frame and facing; physical movement/attack/lock/pause; all phases/QTEs; final victory; retry; and next encounter. A success in one column must not erase an unresolved result in another.

The detailed historical register and raw status fields remain available in [validation.json](validation.json) and [r7-validation-register.json](r7-validation-register.json). Their original notes may be French. This English summary explains the current limitations without rewriting those historical observations.
