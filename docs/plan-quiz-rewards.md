# Plan: a reward for every personality result

**Status:** plan only, nothing implemented.
**Scope:** 15 personality quizzes, 88 possible results, 88 rewards. Each quiz rewards from exactly one category.

| Category | Quizzes | Rewards |
| --- | --- | --- |
| **Furniture** (anything placed in a room: floor, table-top or wall) | Four Letters, Work Compass, Which Set Are You?, Which Houseplant?, What Kind of Guest? | 35 |
| **Clothing** (worn by avatars) | Star Sign, Which Season?, Four Humours, Lark or Owl, Social Battery | 26 |
| **Materials** (finishes that restyle furniture parts and clothes) | Nine Points, The Big Five, Conflict Style, Your Element, Four Styles | 27 |

The split follows the quizzes. Quizzes about what you do and where you spend time get objects. Quizzes about mood, rhythm and identity get things you wear. Quizzes about underlying temperament get materials, because a temperament is less a thing than a texture running through everything.

---

## 1. How rewards are earned

The point is a keepsake that says something true about you, and the risk is people answering dishonestly to collect the set. Personality quizzes have no right answers, so nothing stops a player picking options to steer the result. The rules below make honest play the easy path without trying to police it.

1. **Your result earns its reward straight away**, the first time you get it. This is on top of the existing 30 pebbles.
2. **A different result on a retake earns its reward only if 7 days have passed** since that quiz last paid an item. People do change, so a later result can still pay out, but collecting all sixteen types becomes a four-month project rather than an afternoon of clicking. Retakes inside the window still update your card.
3. **Star Sign pays once, ever.** Birthdays don't change, and without this rule anyone could type in twelve dates.
4. **You keep everything you've earned.** Changing result never takes an item away.
5. **None of these rewards can be bought, and none count towards theme sets.** Owning one means you got that result, which is what makes it worth showing off.
6. **They are listed in the catalogue** under a new *Keepsakes* tab, each labelled with how to earn it (for example "Get INFJ in Four Letters"). The other results' rewards are visible, so the quizzes advertise themselves.

*Recommended alternative if 7 days feels stingy:* drop the window and accept collecting. It's all cosmetic, so the cost is only that a Paper Lantern says less about its owner.

Server change: in `submitPersona` (`server/activities.ts`), after scoring, call `grantPersonaReward(user, quizId, outcome)`. It looks up the reward, checks the rules above against a new `user.personaRewardAt[quizId]` timestamp, and goes through the existing `grant()`. The reward appears in the existing reward popup.

---

## 2. System changes needed first

Furniture fits today's pipeline. Clothing and object materials don't exist yet and need their own groundwork.

### 2a. Furniture (no new systems)
- New entries in `FURNITURE_LIST` with `price: null` and `source: { type: 'persona', id: quizId, label }`. This adds `'persona'` to `ItemSource.type`.
- A new `theme: 'keepsake'`, outside `THEMES`, so set bonuses are untouched. `ThemeId` gains `'keepsake'`.
- Wall-mounted pieces use the existing wall grid. Table-top pieces use `small: true`.
- The catalogue test that asserts exactly 40 items becomes "40 themed + 35 keepsakes".

### 2b. Clothing (new)
- **Slots.** Keep the existing `top`/`bottom` styles and add three optional slots: `hat`, `neck` (scarves, collars, pendants, sashes) and `back` (capes, backpacks). Add `feet` for the slippers. `outfit` covers one-piece sets like pyjamas, which replace both top and bottom.
- **Data.** A new `CLOTHING_LIST` in `shared/clothing.ts`, mirroring furniture:
  `{ id, name, slot, parts: Part[], tint?: 'top' | 'bottom' | 'fixed', source }`.
  Parts are built with the same `B/C/S/K/T` helpers, positioned relative to the slot's anchor (head centre, neck, upper back, feet).
- **Avatar look.** `AvatarLook` gains `hat?`, `neck?`, `back?`, `feet?`, `outfit?` (clothing ids). `validLook()` checks the player owns them, using a new `wardrobe: string[]` on `UserData`. Old looks stay valid because every new field is optional.
- **Renderer.** `AvatarModel.build()` attaches slot groups to the head, torso and feet so items animate with the body. Hats hide the hair cap and keep the fringe, so the face stays clear.
- **UI.** The avatar editor gets a *Wardrobe* row per slot, with locked items greyed out and showing how to earn them. A `?wardrobe` showroom mode, like `?showroom`, would make authoring easier.

### 2c. Materials for objects and clothes (new)
Today, materials only cover whole floors and walls. These new ones are **finishes**: you apply one to a single placed object, or to a garment.

- **Part roles.** Each `Part` in the catalogue gains an optional `role: 'fabric' | 'wood' | 'metal' | 'hard' | 'glass'`. A finish declares which roles it fits (a velvet fits `fabric`; a glaze fits `hard` and `glass`). Tagging the existing 40 items is a one-off pass, about two hours, and is mostly mechanical: `t: 'fabric'` means fabric, `t: 'wood'` means wood, brass and iron colours mean metal.
- **Data.** `FINISH_LIST` in `shared/finishes.ts`:
  `{ id, name, roles, pattern, colors, sheen?: 'matte' | 'soft' | 'gloss', source }`.
  Patterns reuse and extend the canvas recipes in `textures.ts`.
- **Layout.** `PlacedItem` and `PlacedWallItem` gain `finish?: string`. The renderer swaps the material on every part whose role the finish supports. The server checks that the player owns the finish and that the item has at least one matching role.
- **Clothing.** `AvatarLook` gains `topFinish?` and `bottomFinish?`, plus one per new slot. Only `fabric` finishes apply to clothes.
- **Ownership.** A new `finishes: string[]` on `UserData`. A finish is unlimited once owned: it's a recipe, not a pot of paint.
- **UI.** In Decorate, the selected-item toolbar gains a *Finish* button that opens a swatch strip of owned finishes that fit, plus "Original". The wardrobe gets the same strip per garment. Undo already handles moves, so a `finish` undo entry joins it.

---

## 3. The rewards

Build notes are rough part sketches in the style of `shared/catalogue.ts`. Sizes are floor tiles (W×D) or wall slots (slots × rows).

### Furniture

#### Four Letters (16): a desk-side keepsake per type
| Result | Reward | Kind | Build notes |
| --- | --- | --- | --- |
| ISTJ · Keeper of Lists | **Card-Index Cabinet** | 1×1, surface 0.9 | Honey box, 3×2 small drawers, brass label plates, round pulls |
| ISFJ · Quiet Host | **Tea Trolley** | 2×1, surface 0.8 | Two-tier frame on castors; teapot and stacked cups on the lower tier |
| INFJ · Lantern | **Paper Lantern Floor Lamp** | 1×1, light | Tall cylinder of ribbed paper (glow) on thin oak legs |
| INTJ · Planner in the Attic | **Drafting Table** | 2×1 | Tilted top with a blueprint sheet, angle-poise lamp clamped to the edge |
| ISTP · Tinkerer | **Pegboard of Tools** | Wall 2×3 | Dotted board with spanner, hammer and coiled cable silhouettes |
| ISFP · Gentle Maker | **Pottery Wheel** | 1×1 | Low bench, spinning wheel head, half-thrown clay pot |
| INFP · Daydreamer | **Window-Seat Nook** | 2×1, seat 0.45 | Padded bench, heap of cushions, one with a crescent moon |
| INTP · Puzzler | **Half-Done Jigsaw Table** | 2×2, surface 0.45 | Low table; jigsaw texture with a missing-piece gap; loose pieces |
| ESTP · Spark | **Skateboard Rack** | Wall 2×2 | Two decks on brackets, coral and sky wheels |
| ESFP · Life of the Lobby | **Bulb Garland** | Wall 3×1, light | Swagged cord with soft warm bulbs (not neon) |
| ENFP · Kite | **Hanging Kite** | Wall 2×3 | Diamond kite in four pastel panels, bow-tied tail |
| ENTP · Debater | **Soapbox** | 1×1, seat 0.4 | Stencilled wooden crate with a small step |
| ESTJ · Building Manager | **Pigeonhole Post Rack** | Wall 2×2 | 3×3 cubbies with letters poking out, brass number plates |
| ESFJ · Welcome Mat | **Hall Bench & Shoe Rack** | 2×1, seat 0.45 | Bench over a slatted shelf of tiny shoes |
| ENFJ · Rallying Bell | **Bell Post** | 1×1 | Turned oak post holding a brass hand-bell |
| ENTJ · Captain of the Block | **Captain's Desk** | 2×1, surface 0.8 | Leather-topped walnut desk with a small globe |

#### Work Compass (6): the tool of each trade
| Result | Reward | Kind | Build notes |
| --- | --- | --- | --- |
| Realistic · Maker | **Rolling Tool Chest** | 1×1, surface 0.8 | Tomato-red chest, stacked drawers, castors |
| Investigative · Investigator | **Brass Telescope** | 1×1 | Tripod, angled brass tube, eyepiece |
| Artistic · Creator | **Painter's Easel** | 1×1 | A-frame, canvas with three blobs of colour, palette on the ledge |
| Social · Helper | **Classroom Chalkboard** | Wall 2×2 | Framed board with a doodled sun and "hello", chalk tray |
| Enterprising · Persuader | **Market Stall** | 2×1, surface 0.85 | Counter with striped awning on poles; crates of fruit |
| Conventional · Organiser | **Rolltop Desk** | 2×1, surface 0.8 | Curved slatted top, pigeonholes inside |

#### Which Set Are You? (4): a signature piece per theme
| Result | Reward | Kind | Build notes |
| --- | --- | --- | --- |
| Cosy Cabin | **Rocking Chair** | 1×1, seat 0.45 | Pine spindles, curved runners; gentle rock when someone sits |
| Seaside | **Driftwood Hammock** | 2×1, seat 0.5 | Driftwood A-frames, striped sling |
| Greenhouse | **Glass Cloche Stand** | 1×1, light | Iron stand, glass dome (glow) over a tiny fern |
| Sunday Studio | **Arc Floor Lamp** | 2×1, light | Marble base, sweeping brass arc, mushroom shade |

#### Which Houseplant? (4)
| Result | Reward | Kind | Build notes |
| --- | --- | --- | --- |
| Fern | **Hanging Fern Basket** | Wall 1×2 | Brass bracket, woven basket, fronds tumbling down |
| Cactus | **Desert Terrarium** | Small (table-top) | Glass box, sand layers, two cacti, a pebble |
| Monstera | **Monstera in a Brass Urn** | 1×1 | Oversized leaves (about 1.6 tall), polished urn |
| Trailing Ivy | **Ivy Wall Shelf** | Wall 2×1 | Plank shelf; ivy cascading over the front edge |

#### What Kind of Guest? (5)
| Result | Reward | Kind | Build notes |
| --- | --- | --- | --- |
| Early Bird | **Coat Stand** | 1×1 | Bentwood stand, one scarf, one hat |
| Bringer of Snacks | **Snack Board** | Small (table-top) | Wooden board, cheese wedges, grapes, crackers |
| Corner Philosopher | **Reading Nook Chair** | 1×1, seat 0.45, light | Wingback chair with a tiny lamp clipped to one wing |
| Dancefloor Starter | **Pastel Jukebox** | 1×1, light | Rounded cabinet, glowing arch, chrome grille |
| Last to Leave | **Dish Rack & Teacups** | Small (table-top) | Wire rack holding drying cups and a teapot |

### Clothing

#### Star Sign (12): each garment carries a small embroidered constellation patch
| Sign | Reward | Slot |
| --- | --- | --- |
| Aries | **Ram-Horn Earmuffs**: curled woollen horns on a band | hat |
| Taurus | **Velvet Cardigan** with daisy buttons | top |
| Gemini | **Two-Tone Split Jumper**: each half a different colour | top |
| Cancer | **Shell-Pocket Dungarees** | outfit |
| Leo | **Sun-Mane Bobble Hat**: orange pompom ring round the brim | hat |
| Virgo | **Wheat-Sprig Collar**: embroidered Peter Pan collar | neck |
| Libra | **Balance Pendant**: brass scales on a ribbon | neck |
| Scorpio | **Midnight Cape**: short navy cape, starry lining | back |
| Sagittarius | **Archer's Satchel**: leather backpack with a feather | back |
| Capricorn | **Mountain Beanie**: knitted peaks pattern | hat |
| Aquarius | **Wave-Hem Skirt**: scalloped blue hem | bottom |
| Pisces | **Scale-Print Raincoat** | top |

#### Which Season? (4)
| Result | Reward | Slot |
| --- | --- | --- |
| Spring | **Blossom Sun Hat**: wide straw brim, pink flowers | hat |
| Summer | **Seersucker Shorts**: blue and white | bottom |
| Autumn | **Leaf-Knit Scarf**: rust and mustard, long tails that swing when walking | neck |
| Winter | **Pompom Bobble Hat & Mittens**: one item, both pieces | hat |

#### Four Humours (4)
| Result | Reward | Slot |
| --- | --- | --- |
| Sanguine | **Rosy Neckerchief**: red polka dot | neck |
| Choleric | **Flame-Yellow Bomber Jacket** | top |
| Melancholic | **Poet's Polo-Neck**: charcoal, with a quill brooch | top |
| Phlegmatic | **Moss Fleece Slippers** | feet |

#### Lark or Owl (3)
| Result | Reward | Slot |
| --- | --- | --- |
| Lark | **Sunrise Knit Tank**: peach-to-butter stripes | top |
| Hummingbird | **Iridescent Feather Clip** | hat (hair accessory) |
| Owl | **Star-Print Pyjamas**: navy with a nightcap tassel | outfit |

#### Social Battery (3)
| Result | Reward | Slot |
| --- | --- | --- |
| Introvert | **Cosy Headphones**: chunky cans with a small moon on each side | hat |
| Ambivert | **Reversible Jacket**: wearer flips between quiet sage and bright coral in the wardrobe | top |
| Extrovert | **"Hello!" Sash**: name-badge sash with a rosette | neck |

### Materials (finishes)

Each finish lists the part roles it fits. *Fabric* finishes also work on clothes.

#### Nine Points (9)
| Type | Finish | Roles | Look |
| --- | --- | --- | --- |
| 1 · Straightener | **Pinstripe Linen** | fabric | Cream with fine charcoal pinstripes |
| 2 · Kettle-On | **Tea-Towel Check** | fabric | Red and cream gingham |
| 3 · Go-Getter | **Gold-Thread Twill** | fabric | Butter twill shot with brass threads, soft sheen |
| 4 · Original | **Marbled Silk** | fabric | Lilac and plum marbled swirls |
| 5 · Observer | **Blueprint** | fabric, hard | Navy with a white technical grid |
| 6 · Steady Friend | **Patchwork** | fabric | Sage, sky and butter squares with stitch lines |
| 7 · Adventurer | **Map Print** | fabric, hard | Contour lines and a dotted route on parchment |
| 8 · Protector | **Waxed Canvas** | fabric | Deep olive, slightly worn sheen |
| 9 · Calm Harbour | **Sea-Mist Velvet** | fabric | Blue-grey velvet with a soft gradient |

#### The Big Five (5)
| Trait | Finish | Roles | Look |
| --- | --- | --- | --- |
| Openness | **Shell Inlay** | wood, hard | Pale wood with iridescent mother-of-pearl flecks |
| Conscientiousness | **Polished Walnut** | wood | Deep, even grain, gloss |
| Extraversion | **Confetti Terrazzo** | hard | Cream with bright pastel chips |
| Agreeableness | **Brushed Cotton** | fabric | Warm blush, soft nap |
| Sensitivity | **Rain-on-Glass Glaze** | glass, hard | Frosted glaze with droplet speckles |

#### Conflict Style (5)
| Result | Finish | Roles | Look |
| --- | --- | --- | --- |
| Advocate | **Bold Bandstripe** | fabric | Wide tomato and cream stripes |
| Bridge-builder | **Woven Rattan** | wood, fabric | Honey basket weave |
| Fair Splitter | **Dip-Dye** | fabric, hard | Half one colour, half another, soft blend line |
| Cooler-offer | **Cloud Fleece** | fabric | Cream fluffy pile |
| Peacekeeper | **Olive Branch Print** | fabric | Sage sprigs on cream |

#### Your Element (4)
| Element | Finish | Roles | Look |
| --- | --- | --- | --- |
| Earth | **Raku Glaze** | hard | Clay with a smoky crackle glaze |
| Water | **Ripple Glass** | glass | Sea-blue glass with a wavy refraction texture |
| Air | **Feather Voile** | fabric | Pale sheer fabric, faint feather print |
| Fire | **Ember Lacquer** | wood, metal | Deep red-orange gloss |

#### Four Styles (4)
| Result | Finish | Roles | Look |
| --- | --- | --- | --- |
| Direct | **Brushed Steel** | metal | Cool grey with fine linear brushing |
| Inspiring | **Sunburst Print** | fabric | Butter rays on coral |
| Steady | **Oak Heartwood** | wood | Warm mid-oak, straight grain |
| Careful | **Graph Paper** | fabric, hard | Cream with a faint blue grid |

---

## 4. Build order and effort

Rough estimates for one developer who knows the codebase.

| Phase | Work | Estimate |
| --- | --- | --- |
| 1 | Reward rules and plumbing: `grantPersonaReward`, `personaRewardAt`, `'persona'` source, Keepsakes catalogue tab, reward popup wording, tests | 1 day |
| 2 | **Furniture (35):** about 30–40 minutes each in the showroom; fits the existing pipeline. Ship first, because it's visible straight away | 3–4 days |
| 3 | **Finishes system:** part roles on the existing 40 items, `finish` on placed items, renderer swap, server validation, Decorate toolbar, undo | 2–3 days |
| 4 | **Finishes content (27):** a canvas recipe each, many sharing a pattern with different colours | 2 days |
| 5 | **Clothing system:** slots, anchors, wardrobe ownership, avatar editor rows, `?wardrobe` showroom | 3 days |
| 6 | **Clothing content (26):** small models; hats and outfits take the longest | 3–4 days |

Each phase can ship on its own. Until a category's system exists, its results can grant pebbles, with a "coming soon" keepsake shown in the reward popup.

**Tests to add:** every persona outcome has exactly one reward; every reward exists in its category list; no quiz mixes categories; finishes match at least one role on at least one catalogue item; the 7-day and once-only rules.

---

## 5. Decisions for you

1. **Retake rule:** a 7-day window per quiz (recommended), or free collecting?
2. **Finish scope:** per placed item (recommended; two sofas can differ), or per item type?
3. **Clothing colours:** should reward garments follow the player's chosen top and bottom colours where it makes sense (cardigans, jumpers), or keep fixed signature colours (the Midnight Cape is always navy)? I'd make most of them tintable and keep a few iconic ones fixed.
4. **Trading or gifting** keepsakes between players. Out of scope here, but if it's wanted later, rule 5 (owning one proves the result) stops being true.
