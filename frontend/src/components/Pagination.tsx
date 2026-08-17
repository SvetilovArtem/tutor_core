import React from 'react';
import styles from './Pagination.module.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {

  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className={styles.pagination}>
      {/* Стрелка ВЛЕВО (встроенный SVG, работает всегда) */}
      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        title="Предыдущая страница"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      {/* Первая страница и многоточие */}
      {startPage > 1 && (
        <>
          <button className={styles.pageBtn} onClick={() => onPageChange(1)}>1</button>
          {startPage > 2 && <span className={styles.ellipsis}>...</span>}
        </>
      )}

      {/* Номера страниц */}
      {pages.map((page) => (
        <button
          key={page}
          className={`${styles.pageBtn} ${currentPage === page ? styles.active : ''}`}
          onClick={() => onPageChange(page)}
        >
          {page}
        </button>
      ))}

      {/* Последняя страница и многоточие */}
      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className={styles.ellipsis}>...</span>}
          <button className={styles.pageBtn} onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </button>
        </>
      )}

      {/* Стрелка ВПРАВО (встроенный SVG, работает всегда) */}
      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        title="Следующая страница"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  );
}