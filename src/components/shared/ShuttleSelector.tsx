
import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import styles from './ShuttleSelector.module.css';
import { useTranslation } from 'react-i18next';

export interface ShuttleItem {
  id: string;
  name: string;
}

interface ShuttleSelectorProps {
  availableItems: ShuttleItem[];
  selectedItems: ShuttleItem[];
  onSelectionChange: (newSelection: ShuttleItem[]) => void;
  availableTitle?: string;
  selectedTitle?: string;
  placeholder?: string;
}

const ShuttleSelector: React.FC<ShuttleSelectorProps> = ({
  availableItems,
  selectedItems,
  onSelectionChange,
  availableTitle = 'Available',
  selectedTitle = 'Selected',
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAvailableItems = useMemo(() => {
    const selectedIds = new Set(selectedItems.map(item => item.id));
    return availableItems.filter(
      item =>
        !selectedIds.has(item.id) &&
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
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

  return (
    <div className={styles.shuttleSelector}>
      {/* Available Items Panel */}
      <div className={styles.box}>
        <div className={styles.header}>
          <span className={styles.title}>{availableTitle}</span>
          <div className={styles.searchContainer}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder={t('search_placeholder')}
              className={styles.searchInput}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="button" onClick={handleSelectAll} className={styles.headerButton}>
            {t('select_all')}
          </button>
        </div>
        <ul className={styles.list}>
          {filteredAvailableItems.map(item => (
            <li key={item.id} className={styles.listItem} onClick={() => handleSelect(item)}>
              {item.name}
              <ChevronRight size={18} className={styles.arrowIcon} />
            </li>
          ))}
        </ul>
      </div>

      {/* Selected Items Panel */}
      <div className={styles.box}>
        <div className={styles.header}>
          <span className={styles.title}>{selectedTitle}</span>
          <div className={styles.placeholder}></div>
          <button type="button" onClick={handleDeselectAll} className={styles.headerButton}>
            {t('deselect_all')}
          </button>
        </div>
        <ul className={styles.list}>
          {selectedItems.map(item => (
            <li key={item.id} className={styles.listItem} onClick={() => handleDeselect(item)}>
              <ChevronLeft size={18} className={styles.arrowIcon} />
              {item.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ShuttleSelector;
