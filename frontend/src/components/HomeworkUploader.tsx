import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import Icon from './Icon';
import type { HomeworkAttachment } from '../api/lessons';
import styles from './HomeworkUploader.module.css';

interface Props {
  lessonId: number;
  attachments: HomeworkAttachment[];
  onUpload: (lessonId: number, file: File) => Promise<any>;
  onDelete: (attachmentId: number) => Promise<void>;
  readonly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : '?';
}

export default function HomeworkUploader({
  lessonId, attachments, onUpload, onDelete, readonly,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(lessonId, file);
      toast.success('Файл загружен');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить вложение?')) return;
    try {
      await onDelete(id);
      toast.success('Вложение удалено');
    } catch {
      toast.error('Ошибка удаления');
    }
  };

  return (
    <div className={styles.wrapper}>
      {attachments.length > 0 && (
        <div className={styles.attachmentsGrid}>
          {attachments.map((att) => (
            <div key={att.id} className={styles.attachmentCard}>
              {att.is_image ? (
                <a href={att.url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                  <img src={att.url} alt={att.original_name} className={styles.imagePreview} />
                </a>
              ) : (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fileLink}
                  title={`${att.original_name} (${formatSize(att.size_bytes)})`}
                >
                  <span className={styles.fileExt}>{getFileExtension(att.original_name)}</span>
                </a>
              )}
              {!readonly && (
                <button className={styles.deleteBtn} onClick={() => handleDelete(att.id)} title="Удалить">
                  <Icon name="trash" size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readonly && (
        <label className={`${styles.uploadBtn} ${uploading ? styles.uploading : ''}`}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.pptx"
            onChange={handleFileSelect}
            disabled={uploading}
            className={styles.hiddenInput}
          />
          <Icon name="plus" size={14} />
          {uploading ? 'Загрузка...' : 'Прикрепить'}
        </label>
      )}
    </div>
  );
}