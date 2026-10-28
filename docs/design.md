# Compact stopwatch design

A compact, accessible interface inspired by a physical stopwatch.

- Near-black shell, restrained charcoal surfaces, neon green for primary actions
  and meaningful numbers. Use the local seven-segment font for target displays.
- Home is a fixed five-item game menu. No eyebrow, tagline, dummy timer, rules,
  player editor, promotional cards, or large installation panel. Resume belongs
  on the relevant game row. Clear data stays at the bottom.
- Use one compact navigation header and one primary action. Keep actions outside
  overflowing lists so they remain reachable without scrolling to the bottom.
- Rules and match management open on request. Never open a dialog during a running interval.
- Rules use three or four short bullets plus one timing reminder, shared between
  setup and play. Include only the action and win condition; omit target pools,
  odds, technical precision, and recovery details.
- Offline caching and updates run silently. No availability text, installation
  help dialog, or update prompt. Updates wait until no saved game is in progress.
- Saving failures silently use session-only play. No storage badges, prompts,
  or disabled game controls.
- Standard pages measure content against their available viewport. Only actual
  overflow enables scrolling; Home contains no ScrollView. Landscape menus use
  two columns. Keyboard and enlarged-text overflow remain accessible elsewhere.
- Setup puts outlined Back at the bottom left beside green Start. The player
  editor uses the same layout for Cancel / Save. Use a 1:3 width ratio, with an
  80-point minimum for the secondary action, equal button heights, and a 10-point
  gap. The footer stays above the safe area and outside scrolling content.
- Setup contains editable values and a player-editor entry. Random-target games
  use minimum/maximum rows, initially 0–10 seconds. X Increments adds one
  maximum-interval row. Time Rush needs only the player-editor entry. Player rows contain one name field and an actions menu.
  Imposter uses One / Random choices. Only Random shows the maximum stepper,
  from 0 up to the player count; the actual count stays private until results.
  Long rosters may scroll.
- Handoffs, private cards, timing, saved/safe signals, and accusation confirmation
  are short action screens. Keep the timer’s position stable between its states.
- Results use compact rows. Combine closest results and scores; avoid presenting
  the same roster twice. Time Rush combines each player's total with five rows
  showing target, time, absolute error, and cumulative error. Bust breakdowns,
  Time Rush results, and large rosters may need scrolling.

## Screen behavior

| Screen                 | Visible task                                        | Overflow policy                         |
| ---------------------- | --------------------------------------------------- | --------------------------------------- |
| Home                   | Select/resume a game; clear data                    | Fixed menu, never scrolls               |
| Setup                  | Change settings; edit players; bottom Back / Start  | Only real overflow / enlarged text      |
| Players                | Edit names; bottom Cancel / Save                    | Only overflowing rows / keyboard        |
| Handoff / private card | Identify recipient; show/hide card                  | Normally fits; enlarged-text fallback   |
| Timer                  | Public target or neutral hidden display; Start/Stop | Stable controls; short landscape layout |
| Saved / Safe           | Confirm turn completion; continue                   | Normally fits                           |
| Accusation             | Choose and lock one player                          | Large roster may scroll                 |
| Results / bust         | Compare relevant numbers; continue/replay           | Only overflowing rows                   |
| Help / confirmations   | Complete the requested secondary task               | Dialog body may overflow                |

## Action layout

Back and Start share a bottom row with a 1:3 width ratio. Back is outlined;
Start is filled green. Both have visible labels and matching heights. The ratio
yields to Back's minimum width on narrow screens; labels may wrap with larger text.

[Apple's button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
favors styling to distinguish the preferred action and adequate space between
controls. [Apple's design tips](https://developer.apple.com/design/tips/) recommend
44-by-44-point touch targets. These buttons are at least 48 points high and Back
is at least 80 points wide. Gameplay's Menu remains separate from the timing control.
