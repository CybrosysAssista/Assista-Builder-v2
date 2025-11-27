# Mention Dialog Position Fix

## Problem
When clicking the mention button (@), the dialog appeared at the bottom. But when clicking "Files & Folders", the dialog would jump to the top of the screen. This was jarring and confusing for users.

## Root Cause
The `positionMenu()` function was being called multiple times:
1. When opening the menu initially ✅ (correct)
2. When opening the picker panel ❌ (caused jump)
3. When rendering search results ❌ (caused jump)
4. When loading recent files ❌ (caused jump)

Each call recalculated the position based on the current menu height, causing it to move.

## Solution
Implemented a **position caching mechanism**:

### 1. Added Position Storage
```javascript
let menuPosition = null; // Store the initial menu position to prevent jumping
```

### 2. Modified `positionMenu()` Function
- **First call**: Calculate and store the position
- **Subsequent calls**: Reuse the stored position (no recalculation)

```javascript
function positionMenu() {
  if (!menu) return;
  
  // If we already have a stored position and the menu is open, use it
  if (menuPosition && open) {
    menu.style.left = `${menuPosition.left}px`;
    menu.style.top = `${menuPosition.top}px`;
    return;
  }
  
  // ... calculate position ...
  
  // Store the position for future use
  menuPosition = { left, top };
}
```

### 3. Reset Position on Close
```javascript
function closeMenu() {
  // ... existing code ...
  menuPosition = null; // Reset for next open
}
```

### 4. Removed Unnecessary Repositioning Calls
- ❌ Removed from `openPicker()` - no longer repositions when picker opens
- ❌ Removed from `renderPickerItems()` - no longer repositions when results update
- ❌ Removed from `setRecentNames()` - no longer repositions when recent files load

## Result
✅ Dialog stays in the **same position** (bottom) when:
- Opening the picker panel
- Searching for files
- Loading recent files
- Updating search results

✅ Dialog **recalculates position** only when:
- First opened (to find best position)
- Reopened after being closed (fresh calculation)

## Testing
To verify the fix works:
1. Click the @ button → dialog appears at bottom
2. Click "Files & Folders" → dialog **stays at bottom** (no jump!)
3. Type in search → dialog **stays at bottom**
4. Close and reopen → dialog recalculates position (as expected)
