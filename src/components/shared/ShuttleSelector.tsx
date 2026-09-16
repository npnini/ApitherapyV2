
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import styles from './ShuttleSelector.module.css';
import { T, useT, useTranslationContext } from '../T';

export interface ShuttleItem {
  id: string;
  name: string;
  searchContent?: string;
}

interface ShuttleSelectorProps {
  availableItems: ShuttleItem[];
  selectedItems: ShuttleItem[];
  onSelectionChange: (newSelection: ShuttleItem[]) => void;
  availableTitle?: string;
  selectedTitle?: string;
  placeholder?: string;
  fillHeight?: boolean;
}

const ShuttleSelector: React.FC<ShuttleSelectorProps> = ({
  availableItems,
  selectedItems,
  onSelectionChange,
  availableTitle = 'Available',
  selectedTitle = 'Selected',
  fillHeight = false,
}) => {
  const { language, registerString, getTranslation } = useTranslationContext();
  const [searchTerm, setSearchTerm] = useState('');

  // Custom RTL detection logic as per Phase 2 rules
  const isRtl = language === 'he';

  const stringsToRegister = useMemo(() => [
    'Available',
    'Selected',
    'Search...',
    'Select All',
    'Deselect All'
  ], []);

  useEffect(() => {
    stringsToRegister.forEach(s => registerString(s));
  }, [registerString, stringsToRegister]);

  const filteredAvailableItems = useMemo(() => {
    const selectedIds = new Set(selectedItems.map(item => item.id));
    return availableItems.filter(
      item =>
        !selectedIds.has(item.id) &&
        (
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.searchContent && item.searchContent.toLowerCase().includes(searchTerm.toLowerCase()))
        )
    );
  }, [availableItems, selectedItems, searchTerm]);

  const handleSelect = (item: ShuttleItem) => {
    onSelectionChange([...selectedItems, item]);
  };

  const handleDeselect = (item: ShuttleItem) => {
    onSelectionChange(selectedItems.filter(selected => selected.id !== item.id));
  };

  const handleSelectAll = () => {
    onSelectionChange([...selectedItems, ...filteredAvailableItems]);
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const SelectArrow = isRtl ? ChevronLeft : ChevronRight;
  const DeselectArrow = isRtl ? ChevronRight : ChevronLeft;

  const shuttleClassName = fillHeight
    ? `${styles.shuttleSelector} ${styles.shuttleSelectorFill}`
    : styles.shuttleSelector;
  const boxClassName = fillHeight ? `${styles.box} ${styles.boxFill}` : styles.box;

  return (
    <div className={shuttleClassName}>
      {/* Available Items Panel */}
      <div className={boxClassName}>
        <div className={styles.header}>
          <span className={styles.title}><T>{availableTitle}</T></span>
          <div className={styles.searchContainer}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder={useT('Search...')}
              className={styles.searchInput}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="button" onClick={handleSelectAll} className={styles.headerButton}>
            <T>Select All</T>
          </button>
        </div>
        <ul className={styles.list}>
          {filteredAvailableItems.map(item => (
            <li key={item.id} className={styles.listItem} onClick={() => handleSelect(item)}>
              <T>{item.name}</T>
              <SelectArrow size={18} className={styles.arrowIcon} />
            </li>
          ))}
        </ul>
      </div>

      {/* Selected Items Panel */}
      <div className={boxClassName}>
        <div className={styles.header}>
          <span className={styles.title}><T>{selectedTitle}</T></span>
          <div className={styles.placeholder}></div>
          <button type="button" onClick={handleDeselectAll} className={styles.headerButton}>
            <T>Deselect All</T>
          </button>
        </div>
        <ul className={styles.list}>
          {selectedItems.map(item => (
            <li key={item.id} className={styles.listItem} onClick={() => handleDeselect(item)}>
              <DeselectArrow size={18} className={styles.arrowIcon} />
              <T>{item.name}</T>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ShuttleSelector;
