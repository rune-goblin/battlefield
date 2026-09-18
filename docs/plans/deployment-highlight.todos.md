# Deployment highlights

Date: 2026-09-18.

- Shade every hex in the deployment ranks, including occupied hexes and water, so the zone stays continuous as units arrive.
- Validate destinations separately with the existing placement service. Show a red fill and outline for the current invalid destination, covering occupied hexes, water and ranks outside the selected unit's deployment zone.
- Track both board-token drags and native tray drags. Clear selection and hover when the side changes.
- Build, type checks and 501 tests passed. Browser visual verification was blocked while Chrome was in use and computer-use access to Edge was denied.
