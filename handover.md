# Handover - Referential Integrity & Status Management

## Objective
To prevent accidental deletion of referenced objects and provide a way to mark configurations as `active` or `inactive`.

## Implementation Details

### Data Model Changes
The following fields were added to `cfg_acupuncture_points`, `cfg_protocols`, `cfg_measures`, and `cfg_problems`:
- `status`: `'active' | 'inactive'` (string)
- `reference_count`: `number` (numeric)

### Logic Patterns

#### 1. Deletion Protection (List View)
In all Admin components, the delete button is disabled if `reference_count > 0`.
```typescript
{item.reference_count > 0 ? (
  <Tooltip text={getTranslation('Cannot delete: item is referenced')}>
    <button className={styles.deleteButtonDisabled} disabled>
      <Trash2 size={18} />
    </button>
  </Tooltip>
) : (
  <button onClick={() => handleDelete(item)} className={styles.deleteButton}>
    <Trash2 size={18} />
  </button>
)}
```

#### 2. Status Toggling (Edit Form)
Status is managed via a switch in the edit form only. New items default to `active` with `reference_count: 0`.

#### 3. Selection Filtering
Forms that reference other objects (e.g., Protocols referencing Points) should filter available items by `status === 'active'`.
**Pattern**:
```typescript
const availableItems = allItems.filter(p => p.status === 'active' || currentlySelectedIds.includes(p.id));
```
This ensures that `inactive` items can't be *newly* picked, but *previously* picked ones aren't hidden from the UI.

#### 4. Reference Count Updates
When an object is saved or deleted, it must update the `reference_count` of its children.
- **On Save**: Calculate diff between `original` and `new` refs. Increment/decrement children accordingly using Firestore `increment(1)` or `increment(-1)`.
- **On Delete**: Decrement all children refs.

### Files Impacted
- `src/types/*.ts`: Interface updates.
- `src/components/*Admin.tsx`: Logic updates.
- `src/components/*Admin.module.css`: UI styles.
- `scripts/migrate_referential_integrity.js`: Initial migration.

## Future Recommendations
- Ensure any new collection that joins the configuration layer follows this pattern.
- Consider a generic `useReferentialIntegrity` hook to centralize the increment/decrement logic if the project grows further.
