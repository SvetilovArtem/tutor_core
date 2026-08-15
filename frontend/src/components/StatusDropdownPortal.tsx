import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StatusBadge from './StatusBadge';
import styles from '../pages/LessonsPage.module.css';

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'COMPLETED', label: 'Проведён' },
  { value: 'CANCELLED', label: 'Отменён' },
];

interface Props {
  anchorRef: HTMLButtonElement | null;
  currentStatus: string;
  onSelect: (newStatus: string) => void;
  onClose: () => void;
}

export default function StatusDropdownPortal({ anchorRef, currentStatus, onSelect, onClose }: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef) return;
    
    // Вычисляем позицию кнопки относительно viewport
    const rect = anchorRef.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4, // 4px отступ снизу
      left: rect.left,
    });

    // Закрываем при клике вне дропдауна
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorRef, onClose]);

  // Рендерим в document.body через портал
  return createPortal(
    <div
      ref={dropdownRef}
      className={styles.statusDropdownPortal}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 10000,
      }}
    >
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.statusOption} ${
            currentStatus === opt.value ? styles.statusOptionActive : ''
          }`}
          onClick={() => onSelect(opt.value)}
        >
          <StatusBadge status={opt.value} type="lesson" />
        </button>
      ))}
    </div>,
    document.body,
  );
}