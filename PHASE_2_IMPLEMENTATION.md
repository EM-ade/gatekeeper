# Phase 2: Magic Eden Class-Based NFT Verification

## Overview

Phase 2 replaces the old Helius-based system with a new Magic Eden-powered implementation that provides:
- **Direct class attribute extraction** from Magic Eden API
- **Config-driven collection support** via `config/collections.js`
- **No metadata files needed** - attributes come directly from the API
- **Faster verification** - single API call per collection
- **Better maintainability** - easy to add new collections

## Architecture

### Components

1. **`config/collections.js`**
   - Centralized collection configuration
   - Defines collection addresses, symbols, and class support
   - Easy to extend with new collections

2. **`utils/solana.js`** (New Functions)
   - `getNftsFromCollectionByWallet()` - Fetches NFTs by collection symbol
   - `checkNftOwnershipWithClass()` - Gets NFTs with class attributes
   - `extractClassFromMetadata()` - Extracts class from NFT metadata

3. **`services/periodicVerification.js`** (Updated)
   - `verifyNFTOwnership()` - Now uses Magic Eden instead of Helius
   - `updateClassBasedRoles()` - Assigns roles based on class attributes
   - Removed: `loadMetadata()`, `getEligibleSpecialRoles()`, `specialRoles` Map

## How It Works

### Periodic Verification Flow

```
Every 30 minutes:
  1. Get all users with verified wallets
  2. For each user:
     a. Fetch contract rules from database
     b. Group rules by collection
     c. For each collection:
        - Call checkNftOwnershipWithClass()
        - Get NFTs with class attributes from Magic Eden
        - Process quantity-based rules
        - Process trait-based (class-based) rules
     d. Update Discord roles:
        - Add roles for met requirements
        - Remove roles for unmet requirements
```

### Role Assignment Logic

**Quantity-Based Rules:**
```javascript
// Example: Own 3+ NFTs → Get "RMK ROYAL (3+)" role
if (nftCount >= requiredCount) {
  addRole(user, role);
}
```

**Trait-Based Rules (Class-Based):**
```javascript
// Example: Own ANY NFT with Class="Knight" → Get "KNIGHT" role
const matchingNfts = nfts.filter(nft => nft.class === "Knight");
if (matchingNfts.length > 0) {
  addRole(user, role);
}
```

## Configuration

### Adding a New Collection

Edit `config/collections.js`:

```javascript
export const COLLECTIONS = {
  newcollection: {
    name: 'newcollection',
    displayName: 'New Collection',
    address: 'COLLECTION_ADDRESS_HERE',
    symbols: ['symbol1', 'symbol2'],
    primarySource: 'magic_eden',
    fallbackSources: [],
    supportsClassFilter: true,
    validClasses: ['Class1', 'Class2'],
    classAttributeName: 'Class',
  },
};
```

### Setting Up Rules

Use Discord commands to configure rules:

```
/verification-config add
  contract: COLLECTION_ADDRESS
  required-count: 3
  role: @RMK ROYAL (3+)

/verification-config add
  contract: COLLECTION_ADDRESS
  required-count: 1
  role: @REALM King 👑
  trait-type: Class
  trait-value: King
```

## Data Flow

### NFT Fetching
```
Magic Eden API
  ↓
getNftsFromCollectionByWallet()
  ↓
Returns: [
  { mintAddress, name, class: "Knight", attributes: [...] },
  { mintAddress, name, class: "Chef", attributes: [...] },
  ...
]
```

### Role Assignment
```
NFTs with class data
  ↓
verifyNFTOwnership() processes rules
  ↓
contractSummaries: [
  { ruleType: "quantity", ownedCount: 15, meetsRequirement: true },
  { ruleType: "trait", traitValue: "Knight", ownedCount: 4, meetsRequirement: true },
  ...
]
  ↓
updateClassBasedRoles() assigns Discord roles
```

## Testing

### Test Files

1. **`test_magic_eden_collection.js`**
   - Tests Magic Eden collection symbol filtering
   - Verifies class attribute extraction

2. **`test_integrated_class_check.js`**
   - Tests the integrated class checking function
   - Verifies class filtering works correctly

3. **`test_periodic_verification.js`**
   - Simulates the entire periodic verification flow
   - Shows role assignment decisions

### Running Tests

```bash
# Test Magic Eden collection endpoint
node test_magic_eden_collection.js

# Test integrated class checking
node test_integrated_class_check.js

# Test periodic verification flow
node test_periodic_verification.js
```

## Migration from Phase 1

### What Changed

| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Data Source** | Helius + local metadata files | Magic Eden API |
| **Class Extraction** | URI fetch + JSON parsing | Direct from API |
| **Configuration** | Hardcoded arrays | `config/collections.js` |
| **Metadata Files** | Required in `/metadata/` | Not needed |
| **API Calls** | Multiple per NFT | Single per collection |

### What Stayed the Same

- ✅ Database schema (no changes)
- ✅ Role assignment logic (quantity/trait rules)
- ✅ Periodic verification loop (30 minutes)
- ✅ Discord role add/remove mechanism
- ✅ User verification flow

### Removed

- ❌ `loadMetadata()` method
- ❌ `specialRoles` Map
- ❌ `getSpecialRole()` method
- ❌ `getEligibleSpecialRoles()` method
- ❌ `/metadata/` directory dependency
- ❌ Old Helius-based `verifyNFTOwnership()`

## Troubleshooting

### Issue: "No collection config found"

**Cause:** Collection address not in `config/collections.js`

**Solution:** Add collection to `config/collections.js` with correct address

### Issue: Roles not assigning

**Cause:** 
1. Bot doesn't have permission to manage roles
2. Collection address mismatch
3. Class attribute name mismatch

**Solution:**
1. Check bot permissions in Discord
2. Verify collection address in database matches config
3. Verify `classAttributeName` matches NFT metadata

### Issue: "Magic Eden API error"

**Cause:** Collection symbol not found or API rate limit

**Solution:**
1. Verify collection symbol in `COLLECTIONS` config
2. Check Magic Eden API status
3. Add rate limiting if needed

## Performance

### API Calls per Verification

**Old System (Phase 1):**
- 1 call to Helius (get all NFTs)
- N calls to fetch metadata URIs
- N calls to parse metadata
- **Total: 2N + 1 calls**

**New System (Phase 2):**
- 1 call to Magic Eden per collection
- **Total: 1 call per collection**

### Example

For a user with 15 NFTs from 1 collection:
- **Phase 1:** ~31 API calls
- **Phase 2:** 1 API call

**Result:** ~97% reduction in API calls! 🚀

## Future Enhancements

1. **Multiple Collections**
   - Support multiple NFT collections
   - Different class attributes per collection

2. **Advanced Filtering**
   - Combine multiple traits
   - Rarity-based roles

3. **Caching**
   - Cache collection configs
   - Cache user verification results

4. **Analytics**
   - Track role assignments
   - Monitor verification success rates
