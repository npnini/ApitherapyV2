import React from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, className }) => {
  return (
    <div className={`${styles.tooltip} ${className || ''}`}>
      {children}
      <span className={styles.tooltiptext}>{text}</span>
    </div>
  );
};

export default Tooltip;
