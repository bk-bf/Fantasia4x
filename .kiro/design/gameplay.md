# 🎮 Fantasia4x Core Gameplay Loop Document v3.0

## 🌟 Overview

Fantasia4x is a **text-based colony simulation** with **emergent tactical combat** and **discovery-driven research**. Unlike traditional 4X games with repetitive early phases, every element from race generation to combat encounters creates unique strategic paths from Turn 1, evolving into a deep tactical experience that maintains text-based accessibility while offering Battle Brothers-style combat depth.

## 🎲 Game Start: Procedural Race Foundation

### **Race Generation System (Current Implementation)**
```
1. Generate Stat Ranges (Per Stat):
   - Base range: 8-15 with random variation
   - 30% chance of specialization per stat:
     * High specialization: +2 to +3 bonus to range
     * Low specialization: -2 penalty to range
   - Final ranges typically: 6-18 per stat

2. Generate Physical Traits:
   - Size: tiny/small/medium/large/huge (affects height/weight ranges)
   - Height variation: ±15-35cm from base
   - Weight variation: ±10-30kg from base

3. Generate 2-4 Racial Traits:
   - Selected from 25+ comprehensive traits
   - Conflict prevention (e.g., Flame Touched ≠ Frost Born)
   - Wide variety: Physical, Elemental, Mystical, Social, Exotic

4. Generate Cultural Implications:
   - Knowledge traditions (e.g., "Crystal archives store memories")
   - Food customs (e.g., "Mushroom farms in dark caverns")
   - Combat practices (e.g., "Ritual scarification for battle")
   - Diplomatic methods (e.g., "Speaking in harmonic tones")
```

### **Individual Pawn Generation**
```
When Population Grows:
1. Roll each stat within race's stat ranges
2. Apply racial trait stat bonuses/penalties
3. Roll physical traits within race's physical ranges
4. Initialize needs (hunger/fatigue/sleep) based on constitution
5. Create equipment slots and shared inventory access
6. Calculate 50+ abilities from stats + traits + equipment
```

### **Immediate Strategic Impact**
- **Specialist Races**: Extreme stat ranges (6-8 in weak areas, 15-18 in strong)
- **Balanced Races**: Consistent 10-13 ranges across all stats
- **Trait-Driven Races**: Average stats but powerful racial abilities
- **Adaptive Races**: Moderate stats with flexible trait combinations

**Example Race Variations:**
```
Race A: "Crystalline-Eyed Stargazers"
→ Stat Ranges: Str 6-9, Dex 8-12, Int 15-18, Wis 13-16, Cha 9-12, Con 7-10
→ Traits: Crystalline Eyes (+2 Wis, +1 Int), Stargazer (+3 Wis, +1 Int)
→ Strategy: Research powerhouse, physically vulnerable

Race B: "Iron-Skinned Berserkers"  
→ Stat Ranges: Str 14-17, Dex 10-13, Int 6-9, Wis 8-11, Cha 7-10, Con 15-18
→ Traits: Iron Skin (+3 Con), Berserker Blood (+3 Str, +1 Con)
→ Strategy: Combat-focused, research struggles

Race C: "Industrious Generalists"
→ Stat Ranges: Str 9-12, Dex 10-13, Int 10-13, Wis 11-14, Cha 9-12, Con 10-13
→ Traits: Industrious (+15% work efficiency), Curious (+2 Int, +1 Wis)
→ Strategy: Balanced, steady progression
```

## 👥 Population & Colony Evolution

### **Population Growth & Pawn System**
```
Starting Population: 1 
Growth Rate: Dynamic, influenced by key events (e.g., discoveries, crises, celebrations), available colony infrastructure (housing, nurseries, medical facilities), and critical resources/items (food surplus, rare fertility boosters, cultural artifacts). Population growth accelerates or slows in response to these factors rather than following a fixed curve.
Pawn Generation: Each new pawn rolls within race stat ranges + trait bonuses
Individual Variation: Each pawn unique within racial parameters
```

### **Simplified Ability System (15 Core Categories)**
```
Work Efficiencies (Auto-calculated from stats + traits + equipment):
- Mining, Woodcutting, Crafting, Research, Construction
- Hunting, Fishing, Foraging (food production)

Basic Survival (50+ abilities tracked):
- Health Regeneration, Disease Resistance, Elemental Resistances
- Carry Capacity, Movement Speed, Environmental Adaptations

Social/Mental:
- Learning Speed, Social Influence, Research Speed
- Knowledge Storage, Memory Bonus, Experience Gain

Combat (Equipment-driven abilities):
- Base Combat Power, Defense (detailed abilities from equipment)
- Combat special abilities from racial traits

Physical Traits:
- Night Vision, Danger Sense, Tremor Sense
- Swimming Speed, Size Modifiers, Environmental Senses

Special Abilities (Trait-dependent):
- Telepathy, Shapeshifting, Elemental Powers
- Unique racial capabilities
```

### **Needs & Behavior System**
```
Automatic Needs Tracking:
- Hunger (0-100): Auto-eat when critical (90+)
- Sleep (0-100): Auto-sleep when exhausted (95+)  
- Fatigue (0-100): Auto-rest when tired (80+)
- Morale (0-100): Affects all work efficiency

Behavioral Responses:
- Critical needs override work assignments
- Low morale (20) = work refusal events
- Very low morale (10) = mental breakdown (5 turns)
- Constitution affects hunger/fatigue rates
- Racial traits modify need fulfillment efficiency
```

## ⚒️ Production & Research Integration

### **Discovery-Based Research System**

#### **Three-Tier Research Framework**

**Tier 1: Knowledge Accumulation (Time-Based)**
```
Basic Metallurgy: 100 knowledge-items → Unlocks basic metal tools
Stone Masonry: 150 knowledge-items → Unlocks stone buildings  
Guild Systems: 200 knowledge-items → Unlocks advanced job assignments
Advanced Metallurgy: 300 knowledge-items + "Ancient Forge Manual" → Steel tools
```

**Tier 2: Lore Item Discovery (Exploration Rewards)**
```
📜 "Ancient Forge Manual" → Unlocks Master Metallurgy (bypasses requirement)
📖 "Dwarven Architecture Tome" → Unlocks Stone Masonry Secrets
🏺 "Tribal Wisdom Scroll" → Unlocks cultural research paths
⚔️ "Weapon Fragment" → Unlocks military technologies
🔮 "Magical Crystal" → Unlocks supernatural research branches
```

**Tier 3: Stat-Gated Specializations (Race Adaptation)**
```
Low Strength Races (Average Str < 8):
- "Mechanical Advantage" → Pulley systems multiply weak labor
- "Precision Engineering" → Quality over quantity production

High Strength Races (Average Str > 15):
- "Brute Force Construction" → Fast building with strength bonuses
- "Heavy Industry" → Strength-based production multipliers

Low Intelligence Races (Average Int < 8):
- "Instinctual Crafting" → Bypass complex research requirements
- "Traditional Wisdom" → Cultural bonuses replace book learning

High Intelligence Races (Average Int > 15):
- "Advanced Theory" → Research multiple projects simultaneously
- "Innovation" → Create unique technologies
```

### **Automated Production Chain**
```
1. Research Phase:
   - Scholars generate knowledge-items (Intelligence-based efficiency)
   - Exploration missions discover lore items
   - Racial stats unlock specialized research paths

2. Tool Crafting:
   - Research unlocks tool recipes at different levels
   - Crafting efficiency = Pawn Dexterity + Trait bonuses + Tool bonuses
   - Tool Level 1-4: Wood/Stone → Iron → Steel → Magical

3. Automated Job Assignment:
   - Work efficiency = Base stat + Trait multipliers + Tool bonuses + Building bonuses
   - System automatically calculates optimal assignments
   - No manual mapping required - all bonuses computed dynamically

4. Building Construction:
   - Buildings unlock through research progression
   - Construction speed = Strength + relevant tool bonuses + trait effects
   - Building Level 1-4: Wood → Stone → Advanced → Magical structures
```

## ⚔️ Tactical Combat System

### **Combat Philosophy**
**Battle Brothers-inspired tactical combat** with **Caves of Qud-style graphics evolution**. Start with ASCII tactical grid, evolve to sprite-based rendering while maintaining text-based accessibility.

### **Combat Triggers & Scale**
```
Combat Scenarios:
- Exploration encounters (3-8 pawns vs enemies)
- Bandit raids (defending colony with 10-20 pawns)
- Large-scale conflicts (30+ pawns in territorial disputes)
- Siege warfare (defending/attacking fortified positions)
```

### **Racial Combat Variations**
```
High Strength Races:
- Natural melee bonuses, heavy weapon proficiency
- Traits like "Berserker Blood" enable combat rage
- "Iron Skin" provides natural armor

High Dexterity Races:
- Ranged weapon bonuses, speed advantages
- "Wind Walker" trait increases movement and accuracy
- "Keen Senses" improves threat detection

High Intelligence Races:
- Tactical bonuses, equipment optimization
- "Stargazer" enables magical detection
- "Void Touched" provides magic resistance

Specialized Trait Combinations:
- "Dragon Heritage" + "Flame Touched" = Fire-based combat powers
- "Pack Hunter" + high Charisma = Squad coordination bonuses
- "Ancient" + "Crystalline Eyes" = Magical combat specialist
```

### **Equipment-Driven Combat Abilities**
```
Base Combat Stats (from racial traits + stats):
- Combat Power = Strength + racial bonuses
- Defense = Dexterity + Constitution + natural armor

Equipment Abilities (unlocked by equipped items):
- Melee Weapons: Slash, Riposte, Lunge, Cleave, Shield Splitter
- Ranged Weapons: Quick Shot, Aimed Shot, Multi-Shot, Piercing Shot
- Armor: Damage reduction, movement penalties, special resistances

Racial Combat Synergies:
- "Venomous" trait + weapons = Poison damage
- "Regenerative" + armor = Enhanced survivability  
- "Shapeshifter" + equipment = Adaptive combat forms
```

### **Integration with Colony Simulation**
```
Pre-Combat Preparation:
- Squad selection based on pawn stats and equipment
- Racial traits affect squad composition strategy
- Building-provided equipment enhances capabilities

Post-Combat Consequences:
- Injuries affect work efficiency (racial healing rates vary)
- PTSD events based on Wisdom and racial mental resistance
- Equipment damage affects colony production chains
- Victory rewards scaled by racial research bonuses
```

## 🖥️ Menu Screen Ecosystem

### **Research-Gated Screen Progression**
```
0. Main Screen (Always Available)
   ├── Resource Sidebar with production rates
   ├── Turn Counter with automated progression
   ├── Event Log with racial-specific events
   └── ASCII Map with discovery locations

1. Race Screen (Always Available)
   └── Detailed racial stats, traits, and population evolution

2. Building Screen (Always Available)
   └── Construction based on research + racial building bonuses

3. Crafting Screen (Tool Level 1+ Research)
   └── Tool/weapon/armor creation (racial crafting bonuses apply)

4. Job Screen (Population 2+)
   └── Automated work assignment with racial efficiency display

5. Research Screen (Scroll Hut built)
   └── Knowledge accumulation + racial research bonuses

6. Exploration Screen (Explorer's Guild built)
   └── Discovery missions (racial movement/survival bonuses)

7. Army Screen (Military HQ built)
   └── Squad formation showing racial combat capabilities

8. Hero Screen (Tavern built)
   └── Elite pawn recruitment with racial stat considerations

9. Event Log Screen (Always Available)
   └── Comprehensive activity tracking with racial context
```

## 🎯 Integrated Gameplay Loops

### **Racial Strategy Examples**

**"Crystalline-Eyed Stargazers" Playthrough:**
```
Early Game: Rush Scroll Hut for research advantages
→ High Intelligence = faster knowledge accumulation
→ "Stargazer" trait provides research speed bonuses
→ Focus on magical research paths

Mid Game: Discover magical lore items through exploration
→ "Crystalline Eyes" enhance magical detection
→ Unlock supernatural research branches early
→ Develop magical tools and buildings

Late Game: Magical/technological hybrid civilization
→ Unique magical technologies unavailable to other races
→ Combat through magical abilities rather than physical
→ Victory through technological supremacy
```

**"Iron-Skinned Berserkers" Playthrough:**
```
Early Game: Focus on mining and construction
→ High Strength = superior resource extraction
→ "Iron Skin" provides natural armor for dangerous work
→ Build defensive structures quickly

Mid Game: Military expansion and conquest
→ "Berserker Blood" enables powerful combat abilities
→ High Constitution = durable warriors
→ Compensate for research weakness through conquest

Late Game: Military empire with tributary colonies
→ Victory through combat supremacy
→ Acquire knowledge through conquest rather than research
→ Develop warrior culture and martial technologies
```

**"Industrious Generalists" Playthrough:**
```
Early Game: Balanced development across all systems
→ "Industrious" trait = 15% efficiency boost to all work
→ No critical weaknesses to exploit
→ Steady, reliable progression

Mid Game: Adaptive strategy based on discoveries
→ "Curious" trait enhances experience gain
→ Can pursue any discovered research path effectively
→ Respond to opportunities rather than predetermined strategy

Late Game: Optimized, well-rounded civilization
→ Master of adaptation and efficiency
→ Victory through superior optimization
→ Excel at complex system management
```

## 🔄 Strategic Depth Through Racial Diversity

### **No Fixed Optimal Strategies**
- **50+ racial traits** create thousands of possible combinations
- **Random stat ranges** ensure each race faces different challenges
- **Trait synergies** enable unique strategic approaches
- **Environmental adaptation** makes some races better for certain scenarios
- **Population evolution** changes civilization identity over time

### **Emergent Racial Narratives**
```
Physical Adaptation Stories:
- "Amphibious" + coastal starting location = aquatic civilization
- "Photosynthetic" + abundant sunlight = energy-independent society
- "Nocturnal" + underground expansion = shadow empire

Magical Evolution Stories:
- "Void Touched" + magical research = reality-manipulating civilization
- "Dream Walker" + high Wisdom = psychic/telepathic society
- "Flame Touched" + metallurgy = forge-masters and fire-shapers

Social Development Stories:
- "Hive Mind" + large population = collective consciousness empire
- "Pack Hunter" + military focus = warrior clan confederation
- "Ancient" + research focus = wise elder civilization preserving knowledge
```

### **Dynamic Racial Identity**
```
Population Growth Effects:
- New pawns roll within racial ranges but with individual variation
- Population average can shift based on survival pressures
- Successful traits become more common over generations
- Environmental adaptation influences pawn generation

Cultural Evolution:
- Research discoveries shape civilization identity
- Combat experiences influence warrior culture development
- Trade relationships affect diplomatic trait expression
- Crisis events strengthen or weaken certain cultural aspects
```

## 🌟 Design Philosophy: Emergent Racial Storytelling

**🎯 Core Principle**: Every race combination creates a unique civilization with distinct strengths, weaknesses, and cultural identity that emerges through gameplay rather than predetermined paths.

**🔄 Adaptive Complexity**: 
- Simple race generation rules create complex strategic variety
- Racial traits interact with game systems to produce emergent strategies
- No "correct" way to play any race - adaptation and creativity rewarded
- System mastery comes from understanding racial synergies

**🎲 Procedural Identity**: 
- Race generation creates immediate strategic constraints and opportunities
- Cultural implications provide narrative flavor for player imagination
- Trait combinations suggest unique civilization personalities
- Population evolution allows civilizations to grow and change over time

*🌟 "Every race tells a different story, every trait combination opens new strategic paths, every civilization develops its own unique identity through the choices and challenges it faces." 🌟*