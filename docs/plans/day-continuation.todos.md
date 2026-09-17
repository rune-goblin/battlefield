# Day continuation

Date: 2026-09-16. Status: implemented in Battlefield.

- Recovery declarations cover both armies before any roll. Rally and Treat Wounded share each side's participation penalty, and every participant applies its current disorder once.
- Both failure degrees leave the target unchanged. Critical treatment removes two wounds and grants no morale.
- Both sides must retain standing units to continue after dusk. The report keeps casualty records while deployment excludes them.
- Earlier losses remain in the report and log. The half-army morale penalty was removed on 2026-09-17.
- Temporary effects expire after pending dusk wounds resolve. Emplacements retain their locations; home-zone dropdowns let players adjust automatic survivor deployment.
- Six rounds remains the default; setup offers eight. Existing saves migrate without replacing morale values.
- ReignMaker's Routed condition, paid Rally Troops action and turn-end disbanding remain external integration work under reignmaker-feedback#2. The adapter contract uses a single morale value and requires stats before the morale penalty.
- The report now provides Propose surrender, Withdraw and Hold the field for each side. The opponent must accept surrender; players agree its terms. Dusk withdrawal preserves survivors and awards the field to the army that holds, or leaves it contested if both withdraw. Pursuit and random night events remain proposals for a later pass. End battle retains the existing return-to-setup behavior.
- Follow-up: the report now leads through Battlefield, Recovery and Deployment. Players choose the same field or generate a new map with terrain, feature and fortification controls. A map preview accompanies selection and survivor placement.
- The chosen new board persists across reloads. Map changes preserve committed recovery rolls. Old terrain and stationary or abandoned equipment remain in the campaign handoff archive; crewed attached engines travel with survivors.
- Playtest the −2 penalty per extra recovery participant together with disorder, and the pace of two-wound critical recovery.

## Recovery table — 2026-09-17

- The flow is Report → Recovery → Orders → Battlefield → Deployment. Recovery commits both sides’ choices in one operation before withdrawal or hold decisions.
- A single table groups units by army and nests None, flag/Morale and heart/Health under Recovery. Native radio buttons enforce one activity per unit. Full tracks and casualties disable their unavailable options.
- The footer shows separate participation modifiers for attacker and defender. Roll Recovery commits all checks; the table shows all results and disables further rolls. Zero participants use Continue without recovery.
- Refresh resumes after committed recovery; decisions from older saves clear when recovery resolves. Pursuit and withdrawal costs remain separate follow-up work.
