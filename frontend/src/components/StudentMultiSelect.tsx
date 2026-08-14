import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { Student } from '../api/students';
import styles from './StudentMultiSelect.module.css';

interface Props {
  students: Student[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
}

export default function StudentMultiSelect({
  students,
  selectedIds,
  onChange,
  placeholder = 'Все ученики',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };

    // Используем click вместо mousedown - это проще и надёжнее
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleStudent = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedNames = students
    .filter((s) => selectedIds.includes(s.id))
    .map((s) => s.name);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={(e) => {
          e.stopPropagation(); // Останавливаем всплытие при открытии/закрытии
          setOpen(!open);
        }}
      >
        <Icon name="users" size={16} />
        <span className={styles.triggerText}>
          {selectedIds.length === 0
            ? placeholder
            : selectedIds.length <= 2
              ? selectedNames.join(', ')
              : `${selectedIds.length} учеников`}
        </span>
        {selectedIds.length > 0 && (
          <span
            className={styles.clearBtn}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            title="Очистить"
          >
            <Icon name="close" size={12} />
          </span>
        )}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </button>

      {open && (
        <div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          <div className={styles.searchBox}>
            <Icon name="search" size={14} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className={styles.list}>
            {filteredStudents.length === 0 ? (
              <div className={styles.empty}>Ничего не найдено</div>
            ) : (
              filteredStudents.map((s) => (
                <div
                  key={s.id}
                  className={`${styles.item} ${selectedIds.includes(s.id) ? styles.itemActive : ''}`}
                  onClick={() => toggleStudent(s.id)}
                >
                  <span className={styles.checkbox}>
                    {selectedIds.includes(s.id) && <Icon name="check" size={14} />}
                  </span>
                  <span className={styles.name}>{s.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}