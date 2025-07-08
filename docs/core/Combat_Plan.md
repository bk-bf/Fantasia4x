# Combat_Plan.md
*Comprehensive Combat System Design for Fantasia4x*

## 🎯 **Executive Summary**

This document outlines the complete combat system design for Fantasia4x, implementing a **Battle Brothers-inspired tactical combat system** with **Caves of Qud-style graphics evolution**. The system balances realistic large-scale combat (20-50 pawns) with manageable tactical complexity through a hybrid ASCII-to-graphics approach.

**Core Philosophy**: Maintain text-based accessibility while providing tactical depth that integrates seamlessly with the colony simulation systems.

## 🏗️ **System Architecture Overview**

### **Combat System Foundation**
- **Turn-based tactical combat** with initiative-based action order
- **Action Point (AP) system** for movement and abilities
- **Position-based mechanics** with formation importance
- **Equipment-driven abilities** tied to existing item system
- **Permadeath consequences** affecting colony workforce

### **Scale Management Strategy**
- **Elite pawn focus**: Full tactical control for 20-50 combat-capable pawns
- **Realistic scarcity**: Combat-capable pawns are rare and valuable
- **Meaningful consequences**: Injuries, PTSD, equipment loss affect entire colony
- **Hierarchical command**: Squad-based organization for large battles

## 📊 **Combat Mechanics Specification**

### **Initiative & Turn Order System**
```
Turn Order Calculation:
Base Initiative = Pawn Speed Stat (50-150)
+ Equipment Modifiers (Light armor +10, Heavy armor -20)
+ Status Effects (Wounded -30, Stimmed +20)
+ Random Factor (1d20)

Example Turn Order:
1. Aria (Archer) - Initiative 142
2. Bandit Scout - Initiative 135  
3. Marcus (Warrior) - Initiative 118
4. Bandit Leader - Initiative 95
```

### **Action Point System**
Each pawn receives **Action Points (AP)** per turn based on their stats:

| Action Type | AP Cost | Notes |
|-------------|---------|-------|
| Move 1 Tile | 1 AP | Basic movement |
| Basic Attack | 2-3 AP | Varies by weapon |
| Special Ability | 3-5 AP | Equipment/skill dependent |
| Defend/Wait | 1 AP | Gain defensive bonuses |
| Use Item | 2 AP | Healing, buffs, etc. |

**AP Calculation**: `Base AP = 6 + (Speed/20) + Equipment Modifiers`

### **Positioning & Formation System**

#### **ASCII Battlefield Grid**
```
Battlefield Layout (12x8 grid):
    A B C D E F G H I J K L
 1  . . . # # . . . . . . .
 2  . @ @ # # . . E E . . .
 3  . @ @ . . . . E . . . .
 4  . . . ~ ~ ~ . . . . . .
 5  . . . ~ ~ ~ . E . . . .
 6  . . . . . . . . . . . .
 7  . . . . . . . . . . . .
 8  . . . . . . . . . . . .

Legend:
@ = Your pawns    E = Enemies    # = Trees (Cover)
~ = Water (Impassable)    . = Open ground
```

#### **Formation Mechanics**
- **Front Line**: +10% damage, -10% defense
- **Back Line**: +10% defense, -10% damage, ranged weapon bonus
- **Flanking**: +20% damage when attacking from sides/rear
- **Cover**: Trees/rocks provide +15% defense against ranged attacks

### **Combat Abilities System**

#### **Equipment-Based Abilities**
Abilities are determined by equipped weapons and tools:

**Melee Weapons:**
- **Swords**: Slash (2 AP), Riposte (3 AP), Lunge (4 AP)
- **Axes**: Cleave (3 AP), Shield Splitter (4 AP), Overhead Strike (3 AP)
- **Spears**: Thrust (2 AP), Spearwall (4 AP), Reach Attack (3 AP)
- **Maces**: Bash (2 AP), Stun Strike (4 AP), Armor Breaker (3 AP)

**Ranged Weapons:**
- **Bows**: Quick Shot (2 AP), Aimed Shot (4 AP), Multi-Shot (5 AP)
- **Crossbows**: Bolt Shot (3 AP), Piercing Shot (4 AP), Reload (2 AP)
- **Throwing**: Quick Throw (2 AP), Aimed Throw (3 AP)

#### **Pawn Skill Integration**
Combat effectiveness modified by existing pawn abilities:
- **Combat Skill**: +5% hit chance per 10 skill points
- **Athletics**: +1 AP per 20 skill points
- **Tactics**: +10% damage when leading a squad
- **Medicine**: Can use healing abilities in combat

## 🤖 **Enemy AI System**

### **Behavior-Based AI Architecture**
Simple but effective AI behaviors that create tactical challenges:

#### **AI Personality Types**
1. **Aggressive**: Always moves toward nearest enemy, prioritizes damage
2. **Defensive**: Maintains formation, attacks when approached
3. **Opportunist**: Targets weakest/isolated pawns, uses terrain
4. **Support**: Buffs allies, avoids direct combat, heals wounded
5. **Tactical**: Uses abilities strategically, coordinates with allies

#### **AI Decision Tree**
```
AI Turn Logic:
1. Check for critical threats (low health, surrounded)
2. Evaluate available targets (distance, weakness, tactical value)
3. Consider positioning (cover, flanking opportunities)
4. Select action based on personality type
5. Execute with random variation (10-20% chance of suboptimal choice)
```

### **Difficulty Scaling**
- **Easy**: Simple AI, fewer enemies, better equipment for player
- **Normal**: Standard AI behaviors, balanced encounters
- **Hard**: Enhanced AI coordination, more enemies, limited player resources
- **Nightmare**: Perfect AI coordination, overwhelming numbers, equipment scarcity

## 🎨 **Visual Evolution: ASCII to Graphics**

### **Phase 1: Enhanced ASCII (Immediate Implementation)**
```
Current ASCII Representation:
@ = Pawn (with health bar: @[████▓░░░])
E = Enemy (with type indicator: E₁, E₂, E₃)
# = Cover (with height: #₁, #₂, #₃)
~ = Terrain (with effect: ~slow, ~block, ~burn)

Enhanced ASCII Features:
- Color coding for pawn status (green=healthy, yellow=wounded, red=critical)
- Animation frames for attacks (@ → ⚔ → @)
- Status effect indicators (@*stunned*, @+buffed+, @-debuffed-)
```

### **Phase 2: Caves of Qud-Style Sprites (Future)**
```
Sprite System Architecture:
- 32x32 pixel tiles for optimal readability
- Layered rendering: Background → Terrain → Units → Effects → UI
- Animation frames: Idle, Move, Attack, Defend, Death
- Equipment visualization: Weapons and armor visible on sprites
- Status overlays: Health bars, status effects, action indicators
```

#### **Asset Requirements**
- **Pawn Sprites**: 20+ variations based on race and equipment
- **Enemy Sprites**: 15+ enemy types with attack animations
- **Terrain Tiles**: 30+ environmental elements
- **Effect Sprites**: Combat actions, spells, environmental hazards
- **UI Elements**: Health bars, action indicators, selection highlights

### **Rendering Pipeline**
```typescript
interface CombatRenderer {
  mode: 'ascii' | 'sprites' | 'hybrid';
  
  // Core rendering functions
  renderBattlefield(map: BattleMap): void;
  renderUnit(unit: CombatUnit, position: Position): void;
  renderEffect(effect: CombatEffect, duration: number): void;
  renderUI(selectedUnit: CombatUnit, availableActions: Action[]): void;
  
  // Animation system
  playAnimation(type: AnimationType, position: Position): Promise<void>;
  updateAnimations(deltaTime: number): void;
}
```

## 🔗 **Integration with Existing Systems**

### **Pawn System Integration**
- **Abilities**: Simplified pawn abilities translate directly to combat bonuses
- **Equipment**: Existing item system determines available combat actions
- **Health/Morale**: Current pawn state affects combat performance
- **Experience**: Combat participation improves relevant pawn skills

### **Colony Impact System**
```
Combat Consequences:
- Injuries: Wounded pawns work at 50% efficiency for 5-10 turns
- PTSD: Combat stress affects morale and social interactions
- Equipment Loss: Damaged/lost gear affects colony production
- Population: Pawn death removes skilled workers from colony
- Morale: Victory boosts colony morale, defeat causes depression
```

### **Event System Integration**
Combat outcomes trigger events through existing event system:
- **Victory Events**: Resource rewards, morale boosts, story progression
- **Defeat Events**: Injuries, equipment loss, colony setbacks
- **Heroic Actions**: Individual pawn achievements create positive events
- **Casualties**: Pawn death triggers mourning events affecting other pawns

### **Research System Integration**
- **Combat Technologies**: Research unlocks new weapons, armor, tactics
- **Medical Research**: Improves healing and injury recovery
- **Engineering**: Unlocks defensive structures and siege equipment
- **Tactical Knowledge**: Improves AI behavior for player pawns

## 📅 **Implementation Timeline**

### **Phase 1: Core Combat Engine (3 weeks)**

#### **Week 1: Foundation**
- [ ] **Turn-based combat state management**
- [ ] **Initiative system with action points**
- [ ] **Basic ASCII grid rendering (12x8)**
- [ ] **Movement and basic attack mechanics**
- [ ] **Simple enemy AI (aggressive behavior only)**

#### **Week 2: Tactical Mechanics**
- [ ] **Equipment-based abilities system**
- [ ] **Formation and positioning bonuses**
- [ ] **Cover and terrain effects**
- [ ] **Status effects (wounded, stunned, buffed)**
- [ ] **Enhanced AI behaviors (defensive, opportunist)**

#### **Week 3: System Integration**
- [ ] **Combat outcome integration with colony systems**
- [ ] **Injury and recovery mechanics**
- [ ] **Equipment durability and loss**
- [ ] **Event system triggers for combat results**
- [ ] **Save/load compatibility**

### **Phase 2: Enhanced Combat (2 weeks)**

#### **Week 4: Advanced Features**
- [ ] **Squad-based command system**
- [ ] **Combo attacks and coordinated abilities**
- [ ] **Environmental hazards (fire, poison, traps)**
- [ ] **Morale system in combat**
- [ ] **Tactical AI improvements**

#### **Week 5: Polish & Balance**
- [ ] **Combat balance testing with 20-50 pawns**
- [ ] **Performance optimization**
- [ ] **UI/UX improvements**
- [ ] **Bug fixes and edge case handling**
- [ ] **Player feedback integration**

### **Phase 3: Visual Evolution (Future - 4+ weeks)**

#### **Graphics Foundation**
- [ ] **Sprite rendering system implementation**
- [ ] **Asset pipeline creation**
- [ ] **Basic pawn and enemy sprites**
- [ ] **Terrain tile system**

#### **Animation System**
- [ ] **Combat animation framework**
- [ ] **Attack and movement animations**
- [ ] **Effect particle system**
- [ ] **UI animation polish**

#### **Visual Polish**
- [ ] **Professional sprite artwork**
- [ ] **Environmental atmosphere**
- [ ] **Dynamic lighting effects**
- [ ] **Modding support for custom graphics**

## 🎮 **User Experience Design**

### **Combat Flow**
1. **Pre-Combat**: Squad selection, equipment check, tactical briefing
2. **Deployment**: Formation setup on battlefield
3. **Combat Rounds**: Initiative-based tactical turns
4. **Resolution**: Outcome calculation and consequence application
5. **Post-Combat**: Injury treatment, equipment recovery, event triggers

### **Interface Design**
```
Combat UI Layout:
┌─────────────────────────────────────────────────────────┐
│ Turn Order: [Aria] [Marcus] [Enemy1] [Elena] [Enemy2]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│    A B C D E F G H I J K L                             │
│ 1  . . . # # . . . . . . .                             │
│ 2  . @ @ # # . . E E . . .                             │
│ 3  . @ @ . . . . E . . . .                             │
│ 4  . . . ~ ~ ~ . . . . . .                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Marcus [██████▓░░░] AP: 6/8                            │
│ Actions: [Move] [Attack] [Defend] [Ability] [Item]     │
│ Target: Enemy Archer (Range: 3, Hit: 75%)              │
└─────────────────────────────────────────────────────────┘
```

### **Accessibility Features**
- **Colorblind support**: Pattern-based indicators alongside colors
- **Keyboard navigation**: Full combat control without mouse
- **Screen reader compatibility**: Text descriptions for all visual elements
- **Difficulty options**: Adjustable AI intelligence and encounter balance

## 🔧 **Technical Implementation Details**

### **Data Structures**
```typescript
interface CombatUnit {
  id: string;
  pawnId: string;
  position: Position;
  health: number;
  maxHealth: number;
  actionPoints: number;
  maxActionPoints: number;
  abilities: CombatAbility[];
  statusEffects: StatusEffect[];
  equipment: Equipment[];
}

interface BattleMap {
  width: number;
  height: number;
  tiles: TerrainTile[][];
  units: CombatUnit[];
  effects: ActiveEffect[];
}

interface CombatAbility {
  id: string;
  name: string;
  apCost: number;
  range: number;
  targetType: 'single' | 'area' | 'self' | 'ally';
  effects: AbilityEffect[];
  requirements: EquipmentRequirement[];
}
```

### **Performance Considerations**
- **Efficient pathfinding**: A* algorithm with caching for repeated calculations
- **Optimized rendering**: Only redraw changed tiles and units
- **Memory management**: Pool combat units and effects to reduce garbage collection
- **Scalable AI**: Limit AI calculation depth based on available processing time

### **Modding Support**
- **JSON-based configuration**: Combat abilities, enemy types, terrain effects
- **Sprite replacement system**: Easy custom graphics integration
- **Scripted AI behaviors**: Lua scripting for custom enemy AI
- **Campaign integration**: Custom scenarios and battle types

## 🎯 **Success Metrics & Testing**

### **Performance Targets**
- **Turn Processing**: <500ms for 50-unit battles
- **Rendering**: 60fps during animations
- **Memory Usage**: <100MB for largest battles
- **Load Times**: <2s for battle initialization

### **Gameplay Metrics**
- **Battle Duration**: 10-30 minutes for typical engagements
- **Decision Complexity**: 3-7 meaningful choices per turn
- **Outcome Variance**: 20-30% randomness in similar matchups
- **Learning Curve**: New players effective within 3 battles

### **Testing Protocol**
1. **Unit Testing**: Individual combat mechanics validation
2. **Integration Testing**: Combat system with colony simulation
3. **Performance Testing**: Large-scale battles (50+ units)
4. **Balance Testing**: Various equipment and ability combinations
5. **User Testing**: Player feedback on tactical depth and accessibility

## 🚀 **Future Expansion Opportunities**

### **Advanced Combat Features**
- **Siege Warfare**: Large-scale battles with defensive structures
- **Naval Combat**: Water-based tactical encounters
- **Magic System**: Spell-based abilities and magical effects
- **Mounted Combat**: Cavalry units with special movement rules

### **Strategic Layer Integration**
- **Campaign Map**: Multiple connected battlefields
- **Resource Warfare**: Control of strategic resources through combat
- **Diplomacy**: Combat as part of larger political systems
- **Seasonal Effects**: Weather and time affecting combat mechanics

### **Community Features**
- **Battle Replays**: Save and share memorable combat encounters
- **Custom Scenarios**: Player-created tactical challenges
- **Tournament Mode**: Competitive tactical combat between players
- **Modding Tools**: Full editor for custom combat content

## 📋 **Risk Assessment & Mitigation**

### **Development Risks**
- **Scope Creep**: Combat system complexity expanding beyond timeline
  - *Mitigation*: Strict phase gates and feature prioritization
- **Performance Issues**: Large battles causing frame rate problems
  - *Mitigation*: Early performance testing and optimization
- **Balance Problems**: Combat becoming too complex or too simple
  - *Mitigation*: Iterative testing with target player groups

### **Design Risks**
- **Integration Conflicts**: Combat system not meshing with colony simulation
  - *Mitigation*: Regular integration testing throughout development
- **Player Overwhelm**: Too many tactical options confusing new players
  - *Mitigation*: Progressive complexity introduction and tutorial system
- **Maintenance Burden**: AI and balance requiring constant attention
  - *Mitigation*: Simple, robust AI architecture and automated testing

## 🎉 **Conclusion**

This combat system design provides a clear path from ASCII-based tactical combat to a fully-featured graphical system that maintains the text-based game's accessibility while adding the tactical depth that sets Fantasia4x apart in the colony simulation genre.

The phased approach ensures that each development milestone provides immediate value while building toward the ultimate vision of **Battle Brothers-style tactical combat with Caves of Qud-inspired graphics** - a unique combination that could define a new subgenre in strategy gaming.

**Key Success Factors:**
- Start with proven ASCII foundation
- Build graphics-ready architecture from day one
- Maintain strict scope discipline during development
- Integrate seamlessly with existing colony systems
- Focus on meaningful tactical decisions over mechanical complexity

The result will be a combat system that enhances rather than overwhelms the core colony simulation experience, creating memorable tactical moments that become part of each colony's unique story.