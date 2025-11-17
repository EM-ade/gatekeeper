# Realmkin Role Setup Guide

## Step 1: Run Database Migration

Run this in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of:
-- migrations/006_add_trait_based_verification.sql
```

## Step 2: Get Your Collection Address

Find your Realmkin collection address (the collection ID from Helius/Solana).

Example: `YOUR_REALMKIN_COLLECTION_ADDRESS_HERE`

## Step 3: Create Discord Roles

Create these roles in your Discord server:

### Trait-Based Roles (CLASS attribute)
- REALM King 👑
- REALM QUEEN 👑
- PRIEST
- WIZARD
- WITCH
- JESTER
- CHIEF
- WARRIOR
- BUTLER
- NOBLE'S

### Quantity-Based Roles
- RMK ROYAL ( 1 ) - exactly 1 NFT
- RMK ROYAL (1+) - 1 or more NFTs
- RMK ROYAL (3+) - 3 or more NFTs
- RMK ROYAL (5+) - 5 or more NFTs

## Step 4: Add Trait Rules via Discord

Use the `/add-trait-rule` command for each CLASS trait:

```
/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: King
  role: @REALM King 👑

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Queen
  role: @REALM QUEEN 👑

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Priest
  role: @PRIEST

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Wizard
  role: @WIZARD

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Witch
  role: @WITCH

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Jester
  role: @JESTER

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Chief
  role: @CHIEF

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Warrior
  role: @WARRIOR

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Butler
  role: @BUTLER

/add-trait-rule
  contract: YOUR_COLLECTION_ADDRESS
  trait-type: CLASS
  trait-value: Noble
  role: @NOBLE'S
```

## Step 5: Add Quantity Rules via Discord

Use the existing `/verification-config` command:

```
/verification-config add
  contract: YOUR_COLLECTION_ADDRESS
  required-count: 1
  role: @RMK ROYAL ( 1 )

/verification-config add
  contract: YOUR_COLLECTION_ADDRESS
  required-count: 1
  role: @RMK ROYAL (1+)

/verification-config add
  contract: YOUR_COLLECTION_ADDRESS
  required-count: 3
  role: @RMK ROYAL (3+)

/verification-config add
  contract: YOUR_COLLECTION_ADDRESS
  required-count: 5
  role: @RMK ROYAL (5+)
```

## Step 6: Configure Special Roles via Discord

Use the new `/special-roles` command to configure special roles based on NFT metadata:

```
/special-roles configure
  trait-value: King
  role: @REALM King 👑

/special-roles configure
  trait-value: Queen
  role: @REALM QUEEN 👑

/special-roles configure
  trait-value: Priest
  role: @PRIEST

/special-roles configure
  trait-value: Wizard
  role: @WIZARD

/special-roles configure
  trait-value: Witch
  role: @WITCH

/special-roles configure
  trait-value: Jester
  role: @JESTER

/special-roles configure
  trait-value: Chief
  role: @CHIEF

/special-roles configure
  trait-value: Warrior
  role: @WARRIOR

/special-roles configure
  trait-value: Butler
  role: @BUTLER

/special-roles configure
  trait-value: Noble
  role: @NOBLE'S
```

After configuring all special roles, trigger an update:

```
/special-roles update
```

## How It Works

### For Users with Multiple NFTs

**Example: User owns 4 Realmkin NFTs:**
- 1x King CLASS
- 2x Noble CLASS  
- 1x Wizard CLASS

**Roles Assigned:**
- ✅ REALM King 👑 (has King trait)
- ✅ NOBLE'S (has Noble trait)
- ✅ WIZARD (has Wizard trait)
- ✅ RMK ROYAL ( 1 ) (owns exactly 1... wait, no, they own 4)
- ✅ RMK ROYAL (1+) (owns 1 or more)
- ✅ RMK ROYAL (3+) (owns 3 or more)
- ❌ RMK ROYAL (5+) (only owns 4)

### Special Role Assignments (Class-Based)

Special roles are assigned based on the "Class" trait directly from the Magic Eden API. The system automatically extracts class attributes from NFT metadata without needing local files.

When a user's wallet is verified, the system:
1. Fetches all NFTs owned by the wallet from Magic Eden
2. Extracts the "Class" attribute from each NFT
3. Maps the class value to a configured Discord role
4. Assigns or removes roles based on current ownership

**Note:** This is Phase 2 of the implementation. For technical details, see [PHASE_2_IMPLEMENTATION.md](./PHASE_2_IMPLEMENTATION.md)

### Automatic Role Management

The periodic verification system (runs every 30 minutes) will:
- **Add roles** when users acquire new NFTs or traits
- **Remove roles** when users sell/transfer NFTs
- **Update roles** based on current wallet holdings

### Manual Verification

Users can verify at any time using:
1. `/setup-verification` command in Discord
2. Click the verification button
3. Connect wallet on the portal
4. Sign the message
5. Roles are assigned immediately

Administrators can also manually trigger special role updates for all users:
1. `/special-roles update` command in Discord
2. System checks all verified users
3. Updates roles based on current NFT ownership

## Troubleshooting

### Roles Not Assigning

1. Check Helius API is working (check bot logs)
2. Verify collection address is correct
3. Ensure trait names match exactly (case-sensitive)
4. Check bot has permission to manage roles

### Periodic Verification Not Running

1. Check bot logs for `[periodic-verification]` messages
2. Verify database migration was applied
3. Restart the bot

### Users Not Getting Trait Roles

1. Verify the NFT metadata has the correct `trait_type` and `value`
2. Check the rule was added correctly: `/verification-config list`
3. Test with a known wallet that owns the trait
