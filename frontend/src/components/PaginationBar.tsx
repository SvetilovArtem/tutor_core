import Pagination from './Pagination';
import styles from './PaginationBar.module.css';

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  limitOptions?: number[];
  visible?: boolean;
}

export default function PaginationBar({
  currentPage,
  totalPages,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 15, 25, 50],
  visible = true,
}: PaginationBarProps) {
  if (!visible) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.limitSelector}>
        <label>Показывать по:</label>
        <select
          className={styles.limitSelect}
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
        >
          {limitOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}